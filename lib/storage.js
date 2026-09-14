/**
 * meow-dsh-workflow 存储层 —— agents.json（Agent 定义库）+ workspace-config.json（可移植配置）。
 *
 * T-03 交付：四个函数 load/save x AgentDefs/WorkspaceConfig；数据根 `$DSH_HOME/meow-dsh-workflow/`
 * （$DSH_HOME 解析：环境变量 > ~/.dsh，与 dsh-home-paths.resolveDshHome 语义一致，参考 meow-dsh-task
 * pluginWorkspaceConfigFile 复刻优先级，零 dsh 值依赖）。
 *
 * 边界原则（docs/agent-chain-design.md §11）：数据只写数据根；无运行状态文件；
 * 测试用 os.tmpdir() 临时目录隔离（不写真实 $DSH_HOME）。
 *
 * 文件格式：
 *   agents.json            { [agentDefId]: AgentDef }   （记录对象，键=id；load 后按 schema 校验）
 *   workspace-config.json  WorkspaceConfig              （可选字段，缺省空对象）
 */
import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { agentDefSchema, SchemaValidationError } from './schema.js';
// ---------------------------------------------------------------------------
// 路径解析
// ---------------------------------------------------------------------------
/**
 * 解析数据根目录（$DSH_HOME/meow-dsh-workflow）。
 * @param override 显式覆盖（测试用）；缺省按 $DSH_HOME > ~/.dsh 解析。
 * @returns 绝对路径。
 */
export function resolveDataRoot(override) {
    if (override !== undefined && override.trim() !== '') {
        return resolve(override);
    }
    const env = process.env.DSH_HOME?.trim();
    const home = env && env.length > 0 ? env : join(homedir(), '.dsh');
    return join(resolve(home), 'meow-dsh-workflow');
}
/** agents.json 路径（数据根下）。 */
export function agentsFile(root) {
    return join(root, 'agents.json');
}
/** workspace-config.json 路径（数据根下）。 */
export function workspaceConfigFile(root) {
    return join(root, 'workspace-config.json');
}
// ---------------------------------------------------------------------------
// 读写辅助
// ---------------------------------------------------------------------------
/** 读取 JSON 文件；不存在返回 undefined。 */
async function readJsonFile(file) {
    let text;
    try {
        text = await fs.readFile(file, 'utf8');
    }
    catch (err) {
        if (isNodeError(err, 'ENOENT'))
            return undefined;
        throw err;
    }
    try {
        return JSON.parse(text);
    }
    catch (err) {
        throw new SchemaValidationError(`JSON 解析失败: ${file}（${err.message}）`);
    }
}
/** 原子写 JSON 文件（先建目录，写临时文件后 rename）。 */
async function writeJsonFile(file, value) {
    await fs.mkdir(dirname(file), { recursive: true });
    const tmp = `${file}.tmp-${process.pid}`;
    await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
    await fs.rename(tmp, file);
}
function isNodeError(err, code) {
    return err !== null && typeof err === 'object' && err.code === code;
}
// ---------------------------------------------------------------------------
// 共享键/探测工具（ledger 与 memory 的 项目/角色 目录键共用）
// ---------------------------------------------------------------------------
/** 文件名安全化（项目/角色键；非安全字符连续段折叠为一个 -，限长 80，空 → shared）。 */
export function sanitizeKey(raw) {
    const s = raw.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
    return s === '' ? 'shared' : s.slice(0, 80);
}
/** 鸭子类型探测调用者会话 cwd（agent.cwd / agent.session.header.cwd；探测不到 → undefined）。 */
export function probeCwd(agent) {
    const a = agent;
    const cands = [a?.cwd, a?.session?.header?.cwd];
    for (const c of cands)
        if (typeof c === 'string' && c.trim() !== '')
            return c.trim();
    return undefined;
}
// ---------------------------------------------------------------------------
// Agent 定义库
// ---------------------------------------------------------------------------
/**
 * 加载 Agent 定义库（agents.json）。
 * 文件不存在 → 空记录（或提供 defaults 时种入默认定义并落盘，幂等——再次加载读文件）。
 * 解析后逐条过 agentDefSchema（坏记录抛错，不静默丢弃）。
 * @param root     数据根（缺省按 $DSH_HOME 解析；测试传 os.tmpdir() 临时目录）。
 * @param defaults 缺省定义记录（首次加载文件不存在时种入并落盘；T-07 预置角色用）。
 * @returns Record<agentDefId, AgentDef>。
 */
