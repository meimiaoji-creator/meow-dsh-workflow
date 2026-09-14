/**
 * meow-dsh-workflow 工具核心逻辑 —— meow_agent_call（零 dsh 依赖，独立可测）。
 *
 * R01-02 修复：startContinuable 新建路径包 try/catch → 捕获后抛
 * AgentCallError('PROVIDER_UNAVAILABLE')（与续聊路径 CONTINUE_FAILED 同款模板），
 * message 提示"不传 agentRunId 重新调用可新建"。
 *
 * R01-08 修复：persona 拼接处经 escapePromptBraces 防御（def.name / def.systemPrompt
 * 先中性化再入模板，杜绝字面 ASCII 双花括号进入 prompt 装配链路）。
 *
 * 本模块只依赖 node 类型 + schema/agent-manager/protocols（全部零 dsh 值依赖），
 * 运行时子 agent 调用经 SubagentGateway 接口注入（注册壳 tools.ts 适配 dsh 服务）。
 * 家族惯例对齐：meow-dsh-task 的测试只 import 零依赖模块（storage/executors/render），
 * 从不 import 值依赖 dsh 的注册壳（tools/commands/index）——本模块即"executors 等价物"。
 */
import { SchemaValidationError } from './schema.js';
import { compileAllowedToolsDetailed } from './agent-manager.js';
import { escapePromptBraces } from './protocols.js';
/** 子 agent 提供方名（dsh-base 注册的 spawn-in-process，能力齐全：persona/toolFilter/continuable）。 */
export const SUBAGENT_PROVIDER = 'spawn';
/** meow_agent_call 结构化错误。 */
export class AgentCallError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'AgentCallError';
        this.code = code;
    }
}
/**
 * 组装子 agent 启动计划（纯函数，独立可测）。
 * persona 与 label 中的角色名/行为范式先 escapePromptBraces 中性化，
 * 杜绝字面 ASCII 双花括号进入 prompt 装配链路（附录 A 防御机制）。
 * @param def      目标 Agent 定义（已由 schema 规范化）。
 * @param task     主 agent 交给子 agent 的任务。
 * @param manager  AgentManager（compileAllowedTools 白名单）。
 * @returns 启动计划（persona/toolFilter.allow/label/prompt）。
 */
export function planAgentCall(def, task, manager) {
    const allow = manager.compileAllowedTools(def);
    const safeName = escapePromptBraces(def.name);
    const safePrompt = escapePromptBraces(def.systemPrompt);
    const safeTask = escapePromptBraces(task);
    return {
        def,
        persona: `你是「${safeName}」。${safePrompt}`,
        allow,
        label: `meow-workflow:${safeName}`,
        prompt: [{
                type: 'text',
                text: `[meow-workflow 委派] 你以「${safeName}」身份执行任务。\n目标：${safeTask}\n`
                    // R09：不再列出授权工具白名单——工具由 toolFilter.allow 硬裁剪（模型清单即授权），
                    // 无需提示词软约束兜底。
                    + '完成后用结构化摘要回报结果。',
            }],
    };
}
/** 构建 followup 的 source 字段（协调者中继；senderSessionId = 调用方 agent id）。 */
export function followupSource(parent) {
    return { kind: 'coordinator', form: 'relay', senderSessionId: parent.id };
}
/**
 * meow_agent_call 执行核心（零 dsh 依赖，注入网关后独立可测）。
 * @param deps       依赖（网关 + 存储加载 + AgentManager + provider 名）。
 * @param args       工具入参（agentDefId/task/agentRunId?）。
 * @param parent     调用方 agent（exec.agent 结构面）。
 * @param signal     取消信号（exec.signal）。
 * @returns { agentRunId, summary }。
 * @throws {AgentCallError} NO_PARENT / AGENT_NOT_FOUND / CONTINUE_FAILED /
 *   PROVIDER_UNAVAILABLE / UNKNOWN_TOOL。
 */
