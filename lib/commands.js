/**
 * 角色发起斜杠命令 —— dsh 接入壳（node 半）。
 *
 * 把 commands-core 的纯逻辑接到 dsh 真实服务：
 *   - 命令注册：`ctx.commands.register`（@deepseek-ai/dsh-commands 公开插件面；
 *     客户端命令目录经 remote.commands.list 自动发现，**客户端零改动**——输入 `/`
 *     即下拉选择角色，选完认领 `/meow-workflow-<id> `，正常粘贴文件后回车执行）；
 *   - 消息投递：`createUserMessage`（@deepseek-ai/dsh-llm）+ `agent.followup/steer`
 *     （鸭子类型：live agent 运行时面；两者皆缺/抛错 → 失败结果，会话无损）；
 *   - 角色上下文 / 工具名索引 / 角色库：复用 web-routes 既有导出（与面板 build-prompt
 *     路径同核，见 commands-core.ts 头注）。
 *
 * 运行时 import（@deepseek-ai/dsh-llm）沿 tools.ts（defineTool）同款模式：插件运行在
 * dsh 模块闭包内可解析；lib 测试走 commands-core.js（零 dsh 运行时依赖）不受影响。
 */
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { ensurePresetAgents } from './presets.js';
import { enumerateToolSchemas, installRoleContextForAgent } from './web-routes.js';
import { createCommandSync, } from './commands-core.js';
export { WORKFLOW_COMMAND_PREFIX, COMMAND_INPUT_HINT, roleIdToCommandName, commandDescription, executeWorkflowLaunch, createCommandSync, } from './commands-core.js';
/**
 * 消息投递端口真实实现：createUserMessage 包装 + live agent 鸭子类型。
 * followup 优先（空闲→开新回合；忙→next-turn 排队，queue dock 原生接管）；
 * followup 缺失降级 steer；两者皆缺/投递抛错 → 失败结果（调用方转 error 卡片）。
 */
function deliverMessage(agent, content) {
    const a = agent;
    if (a === null || typeof a !== 'object') {
        return { ok: false, error: '调用未携带可用 agent' };
    }
    let message;
    try {
        message = createUserMessage({
            content: content,
            source: { kind: 'user' },
        });
    }
    catch (err) {
        return { ok: false, error: `消息构造失败: ${err.message ?? String(err)}` };
    }
    try {
        if (typeof a.followup === 'function') {
            a.followup(message);
            return { ok: true, mode: 'followup' };
        }
        if (typeof a.steer === 'function') {
            a.steer(message);
            return { ok: true, mode: 'steer' };
        }
        return { ok: false, error: '当前会话 agent 不支持消息投递（followup/steer 均不可用）' };
    }
    catch (err) {
        return { ok: false, error: `消息投递失败: ${err.message ?? String(err)}` };
    }
}
/**
 * 构建发起执行依赖（真实端口：web-routes 同核 + deliverMessage）。
 * @param ctx     Cordis 上下文（tools/agents 服务供工具枚举；logger 可缺）。
 * @param options loadDefs 覆盖。
 */
function buildLaunchDeps(ctx, options) {
    return {
        loadDefs: options.loadDefs ?? (() => ensurePresetAgents()),
        toolNames: async () => (await enumerateToolSchemas(ctx)).map(s => s.name),
        applyRole: (agent, def, toolNames, sectionText) => installRoleContextForAgent(ctx, agent, def, toolNames, sectionText),
        deliver: deliverMessage,
        log: ctx.logger,
    };
}
/**
 * 创建命令同步器并绑定真实端口（index.ts 初始注册 + CRUD 路由 onAgentsChanged 重同步）。
 * ctx.commands 服务缺失（老版本 dsh / 测试伪 ctx）→ 降级 no-op sync（warn），面板
 * 发起路径不受影响（R08 守则 8：失败降级，不崩插件）。
 * @param ctx     Cordis 上下文（'commands' 已在 index.ts inject 声明）。
 * @param options loadDefs 覆盖。
 * @returns sync 函数（await 后返回 { registered, skipped }）。
 */
export function syncWorkflowCommands(ctx, options = {}) {
    const deps = buildLaunchDeps(ctx, options);
    // ctx.commands 鸭子类型守卫：服务缺失时不注册任何命令、不抛错。
    const registry = ctx.commands;
    if (typeof registry?.register !== 'function') {
        ctx.logger?.warn?.('[meow-dsh-workflow] ctx.commands 服务不可用，跳过角色斜杠命令注册（面板发起不受影响）');
        return async () => ({ registered: [], skipped: [] });
    }
    const ports = {
        registerCommand: definition => registry.register(definition),
        log: ctx.logger,
    };
    const sync = createCommandSync(ports);
    return () => sync(deps);
}