export async function loadAgentDefs(root, defaults) {
    const file = agentsFile(resolveDataRoot(root));
    const raw = await readJsonFile(file);
    if (raw === undefined) {
        if (defaults !== undefined)
            return saveAgentDefs(defaults, root);
        return {};
    }
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        throw new SchemaValidationError(`agents.json 必须为对象（Record<id, AgentDef>），实际: ${JSON.stringify(raw)}`);
    }
    const out = {};
    for (const [id, value] of Object.entries(raw)) {
        const def = agentDefSchema(value);
        if (def.id !== id) {
            throw new SchemaValidationError(`agents.json 键 ${id} 与定义 id ${def.id} 不一致`);
        }
        out[id] = def;
    }
    return out;
}
/**
 * 保存 Agent 定义库（agents.json，整库覆盖写）。
 * 入参可含 AgentDefInput（缺省字段由 schema 补全后落盘）。
 * @param defs 定义记录（键=id）。
 * @param root 数据根（缺省按 $DSH_HOME 解析；测试传 os.tmpdir() 临时目录）。
 */
export async function saveAgentDefs(defs, root) {
    const normalized = {};
    for (const [id, value] of Object.entries(defs)) {
        const def = agentDefSchema(value);
        if (def.id !== id) {
            throw new SchemaValidationError(`保存键 ${id} 与定义 id ${def.id} 不一致`);
        }
        normalized[id] = def;
    }
    const file = agentsFile(resolveDataRoot(root));
    await writeJsonFile(file, normalized);
    return normalized;
}
// ---------------------------------------------------------------------------
// 可移植配置
// ---------------------------------------------------------------------------
/** 归一化 WorkspaceConfig（缺省字段补全）。 */
export function normalizeWorkspaceConfig(value) {
    if (value === undefined)
        return {};
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new SchemaValidationError(`workspace-config.json 必须为对象，实际: ${JSON.stringify(value)}`);
    }
    const raw = value;
    const out = {};
    if (raw.defaultRoleId !== undefined) {
        if (typeof raw.defaultRoleId !== 'string' || raw.defaultRoleId.trim() === '') {
            throw new SchemaValidationError('workspace-config.defaultRoleId 必须为非空字符串');
        }
        out.defaultRoleId = raw.defaultRoleId.trim();
    }
    return out;
}
/**
 * 加载可移植配置（workspace-config.json）。
 * 文件不存在 → 空配置。
 * @param root 数据根（缺省按 $DSH_HOME 解析；测试传 os.tmpdir() 临时目录）。
 */
export async function loadWorkspaceConfig(root) {
    const file = workspaceConfigFile(resolveDataRoot(root));
    const raw = await readJsonFile(file);
    return normalizeWorkspaceConfig(raw);
}
/**
 * 保存可移植配置（workspace-config.json，覆盖写）。
 * @param config 配置（可含 undefined 字段，落盘前剥离）。
 * @param root 数据根（缺省按 $DSH_HOME 解析；测试传 os.tmpdir() 临时目录）。
 */
export async function saveWorkspaceConfig(config, root) {
    const normalized = normalizeWorkspaceConfig(config);
    const file = workspaceConfigFile(resolveDataRoot(root));
    await writeJsonFile(file, normalized);
    return normalized;
}
