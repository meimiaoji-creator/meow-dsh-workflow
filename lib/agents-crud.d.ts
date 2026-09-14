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
import { type AgentDef } from './schema.js';
/** CRUD 错误码（HTTP 状态码语义）。 */
export type CrudErrorCode = 400 | 404 | 409;
/** CRUD 错误（含错误码 + 经 escape 的消息）。 */
export declare class CrudError extends Error {
    readonly code: CrudErrorCode;
    constructor(code: CrudErrorCode, message: string);
}
/** Agent 列表出参项：所有字段就位，全部经 escape 防御（红线 8）。 */
export interface AgentListItem {
    id: string;
    name: string;
    systemPrompt: string;
    summary?: string;
    allowedSkills: string[];
    allowedMcps: string[];
    allowedTools: string[];
    model?: string;
    provider?: string;
    children: {
        name: string;
        description: string;
    }[];
    launchable: boolean;
    compileOptions?: {
        strict?: boolean;
    };
}
/** 工具注册表分组（授权勾选三列；出参全部经 escape）。 */
export interface ToolRegistryGroups {
    tools: string[];
    skills: string[];
    mcps: string[];
    /**
     * R11 MCP 工具级授权：server → 该 server 下工具全名列表（`mcp__<server>__<tool>`，
     * escape + 去重保序）。管理页 MCP 列据此在 server 下渲染逐工具勾选行（勾选写入
     * allowedTools 精确名，compileAllowedTools 直接入白名单）；server 级勾选仍写
     * allowedMcps（= 全部工具，前缀展开语义不变）。枚举不到工具的 server 无此键。
     */
    mcpTools: Record<string, string[]>;
}
/**
 * GET /tools 出参：工具注册表三组 + LLM 模型目录。
 * models 组不来自工具注册表（groupToolNames 不产出）——由 web route 的
 * enumerateModelNames 枚举 LLM 提供方模型目录（`provider/model` 串）后并入
 * /tools 响应，类型上并入本接口以与 client 半 ToolOptions 保持同步。
 */
export interface ToolOptions extends ToolRegistryGroups {
    models: string[];
}
/** CRUD 操作结果（成功 = 数据；失败 = 抛 CrudError）。 */
export type CrudResult<T> = T;
/**
 * 把 AgentDef 投影为对外展示形态（出参全部经 escape；保留 compileOptions。
 * children.description 经 oneLine 折叠空白 + 防双花括号）。
 * @param def 规范化 Agent 定义。
 */
export declare function presentAgent(def: AgentDef): AgentListItem;
/**
 * 列出全部 Agent 定义（含 launchable=false），出参字段全部 escape。
 * 顺序 = defs 对象枚举顺序（V8 字符串键保序：数字键在前按升序，字符串键在后按插入顺序）。
 * @param defs Agent 定义库（Record<id, AgentDef>）。
 * @returns AgentListItem 数组（已 escape）。
 */
export declare function listAllAgents(defs: Record<string, AgentDef>): AgentListItem[];
/**
 * 创建新角色（POST /agents）。
 * 流程：校验 body → 检查 defs 中 id 不存在 → 合并 → 原子写盘 → 返回新 AgentDef。
 * @param defs 当前 Agent 定义库（调用方注入，保证与 GET /roles 视图一致）。
 * @param body 请求体（AgentDefInput 形态，含 id）。
 * @param root 数据根（写盘目标；测试用 os.tmpdir 隔离）。
 * @returns 新创建的规范化 Agent 定义。
 * @throws CrudError(400) SchemaValidationError；CrudError(409) id 已存在。
 */
export declare function createAgent(defs: Record<string, AgentDef>, body: unknown, root?: string): Promise<AgentDef>;
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
export declare function updateAgent(defs: Record<string, AgentDef>, id: string, body: unknown, root?: string): Promise<AgentDef>;
/**
 * 删除角色（DELETE /agents/:id）。
 * 流程：检查 defs 中 id 存在 → 从 defs 剥离 → 原子写盘。
 * @param defs 当前 Agent 定义库（调用方注入）。
 * @param id   URL 参数：目标角色 id。
 * @param root 数据根（写盘目标）。
 * @returns 被删除的角色 id（用于日志/响应）。
 * @throws CrudError(404) id 不存在。
 */
export declare function deleteAgent(defs: Record<string, AgentDef>, id: string, root?: string): Promise<string>;
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
export declare function groupToolNames(schemas: readonly {
    name: string;
}[]): ToolRegistryGroups;
/**
 * 从指定数据根加载 Agent 定义库（handler 包装层；显式传 root 让测试用 tmpdir 隔离）。
 * @param root 数据根（缺省按 $DSH_HOME 解析；测试传 os.tmpdir 临时目录）。
 */
export declare function loadAllAgents(root?: string): Promise<Record<string, AgentDef>>;
