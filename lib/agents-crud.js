/**
 * meow-dsh-workflow Agent CRUD 核心模块（T-01）—— 零 dsh 依赖纯函数层。
 *
 * 设计文档：docs/agent-chain-ui-v2.md §6（Web API 扩展）。
 *
 * 职责：
 *   1. 列出全部 Agent 定义（含 launchable=false，含所有内部字段规范化 + escape 防御）；
 *   2. 新建/更新/删除 Agent 定义（参数校验 + 冲突检测 + 完整记录写回 agents.json）；
 *   3. 授权勾选枚举（工具注册表按"系统工具名 / skill 入口名 / MCP 服务器名"分组）。
 *
 * 错误码语义：
 *   - 400  SchemaValidationError（schema 校验失败）
 *   - 404  角色不存在（更新/删除）
 *   - 409  新建时 id 已存在
 *
 * 边界：
 *   - 红线 8：所有出参字段（name/systemPrompt/summary/children.description）经
 *     escapePromptBraces/oneLine 防御；错误 message 同样 escape 防 ASCII 双花括号外溢；
 *   - 存储复用 storage.loadAgentDefs / saveAgentDefs（原子写）；
 *   - 零 dsh 源码依赖（仅依赖 storage + schema + protocols，结构稳定）。
 *
 * 可测性：所有函数纯函数化（root 参数显式传入，无 process.env 隐式依赖），
 * 测试可用 os.tmpdir 隔离 + host-mock 注入 ctx.tools.schemas。
 */
import { agentDefSchema, SchemaValidationError } from './schema.js';
import { loadAgentDefs, saveAgentDefs } from './storage.js';
import { escapePromptBraces, oneLine } from './protocols.js';
/** CRUD 错误（含错误码 + 经 escape 的消息）。 */
export class CrudError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'CrudError';
        this.code = code;
    }
}
// ---------------------------------------------------------------------------
// 内部辅助（escape 防御 + 字段投影）
// ---------------------------------------------------------------------------
/**
 * 把 AgentDef 投影为对外展示形态（出参全部经 escape；保留 compileOptions。
 * children.description 经 oneLine 折叠空白 + 防双花括号）。
 * @param def 规范化 Agent 定义。
 */
export function presentAgent(def) {
    const item = {
        id: escapePromptBraces(def.id),
        name: escapePromptBraces(def.name),
        systemPrompt: escapePromptBraces(def.systemPrompt),
        allowedSkills: def.allowedSkills.map(s => escapePromptBraces(s)),
        allowedMcps: def.allowedMcps.map(s => escapePromptBraces(s)),
        allowedTools: def.allowedTools.map(s => escapePromptBraces(s)),
        children: def.children.map(c => ({
            name: escapePromptBraces(c.name),
            description: oneLine(c.description),
        })),
        launchable: def.launchable,
    };
    if (def.summary !== undefined)
        item.summary = escapePromptBraces(def.summary);
    if (def.model !== undefined)
        item.model = escapePromptBraces(def.model);
    if (def.provider !== undefined)
        item.provider = escapePromptBraces(def.provider);
    if (def.compileOptions !== undefined) {
        item.compileOptions = def.compileOptions.strict !== undefined
            ? { strict: def.compileOptions.strict }
            : {};
    }
    return item;
}
// ---------------------------------------------------------------------------
// 列表
// ---------------------------------------------------------------------------
/**
 * 列出全部 Agent 定义（含 launchable=false），出参字段全部 escape。
 * 顺序 = defs 对象枚举顺序（V8 字符串键保序：数字键在前按升序，字符串键在后按插入顺序）。
 * @param defs Agent 定义库（Record<id, AgentDef>）。
 * @returns AgentListItem 数组（已 escape）。
 */
