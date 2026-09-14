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
import { type AgentDef, type AgentDefInput, type WorkspaceConfig } from './schema.js';
/**
 * 解析数据根目录（$DSH_HOME/meow-dsh-workflow）。
 * @param override 显式覆盖（测试用）；缺省按 $DSH_HOME > ~/.dsh 解析。
 * @returns 绝对路径。
 */
export declare function resolveDataRoot(override?: string): string;
/** agents.json 路径（数据根下）。 */
export declare function agentsFile(root: string): string;
/** workspace-config.json 路径（数据根下）。 */
export declare function workspaceConfigFile(root: string): string;
/** 文件名安全化（项目/角色键；非安全字符连续段折叠为一个 -，限长 80，空 → shared）。 */
export declare function sanitizeKey(raw: string): string;
/** 鸭子类型探测调用者会话 cwd（agent.cwd / agent.session.header.cwd；探测不到 → undefined）。 */
export declare function probeCwd(agent: unknown): string | undefined;
/**
 * 加载 Agent 定义库（agents.json）。
 * 文件不存在 → 空记录（或提供 defaults 时种入默认定义并落盘，幂等——再次加载读文件）。
 * 解析后逐条过 agentDefSchema（坏记录抛错，不静默丢弃）。
 * @param root     数据根（缺省按 $DSH_HOME 解析；测试传 os.tmpdir() 临时目录）。
 * @param defaults 缺省定义记录（首次加载文件不存在时种入并落盘；T-07 预置角色用）。
 * @returns Record<agentDefId, AgentDef>。
 */
export declare function loadAgentDefs(root?: string, defaults?: Record<string, AgentDefInput>): Promise<Record<string, AgentDef>>;
/**
 * 保存 Agent 定义库（agents.json，整库覆盖写）。
 * 入参可含 AgentDefInput（缺省字段由 schema 补全后落盘）。
 * @param defs 定义记录（键=id）。
 * @param root 数据根（缺省按 $DSH_HOME 解析；测试传 os.tmpdir() 临时目录）。
 */
export declare function saveAgentDefs(defs: Record<string, AgentDefInput>, root?: string): Promise<Record<string, AgentDef>>;
/** 归一化 WorkspaceConfig（缺省字段补全）。 */
export declare function normalizeWorkspaceConfig(value: unknown): WorkspaceConfig;
/**
 * 加载可移植配置（workspace-config.json）。
 * 文件不存在 → 空配置。
 * @param root 数据根（缺省按 $DSH_HOME 解析；测试传 os.tmpdir() 临时目录）。
 */
export declare function loadWorkspaceConfig(root?: string): Promise<WorkspaceConfig>;
/**
 * 保存可移植配置（workspace-config.json，覆盖写）。
 * @param config 配置（可含 undefined 字段，落盘前剥离）。
 * @param root 数据根（缺省按 $DSH_HOME 解析；测试传 os.tmpdir() 临时目录）。
 */
export declare function saveWorkspaceConfig(config: WorkspaceConfig, root?: string): Promise<WorkspaceConfig>;
