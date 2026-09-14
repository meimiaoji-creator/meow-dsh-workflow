/**
 * meow-dsh-workflow 台账工具注册壳 —— meow_ledger_write / meow_ledger_read（dsh 接入层）。
 *
 * 本文件只做「定义 + 注册」（defineTool 值导入）；真实执行逻辑在 ledger-core.ts
 * （executeLedgerWrite / executeLedgerRead，零 dsh 依赖、独立可测）。
 *
 * 项目维度：台账按工作目录区分（ledger/<projectKey>/<book>.json）。project 参数缺省时
 * 从调用者会话 cwd 鸭子探测（storage.probeCwd），探测不到落 shared。
 *
 * 授权边界：工具全局注册（模型可见 schema），但**是否可调用由各 Agent 的
 * allowedTools 白名单决定**（compileAllowedTools → toolFilter.allow 硬裁剪）。
 * 两工具拆开以支持「只读」角色：如执行总裁只授 meow_ledger_read（看决策/状态），
 * 执笔交首席幕僚（read + write）。
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
import { probeCwd } from './storage.js';
import { LEDGER_WRITE_TOOL, LEDGER_READ_TOOL, executeLedgerWrite, executeLedgerRead, } from './ledger-core.js';
/** 工具描述的簿名文案（与 ledger-store 的 LEDGER_BOOKS 一致）。 */
const BOOK_DESC = 'decisions=决策 / actions=行动项 / need-boss=待老板拍板 / status=各线进度一页 / product=产品线 / market=市场增长线';
/** 解析项目键：**只用会话 cwd**（不给模型传参口子，杜绝同项目双键分裂）；探测不到落 shared。 */
function resolveCallerProject(_args, agent) {
    return probeCwd(agent) ?? 'shared';
}
/** 注册 meow_ledger_write + meow_ledger_read 两个工具。 */
export function registerLedgerTools(ctx) {
    ctx.tools.register(defineTool({
        name: LEDGER_WRITE_TOOL,
        description: '写一条台账记录（upsert）：**按当前项目（工作目录）自动区分**，不同项目互不混淆，'
            + '无需（也不支持）指定项目。'
            + 'id 缺省=新增，id 命中=更新合并（只覆盖本次显式给的字段）。'
            + '台账是公司跨会话记忆，只由被授权角色维护。'
            + '状态字段按簿惯例（actions 用 open/in_progress/done/blocked/cancelled；其余簿可不给）。'
            + '写前建议先 meow_ledger_read 对应簿避免重复/覆盖。',
        parameters: {
            book: { type: 'string', required: true, description: `台账簿：${BOOK_DESC}` },
            id: { type: 'string', description: '可选：更新已有记录的 id（缺省=新增）' },
            status: { type: 'string', description: '可选：生命周期状态（actions 等簿用）' },
            title: { type: 'string', description: '标题（简短，便于列表/检索）' },
            content: { type: 'string', description: '正文（可 markdown 长文本；新增时必须非空）' },
            author: { type: 'string', description: '可选：归属/作者（缺省不记）' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    project: { type: 'string', required: true, description: '落盘项目键' },
                    book: { type: 'string', required: true, description: '写入的簿' },
                    id: { type: 'string', required: true, description: '记录 id（更新凭据）' },
                    created: { type: 'boolean', required: true, description: 'true=新增 false=更新' },
                    ts: { type: 'string', required: true, description: '写入时间' },
                },
            },
            render: (args, value) => [{
                    type: 'text',
                    text: `meow_ledger_write(${value.project}/${value.book}): ${value.created ? '新增' : '更新'}记录 id=${value.id}`,
                }],
        },
        isConcurrencySafe: () => true,
        async execute(args, exec) {
            return executeLedgerWrite(undefined, {
                book: String(args.book ?? ''),
                ...(args.id !== undefined ? { id: String(args.id) } : {}),
                ...(args.status !== undefined ? { status: String(args.status) } : {}),
                ...(args.title !== undefined ? { title: String(args.title) } : {}),
                ...(args.content !== undefined ? { content: String(args.content) } : {}),
                ...(args.author !== undefined ? { author: String(args.author) } : {}),
                project: resolveCallerProject(args, exec?.agent),
            });
        },
    }));
    ctx.tools.register(defineTool({
        name: LEDGER_READ_TOOL,
        description: '读台账记录（当前项目，可过滤）。台账是公司跨会话记忆；**按当前项目（工作目录）自动区分**，'
            + '无需（也不支持）指定项目。列出后可拿 id 精读/续写。只读该簿内容，不据此越权行事。',
        parameters: {
            book: { type: 'string', required: true, description: `台账簿：${BOOK_DESC}` },
            id: { type: 'string', description: '可选：按记录 id 过滤' },
            status: { type: 'string', description: '可选：按状态过滤（如 done）' },
            q: { type: 'string', description: '可选：关键词，命中标题或正文' },
            limit: { type: 'number', description: '可选：返回条数上限（缺省 50，最新在前）' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    project: { type: 'string', required: true, description: '读取的项目键' },
                    book: { type: 'string', required: true, description: '读取的簿' },
                    count: { type: 'number', required: true, description: '返回条数' },
                    text: { type: 'string', required: true, description: '记录明细文本（#序号 id [状态] 标题 by作者 + 正文）' },
                },
            },
            render: (args, value) => [{ type: 'text', text: value.text }],
        },
        isConcurrencySafe: () => true,
        async execute(args, exec) {
            const out = await executeLedgerRead(undefined, {
                book: String(args.book ?? ''),
                ...(args.id !== undefined ? { id: String(args.id) } : {}),
                ...(args.status !== undefined ? { status: String(args.status) } : {}),
                ...(args.q !== undefined ? { q: String(args.q) } : {}),
                ...(args.limit !== undefined ? { limit: Number(args.limit) } : {}),
                project: resolveCallerProject(args, exec?.agent),
            });
            return { project: out.project, book: out.book, count: out.count, text: renderReadOutput(out) };
        },
    }));
}
/** 把读结果渲染成文本（供模型直接消费；title/content 已在 core escape）。 */
function renderReadOutput(value) {
    if (value.count === 0)
        return `meow_ledger_read(${value.project}/${value.book}): 无记录`;
    const lines = value.items.map((r, i) => {
        const tag = r.status !== undefined ? `[${r.status}] ` : '';
        const meta = r.author !== undefined ? ` (by ${r.author})` : '';
        return `#${i + 1} ${r.id} ${tag}${r.title}${meta}\n${r.content}`;
    });
    return `meow_ledger_read(${value.project}/${value.book}): ${value.count} 条\n${lines.join('\n\n')}`;
}
