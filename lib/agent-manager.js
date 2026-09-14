/**
 * meow-dsh-workflow AgentManager —— 授权编译（工具级白名单）。
 *
 * T-04 交付：`compileAllowedTools(def)` 把 Agent 定义的授权清单编译为子 agent 的
 * 工具级白名单（ToolRestriction.allow 形态，docs/agent-chain-design.md §6）：
 *   - allowedTools  → 直接工具名；
 *   - allowedSkills → 技能加载入口工具 `skill`（dsh 中技能经 `skill` 工具加载指令，
 *     技能名本身不是工具名；另若工具名索引含同名工具也一并加入）；
 *   - allowedMcps   → 每个 server 名展开为该 server 下的 `mcp__<server>__<tool>`
 *     精确工具名（从调用方提供的工具名索引过滤；缺索引时不展开——运行时 T-05
 *     从 ctx.tools 枚举，见 §16「MCP 工具名形态实现期枚举确认」）；
 *   - 追加协作工具 `meow_agent_call` 自身（子 agent 可继续下辖孙 agent，语言链多层）。
 *
 * R-05 修复（T-04/2 a）：strict 模式（默认）下仅保留 toolNames 索引中存在的工具名 +
 * `meow_agent_call` 自身，未知工具名收集到返回值 `unknownTools: string[]`。
 * dsh 的 tools.restrict（packages/core/tools/src/index.ts:1088-1092）对未注册全局
 * 工具名直接抛错（"names unknown global tool"），若不预先过滤会被误报为
 * PROVIDER_UNAVAILABLE（R-05 探测定界）。
 *
 * 纯函数 + 可选工具名索引，零 dsh 依赖、独立可测。T-05 meow_agent_call 直接复用。
 */
/** 技能加载入口工具名（dsh tool-skill 注册名）。 */
export const SKILL_TOOL = 'skill';
/** 协作工具名（本插件注册的 meow_agent_call，见 T-05）。 */
export const AGENT_CALL_TOOL = 'meow_agent_call';
/**
 * 默认授权工具清单（R-06 T-01/4 引入、R-07 T-05/2 抽为公共兜底）。
 *
 * 背景：web profile 的 host 平面工具注册表为空或缺标准工具名——web-app/cordis.patch.yml
 * 将 tool-fs/tool-bash/tool-pwsh/tool-skill/tool-subagent/tool-todo/tool-web 等 disabled，
 * 改由 agent preset 每会话挂载；root scope 的 node:http handler 与工具执行路径的
 * ctx.tools.schemas() 看不到这些会话级挂载（或只看到部分工具）。
 *
 * 兜底策略：枚举 dsh 公开的标准工具名 + 标准技能加载入口（skill 工具）——这些是会话可见
 * 的工具名，与 preset 实际挂载匹配。清单调整在代码层控制，compileAllowedTools 仍以
 * 实时 toolNames 为准，仅当实时枚举缺失这些标准名时并入（见 resolveVisibleToolNames）。
 *
 * 来源（dsh 官方工具名约定 + R-06 评审纪要）：
 *   - tool-fs: read/write/edit/glob/grep
 *   - tool-bash: bash/pwsh
 *   - tool-web: web
 *   - tool-skill: skill（技能加载入口）
 *   - tool-subagent: subagent
 *   - tool-todo: todo
 *   - meow_agent_call: 协作工具（本插件注册；registerAgentCallTool 注入）
 */
