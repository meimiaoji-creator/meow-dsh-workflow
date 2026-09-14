/**
 * meow-dsh-workflow Web 路由 —— /api/meow-workflow/* 共 7 条 JSON API。
 *
 * v2.1 既有（保持零变更）：
 *   - GET  /api/meow-workflow/roles          → launchable=true 角色列表
 *     （{ roles: [{ id, name, summary, children }] }；summary = 范式一句话，children = 子 agent 名字）
 *   - POST /api/meow-workflow/build-prompt   → 入参 { roleId, goal }，返回 { systemPrompt, userPrompt }
 *     （调用 T-06 buildRolePrompt/buildUserPrompt；成功后把角色协议注入 ctx.systemPrompt.section，
 *      旧 section 先 dispose 防累积——"以 X 角色发起"装配时生效，见 design §5 时序）
 *
 * v2 新增（T-01 交付，docs/agent-chain-ui-v2.md §6）：
 *   - GET    /api/meow-workflow/agents         → 全部 Agent 定义（含非 launchable）
 *   - POST   /api/meow-workflow/agents         → 新建（body=AgentDefInput → { agent } / 409）
 *   - PUT    /api/meow-workflow/agents/:id     → 更新（id 不可改；400/404）
 *   - DELETE /api/meow-workflow/agents/:id     → 删除（{ ok: true } / 404）
 *   - GET    /api/meow-workflow/tools          → 授权勾选枚举（{ tools, skills, mcps }）
 *
 * T-06 新增（agent-chain-ui-v2.md §4 + §7）：Agent 管理自包含单页。
 *   - GET exact /meow-workflow/agents           → HTML 单页（static.ts 提供）
 *     （不抢 registerFallback，仅 exact 注册；与 /api 前缀路由分离——客户端 /agents 是页面，
 *      /api/meow-workflow/agents 是 JSON；两条不冲突。）
 *
 * 约束（与 meow-vision / meow-dsh-task 一致）：
 *   - 不抢 registerFallback，只用 prefix 命名路由；同源（http://127.0.0.1:3080），无 CORS；
 *   - 零 dsh 源码改动；ctx.webServer 类型经 @deepseek-ai/dsh-host-webserver 的 module augmentation；
 *   - 红线 8：所有入参/出参字段（角色名/范式/子 agent 名/goal/白名单/工具名/错误消息）
 *     经 escapePromptBraces/oneLine。
 *
 * 可测性：
 *   - 纯函数层：listLaunchableRoles / assemblePrompt / listAllAgents / presentAgent /
 *     groupToolNames / createAgent / updateAgent / deleteAgent / loadAllAgents（零 dsh 依赖）；
 *   - registerWebRoutes 为接入层（host mock 测试：伪 ctx 捕获 handler + 模拟 req/res）。
 */
import { resolveVisibleToolNames } from './agent-manager.js';
import { applyToolRestrictions, publishRoleGrants } from './authorization.js';
import { ensurePresetAgents } from './presets.js';
import { ROLE_PROTOCOL_ORDER, summarizePrompt, escapePromptBraces, oneLine, resolveLanguageChainRefs, mergeChildren, buildRolePrompt, buildUserPrompt, } from './protocols.js';
import { listAllAgents, createAgent, updateAgent, deleteAgent, groupToolNames, presentAgent, CrudError, } from './agents-crud.js';
import { AGENTS_INDEX_HTML, MEMORY_INDEX_HTML, LEDGER_INDEX_HTML } from './static.js';
import { listMemoryOverview } from './memory-core.js';
import { listLedgerOverview } from './ledger-store.js';
const API_PREFIX = '/api/meow-workflow';
/** Agent 管理自包含单页路由（T-06 — agent-chain-ui-v2 §4 + §7）。 */
export const AGENTS_PAGE_PATH = '/meow-workflow/agents';
/** 记忆页路径（工作流面板「记忆」tab iframe 指向；与 agents 页同款 exact 路由）。 */
export const MEMORY_PAGE_PATH = '/meow-workflow/memory';
/** 台账页路径（工作流面板「台账」tab iframe 指向；与 agents 页同款 exact 路由）。 */
export const LEDGER_PAGE_PATH = '/meow-workflow/ledger';
/** 角色协议 section 唯一名（同名重复注册 dsh 会抛错，故注册前先 dispose 旧的）。 */
export const ROLE_SECTION_NAME = 'meow-workflow.role-protocol';
/**
 * 模块级 per-session section disposer 表（sessionId → disposer）。
 *
 * R08 问题 1 修复：角色协议只注入**发起角色的那个会话**（目标 agent scope），
 * 不再注册全局 layer（旧实现注册到 root ctx → 所有会话都被注入）。
 * 每个会话独立记录 disposer，build-prompt 同一会话再次发起时先 dispose 旧的
 * （防累积/同名冲突）；会话 dispose 时其 scope 内的 section 随 agent scope 自动清理，
 * 此处 Map 条目仅作幂等兜底。引用随插件 fiber 卸载清理（registerWebRoutes 内
 * ctx.effect 注册）；调用后立即删除条目，重复调用安全（见 disposeRoleSectionFor 幂等守卫）。
 */
