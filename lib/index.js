/**
 * meow-dsh-workflow —— dsh 插件入口（node 半）。
 *
 * 极简提示词生成器 v2.1：Agent 定义存储 + 提示词生成 + meow_agent_call 子 agent
 * 身份权限注入。五层架构见 docs/agent-chain-design.md §13：
 *   入口 → 协议层（提示词生成）→ Agent 管理（授权编译 + subagents）→ 存储（agents.json）→ Web 路由。
 *
 * 接线顺序（T-01~T-08 已挂入）：
 *   1. normalizeConfig（schema）
 *   2. ensurePresetAgents（T-07 预置角色种入，首次加载落盘）
 *   3. AgentManager（agent-manager，授权编译）
 *   4. registerAgentCallTool（tools，meow_agent_call；execute 时实时注入工具名快照）
 *   5. registerWebRoutes（web-routes，/api/meow-workflow/*：角色列表 + 组装提示词 + 角色协议 section 注入）
 * 协议层（T-06 buildRolePrompt/buildUserPrompt 等）为纯函数，由 web route 直接调用。
 * 零 dsh 源码改动；与 meow-dsh-task / meow-file-view / dsh-meow-skill 平级共存。
 */
import { normalizeConfig } from './schema.js';
import { AgentManager } from './agent-manager.js';
import { registerAgentCallTool } from './tools.js';
import { registerAgentSaveTool } from './agent-save.js';
import { registerAgentQueryTool } from './agent-query.js';
import { registerLedgerTools } from './ledger.js';
import { registerChildListTool } from './child-list.js';
import { registerMemoryTools } from './memory.js';
import { ensurePresetAgents } from './presets.js';
import { registerWebRoutes } from './web-routes.js';
import { syncWorkflowCommands } from './commands.js';
import { registerSkillCatalogFilter } from './skill-filter.js';
export { agentDefSchema, normalizeConfig, validateAgentChild, SchemaValidationError } from './schema.js';
export { loadAgentDefs, saveAgentDefs, loadWorkspaceConfig, saveWorkspaceConfig, resolveDataRoot, agentsFile, workspaceConfigFile, normalizeWorkspaceConfig, } from './storage.js';
export { AgentManager, compileAllowedTools, compileAllowedToolsDetailed, mcpToolPrefix, SKILL_TOOL, AGENT_CALL_TOOL, } from './agent-manager.js';
export { registerAgentCallTool, planAgentCall, followupSource, validateAgentCallArgs, AgentCallError, SUBAGENT_PROVIDER, executeAgentCall, } from './tools.js';
export { registerAgentSaveTool } from './agent-save.js';
export { executeAgentSave, AGENT_SAVE_TOOL } from './agent-save-core.js';
export { registerAgentQueryTool } from './agent-query.js';
export { listAgents, getAgent, AGENT_LIST_TOOL, AGENT_GET_TOOL } from './agent-query-core.js';
export { registerLedgerTools } from './ledger.js';
export { executeLedgerWrite, executeLedgerRead, LEDGER_WRITE_TOOL, LEDGER_READ_TOOL, } from './ledger-core.js';
export { LEDGER_BOOKS, listLedgerOverview, LEDGER_SHARED_PROJECT } from './ledger-store.js';
export { registerChildListTool } from './child-list.js';
export { listChildAgents, CHILD_LIST_TOOL } from './child-list-core.js';
export { registerMemoryTools } from './memory.js';
export { appendMemory, readMemory, sanitizeKey, MEMORY_WRITE_TOOL, MEMORY_READ_TOOL, listMemoryOverview, } from './memory-core.js';
export { escapePromptBraces, oneLine, ROLE_PROTOCOL_ORDER, summarizePrompt, resolveLanguageChainRefs, mergeChildren, buildRolePrompt, buildUserPrompt, } from './protocols.js';
export { PRESET_AGENTS, ensurePresetAgents } from './presets.js';
export { ROLE_SECTION_NAME, listLaunchableRoles, assemblePrompt, registerWebRoutes, sanitizeSummary, enumerateModelNames, } from './web-routes.js';
export { WORKFLOW_COMMAND_PREFIX, COMMAND_INPUT_HINT, roleIdToCommandName, commandDescription, executeWorkflowLaunch, createCommandSync, syncWorkflowCommands, } from './commands.js';
export { listAllAgents, createAgent, updateAgent, deleteAgent, groupToolNames, loadAllAgents, presentAgent, CrudError, } from './agents-crud.js';
/** 插件名（Cordis 行 id 之外的插件标识）。 */
export const name = 'meow-dsh-workflow';
/**
 * 需要的服务：工具注册表 + 子 agent 运行时 + 系统提示词 + Web 路由服务 + 技能/agent 注册表 + LLM 注册表 + 命令注册表。
 * tools/subagents 来自 dsh-base（web profile 之上叠加），webServer 来自 web profile。
 * agents/skills：R08 问题 2 的 /tools 技能枚举（enumerateSkillNames）要遍历各 agent 的
 * 技能注册表（本地技能）与 root 层（远程技能）——dsh 插件必须 inject 声明才能访问
 * ctx.agents / ctx.skills（未声明则这两个服务在插件 ctx 上不可用，枚举会整体回退）。
 * llm：R10 模型选择的 /tools models 组（enumerateModelNames）要读 ctx.llm 的
 * provider/model 目录（与 dsh session-controller catalog 同款 API）。
 * commands：角色斜杠命令（/meow-workflow-<角色id>）经 ctx.commands.register 注册
 * （@deepseek-ai/dsh-commands 公开插件面）；服务缺失时 commands.ts 降级 no-op。
 */
