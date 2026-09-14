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
import type { AgentDef } from './schema.js';
import { type AgentListItem } from './agents-crud.js';
/** meow_agent_save 工具名（Agent 定义 allowedTools 授权项）。 */
export declare const AGENT_SAVE_TOOL = "meow_agent_save";
/** meow_agent_save 输出：状态 + 保存后的 Agent（presentAgent 形态，已 escape）。 */
export interface AgentSaveOutput {
    /** created = 新增；updated = 覆盖更新已有 id。 */
    status: 'created' | 'updated';
    /** 保存后的 Agent 定义（对外展示形态）。 */
    agent: AgentListItem;
}
/** meow_agent_save 入参（AgentDefInput 全字段；缺省数组/布尔由 schema 补全）。 */
export interface AgentSaveInput {
    id: string;
    name: string;
    systemPrompt: string;
    summary?: string;
    allowedSkills?: string[];
    allowedMcps?: string[];
    allowedTools?: string[];
    model?: string;
    provider?: string;
    children?: {
        name: string;
        description: string;
    }[];
    launchable?: boolean;
    compileOptions?: {
        strict?: boolean;
    };
}
/** loadDefs 依赖（注入点；默认 ensurePresetAgents）。 */
export interface AgentSaveDeps {
    loadDefs: () => Promise<Record<string, AgentDef>>;
}
/**
 * meow_agent_save 执行核心：加载 agents.json → id 存在则更新、不存在则新建 → 写盘 → 返回。
 * @param deps   依赖（loadDefs 注入；默认 ensurePresetAgents）。
 * @param input  保存入参（id/name/systemPrompt 必填，其余可选）。
 * @param root   数据根（测试传 os.tmpdir() 隔离；缺省按 $DSH_HOME 解析）。
 * @returns { status, agent }。
 * @throws CrudError（schema 400 / 冲突 409 由 createAgent 抛；404 由 updateAgent 抛）。
 */
export declare function executeAgentSave(deps: AgentSaveDeps, input: AgentSaveInput, root?: string): Promise<AgentSaveOutput>;