export const DEFAULT_VISIBLE_TOOL_NAMES = [
    'read', 'write', 'edit', 'glob', 'grep',
    'bash', 'pwsh',
    'web',
    'skill',
    'subagent',
    'todo',
    // 读图工具（tool-fs 独立注册；read 只读文本，PNG 等二进制必须走 read_image。
    // web 会话挂载 attachments 时可见；角色要看图须在 allowedTools 授权它）
    'read_image',
    // meow-vision 视觉插件：meow_vision（非多模态模型看图→文字描述）、
    // meow_preview（渲染页面→截图给多模态模型看，写 .preview/ 产物）
    'meow_vision', 'meow_preview',
    'meow_agent_call',
    // agent提炼优化 协作工具（agent-refiner 的 allowedTools 引用；web profile 空注册表
    // 下若不并入默认清单，strict 预校验会把它们判为 UNKNOWN_TOOL，导致无法调用）
    'meow_agent_save', 'meow_agent_list', 'meow_agent_get',
    // 会话级 web 工具（standard preset 每会话挂载 web_search/web_fetch，root scope 枚举看不到；
    // 角色 agent 想授权这两个工具名时须认它们存在，否则 strict 预校验误报 UNKNOWN_TOOL）
    'web_search', 'web_fetch',
    // 台账工具（工具级授权：角色 allowedTools 含它=可调用；不含=硬过滤不可调。
    // 与 meow_agent_* 同理必须进默认清单，否则 strict 预校验误报 UNKNOWN_TOOL）
    'meow_ledger_write', 'meow_ledger_read',
    // 子 agent 目录查询（父级派发前看能力）+ 角色记忆（项目×角色，跨会话）
    'meow_child_agent_list', 'meow_memory_write', 'meow_memory_read',
];
/**
 * 解析「会话可见工具名」：实时枚举 ∪ 默认清单（去重保序）。
 *
 * R-07 T-05/2 修复：web profile 下 ctx.tools.schemas() 返回**非空但不含标准工具名**
 * （如只含 skill/subagent/meow_agent_call 等）——若 strict 预校验只用实时枚举，预置角色的
 * allowedTools（read/edit/write/glob/grep/pwsh）会被判为未注册而误报 UNKNOWN_TOOL，
 * 委派直接失败。合并默认清单后：实时缺失的标准名一并纳入索引，白名单展开不塌缩、
 * 预校验不误报；实时已有的工具名保持优先（防止覆盖会话真实挂载的收敛语义）。
 *
 * @param liveNames 实时枚举的工具名（ctx.tools.schemas() 或空）。
 * @returns 合并后的可见工具名列表（实时在前、默认清单缺项补在后）。
 */
export function resolveVisibleToolNames(liveNames) {
    const out = [...liveNames];
    const seen = new Set(out);
    for (const name of DEFAULT_VISIBLE_TOOL_NAMES) {
        if (!seen.has(name)) {
            seen.add(name);
            out.push(name);
        }
    }
    return out;
}
/** MCP 工具名前缀构造：`mcp__<server>__`。 */
export function mcpToolPrefix(server) {
    return `mcp__${server}__`;
}
/**
 * 编译 Agent 定义的授权清单为工具级白名单（去重、保序）。
 * @param def       规范化后的 Agent 定义。
 * @param toolNames 已注册工具名快照（可选；MCP 展开需要它精确枚举
 *   `mcp__<server>__<tool>`，缺省时 allowedMcps 不展开——不静默加入不确定名）。
 * @param options   编译选项（strict 模式：仅保留索引中存在的工具名 + 未知名收集）。
 * @returns 白名单数组 + 未知工具名列表（详见 CompiledAllowedTools）。
 */
