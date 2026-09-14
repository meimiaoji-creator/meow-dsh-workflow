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
/** 校验失败统一异常。 */
export class SchemaValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'SchemaValidationError';
    }
}
// ---------------------------------------------------------------------------
// 基础断言辅助
// ---------------------------------------------------------------------------
function requireString(value, field) {
    if (typeof value !== 'string') {
        throw new SchemaValidationError(`字段 ${field} 必填且为字符串，实际: ${JSON.stringify(value)}`);
    }
    return value;
}
function requireNonEmpty(value, field) {
    const s = requireString(value, field);
    if (s.trim() === '') {
        throw new SchemaValidationError(`字段 ${field} 必填且不能为空字符串`);
    }
    return s;
}
function requireBoolean(value, field) {
    if (typeof value !== 'boolean') {
        throw new SchemaValidationError(`字段 ${field} 必须为布尔值，实际: ${JSON.stringify(value)}`);
    }
    return value;
}
/** 可选字符串数组：每项非空字符串（trim），缺省返回 []。 */
function optionalStringArray(value, field) {
    if (value === undefined)
        return [];
    if (!Array.isArray(value)) {
        throw new SchemaValidationError(`字段 ${field} 必须为字符串数组，实际: ${JSON.stringify(value)}`);
    }
    return value.map((item, i) => requireNonEmpty(item, `${field}[${i}]`).trim());
}
/** 可选编译选项对象（仅 strict 字段；R-05 T-04/2 a）。 */
function optionalCompileOptions(value) {
    if (value === undefined)
        return undefined;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new SchemaValidationError(`字段 compileOptions 必须为对象，实际: ${JSON.stringify(value)}`);
    }
    const raw = value;
    const out = {};
    if (raw.strict !== undefined) {
        out.strict = requireBoolean(raw.strict, 'compileOptions.strict');
    }
    return out;
}
// ---------------------------------------------------------------------------
// 实体校验
// ---------------------------------------------------------------------------
/** 校验单个子 agent 目录项（name 必填非空，description 可缺省）。 */
export function validateAgentChild(value, field = 'children') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new SchemaValidationError(`字段 ${field} 必须为对象，实际: ${JSON.stringify(value)}`);
    }
    const raw = value;
    const name = requireNonEmpty(raw.name, `${field}.name`).trim();
    const description = raw.description === undefined
        ? ''
        : requireString(raw.description, `${field}.description`);
    return { name, description };
}
/** 校验子 agent 目录数组（缺省 []）。 */
export function validateAgentChildren(value) {
    if (value === undefined)
        return [];
    if (!Array.isArray(value)) {
        throw new SchemaValidationError(`字段 children 必须为数组，实际: ${JSON.stringify(value)}`);
    }
    return value.map((item, i) => validateAgentChild(item, `children[${i}]`));
}
/**
 * 校验并规范化 Agent 定义（agentDefSchema）。
 * 必填：id/name/systemPrompt（缺 id 抛错）；可选数组/布尔补缺省。
 * @param value 任意输入（JSON 解析后形态）。
 * @returns 规范化后的 AgentDef（全部字段就位）。
 */
export function agentDefSchema(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new SchemaValidationError(`Agent 定义必须为对象，实际: ${JSON.stringify(value)}`);
    }
    const raw = value;
    const id = requireNonEmpty(raw.id, 'id').trim();
    const name = requireNonEmpty(raw.name, 'name').trim();
    const systemPrompt = requireNonEmpty(raw.systemPrompt, 'systemPrompt');
    return {
        id,
        name,
        systemPrompt,
        ...(raw.summary === undefined
            ? {}
            : { summary: requireNonEmpty(raw.summary, 'summary').trim() }),
        allowedSkills: optionalStringArray(raw.allowedSkills, 'allowedSkills'),
        allowedMcps: optionalStringArray(raw.allowedMcps, 'allowedMcps'),
        allowedTools: optionalStringArray(raw.allowedTools, 'allowedTools'),
        ...(raw.model === undefined ? {} : { model: requireNonEmpty(raw.model, 'model').trim() }),
        ...(raw.provider === undefined ? {} : { provider: requireNonEmpty(raw.provider, 'provider').trim() }),
        children: validateAgentChildren(raw.children),
        launchable: raw.launchable === undefined ? false : requireBoolean(raw.launchable, 'launchable'),
        ...(raw.compileOptions === undefined
            ? {}
            : { compileOptions: optionalCompileOptions(raw.compileOptions) }),
    };
}
/** 归一化插件配置（null/缺省兜底空对象）。 */
export function normalizeConfig(config) {
    return { ...(config ?? {}) };
}
