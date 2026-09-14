/**
 * meow_child_agent_list 工具注册壳（dsh 接入层）。
 *
 * 调用者身份解析：meow-workflow 主 agent（build-prompt）与子 agent（meow_agent_call）
 * 都会把 RoleGrants 发布到 agent 对象（authorization.publishRoleGrants），从中取 roleId
 * 定位自己的 children；识别不了 → 返回空目录并提示（不猜、不返回全量）。
 */
import type { Context } from '@deepseek-ai/cordis';
/** 注册 meow_child_agent_list 工具。 */
export declare function registerChildListTool(ctx: Context): void;
