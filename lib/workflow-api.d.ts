/**
 * meow-dsh-workflow 浏览器半数据流 —— 角色列表 + 发起 + Agent 管理（T-09 + T-04 交付）。
 *
 * 分层约定（design §13）：browser 半只走 HTTP，禁止直接读 storage；
 * 本模块把"选角色 → 填目标 → 发起"两步流与"Agent 管理"操作流的数据动作抽为
 * 纯函数（fetchImpl / inputActions 可注入），node 半 tsc 编译到 lib/ 供测试
 * 直接 import，client 组件经相对导入调用（tsdown 打包时内联进 lib/client.js）。
 *
 * HTTP 契约（node 半 web-routes，T-08 + T-01）：
 *   GET  /api/meow-workflow/roles        → { roles: [{ id, name, summary, children }] }
 *   POST /api/meow-workflow/build-prompt → { roleId, goal } → { systemPrompt, userPrompt }
 *     （node 半已注入角色协议 section 并返回组装好的用户消息）
 *   GET  /api/meow-workflow/agents       → { agents: AgentListItem[] }
 *     （全部定义，含非 launchable，T-01）
 *   POST /api/meow-workflow/agents       → 新建（409 id 冲突 / 400 schema）
 *   PUT  /api/meow-workflow/agents/:id   → 更新（404 不存在 / 400 body.id 与 url.id 不一致）
 *   DELETE /api/meow-workflow/agents/:id → 删除（404 不存在）
 *   GET  /api/meow-workflow/tools        → { tools: string[], skills: string[], mcps: string[] }
 *     （ctx.tools.schemas() 分组，T-01）
 *
 * 红线 8：本模块不拼接 prompt 文本（userPrompt 全部来自 node 半，已 escape）；
 * 组件只做透传渲染，不引入新的占位符形态；错误 message 经 oneLine 防 ASCII 双花括号外溢。
 */
/** InputActions 的本地结构类型（与 ui-conversation standard kit 的 InputActions 兼容）。 */
export interface WorkflowInputActions {
    /** 写入输入框草稿（完整替换）。 */
    setDraft(text: string): void;
    /** 进入提交（发送草稿）。 */
    submit(): void;
}
/** GET /roles 的角色列表项（与 node 半 RoleSummary 同构）。 */
export interface RoleSummaryDTO {
    id: string;
    name: string;
    summary: string;
    children: string[];
}
/** fetch 的最小契约（同源 /api/meow-workflow/*，无 CORS）。 */
export interface WorkflowFetch {
    (url: string, init?: {
        method?: string;
        headers?: Record<string, string>;
        body?: string;
    }): Promise<{
        ok: boolean;
        status: number;
        json(): Promise<unknown>;
        text(): Promise<string>;
    }>;
}
/** 全局 fetch 适配为 WorkflowFetch（浏览器环境）。 */
export declare const defaultFetch: WorkflowFetch;
/** GET /agents 出参项（与 node 半 AgentListItem 同步；红线条 8 已由 node 半 escape）。 */
export interface AgentListItem {
    id: string;
    name: string;
    systemPrompt: string;
    summary?: string;
    allowedSkills: string[];
    allowedMcps: string[];
    allowedTools: string[];
    model?: string;
    children: {
        name: string;
        description: string;
    }[];
    launchable: boolean;
    compileOptions?: {
        strict?: boolean;
    };
}
/** 保存/更新 Agent 的请求体形态（与 node 半 AgentDefInput 同步；调用方负责填齐）。 */
export interface AgentDefInput {
    id: string;
    name: string;
    systemPrompt: string;
    summary?: string;
    allowedSkills?: string[];
    allowedMcps?: string[];
    allowedTools?: string[];
    model?: string;
    children?: {
        name: string;
        description: string;
    }[];
    launchable?: boolean;
    compileOptions?: {
        strict?: boolean;
    };
}
/** 保存/更新成功后的规范化形态（与 node 半 AgentDef 同步）。 */
export interface AgentDef extends AgentDefInput {
    allowedSkills: string[];
    allowedMcps: string[];
    allowedTools: string[];
    children: {
        name: string;
        description: string;
    }[];
    launchable: boolean;
}
/** GET /tools 出参（与 node 半 ToolOptions 同步；已 escape）。models 组 = LLM 模型目录枚举。 */
export interface ToolOptions {
    tools: string[];
    skills: string[];
    mcps: string[];
    models: string[];
    /** R11 MCP 工具级授权：server → 工具全名（mcp__<server>__<tool>；旧后端缺省 → 空对象）。 */
    mcpTools: Record<string, string[]>;
}
/**
 * 拉取 launchable 角色列表（GET /api/meow-workflow/roles）。
 * @param fetchImpl fetch 实现（缺省全局 fetch；测试注入 mock）。
 * @returns 角色列表。
 */
