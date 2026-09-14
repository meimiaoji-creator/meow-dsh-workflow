# meow-dsh-workflow

> **dsh-plugin** for DeepSeek Harness（DSH）：把「选一个角色 → 按角色协议开工 → 派发子 agent 协作」变成一句话的事——角色库 + 提示词生成 + `meow_agent_call` 子 agent 身份权限注入。

[![Listed on dsh-plugin.org](https://dsh-plugin.org/badges/listed.svg)](https://dsh-plugin.org/plugins/meimiaoji-creator/meow-dsh-workflow)

![角色选择按钮与工作流面板](docs/screenshots/roles-panel.png)

meow-dsh-workflow 是一个双面（node + browser）DSH 插件：内置一套可编辑的 **Agent 角色库**（研发链路 / 头脑风暴 / 3D 导演），把角色定义编译成系统提示词与工具白名单。你可以在输入框右侧点「角色」按钮、或敲 `/meow-workflow-<角色id>` 斜杠命令按角色发起会话；主 agent 再通过 `meow_agent_call` 按同一套角色定义创建/续聊**带 persona 与工具白名单的子 agent**，形成多层语言链。配套角色记忆（跨会话）与公司台账簿（decisions/actions/need-boss 等六本账，按项目隔离）。

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

## 预置角色（11 个，可自行增删）

可发起的角色（launchable，出现在「角色」按钮与斜杠命令里）：

| 角色 | 命令 | 一句话 |
|---|---|---|
| 研发负责人 | `/meow-workflow-lead` | PM：拆解目标 → 分批派发工程师 → 评审闭环 → 交付报告，不亲自写码 |
| 头脑风暴主持人 | `/meow-workflow-brainstorm` | 召集 5 位董事（第一性原理/魔鬼代言人/战略/执行/用户）发言、辩论、收敛决策材料 |
| 3D 导演 | `/meow-workflow-director-3d` | 把粗糙的 3D 想法/参考图变成可开工的镜头单（Blender / Three.js / Houdini / C4D） |

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