const roleSectionDisposers = new Map();
/**
 * 模块级 per-session 待注入登记：agent 尚未创建（全新/blank 会话）时，build-prompt
 * 挂一个一次性 `agent/created` 监听，目标会话 agent 创建后再把角色协议注入其 scope
 * （对齐 dsh 官方 file-reference 插件的 per-agent prompt 注入模式）。
 */
const pendingRoleSections = new Map();
// ---------------------------------------------------------------------------
// 纯函数层（零 dsh 依赖，独立可测）
// ---------------------------------------------------------------------------
/**
 * 剥离语言链引用形态（`<语言链引用:agent:角色名>`）与折叠空白。
 * 供角色列表 summary 降级展示（def.summary 缺省时），防止把内部编排语法暴露给用户
 * （design §7.2「对用户屏蔽 agent 细节」+ agent-chain-ui.md §3「范式一句话」人话要求）。
 * @param text 原始文本（通常为 summarizePrompt 首句）。
 * @returns 剥离引用后的干净文本（escape + 空白折叠）。
 */
export function sanitizeSummary(text) {
    return escapePromptBraces(text)
        .replace(/<语言链引用:agent:[^>]*>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}
/**
 * 过滤 launchable=true 的角色为列表项。
 * summary 对人话：优先 AgentDef.summary（预置角色人手写），
 * 缺省降级为 systemPrompt 首句再 sanitize（剥离语言链引用形态）。
 * @param defs Agent 定义库。
 * @returns 角色列表（保序，按定义顺序）。
 */
export function listLaunchableRoles(defs) {
    const out = [];
    for (const def of Object.values(defs)) {
        if (!def.launchable)
            continue;
        out.push({
            id: def.id,
            name: escapePromptBraces(def.name),
            summary: def.summary !== undefined
                ? escapePromptBraces(def.summary)
                : sanitizeSummary(summarizePrompt(def.systemPrompt)),
            children: def.children.map(c => escapePromptBraces(c.name)),
        });
    }
    return out;
}
/**
 * 组装提示词（T-06 协议层编排）：语言链引用解析 → 目录合并 → 授权编译 → 系统/用户提示词。
 * @param defs      Agent 定义库。
 * @param roleId    发起角色 id。
 * @param goal      用户目标（必填非空由调用方校验）。
 * @returns 提示词对；角色不存在返回 null。
 */
export function assemblePrompt(defs, roleId, goal) {
    const def = defs[roleId];
    if (def === undefined)
        return null;
    const merged = mergeChildren(def.children, resolveLanguageChainRefs(def.systemPrompt, defs));
    return {
        // R09：buildRolePrompt 不再注入权限白名单——授权由清单裁剪（restrict + 技能目录过滤）保证。
        systemPrompt: buildRolePrompt(def, merged),
        userPrompt: buildUserPrompt(def, goal),
    };
}
// ---------------------------------------------------------------------------
// HTTP 接入层（host mock 可测）
// ---------------------------------------------------------------------------
function sendJson(res, status, json) {
    res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
    });
    res.end(JSON.stringify(json));
}
/** 读请求体并 JSON.parse；空体 → undefined，非法 JSON → reject。 */
function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', (chunk) => { data += chunk.toString('utf8'); });
        req.on('end', () => {
            try {
                resolve(data.trim() === '' ? undefined : JSON.parse(data));
            }
            catch {
                reject(new Error('请求体不是合法 JSON'));
            }
        });
        req.on('error', reject);
    });
}
/** 安全读取工具名快照（tools 服务不可用时降级空索引，allowedMcps 不展开）。 */
function safeToolNames(ctx) {
    try {
        const schemas = ctx.tools?.schemas;
        return typeof schemas === 'function' ? schemas().map(s => s.name) : [];
    }
    catch {
        return [];
    }
}
/**
 * 清理某会话的角色协议注入/登记（幂等）：先释放已注入的 section disposer，再 detach
 * 未创建时的 agent/created 登记；各自调用前先删 Map 条目，重复调用安全；释放期异常吞掉
 * （Cordis 二次 dispose 行为未验证——热重载/卸载后旧 disposer 可能已失效，不允许其破坏
 * 后续 build-prompt）。
 * @param sessionId 目标会话 id（Map 键）。
 */
