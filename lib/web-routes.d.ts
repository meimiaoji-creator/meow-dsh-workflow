/**
 * meow-dsh-workflow Web 路由 —— /api/meow-workflow/* 共 7 条 JSON API。
 *
 * v2.1 既有（保持零变更）：
 *   - GET  /api/meow-workflow/roles          → launchable=true 角色列表
 *     （{ roles: [{ id, name, summary, children }] }；summary = 范式一句话，children = 子 agent 名字）
 *   - POST /api/meow-workflow/build-prompt   → 入参 { roleId, goal }，返回 { systemPrompt, userPrompt }
 *     （调用 T-06 buildRolePrompt/buildUserPrompt；成功后把角色协议注入 ctx.systemPrompt.section，
 *      旧 section 先 dispose 防累积——"以 X 角色发起"装配时生效，见 design §5 时序）
 *
 * v2 新增（T-01 交付，docs/agent-chain-ui-v2.md §6）：
 *   - GET    /api/meow-workflow/agents         → 全部 Agent 定义（含非 launchable）
 *   - POST   /api/meow-workflow/agents         → 新建（body=AgentDefInput → { agent } / 409）
 *   - PUT    /api/meow-workflow/agents/:id     → 更新（id 不可改；400/404）
 *   - DELETE /api/meow-workflow/agents/:id     → 删除（{ ok: true } / 404）
 *   - GET    /api/meow-workflow/tools          → 授权勾选枚举（{ tools, skills, mcps }）
 *
 * T-06 新增（agent-chain-ui-v2.md §4 + §7）：Agent 管理自包含单页。
 *   - GET exact /meow-workflow/agents           → HTML 单页（static.ts 提供）
 *     （不抢 registerFallback，仅 exact 注册；与 /api 前缀路由分离——客户端 /agents 是页面，
 *      /api/meow-workflow/agents 是 JSON；两条不冲突。）
 *
 * 约束（与 meow-vision / meow-dsh-task 一致）：
 *   - 不抢 registerFallback，只用 prefix 命名路由；同源（http://127.0.0.1:3080），无 CORS；
 *   - 零 dsh 源码改动；ctx.webServer 类型经 @deepseek-ai/dsh-host-webserver 的 module augmentation；
 *   - 红线 8：所有入参/出参字段（角色名/范式/子 agent 名/goal/白名单/工具名/错误消息）
 *     经 escapePromptBraces/oneLine。
 *
 * 可测性：
 *   - 纯函数层：listLaunchableRoles / assemblePrompt / listAllAgents / presentAgent /
 *     groupToolNames / createAgent / updateAgent / deleteAgent / loadAllAgents（零 dsh 依赖）；
 *   - registerWebRoutes 为接入层（host mock 测试：伪 ctx 捕获 handler + 模拟 req/res）。
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { AgentDef } from './schema.js';
/** Agent 管理自包含单页路由（T-06 — agent-chain-ui-v2 §4 + §7）。 */
export declare const AGENTS_PAGE_PATH = "/meow-workflow/agents";
/** 记忆页路径（工作流面板「记忆」tab iframe 指向；与 agents 页同款 exact 路由）。 */
export declare const MEMORY_PAGE_PATH = "/meow-workflow/memory";
/** 台账页路径（工作流面板「台账」tab iframe 指向；与 agents 页同款 exact 路由）。 */
export declare const LEDGER_PAGE_PATH = "/meow-workflow/ledger";
/** 角色协议 section 唯一名（同名重复注册 dsh 会抛错，故注册前先 dispose 旧的）。 */
export declare const ROLE_SECTION_NAME = "meow-workflow.role-protocol";
/**
 * 剥离语言链引用形态（`<语言链引用:agent:角色名>`）与折叠空白。
 * 供角色列表 summary 降级展示（def.summary 缺省时），防止把内部编排语法暴露给用户
 * （design §7.2「对用户屏蔽 agent 细节」+ agent-chain-ui.md §3「范式一句话」人话要求）。
 * @param text 原始文本（通常为 summarizePrompt 首句）。
 * @returns 剥离引用后的干净文本（escape + 空白折叠）。
 */
export declare function sanitizeSummary(text: string): string;
/** 角色列表项：id/name + 范式一句话 + 子 agent 名字（全部已 escape）。 */
export interface RoleSummary {
    id: string;
    name: string;
    /** 范式一句话（人话：def.summary 优先，缺省 sanitize(systemPrompt 首句)）。 */
    summary: string;
    /** 子 agent 目录名字（escape 后）。 */
    children: string[];
}
/**
 * 过滤 launchable=true 的角色为列表项。
 * summary 对人话：优先 AgentDef.summary（预置角色人手写），
 * 缺省降级为 systemPrompt 首句再 sanitize（剥离语言链引用形态）。
 * @param defs Agent 定义库。
 * @returns 角色列表（保序，按定义顺序）。
 */
