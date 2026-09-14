/**
 * 角色发起斜杠命令 —— 纯逻辑核心（零 dsh 运行时依赖，独立可测）。
 *
 * 每个 launchable 角色注册一条 dsh host 命令 `/meow-workflow-<角色id>`（如
 * `/meow-workflow-lead`），输入 `/` 在命令目录直接下拉选择角色——角色选择器即
 * 命令菜单本身，无需弹窗。命令声明 `input.attachments: true`：用户在主输入框
 * 正常粘贴文件/图片后回车，附件经 dsh 原生接纳为 ImageBlock/FileBlock 随调用
 * 交给 handler——发起动作回到主输入框原生链路（粘贴/草稿/排队全原生），插件
 * 客户端半零改动。
 *
 * 执行语义（与 build-prompt 面板路径同核）：
 *   1. 解析 goal（rawInput 全量）→ 组装 userPrompt（assemblePrompt，web-routes 纯函数）；
 *   2. 角色上下文（协议 section + tools.restrict + grants）应用到**发起会话的
 *      agent scope**（installRoleContextForAgent，web-routes 导出）；
 *   3. `agent.followup(createUserMessage({ content: [userPrompt, ...attachments] }))`
 *      把消息作为用户回合发出（与 dsh session-controller 同一原语；agent 忙时
 *      followup 排队，next-turn inbox + queue dock 原生接管）。
 *   命令行本身不进模型（dsh CommandDefinition 语义：handler 执行时**不发送**
 *   命令文本；command/run、command/done 仅日志记录）。
 *
 * 分层（沿 tools-core/tools 同款）：本模块为 core（全部 dsh 交互经 ports 注入，
 * 纯 node 可测）；`commands.ts` 为 shell（import createUserMessage / ctx.commands
 * 真实接 dsh）。易碎面：`ctx.commands.register`（dsh 公开插件面）+
 * `agent.followup/steer`（鸭子类型 + 失败降级为 error result，会话无损）。
 */
import { oneLine } from './protocols.js';
import { assemblePrompt, listLaunchableRoles } from './web-routes.js';
/** 命令名前缀（dsh 命令名规范 `/^[a-z][a-z0-9_-]*$/`，与 /api/meow-workflow 前缀同族）。 */
export const WORKFLOW_COMMAND_PREFIX = 'meow-workflow-';
/** dsh 命令名规范（interaction/commands COMMAND_NAME 同款）。 */
const COMMAND_NAME_RE = /^[a-z][a-z0-9_-]*$/u;
/**
 * 角色id → 命令名；不合规（中文/空/大写等）返回 null（该角色跳过命令注册，
 * 仍可从工作流面板发起）。
 * @param roleId 角色 id。
 */
export function roleIdToCommandName(roleId) {
    const id = roleId.trim();
    if (!COMMAND_NAME_RE.test(id))
        return null;
    return WORKFLOW_COMMAND_PREFIX + id;
}
/** 命令菜单行描述：角色显示名 + 范式一句话（oneLine 折行防菜单行破坏；已 escape）。 */
export function commandDescription(role) {
    return oneLine(`「${role.name}」${role.summary}`);
}
/** 命令参数 hint（菜单/认领后 placeholder 语义）。 */
export const COMMAND_INPUT_HINT = '<目标>（可附文件/图片）';
/** 发起成功结果文本里的 goal 截断上限（命令卡片提示文本防御性截断）。 */
const SUCCESS_GOAL_MAX = 200;
/**
 * 执行一次角色发起（`/meow-workflow-<id> <目标> + 附件`）。
 * 校验 → 组装 → 注入角色上下文 → 投递；任一步失败返回 error result
 * （命令卡片显示文本，会话不受损——附件已由 dsh 接纳，用户可重试）。
 * @param deps     依赖端口。
 * @param invocation 命令调用（agent/rawInput/attachments）。
 * @param roleId   命令映射的角色 id（注册时闭包固定）。
 * @param roleName 角色显示名（结果文本用；缺省回退 roleId）。
 */
