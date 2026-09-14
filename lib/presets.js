/**
 * meow-dsh-workflow 预置角色定义 —— 6 个 Agent 定义（T-07 交付）。
 *
 * 数据源：插件根目录 `agents.json`（与本插件存储层读写的运行时 agents.json **完全同构**，
 * 字段全显式、键 = AgentDef.id）。因此初始配置可以直接用运行时 agents.json 的形态来编辑 /
 * 人工回归：改完 `$DSH_HOME/meow-dsh-workflow/agents.json` 后，把内容拷回本文件即可作为
 * 新的初始预置（下次 agents.json 缺失时种入）。
 *
 * 覆盖设计文档两场景（docs/agent-chain-design.md §2.1/§2.2/§14）：
 *   - 研发链路：研发负责人（launchable）→ 研发工程师 / 评审专家；
 *   - 头脑风暴：头脑风暴主持人（launchable）→ 智囊团·第一性原理 / 结论整理员。
 *
 * 研发链路协作对齐 pm-subagent-orchestration（远程技能）核心逻辑：
 *   - 负责人 = PM：只做项目管理（认领/分批派发/状态追踪/评审调度/交接），不亲自写码/评审；
 *     分批派发（约 5 个功能接近任务/批、批内串行）→ 每任务派发前 claim → 追踪
 *     （checkpoint/status/handoff/registry）→ 评审（易错任务专项 + 阶段边界收口）→
 *     issue 回流原任务子 agent（agentRunId 续聊）→ 复评 RECHECK → resolve → done → 最终验收；
 *   - 工程师 = 开发子 agent：按任务 brief 实现 + 编译测试通过 + 结构化报告
 *     （TASK/STATUS/FILES/COMPILE/TESTS/KEY-DECISIONS/API-SURFACE/REMAINING）+ 分工边界 +
 *     上下文纪律 + issue 回流修复（FIXED-ISSUES）+ 断点续跑；
 *   - 评审专家 = 评审子 agent：只读评审、不写码不跑编译、输出 REVIEW/VERDICT/ISSUES/SUMMARY、
 *     复评 RECHECK/VERDICT/PER-ISSUE/REGRESSION。
 *
 * 红线 8（附录 A）：agents.json 所有字段值（systemPrompt / name / children description）
 * 严格不含 ASCII 双花括号占位符形态——它们最终会拼进 prompt 装配链路，出现即触发
 * dsh 严格插值校验失败。语言链引用用 `<语言链引用:agent:角色名>` 尖括号形态
 * （由 T-06 resolveLanguageChainRefs 解析为子 agent 目录）。
 *
 * 接入：storage.loadAgentDefs(root, PRESET_AGENTS) 首次加载种入并落盘（幂等）；
 * 本模块导出 ensurePresetAgents(root?) 便捷封装，apply / web route 共用。
 *
 * 加载防御：agents.json 缺失/解析失败 → 返回空库 + console.warn（失败降级不崩），
 * 不做内联默认值兜底（单一数据源，避免与 JSON 双份漂移）。
 */
import { readFileSync } from 'node:fs';
import { loadAgentDefs } from './storage.js';
/** 初始配置 JSON 路径（插件根目录，相对编译产物 lib/ 上溯一级；src/ 下同理）。 */
const PRESETS_FILE_URL = new URL('../agents.json', import.meta.url);
/** 从插件根 agents.json 读取预置角色（AgentDefInput 形态；失败降级为空库）。 */
function loadPresetAgents() {
    try {
        const raw = readFileSync(PRESETS_FILE_URL, 'utf8');
        const parsed = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            throw new Error('agents.json 顶层必须是对象（Record<agentDefId, AgentDefInput>）');
        }
        return parsed;
    }
    catch (err) {
        console.warn(`[meow-dsh-workflow] 初始配置 agents.json 读取失败，预置角色为空: ${err.message}`
            + `（路径 ${PRESETS_FILE_URL.href}）`);
        return {};
    }
}
/** 预置 6 角色定义（从插件根 agents.json 加载，键 = AgentDef.id；与运行时 agents.json 同构）。 */
export const PRESET_AGENTS = loadPresetAgents();
/**
 * 确保预置角色已种入（首次加载无 agents.json 时落盘，幂等）。
 * apply 入口与 web route 共用，保证角色库始终可用。
 * @param root 数据根（缺省按 $DSH_HOME 解析；测试传 os.tmpdir() 临时目录）。
 * @returns 规范化后的 Agent 定义库。
 */
export async function ensurePresetAgents(root) {
    return loadAgentDefs(root, PRESET_AGENTS);
}
