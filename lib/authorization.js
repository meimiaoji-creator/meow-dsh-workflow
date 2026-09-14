/**
 * meow-dsh-workflow 授权执行层 —— 主 agent 工具/MCP 裁剪 + 角色授权数据发布。
 *
 * R09 交付（用户需求：角色发起的对话——主 agent 与子 agent——对工具/技能/MCP 做真实
 * 授权裁剪，权限 = 裁剪"给模型的清单"，不做系统提示词/上下文权限白名单兜底）。
 *
 * 本模块职责：
 *   1. `applyToolRestrictions(agent, def, toolNames)`：对 agent.ctx 调 `tools.restrict({ allow })`
 *      —— 把该 agent 可见工具（含 `mcp__<server>__<tool>`）裁剪到角色授权白名单。
 *      `tools.restrict` 要求 scoped ctx（agent.ctx），作用于该 agent 的 scope，主 agent 与
 *      子 agent 通用（子 agent 另由 meow_agent_call 的 toolFilter 走 spawn provider 内部 restrict）。
 *   2. `publishRoleGrants` / `readRoleGrants`：把角色授权（allowedSkills 等）发布到 agent.ctx
 *      的**约定属性**（低耦合数据契约），供技能目录过滤（本插件）与 dsh-meow-skill
 *      （远程技能目录按授权裁剪）读取；读不到 → 降级全量（插件可独立部署）。
 *
 * 防御（用户要求）：
 *   - restrict 失败（未注册工具名 / 服务不可用）→ 降级不裁剪，不使角色发起崩；
 *   - grants 读写全部鸭子类型 + try/catch，跨插件缺失只失效关联部分；
 *   - 子 agent 的 grants 由 agent/created 监听按 label（`meow-workflow:<角色名>`）关联
 *     角色后发布，主 agent 由 build-prompt 显式发布（见 web-routes.ts）。
 */
import { compileAllowedTools } from './agent-manager.js';
/** agent.ctx 上角色授权的约定属性名（dsh-meow-skill 读取远程技能过滤用，字符串键避免跨包共享 Symbol）。 */
export const ROLE_GRANTS_PROP = 'meowRoleGrants';
/**
 * 把角色授权发布到 agent **对象本身**（约定属性）。随 agent dispose 自动消失。
 *
 * 为什么不是 agent.ctx：Cordis 的 ctx 是 Proxy，**读取未声明（未 inject）的属性会抛
 * "cannot get property X without inject"**（set 不拦截，get 拦截）。若挂到 agent.ctx，
 * provider 读取授权时会抛错 → 授权过滤失效 + list 走 catch 返回 complete:false → 目录消失。
 * 挂到 agent 对象（ReactLoopAgent 实例，普通对象）则读写都不走 Proxy，安全。
 * @param agent  目标 agent。
 * @param grants 角色授权数据。
 */
export function publishRoleGrants(agent, grants) {
    try {
        ;
        agent[ROLE_GRANTS_PROP] = grants;
    }
    catch {
        // agent 对象不可写（异常环境）→ 跳过，仅技能级裁剪失效，工具/MCP 裁剪不受影响。
    }
}
/**
 * 读取 agent 的角色授权（鸭子类型，读不到返回 undefined）。
 * @param agent 目标 agent（ReactLoopAgent 实例）。
 * @returns 规范化后的 RoleGrants；无授权/格式异常 → undefined。
 */
export function readRoleGrants(agent) {
    // 从 agent 对象本身读取（与 publishRoleGrants 落点一致；不走 agent.ctx 避免 Cordis Proxy 拦截）。
    const g = agent?.[ROLE_GRANTS_PROP];
    if (typeof g !== 'object' || g === null)
        return undefined;
    const grants = g;
    const skills = grants.allowedSkills;
    if (!Array.isArray(skills))
        return undefined;
    return {
        roleId: typeof grants.roleId === 'string' ? grants.roleId : '',
        allowedSkills: skills.filter((s) => typeof s === 'string'),
    };
}
/**
 * 对 agent 应用工具/MCP 授权裁剪（tools.restrict）。
 *
 * 编译白名单（compileAllowedTools：allowedTools 直接工具名、allowedSkills → skill 入口工具、
 * allowedMcps → `mcp__<server>__<tool>` 精确名、追加 meow_agent_call），注册到 agent scope。
 * restrict 失败（strict 模式校验到的未知工具名等）→ 降级不裁剪并返回空 disposer，
 * 保证角色发起链路不因授权失败而崩（防御优先；工具清单未裁剪 = 全量，可接受）。
 *
 * @param agent     目标 agent（scoped ctx）。
 * @param def       角色 AgentDef（授权清单来源）。
 * @param toolNames 工具名索引（compileAllowedTools 的 strict 过滤；通常 resolveVisibleToolNames）。
 * @returns disposer（解除本角色对 agent 的 restrict；会话换角色时替换）。
 */
