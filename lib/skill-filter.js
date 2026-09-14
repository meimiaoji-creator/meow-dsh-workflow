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
import { readRoleGrants } from './authorization.js';
/** 目录描述转义（复制 dsh skill 包 escapeText，保持目录文本渲染一致）。 */
function escapeText(value) {
    return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
/** 渲染目录条目行。 */
function renderCatalogLines(entries) {
    return entries.map(e => `- \`${e.name}\`: ${escapeText(e.description)}`);
}
/** 初次目录文本（复制 tool-skill renderCatalogMessage，index.ts:254-277）。 */
function renderInitialText(entries) {
    return [
        '<system-reminder>',
        'A skill is a reusable set of task-specific instructions. The following skills are available in this session:',
        '',
        '<available_skills>',
        ...renderCatalogLines(entries),
        '</available_skills>',
        '',
        "If the user names a skill, or the task clearly matches a skill's description, call the `skill` tool with the exact skill name before taking task actions. Load all applicable skills, then follow their full instructions. This catalog contains summaries only; do not infer or follow a skill's instructions until it has been loaded.",
        'A user may also invoke a skill directly; its <skill_content> block then appears in this conversation. Follow it, and do not call the `skill` tool again for that skill.',
        '</system-reminder>',
    ].join('\n');
}
/** 替换目录文本（复制 tool-skill renderCatalogUpdate，index.ts:279-311）。 */
function renderReplacementText(entries) {
    const availability = entries.length === 0
        ? [
            'No skills are currently available through the `skill` tool. Do not use names from earlier skill catalogs.',
            'A user may still invoke a skill directly; its <skill_content> block then appears in this conversation. Follow it, and do not call the `skill` tool for it.',
        ]
        : [
            'Use only names in this replacement catalog. If the user names a listed skill, or the task clearly matches its description, call the `skill` tool with the exact name before acting.',
            'A user may also invoke a skill directly; its <skill_content> block then appears in this conversation. Follow it, and do not call the `skill` tool again for that skill.',
        ];
    return [
        '<system-reminder>',
        'The available skill catalog changed. This complete catalog replaces every earlier available-skills list in this session:',
        '',
        '<available_skills>',
        ...renderCatalogLines(entries),
        '</available_skills>',
        '',
        ...availability,
        '</system-reminder>',
    ].join('\n');
}
/**
 * 注册技能目录按角色授权过滤的监听（agent/pre-step，after 阶段）。
 * @param ctx Cordis 上下文（agent/pre-step 事件）。
 */
export function registerSkillCatalogFilter(ctx) {
    // R09 修复：`agent/pre-step` 是 scoped 事件（dispatch 到 agent scope），root ctx 的监听
    // 若不传 `{ global: true }` 会被 scope filter 排除（hook.global=false 且 root 不在 agent 的
    // scope 链上）→ 过滤从未执行。传 global 保证本监听被 dispatch；注册在插件 apply（先于
    // preset 的 tool-skill），waterfall 中作为外层，after 阶段能拿到 tool-skill 注入的目录。
    ctx.on('agent/pre-step', async ({ agent }, next) => {
        // pre-step 链路本身不 try（next 抛错正常传播）；只对"过滤"部分 try，失败降级原样返回。
        const decision = await next();
        if (decision.kind === 'reject')
            return decision;
        try {
            const grants = readRoleGrants(agent);
            // 无角色授权（普通会话）→ 原样（目录全量，现状）；空授权 → skill 工具本不可见（tool-skill
            // 不注入目录），此处兜底同样原样返回。
            if (grants === undefined || grants.allowedSkills.length === 0)
                return decision;
            const authorized = new Set(grants.allowedSkills);
            let changed = false;
            const messages = decision.messages.map((m) => {
                const source = m.source;
                if (source?.kind !== 'skill-catalog' || !Array.isArray(source.entries))
                    return m;
                const original = source.entries;
                const entries = original.filter(e => typeof e?.name === 'string' && authorized.has(e.name));
                if (entries.length === original.length)
                    return m;
                changed = true;
                return {
                    ...m,
                    source: { ...source, entries },
                    content: [{ type: 'text', text: source.update === true
                                ? renderReplacementText(entries)
                                : renderInitialText(entries) }],
                };
            });
            return changed ? { ...decision, messages: messages } : decision;
        }
        catch {
            // 防御：过滤失败（目录格式随 dsh 升级变化等）→ 原样返回，降级全量，不破坏 pre-step 链路。
            return decision;
        }
        // global: true —— 关键！scoped 事件的 root 监听必须显式 global 才会被 dispatch。
    }, { global: true });
}