export async function executeAgentCall(deps, args, parent, signal) {
    if (!parent) {
        throw new AgentCallError('NO_PARENT', 'meow_agent_call 需要调用方 agent（exec.agent 缺失）');
    }
    const defs = await deps.loadDefs();
    // R-07 T-05/3 修复：key 优先、name 回退——语言链引用/管理页 children/build-prompt 全用
    // 角色 name（如「研发工程师」），主 agent 提示词里没有 agents.json 键（engineer）可查；
    // 仅按 key 精确匹配会把「填 name 的委派」误判 AGENT_NOT_FOUND（「子 agent 手填」根因）。
    const def = defs[args.agentDefId]
        ?? Object.values(defs).find(d => d.name === args.agentDefId);
    if (!def) {
        const all = Object.values(defs);
        const hint = all.length === 0
            ? '（角色库为空）'
            : `（可用：${all.map(d => `${d.id}（${d.name}）`).slice(0, 8).join(', ')}${all.length > 8 ? '…' : ''}）`;
        throw new AgentCallError('AGENT_NOT_FOUND', `Agent 定义不存在: ${args.agentDefId}${hint}`);
    }
    // 注入实时工具名快照 → 编译白名单（MCP 精确名依赖注册表枚举）
    const liveToolNames = deps.toolNames();
    deps.manager.withToolNames(liveToolNames);
    // R-05 T-04/2 b：strict 模式（默认）下预校验白名单，发现未注册工具名
    // 抛 AgentCallError('UNKNOWN_TOOL') 而非让 dsh 的 tools.restrict 抛
    // "names unknown global tool" 后被 startContinuable/followup 的 try/catch 误包
    // 成 PROVIDER_UNAVAILABLE。loose 模式（def.compileOptions.strict === false）
    // 跳过此校验——保留旧测试用例与用户自定义角色兜底行为。
    const strict = def.compileOptions?.strict !== false;
    if (strict) {
        const compiled = compileAllowedToolsDetailed(def, liveToolNames, def.compileOptions);
        if (compiled.unknownTools.length > 0) {
            throw new AgentCallError('UNKNOWN_TOOL', `Agent「${escapePromptBraces(def.name)}」授权工具名未在工具注册表中找到: `
                + `${compiled.unknownTools.join(', ')}（拼写错误或工具未注册；`
                + '可在 Agent 定义设置 compileOptions.strict=false 跳过校验或修正工具名）');
        }
    }
    const plan = planAgentCall(def, args.task, deps.manager);
    const request = {
        parent,
        prompt: plan.prompt,
        persona: plan.persona,
        label: plan.label,
        toolFilter: { allow: plan.allow },
        // 模型路由：model 覆盖子 agent 模型；provider 可选（多 provider 部署下跨厂商路由，
        // 缺省继承父 agent 的 provider）。两者经 dsh resolveChildAgentOptions 合并（requested 覆盖父值）。
        ...def.model !== undefined
            ? { agentOptions: { model: def.model, ...def.provider !== undefined ? { provider: def.provider } : {} } }
            : {},
    };
    // 续聊：复用已有子 agent（同一定义同一实例）
    if (args.agentRunId) {
        try {
            await deps.gateway.followup(parent, args.agentRunId, plan.prompt, {
                source: followupSource(parent),
                signal,
            });
        }
        catch (err) {
            // R-05 T-04/2 b 兜底：续聊也可能触发 restrict 误抛（dsh 抛
            // "names unknown global tool" —— child-provider 内部再 restrict 一遍
            // allow 列表，或 strict 模式漏检的边界）。识别后升级为 UNKNOWN_TOOL，
            // 避免误导为「续聊失败」（实际根因仍是白名单含未注册工具名）。
            const msg = err.message ?? '';
            if (msg.includes('names unknown global tool') || msg.includes('unknown global tool')) {
                throw new AgentCallError('UNKNOWN_TOOL', `续聊子 agent 工具白名单含未注册工具名: ${msg}`);
            }
            throw new AgentCallError('CONTINUE_FAILED', `续聊子 agent ${args.agentRunId} 失败: ${err.message}`);
        }
        return {
            agentRunId: args.agentRunId,
            summary: `已向「${escapePromptBraces(def.name)}」续聊（agentRunId=${args.agentRunId}）`,
        };
    }
    // 新建：startContinuable（返回 durable childId 即续聊凭据）
    try {
        const started = await deps.gateway.startContinuable({
            provider: deps.providerName,
            label: plan.label,
            request,
            signal,
        });
        return {
            agentRunId: started.childId,
            summary: `已创建子 agent「${escapePromptBraces(def.name)}」（agentRunId=${started.childId}）`,
        };
    }
    catch (err) {
        // R-05 T-04/2 b 兜底：dsh 的 tools.restrict 在子 agent 创建链路
        // 仍可能抛 "names unknown global tool"（当 child-provider 内部自己再 restrict
        // 一遍我们的 allow 列表，或 strict 模式漏检的边界情况）。
        // 此处从错误 message 识别该文本并升级为 UNKNOWN_TOOL，
        // 避免误导为「provider 不可用」。
        const msg = err.message ?? '';
        if (msg.includes('names unknown global tool') || msg.includes('unknown global tool')) {
            throw new AgentCallError('UNKNOWN_TOOL', `子 agent 工具白名单含未注册工具名: ${msg}`
                + '（agent 定义 allowedTools/allowedMcps 与工具注册表不一致）');
        }
        throw new AgentCallError('PROVIDER_UNAVAILABLE', `子 agent 提供方不可用: ${msg}（不传 agentRunId 重新调用可新建）`);
    }
}
/** 校验 meow_agent_call 入参（独立可测；schema 已强校验，此处补语义校验）。 */
export function validateAgentCallArgs(args) {
    if (typeof args.agentDefId !== 'string' || args.agentDefId.trim() === '') {
        throw new SchemaValidationError('agentDefId 必填且为非空字符串');
    }
    if (typeof args.task !== 'string' || args.task.trim() === '') {
        throw new SchemaValidationError('task 必填且为非空字符串');
    }
    if (args.agentRunId !== undefined && (typeof args.agentRunId !== 'string' || args.agentRunId.trim() === '')) {
        throw new SchemaValidationError('agentRunId 若提供必须为非空字符串');
    }
}