function cleanupRoleSectionFor(sessionId) {
    const disposer = roleSectionDisposers.get(sessionId);
    if (disposer !== undefined) {
        roleSectionDisposers.delete(sessionId);
        try {
            disposer();
        }
        catch {
            // 旧 ctx 已释放的 disposer 重复调用抛错：吞掉，保证后续 build-prompt 不受影响。
        }
    }
    const pending = pendingRoleSections.get(sessionId);
    if (pending !== undefined) {
        pendingRoleSections.delete(sessionId);
        try {
            pending.detach();
        }
        catch {
            // 监听已失效（fiber 卸载）→ 吞掉。
        }
    }
}
/**
 * 对目标 agent 应用完整角色上下文（R08 问题 1 + R09 授权裁剪，返回统一 disposer）：
 *   1. 工具/MCP 授权裁剪：`tools.restrict({ allow: compileAllowedTools(def) })`（authorization）。
 *   2. 角色协议 section 注入 agent.ctx（只对该 agent 的 prompt assemble 可见）。
 *   3. 角色授权数据发布到 agent.ctx（技能目录过滤 + dsh-meow-skill 远程技能裁剪）。
 * 任一步失败只影响该步（restrict 失败降级不裁剪；section 失败跳过），整体不抛。
 * @param agent       目标 agent（scoped ctx）。
 * @param def         角色 AgentDef。
 * @param toolNames   工具名索引（restrict 的 strict 校验）。
 * @param sectionText 角色协议系统提示词（buildRolePrompt 产物）。
 * @returns disposer（解除 restrict + 移除 section；换角色时先 dispose 旧的）。
 */
function applyAgentRoleContext(agent, def, toolNames, sectionText) {
    const disposers = [];
    disposers.push(applyToolRestrictions(agent, def, toolNames));
    try {
        disposers.push(agent.ctx.systemPrompt.section({
            name: ROLE_SECTION_NAME,
            order: ROLE_PROTOCOL_ORDER,
            text: sectionText,
        }));
    }
    catch {
        // section 注入失败（同名冲突/服务不可用）→ 跳过，不影响 restrict/grants。
    }
    publishRoleGrants(agent, { roleId: def.id, allowedSkills: def.allowedSkills });
    return () => {
        for (const d of disposers) {
            try {
                d();
            }
            catch { /* 幂等 dispose */ }
        }
    };
}
/**
 * 把角色上下文（section + 授权裁剪 + grants）应用到**目标会话**的 agent scope。
 *
 * R08 问题 1：不注册全局 layer（root ctx 的 section 会让所有会话都带上协议）；经
 * `ctx.agents.get(sessionId)` 定位发起会话的 agent，注册到 `agent.ctx`（agent 的 scoped
 * context）——只有该 agent 的 assemble（scope=agent）看到协议、工具被裁剪。
 * 会话 dispose → agent scope unwind → section/restrict 自动消失。
 *
 * R09：工具/MCP 由 `tools.restrict` 真实裁剪（主 agent），子 agent 由 meow_agent_call 的
 * toolFilter 等效裁剪；grants 发布供技能目录过滤（本地拦截 + 远程 provider 读取）。
 *
 * 目标 agent 尚未创建（全新/blank 会话）时，登记一次性 `agent/created` 监听，等该会话
 * agent 创建后再应用——对齐 dsh 官方 file-reference 插件 per-agent prompt 注入模式。
 * 无法登记（无 ctx.on）时跳过并警告——宁可少注入，也不可错注入到其他会话。
 *
 * @param ctx         Cordis 上下文（agents / systemPrompt / 事件服务）。
 * @param sessionId   发起会话 id（前端 buildAndSend 传入；空则跳过注入）。
 * @param def         角色 AgentDef（授权清单 + grants）。
 * @param toolNames   工具名索引（restrict 的 strict 校验）。
 * @param sectionText 角色协议系统提示词。
 * @returns 是否成功应用/已登记。
 */
