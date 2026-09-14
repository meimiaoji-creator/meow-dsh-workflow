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
import { resolveLanguageChainRefs, mergeChildren } from './protocols.js';
/** meow_child_agent_list 工具名（Agent 定义 allowedTools 授权项）。 */
export const CHILD_LIST_TOOL = 'meow_child_agent_list';
/** 解析调用者目录条目（roleId 未命中/无 children → 空数组）。
 *  目录口径与 buildRolePrompt 一致：children 字段 ∪ systemPrompt 语言链引用解析。 */
export function listChildAgents(defs, callerRoleId) {
    const def = defs[callerRoleId];
    if (def === undefined)
        return [];
    const merged = mergeChildren(def.children, resolveLanguageChainRefs(def.systemPrompt, defs));
    return merged
        .map(c => Object.values(defs).find(d => d.name === c.name))
        .filter((d) => d !== undefined)
        .map(d => ({
        name: d.name,
        id: d.id,
        summary: d.summary ?? '',
        childTools: [...d.allowedTools],
        grandChildren: mergeChildren(d.children, resolveLanguageChainRefs(d.systemPrompt, defs)).map(c => c.name),
    }));
}
