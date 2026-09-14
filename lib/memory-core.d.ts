/**
 * meow_memory_write / meow_memory_read 工具核心逻辑 —— 角色记忆（零 dsh 依赖）。
 *
 * 模型：**项目目录 × 角色** 绑定一份记忆（追加式日志）。agent 阶段性完成/关键决策/卡点时
 * 记一条；记录可携带 agentRunId —— 跨上下文压缩后仍能凭记忆找回"这事是谁（哪个实例）做的"，
 * 用 meow_agent_call 传回 runId 续聊原实现者。
 *
 * 存储：$DSH_HOME/meow-dsh-workflow/memory/<projectKey>/<roleKey>.json（数组，最新在后）。
 * projectKey 由注册壳从调用者会话 cwd 解析（或显式传参），sanitizeKey 做文件名安全化。
 */
import { sanitizeKey } from './storage.js';
export { sanitizeKey };
/** meow_memory_write 工具名。 */
export declare const MEMORY_WRITE_TOOL = "meow_memory_write";
/** meow_memory_read 工具名。 */
export declare const MEMORY_READ_TOOL = "meow_memory_read";
/** 单条记忆。 */
export interface MemoryEntry {
    ts: string;
    kind?: string;
    title: string;
    content: string;
    agentRunId?: string;
}
/** 追加一条记忆（append-only 日志）。title/content 至少一项非空。 */
export declare function appendMemory(root: string | undefined, projectKey: string, roleKey: string, input: {
    kind?: string;
    title: string;
    content: string;
    agentRunId?: string;
}): Promise<MemoryEntry>;
/** 读结果条目（scope=project 时带 role 标明来自哪个角色）。 */
export interface MemoryReadItem extends MemoryEntry {
    role?: string;
}
/** 读记忆：scope=self 只看 roleKey；scope=project 跨该项目全部角色（找"这事谁做的"）。最新在前。 */
export declare function readMemory(root: string | undefined, projectKey: string, options?: {
    roleKey?: string;
    scope?: 'self' | 'project';
    q?: string;
    limit?: number;
}): Promise<{
    roleKey: string;
    entries: MemoryReadItem[];
}>;
/** 单项目记忆总览。 */
export interface MemoryProjectOverview {
    /** 项目键（memory/<project>/ 目录名）。 */
    project: string;
    /** 全部角色记录条数。 */
    total: number;
    /** 最近一条写入时间（ISO；项目排序依据）。 */
    lastTs?: string;
    /** 各角色记忆（entries 最新在前）。 */
    roles: {
        role: string;
        count: number;
        entries: MemoryEntry[];
    }[];
}
/**
 * 列出全部项目的角色记忆总览（零 dsh 依赖；web 路由 GET /api/meow-workflow/memory 用）。
 * 目录缺失 → 空 projects；空角色文件跳过；项目按最近写入倒序。
 */
export declare function listMemoryOverview(root: string | undefined): Promise<{
    projects: MemoryProjectOverview[];
}>;