function installRoleSection(ctx, sessionId, def, toolNames, sectionText) {
    const targetId = sessionId?.trim() ?? '';
    if (targetId === '') {
        ctx.logger?.warn?.('[meow-dsh-workflow] build-prompt 未携带 sessionId，跳过角色上下文应用');
        return false;
    }
    // 先清理该会话旧的注入/登记（幂等，防累积；换角色时解除旧 restrict/section）。
    cleanupRoleSectionFor(targetId);
    // 1) agent 已存在（会话已激活）→ 立即应用。
    let agent;
    try {
        agent = typeof ctx.agents?.get === 'function' ? ctx.agents.get(targetId) : undefined;
    }
    catch {
        agent = undefined;
    }
    if (agent !== undefined) {
        try {
            roleSectionDisposers.set(targetId, applyAgentRoleContext(agent, def, toolNames, sectionText));
            return true;
        }
        catch (err) {
            ctx.logger?.warn?.(`[meow-dsh-workflow] 角色上下文应用失败: ${oneLine(err.message ?? String(err))}`);
            return false;
        }
    }
    // 2) agent 未创建 → 登记一次性 agent/created 监听（仅目标会话；应用后自动 detach）。
    if (typeof ctx.on !== 'function') {
        ctx.logger?.warn?.(`[meow-dsh-workflow] 会话 ${escapePromptBraces(targetId)} 无对应 agent 且无法登记创建监听，跳过应用`);
        return false;
    }
    const holder = { detached: false };
    const detach = ctx.on('agent/created', (event) => {
        const a = event?.agent;
        if (holder.detached || a === undefined || String(a.id) !== targetId)
            return;
        holder.detached = true;
        cleanupRoleSectionFor(targetId);
        try {
            roleSectionDisposers.set(targetId, applyAgentRoleContext(a, def, toolNames, sectionText));
        }
        catch (err) {
            ctx.logger?.warn?.(`[meow-dsh-workflow] 角色上下文应用失败: ${oneLine(err.message ?? String(err))}`);
        }
    });
    pendingRoleSections.set(targetId, { detach });
    return true;
}
/**
 * 把角色上下文直接应用到**给定 agent**的 scope（斜杠命令发起路径，commands.ts 调用）。
 *
 * 与 installRoleSection 同核（applyAgentRoleContext），差别只在定位方式：命令
 * handler 手里就是 live agent（invocation.agent），无需再经 ctx.agents.get 二次
 * 解析。同样先 cleanup 该会话旧注入（防累积/换角色解除旧 restrict），disposer
 * 记入同一张 roleSectionDisposers 表（会话 dispose 随 agent scope 自动清理）。
 * @param ctx         Cordis 上下文（仅用 logger）。
 * @param agent       目标 agent（live handle，invocation.agent）。
 * @param def         角色 AgentDef。
 * @param toolNames   工具名索引（restrict 的 strict 校验）。
 * @param sectionText 角色协议系统提示词。
 * @returns 是否成功应用（失败仅告警，调用方降级继续发起）。
 */
