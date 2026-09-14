/**
 * meow-dsh-workflow 工具注册壳 —— meow_agent_call（dsh 接入层）。
 *
 * T-05 交付 + R01-02/R01-08 修复：
 * 本文件只做「定义 + 注册」（defineTool 值导入，dsh 运行时经 host/profiles 解析）；
 * 真实执行逻辑在 tools-core.ts（executeAgentCall，零 dsh 依赖、独立可测）——
 * 家族惯例对齐 meow-dsh-task（tools.ts 注册壳 / executors.ts 纯逻辑分层）。
 *
 * 调用约定（docs/agent-chain-design.md §5/§6/§8）：
 *   meow_agent_call({ agentDefId, task, agentRunId? }) → { agentRunId, summary }；
 *   无 agentRunId 新建（startContinuable），有则续聊（followup）；
 *   错误结构化 AgentCallError（AGENT_NOT_FOUND / CONTINUE_FAILED / NO_PARENT / PROVIDER_UNAVAILABLE）。
 */
import type { Context } from '@deepseek-ai/cordis';
import { type AgentManager } from './agent-manager.js';
import type { loadAgentDefs as LoadAgentDefsFn } from './storage.js';
export { executeAgentCall, planAgentCall, followupSource, validateAgentCallArgs, AgentCallError, SUBAGENT_PROVIDER, } from './tools-core.js';
export type { AgentCallOutput, AgentCallPlan, TextBlock, SubagentGateway } from './tools-core.js';
/**
 * 注册 meow_agent_call 工具。
 * @param ctx        Cordis 上下文（tools/subagents 服务）。
 * @param config     插件配置（预留 providerName 覆盖）。
 * @param manager    AgentManager（授权编译；execute 时注入实时工具名快照）。
 * @param loadDefs   存储加载函数（缺省 ensurePresetAgents：与 web route 共用兜底，
 *                   agents.json 缺失时种入预置 6 角色，杜绝 meow_agent_call 读空库抛 AGENT_NOT_FOUND）。
 */
export declare function registerAgentCallTool(ctx: Context, config: {
    providerName?: string;
} | null | undefined, manager: AgentManager, loadDefs?: typeof LoadAgentDefsFn): void;
