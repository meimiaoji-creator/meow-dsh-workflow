/**
 * meow_agent_save 工具注册壳 —— 保存/新增/更新 Agent 定义（dsh 接入层）。
 *
 * 类比技能提炼（skill-remote-refinement）的 addPendingSkill MCP 工具：
 *   addPendingSkill 把提炼的技能提交到远程技能库；meow_agent_save 把提炼的
 *   Agent 定义保存到**本地** agents.json（新增或更新）。
 *
 * 本文件只做「定义 + 注册」（defineTool 值导入，dsh 运行时经 host/profiles 解析）；
 * 真实执行逻辑在 agent-save-core.ts（executeAgentSave，零 dsh 依赖、独立可测）。
 *
 * 授权边界：工具全局注册（模型可见 schema），但**是否可调用由各 Agent 的
 * allowedTools 白名单决定**（compileAllowedTools → toolFilter.allow 硬裁剪）。
 * 默认预置角色中只有「agent提炼优化」的 allowedTools 含 meow_agent_save，
 * 即该保存工具**初始只授权给 agent提炼优化**。
 */
import type { Context } from '@deepseek-ai/cordis';
import type { AgentDef } from './schema.js';
/** 注册壳入参 → 执行核心的 loadDefs（默认种入预置角色）。 */
type LoadDefs = () => Promise<Record<string, AgentDef>>;
/**
 * 注册 meow_agent_save 工具。
 * @param ctx      Cordis 上下文（tools 服务）。
 * @param loadDefs 存储加载函数（缺省 ensurePresetAgents：与 web route 共用兜底，
 *                 agents.json 缺失时种入预置角色，杜绝保存读空库/读缺键）。
 */
export declare function registerAgentSaveTool(ctx: Context, loadDefs?: LoadDefs): void;
export {};