export function listAllAgents(defs) {
    const out = [];
    for (const def of Object.values(defs)) {
        out.push(presentAgent(def));
    }
    return out;
}
// ---------------------------------------------------------------------------
// 新建
// ---------------------------------------------------------------------------
/**
 * 创建新角色（POST /agents）。
 * 流程：校验 body → 检查 defs 中 id 不存在 → 合并 → 原子写盘 → 返回新 AgentDef。
 * @param defs 当前 Agent 定义库（调用方注入，保证与 GET /roles 视图一致）。
 * @param body 请求体（AgentDefInput 形态，含 id）。
 * @param root 数据根（写盘目标；测试用 os.tmpdir 隔离）。
 * @returns 新创建的规范化 Agent 定义。
 * @throws CrudError(400) SchemaValidationError；CrudError(409) id 已存在。
 */
export async function createAgent(defs, body, root) {
    // 1. schema 校验（坏数据抛 SchemaValidationError → 400）
    let input;
    try {
        input = agentDefSchema(body);
    }
    catch (err) {
        if (err instanceof SchemaValidationError) {
            throw new CrudError(400, oneLine(err.message));
        }
        throw err;
    }
    // 2. id 冲突检测（409）—— 基于调用方传入的 defs，与 GET 路由视图一致
    if (Object.prototype.hasOwnProperty.call(defs, input.id)) {
        throw new CrudError(409, `角色 id 已存在: ${oneLine(input.id)}`);
    }
    // 3. 合并 + 原子写盘
    const merged = { ...defs, [input.id]: input };
    const normalized = await saveAgentDefs(merged, root);
    const created = normalized[input.id];
    if (created === undefined) {
        throw new CrudError(400, '保存后未找到新建角色（schema 兜底失败）');
    }
    return created;
}
// ---------------------------------------------------------------------------
// 更新
// ---------------------------------------------------------------------------
/**
 * 更新角色（PUT /agents/:id）。
 * 流程：校验 body → 校验 body.id 与 url id 一致 → 检查 defs 中 id 存在 → 替换 → 原子写盘。
 * @param defs 当前 Agent 定义库（调用方注入）。
 * @param id   URL 参数：目标角色 id。
 * @param body 请求体（AgentDefInput）。
 * @param root 数据根（写盘目标）。
 * @returns 更新后的规范化 Agent 定义。
 * @throws CrudError(400) schema 失败或 body.id 与 url.id 不一致；CrudError(404) id 不存在。
 */
export async function updateAgent(defs, id, body, root) {
    const trimmedId = id.trim();
    if (trimmedId === '') {
        throw new CrudError(400, 'id 不能为空');
    }
    // 1. schema 校验
    let input;
    try {
        input = agentDefSchema(body);
    }
    catch (err) {
        if (err instanceof SchemaValidationError) {
            throw new CrudError(400, oneLine(err.message));
        }
        throw err;
    }
    // 2. id 一致性校验（URL 与 body）
    if (input.id !== trimmedId) {
        throw new CrudError(400, `body.id (${oneLine(input.id)}) 与 url id (${oneLine(trimmedId)}) 不一致`);
    }
    // 3. 存在性校验（基于调用方 defs）
    if (!Object.prototype.hasOwnProperty.call(defs, trimmedId)) {
        throw new CrudError(404, `角色不存在: ${oneLine(trimmedId)}`);
    }
    // 4. 替换 + 原子写盘
    const merged = { ...defs, [trimmedId]: input };
    const normalized = await saveAgentDefs(merged, root);
    const updated = normalized[trimmedId];
    if (updated === undefined) {
        throw new CrudError(400, '保存后未找到更新角色（schema 兜底失败）');
    }
    return updated;
}
// ---------------------------------------------------------------------------
// 删除
// ---------------------------------------------------------------------------
/**
 * 删除角色（DELETE /agents/:id）。
 * 流程：检查 defs 中 id 存在 → 从 defs 剥离 → 原子写盘。
 * @param defs 当前 Agent 定义库（调用方注入）。
 * @param id   URL 参数：目标角色 id。
 * @param root 数据根（写盘目标）。
 * @returns 被删除的角色 id（用于日志/响应）。
 * @throws CrudError(404) id 不存在。
 */
