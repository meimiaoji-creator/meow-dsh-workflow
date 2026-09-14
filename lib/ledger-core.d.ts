/**
 * meow-dsh-workflow 台账工具核心逻辑 —— meow_ledger_write / meow_ledger_read
 * （零 dsh 依赖，独立可测）。
 *
 * 授权模型（工具级）：工具全局注册，是否可调用由各 Agent 的 allowedTools 白名单决定
 * （compileAllowedTools → toolFilter.allow 硬裁剪）。meow_ledger_read 与
 * meow_ledger_write 拆开，支持「只读」角色（如执行总裁只授 read，由首席幕僚执笔）。
 *
 * 项目维度：台账按工作目录区分（ledger/<projectKey>/<book>.json）；project 由注册壳
 * 从调用者会话 cwd 解析（或显式传参）后传入，缺省落 shared。
 *
 * 本模块只依赖 ledger-store + storage + protocols（escapePromptBraces，红线 8），
 * 运行时经注册壳 ledger.ts 注入 root（缺省 $DSH_HOME）。
 */
/** meow_ledger_write 工具名（Agent 定义 allowedTools 授权项）。 */
export declare const LEDGER_WRITE_TOOL = "meow_ledger_write";
/** meow_ledger_read 工具名（Agent 定义 allowedTools 授权项）。 */
export declare const LEDGER_READ_TOOL = "meow_ledger_read";
/** meow_ledger_write 入参（book 必填；id 缺省新增、id 命中更新合并；project 由壳解析）。 */
export interface LedgerWriteInput {
    book: string;
    id?: string;
    status?: string;
    title?: string;
    content?: string;
    author?: string;
    project?: string;
}
/** meow_ledger_read 入参（全部可选过滤；book 必填；project 由壳解析）。 */
export interface LedgerReadInput {
    book: string;
    id?: string;
    status?: string;
    q?: string;
    limit?: number;
    project?: string;
}
/** 读结果条目（title/content 已 escapePromptBraces，防御拼 prompt 红线）。 */
export interface LedgerItem {
    id: string;
    ts: string;
    status?: string;
    title: string;
    content: string;
    author?: string;
}
export interface LedgerWriteOutput {
    project: string;
    book: string;
    id: string;
    created: boolean;
    ts: string;
}
export interface LedgerReadOutput {
    project: string;
    book: string;
    count: number;
    items: LedgerItem[];
}
/** 校验并执行 meow_ledger_write。 */
export declare function executeLedgerWrite(root: string | undefined, input: LedgerWriteInput): Promise<LedgerWriteOutput>;
/** 校验并执行 meow_ledger_read（返回条目已 escape 标题/正文）。 */
export declare function executeLedgerRead(root: string | undefined, input: LedgerReadInput): Promise<LedgerReadOutput>;