export declare function fetchRoles(fetchImpl?: WorkflowFetch): Promise<RoleSummaryDTO[]>;
/**
 * 发起两步流第二步：组装提示词并发送。
 * 调 POST /api/meow-workflow/build-prompt 拿到 { systemPrompt, userPrompt }（node 半把
 * 角色协议 section 注入**发起会话**的 agent scope），把 userPrompt 写入输入框并提交——
 * 用户看到的就是"以 X 角色身份"的消息。
 * @param fetchImpl    fetch 实现（缺省全局 fetch；测试注入 mock）。
 * @param inputActions 输入框 action 面（ui-conversation standard kit 的 inputActions）。
 * @param roleId       发起角色 id。
 * @param goal         用户目标文本（非空由调用方校验）。
 * @param sessionId    发起会话 id（R08 问题 1：node 半据此把角色协议注入该会话的
 *                     agent scope，只对该会话生效；缺省不注入仅返回提示词）。
 */
export declare function buildAndSend(fetchImpl: WorkflowFetch, inputActions: WorkflowInputActions, roleId: string, goal: string, sessionId?: string | null): Promise<void>;
/**
 * 拉取全部 Agent 定义（GET /api/meow-workflow/agents），含 launchable=false。
 * Tab2 列表数据源；与 /roles（仅 launchable）共后端 defs 视图，由 node 半保证一致性。
 * @param fetchImpl fetch 实现（缺省全局 fetch；测试注入 mock）。
 * @returns AgentListItem 数组（已 escape；与 node 半 AgentListItem 同构）。
 */
export declare function fetchAgents(fetchImpl?: WorkflowFetch): Promise<AgentListItem[]>;
/**
 * 保存 Agent：mode 决定走 POST（新建）还是 PUT（更新 /agents/:id）。
 * 非 2xx 抛错；后端错误 message 经 oneLine 防 ASCII 双花括号外溢（红线 8）。
 * @param fetchImpl fetch 实现（必填；与 P-01 既有 buildAndSend 一致）。
 * @param mode      'create' = POST /agents；'update' = PUT /agents/:id（需 id）。
 * @param body      请求体（AgentDefInput）。
 * @param id        URL 参数（仅 mode='update' 使用；缺省时回退到 body.id，由 node 半兜底校验）。
 * @returns 规范化后的 AgentDef（node 半 presentAgent 产物）。
 */
export declare function saveAgent(fetchImpl: WorkflowFetch, mode: 'create' | 'update', body: AgentDefInput, id?: string): Promise<AgentDef>;
/**
 * 删除 Agent（DELETE /api/meow-workflow/agents/:id）。
 * 非 2xx 抛错（含 404 不存在）。
 * @param fetchImpl fetch 实现。
 * @param id        目标 Agent id。
 */
export declare function deleteAgent(fetchImpl: WorkflowFetch, id: string): Promise<void>;
/**
 * 拉取工具授权勾选枚举（GET /api/meow-workflow/tools）。
 * Tab2 编辑表单的三列数据源：系统工具名 / skill 入口 / MCP server 名（全部 escape）；
 * R11 增 mcpTools 组（server → 工具全名，MCP 列逐工具授权）。
 * 各组均已 escape（node 半 groupToolNames 分组）；前端不做去重，依赖后端静态分组保序。
 * @param fetchImpl fetch 实现（缺省全局 fetch；测试注入 mock）。
 * @returns ToolOptions（各组已 escape，后端静态分组去重保序）。
 */
export declare function fetchToolOptions(fetchImpl?: WorkflowFetch): Promise<ToolOptions>;
