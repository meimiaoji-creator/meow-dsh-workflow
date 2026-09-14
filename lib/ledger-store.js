/**
 * meow-dsh-workflow 台账存储层 —— 项目 × 台账簿的 JSON 读写（零 dsh 依赖，独立可测）。
 *
 * 布局：$DSH_HOME/meow-dsh-workflow/ledger/<projectKey>/<book>.json —— **按工作目录（项目）
 * 区分**，不同项目互不混淆；projectKey 由注册壳从调用者会话 cwd 解析（或显式传参），
 * 共享兜底键 'shared'。
 *
 * 老数据迁移（懒触发）：早期全局布局 `ledger/<book>.json` 在任一项目首次读写该簿时
 * 自动合并迁入 `shared/<book>.json`（按 id 去重、保序），不丢数据。
 *
 * 授权模型（工具级）：是否可读写由各 Agent 的 allowedTools 是否含
 * meow_ledger_write / meow_ledger_read 决定（toolFilter.allow 硬裁剪），
 * 本层只负责存取，不判断调用者权限。
 */
import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { resolveDataRoot, sanitizeKey } from './storage.js';
/** 台账簿白名单（工具 book 参数枚举；新增簿在此登记）。 */
export const LEDGER_BOOKS = [
    'decisions', // 决策：结论 + 理由 + 适用线（治理层）
    'actions', // 行动项：责任人 / 期限 / 状态（生命周期）
    'need-boss', // 待老板（用户）拍板清单
    'status', // 各线进度一页（首席幕僚周期汇总）
    'product', // 产品线产物（PRD / 路线图 / 验收）
    'market', // 市场增长线产物（调研 / 定位 / 文案草稿）
    // 财务（ops/账目/合同）本阶段由老板本人负责，不建台账簿 —— 需要时再加
];
/** 共享兜底项目键（无法解析工作目录/显式跨项目时的落点）。 */
export const LEDGER_SHARED_PROJECT = 'shared';
/** 老全局簿 → 项目键（目录名）。 */
export function ledgerDir(root, projectKey) {
    return join(resolveDataRoot(root), 'ledger', sanitizeKey(projectKey));
}
function ledgerFile(root, projectKey, book) {
    return join(ledgerDir(root, projectKey), `${book}.json`);
}
/** 早期全局布局的簿文件路径（迁移源）。 */
function legacyLedgerFile(root, book) {
    return join(resolveDataRoot(root), 'ledger', `${book}.json`);
}
// 进程内串行锁（按文件路径）：同一簿的并发写排队，避免 read-modify-write 交错。
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
function newId() {
    return `L-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
/** 容错归一化单条记录（字段类型不符 → null，读取时丢弃）。 */
function toRecord(value) {
    if (typeof value !== 'object' || value === null)
        return null;
    const o = value;
    if (typeof o.id !== 'string' || o.id === '' || typeof o.ts !== 'string')
        return null;
    return {
        id: o.id,
        ts: o.ts,
        ...(typeof o.status === 'string' ? { status: o.status } : {}),
        title: typeof o.title === 'string' ? o.title : '',
        content: typeof o.content === 'string' ? o.content : '',
        ...(typeof o.author === 'string' ? { author: o.author } : {}),
    };
}
/** 读簿文件（缺失/损坏 → 空数组，不阻断其它簿）。 */
async function readBookFile(file) {
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
        return parsed.map(toRecord).filter((r) => r !== null);
    }
    catch {
        return [];
    }
}
/**
 * 懒迁移：早期全局簿 `ledger/<book>.json` 存在 → 合并迁入 `shared/<book>.json`
 * （按 id 去重、老在前）并删除全局文件。任何项目首次读写该簿时触发一次。
 */
async function migrateLegacyBook(root, book) {
    const legacy = legacyLedgerFile(root, book);
    let legacyRecords;
    try {
        legacyRecords = await readBookFile(legacy);
    }
    catch {
        return;
    }
    if (legacyRecords.length === 0) {
        // 空全局文件（或不存在）→ 直接尝试删除占位，忽略失败
        try {
            await fs.rm(legacy, { force: true });
        }
        catch { /* ignore */ }
        return;
    }
    const sharedFile = ledgerFile(root, LEDGER_SHARED_PROJECT, book);
    await withFileLock(sharedFile, async () => {
        await fs.mkdir(dirname(sharedFile), { recursive: true });
        const existing = await readBookFile(sharedFile);
        const seen = new Set(existing.map(r => r.id));
        const merged = [...existing, ...legacyRecords.filter(r => !seen.has(r.id))];
        await fs.writeFile(sharedFile, JSON.stringify(merged, null, 2), 'utf8');
        try {
            await fs.rm(legacy, { force: true });
        }
        catch { /* ignore */ }
    });
}
/** 校验簿名（未知簿抛错，供工具层给模型明确反馈）。 */
export function assertLedgerBook(book) {
    if (!LEDGER_BOOKS.includes(book)) {
        throw new Error(`未知台账簿「${book}」（可用: ${LEDGER_BOOKS.join('/')}）`);
    }
}
/** 读某项目某簿全部记录（已校验簿名；首次访问触发老全局簿懒迁移）。 */
export async function loadLedger(root, projectKey, book) {
    assertLedgerBook(book);
    await migrateLegacyBook(root, book);
    return readBookFile(ledgerFile(root, projectKey, book));
}
/**
 * 写入（upsert）：id 缺省新增、id 命中更新合并（只覆盖显式字段，status/author 缺省保留旧值）。
 * @returns { record, created } created=true 表示新增。
 */
export async function upsertLedger(root, projectKey, book, input) {
    assertLedgerBook(book);
    await migrateLegacyBook(root, book);
    const file = ledgerFile(root, projectKey, book);
    return withFileLock(file, async () => {
        await fs.mkdir(dirname(file), { recursive: true });
        const records = await readBookFile(file);
        const idx = input.id !== undefined ? records.findIndex(r => r.id === input.id) : -1;
        const prev = idx >= 0 ? records[idx] : undefined;
        const now = new Date().toISOString();
        const record = {
            id: prev ? prev.id : (input.id ?? newId()),
            ts: now,
            title: input.title !== undefined ? input.title : (prev ? prev.title : ''),
            content: input.content !== undefined ? input.content : (prev ? prev.content : ''),
        };
        if (input.status !== undefined || prev?.status !== undefined) {
            record.status = input.status !== undefined ? input.status : prev?.status;
        }
        if (input.author !== undefined || prev?.author !== undefined) {
            record.author = input.author !== undefined ? input.author : prev?.author;
        }
        if (idx >= 0)
            records[idx] = record;
        else
            records.push(record);
        await fs.writeFile(file, JSON.stringify(records, null, 2), 'utf8');
        return { record, created: idx < 0 };
    });
}
/** 查询：按 id/status/关键词过滤，最新在前，limit 截断。 */
export async function queryLedger(root, projectKey, book, query = {}) {
    const records = await loadLedger(root, projectKey, book);
    let out = records;
    if (query.id !== undefined)
        out = out.filter(r => r.id === query.id);
    if (query.status !== undefined && query.status !== '')
        out = out.filter(r => r.status === query.status);
    if (query.q !== undefined && query.q.trim() !== '') {
        const q = query.q.trim().toLowerCase();
        out = out.filter(r => `${r.title}\n${r.content}`.toLowerCase().includes(q));
    }
    const limit = query.limit !== undefined && Number.isFinite(query.limit)
        ? Math.max(1, Math.floor(query.limit))
        : 50;
    // 存储按追加序（时间序），返回最新在前
    return out.slice().reverse().slice(0, limit);
}
/** 簿排序键：白名单序优先，未知簿排后。 */
function bookOrder(book) {
    const idx = LEDGER_BOOKS.indexOf(book);
    return idx === -1 ? LEDGER_BOOKS.length + 99 : idx;
}
/**
 * 列出全部项目的台账总览（零 dsh 依赖；web 路由 GET /api/meow-workflow/ledger 用）。
 * 目录缺失 → 空 projects；空簿跳过；项目按最近写入倒序；簿按白名单序。
 */
export async function listLedgerOverview(root) {
    const base = join(resolveDataRoot(root), 'ledger');
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
        const books = [];
        for (const f of files) {
            const records = (await readBookFile(join(base, dir, f))).slice().reverse();
            if (records.length === 0)
                continue;
            books.push({ book: f.replace(/\.json$/, ''), count: records.length, records });
        }
        if (books.length === 0)
            continue;
        books.sort((a, b) => bookOrder(a.book) - bookOrder(b.book));
        const all = books.flatMap(b => b.records);
        const lastTs = all.map(r => r.ts).sort().at(-1);
        projects.push({
            project: dir,
            total: all.length,
            ...(lastTs !== undefined ? { lastTs } : {}),
            books,
        });
    }
    projects.sort((a, b) => (b.lastTs ?? '').localeCompare(a.lastTs ?? ''));
    return { projects };
}
