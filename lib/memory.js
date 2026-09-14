/**
 * meow_memory_write / meow_memory_read 工具注册壳（dsh 接入层）。
 *
 * 调用者身份自动解析（尽量让模型不用手填）：
 *   - 角色：RoleGrants（主 agent build-prompt 发布 / 子 agent meow_agent_call 发布）；
 *     显式传 role 可覆盖（父级记"孩子 runId"时用）。
 *   - agentRunId：缺省 = 调用者自己的会话 id（子 agent 即自己的 runId）；显式传参覆盖。
 *   - project：缺省鸭子探测会话 cwd（agent.cwd / agent.session.header.cwd）；探测不到
 *     用显式传参；再不行 'shared'。
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
import { escapePromptBraces } from './protocols.js';
import { readRoleGrants } from './authorization.js';
import { probeCwd } from './storage.js';
import { ensurePresetAgents } from './presets.js';
import { MEMORY_WRITE_TOOL, MEMORY_READ_TOOL, appendMemory, readMemory, sanitizeKey, } from './memory-core.js';
// probeCwd 共享实现迁至 storage.ts（与 ledger 同款探测）。
function callerRoleId(agent) {
    const g = readRoleGrants(agent);
    return g?.roleId ?? '';
}
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
/** 解析调用者角色键：RoleGrants.roleId → label 探测（角色名→id）→ 'shared'。 */
async function resolveCallerRoleKey(agent) {
    const direct = callerRoleId(agent);
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
        catch { /* 角色库不可用 → 落 shared */ }
    }
    return 'shared';
}
/** 注册 meow_memory_write + meow_memory_read（所有角色默认授权，见 agents.json）。 */
export function registerMemoryTools(ctx) {
    ctx.tools.register(defineTool({
        name: MEMORY_WRITE_TOOL,
        description: '记一条**你的角色记忆**（按 项目目录×角色 绑定，跨会话留存；项目由当前工作目录自动区分，无需指定）。'
            + '阶段性完成/关键决策/卡点/接盘要点时记一条；默认自动带上你的角色与本人 agentRunId。'
            + '给**你的子 agent** 记录 runId 归属时：传 role=子角色名 + agentRunId=它的 runId。'
            + '后续任何人凭记忆里的 runId 用 meow_agent_call 即可续聊原实例。',
        parameters: {
            title: { type: 'string', required: true, description: '一句话标题（干了什么/关键决策/卡点）' },
            content: { type: 'string', required: true, description: '要点正文（关键文件/决策/结论/剩余活，≤10 行）' },
            kind: { type: 'string', description: '可选：类型（progress=阶段进度 / decision=决策 / pitfall=坑 / takeover=接盘要点）' },
            role: { type: 'string', description: '可选：归属角色（缺省=你自己的角色；给子 agent 记 runId 时传它的角色名）' },
            agentRunId: { type: 'string', description: '可选：归属实例（缺省=你自己；给子 agent 记录时传它的 agentRunId）' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    project: { type: 'string', required: true, description: '落盘项目键' },
                    role: { type: 'string', required: true, description: '落盘角色键' },
                    ts: { type: 'string', required: true, description: '写入时间' },
                },
            },
            render: (args, value) => [{
                    type: 'text',
                    text: `meow_memory_write: 已记入 ${value.project}/${value.role}`,
                }],
        },
        isConcurrencySafe: () => true,
        async execute(args, exec) {
            const role = args.role !== undefined && String(args.role).trim() !== ''
                ? String(args.role).trim()
                : await resolveCallerRoleKey(exec?.agent);
            const runId = args.agentRunId !== undefined && String(args.agentRunId).trim() !== ''
                ? String(args.agentRunId).trim()
                : (typeof exec?.agent?.id === 'string'
                    ? exec.agent.id
                    : undefined);
            const project = probeCwd(exec?.agent) ?? 'shared';
            const entry = await appendMemory(undefined, project, role, {
                kind: args.kind !== undefined ? String(args.kind) : undefined,
                title: String(args.title ?? ''),
                content: String(args.content ?? ''),
                ...(runId !== undefined ? { agentRunId: runId } : {}),
            });
            return { project: sanitizeKey(project), role: sanitizeKey(role), ts: entry.ts };
        },
    }));
    ctx.tools.register(defineTool({
        name: MEMORY_READ_TOOL,
        description: '读**你的角色记忆**（本项目目录下，跨会话留存；项目由当前工作目录自动区分，无需指定）。'
            + '开工/接盘前先读，恢复"我之前干了啥"；'
            + 'scope=project 可跨角色检索本项目全部记忆（找"这事是谁做的、runId 是多少"，凭 runId 用 '
            + 'meow_agent_call 续聊原实例）。最新在前。',
        parameters: {
            scope: { type: 'string', description: "可选：self=只看自己的角色（缺省）/ project=本项目全部角色" },
            role: { type: 'string', description: '可选：指定角色键（scope=self 时覆盖自己的角色）' },
            q: { type: 'string', description: '可选：关键词（命中标题/正文）' },
            limit: { type: 'number', description: '可选：条数上限（缺省 20）' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    count: { type: 'number', required: true, description: '返回条数' },
                    text: { type: 'string', required: true, description: '记忆明细文本' },
                },
            },
            render: (args, value) => [{ type: 'text', text: value.text }],
        },
        isConcurrencySafe: () => true,
        async execute(args, exec) {
            const project = probeCwd(exec?.agent) ?? 'shared';
            const scope = String(args.scope ?? 'self') === 'project' ? 'project' : 'self';
            const roleKey = args.role !== undefined && String(args.role).trim() !== ''
                ? String(args.role).trim()
                : await resolveCallerRoleKey(exec?.agent);
            const out = await readMemory(undefined, project, {
                scope,
                roleKey,
                q: args.q !== undefined ? String(args.q) : undefined,
                limit: args.limit !== undefined ? Number(args.limit) : undefined,
            });
            if (out.entries.length === 0) {
                return { count: 0, text: `meow_memory_read: 无记忆（${sanitizeKey(project)}/${out.roleKey}）` };
            }
            const lines = out.entries.map((e, i) => {
                const runId = e.agentRunId !== undefined ? `｜runId=${e.agentRunId}` : '';
                const roleTag = e.role !== undefined ? `｜by=${escapePromptBraces(e.role)}` : '';
                const kind = e.kind !== undefined ? `[${e.kind}] ` : '';
                return `#${i + 1} ${e.ts.slice(0, 16)} ${kind}${escapePromptBraces(e.title)}${roleTag}${runId}\n${escapePromptBraces(e.content)}`;
            });
            return { count: out.entries.length, text: `meow_memory_read: ${out.entries.length} 条\n${lines.join('\n\n')}` };
        },
    }));
}
