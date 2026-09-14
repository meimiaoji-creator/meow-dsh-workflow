/**
 * meow-dsh-workflow 台账存储层 —— 项目 × 台账簿的 JSON 读写（零 dsh 依赖，独立可测）。
 *
 * 布局：$DSH_HOME/meow-dsh-workflow/ledger/<projectKey>/<book>.json —— **按工作目录（项目）
 * 区分**，不同项目互不混淆；projectKey 由注册壳从调用者会话 cwd 解析（或显式传参），
 * 共享兜底键 'shared'。
 *
 * 老数据迁移（懒触发）：早期全局布局 `ledger/<book>.json` 在任一项目首次读写该簿时
 * 自动合并迁入 `shared/<book>.json`（按 id 去重、保序），不丢数据。
 *
 * 授权模型（工具级）：是否可读写由各 Agent 的 allowedTools 是否含
 * meow_ledger_write / meow_ledger_read 决定（toolFilter.allow 硬裁剪），
 * 本层只负责存取，不判断调用者权限。
 */
/** 台账簿白名单（工具 book 参数枚举；新增簿在此登记）。 */
export declare const LEDGER_BOOKS: readonly ["decisions", "actions", "need-boss", "status", "product", "market"];
/** 共享兜底项目键（无法解析工作目录/显式跨项目时的落点）。 */
export declare const LEDGER_SHARED_PROJECT = "shared";
export type LedgerBook = typeof LEDGER_BOOKS[number];
/** 单条台账记录（自由文本内容 + 少量结构化字段；生命状态在 status 上演进）。 */
export interface LedgerRecord {
    /** 记录 id（更新凭据）。 */
    id: string;
    /** 最近写入时间（ISO）。 */
    ts: string;
    /** 生命周期状态（如 actions：open/in_progress/done/blocked/cancelled）。 */
    status?: string;
    /** 标题（简短）。 */
    title: string;
    /** 正文（可 markdown，长文本）。 */
    content: string;
    /** 归属/作者（可选）。 */
    author?: string;
}
/** 写入入参（id 缺省 = 新增；id 存在 = 更新合并；project 缺省由注册壳解析后传入）。 */
export interface LedgerRecordInput {
    id?: string;
    status?: string;
    title?: string;
    content?: string;
    author?: string;
}
/** 读取查询（全部可选；缺省 = 返回该簿全部，最新在前）。 */
export interface LedgerQuery {
    id?: string;
    status?: string;
    q?: string;
    limit?: number;
}
/** 老全局簿 → 项目键（目录名）。 */
export declare function ledgerDir(root: string | undefined, projectKey: string): string;
/** 校验簿名（未知簿抛错，供工具层给模型明确反馈）。 */
export declare function assertLedgerBook(book: string): void;
/** 读某项目某簿全部记录（已校验簿名；首次访问触发老全局簿懒迁移）。 */
export declare function loadLedger(root: string | undefined, projectKey: string, book: string): Promise<LedgerRecord[]>;
/**
 * 写入（upsert）：id 缺省新增、id 命中更新合并（只覆盖显式字段，status/author 缺省保留旧值）。
 * @returns { record, created } created=true 表示新增。
 */
export declare function upsertLedger(root: string | undefined, projectKey: string, book: string, input: LedgerRecordInput): Promise<{
    record: LedgerRecord;
    created: boolean;
}>;
/** 查询：按 id/status/关键词过滤，最新在前，limit 截断。 */
export declare function queryLedger(root: string | undefined, projectKey: string, book: string, query?: LedgerQuery): Promise<LedgerRecord[]>;
/** 单项目台账总览。 */
export interface LedgerProjectOverview {
    /** 项目键（ledger/<project>/ 目录名）。 */
    project: string;
    /** 全部簿记录条数。 */
    total: number;
    /** 最近一条写入时间（ISO；项目排序依据）。 */
    lastTs?: string;
    /** 各簿记录（records 最新在前；按 LEDGER_BOOKS 白名单序，多余键排后）。 */
    books: {
        book: string;
        count: number;
        records: LedgerRecord[];
    }[];
}
/**
 * 列出全部项目的台账总览（零 dsh 依赖；web 路由 GET /api/meow-workflow/ledger 用）。
 * 目录缺失 → 空 projects；空簿跳过；项目按最近写入倒序；簿按白名单序。
 */
export declare function listLedgerOverview(root: string | undefined): Promise<{
    projects: LedgerProjectOverview[];
}>;
