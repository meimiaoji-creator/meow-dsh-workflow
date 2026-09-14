/**
 * meow_child_agent_list 工具注册壳（dsh 接入层）。
 *
 * 调用者身份解析：meow-workflow 主 agent（build-prompt）与子 agent（meow_agent_call）
 * 都会把 RoleGrants 发布到 agent 对象（authorization.publishRoleGrants），从中取 roleId
 * 定位自己的 children；识别不了 → 返回空目录并提示（不猜、不返回全量）。
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
import { ensurePresetAgents } from './presets.js';
import { readRoleGrants } from './authorization.js';
import { CHILD_LIST_TOOL, listChildAgents } from './child-list-core.js';
/** 鸭子探测 meow_agent_call 的 label（meow-workflow:<角色名>）——RoleGrants 未及发布时的 race 兜底。 */
function probeRoleName(agent) {
    const a = agent;
    for (const c of [a?.label, a?.session?.label, a?.session?.header?.label]) {
        if (typeof c === 'string' && c.startsWith('meow-workflow:')) {
            const name = c.slice('meow-workflow:'.length).trim();
            if (name !== '')
                return name;
        }
    }
    return undefined;
}
/** 解析调用者 roleId：RoleGrants → label 探测（角色名→id）→ ''。 */
async function resolveCallerRoleId(agent) {
    const direct = readRoleGrants(agent)?.roleId ?? '';
    if (direct !== '')
        return direct;
    const name = probeRoleName(agent);
    if (name !== undefined) {
        try {
            const defs = await ensurePresetAgents();
            const def = defs[name] ?? Object.values(defs).find(d => d.name === name);
            if (def !== undefined)
                return def.id;
        }
        catch { /* 角色库不可用 → 空 */ }
    }
    return '';
}
/** 注册 meow_child_agent_list 工具。 */
export function registerChildListTool(ctx) {
    ctx.tools.register(defineTool({
        name: CHILD_LIST_TOOL,
        description: '查看**你自己的**子 agent 目录（只含你的 children，极简）。派发前先查：'
            + '看每个子 agent 的职责与工具面（childTools），选对角色再 meow_agent_call。'
            + '注意：childTools 是子 agent 被授权的工具，属于子 agent、不是你的——'
            + '你自己的可用工具以你的授权为准。角色无 children 时返回空。',
        parameters: {},
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    count: { type: 'number', required: true, description: '子 agent 数量' },
                    text: { type: 'string', required: true, description: '目录文本（每行：名字｜职责｜工具面｜下级）' },
                },
            },
            render: (args, value) => [{ type: 'text', text: value.text }],
        },
        isConcurrencySafe: () => true,
        async execute(_args, exec) {
            const defs = await ensurePresetAgents();
            const roleId = await resolveCallerRoleId(exec?.agent);
            const entries = listChildAgents(defs, roleId);
            if (roleId === '') {
                return { count: 0, text: 'meow_child_agent_list: 无法识别你的角色（无角色授权记录），目录为空' };
            }
            if (entries.length === 0) {
                return { count: 0, text: `meow_child_agent_list: 你没有可调度的子 agent（目录为空）` };
            }
            const lines = entries.map(e => {
                const tools = e.childTools.length > 0 ? e.childTools.join('/') : '无';
                const sub = e.grandChildren.length > 0 ? `｜下级:${e.grandChildren.join('/')}` : '';
                return `${e.name}（id=${e.id}）｜${e.summary}｜工具面(子agent的):${tools}${sub}`;
            });
            return {
                count: entries.length,
                text: `meow_child_agent_list: ${entries.length} 个子 agent\n${lines.join('\n')}`,
            };
        },
    }));
}
