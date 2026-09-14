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
import { defineTool } from '@deepseek-ai/dsh-tools';
import { ensurePresetAgents } from './presets.js';
import { executeAgentSave, AGENT_SAVE_TOOL } from './agent-save-core.js';
/**
 * 注册 meow_agent_save 工具。
 * @param ctx      Cordis 上下文（tools 服务）。
 * @param loadDefs 存储加载函数（缺省 ensurePresetAgents：与 web route 共用兜底，
 *                 agents.json 缺失时种入预置角色，杜绝保存读空库/读缺键）。
 */
export function registerAgentSaveTool(ctx, loadDefs = () => ensurePresetAgents()) {
    ctx.tools.register(defineTool({
        name: AGENT_SAVE_TOOL,
        description: '保存一个 Agent 定义（新增或更新本地 agents.json）：id 已存在则覆盖更新，'
            + '不存在则新建。类比技能提炼的 addPendingSkill——提交提炼出的 Agent 定义供复用。'
            + '入参为 Agent 定义全字段（id/name/systemPrompt 必填，授权/子目录/可发起等可选）。',
        parameters: {
            id: {
                type: 'string',
                required: true,
                description: 'Agent 定义 id（agents.json 键，唯一标识；如 engineer、reviewer、agent-refiner）',
            },
            name: { type: 'string', required: true, description: '角色名（如 研发工程师 / 评审专家 / agent提炼优化）' },
            systemPrompt: {
                type: 'string',
                required: true,
                description: '身份定位 + 行为范式（可含 <语言链引用:agent:角色名> 语言链引用）',
            },
            summary: { type: 'string', description: '可选：范式一句话（人话，UI 角色列表展示）' },
            allowedSkills: {
                type: 'array', items: { type: 'string' },
                description: '可选：授权技能名列表（缺省 []）。**本地与远程技能都放这里**——'
                    + '远程技能（如 mermaid-diagram、skill-remote-refinement 等经 dsh-meow-skill 发布到'
                    + '技能目录的技能）按技能名授权，与本地技能一致。放这里会让该 agent 的技能目录'
                    + '只出现这些技能（经 skill 工具加载）。',
            },
            allowedMcps: {
                type: 'array', items: { type: 'string' },
                description: '可选：授权 MCP 服务器名列表（缺省 []）。用于给真正的 MCP 服务器工具授权'
                    + '（运行时展开为 mcp__<server>__<tool>）。**注意：远程技能不在这里授权**——'
                    + '技能（含远程技能）统一放 allowedSkills。',
            },
            allowedTools: {
                type: 'array', items: { type: 'string' },
                description: '可选：授权系统工具名列表（缺省 []；如 read/edit/write/glob/grep/pwsh）',
            },
            model: { type: 'string', description: '可选：指定模型（创建子 agent 时覆盖其 agentOptions.model；缺省继承父 agent 模型）' },
            provider: { type: 'string', description: '可选：模型提供方路由键（多 provider 部署下与 model 配对实现跨厂商路由；缺省继承父 agent 的 provider）' },
            children: {
                type: 'array',
                description: '可选：可调用的子 agent 目录（[{name, description}]）',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        name: { type: 'string', required: true, description: '子 agent 名字（对应另一 AgentDef 的 name）' },
                        description: { type: 'string', description: '职责一句话' },
                    },
                },
            },
            launchable: { type: 'boolean', description: '可选：是否可作为发起角色出现在 UI 选择面板（缺省 false）' },
            compileOptions: {
                type: 'object',
                additionalProperties: false,
                description: '可选：授权编译选项（{ strict: boolean }）',
                properties: { strict: { type: 'boolean' } },
            },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    status: { type: 'string', required: true, description: 'created=新增 / updated=更新' },
                    id: { type: 'string', required: true, description: '保存的 Agent id' },
                    name: { type: 'string', required: true, description: '保存的 Agent 角色名' },
                    summary: { type: 'string', description: '保存的 Agent 范式一句话' },
                },
            },
            render: (args, value) => [{
                    type: 'text',
                    text: `meow_agent_save(${value.id}): ${value.status} — ${value.name}`,
                }],
        },
        isConcurrencySafe: () => true,
        async execute(args) {
            const input = {
                id: String(args.id ?? ''),
                name: String(args.name ?? ''),
                systemPrompt: String(args.systemPrompt ?? ''),
                ...(args.summary !== undefined ? { summary: String(args.summary) } : {}),
                ...(Array.isArray(args.allowedSkills) ? { allowedSkills: args.allowedSkills.map(String) } : {}),
                ...(Array.isArray(args.allowedMcps) ? { allowedMcps: args.allowedMcps.map(String) } : {}),
                ...(Array.isArray(args.allowedTools) ? { allowedTools: args.allowedTools.map(String) } : {}),
                ...(args.model !== undefined ? { model: String(args.model) } : {}),
                ...(args.provider !== undefined ? { provider: String(args.provider) } : {}),
                ...(Array.isArray(args.children)
                    ? { children: args.children.map(c => ({
                            name: String(c.name ?? ''),
                            description: c.description !== undefined ? String(c.description) : '',
                        })) }
                    : {}),
                ...(args.launchable !== undefined ? { launchable: Boolean(args.launchable) } : {}),
                ...(args.compileOptions !== undefined && typeof args.compileOptions === 'object'
                    ? { compileOptions: { strict: Boolean(args.compileOptions.strict) } }
                    : {}),
            };
            const out = await executeAgentSave({ loadDefs }, input);
            return {
                status: out.status,
                id: out.agent.id,
                name: out.agent.name,
                summary: out.agent.summary,
            };
        },
    }));
}