export const inject = ['tools', 'subagents', 'systemPrompt', 'webServer', 'agents', 'skills', 'llm', 'commands'];
/**
 * 插件入口：预置角色种入 → AgentManager → meow_agent_call 工具注册 → Web 路由挂载。
 * 协议层（T-06）为纯函数，由 web route 在 build-prompt 时直接调用。
 * @param ctx    Cordis 上下文（tools/subagents/systemPrompt/webServer 服务）
 * @param config 插件配置（cordis.patch.yml config 字段；无配置时 Cordis 传 null，统一兜底空对象）
 */
export async function apply(ctx, config = {}) {
    const cfg = normalizeConfig(config);
    // T-07：确保预置角色已种入（首次加载无 agents.json 则落盘；幂等）。
    await ensurePresetAgents();
    // T-04/T-05：AgentManager（工具名快照在 meow_agent_call execute 时实时注入）→ 注册工具。
    const manager = new AgentManager();
    registerAgentCallTool(ctx, cfg, manager);
    // agent提炼优化 协作：meow_agent_save（保存/新增/更新）+ meow_agent_list / meow_agent_get（查询）。
    // 工具全局注册，但可调用性由各 Agent 的 allowedTools 白名单决定——默认只有
    // 「agent提炼优化」的 allowedTools 含这几个工具，即初始只授权给它。
    registerAgentSaveTool(ctx);
    registerAgentQueryTool(ctx);
    // 台账读写工具（meow_ledger_write / meow_ledger_read）。工具全局注册，
    // 可调用性由各 Agent 的 allowedTools 白名单决定——默认只有首席幕僚/产品/市场/执行总裁(只读)
    // 等少数角色的 allowedTools 含它们，即初始只授权给这些管理角色。
    registerLedgerTools(ctx);
    // 子 agent 目录查询（父级派发前看 children 能力）+ 角色记忆（项目×角色，跨会话）。
    // 可调用性由各 Agent 的 allowedTools 决定：child_list 只授父级（children 非空者），
    // memory 读写全角色授权（私档，无敏感簿）。
    registerChildListTool(ctx);
    registerMemoryTools(ctx);
    // T-08：Web 路由（/api/meow-workflow/* —— 角色列表 + 组装提示词 + 角色协议注入）。
    // 角色斜杠命令（/meow-workflow-<角色id>）与 CRUD 联动：loadDefs 同源，agents.json
    // 增删改后 onAgentsChanged 触发命令集重同步（dispose 旧集 → 按新 launchable 重注册）。
    const loadDefs = () => ensurePresetAgents();
    const syncCommands = syncWorkflowCommands(ctx, { loadDefs });
    await syncCommands();
    registerWebRoutes(ctx, { loadDefs, onAgentsChanged: () => { void syncCommands(); } });
    // R09：技能目录按角色授权过滤（agent/pre-step 拦截；本地+远程技能统一在目录里过滤）。
    // 主 agent 授权由 build-prompt 发布（web-routes installRoleSection），子 agent 授权由
    // meow_agent_call 执行路径发布（tools.ts publishChildGrants）——两者都挂到 agent.ctx
    // 约定属性，skill-filter 统一读取过滤。
    registerSkillCatalogFilter(ctx);
    ctx.logger.info(`[meow-dsh-workflow] 已加载：meow_agent_call 工具已注册 + 预置角色已种入 + /api/meow-workflow/* 已挂载`
        + `（config=${JSON.stringify(cfg)}）`);
}