export function compileAllowedTools(def, toolNames, options) {
    const out = new Set();
    // 1. allowedTools → 直接工具名（strict 模式过滤未知名）
    const strict = options?.strict !== false; // 缺省 true
    // R-06 T-01/4 修复：toolNames 为空数组（root scope 注册表空，web profile 场景）
    // 视同「索引不可用」而非「全部未知」——避免白名单塌缩（def.allowedTools 被 strict 过滤
    // 静默丢弃、只剩 meow_agent_call）。空数组与 undefined 等价：不走 strict 过滤、保留
    // def.allowedTools 原样；allowedMcps 同理不展开（MCP 名需精确枚举）。
    const effectiveToolNames = toolNames !== undefined && toolNames.length > 0 ? toolNames : undefined;
    const index = effectiveToolNames !== undefined ? new Set(effectiveToolNames) : undefined;
    for (const name of def.allowedTools) {
        const trimmed = name.trim();
        if (trimmed === '')
            continue;
        if (strict && index !== undefined && !index.has(trimmed)) {
            // 未知工具名 → 不入白名单（collect 入 compileAllowedToolsDetailed 报告）
            continue;
        }
        out.add(trimmed);
    }
    // 2. allowedSkills → 技能加载入口工具（dsh 技能经 `skill` 工具执行；
    //    若索引含与技能名同名的工具（如远程技能暴露为工具）也加入）
    if (def.allowedSkills.length > 0)
        out.add(SKILL_TOOL);
    if (index !== undefined) {
        for (const skill of def.allowedSkills) {
            if (skill.trim() === '')
                continue;
            if (index.has(skill))
                out.add(skill);
            // 技能同名工具不存在 → 不入白名单（不收集 unknownTools —— 技能名可能
            // 是真技能名而非工具名，远程技能边界已知见 design §16）
        }
    }
    // 3. allowedMcps → `mcp__<server>__<tool>` 精确名（需工具名索引枚举）
    if (index !== undefined) {
        for (const server of def.allowedMcps) {
            if (server.trim() === '')
                continue;
            const prefix = mcpToolPrefix(server);
            for (const name of index) {
                if (name.startsWith(prefix))
                    out.add(name);
            }
        }
    }
    // 4. 协作工具：meow_agent_call（语言链可多层下辖）
    out.add(AGENT_CALL_TOOL);
    return [...out];
}
/**
 * 编译 Agent 定义并返回完整结果（含 unknownTools）。
 * 供 T-05 meow_agent_call 在 strict 模式 + 未注册工具名场景抛 AgentCallError('UNKNOWN_TOOL')
 * 使用，与 compileAllowedTools 共享实现细节（仅返回值多 unknownTools 字段）。
 */
export function compileAllowedToolsDetailed(def, toolNames, options) {
    const strict = options?.strict !== false;
    // R-06 T-01/4 修复：与 compileAllowedTools 同款——空 toolNames 视同 undefined，
    // 不收集 unknownTools（避免 root scope 场景下空索引导致全部工具被标未知）。
    const effectiveToolNames = toolNames !== undefined && toolNames.length > 0 ? toolNames : undefined;
    const index = effectiveToolNames !== undefined ? new Set(effectiveToolNames) : undefined;
    const unknownTools = [];
    const allow = compileAllowedTools(def, toolNames, options);
    // 重新收集 unknownTools（compileAllowedTools 内部已做严格过滤，但未返回值）
    // 这里再算一次供 executeAgentCall 抛错用。
    if (strict && index !== undefined) {
        for (const name of def.allowedTools) {
            const trimmed = name.trim();
            if (trimmed === '' || trimmed === AGENT_CALL_TOOL)
                continue;
            if (!index.has(trimmed))
                unknownTools.push(trimmed);
        }
        for (const server of def.allowedMcps) {
            if (server.trim() === '')
                continue;
            const prefix = mcpToolPrefix(server);
            let matched = false;
            for (const n of index)
                if (n.startsWith(prefix)) {
                    matched = true;
                    break;
                }
            if (!matched)
                unknownTools.push(`mcp__${server}__*`);
        }
    }
    return { allow, unknownTools };
}
/**
 * AgentManager —— Agent 定义授权编译器（T-04 交付）。
 *
 * 持有可选工具名索引快照；T-05 meow_agent_call 执行时经 `withToolNames()` 注入
 * 实时工具名（ctx.tools.schemas() 枚举），再调用 compileAllowedTools 生成白名单。
 */
export class AgentManager {
    toolNames;
    constructor(options = {}) {
        this.toolNames = options.toolNames;
    }
    /** 注入/替换工具名索引快照（返回 this，链式）。 */
    withToolNames(toolNames) {
        this.toolNames = toolNames;
        return this;
    }
    /** 当前工具名索引（可空）。 */
    currentToolNames() {
        return this.toolNames;
    }
    /**
     * 编译授权白名单（含 meow_agent_call）。
     * 读取 def.compileOptions?.strict 控制是否存在性过滤（R-05 T-04/2 a）。
     * @param def 规范化后的 Agent 定义。
     * @returns 白名单数组。
     */
    compileAllowedTools(def) {
        return compileAllowedTools(def, this.toolNames, def.compileOptions);
    }
}
