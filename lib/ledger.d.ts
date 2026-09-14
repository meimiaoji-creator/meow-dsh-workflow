/**
 * meow-dsh-workflow 台账工具注册壳 —— meow_ledger_write / meow_ledger_read（dsh 接入层）。
 *
 * 本文件只做「定义 + 注册」（defineTool 值导入）；真实执行逻辑在 ledger-core.ts
 * （executeLedgerWrite / executeLedgerRead，零 dsh 依赖、独立可测）。
 *
 * 项目维度：台账按工作目录区分（ledger/<projectKey>/<book>.json）。project 参数缺省时
 * 从调用者会话 cwd 鸭子探测（storage.probeCwd），探测不到落 shared。
 *
 * 授权边界：工具全局注册（模型可见 schema），但**是否可调用由各 Agent 的
 * allowedTools 白名单决定**（compileAllowedTools → toolFilter.allow 硬裁剪）。
 * 两工具拆开以支持「只读」角色：如执行总裁只授 meow_ledger_read（看决策/状态），
 * 执笔交首席幕僚（read + write）。
 */
import type { Context } from '@deepseek-ai/cordis';
/** 注册 meow_ledger_write + meow_ledger_read 两个工具。 */
export declare function registerLedgerTools(ctx: Context): void;
