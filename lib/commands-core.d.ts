/**
 * 角色发起斜杠命令 —— 纯逻辑核心（零 dsh 运行时依赖，独立可测）。
 *
 * 每个 launchable 角色注册一条 dsh host 命令 `/meow-workflow-<角色id>`（如
 * `/meow-workflow-lead`），输入 `/` 在命令目录直接下拉选择角色——角色选择器即
 * 命令菜单本身，无需弹窗。命令声明 `input.attachments: true`：用户在主输入框
 * 正常粘贴文件/图片后回车，附件经 dsh 原生接纳为 ImageBlock/FileBlock 随调用
 * 交给 handler——发起动作回到主输入框原生链路（粘贴/草稿/排队全原生），插件
 * 客户端半零改动。
 *
 * 执行语义（与 build-prompt 面板路径同核）：
 *   1. 解析 goal（rawInput 全量）→ 组装 userPrompt（assemblePrompt，web-routes 纯函数）；
 *   2. 角色上下文（协议 section + tools.restrict + grants）应用到**发起会话的
 *      agent scope**（installRoleContextForAgent，web-routes 导出）；
 *   3. `agent.followup(createUserMessage({ content: [userPrompt, ...attachments] }))`
 *      把消息作为用户回合发出（与 dsh session-controller 同一原语；agent 忙时
 *      followup 排队，next-turn inbox + queue dock 原生接管）。
 *   命令行本身不进模型（dsh CommandDefinition 语义：handler 执行时**不发送**
 *   命令文本；command/run、command/done 仅日志记录）。
 *
 * 分层（沿 tools-core/tools 同款）：本模块为 core（全部 dsh 交互经 ports 注入，
 * 纯 node 可测）；`commands.ts` 为 shell（import createUserMessage / ctx.commands
 * 真实接 dsh）。易碎面：`ctx.commands.register`（dsh 公开插件面）+
 * `agent.followup/steer`（鸭子类型 + 失败降级为 error result，会话无损）。
 */
import type { AgentDef } from './schema.js';
import { type RoleSummary } from './web-routes.js';
/** 命令名前缀（dsh 命令名规范 `/^[a-z][a-z0-9_-]*$/`，与 /api/meow-workflow 前缀同族）。 */
export declare const WORKFLOW_COMMAND_PREFIX = "meow-workflow-";
/**
 * 角色id → 命令名；不合规（中文/空/大写等）返回 null（该角色跳过命令注册，
 * 仍可从工作流面板发起）。
 * @param roleId 角色 id。
 */
export declare function roleIdToCommandName(roleId: string): string | null;
/** 命令菜单行描述：角色显示名 + 范式一句话（oneLine 折行防菜单行破坏；已 escape）。 */
export declare function commandDescription(role: RoleSummary): string;
/** 命令参数 hint（菜单/认领后 placeholder 语义）。 */
export declare const COMMAND_INPUT_HINT = "<\u76EE\u6807>\uFF08\u53EF\u9644\u6587\u4EF6/\u56FE\u7247\uFF09";
/** 命令调用面的本地结构类型（dsh CommandInvocation 的结构子集，测试可造）。 */
export interface WorkflowCommandInvocation {
    /** 接收命令的 agent（live handle；followup/steer 由 deliver 端口鸭子类型）。 */
    readonly agent: unknown;
    /** 命令名之后的原文（= 用户目标）。 */
    readonly rawInput: string;
    /** 已接纳附件块（ImageBlock/FileBlock；未附为空数组）。 */
    readonly attachments: readonly unknown[];
}
/** dsh CommandResult 的本地结构类型。 */
export type WorkflowCommandResult = {
    readonly kind: 'success';
    readonly text?: string;
} | {
    readonly kind: 'error';
    readonly text: string;
};
/** deliver 端口结果：投递成功（含通道）或失败原因。 */
export type DeliverOutcome = {
    readonly ok: true;
    readonly mode: 'followup' | 'steer';
} | {
    readonly ok: false;
    readonly error: string;
};
/**
 * 发起执行依赖（全部 dsh 交互端口，shell 注入真实实现 / 测试注入 mock）。
 */
export interface WorkflowLaunchDeps {
    /** 角色库加载（与 /api 同源：ensurePresetAgents(root)）。 */
    loadDefs(): Promise<Record<string, AgentDef>>;
    /** 可见工具名索引（restrict 的 strict 校验；= enumerateToolSchemas）。 */
    toolNames(): Promise<readonly string[]>;
    /**
     * 角色上下文应用到目标 agent scope（= installRoleContextForAgent）。
     * 返回 false / 抛错均降级为「未注入」（仍照常发消息，结果文本带提醒）。
     */
    applyRole(agent: unknown, def: AgentDef, toolNames: readonly string[], sectionText: string): boolean;
    /**
     * 消息投递（= createUserMessage + agent.followup/steer 鸭子类型）。
     * content 已按序组装（文本块在前、附件随后）；实现负责失败捕获。
     */
    deliver(agent: unknown, content: readonly unknown[]): DeliverOutcome;
    /** 角色库根（错误提示用可省；保留给 shell 透传 root）。 */
    log?: {
        warn?(message: string): void;
    };
}
/**
 * 执行一次角色发起（`/meow-workflow-<id> <目标> + 附件`）。
 * 校验 → 组装 → 注入角色上下文 → 投递；任一步失败返回 error result
 * （命令卡片显示文本，会话不受损——附件已由 dsh 接纳，用户可重试）。
 * @param deps     依赖端口。
 * @param invocation 命令调用（agent/rawInput/attachments）。
 * @param roleId   命令映射的角色 id（注册时闭包固定）。
 * @param roleName 角色显示名（结果文本用；缺省回退 roleId）。
 */
export declare function executeWorkflowLaunch(deps: WorkflowLaunchDeps, invocation: WorkflowCommandInvocation, roleId: string, roleName?: string): Promise<WorkflowCommandResult>;
/** 命令注册面的本地结构类型（dsh CommandDefinition 的结构子集）。 */
export interface WorkflowCommandRegistration {
    /** 命令名（不含前导 /；= meow-workflow-<角色id>）。 */
    readonly name: string;
    /** 菜单行描述。 */
    readonly description: string;
    /** 参数描述 + 附件声明（attachments: true 是粘贴文件能力的前提）。 */
    readonly input: {
        hint: string;
        attachments: true;
    };
    /** 执行体。 */
    handler(invocation: WorkflowCommandInvocation): Promise<WorkflowCommandResult> | WorkflowCommandResult;
}
/** 同步注册端口（shell 接 ctx.commands；测试接捕获数组）。 */
export interface CommandSyncPorts {
    /** 注册一条命令；重复名等冲突会抛错（调用方按角色隔离降级）。 */
    registerCommand(definition: WorkflowCommandRegistration): () => void;
    log?: {
        warn?(message: string): void;
        info?(message: string): void;
    };
}
/**
 * 创建命令同步器：每次 sync 先 dispose 全部旧命令，再按当前 launchable 角色
 * 重注册（agents.json 增删改后由 CRUD 路由触发重同步）。单角色失败（命令名
 * 冲突等）只跳过该角色，不影响其他角色（R08 守则 8：失败降级不整体崩）。
 * @param ports 注册端口。
 * @returns sync 函数（deps 注入发起执行依赖；返回注册/跳过清单）。
 */
export declare function createCommandSync(ports: CommandSyncPorts): (deps: WorkflowLaunchDeps) => Promise<{
    registered: string[];
    skipped: string[];
}>;
