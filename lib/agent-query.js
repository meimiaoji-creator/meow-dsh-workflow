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
import { defineTool } from '@deepseek-ai/dsh-tools';
import { ensurePresetAgents } from './presets.js';
import { listAgents, getAgent, AGENT_LIST_TOOL, AGENT_GET_TOOL, } from './agent-query-core.js';
function toSummary(item) {
    return { id: item.id, name: item.name, summary: item.summary, systemPrompt: item.systemPrompt };
}
/** 从 systemPrompt 取首句（供列表行展示，让模型能分辨同名/近名角色）。 */
function promptHead(text) {
    const t = text.trim();
    const idx = t.search(/[。！？\n]/);
    return idx === -1 ? t : t.slice(0, idx + 1);
}
/** 渲染 get 的完整 Agent 定义（让模型看到 systemPrompt 全文 + 授权 + 子目录，不乱改）。 */
function renderAgentDetail(id, a) {
    const lines = [];
    lines.push(`meow_agent_get(${id}) —— ${a.name}${a.launchable ? '（可发起）' : '（子角色）'}`);
    if (a.summary !== undefined && a.summary.trim() !== '')
        lines.push(`summary: ${a.summary}`);
    lines.push(`systemPrompt:`);
    lines.push(a.systemPrompt);
    lines.push(`allowedSkills: ${a.allowedSkills.length === 0 ? '（无）' : a.allowedSkills.join(', ')}`);
    lines.push(`allowedMcps: ${a.allowedMcps.length === 0 ? '（无）' : a.allowedMcps.join(', ')}`);
    lines.push(`allowedTools: ${a.allowedTools.length === 0 ? '（无）' : a.allowedTools.join(', ')}`);
    // R10 模型选择：模型路由（缺省继承父 agent，不显示行）
    if (a.model !== undefined || a.provider !== undefined) {
        lines.push(`model: ${a.provider !== undefined ? `${a.provider}/` : ''}${a.model ?? ''}（指定模型路由）`);
    }
    if (a.children.length > 0) {
        lines.push(`children: ${a.children.map(c => `${c.name}（${c.description || '无描述'}）`).join('; ')}`);
    }
    return lines.join('\n');
}
function toDetail(item) {
    return {
        id: item.id,
        name: item.name,
        systemPrompt: item.systemPrompt,
        ...(item.summary !== undefined ? { summary: item.summary } : {}),
        allowedTools: item.allowedTools,
        allowedSkills: item.allowedSkills,
        allowedMcps: item.allowedMcps,
        ...(item.model !== undefined ? { model: item.model } : {}),
        ...(item.provider !== undefined ? { provider: item.provider } : {}),
        launchable: item.launchable,
        children: item.children,
    };
}
/**
 * 注册 meow_agent_list + meow_agent_get 两个查询工具。
 * @param ctx      Cordis 上下文（tools 服务）。
 * @param loadDefs 存储加载函数（缺省 ensurePresetAgents）。
 */
export function registerAgentQueryTool(ctx, loadDefs = () => ensurePresetAgents()) {
    const deps = { loadDefs };
    // meow_agent_list：列出全部 agent 概要（含 name + systemPrompt 首句，供模型区分目标）
    ctx.tools.register(defineTool({
        name: AGENT_LIST_TOOL,
        description: '列出全部 Agent 定义概要：每个 agent 的 id/name/summary/systemPrompt 首句。'
            + '类比技能提炼的 listSkills——先看有哪些 agent、确认目标存在，再决定迭代哪个或新增哪个。'
            + '注意：用 systemPrompt 首句区分同名/近名角色（如「研发负责人」vs「研发工程师」），'
            + '选中目标后用 meow_agent_get 取完整定义再迭代。',
        parameters: {},
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    agents: {
                        type: 'array',
                        required: true,
                        description: '全部 Agent 概要列表',
                        items: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                id: { type: 'string', required: true },
                                name: { type: 'string', required: true },
                                summary: { type: 'string' },
                                systemPrompt: { type: 'string', required: true },
                            },
                        },
                    },
                },
            },
            render: (_args, value) => [{
                    type: 'text',
                    text: 'meow_agent_list（全部 ' + value.agents.length + ' 个 agent）:\n'
                        + value.agents.map(a => {
                            const head = promptHead(a.systemPrompt);
                            const summ = a.summary !== undefined && a.summary.trim() !== '' ? a.summary : head;
                            return `- ${a.id}（${a.name}）: ${summ}`;
                        }).join('\n'),
                }],
        },
        isConcurrencySafe: () => true,
        async execute() {
            const items = await listAgents(deps);
            return { agents: items.map(toSummary) };
        },
    }));
    // meow_agent_get：按 id 取完整定义
    ctx.tools.register(defineTool({
        name: AGENT_GET_TOOL,
        description: '按 id 获取一个 Agent 定义的完整内容（systemPrompt/授权/子目录/可发起标记）。'
            + '类比技能提炼的 runSkill/getSkillReference——迭代已有 agent 前先看它原来长什么样，'
            + '才能对比分析出要更新什么。',
        parameters: {
            id: { type: 'string', required: true, description: '目标 Agent id（如 lead、engineer、agent-refiner）' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    found: { type: 'boolean', required: true, description: 'id 是否存在' },
                    agent: {
                        type: 'object',
                        additionalProperties: false,
                        description: 'Agent 定义（found=true 时存在；含 systemPrompt/allowedTools/children/launchable 等）',
                        properties: {
                            id: { type: 'string', required: true },
                            name: { type: 'string', required: true },
                            systemPrompt: { type: 'string', required: true },
                            summary: { type: 'string' },
                            allowedTools: { type: 'array', items: { type: 'string' } },
                            allowedSkills: { type: 'array', items: { type: 'string' } },
                            allowedMcps: { type: 'array', items: { type: 'string' } },
                            model: { type: 'string', description: 'R10：指定模型（缺省继承父 agent）' },
                            provider: { type: 'string', description: 'R10：模型提供方路由键（缺省继承父 agent）' },
                            launchable: { type: 'boolean' },
                            children: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    additionalProperties: false,
                                    properties: {
                                        name: { type: 'string' },
                                        description: { type: 'string' },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            render: (args, value) => [{
                    type: 'text',
                    text: value.found
                        ? renderAgentDetail(args.id, value.agent)
                        : `meow_agent_get(${args.id}): 未找到`,
                }],
        },
        isConcurrencySafe: () => true,
        async execute(args) {
            const id = String(args.id ?? '').trim();
            if (id === '')
                return { found: false };
            const item = await getAgent(deps, id);
            return item === undefined ? { found: false } : { found: true, agent: toDetail(item) };
        },
    }));
}