export function installRoleContextForAgent(ctx, agent, def, toolNames, sectionText) {
    const targetId = String(agent.id);
    cleanupRoleSectionFor(targetId);
    try {
        roleSectionDisposers.set(targetId, applyAgentRoleContext(agent, def, toolNames, sectionText));
        return true;
    }
    catch (err) {
        ctx.logger?.warn?.(`[meow-dsh-workflow] 角色上下文应用失败: ${oneLine(err.message ?? String(err))}`);
        return false;
    }
}
/** /api/meow-workflow/* 统一分发。 */
async function handleApi(req, res, ctx, loadDefs, root, onAgentsChanged) {
    const url = new URL(req.url ?? '/', 'http://x');
    const path = url.pathname;
    try {
        // ---- 角色列表（v2.1 既有，零变更）----
        if (req.method === 'GET' && path === `${API_PREFIX}/roles`) {
            const defs = await loadDefs();
            sendJson(res, 200, { roles: listLaunchableRoles(defs) });
            return;
        }
        // ---- 组装提示词（v2.1 既有，零变更）----
        if (req.method === 'POST' && path === `${API_PREFIX}/build-prompt`) {
            let body;
            try {
                body = await readJsonBody(req);
            }
            catch (err) {
                sendJson(res, 400, { error: oneLine(err.message) });
                return;
            }
            const raw = (body ?? {});
            const roleId = typeof raw.roleId === 'string' ? raw.roleId.trim() : '';
            const goal = typeof raw.goal === 'string' ? raw.goal.trim() : '';
            // R08 问题 1 修复：前端 buildAndSend 携带发起会话 id，node 端据此把角色协议
            // 注入到该会话的 agent scope（installRoleSection）；未携带则仅返回提示词、不注入。
            const sessionId = typeof raw.sessionId === 'string' ? raw.sessionId.trim() : '';
            if (roleId === '') {
                sendJson(res, 400, { error: 'roleId 不能为空' });
                return;
            }
            if (goal === '') {
                sendJson(res, 400, { error: 'goal 不能为空' });
                return;
            }
            const defs = await loadDefs();
            const payload = assemblePrompt(defs, roleId, goal);
            if (payload === null) {
                sendJson(res, 404, { error: `角色不存在: ${oneLine(roleId)}` });
                return;
            }
            // 以「roleId」角色发起：角色上下文（协议 section + 工具/MCP 授权裁剪 restrict + grants）
            // 只应用到发起会话的 agent scope（R08/R09），UI 只负责发送用户消息。
            const def = defs[roleId];
            const toolNames = (await enumerateToolSchemas(ctx)).map(s => s.name);
            installRoleSection(ctx, sessionId === '' ? undefined : sessionId, def, toolNames, payload.systemPrompt);
            sendJson(res, 200, { systemPrompt: payload.systemPrompt, userPrompt: payload.userPrompt });
            return;
        }
        // ---- Agent 定义全量列表（T-01：含非 launchable）----
        // 注：与 GET /roles 共用 loadDefs 入口，保证两路由视图一致（同一份 defs 同一时间点）。
        if (req.method === 'GET' && path === `${API_PREFIX}/agents`) {
            const defs = await loadDefs();
            sendJson(res, 200, { agents: listAllAgents(defs) });
            return;
        }
        // ---- 项目记忆总览（「记忆」tab：全部项目的各角色记忆清单，只读）----
        if (req.method === 'GET' && path === `${API_PREFIX}/memory`) {
            sendJson(res, 200, await listMemoryOverview(root));
            return;
        }
        // ---- 项目台账总览（「台账」tab：全部项目的各簿记录清单，只读）----
        if (req.method === 'GET' && path === `${API_PREFIX}/ledger`) {
            sendJson(res, 200, await listLedgerOverview(root));
            return;
        }
        // ---- Agent 新建（T-01）----
        if (req.method === 'POST' && path === `${API_PREFIX}/agents`) {
            let body;
            try {
                body = await readJsonBody(req);
            }
            catch (err) {
                sendJson(res, 400, { error: oneLine(err.message) });
                return;
            }
            try {
                const defs = await loadDefs();
                const created = await createAgent(defs, body, root);
                sendJson(res, 201, { agent: presentAgent(created) });
                // 角色库变更 → 斜杠命令集重同步（新 launchable 角色出现 / 旧角色摘要变化）。
                onAgentsChanged?.();
            }
            catch (err) {
                sendCrudError(res, err);
            }
            return;
        }
        // ---- Agent 更新（T-01：/agents/:id）----
        // 精确匹配 /api/meow-workflow/agents/<id>（id 非空、不含斜杠；解码后 trim 校验由 updateAgent 处理）
        const updateMatch = path.match(/^\/api\/meow-workflow\/agents\/([^/]+)$/);
        if (updateMatch !== null && req.method === 'PUT') {
            const id = decodeURIComponent(updateMatch[1]);
            let body;
            try {
                body = await readJsonBody(req);
            }
            catch (err) {
                sendJson(res, 400, { error: oneLine(err.message) });
                return;
            }
            try {
                const defs = await loadDefs();
                const updated = await updateAgent(defs, id, body, root);
                sendJson(res, 200, { agent: presentAgent(updated) });
                onAgentsChanged?.();
            }
            catch (err) {
                sendCrudError(res, err);
            }
            return;
        }
        // ---- Agent 删除（T-01：/agents/:id）----
        if (updateMatch !== null && req.method === 'DELETE') {
            const id = decodeURIComponent(updateMatch[1]);
            try {
                const defs = await loadDefs();
                const removed = await deleteAgent(defs, id, root);
                sendJson(res, 200, { ok: true, removed: oneLine(removed) });
                onAgentsChanged?.();
            }
            catch (err) {
                sendCrudError(res, err);
            }
            return;
        }
        // ---- 工具注册表授权枚举（T-01：ctx.tools.schemas() 分组；R-06 T-01/4 空注册表 fallback）----
        // R08 问题 2 修复：skills 组改为具体技能名（dsh 原生本地技能 + meow 远程技能，
        // 经技能注册表 ctx.skills 枚举，而非工具注册表里的 `skill` 入口）。
        // R10 模型选择：models 组 = LLM 提供方模型目录（`provider/model` 串，供管理页模型 datalist）。
        if (req.method === 'GET' && path === `${API_PREFIX}/tools`) {
            const schemas = await enumerateToolSchemas(ctx);
            const group = groupToolNames(schemas);
            const skillNames = await enumerateSkillNames(ctx);
            // 技能注册表可用时以具体技能名覆盖 skills 组（含本地 + 远程，去重保序）；
            // 不可用（服务缺失）时回退 groupToolNames 原逻辑（skill 入口，向后兼容）。
            if (skillNames !== undefined)
                group.skills = skillNames;
            const models = await enumerateModelNames(ctx);
            sendJson(res, 200, { ...group, models });
            return;
        }
        sendJson(res, 404, { error: 'Not Found' });
    }
    catch (error) {
        sendJson(res, 500, { error: error instanceof Error ? oneLine(error.message) : String(error) });
    }
}
/**
 * 把 CrudError 映射为 HTTP 响应；其他未知异常 → 500。
 * 错误 message 走 oneLine + escapePromptBraces 防 ASCII 双花括号外溢（红线 8）。
 * @param res ServerResponse。
 * @param err 抛出的未知异常（CrudError 或其他）。
 */
