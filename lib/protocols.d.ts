/**
 * meow-dsh-workflow 协议层工具函数 —— prompt 防御机制 + 角色协议组装（T-06）。
 *
 * 两部分：
 *   1. R01-08 交付（docs/agent-chain-design.md 附录 A）：任何会拼进 prompt 的字段
 *      （persona/systemPrompt/任务标题/issue title/handoff 等）必须先经本模块防御处理，
 *      杜绝字面 ASCII 双花括号占位符进入 dsh 的 prompt 装配链路（dsh 会对 section 文本
 *      里的双花括号做严格插值，未注册/格式不符即抛错并中止整轮）。
 *   2. T-06 交付（design §7）：角色协议系统提示词组装（buildRolePrompt）+ 语言链引用
 *      解析（resolveLanguageChainRefs）+ 用户提示词拼接（buildUserPrompt）。
 *
 * 本模块纯函数、零 dsh 依赖，独立可测。实现参照 meow-dsh-task/src/protocols.ts 的
 * sanitizeForPrompt / oneLine（家族共享防御机制）。
 */
import type { AgentChild, AgentDef } from './schema.js';
/**
 * 花括号中性化：把所有 ASCII 双花括号整段替成全角花括号，彻底脱离 ASCII 变量语法。
 * 即：字面开双花括号 → 全角开双花括号，字面闭双花括号 → 全角闭双花括号，单花括号不受影响。
 * @param value 原始文本（可为空串）。
 * @returns 中性化后的文本；无 ASCII 双花括号时原样返回。
 */
export declare function escapePromptBraces(value: string): string;
/**
 * 单行化：内部先 escapePromptBraces 中性化，再把多行内容折叠为单行（trim）。
 * 供 markdown 表格单元格 / 单行摘要等场景使用。
 * @param value 原始文本（可为空串）。
 * @returns 中性化 + 折叠后的单行文本。
 */
export declare function oneLine(value: string): string;
/**
 * 角色协议 section 的 order（design §7.1：工具指导 100–199 区间内、persona 之后）。
 * T-08 web route 注入 ctx.systemPrompt.section 时使用。
 */
export declare const ROLE_PROTOCOL_ORDER = 120;
/**
 * 从文本中解析全部语言链引用为子 agent 目录条目。
 * 每个 `<语言链引用:agent:角色名>` 在 defs 里按 name 匹配 AgentDef，
 * 命中 → 目录条目 { name, description（该 def 系统提示词首句） }；
 * 未命中 / 重复 → 跳过（不产生无效目录，幂等）。
 * @param text 含引用的文本（通常为 AgentDef.systemPrompt）。
 * @param defs Agent 定义库（Record<id, AgentDef>，按 name 匹配）。
 * @returns 目录条目数组（保序、按 name 去重）。
 */
export declare function resolveLanguageChainRefs(text: string, defs: Record<string, AgentDef>): AgentChild[];
/** 取系统提示词首句（oneLine 后按中文句读切分），作为目录条目的职责一句话。 */
export declare function summarizePrompt(text: string): string;
/**
 * 合并两份子 agent 目录（按 name 去重，base 优先）。
 * 调用方用它把 AgentDef.children 与 resolveLanguageChainRefs 解析出的引用目录合并，
 * 得到 buildRolePrompt 的最终目录。
 * @param base 基础目录（AgentDef.children）。
 * @param extra 追加目录（语言链引用解析结果）。
 * @returns 合并后的目录（保序、按 name 去重）。
 */
export declare function mergeChildren(base: readonly AgentChild[], extra: readonly AgentChild[]): AgentChild[];
/**
 * 组装角色协议系统提示词（design §7.1，作为 systemPrompt section text 注入）。
 * 输出单段 `[meow-workflow · 角色协议]`（身份+范式+子 agent 目录+调度规则）。
 *
 * R08/R09 变更：**不再输出权限白名单声明**——授权由工具清单裁剪（tools.restrict 对主/子
 * agent 生效）与技能目录过滤保证，模型拿到的清单本身就是授权的，无需提示词软约束兜底。
 * 所有外部字段（def.name / def.systemPrompt / children 名与描述）均经
 * escapePromptBraces / oneLine 防御（红线 8：杜绝字面 ASCII 双花括号进入 dsh 插值链路）。
 * @param def              规范化后的 Agent 定义（本角色）。
 * @param resolvedChildren 最终子 agent 目录（调用方合并 def.children 与语言链引用）。
 * @returns 系统提示词文本（多行）。
 */
export declare function buildRolePrompt(def: AgentDef, resolvedChildren: readonly AgentChild[]): string;
/**
 * 拼接用户提示词（design §7.2，发起时由 UI 组装进用户消息发送）。
 * 格式：工作流上下文（角色名）+ 目标 + 用户输入原文。
 * goal 经 oneLine（先 escape 再折叠空白）；def.name 经 escapePromptBraces。
 * @param def  Agent 定义（发起角色）。
 * @param goal 用户目标文本（必填非空由调用方保证）。
 * @returns 用户提示词文本（多行）。
 */
export declare function buildUserPrompt(def: AgentDef, goal: string): string;
