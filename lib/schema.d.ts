/**
 * meow-dsh-workflow 数据模型 —— Agent 定义（agentDefSchema）与配置。
 *
 * T-02 交付：`agentDefSchema` 校验并规范化 Agent 定义（手写校验，零 dsh 依赖，
 * 与 meow-dsh-task schema.ts 同风格）。字段顺序与类型是 T-03 storage / T-04
 * AgentManager / T-05 meow_agent_call 的契约源，保持稳定。
 *
 * 字段契约（docs/agent-chain-design.md §2.1/§4）：
 *   id/name/systemPrompt 必填；allowedSkills/allowedMcps/allowedTools 可选数组（缺省 []）；
 *   model 可选；children 可选数组（缺省 []）；launchable 可选（缺省 false）。
 */
/** 子 agent 目录项：名字 + 职责一句话（语言链引用解析目标，见 §2.2）。 */
export interface AgentChild {
    /** 子 agent 名字（对应另一 AgentDef 的 name）。 */
    name: string;
    /** 职责一句话（给主 agent 的调度提示）。 */
    description: string;
}
/** 授权编译选项（R-05 修复 T-04/2 a）：strict 模式过滤未知工具名。 */
export interface CompileOptionsInput {
    /**
     * 是否校验工具名存在性（仅保留 toolNames 索引中存在的工具名）：
     *   true  → 未知工具名不入白名单（同时抛 AgentCallError UNKNOWN_TOOL）；
     *   false → 全部加入（向后兼容；保留旧测试用例 + 自定义角色兜底行为）。
     * 缺省 true：R-05 修复默认值（避免 restrict 误抛未知工具名）。
     */
    strict?: boolean;
}
/** 校验并规范化后的 Agent 定义（存储格式，全部字段就位）。 */
export interface AgentDef {
    /** 唯一标识（agents.json 键 / meow_agent_call 的 agentDefId）。 */
    id: string;
    /** 角色名（研发负责人 / 研发工程师 / 评审专家 …）。 */
    name: string;
    /** 身份定位 + 行为范式（可含语言链引用 `<语言链引用:agent:角色名>`）。 */
    systemPrompt: string;
    /** 范式一句话（人话，供 UI 角色列表展示；缺省由 listLaunchableRoles 从 systemPrompt 首句 sanitize 降级）。 */
    summary?: string;
    /**
     * 授权技能名列表。
     * 授权边界（T-10 探测定稿，design §6）：dsh 技能经 `skill` 加载入口工具执行，
     * 技能名本身不是工具名 —— 本列表授予 `skill` 入口工具（软约束），
     * 若工具名索引含同名工具则一并加入；远程技能（MCP 发布形态 `mcp__<server>__<skill>`）
     * 需经 allowedMcps 按 server 名授权，见 AgentManager.compileAllowedTools。
     */
    allowedSkills: string[];
    /** 授权 MCP 服务器名列表（运行时解析为 `mcp__server__tool`）。 */
    allowedMcps: string[];
    /** 授权系统工具名列表（直接工具名）。 */
    allowedTools: string[];
    /**
     * 可选模型指定（子 agent agentOptions.model）。
     * 多 provider 部署下 model id 有歧义——配 provider 才能跨厂商路由
     * （agentOptions.provider 覆盖父 agent 的 provider；缺省继承父）。
     */
    model?: string;
    /** 可选模型提供方（dsh provider 路由键，如 minimax；缺省继承父 agent 的 provider）。 */
    provider?: string;
    /** 可调用的子 agent 目录（名字 + 职责一句话）。 */
    children: AgentChild[];
    /** 是否可作为发起角色出现在 UI 选择面板。 */
    launchable: boolean;
    /** 可选：授权编译选项（R-05 T-04/2 a）。缺省 strict=true（未知工具名过滤）。 */
    compileOptions?: CompileOptionsInput;
}
/** 输入形态：可选数组/布尔缺省，由 agentDefSchema 补全。 */
export type AgentDefInput = Pick<AgentDef, 'id' | 'name' | 'systemPrompt'> & Partial<Omit<AgentDef, 'id' | 'name' | 'systemPrompt'>>;
/** 插件配置（当前无插件级配置项；agentsFile 预留路径覆盖）。 */
export interface PluginConfig {
    /** 预留：agents.json 路径覆盖（缺省 $DSH_HOME/meow-dsh-workflow/agents.json）。 */
    agentsFile?: string;
    /** 子 agent 提供方名（缺省 'spawn'，dsh-base 注册的 spawn-in-process）。 */
    providerName?: string;
}
/** 可移植配置（workspace-config.json，缺省角色等，可选）。 */
export interface WorkspaceConfig {
    /** 缺省发起角色 id（UI 面板默认选中）。 */
    defaultRoleId?: string;
}
/** 校验失败统一异常。 */
export declare class SchemaValidationError extends Error {
    constructor(message: string);
}
/** 校验单个子 agent 目录项（name 必填非空，description 可缺省）。 */
export declare function validateAgentChild(value: unknown, field?: string): AgentChild;
/** 校验子 agent 目录数组（缺省 []）。 */
export declare function validateAgentChildren(value: unknown): AgentChild[];
/**
 * 校验并规范化 Agent 定义（agentDefSchema）。
 * 必填：id/name/systemPrompt（缺 id 抛错）；可选数组/布尔补缺省。
 * @param value 任意输入（JSON 解析后形态）。
 * @returns 规范化后的 AgentDef（全部字段就位）。
 */
export declare function agentDefSchema(value: unknown): AgentDef;
/** 归一化插件配置（null/缺省兜底空对象）。 */
export declare function normalizeConfig(config: Partial<PluginConfig> | null | undefined): PluginConfig;
