/**
 * meow_child_agent_list 工具核心逻辑 —— 调用者自己的子 agent 目录（零 dsh 依赖）。
 *
 * 与 meow_agent_list 的分工（不弄混）：
 *   - meow_agent_list：全量角色库完整定义（含 systemPrompt），只授权 agent提炼优化；
 *   - meow_child_agent_list：**调用者自己的 children 子集**，极简输出（名字/一句话/工具面/
 *     下级名单），授权给所有父级角色（children 非空者）——派发前看能力、选对人。
 *
 * 输出里的 childTools 是**子 agent 被授权的工具（属于子 agent，不是调用者的）**。
 */
import type { AgentDef } from './schema.js';
/** meow_child_agent_list 工具名（Agent 定义 allowedTools 授权项）。 */
export declare const CHILD_LIST_TOOL = "meow_child_agent_list";
/** 子 agent 能力条目（极简：不含 systemPrompt）。 */
export interface ChildListEntry {
    /** 角色名（meow_agent_call 的 agentDefId 可直接用 name 或 id）。 */
    name: string;
    /** agents.json 键。 */
    id: string;
    /** 职责一句话。 */
    summary: string;
    /** 子 agent 被授权的工具面（属于子 agent，不是调用者的）。 */
    childTools: string[];
    /** 该子 agent 自己可下辖的下级角色名（一层）。 */
    grandChildren: string[];
}
/** 解析调用者目录条目（roleId 未命中/无 children → 空数组）。
 *  目录口径与 buildRolePrompt 一致：children 字段 ∪ systemPrompt 语言链引用解析。 */
export declare function listChildAgents(defs: Record<string, AgentDef>, callerRoleId: string): ChildListEntry[];