function sendCrudError(res, err) {
    if (err instanceof CrudError) {
        sendJson(res, err.code, { error: err.message });
        return;
    }
    if (err instanceof Error) {
        sendJson(res, 500, { error: oneLine(err.message) });
        return;
    }
    sendJson(res, 500, { error: oneLine(String(err)) });
}
/** 安全读取工具 schema 列表（ctx.tools 不可用时降级空列表）。 */
function safeToolSchemas(ctx) {
    try {
        const schemas = ctx.tools?.schemas;
        if (typeof schemas !== 'function')
            return [];
        return schemas();
    }
    catch {
        return [];
    }
}
/**
 * R-06 T-01/4 + R-07 T-05/2 修复：/tools 与 build-prompt 的可见工具名解析。
 *
 * web profile 的 host 平面工具注册表为空或缺标准工具名（tool-fs/tool-bash/tool-pwsh/
 * tool-skill/tool-subagent/tool-todo/tool-web 等被 disabled，由 agent preset 每会话挂载）；
 * root scope 的 node:http handler 看不到这些会话级挂载。
 *
 * 兜底策略：实时枚举 ∪ 默认授权工具清单（DEFAULT_VISIBLE_TOOL_NAMES，dsh 公开标准工具名），
 * 与 preset 实际挂载匹配；T-06 管理页授权勾选区基于此清单渲染（用 dsh 通用名而不是 schema
 * 枚举名，避免工具名高频变动导致管理页失效）。清单与合并逻辑集中在 agent-manager.ts
 * （resolveVisibleToolNames），meow_agent_call 执行路径（tools.ts toolNames）共用同一口径，
 * 消除 R-07 T-05/2 发现的「web-routes 有兜底、工具执行无兜底」不一致。
 *
 * @param ctx Cordis 上下文（root scope，工具注册表可能为空或缺标准名）。
 * @returns 可见工具 schema 列表（实时优先，缺失标准名并入默认清单）。
 */
function visibleToolSchemas(ctx) {
    return resolveVisibleToolNames(safeToolSchemas(ctx).map(s => s.name)).map(name => ({ name }));
}
/**
 * R09 修复：/tools 授权枚举与 build-prompt 工具名索引改用**全可见工具**枚举。
 *
 * web profile 的工具注册表是 layered：host 插件工具（meow_agent_call、meow_vision、
 * meow_preview 等）在 root 可见，preset 标准工具（tool-fs/tool-bash 等）挂载到各会话
 * agent scope。仅 root + 默认清单会漏掉 agent scope 的工具（如 meow 系列插件工具在
 * preset/agent 可见层），导致管理页无法授权这些工具。本函数合并：root scope（global 层）
 * ∪ 各活跃 agent scope（preset 层 + agent 可见工具）∪ 默认清单（兜底），去重保序。
 *
 * @param ctx Cordis 上下文（tools / agents 服务）。
 * @returns 可见工具 schema 列表（root + 各 agent scope + 默认兜底，去重）。
 */
export async function enumerateToolSchemas(ctx) {
    const names = new Set();
    const out = [];
    const push = (name) => {
        if (name === '' || names.has(name))
            return;
        names.add(name);
        out.push({ name });
    };
    // 1. root scope（global 层：host 插件工具）
    for (const s of safeToolSchemas(ctx))
        push(typeof s?.name === 'string' ? s.name : '');
    // 2. 各活跃 agent scope（preset 层工具 + agent 可见工具；meow 系列插件工具若挂在此层也覆盖）
    try {
        if (typeof ctx.agents?.list === 'function') {
            for (const agent of ctx.agents.list()) {
                try {
                    const schemas = agent.ctx.tools?.schemas?.();
                    if (Array.isArray(schemas))
                        for (const s of schemas)
                            push(typeof s?.name === 'string' ? s.name : '');
                }
                catch {
                    // 单个 agent 工具枚举失败忽略（防御）。
                }
            }
        }
    }
    catch {
        // agents 服务不可用忽略（防御）。
    }
    // 3. 默认清单兜底（web profile 注册表空时补标准工具名）
    return resolveVisibleToolNames(out.map(s => s.name)).map(name => ({ name }));
}
/**
 * R08 问题 2 修复：枚举管理页可授权的**具体技能名**（dsh 本地技能 + meow 远程技能）。
 *
 * web profile 的 skills 注册表是 host+per-scope layered：meow 远程技能 provider
 * （skill-meow）注册在 global 层（root 可见）；dsh 本地技能（skill-filesystem）由
 * agent preset 注册到各会话的 agent scope（root 不可见）。故分两路枚举：
 *   1. root scope `ctx.skills.list()` —— global 层（远程技能 + host 层 provider）；
 *   2. 每个活跃 agent 的 `agent.ctx.skills.list({ scope: agent, cwd })` —— preset 层
 *      （本地技能；scope 链含 global 层，远程技能一并可见），按技能名去重保序。
 * 仅收集 modelInvocable 的技能（模型可经 skill 工具加载的）；服务不可用
 * （测试 mock 缺 skills/agents）返回 undefined，调用方回退旧逻辑。
 */
