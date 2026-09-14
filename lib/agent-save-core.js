/**
 * meow_agent_save 工具核心逻辑 —— 保存/新增/更新 Agent 定义（零 dsh 依赖，独立可测）。
 *
 * 类比技能提炼（skill-remote-refinement）的 addPendingSkill MCP 工具：
 *   - addPendingSkill 按 skillName 新增或更新远程技能；
 *   - meow_agent_save 按 agent id 新增或更新**本地** agents.json 里的 Agent 定义。
 *
 * 语义（与 agents-crud 一致）：
 *   - id 已存在 → updateAgent（覆盖式更新整条记录）；
 *   - id 不存在 → createAgent（新建）；
 *   - 校验失败 / 保存失败 → CrudError（400/404/409 语义）。
 *
 * 本模块只依赖 storage + schema + agents-crud（全部零 dsh 值依赖），
 * 运行时经注册壳 agent-save.ts 注入 loadDefs（默认 ensurePresetAgents）。
 */
import { createAgent, updateAgent, presentAgent } from './agents-crud.js';
/** meow_agent_save 工具名（Agent 定义 allowedTools 授权项）。 */
export const AGENT_SAVE_TOOL = 'meow_agent_save';
/**
 * meow_agent_save 执行核心：加载 agents.json → id 存在则更新、不存在则新建 → 写盘 → 返回。
 * @param deps   依赖（loadDefs 注入；默认 ensurePresetAgents）。
 * @param input  保存入参（id/name/systemPrompt 必填，其余可选）。
 * @param root   数据根（测试传 os.tmpdir() 隔离；缺省按 $DSH_HOME 解析）。
 * @returns { status, agent }。
 * @throws CrudError（schema 400 / 冲突 409 由 createAgent 抛；404 由 updateAgent 抛）。
 */
export async function executeAgentSave(deps, input, root) {
    const defs = await deps.loadDefs();
    const inputDef = {
        id: input.id,
        name: input.name,
        systemPrompt: input.systemPrompt,
        ...(input.summary !== undefined ? { summary: input.summary } : {}),
        ...(input.allowedSkills !== undefined ? { allowedSkills: input.allowedSkills } : {}),
        ...(input.allowedMcps !== undefined ? { allowedMcps: input.allowedMcps } : {}),
        ...(input.allowedTools !== undefined ? { allowedTools: input.allowedTools } : {}),
        ...(input.model !== undefined ? { model: input.model } : {}),
        ...(input.provider !== undefined ? { provider: input.provider } : {}),
        ...(input.children !== undefined ? { children: input.children } : {}),
        ...(input.launchable !== undefined ? { launchable: input.launchable } : {}),
        ...(input.compileOptions !== undefined ? { compileOptions: input.compileOptions } : {}),
    };
    // id 存在性判定 → update / create（与 agents-crud 语义一致）
    const exists = Object.prototype.hasOwnProperty.call(defs, inputDef.id);
    if (exists) {
        // 增量更新：以原定义为基础，仅覆盖 input 显式传入的字段，避免整条覆盖把未传的
        // 授权/工具/子目录清空（meow_agent_save 迭代时只改某字段的场景）。
        const existing = defs[inputDef.id];
        // id/name/systemPrompt 是 AgentSaveInput 必填字段，恒以 input 为准（inputDef 即来自 input）
        const merged = {
            id: inputDef.id,
            name: inputDef.name,
            systemPrompt: inputDef.systemPrompt,
            ...(existing.summary !== undefined ? { summary: existing.summary } : {}),
            ...(existing.allowedSkills.length > 0 ? { allowedSkills: existing.allowedSkills } : {}),
            ...(existing.allowedMcps.length > 0 ? { allowedMcps: existing.allowedMcps } : {}),
            ...(existing.allowedTools.length > 0 ? { allowedTools: existing.allowedTools } : {}),
            ...(existing.model !== undefined ? { model: existing.model } : {}),
            ...(existing.provider !== undefined ? { provider: existing.provider } : {}),
            ...(existing.children.length > 0 ? { children: existing.children } : {}),
            ...(existing.launchable !== undefined ? { launchable: existing.launchable } : {}),
            ...(existing.compileOptions !== undefined ? { compileOptions: existing.compileOptions } : {}),
        };
        // 覆盖 input 显式传入的可选字段（AgentSaveInput 可选字段 undefined = 未传 = 保留原值）
        if (input.summary !== undefined)
            merged.summary = input.summary;
        if (input.allowedSkills !== undefined)
            merged.allowedSkills = input.allowedSkills;
        if (input.allowedMcps !== undefined)
            merged.allowedMcps = input.allowedMcps;
        if (input.allowedTools !== undefined)
            merged.allowedTools = input.allowedTools;
        if (input.model !== undefined)
            merged.model = input.model;
        if (input.provider !== undefined)
            merged.provider = input.provider;
        if (input.children !== undefined)
            merged.children = input.children;
        if (input.launchable !== undefined)
            merged.launchable = input.launchable;
        if (input.compileOptions !== undefined)
            merged.compileOptions = input.compileOptions;
        const updated = await updateAgent(defs, inputDef.id, merged, root);
        return { status: 'updated', agent: presentAgent(updated) };
    }
    const created = await createAgent(defs, inputDef, root);
    return { status: 'created', agent: presentAgent(created) };
}
