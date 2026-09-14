/**
 * meow-dsh-workflow 浏览器半数据流 —— 角色列表 + 发起 + Agent 管理（T-09 + T-04 交付）。
 *
 * 分层约定（design §13）：browser 半只走 HTTP，禁止直接读 storage；
 * 本模块把"选角色 → 填目标 → 发起"两步流与"Agent 管理"操作流的数据动作抽为
 * 纯函数（fetchImpl / inputActions 可注入），node 半 tsc 编译到 lib/ 供测试
 * 直接 import，client 组件经相对导入调用（tsdown 打包时内联进 lib/client.js）。
 *
 * HTTP 契约（node 半 web-routes，T-08 + T-01）：
 *   GET  /api/meow-workflow/roles        → { roles: [{ id, name, summary, children }] }
 *   POST /api/meow-workflow/build-prompt → { roleId, goal } → { systemPrompt, userPrompt }
 *     （node 半已注入角色协议 section 并返回组装好的用户消息）
 *   GET  /api/meow-workflow/agents       → { agents: AgentListItem[] }
 *     （全部定义，含非 launchable，T-01）
 *   POST /api/meow-workflow/agents       → 新建（409 id 冲突 / 400 schema）
 *   PUT  /api/meow-workflow/agents/:id   → 更新（404 不存在 / 400 body.id 与 url.id 不一致）
 *   DELETE /api/meow-workflow/agents/:id → 删除（404 不存在）
 *   GET  /api/meow-workflow/tools        → { tools: string[], skills: string[], mcps: string[] }
 *     （ctx.tools.schemas() 分组，T-01）
 *
 * 红线 8：本模块不拼接 prompt 文本（userPrompt 全部来自 node 半，已 escape）；
 * 组件只做透传渲染，不引入新的占位符形态；错误 message 经 oneLine 防 ASCII 双花括号外溢。
 */
/** 全局 fetch 适配为 WorkflowFetch（浏览器环境）。 */
export const defaultFetch = (url, init) => fetch(url, init);
// ---------------------------------------------------------------------------
// 通用工具：错误信息经 oneLine 防御（红线 8）
// ---------------------------------------------------------------------------
/**
 * 从错误响应读取详情（response.text + status 拼到 message）。
 * 文本经 oneLine 防御，杜绝 ASCII 双花括号外溢。
 */
async function describeError(prefix, res) {
    const text = await res.text().catch(() => '');
    return text === ''
        ? `${prefix}（${res.status}）`
        : `${prefix}（${res.status}: ${oneLine(text)}）`;
}
/** 折叠多行文本 + 转义 ASCII 双花括号（与 protocols.oneLine 同款，供本模块复用）。 */
function oneLine(value) {
    return value.replace(/\{\{/g, '｛｛').replace(/\}\}/g, '｝｝').replace(/\s*\n+\s*/g, ' ').trim();
}
// ---------------------------------------------------------------------------
// 角色列表（v2.1 既有，T-09 沉淀）
// ---------------------------------------------------------------------------
/** 解析响应 JSON 为角色列表；非 2xx 抛错。 */
async function parseRoles(res) {
    if (!res.ok) {
        throw new Error(await describeError('角色列表加载失败', res));
    }
    const data = (await res.json());
    if (!Array.isArray(data.roles))
        throw new Error('角色列表响应格式异常');
    return data.roles;
}
/**
 * 拉取 launchable 角色列表（GET /api/meow-workflow/roles）。
 * @param fetchImpl fetch 实现（缺省全局 fetch；测试注入 mock）。
 * @returns 角色列表。
 */
export async function fetchRoles(fetchImpl = defaultFetch) {
    const res = await fetchImpl('/api/meow-workflow/roles', { method: 'GET' });
    return parseRoles(res);
}
/**
 * 发起两步流第二步：组装提示词并发送。
 * 调 POST /api/meow-workflow/build-prompt 拿到 { systemPrompt, userPrompt }（node 半把
 * 角色协议 section 注入**发起会话**的 agent scope），把 userPrompt 写入输入框并提交——
 * 用户看到的就是"以 X 角色身份"的消息。
 * @param fetchImpl    fetch 实现（缺省全局 fetch；测试注入 mock）。
 * @param inputActions 输入框 action 面（ui-conversation standard kit 的 inputActions）。
 * @param roleId       发起角色 id。
 * @param goal         用户目标文本（非空由调用方校验）。
 * @param sessionId    发起会话 id（R08 问题 1：node 半据此把角色协议注入该会话的
 *                     agent scope，只对该会话生效；缺省不注入仅返回提示词）。
 */
