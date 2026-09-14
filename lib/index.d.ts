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
import type { Context } from '@deepseek-ai/cordis';
import type { PluginConfig } from './schema.js';
export type { AgentChild, AgentDef, AgentDefInput, PluginConfig, WorkspaceConfig } from './schema.js';
export { agentDefSchema, normalizeConfig, validateAgentChild, SchemaValidationError } from './schema.js';
export { loadAgentDefs, saveAgentDefs, loadWorkspaceConfig, saveWorkspaceConfig, resolveDataRoot, agentsFile, workspaceConfigFile, normalizeWorkspaceConfig, } from './storage.js';
export { AgentManager, compileAllowedTools, compileAllowedToolsDetailed, mcpToolPrefix, SKILL_TOOL, AGENT_CALL_TOOL, } from './agent-manager.js';
export { registerAgentCallTool, planAgentCall, followupSource, validateAgentCallArgs, AgentCallError, SUBAGENT_PROVIDER, executeAgentCall, } from './tools.js';
export type { AgentCallOutput, AgentCallPlan, TextBlock, SubagentGateway } from './tools.js';
export { registerAgentSaveTool } from './agent-save.js';
export { executeAgentSave, AGENT_SAVE_TOOL } from './agent-save-core.js';
export type { AgentSaveInput, AgentSaveOutput, AgentSaveDeps } from './agent-save-core.js';
export { registerAgentQueryTool } from './agent-query.js';
export { listAgents, getAgent, AGENT_LIST_TOOL, AGENT_GET_TOOL } from './agent-query-core.js';
export type { AgentQueryDeps } from './agent-query-core.js';
export { registerLedgerTools } from './ledger.js';
export { executeLedgerWrite, executeLedgerRead, LEDGER_WRITE_TOOL, LEDGER_READ_TOOL, } from './ledger-core.js';
export type { LedgerWriteInput, LedgerWriteOutput, LedgerReadInput, LedgerReadOutput, LedgerItem, } from './ledger-core.js';
export { LEDGER_BOOKS, listLedgerOverview, LEDGER_SHARED_PROJECT } from './ledger-store.js';
export type { LedgerProjectOverview } from './ledger-store.js';
export { registerChildListTool } from './child-list.js';
export { listChildAgents, CHILD_LIST_TOOL } from './child-list-core.js';
export type { ChildListEntry } from './child-list-core.js';
export { registerMemoryTools } from './memory.js';
export { appendMemory, readMemory, sanitizeKey, MEMORY_WRITE_TOOL, MEMORY_READ_TOOL, listMemoryOverview, } from './memory-core.js';
export type { MemoryEntry, MemoryReadItem, MemoryProjectOverview } from './memory-core.js';
export { escapePromptBraces, oneLine, ROLE_PROTOCOL_ORDER, summarizePrompt, resolveLanguageChainRefs, mergeChildren, buildRolePrompt, buildUserPrompt, } from './protocols.js';
export { PRESET_AGENTS, ensurePresetAgents } from './presets.js';
export { ROLE_SECTION_NAME, listLaunchableRoles, assemblePrompt, registerWebRoutes, sanitizeSummary, enumerateModelNames, } from './web-routes.js';
export type { RoleSummary, PromptPayload, WebRoutesOptions } from './web-routes.js';
export { WORKFLOW_COMMAND_PREFIX, COMMAND_INPUT_HINT, roleIdToCommandName, commandDescription, executeWorkflowLaunch, createCommandSync, syncWorkflowCommands, } from './commands.js';
export type { WorkflowCommandInvocation, WorkflowCommandResult, WorkflowLaunchDeps, WorkflowCommandRegistration, CommandSyncPorts, DeliverOutcome, WorkflowCommandsOptions, } from './commands.js';
export { listAllAgents, createAgent, updateAgent, deleteAgent, groupToolNames, loadAllAgents, presentAgent, CrudError, } from './agents-crud.js';
export type { AgentListItem, ToolOptions, ToolRegistryGroups, CrudErrorCode } from './agents-crud.js';
/** 插件名（Cordis 行 id 之外的插件标识）。 */
export declare const name = "meow-dsh-workflow";
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
export declare const inject: string[];
/**
 * 插件入口：预置角色种入 → AgentManager → meow_agent_call 工具注册 → Web 路由挂载。
 * 协议层（T-06）为纯函数，由 web route 在 build-prompt 时直接调用。
 * @param ctx    Cordis 上下文（tools/subagents/systemPrompt/webServer 服务）
 * @param config 插件配置（cordis.patch.yml config 字段；无配置时 Cordis 传 null，统一兜底空对象）
 */
export declare function apply(ctx: Context, config?: Partial<PluginConfig> | null): Promise<void>;