export function applyToolRestrictions(agent, def, toolNames) {
    const allow = compileAllowedTools(def, toolNames);
    try {
        return agent.ctx.tools.restrict({ allow });
    }
    catch {
        // 未注册工具名 / 服务不可用：降级不裁剪（log 由调用方处理）。
        return () => { };
    }
}
/**
 * 发布子 agent 的角色授权（R09）：meow_agent_call 创建/续聊的子 agent 创建后，
 * 把角色授权（allowedSkills）挂到子 agent 的 ctx 约定属性，供技能目录过滤读取。
 * 子 agent 的工具/MCP 裁剪由 toolFilter（spawn provider 内部 restrict）完成，本函数只补
 * 技能级所需的 grants。
 *
 * 时序兜底（与主 agent installRoleSection 对齐）：meow_agent_call 的 startContinuable 返回
 * childId 时，子 agent 可能尚未注册进 ctx.agents 注册表（agent/created 尚未派发）——立即
 * ctx.agents.get(childId) 查不到会静默丢失 grants，导致该子 agent 的技能目录读不到授权
 * （readRoleSkillGrants 返回 undefined → 降级全量，或按其他过滤路径表现异常）。因此：
 *   1. 立即查 ctx.agents.get(childId) → 命中则直接发布；
 *   2. 未命中 → 登记一次性 `agent/created` 监听（按 agent.id === childId 匹配），
 *      子 agent 注册派发时发布 grants 后自动 detach（与 installRoleSection 同款幂等）。
 * 防御：子 agent 不可达 / ctx.on 不可用 / 角色解析失败 → 跳过（仅该子 agent 技能级裁剪
 * 降级全量，不使 meow_agent_call 抛错）。
 * @param ctx      Cordis 上下文（agents 服务 / 事件）。
 * @param defId    角色 id 或 name（与 meow_agent_call 的 agentDefId 语义一致）。
 * @param childId  子 agent 会话 id（agentRunId）。
 * @param loadDefs 角色库加载函数。
 */
export async function publishChildGrants(ctx, defId, childId, loadDefs) {
    try {
        const child = typeof ctx.agents?.get === 'function' ? ctx.agents.get(childId) : undefined;
        if (child !== undefined) {
            await applyChildGrants(child, defId, loadDefs);
            return;
        }
        // 子 agent 尚未注册 → 登记一次性 agent/created 监听（等它注册后发布，自动 detach）。
        if (typeof ctx.on !== 'function')
            return;
        const holder = { detached: false };
        const detach = ctx.on('agent/created', (event) => {
            const a = event?.agent;
            if (holder.detached || a === undefined || String(a.id) !== childId)
                return;
            holder.detached = true;
            try {
                if (typeof detach === 'function')
                    detach();
            }
            catch { /* 移除失败忽略 */ }
            void applyChildGrants(a, defId, loadDefs).catch(() => { });
        });
        // 防御：注册监听失败（事件服务不可用）→ 静默跳过。
        if (typeof detach !== 'function')
            return;
    }
    catch {
        // 防御：发布失败不使 meow_agent_call 抛错（只失效该子 agent 的技能级裁剪）。
    }
}
/** 把角色授权（allowedSkills）挂到具体子 agent 对象（角色解析失败 → 跳过）。 */
async function applyChildGrants(child, defId, loadDefs) {
    try {
        const defs = await loadDefs();
        const def = defs[defId] ?? Object.values(defs).find(d => d.name === defId);
        if (def === undefined)
            return;
        publishRoleGrants(child, { roleId: def.id, allowedSkills: def.allowedSkills });
    }
    catch {
        // 防御：发布失败不使 meow_agent_call 抛错（只失效该子 agent 的技能级裁剪）。
    }
}
