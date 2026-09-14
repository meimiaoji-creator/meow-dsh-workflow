/**
 * meow_memory_write / meow_memory_read 工具核心逻辑 —— 角色记忆（零 dsh 依赖）。
 *
 * 模型：**项目目录 × 角色** 绑定一份记忆（追加式日志）。agent 阶段性完成/关键决策/卡点时
 * 记一条；记录可携带 agentRunId —— 跨上下文压缩后仍能凭记忆找回"这事是谁（哪个实例）做的"，
 * 用 meow_agent_call 传回 runId 续聊原实现者。
 *
 * 存储：$DSH_HOME/meow-dsh-workflow/memory/<projectKey>/<roleKey>.json（数组，最新在后）。
 * projectKey 由注册壳从调用者会话 cwd 解析（或显式传参），sanitizeKey 做文件名安全化。
 */
import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { resolveDataRoot, sanitizeKey } from './storage.js';
// sanitizeKey 共享实现迁至 storage.ts；此处 re-export 保持既有 barrel/测试导入不变。
export { sanitizeKey };
/** meow_memory_write 工具名。 */
export const MEMORY_WRITE_TOOL = 'meow_memory_write';
/** meow_memory_read 工具名。 */
export const MEMORY_READ_TOOL = 'meow_memory_read';
function memoryFile(root, projectKey, roleKey) {
    return join(resolveDataRoot(root), 'memory', sanitizeKey(projectKey), `${sanitizeKey(roleKey)}.json`);
}
// 进程内串行锁（按文件路径）：与 ledger-store 同款。
const fileLocks = new Map();
function withFileLock(file, task) {
    const prev = fileLocks.get(file) ?? Promise.resolve();
    const run = prev.catch(() => { }).then(task);
    fileLocks.set(file, run);
    const clear = () => {
        if (fileLocks.get(file) === run)
            fileLocks.delete(file);
    };
    run.then(clear, clear);
    return run;
}
async function readEntries(file) {
    let text;
    try {
        text = await fs.readFile(file, 'utf8');
    }
    catch {
        return [];
    }
    try {
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed))
            return [];
        return parsed.filter((e) => typeof e === 'object' && e !== null
            && typeof e.ts === 'string'
            && typeof e.title === 'string'
            && typeof e.content === 'string');
    }
    catch {
        return [];
    }
}
/** 追加一条记忆（append-only 日志）。title/content 至少一项非空。 */
export async function appendMemory(root, projectKey, roleKey, input) {
    const file = memoryFile(root, projectKey, roleKey);
    return withFileLock(file, async () => {
        await fs.mkdir(dirname(file), { recursive: true });
        const entries = await readEntries(file);
        const entry = {
            ts: new Date().toISOString(),
            title: input.title,
            content: input.content,
        };
        if (input.kind !== undefined && input.kind.trim() !== '')
            entry.kind = input.kind.trim();
        if (input.agentRunId !== undefined && input.agentRunId.trim() !== '')
            entry.agentRunId = input.agentRunId.trim();
        entries.push(entry);
        await fs.writeFile(file, JSON.stringify(entries, null, 2), 'utf8');
        return entry;
    });
}
/** 读记忆：scope=self 只看 roleKey；scope=project 跨该项目全部角色（找"这事谁做的"）。最新在前。 */
export async function readMemory(root, projectKey, options = {}) {
    const base = join(resolveDataRoot(root), 'memory', sanitizeKey(projectKey));
    const scope = options.scope === 'project' ? 'project' : 'self';
    const files = [];
    if (scope === 'self') {
        files.push(join(base, `${sanitizeKey(options.roleKey ?? 'shared')}.json`));
    }
    else {
        let names = [];
        try {
            names = (await fs.readdir(base)).filter(n => n.endsWith('.json'));
        }
        catch { /* 无记忆目录 */ }
        for (const n of names)
            files.push(join(base, n));
    }
    const q = options.q !== undefined && options.q.trim() !== '' ? options.q.trim().toLowerCase() : undefined;
    const limit = options.limit !== undefined && Number.isFinite(options.limit)
        ? Math.max(1, Math.floor(options.limit))
        : 20;
    const entries = [];
    for (const file of files) {
        const roleFromFile = file.slice(file.lastIndexOf('\\') + 1).replace(/\.json$/, '');
        for (const e of await readEntries(file)) {
            if (q !== undefined && !`${e.title}\n${e.content}`.toLowerCase().includes(q))
                continue;
            entries.push(scope === 'project' ? { ...e, role: roleFromFile } : e);
        }
    }
    entries.reverse();
    return {
        roleKey: scope === 'self' ? sanitizeKey(options.roleKey ?? 'shared') : '*',
        entries: entries.slice(0, limit),
    };
}
/**
 * 列出全部项目的角色记忆总览（零 dsh 依赖；web 路由 GET /api/meow-workflow/memory 用）。
 * 目录缺失 → 空 projects；空角色文件跳过；项目按最近写入倒序。
 */
export async function listMemoryOverview(root) {
    const base = join(resolveDataRoot(root), 'memory');
    let projectDirs = [];
    try {
        const dirents = await fs.readdir(base, { withFileTypes: true });
        projectDirs = dirents.filter(d => d.isDirectory()).map(d => d.name);
    }
    catch {
        return { projects: [] };
    }
    const projects = [];
    for (const dir of projectDirs) {
        let files = [];
        try {
            files = (await fs.readdir(join(base, dir))).filter(n => n.endsWith('.json'));
        }
        catch {
            continue;
        }
        const roles = [];
        for (const f of files) {
            const entries = (await readEntries(join(base, dir, f))).slice().reverse();
            if (entries.length === 0)
                continue;
            roles.push({ role: f.replace(/\.json$/, ''), count: entries.length, entries });
        }
        if (roles.length === 0)
            continue;
        const all = roles.flatMap(r => r.entries);
        const lastTs = all.map(e => e.ts).sort().at(-1);
        projects.push({
            project: dir,
            total: all.length,
            ...(lastTs !== undefined ? { lastTs } : {}),
            roles,
        });
    }
    projects.sort((a, b) => (b.lastTs ?? '').localeCompare(a.lastTs ?? ''));
    return { projects };
}