export async function deleteAgent(defs, id, root) {
    const trimmedId = id.trim();
    if (trimmedId === '') {
        throw new CrudError(404, `角色不存在: ${oneLine(id)}`);
    }
    if (!Object.prototype.hasOwnProperty.call(defs, trimmedId)) {
        throw new CrudError(404, `角色不存在: ${oneLine(trimmedId)}`);
    }
    const next = {};
    for (const [key, value] of Object.entries(defs)) {
        if (key !== trimmedId)
            next[key] = value;
    }
    await saveAgentDefs(next, root);
    return trimmedId;
}
// ---------------------------------------------------------------------------
// 工具注册表分组（GET /tools）
// ---------------------------------------------------------------------------
/**
 * 把 ctx.tools.schemas() 快照按"系统工具名 / skill 入口名 / MCP 服务器名"分组。
 * 分组规则：
 *   - tools：非 mcp__ 前缀 + 非 skill 入口（其余全部视为系统工具名）
 *   - skills：名为 `skill` 或 `skills`（dsh skill 加载入口家族，保守兼容单复数）
 *   - mcps：以 mcp__ 开头的工具名 → 抽取 <server> 部分去重（同名多 tool 仅 server 出现一次）
 *   - mcpTools（R11）：server → 该 server 下工具全名（`mcp__<server>__<tool>` 原样收集），
 *     供管理页 MCP 列做工具级授权勾选
 * 注：实际 dsh 中"skill"作为入口工具已并入 allowedTools 路径（compileAllowedTools 用 SKILL_TOOL='skill'）；
 * 此处分入 skills 组是为管理页三列展示，更贴近 UI 设计。
 * @param schemas 工具 schema 列表（每项含 .name）。
 * @returns ToolRegistryGroups（全部经 escape + 去重保序；models 组由 web route 并入）。
 */
export function groupToolNames(schemas) {
    const tools = [];
    const skills = [];
    const mcpServers = new Set();
    const mcpToolMap = new Map();
    for (const s of schemas) {
        const name = typeof s.name === 'string' ? s.name : '';
        if (name === '')
            continue;
        if (name.startsWith('mcp__')) {
            // mcp__<server>__<tool> → 抽取 server；工具全名归入 mcpTools[server]（R11 工具级授权）
            const rest = name.slice('mcp__'.length);
            const sep = rest.indexOf('__');
            const server = sep === -1 ? rest : rest.slice(0, sep);
            if (server === '')
                continue;
            mcpServers.add(server);
            let list = mcpToolMap.get(server);
            if (list === undefined) {
                list = [];
                mcpToolMap.set(server, list);
            }
            list.push(name);
            continue;
        }
        if (name === 'skill' || name === 'skills') {
            skills.push(name);
            continue;
        }
        tools.push(name);
    }
    // mcpServers 转为数组（保持插入顺序），再 escape；mcpTools 同步 escape（server 键 + 工具全名值）
    const mcps = [];
    const mcpTools = {};
    for (const server of mcpServers) {
        mcps.push(escapePromptBraces(server));
        mcpTools[escapePromptBraces(server)] = (mcpToolMap.get(server) ?? []).map(t => escapePromptBraces(t));
    }
    return {
        tools: tools.map(t => escapePromptBraces(t)),
        skills: skills.map(s => escapePromptBraces(s)),
        mcps,
        mcpTools,
    };
}
// ---------------------------------------------------------------------------
// 加载便捷封装（handler 用：loadDefs 注入后用 root 加载；保持对外 API 一致）
// ---------------------------------------------------------------------------
/**
 * 从指定数据根加载 Agent 定义库（handler 包装层；显式传 root 让测试用 tmpdir 隔离）。
 * @param root 数据根（缺省按 $DSH_HOME 解析；测试传 os.tmpdir 临时目录）。
 */
export async function loadAllAgents(root) {
    return loadAgentDefs(root);
}
