/**
 * meow_agent_list / meow_agent_get 工具注册壳 —— 查询 Agent 定义（dsh 接入层）。
 *
 * 类比技能提炼（skill-remote-refinement）模式 A 的读取步骤：
 *   - meow_agent_list → 列出全部 agent 概要（对应 listSkills：确认存在/看全貌）；
 *   - meow_agent_get   → 按 id 取完整定义（对应 runSkill/getSkillReference：拿当前内容）。
 *
 * 本文件只做「定义 + 注册」（defineTool 值导入）；真实执行逻辑在
 * agent-query-core.ts（listAgents/getAgent，零 dsh 依赖、独立可测）。
 *
 * 授权边界：工具全局注册（模型可见 schema），但是否可调用由各 Agent 的
 * allowedTools 白名单决定（compileAllowedTools → toolFilter.allow 硬裁剪）。
 * 默认预置角色中只有「agent提炼优化」的 allowedTools 含这两个查询工具，
 * 即查询工具**初始只授权给 agent提炼优化**（与 meow_agent_save 同边界）。
 */
import type { Context } from '@deepseek-ai/cordis';
import type { AgentDef } from './schema.js';
/** 注册壳入参 → 执行核心的 loadDefs（默认种入预置角色）。 */
type LoadDefs = () => Promise<Record<string, AgentDef>>;
/**
 * 注册 meow_agent_list + meow_agent_get 两个查询工具。
 * @param ctx      Cordis 上下文（tools 服务）。
 * @param loadDefs 存储加载函数（缺省 ensurePresetAgents）。
 */
export declare function registerAgentQueryTool(ctx: Context, loadDefs?: LoadDefs): void;
export {};