export async function buildAndSend(fetchImpl, inputActions, roleId, goal, sessionId) {
    const body = { roleId, goal };
    if (typeof sessionId === 'string' && sessionId.trim() !== '')
        body.sessionId = sessionId.trim();
    const res = await fetchImpl('/api/meow-workflow/build-prompt', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        throw new Error(await describeError('提示词组装失败', res));
    }
    const data = (await res.json());
    if (typeof data.userPrompt !== 'string' || data.userPrompt.trim() === '') {
        throw new Error('提示词组装响应缺少 userPrompt');
    }
    inputActions.setDraft(data.userPrompt);
    inputActions.submit();
}
// ---------------------------------------------------------------------------
// Agent 管理（T-04：Tab2 数据动作）
// ---------------------------------------------------------------------------
/** fetchAgents 的响应解析：{ agents: AgentListItem[] } → 数组；非 2xx 抛错。 */
async function parseAgents(res) {
    if (!res.ok) {
        throw new Error(await describeError('Agent 列表加载失败', res));
    }
    const data = (await res.json());
    if (!Array.isArray(data.agents))
        throw new Error('Agent 列表响应格式异常');
    return data.agents;
}
/**
 * 拉取全部 Agent 定义（GET /api/meow-workflow/agents），含 launchable=false。
 * Tab2 列表数据源；与 /roles（仅 launchable）共后端 defs 视图，由 node 半保证一致性。
 * @param fetchImpl fetch 实现（缺省全局 fetch；测试注入 mock）。
 * @returns AgentListItem 数组（已 escape；与 node 半 AgentListItem 同构）。
 */
export async function fetchAgents(fetchImpl = defaultFetch) {
    const res = await fetchImpl('/api/meow-workflow/agents', { method: 'GET' });
    return parseAgents(res);
}
/**
 * 保存 Agent：mode 决定走 POST（新建）还是 PUT（更新 /agents/:id）。
 * 非 2xx 抛错；后端错误 message 经 oneLine 防 ASCII 双花括号外溢（红线 8）。
 * @param fetchImpl fetch 实现（必填；与 P-01 既有 buildAndSend 一致）。
 * @param mode      'create' = POST /agents；'update' = PUT /agents/:id（需 id）。
 * @param body      请求体（AgentDefInput）。
 * @param id        URL 参数（仅 mode='update' 使用；缺省时回退到 body.id，由 node 半兜底校验）。
 * @returns 规范化后的 AgentDef（node 半 presentAgent 产物）。
 */
export async function saveAgent(fetchImpl, mode, body, id) {
    const init = {
        method: mode === 'create' ? 'POST' : 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    };
    const url = mode === 'create'
        ? '/api/meow-workflow/agents'
        : `/api/meow-workflow/agents/${encodeURIComponent(id ?? body.id)}`;
    const res = await fetchImpl(url, init);
    if (!res.ok) {
        throw new Error(await describeError('保存 Agent 失败', res));
    }
    const data = (await res.json());
    if (typeof data.agent !== 'object' || data.agent === null) {
        throw new Error('保存 Agent 响应缺少 agent');
    }
    return data.agent;
}
/**
 * 删除 Agent（DELETE /api/meow-workflow/agents/:id）。
 * 非 2xx 抛错（含 404 不存在）。
 * @param fetchImpl fetch 实现。
 * @param id        目标 Agent id。
 */
export async function deleteAgent(fetchImpl, id) {
    const res = await fetchImpl(`/api/meow-workflow/agents/${encodeURIComponent(id)}`, {
        method: 'DELETE',
    });
    if (!res.ok) {
        throw new Error(await describeError('删除 Agent 失败', res));
    }
}
/** fetchToolOptions 的响应解析：{ tools, skills, mcps, models, mcpTools }；非 2xx 抛错。 */
async function parseToolOptions(res) {
    if (!res.ok) {
        throw new Error(await describeError('工具授权枚举加载失败', res));
    }
    const data = (await res.json());
    return {
        tools: Array.isArray(data.tools) ? data.tools : [],
        skills: Array.isArray(data.skills) ? data.skills : [],
        mcps: Array.isArray(data.mcps) ? data.mcps : [],
        models: Array.isArray(data.models) ? data.models : [],
        // R11 MCP 工具级授权：server → 工具全名（旧后端无此键 → 空对象降级，仅 server 级勾选）
        mcpTools: data.mcpTools !== null && typeof data.mcpTools === 'object'
            ? data.mcpTools
            : {},
    };
}
/**
 * 拉取工具授权勾选枚举（GET /api/meow-workflow/tools）。
 * Tab2 编辑表单的三列数据源：系统工具名 / skill 入口 / MCP server 名（全部 escape）；
 * R11 增 mcpTools 组（server → 工具全名，MCP 列逐工具授权）。
 * 各组均已 escape（node 半 groupToolNames 分组）；前端不做去重，依赖后端静态分组保序。
 * @param fetchImpl fetch 实现（缺省全局 fetch；测试注入 mock）。
 * @returns ToolOptions（各组已 escape，后端静态分组去重保序）。
 */
export async function fetchToolOptions(fetchImpl = defaultFetch) {
    const res = await fetchImpl('/api/meow-workflow/tools', { method: 'GET' });
    return parseToolOptions(res);
}
