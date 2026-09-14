/**
 * meow_agent_list / meow_agent_get 工具核心逻辑 —— 查询 Agent 定义（零 dsh 依赖，独立可测）。
 *
 * 类比技能提炼（skill-remote-refinement）模式 A 的读取步骤：
 *   - listSkills 确认技能存在 + 看有哪些 → meow_agent_list（列出全部 agent 概要）；
 *   - runSkill / getSkillReference 获取技能当前内容 → meow_agent_get（按 id 取完整定义）。
 *
 * 「agent提炼优化」要先看到目标 agent 原来的样子（systemPrompt/授权/子目录），
 * 才能对比分析出要更新什么 —— 这两个查询工具是模式 A（迭代已有 agent）的前提。
 *
 * 本模块只依赖 storage + agents-crud（全部零 dsh 值依赖），
 * 运行时经注册壳 agent-query.ts 注入 loadDefs（默认 ensurePresetAgents）。
 */
import { presentAgent } from './agents-crud.js';
/** meow_agent_list 工具名（Agent 定义 allowedTools 授权项）。 */
export const AGENT_LIST_TOOL = 'meow_agent_list';
/** meow_agent_get 工具名（Agent 定义 allowedTools 授权项）。 */
export const AGENT_GET_TOOL = 'meow_agent_get';
/**
 * 列出全部 Agent 定义概要（presentAgent 形态，已 escape），供提炼/迭代时了解全貌。
 * @param deps 依赖（loadDefs 注入）。
 * @returns AgentListItem[]（含 launchable=false；顺序 = defs 枚举顺序）。
 */
export async function listAgents(deps) {
    const defs = await deps.loadDefs();
    return Object.values(defs).map(def => presentAgent(def));
}
/**
 * 按 id 获取单个 Agent 定义完整内容（presentAgent 形态，已 escape）。
 * @param deps 依赖（loadDefs 注入）。
 * @param id   目标 Agent id。
 * @returns AgentListItem；id 不存在返回 undefined。
 */
export async function getAgent(deps, id) {
    const defs = await deps.loadDefs();
    const def = defs[id];
    return def === undefined ? undefined : presentAgent(def);
}
