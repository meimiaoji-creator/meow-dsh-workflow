/**
 * meow-dsh-workflow 台账工具核心逻辑 —— meow_ledger_write / meow_ledger_read
 * （零 dsh 依赖，独立可测）。
 *
 * 授权模型（工具级）：工具全局注册，是否可调用由各 Agent 的 allowedTools 白名单决定
 * （compileAllowedTools → toolFilter.allow 硬裁剪）。meow_ledger_read 与
 * meow_ledger_write 拆开，支持「只读」角色（如执行总裁只授 read，由首席幕僚执笔）。
 *
 * 项目维度：台账按工作目录区分（ledger/<projectKey>/<book>.json）；project 由注册壳
 * 从调用者会话 cwd 解析（或显式传参）后传入，缺省落 shared。
 *
 * 本模块只依赖 ledger-store + storage + protocols（escapePromptBraces，红线 8），
 * 运行时经注册壳 ledger.ts 注入 root（缺省 $DSH_HOME）。
 */
import { LEDGER_BOOKS, LEDGER_SHARED_PROJECT, upsertLedger, queryLedger, } from './ledger-store.js';
import { sanitizeKey } from './storage.js';
import { escapePromptBraces } from './protocols.js';
/** meow_ledger_write 工具名（Agent 定义 allowedTools 授权项）。 */
export const LEDGER_WRITE_TOOL = 'meow_ledger_write';
/** meow_ledger_read 工具名（Agent 定义 allowedTools 授权项）。 */
export const LEDGER_READ_TOOL = 'meow_ledger_read';
function requireBook(bookRaw) {
    const book = typeof bookRaw === 'string' ? bookRaw.trim() : '';
    if (!LEDGER_BOOKS.includes(book)) {
        throw new Error(`[meow_ledger] 未知台账簿「${escapePromptBraces(book)}」（可用: ${LEDGER_BOOKS.join('/')}）`);
    }
    return book;
}
function resolveProject(raw) {
    if (typeof raw === 'string' && raw.trim() !== '')
        return raw.trim();
    return LEDGER_SHARED_PROJECT;
}
/** 校验并执行 meow_ledger_write。 */
export async function executeLedgerWrite(root, input) {
    const book = requireBook(input.book);
    const projectKey = resolveProject(input.project);
    const id = input.id !== undefined ? String(input.id).trim() : undefined;
    const status = input.status !== undefined ? String(input.status).trim() : undefined;
    const title = input.title !== undefined ? String(input.title) : undefined;
    const content = input.content !== undefined ? String(input.content) : undefined;
    const author = input.author !== undefined ? String(input.author).trim() : undefined;
    if (id === undefined && !title && !content) {
        throw new Error('[meow_ledger_write] 新增记录需提供 title 或 content；更新已有记录请传 id');
    }
    const { record, created } = await upsertLedger(root, projectKey, book, {
        ...(id !== undefined ? { id } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(title !== undefined ? { title } : {}),
        ...(content !== undefined ? { content } : {}),
        ...(author !== undefined ? { author } : {}),
    });
    return { project: sanitizeKey(projectKey), book, id: record.id, created, ts: record.ts };
}
/** 校验并执行 meow_ledger_read（返回条目已 escape 标题/正文）。 */
export async function executeLedgerRead(root, input) {
    const book = requireBook(input.book);
    const projectKey = resolveProject(input.project);
    const records = await queryLedger(root, projectKey, book, {
        ...(input.id !== undefined ? { id: String(input.id).trim() } : {}),
        ...(input.status !== undefined && String(input.status).trim() !== ''
            ? { status: String(input.status).trim() }
            : {}),
        ...(input.q !== undefined && String(input.q).trim() !== ''
            ? { q: String(input.q).trim() }
            : {}),
        ...(input.limit !== undefined && Number.isFinite(Number(input.limit))
            ? { limit: Number(input.limit) }
            : {}),
    });
    const items = records.map((r) => ({
        id: r.id,
        ts: r.ts,
        ...(r.status !== undefined ? { status: r.status } : {}),
        title: escapePromptBraces(r.title),
        content: escapePromptBraces(r.content),
        ...(r.author !== undefined ? { author: r.author } : {}),
    }));
    return { project: sanitizeKey(projectKey), book, count: items.length, items };
}