async function enumerateSkillNames(ctx) {
    const seen = new Set();
    const names = [];
    const push = (s) => {
        if (typeof s?.name !== 'string' || s.name === '')
            return;
        if (s.invocation?.modelInvocable === false)
            return;
        if (seen.has(s.name))
            return;
        seen.add(s.name);
        names.push(s.name);
    };
    // 记录是否至少有一个技能来源可访问（决定回退 vs 空结果）。
    let anySource = false;
    // 1. global 层（root scope）：meow 远程技能 + host 层 provider
    if (typeof ctx.skills?.list === 'function') {
        anySource = true;
        try {
            const rootList = await ctx.skills.list();
            if (Array.isArray(rootList))
                for (const s of rootList)
                    push(s);
        }
        catch (err) {
            // 单点失败不整体回退：跳过全局来源，继续各会话技能。
            ctx.logger?.warn?.(`[meow-dsh-workflow] 枚举全局技能失败（忽略）: ${oneLine(err.message ?? String(err))}`);
        }
    }
    else {
        ctx.logger?.warn?.('[meow-dsh-workflow] ctx.skills 服务不可用，跳过全局技能枚举');
    }
    // 2. 各活跃 agent scope：preset 层本地技能（scope 链含 global 层）
    if (typeof ctx.agents?.list === 'function') {
        anySource = true;
        try {
            for (const agent of ctx.agents.list()) {
                try {
                    const cwd = agent.session?.header?.cwd;
                    const list = await agent.ctx.skills?.list({
                        scope: agent,
                        ...(typeof cwd === 'string' && cwd !== '' ? { cwd } : {}),
                    });
                    if (Array.isArray(list))
                        for (const s of list)
                            push(s);
                }
                catch (err) {
                    // 单个 agent 的技能枚举失败不影响其他 agent / 全局来源。
                    ctx.logger?.warn?.(`[meow-dsh-workflow] 枚举某会话技能失败（忽略）: ${oneLine(err.message ?? String(err))}`);
                }
            }
        }
        catch (err) {
            ctx.logger?.warn?.(`[meow-dsh-workflow] 遍历活跃 agent 失败（忽略）: ${oneLine(err.message ?? String(err))}`);
        }
    }
    else {
        ctx.logger?.warn?.('[meow-dsh-workflow] ctx.agents 服务不可用，跳过会话技能枚举');
    }
    // 有任一技能来源（即使结果为空）→ 返回枚举结果（管理页显示具体技能或"暂无"）；
    // 两个服务都不可访问 → 返回 undefined，调用方回退旧逻辑（skill 入口）。
    return anySource ? names : undefined;
}
/**
 * R10 模型选择：枚举管理页模型选择器（datalist）可选的模型目录。
 * 走 dsh 官方 catalog 同款 API（session-controller catalog.ts）：ctx.llm.listProviders()
 * （同步）→ 每 provider ctx.llm.listModels(id)（异步），产出 `provider/model` 串——
 * 多 provider 部署下裸 model id 有歧义，带 provider 前缀才能跨厂商路由（管理页提交时
 * 拆开存 AgentDef.{provider,model}，执行链 tools-core 组装 agentOptions 两者并传）。
 * 防御：llm 服务缺失（测试 mock / 非 web profile）→ 空数组（模型框退化为自由输入=旧行为）；
 * 单 provider 目录失败 → 跳过该 provider（与 dsh buildModelCatalog 的 per-provider 容错同款）。
 * @param ctx Cordis 上下文（llm 服务；'llm' 已在 index.ts inject 声明）。
 * @returns `provider/model` 串数组（去重保序，escape 防御红线 8）。
 */
