# meow-dsh-workflow

> **dsh-plugin** for DeepSeek Harness（DSH）：把「选一个角色 → 按角色协议开工 → 派发子 agent 协作」变成一句话的事——角色库 + 提示词生成 + `meow_agent_call` 子 agent 身份权限注入。

[![Listed on dsh-plugin.org](https://dsh-plugin.org/badges/listed.svg)](https://dsh-plugin.org/plugins/meimiaoji-creator/meow-dsh-workflow)

<img width="2549" height="1242" alt="image" src="https://github.com/user-attachments/assets/f4d6a1ed-c3d6-494b-9f5b-356d43340b80" />
<img width="1512" height="393" alt="image" src="https://github.com/user-attachments/assets/3bb8bfe2-ce18-4b40-a911-447c24ebac03" />
<img width="2058" height="939" alt="image" src="https://github.com/user-attachments/assets/b86fd13f-61f9-4045-bc3e-7be4ac41a3e9" />

meow-dsh-workflow 是一个双面（node + browser）DSH 插件：内置一套可编辑的 **Agent 角色库**（研发链路 / 头脑风暴），把角色定义编译成系统提示词与工具白名单。你可以在输入框右侧点「角色」按钮、或敲 `/meow-workflow-<角色id>` 斜杠命令按角色发起会话；主 agent 再通过 `meow_agent_call` 按同一套角色定义创建/续聊**带 persona 与工具白名单的子 agent**，形成多层语言链。配套角色记忆（跨会话）与公司台账簿（decisions/actions/need-boss 等六本账，按项目隔离）。

零 dsh 源码改动，与 meow-dsh-task / meow-file-view 等插件平级共存。

---

## 安装

通过 dsh 官方插件管理器安装（profile = web）：

```bash
dsh 插件 --profile web add github:meimiaoji-creator/meow-dsh-workflow
```

发布 npm 后也可直接按包名安装（等价）：

```bash
dsh 插件 --profile web add meow-dsh-workflow
```

本地调试（指向本地目录）：

```bash
dsh 插件 --profile web add link:./
```

安装完成后，重启 dsh 即可在会话输入框右侧看到 **「角色」** 按钮，`/` 命令目录里出现 `/meow-workflow-*` 系列命令。

## 预置角色（10 个，可自行增删）

可发起的角色（launchable，出现在「角色」按钮与斜杠命令里）：

| 角色 | 命令 | 一句话 |
|---|---|---|
| 研发负责人 | `/meow-workflow-lead` | PM：拆解目标 → 分批派发工程师 → 评审闭环 → 交付报告，不亲自写码 |
| 头脑风暴主持人 | `/meow-workflow-brainstorm` | 召集 5 位董事（第一性原理/魔鬼代言人/战略/执行/用户）发言、辩论、收敛决策材料 |

由上面角色派发的子 agent（不在命令目录，经 `meow_agent_call` 调用）：研发工程师、评审专家、智囊团·第一性原理、魔鬼代言人、战略愿景官、务实执行官、用户代言人、决议记录员。

角色库就是仓库根的 `agents.json`，安装后落在 `$DSH_HOME/meow-dsh-workflow/agents.json`，随时可改（首次加载种入，幂等）。

---

## 功能

### 1. 角色发起 —— 「角色」按钮 + 斜杠命令
- 输入框右端「角色」按钮（`conversation.input.right` 槽）：选角色 → 填目标 → 发起，两步流；
- 每个 launchable 角色同步注册一条 dsh host 命令 `/meow-workflow-<角色id>`（如 `/meow-workflow-lead`），输入 `/` 直接下拉选择；
- 发起时 node 半组装角色系统提示词（含角色协议与「权限声明」section，order 120）。

### 2. `meow_agent_call` —— 子 agent 身份权限注入
按 Agent 定义注入 persona + 工具白名单（`toolFilter.allow` 硬过滤）创建或续聊子 agent，支持多层语言链（子 agent 还可再派发自己的子 agent）：

```json
{ "agentDefId": "engineer", "task": "实现 xxx，编译测试通过后汇报" }
```

续聊传回 `agentRunId` 即可复用同一实例（保留上下文），是「同一交付物由同一实现者迭代」的凭据。

### 3. 协作配套工具
| 工具 | 用途 |
|---|---|
| `meow_agent_save` / `meow_agent_list` / `meow_agent_get` | 角色的保存/新增/更新与查询（Agent 提炼优化） |
| `meow_child_agent_list` | 父级派发前查自己的子 agent 能力目录 |
| `meow_memory_write` / `meow_memory_read` | 角色记忆：项目（工作目录）×角色 绑定，跨会话留存 |
| `meow_ledger_write` / `meow_ledger_read` | 公司台账簿：decisions / actions / need-boss / status / product / market，按项目隔离 |

### 4. Web 面板（自包含单页，无需外部服务）
- `/meow-workflow/agents` —— Agent 管理页（角色增删改查）；
- `/meow-workflow/memory` —— 角色记忆浏览；
- `/meow-workflow/ledger` —— 台账簿总览。

### 5. 技能目录按角色授权过滤
本地 + 远程技能统一按当前角色的 `allowedSkills` / `allowedMcps` 过滤，子 agent 看不到未授权的技能入口。

---

## 与 meow-dsh-task 联动（研发链路最佳实践）

一句话分工：**meow-dsh-task 管「事」，meow-dsh-workflow 管「人」**——前者提供跨会话、离线、git 共享的任务台账与评审闭环，后者提供角色身份、权限白名单与子 agent 派发。

| 关注点 | 由谁承担 | 用到的工具 |
|---|---|---|
| 任务清单 / 认领 / 状态追踪 | meow-dsh-task | `meow_dsh_task_init` / `claim` / `status_update` |
| 过程留痕 / 交接接盘 | meow-dsh-task | `meow_dsh_task_checkpoint_append` / `handoff_write` |
| 评审闭环 / issue 回流 | meow-dsh-task | `meow_dsh_task_review_*` / `issue_report` / `issue_resolve` |
| 角色身份 / 工具权限 | meow-dsh-workflow | persona + `toolFilter.allow` 硬过滤 |
| 子 agent 派发 / 续聊 | meow-dsh-workflow | `meow_agent_call`（`agentRunId` 复用同一实例） |
| 角色「知道什么」（跨会话） | meow-dsh-workflow | `meow_memory_write/read`、`meow_ledger_write/read` |

推荐研发流程（两个插件都装好即可开箱跑）：

1. `/meow-workflow-lead` 发起：研发负责人拆解目标，`meow_dsh_task_init` 建任务清单；
2. 逐任务 `meow_dsh_task_claim` 认领 → `meow_agent_call` 派发研发工程师实现 → 评审专家只读评审；
3. 评审问题 `meow_dsh_task_issue_report` 登记后回流**原工程师**（凭 `agentRunId` 续聊修复，不另开新实例）→ 复评通过后 `meow_dsh_task_issue_resolve` 关闭；
4. 关键决策/文件 `meow_dsh_task_checkpoint_append` 留痕——任务状态跨会话活在 meow-dsh-task 的任务台账里，角色记忆（项目×角色的决策与踩坑）活在 `meow_memory_*` 里，两边互不挤占会话上下文。

预置「研发负责人」角色的工具白名单已内置全套 `meow_dsh_task_*` 工具。只装本插件、不装 meow-dsh-task 时，这些任务工具未注册、会被白名单过滤，研发链路退化为纯对话式派发（无跨会话任务台账）——要跑完整闭环请成对安装：

```bash
dsh 插件 --profile web add github:meimiaoji-creator/meow-dsh-task
```

---

## API 一览

Web 路由（均挂 `/api/meow-workflow` 前缀）：

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/roles` | launchable 角色列表 |
| POST | `/build-prompt` | 组装角色 systemPrompt / userPrompt 并注入角色协议 section |
| GET / POST | `/agents` | 角色列表 / 新增 |
| PUT / DELETE | `/agents/<id>` | 更新 / 删除角色 |
| GET | `/tools` | 工具与模型目录（角色表单用） |
| GET | `/memory`、`/ledger` | 记忆 / 台账数据 |

## 工具输出示例

`meow_agent_call`（创建子 agent）：

```json
{ "agentRunId": "a1b2c3...", "status": "started", "name": "研发工程师" }
```

`meow_memory_write`（角色记忆）：

```json
{ "ok": true, "role": "engineer", "project": "demo-app", "title": "关键决策：分层约定" }
```

## 系统提示词注入

- 按角色发起时注入一个「角色协议」section（order 120）：角色 systemPrompt + 权限声明（该角色的 allowedTools / allowedMcps / allowedSkills 清单）；
- 不注入任何全局系统提示词，不影响非角色会话。

## 权限与运行时行为

### 会做
- **写文件**：仅限 `$DSH_HOME/meow-dsh-workflow/` 下的 `agents.json`、`workspace-config.json`、`memory/<项目>/<角色>.json`、`ledger/<项目>/<簿>.json`；
- **注册工具**：`meow_agent_call`、`meow_agent_save/list/get`、`meow_child_agent_list`、`meow_memory_write/read`、`meow_ledger_write/read`；
- **注册 Web 路由**：`/api/meow-workflow/*` 与 `/meow-workflow/{agents,memory,ledger}` 三个自包含页面；
- **注册斜杠命令**：每个 launchable 角色一条 `/meow-workflow-<角色id>`；
- **系统提示词注入**：仅按角色发起的会话注入角色协议 section；
- **调用 DSH 已注入的服务**：`tools` / `subagents` / `systemPrompt` / `webServer` / `agents` / `skills` / `llm` / `commands`。

### 不会做
- ❌ 不读聊天记录 / 会话历史 / 其他插件的配置与数据；
- ❌ 不调用任何 DSH 之外的第三方 API，无 telemetry、不外发请求；
- ❌ 不修改 DSH 源码（零侵入，组合层 `cordis.patch.yml` 仅插入一行）；
- ❌ 除数据根目录外不写任何磁盘路径。

### 授权模型（重要边界）
「以角色发起」的授权清单分两层生效：

| 主体 | 生效方式 | 强度 |
|---|---|---|
| 主 agent（点「角色」/斜杠命令发起后的会话主 agent） | 系统提示词「权限声明」section | **软约束**（靠模型遵循，无工具面硬限制） |
| 子 agent（`meow_agent_call` 创建） | spawn provider `toolFilter.allow` 硬过滤 | **硬过滤**（dsh 强制） |

请把主 agent 的 allowedTools 当作「强烈建议」；需要硬限制的能力下沉给子 agent。

## 兼容性

| 项目 | 要求 |
|---|---|
| **DSH profile** | 仅 `web`（强依赖 webServer） |
| **DSH runtime** | `@deepseek-ai/cordis ^0.1.0` |
| **运行平台** | Node 18+，ESM only |

### 已知不兼容
- ❌ TUI / CLI profile（webServer / client 槽位不可用）；
- ❌ 旧版 cordis API（`subagents.startContinuable` followup 需 2026-09 及以后的 dsh）。

## 依赖与 peer
- `peerDependencies`: `@deepseek-ai/cordis ^0.1.0`；
- `dsh.client.inject`: `@deepseek-ai/dsh-client-runtime`、`@deepseek-ai/dsh-client-ui-conversation`、`@deepseek-ai/dsh-client-ui-layout`；
- node 半 inject：`tools` / `subagents` / `systemPrompt` / `webServer` / `agents` / `skills` / `llm` / `commands`（服务缺失时对应能力降级 no-op，不崩）。

## 开发

本仓库发布编译产物（`lib/`）+ 数据（`agents.json`）+ 组合层（`cordis.patch.yml`）。本地调试：

```bash
dsh 插件 --profile web add link:./
```

改动 `agents.json` 后重启 dsh 即生效（运行时以 `$DSH_HOME/meow-dsh-workflow/agents.json` 为准，删除它可在下次启动重新种入预置）。问题与 PR 走 [Issues](https://github.com/meimiaoji-creator/meow-dsh-workflow/issues)。

## License

[MIT](./LICENSE) © meimiaoji-creator
