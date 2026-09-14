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
import { defineTool } from '@deepseek-ai/dsh-tools';
import { SessionId } from '@deepseek-ai/dsh-session';
import { AGENT_CALL_TOOL, resolveVisibleToolNames } from './agent-manager.js';
import { publishChildGrants } from './authorization.js';
import { ensurePresetAgents } from './presets.js';
import { executeAgentCall, validateAgentCallArgs, SUBAGENT_PROVIDER, } from './tools-core.js';
// re-export（barrel 汇聚点：T-08 web route / 测试直接 import 的符号保持从 tools.ts 转发）。
export { executeAgentCall, planAgentCall, followupSource, validateAgentCallArgs, AgentCallError, SUBAGENT_PROVIDER, } from './tools-core.js';
/**
 * 注册 meow_agent_call 工具。
 * @param ctx        Cordis 上下文（tools/subagents 服务）。
 * @param config     插件配置（预留 providerName 覆盖）。
 * @param manager    AgentManager（授权编译；execute 时注入实时工具名快照）。
 * @param loadDefs   存储加载函数（缺省 ensurePresetAgents：与 web route 共用兜底，
 *                   agents.json 缺失时种入预置 6 角色，杜绝 meow_agent_call 读空库抛 AGENT_NOT_FOUND）。
 */
export function registerAgentCallTool(ctx, config, manager, loadDefs = () => ensurePresetAgents()) {
    const providerName = config?.providerName ?? SUBAGENT_PROVIDER;
    ctx.tools.register(defineTool({
        name: AGENT_CALL_TOOL,
        description: '按 Agent 定义创建或续聊子 agent（身份 persona + 权限 toolFilter 注入）。'
            + '主 agent 记住返回的 agentRunId，后续传回即可复用续聊同一子 agent；'
            + '子 agent 可继续下辖孙 agent（语言链多层）。'
            + '调度子 agent 只用本工具（新建传 agentDefId+task、续聊传回 agentRunId）即可，'
            + '不要再额外调用 subagent 工具——本工具内部已完成子 agent 创建/续聊，两者同时调用会把同一子 agent 重复调度两次。'
            + '续聊 = 复用同一实例（保留其上下文与工具白名单）；不传 agentRunId 将新建一个全新子 agent（不带原上下文）。'
            + '同一交付物的迭代/修复/回归必须传回原 agentRunId 续聊原实现者，不要为已存在的活另开新 agent。',
        parameters: {
            agentDefId: {
                type: 'string',
                required: true,
                description: 'Agent 定义 id（agents.json 键）或角色名（name）——key 优先、name 回退；'
                    + '如研发工程师（id=engineer）两种写法都可用',
            },
            task: { type: 'string', required: true, description: '交给子 agent 的任务目标' },
            agentRunId: { type: 'string', description: '可选：续聊凭据（新建省略，续聊传回）' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    agentRunId: { type: 'string', required: true, description: '子 agent 会话 id（续聊凭据）' },
                    summary: { type: 'string', required: true, description: '状态摘要（新建/续聊）' },
                },
            },
            render: (args, value) => [{
                    type: 'text',
                    text: `meow_agent_call(${args.agentDefId}${args.agentRunId ? `, continue ${args.agentRunId}` : ''}): ${value.summary}`,
                }],
        },
        isConcurrencySafe: () => true,
        async execute(args, exec) {
            // 入参语义校验（R01-03 预留：schema 已强校验，此处双保险）
            validateAgentCallArgs(args);
            const gateway = {
                startContinuable: (spec) => ctx.subagents.startContinuable(spec),
                followup: (parent, childId, content, options) => ctx.subagents.sendMessage(parent, SessionId(childId), content, {
                    // dsh 2026-09 起 followup(parent, childId, content, { source, signal }) 改为
                    // sendMessage(sender, targetId, content, { signal })：sender attribution 由服务
                    // 从 live sender 推导，不再手传 source（gateway 层保留 source 字段以兼容内部协议与测试）。
                    signal: options.signal,
                }),
            };
            const output = await executeAgentCall({
                gateway,
                loadDefs,
                manager,
                providerName,
                // R-07 T-05/2 修复：实时枚举 ∪ 默认授权清单（web profile 注册表缺标准工具名时
                // 并入 read/edit/write/glob/grep/pwsh 等，杜绝 strict 预校验误报 UNKNOWN_TOOL；
                // 与 web-routes 的 visibleToolSchemas 共用 resolveVisibleToolNames 同一口径）。
                toolNames: () => {
                    try {
                        return resolveVisibleToolNames(ctx.tools.schemas().map(s => s.name));
                    }
                    catch {
                        // tools 服务不可用（异常快照）：退化为纯默认清单（编译/预校验不塌缩）。
                        return [...resolveVisibleToolNames([])];
                    }
                },
            }, args, exec.agent, exec.signal);
            // R09：子 agent 创建/续聊后发布角色授权到其 agent.ctx（技能目录过滤读取）。
            // 子 agent 的工具/MCP 裁剪已由 toolFilter（spawn provider 内部 restrict）完成。
            await publishChildGrants(ctx, args.agentDefId, output.agentRunId, loadDefs);
            return output;
        },
    }));
}