export async function executeWorkflowLaunch(deps, invocation, roleId, roleName) {
    const goal = invocation.rawInput.trim();
    if (goal === '') {
        return {
            kind: 'error',
            text: `用法：/${WORKFLOW_COMMAND_PREFIX}${roleId} ${COMMAND_INPUT_HINT}`,
        };
    }
    const defs = await deps.loadDefs();
    const def = defs[roleId];
    if (def === undefined) {
        return { kind: 'error', text: `角色不存在: ${oneLine(roleId)}` };
    }
    const payload = assemblePrompt(defs, roleId, goal);
    if (payload === null) {
        // 防御：def 存在则 assemble 必非 null；保留兜底分支防两处实现漂移。
        return { kind: 'error', text: `角色不存在: ${oneLine(roleId)}` };
    }
    // 角色上下文（协议 section + restrict + grants）注入发起会话的 agent scope；
    // 失败不阻断发起（与 build-prompt 面板路径同语义：warn + 继续）。
    let applied = true;
    try {
        const toolNames = await deps.toolNames();
        applied = deps.applyRole(invocation.agent, def, toolNames, payload.systemPrompt);
    }
    catch (err) {
        applied = false;
        deps.log?.warn?.(`[meow-dsh-workflow] 命令发起角色上下文应用失败: ${oneLine(err.message ?? String(err))}`);
    }
    // content 与 dsh session-controller 同形：文本块在前、附件随后（已接纳块直传）。
    const content = [{ type: 'text', text: payload.userPrompt }, ...invocation.attachments];
    const delivery = deps.deliver(invocation.agent, content);
    if (!delivery.ok) {
        return { kind: 'error', text: `发起失败：${oneLine(delivery.error)}` };
    }
    const notes = [];
    if (!applied)
        notes.push('（提醒：角色协议注入失败，本次按普通消息执行）');
    const goalEcho = goal.length > SUCCESS_GOAL_MAX ? `${goal.slice(0, SUCCESS_GOAL_MAX)}…` : goal;
    return {
        kind: 'success',
        text: oneLine(`已以「${roleName ?? roleId}」身份发起：${goalEcho}${notes.join('')}`),
    };
}
/**
 * 创建命令同步器：每次 sync 先 dispose 全部旧命令，再按当前 launchable 角色
 * 重注册（agents.json 增删改后由 CRUD 路由触发重同步）。单角色失败（命令名
 * 冲突等）只跳过该角色，不影响其他角色（R08 守则 8：失败降级不整体崩）。
 * @param ports 注册端口。
 * @returns sync 函数（deps 注入发起执行依赖；返回注册/跳过清单）。
 */
export function createCommandSync(ports) {
    const active = new Map();
    return async function syncWorkflowCommands(deps) {
        // 1. 全量 dispose 旧命令集（幂等吞错——fiber 卸载后旧 disposer 可能已失效）。
        for (const dispose of active.values()) {
            try {
                dispose();
            }
            catch { /* 幂等 dispose */ }
        }
        active.clear();
        // 2. 按 launchable 角色重建（listLaunchableRoles 与 /roles、面板同源同序）。
        const defs = await deps.loadDefs();
        const roles = listLaunchableRoles(defs);
        const registered = [];
        const skipped = [];
        for (const role of roles) {
            const name = roleIdToCommandName(role.id);
            if (name === null) {
                skipped.push(role.id);
                ports.log?.warn?.(`[meow-dsh-workflow] 角色「${role.name}」(${role.id}) 不符合命令名规范，跳过 / 命令注册（仍可从面板发起）`);
                continue;
            }
            try {
                const dispose = ports.registerCommand({
                    name,
                    description: commandDescription(role),
                    input: { hint: COMMAND_INPUT_HINT, attachments: true },
                    handler: invocation => executeWorkflowLaunch(deps, invocation, role.id, role.name),
                });
                active.set(name, dispose);
                registered.push(name);
            }
            catch (err) {
                skipped.push(role.id);
                ports.log?.warn?.(`[meow-dsh-workflow] /${name} 注册失败（跳过）: ${oneLine(err.message ?? String(err))}`);
            }
        }
        return { registered, skipped };
    };
}
