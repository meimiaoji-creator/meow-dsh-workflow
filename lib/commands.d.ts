/**
 * 角色发起斜杠命令 —— dsh 接入壳（node 半）。
 *
 * 把 commands-core 的纯逻辑接到 dsh 真实服务：
 *   - 命令注册：`ctx.commands.register`（@deepseek-ai/dsh-commands 公开插件面；
 *     客户端命令目录经 remote.commands.list 自动发现，**客户端零改动**——输入 `/`
 *     即下拉选择角色，选完认领 `/meow-workflow-<id> `，正常粘贴文件后回车执行）；
 *   - 消息投递：`createUserMessage`（@deepseek-ai/dsh-llm）+ `agent.followup/steer`
 *     （鸭子类型：live agent 运行时面；两者皆缺/抛错 → 失败结果，会话无损）；
 *   - 角色上下文 / 工具名索引 / 角色库：复用 web-routes 既有导出（与面板 build-prompt
 *     路径同核，见 commands-core.ts 头注）。
 *
 * 运行时 import（@deepseek-ai/dsh-llm）沿 tools.ts（defineTool）同款模式：插件运行在
 * dsh 模块闭包内可解析；lib 测试走 commands-core.js（零 dsh 运行时依赖）不受影响。
 */
import type { Context } from '@deepseek-ai/cordis';
import type { AgentDef } from './schema.js';
export { WORKFLOW_COMMAND_PREFIX, COMMAND_INPUT_HINT, roleIdToCommandName, commandDescription, executeWorkflowLaunch, createCommandSync, } from './commands-core.js';
export type { WorkflowCommandInvocation, WorkflowCommandResult, WorkflowLaunchDeps, WorkflowCommandRegistration, CommandSyncPorts, DeliverOutcome, } from './commands-core.js';
/** shell 依赖选项（loadDefs 覆盖；测试注入 tmpdir 隔离库）。 */
export interface WorkflowCommandsOptions {
    /** 角色库加载（缺省 ensurePresetAgents()，与 /api 路由同源）。 */
    loadDefs?: () => Promise<Record<string, AgentDef>>;
}
/**
 * 创建命令同步器并绑定真实端口（index.ts 初始注册 + CRUD 路由 onAgentsChanged 重同步）。
 * ctx.commands 服务缺失（老版本 dsh / 测试伪 ctx）→ 降级 no-op sync（warn），面板
 * 发起路径不受影响（R08 守则 8：失败降级，不崩插件）。
 * @param ctx     Cordis 上下文（'commands' 已在 index.ts inject 声明）。
 * @param options loadDefs 覆盖。
 * @returns sync 函数（await 后返回 { registered, skipped }）。
 */
export declare function syncWorkflowCommands(ctx: Context, options?: WorkflowCommandsOptions): () => Promise<{
    registered: string[];
    skipped: string[];
}>;
