/**
 * meow_memory_write / meow_memory_read 工具注册壳（dsh 接入层）。
 *
 * 调用者身份自动解析（尽量让模型不用手填）：
 *   - 角色：RoleGrants（主 agent build-prompt 发布 / 子 agent meow_agent_call 发布）；
 *     显式传 role 可覆盖（父级记"孩子 runId"时用）。
 *   - agentRunId：缺省 = 调用者自己的会话 id（子 agent 即自己的 runId）；显式传参覆盖。
 *   - project：缺省鸭子探测会话 cwd（agent.cwd / agent.session.header.cwd）；探测不到
 *     用显式传参；再不行 'shared'。
 */
import type { Context } from '@deepseek-ai/cordis';
/** 注册 meow_memory_write + meow_memory_read（所有角色默认授权，见 agents.json）。 */
export declare function registerMemoryTools(ctx: Context): void;