export async function enumerateModelNames(ctx) {
    const out = [];
    const seen = new Set();
    // 服务缺失守卫：mock ctx（普通对象）上 llm 为 undefined；真实 cordis ctx 已 inject。
    if (typeof ctx.llm?.listProviders !== 'function' || typeof ctx.llm?.listModels !== 'function') {
        return out;
    }
    let providers;
    try {
        providers = ctx.llm.listProviders();
    }
    catch {
        return out;
    }
    if (!Array.isArray(providers))
        return out;
    for (const provider of providers) {
        const providerId = provider?.id;
        if (typeof providerId !== 'string' || providerId === '')
            continue;
        try {
            const models = await ctx.llm.listModels(providerId);
            if (!Array.isArray(models))
                continue;
            for (const model of models) {
                const modelId = model?.id;
                if (typeof modelId !== 'string' || modelId === '')
                    continue;
                const key = escapePromptBraces(`${providerId}/${modelId}`);
                if (key === '' || seen.has(key))
                    continue;
                seen.add(key);
                out.push(key);
            }
        }
        catch (err) {
            // 单 provider 目录枚举失败忽略（其他 provider 不受影响）。
            ctx.logger?.warn?.(`[meow-dsh-workflow] 枚举 provider「${providerId}」模型目录失败（忽略）: ${oneLine(err.message ?? String(err))}`);
        }
    }
    return out;
}
/**
 * Agent 管理页 handler（T-06 — static.ts 自包含单页）。
 * 仅 GET/HEAD → 200 text/html；其余 405。
 * 与 prefix /api/meow-workflow/agents 完全分离（路径不同：exact /meow-workflow/agents vs
 * prefix /api/meow-workflow/agents），注册路由不冲突。
 */
function handleAgentsPage(req, res) {
    const method = req.method ?? 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
        res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Method Not Allowed');
        return;
    }
    res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
    });
    res.end(AGENTS_INDEX_HTML);
}
/**
 * 记忆页 handler（工作流面板「记忆」tab —— static.ts 自包含单页，只读总览）。
 * 行为与 handleAgentsPage 同款：GET/HEAD → 200 text/html，其余 405。
 */
function handleMemoryPage(req, res) {
    const method = req.method ?? 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
        res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Method Not Allowed');
        return;
    }
    res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
    });
    res.end(MEMORY_INDEX_HTML);
}
/**
 * 台账页 handler（工作流面板「台账」tab —— static.ts 自包含单页，只读总览）。
 * 行为与 handleAgentsPage 同款：GET/HEAD → 200 text/html，其余 405。
 */
function handleLedgerPage(req, res) {
    const method = req.method ?? 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
        res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Method Not Allowed');
        return;
    }
    res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
    });
    res.end(LEDGER_INDEX_HTML);
}
/**
 * 注册 Web 路由（/api/meow-workflow/*）。
 * @param ctx     Cordis 上下文（webServer / systemPrompt / tools 服务）。
 * @param options 可选：loadDefs / root 覆盖（测试传 os.tmpdir 隔离库）。
 */
export function registerWebRoutes(ctx, options = {}) {
    const root = options.root;
    const loadDefs = options.loadDefs ?? (() => ensurePresetAgents(root));
    const onAgentsChanged = options.onAgentsChanged;
    // R02-01：插件卸载/热重载时清空模块级 disposer 引用——旧 ctx 的 section 注册随 fiber
    // 释放（UNLOADING 逆序执行 disposer），清引用防止重装后对已失效 disposer 的重复调用；
    // pending 登记（agent/created 监听）一并 detach，防监听泄漏。
    ctx.effect(() => () => {
        roleSectionDisposers.clear();
        pendingRoleSections.clear();
    });
    ctx.webServer.register({
        kind: 'prefix',
        path: API_PREFIX,
        // 返回 promise：node http 忽略返回值，但让测试可 await 完整处理链。
        handler: (req, res) => handleApi(req, res, ctx, loadDefs, root, () => {
            // 钩子异常吞掉：命令集重同步失败不影响 CRUD 响应（R08 守则 8 降级）。
            try {
                onAgentsChanged?.();
            }
            catch (err) {
                ctx.logger?.warn?.(`[meow-dsh-workflow] onAgentsChanged 钩子执行失败（忽略）: ${oneLine(err.message ?? String(err))}`);
            }
        }),
    });
    // T-06：Agent 管理自包含单页（exact /meow-workflow/agents，独立路由不与 prefix /api/... 冲突）
    ctx.webServer.register({
        kind: 'exact',
        path: AGENTS_PAGE_PATH,
        handler: handleAgentsPage,
    });
    // 记忆页（exact /meow-workflow/memory，「记忆」tab iframe 指向）
    ctx.webServer.register({
        kind: 'exact',
        path: MEMORY_PAGE_PATH,
        handler: handleMemoryPage,
    });
    // 台账页（exact /meow-workflow/ledger，「台账」tab iframe 指向）
    ctx.webServer.register({
        kind: 'exact',
        path: LEDGER_PAGE_PATH,
        handler: handleLedgerPage,
    });
}
