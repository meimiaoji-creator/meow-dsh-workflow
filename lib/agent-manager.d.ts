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
import type { AgentDef } from './schema.js';
/** 技能加载入口工具名（dsh tool-skill 注册名）。 */
export declare const SKILL_TOOL = "skill";
/** 协作工具名（本插件注册的 meow_agent_call，见 T-05）。 */
export declare const AGENT_CALL_TOOL = "meow_agent_call";
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
export declare const DEFAULT_VISIBLE_TOOL_NAMES: readonly string[];
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
export declare function resolveVisibleToolNames(liveNames: readonly string[]): string[];
/** MCP 工具名前缀构造：`mcp__<server>__`。 */
export declare function mcpToolPrefix(server: string): string;
/** 编译选项：strict 模式（默认）下做存在性过滤；loose 模式向后兼容。 */
export interface CompileOptions {
    /**
     * 是否校验工具名存在性（仅保留 toolNames 索引中存在的工具名）：
     *   true  → 未知工具名不入白名单，收集到返回值 unknownTools；
     *   false → 全部加入（向后兼容；保留旧测试用例 + 自定义角色兜底行为）。
     * 缺省 true：R-05 修复默认值（避免 restrict 误抛未知工具名）。
     */
    strict?: boolean;
}
/** 编译结果（白名单 + 未知工具名列表，便于上层抛 AgentCallError）。 */
export interface CompiledAllowedTools {
    /** 去重保序的白名单（含 `meow_agent_call` 协作工具；strict 模式仅含索引中存在的工具名）。 */
    allow: string[];
    /** strict 模式收集到的未知工具名（按 def 声明顺序；loose 模式恒为空）。 */
    unknownTools: string[];
}
/**
 * 编译 Agent 定义的授权清单为工具级白名单（去重、保序）。
 * @param def       规范化后的 Agent 定义。
 * @param toolNames 已注册工具名快照（可选；MCP 展开需要它精确枚举
 *   `mcp__<server>__<tool>`，缺省时 allowedMcps 不展开——不静默加入不确定名）。
 * @param options   编译选项（strict 模式：仅保留索引中存在的工具名 + 未知名收集）。
 * @returns 白名单数组 + 未知工具名列表（详见 CompiledAllowedTools）。
 */
export declare function compileAllowedTools(def: AgentDef, toolNames?: readonly string[], options?: CompileOptions): string[];
/**
 * 编译 Agent 定义并返回完整结果（含 unknownTools）。
 * 供 T-05 meow_agent_call 在 strict 模式 + 未注册工具名场景抛 AgentCallError('UNKNOWN_TOOL')
 * 使用，与 compileAllowedTools 共享实现细节（仅返回值多 unknownTools 字段）。
 */
export declare function compileAllowedToolsDetailed(def: AgentDef, toolNames?: readonly string[], options?: CompileOptions): CompiledAllowedTools;
/**
 * AgentManager —— Agent 定义授权编译器（T-04 交付）。
 *
 * 持有可选工具名索引快照；T-05 meow_agent_call 执行时经 `withToolNames()` 注入
 * 实时工具名（ctx.tools.schemas() 枚举），再调用 compileAllowedTools 生成白名单。
 */
export declare class AgentManager {
    private toolNames?;
    constructor(options?: {
        toolNames?: readonly string[];
    });
    /** 注入/替换工具名索引快照（返回 this，链式）。 */
    withToolNames(toolNames: readonly string[]): this;
    /** 当前工具名索引（可空）。 */
    currentToolNames(): readonly string[] | undefined;
    /**
     * 编译授权白名单（含 meow_agent_call）。
     * 读取 def.compileOptions?.strict 控制是否存在性过滤（R-05 T-04/2 a）。
     * @param def 规范化后的 Agent 定义。
     * @returns 白名单数组。
     */
    compileAllowedTools(def: AgentDef): string[];
}