export declare function listLaunchableRoles(defs: Record<string, AgentDef>): RoleSummary[];
/** build-prompt 组装结果。 */
export interface PromptPayload {
    systemPrompt: string;
    userPrompt: string;
}
/**
 * 组装提示词（T-06 协议层编排）：语言链引用解析 → 目录合并 → 授权编译 → 系统/用户提示词。
 * @param defs      Agent 定义库。
 * @param roleId    发起角色 id。
 * @param goal      用户目标（必填非空由调用方校验）。
 * @returns 提示词对；角色不存在返回 null。
 */
export declare function assemblePrompt(defs: Record<string, AgentDef>, roleId: string, goal: string): PromptPayload | null;
/**
 * 把角色上下文直接应用到**给定 agent**的 scope（斜杠命令发起路径，commands.ts 调用）。
 *
 * 与 installRoleSection 同核（applyAgentRoleContext），差别只在定位方式：命令
 * handler 手里就是 live agent（invocation.agent），无需再经 ctx.agents.get 二次
 * 解析。同样先 cleanup 该会话旧注入（防累积/换角色解除旧 restrict），disposer
 * 记入同一张 roleSectionDisposers 表（会话 dispose 随 agent scope 自动清理）。
 * @param ctx         Cordis 上下文（仅用 logger）。
 * @param agent       目标 agent（live handle，invocation.agent）。
 * @param def         角色 AgentDef。
 * @param toolNames   工具名索引（restrict 的 strict 校验）。
 * @param sectionText 角色协议系统提示词。
 * @returns 是否成功应用（失败仅告警，调用方降级继续发起）。
 */
export declare function installRoleContextForAgent(ctx: Context, agent: Agent, def: AgentDef, toolNames: readonly string[], sectionText: string): boolean;
/**
 * R09 修复：/tools 授权枚举与 build-prompt 工具名索引改用**全可见工具**枚举。
 *
 * web profile 的工具注册表是 layered：host 插件工具（meow_agent_call、meow_vision、
 * meow_preview 等）在 root 可见，preset 标准工具（tool-fs/tool-bash 等）挂载到各会话
 * agent scope。仅 root + 默认清单会漏掉 agent scope 的工具（如 meow 系列插件工具在
 * preset/agent 可见层），导致管理页无法授权这些工具。本函数合并：root scope（global 层）
 * ∪ 各活跃 agent scope（preset 层 + agent 可见工具）∪ 默认清单（兜底），去重保序。
 *
 * @param ctx Cordis 上下文（tools / agents 服务）。
 * @returns 可见工具 schema 列表（root + 各 agent scope + 默认兜底，去重）。
 */
export declare function enumerateToolSchemas(ctx: Context): Promise<readonly {
    name: string;
}[]>;
/**
 * R10 模型选择：枚举管理页模型选择器（datalist）可选的模型目录。
 * 走 dsh 官方 catalog 同款 API（session-controller catalog.ts）：ctx.llm.listProviders()
 * （同步）→ 每 provider ctx.llm.listModels(id)（异步），产出 `provider/model` 串——
 * 多 provider 部署下裸 model id 有歧义，带 provider 前缀才能跨厂商路由（管理页提交时
 * 拆开存 AgentDef.{provider,model}，执行链 tools-core 组装 agentOptions 两者并传）。
 * 防御：llm 服务缺失（测试 mock / 非 web profile）→ 空数组（模型框退化为自由输入=旧行为）；
 * 单 provider 目录失败 → 跳过该 provider（与 dsh buildModelCatalog 的 per-provider 容错同款）。
 * @param ctx Cordis 上下文（llm 服务；'llm' 已在 index.ts inject 声明）。
 * @returns `provider/model` 串数组（去重保序，escape 防御红线 8）。
 */
export declare function enumerateModelNames(ctx: Context): Promise<string[]>;
/** registerWebRoutes 选项（测试可注入 loadDefs / 数据根 root）。 */
export interface WebRoutesOptions {
    /** 角色库加载函数（缺省 ensurePresetAgents(root?)。root 指定时走该 root；测试 os.tmpdir 隔离）。 */
    loadDefs?: () => Promise<Record<string, AgentDef>>;
    /** 数据根（覆盖 $DSH_HOME 解析；T-01 CRUD + GET /agents 共用 loadDefs 时透传）。 */
    root?: string;
    /**
     * 角色库变更钩子：createAgent/updateAgent/deleteAgent 成功后调用（fire-and-forget，
     * 异常吞掉——重同步失败不影响 CRUD 响应）。index.ts 接到斜杠命令集重同步。
     */
    onAgentsChanged?: () => void;
}
/**
 * 注册 Web 路由（/api/meow-workflow/*）。
 * @param ctx     Cordis 上下文（webServer / systemPrompt / tools 服务）。
 * @param options 可选：loadDefs / root 覆盖（测试传 os.tmpdir 隔离库）。
 */
export declare function registerWebRoutes(ctx: Context, options?: WebRoutesOptions): void;
