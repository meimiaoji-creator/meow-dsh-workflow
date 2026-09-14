/**
 * meow-dsh-workflow 技能目录按角色授权过滤（R09 交付）。
 *
 * 目标：角色发起的对话（主 agent 与子 agent）提供的技能目录（available_skills）只含
 * 角色授权的技能。tool-skill（dsh 官方）在 agent pre-step 注入全量目录（该 agent scope
 * 视角的 modelInvocable 技能，**本地 + 远程都在同一条目录消息里**）；本模块在
 * agent/pre-step 的 after 阶段，按 agent.ctx 上的角色授权（readRoleGrants）过滤目录消息的
 * entries 并重建目录文本——**本地与远程技能目录因此统一只展示授权技能**。
 *
 * 说明：dsh 官方 skill 注册表不把 agent（scope）传给 provider.list，远程技能 provider
 * （dsh-meow-skill）拿不到按 agent 过滤的接缝；但目录层拦截是**统一生效**的（本地+远程
 * 都在 tool-skill 注入的目录里），故远程技能目录无需改 dsh-meow-skill 即可被本模块过滤，
 * 两个插件保持独立部署（meow-dsh-workflow 缺失 → 无角色机制；dsh-meow-skill 缺失 →
 * 无远程技能）。技能加载（skill 工具）按目录名调用，目录已过滤 → 模型只能调用授权技能。
 *
 * 防御（用户要求：插件可独立部署、缺件只失效关联部分）：
 *   - agent 无角色授权（普通会话 / grants 未发布 / 读不到）→ 原样返回，目录全量（现状）；
 *   - 授权技能为空 → 原样返回（compileAllowedTools 不会授予 skill 工具 → tool-skill 不注入目录，
 *     无目录可过滤；此处兜底防御）；
 *   - 目录消息结构变化（dsh 升级改了 tool-skill 的 source/文本格式）→ 解析失败则原样返回
 *     （降级全量，不崩）；
 *   - 监听回调异常 → 捕获后返回原决策（不破坏 agent pre-step 链路）。
 *
 * ⚠️ 目录文本格式（renderCatalogText）复制自 dsh `tool-skill` 的 renderCatalogMessage /
 *    renderCatalogUpdate（packages/skill/tool-skill/src/index.ts:254-311），**dsh 官方升级
 *    若改动格式需同步检查**（测试已锁定当前格式的关键行）。
 */
import type { Context } from '@deepseek-ai/cordis';
/**
 * 注册技能目录按角色授权过滤的监听（agent/pre-step，after 阶段）。
 * @param ctx Cordis 上下文（agent/pre-step 事件）。
 */
export declare function registerSkillCatalogFilter(ctx: Context): void;
