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
import type { AgentDef } from './schema.js';
import type { AgentManager } from './agent-manager.js';
/** 子 agent 提供方名（dsh-base 注册的 spawn-in-process，能力齐全：persona/toolFilter/continuable）。 */
export declare const SUBAGENT_PROVIDER = "spawn";
/** meow_agent_call 结构化错误。 */
export declare class AgentCallError extends Error {
    readonly code: 'AGENT_NOT_FOUND' | 'CONTINUE_FAILED' | 'NO_PARENT' | 'PROVIDER_UNAVAILABLE' | 'UNKNOWN_TOOL';
    constructor(code: AgentCallError['code'], message: string);
}
/** 工具输出（返回给主 agent 的续聊凭据 + 状态摘要）。 */
export interface AgentCallOutput {
    /** 子 agent 会话 id（续聊凭据；无 agentRunId 新建后返回）。 */
    agentRunId: string;
    /** 状态摘要（新建/续聊描述）。 */
    summary: string;
}
/** 文本块（prompt 内容的最小结构面；dsh 运行时经注册壳适配为 ContentBlock）。 */
export interface TextBlock {
    type: 'text';
    text: string;
}
/** 解析出来的子 agent 启动输入（供测试与实现共用）。 */
export interface AgentCallPlan {
    /** 目标 Agent 定义（规范化后）。 */
    def: AgentDef;
    /** persona（身份）：角色名 + 行为范式（已 escapePromptBraces 防御）。 */
    persona: string;
    /** toolFilter.allow 白名单（compileAllowedTools）。 */
    allow: string[];
    /** label（持久化显示名）。 */
    label: string;
    /** prompt（任务 + 授权摘要）。 */
    prompt: TextBlock[];
}
/**
 * 子 agent 运行时网关（注册壳 tools.ts 注入 dsh 服务适配；本模块零 dsh 依赖）。
 */
export interface SubagentGateway {
    /**
     * 新建可续聊子 agent。返回 durable childId（= 续聊凭据 agentRunId）。
     * @param spec 启动规格（provider/label/request/signal）。
     */
    startContinuable(spec: {
        provider: string;
        label: string;
        request: unknown;
        signal: AbortSignal;
    }): Promise<{
        childId: string;
    }>;
    /**
     * 向已有可续聊子 agent 投递后续消息（FIFO 下一轮）。
     * @param parent  调用方 agent（授权）。
     * @param childId 子 agent 会话 id。
     * @param content 消息内容（TextBlock[]）。
     * @param options 消息来源 + 取消信号。
     */
    followup(parent: {
        id: string;
    }, childId: string, content: TextBlock[], options: {
        source: unknown;
        signal: AbortSignal;
    }): Promise<unknown>;
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
export declare function planAgentCall(def: AgentDef, task: string, manager: AgentManager): AgentCallPlan;
/** 构建 followup 的 source 字段（协调者中继；senderSessionId = 调用方 agent id）。 */
export declare function followupSource(parent: {
    id: string;
}): {
    kind: 'coordinator';
    form: 'relay';
    senderSessionId: string;
};
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
export declare function executeAgentCall(deps: {
    gateway: SubagentGateway;
    loadDefs: () => Promise<Record<string, AgentDef>>;
    manager: AgentManager;
    providerName: string;
    toolNames: () => string[];
}, args: {
    agentDefId: string;
    task: string;
    agentRunId?: string;
}, parent: {
    id: string;
} | null | undefined, signal: AbortSignal): Promise<AgentCallOutput>;
/** 校验 meow_agent_call 入参（独立可测；schema 已强校验，此处补语义校验）。 */
export declare function validateAgentCallArgs(args: {
    agentDefId?: unknown;
    task?: unknown;
    agentRunId?: unknown;
}): void;
