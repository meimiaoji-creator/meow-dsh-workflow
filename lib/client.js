window.__ModuleLoader__.load({
	id: "meow-dsh-workflow",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/panel-store.ts
		let open = false;
		let actions = null;
		const listeners = /* @__PURE__ */ new Set();
		const actionsListeners = /* @__PURE__ */ new Set();
		/** 订阅开关变化；返回退订函数（React useSyncExternalStore 契约）。 */
		function subscribe(fn) {
			listeners.add(fn);
			return () => {
				listeners.delete(fn);
			};
		}
		/** 当前开关状态快照（布尔值，引用稳定，可直接作为 useSyncExternalStore 的 getSnapshot）。 */
		function getOpen() {
			return open;
		}
		/** 打开/关闭面板；无变化时 no-op（避免无谓重渲染）。 */
		function setOpen(next) {
			if (open === next) return;
			open = next;
			for (const fn of [...listeners]) fn();
		}
		/** 切换面板开关。 */
		function toggleOpen() {
			setOpen(!open);
		}
		/**
		* 当前 inputActions 快照（可能为 null：未发布 / 已清除）。
		* 引用稳定（同一 actions 对象不变化），可直接作为 useSyncExternalStore 的 getSnapshot。
		*/
		function getActions() {
			return actions;
		}
		/**
		* 发布/清除 inputActions。
		* - `next === null`：清除快照（组件卸载或会话切换时调用）；
		* - `next !== null`：发布新快照；引用变化时通知 actions 监听者。
		* - 同一引用 no-op（避免无谓重渲染）。
		*/
		function setActions(next) {
			if (actions === next) return;
			actions = next;
			for (const fn of [...actionsListeners]) fn();
		}
		/**
		* 跨 slot 域共享「当前会话 id」：session 域 RoleButton 从 PropsRuntime 拿到
		* sessionId 发布进模块级 store，root 域 LaunchView（buildAndSend）从 store 读取并
		* 随 build-prompt 请求传给 node 端，node 端据此把角色协议注入该会话的 agent scope。
		* 与 inputActions 桥接（R-06 T-05/1）同款形态；会话切换/组件卸载时清除。
		*/
		let sessionId = null;
		const sessionIdListeners = /* @__PURE__ */ new Set();
		/** 当前会话 id 快照（可能为 null：未发布 / 已清除）。 */
		function getSessionId() {
			return sessionId;
		}
		/**
		* 发布/清除当前会话 id。
		* - `next === null`：清除快照（组件卸载或会话切换时调用）；
		* - `next !== null`：发布新快照；变化时通知监听者。
		* - 同一引用 no-op（避免无谓重渲染）。
		*/
		function setSessionId(next) {
			if (sessionId === next) return;
			sessionId = next;
			for (const fn of [...sessionIdListeners]) fn();
		}
		//#endregion
		//#region src/client/RoleButton.tsx
		/**
		* 输入框右端「角色」按钮（conversation.input.right 槽，T-09 + T-03 改造）。
		*
		* v2.1 形态（T-09）：按钮 → 内联小弹窗两步流（拉角色 / 目标 / 开始）。
		* v2 形态（T-03 改造）：按钮 → 只切换工作流面板开关（panel-store.toggleOpen），
		* aria-pressed 反映开关态。具体两步流在 WorkflowPanel 的 Tab1（LaunchView，
		* T-05 交付）中渲染——本按钮仅作为入口。
		*
		* R-06 T-05/1 修复：本按钮（session 域）持有 framework standard kit 注入的
		* inputActions；root 域 LaunchView 拿不到这些 props。本组件在挂载/更新时把
		* 解析到的 inputActions 发布进模块级 panel-store（setActions），让 LaunchView
		* 从 store 读取——跨 slot 域桥接。会话切换或组件卸载时清除（setActions(null)）。
		*
		* 数据流：所有角色列表 / 提示词组装 / 发送均发生在 Tab1（LaunchView）内，
		* 走 standard kit 的 inputActions（setDraft + submit），由 T-05 接盘实现。
		* 本组件**不再**直接 import workflow-api，也不持 useState/useEffect 用于面板开关——
		* 开关状态由模块级 panel-store 托管（跨 slot 域：session 域按钮 + root 域面板共享）。
		*
		* 约束：
		*   - 纯 React 组件：不读 ctx，全部数据/回调走 props（framework session kit 提供
		*     useInput/inputActions；owner 提供 InputZone）；
		*   - 样式内联（不引第三方 UI 库 / CSS Modules）；
		*   - 红线 8：按钮文案与渲染内容不含 ASCII 双花括号占位符形态。
		*/
		const BUTTON_STYLE = {
			display: "inline-flex",
			alignItems: "center",
			gap: 4,
			height: 24,
			padding: "0 8px",
			border: "1px solid var(--dsw-alias-border-l2, #e2e5ea)",
			borderRadius: 6,
			background: "var(--dsw-alias-bg-base, #fff)",
			color: "var(--dsw-alias-label-primary, #111827)",
			fontSize: 12,
			lineHeight: 1,
			cursor: "pointer",
			whiteSpace: "nowrap"
		};
		/**
		* 从 PropsRuntime 中安全解析 inputActions（容忍 props.inputActions 缺省 + useInput 注入形态）。
		* 沿 LaunchView.getInputActions 形态：直接 props.inputActions → useInput()().inputActions → null。
		*/
		function resolveInputActions(props) {
			const direct = props.inputActions;
			if (direct !== void 0) return direct;
			const useInput = props.useInput;
			if (typeof useInput === "function") try {
				const v = useInput();
				if (v?.inputActions !== void 0) return v.inputActions;
			} catch {}
			return null;
		}
		/**
		* 从 PropsRuntime 中安全解析当前会话 id（R08 问题 1）。
		* 会话域 slot（conversation.input.right）的 framework standard kit 会注入
		* sessionId prop（ui-session 合并声明）；此处鸭子类型取值，容忍缺省。
		*/
		function resolveSessionId(props) {
			const v = props.sessionId;
			return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
		}
		/**
		* 角色按钮：点击只切换工作流面板（侧滑）开关。aria-pressed 反映当前开关态。
		* 两步流（选角色 → 填目标 → 发起）由 WorkflowPanel Tab1（LaunchView，T-05 交付）承载。
		* 顺带把当前会话 inputActions 发布进 panel-store（R-06 T-05/1 跨 slot 域桥接）。
		*/
		function RoleButton(props) {
			const isOpen = (0, react.useSyncExternalStore)(subscribe, getOpen);
			(0, react.useEffect)(() => {
				setActions(resolveInputActions(props));
				setSessionId(resolveSessionId(props));
				return () => {
					setActions(null);
					setSessionId(null);
				};
			}, [props]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				title: "选择角色发起",
				"aria-label": "选择角色发起",
				"aria-pressed": isOpen,
				onClick: toggleOpen,
				style: BUTTON_STYLE,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					"aria-hidden": "true",
					children: "👤"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "角色" })]
			});
		}
		//#endregion
		//#region src/workflow-api.ts
		/** 全局 fetch 适配为 WorkflowFetch（浏览器环境）。 */
		const defaultFetch = (url, init) => fetch(url, init);
		/**
		* 从错误响应读取详情（response.text + status 拼到 message）。
		* 文本经 oneLine 防御，杜绝 ASCII 双花括号外溢。
		*/
		async function describeError(prefix, res) {
			const text = await res.text().catch(() => "");
			return text === "" ? `${prefix}（${res.status}）` : `${prefix}（${res.status}: ${oneLine(text)}）`;
		}
		/** 折叠多行文本 + 转义 ASCII 双花括号（与 protocols.oneLine 同款，供本模块复用）。 */
		function oneLine(value) {
			return value.replace(/\{\{/g, "｛｛").replace(/\}\}/g, "｝｝").replace(/\s*\n+\s*/g, " ").trim();
		}
		/** 解析响应 JSON 为角色列表；非 2xx 抛错。 */
		async function parseRoles(res) {
			if (!res.ok) throw new Error(await describeError("角色列表加载失败", res));
			const data = await res.json();
			if (!Array.isArray(data.roles)) throw new Error("角色列表响应格式异常");
			return data.roles;
		}
		/**
		* 拉取 launchable 角色列表（GET /api/meow-workflow/roles）。
		* @param fetchImpl fetch 实现（缺省全局 fetch；测试注入 mock）。
		* @returns 角色列表。
		*/
		async function fetchRoles(fetchImpl = defaultFetch) {
			return parseRoles(await fetchImpl("/api/meow-workflow/roles", { method: "GET" }));
		}
		/**
		* 发起两步流第二步：组装提示词并发送。
		* 调 POST /api/meow-workflow/build-prompt 拿到 { systemPrompt, userPrompt }（node 半把
		* 角色协议 section 注入**发起会话**的 agent scope），把 userPrompt 写入输入框并提交——
		* 用户看到的就是"以 X 角色身份"的消息。
		* @param fetchImpl    fetch 实现（缺省全局 fetch；测试注入 mock）。
		* @param inputActions 输入框 action 面（ui-conversation standard kit 的 inputActions）。
		* @param roleId       发起角色 id。
		* @param goal         用户目标文本（非空由调用方校验）。
		* @param sessionId    发起会话 id（R08 问题 1：node 半据此把角色协议注入该会话的
		*                     agent scope，只对该会话生效；缺省不注入仅返回提示词）。
		*/
		async function buildAndSend(fetchImpl, inputActions, roleId, goal, sessionId) {
			const body = {
				roleId,
				goal
			};
			if (typeof sessionId === "string" && sessionId.trim() !== "") body.sessionId = sessionId.trim();
			const res = await fetchImpl("/api/meow-workflow/build-prompt", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body)
			});
			if (!res.ok) throw new Error(await describeError("提示词组装失败", res));
			const data = await res.json();
			if (typeof data.userPrompt !== "string" || data.userPrompt.trim() === "") throw new Error("提示词组装响应缺少 userPrompt");
			inputActions.setDraft(data.userPrompt);
			inputActions.submit();
		}
		//#endregion
		//#region src/client/LaunchView.tsx
		/**
		* Tab1 发起角色视图（agent-chain-ui-v2 §3，T-05 交付）。
		*
		* 把 P-01 v2.1 内联小弹窗两步流搬进侧滑 Tab1，宽屏化：
		*   - 第一步：选角色（launchable=true 卡片列表 + 子角色 chips）；
		*   - 第二步：填目标 textarea → buildAndSend → 自动调 panel-store.setOpen(false) 关侧滑。
		*
		* 数据流：
		*   - 角色列表：fetchRoles（workflow-api 既有；fetchImpl / inputActions 可注入）
		*   - 发起：buildAndSend（既有；成功 → 本组件调 panel-store.close 关闭侧滑）
		*
		* 错误处理：
		*   - fetchRoles 失败：内联显示（不抛，不弹窗）；
		*   - buildAndSend 失败：内联显示，按钮重新可用；
		*   - fetchRoles 进行中：渲染 loading 占位；空列表显示空态提示。
		*
		* 约束：
		*   - 纯 React 组件：不读 ctx，全部数据/回调走 props；
		*   - 样式内联（不引第三方 UI 库 / CSS Modules）；
		*   - 红线 8：组件文案与渲染内容不含 ASCII 双花括号占位符形态。
		*
		* 备注：WorkflowPanel.tsx 当前渲染 <LaunchView /> 时不传 props；fetchImpl / inputActions
		* 由 framework session kit 在 PropsRuntime<'conversation.input.right'> 上提供，本组件复用
		* 同款 PropsRuntime 即可在 Talkie 模式下被 dsh 注入 inputActions。
		*/
		const SECTION_TITLE_STYLE = {
			fontSize: 14,
			fontWeight: 600,
			color: "var(--dsw-alias-label-primary, #111827)",
			marginBottom: 12
		};
		const CARD_LIST_STYLE = {
			display: "flex",
			flexDirection: "column",
			gap: 10
		};
		const ROLE_CARD_STYLE = {
			display: "block",
			padding: "14px 16px",
			border: "1px solid var(--dsw-alias-border-l2, #e2e5ea)",
			borderRadius: 8,
			background: "var(--dsw-alias-bg-base, #fff)",
			cursor: "pointer",
			textAlign: "left",
			width: "100%",
			fontSize: 13,
			lineHeight: 1.5,
			color: "var(--dsw-alias-label-primary, #111827)"
		};
		const ROLE_CARD_NAME_STYLE = {
			fontSize: 14,
			fontWeight: 600,
			marginBottom: 4
		};
		const ROLE_CARD_SUMMARY_STYLE = {
			fontSize: 12,
			color: "var(--dsw-alias-label-secondary, #4b5563)",
			marginBottom: 6
		};
		const CHIPS_ROW_STYLE = {
			display: "flex",
			flexWrap: "wrap",
			gap: 4
		};
		const CHIP_STYLE = {
			display: "inline-block",
			padding: "2px 8px",
			border: "1px solid var(--dsw-alias-border-l1, #eceff3)",
			borderRadius: 4,
			background: "var(--dsw-alias-bg-l1, #f5f7fa)",
			fontSize: 11,
			color: "var(--dsw-alias-label-secondary, #4b5563)"
		};
		const EMPTY_STYLE = {
			fontSize: 13,
			color: "var(--dsw-alias-label-tertiary, #6b7280)",
			padding: "12px 0"
		};
		const LOADING_STYLE = {
			fontSize: 13,
			color: "var(--dsw-alias-label-tertiary, #6b7280)",
			padding: "12px 0"
		};
		const ERROR_STYLE = {
			marginTop: 12,
			padding: "10px 12px",
			border: "1px solid var(--dsw-alias-border-l2, #e2e5ea)",
			borderRadius: 6,
			background: "var(--dsw-alias-bg-l2, #fef2f2)",
			color: "#b91c1c",
			fontSize: 13,
			whiteSpace: "pre-wrap",
			wordBreak: "break-word"
		};
		const STEP2_TITLE_STYLE = {
			fontSize: 14,
			fontWeight: 600,
			color: "var(--dsw-alias-label-primary, #111827)",
			marginBottom: 12
		};
		const GOAL_LABEL_STYLE = {
			display: "block",
			fontSize: 13,
			fontWeight: 500,
			color: "var(--dsw-alias-label-primary, #111827)",
			marginBottom: 6
		};
		const GOAL_TEXTAREA_STYLE = {
			width: "100%",
			minHeight: 120,
			padding: "10px 12px",
			border: "1px solid var(--dsw-alias-border-l2, #e2e5ea)",
			borderRadius: 6,
			background: "var(--dsw-alias-bg-base, #fff)",
			color: "var(--dsw-alias-label-primary, #111827)",
			fontSize: 13,
			fontFamily: "inherit",
			lineHeight: 1.5,
			resize: "vertical",
			boxSizing: "border-box"
		};
		const FOOTER_STYLE = {
			display: "flex",
			justifyContent: "flex-end",
			gap: 8,
			marginTop: 16
		};
		const BTN_BASE_STYLE = {
			height: 32,
			padding: "0 16px",
			border: "1px solid var(--dsw-alias-border-l2, #e2e5ea)",
			borderRadius: 6,
			fontSize: 13,
			cursor: "pointer",
			whiteSpace: "nowrap"
		};
		const BTN_PRIMARY_STYLE = {
			...BTN_BASE_STYLE,
			background: "var(--dsw-alias-accent, #2563eb)",
			color: "#fff",
			borderColor: "var(--dsw-alias-accent, #2563eb)"
		};
		const BTN_SECONDARY_STYLE = {
			...BTN_BASE_STYLE,
			background: "var(--dsw-alias-bg-base, #fff)",
			color: "var(--dsw-alias-label-primary, #111827)"
		};
		const BTN_DISABLED_STYLE = {
			...BTN_PRIMARY_STYLE,
			opacity: .6,
			cursor: "not-allowed"
		};
		/**
		* 从 PropsRuntime 中安全取得 inputActions。
		*
		* 解析顺序（R-06 T-05/1 修复）：
		*   1. props.inputActions 直接注入（测试 / preview 走 props）；
		*   2. props.useInput()().inputActions（session 域 standard kit 注入形态，
		*      仅 conversation.input.right 槽有效；本组件在 root 域 shell.overlay 不可用）；
		*   3. panel-store.getActions()（R-06 跨 slot 域桥接：session 域 RoleButton
		*      已把当前会话 inputActions 发布进 store，root 域 LaunchView 从 store 读）；
		*   4. 全部缺省 → null（显示「不支持直接发送」错误）。
		*/
		function getInputActions(props) {
			if (props.inputActions !== void 0) return props.inputActions;
			const runtime = props.useInput;
			if (typeof runtime === "function") try {
				const v = runtime();
				if (v?.inputActions !== void 0) return v.inputActions;
			} catch {}
			const stored = getActions();
			if (stored !== null) return stored;
			return null;
		}
		/**
		* Tab1 发起角色视图：两步流（选角色 → 填目标 → 开始）。
		* 发起成功后自动调 panel-store.setOpen(false) 关闭侧滑。
		*/
		function LaunchView(props) {
			const fetchImpl = props.fetchImpl;
			const onClose = props.onClose ?? (() => {
				setOpen(false);
			});
			const [roles, setRoles] = (0, react.useState)([]);
			const [loading, setLoading] = (0, react.useState)(true);
			const [loadError, setLoadError] = (0, react.useState)("");
			const [selected, setSelected] = (0, react.useState)(null);
			const [goal, setGoal] = (0, react.useState)("");
			const [busy, setBusy] = (0, react.useState)(false);
			const [sendError, setSendError] = (0, react.useState)("");
			(0, react.useEffect)(() => {
				let alive = true;
				setLoading(true);
				setLoadError("");
				fetchRoles(fetchImpl).then((list) => {
					if (!alive) return;
					setRoles(list);
				}).catch((err) => {
					if (!alive) return;
					setLoadError(err instanceof Error ? err.message : String(err));
				}).finally(() => {
					if (!alive) return;
					setLoading(false);
				});
				return () => {
					alive = false;
				};
			}, [fetchImpl]);
			/** 选卡片 → 进入第二步 */
			function pickRole(role) {
				setSelected(role);
				setGoal("");
				setSendError("");
			}
			/** 取消 → 退回第一步 */
			function cancelPick() {
				setSelected(null);
				setGoal("");
				setSendError("");
			}
			/** 开始 → buildAndSend → 成功后自动关侧滑 */
			async function submitLaunch() {
				if (selected === null || goal.trim() === "" || busy) return;
				const actions = getInputActions(props);
				if (actions === null) {
					setSendError("当前上下文不支持直接发送（inputActions 未注入）");
					return;
				}
				setBusy(true);
				setSendError("");
				try {
					await buildAndSend(fetchImpl ?? defaultFetch, actions, selected.id, goal.trim(), getSessionId());
					onClose();
				} catch (err) {
					setSendError(err instanceof Error ? err.message : String(err));
				} finally {
					setBusy(false);
				}
			}
			if (selected !== null) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				role: "region",
				"aria-label": "第二步：填目标",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: STEP2_TITLE_STYLE,
						children: [
							"以「",
							selected.name,
							"」身份发起"
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
						style: GOAL_LABEL_STYLE,
						htmlFor: "launch-view-goal",
						children: "目标 *"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
						id: "launch-view-goal",
						value: goal,
						onChange: (event) => setGoal(event.target.value),
						placeholder: "例：完成登录模块开发并按规范评审",
						style: GOAL_TEXTAREA_STYLE,
						disabled: busy
					}),
					sendError !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: ERROR_STYLE,
						role: "alert",
						children: sendError
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: FOOTER_STYLE,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: cancelPick,
							style: BTN_SECONDARY_STYLE,
							disabled: busy,
							children: "取消"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => {
								submitLaunch();
							},
							style: goal.trim() === "" || busy ? BTN_DISABLED_STYLE : BTN_PRIMARY_STYLE,
							disabled: goal.trim() === "" || busy,
							children: busy ? "发起中…" : "▶ 开始"
						})]
					})
				]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				role: "region",
				"aria-label": "第一步：选择角色",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: SECTION_TITLE_STYLE,
						children: "选择角色（launchable=true）"
					}),
					loading && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: LOADING_STYLE,
						children: "角色加载中…"
					}),
					!loading && loadError !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: ERROR_STYLE,
						role: "alert",
						children: loadError
					}),
					!loading && loadError === "" && roles.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: EMPTY_STYLE,
						children: "暂无可发起角色（请在 Tab2 新建）"
					}),
					!loading && loadError === "" && roles.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: CARD_LIST_STYLE,
						children: roles.map((role) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							onClick: () => pickRole(role),
							style: ROLE_CARD_STYLE,
							"aria-label": `选择角色 ${role.name}`,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									style: ROLE_CARD_NAME_STYLE,
									children: role.name
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									style: ROLE_CARD_SUMMARY_STYLE,
									children: role.summary
								}),
								role.children.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: CHIPS_ROW_STYLE,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: CHIP_STYLE,
										children: "子角色："
									}), role.children.map((child) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: CHIP_STYLE,
										children: child
									}, child))]
								})
							]
						}, role.id))
					})
				]
			});
		}
		//#endregion
		//#region src/client/AgentsView.tsx
		const IFRAME_STYLE$2 = {
			width: "100%",
			height: "100%",
			minHeight: "70vh",
			border: 0,
			display: "block"
		};
		/** Tab2 Agent 管理视图：iframe 容器，嵌入 node 半自包含单页 /meow-workflow/agents。 */
		function AgentsView(_props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("iframe", {
				src: "/meow-workflow/agents",
				title: "Meow 工作流 · Agent 管理",
				style: IFRAME_STYLE$2
			});
		}
		//#endregion
		//#region src/client/MemoryView.tsx
		const IFRAME_STYLE$1 = {
			width: "100%",
			height: "100%",
			minHeight: "70vh",
			border: 0,
			display: "block"
		};
		/** 记忆视图：iframe 容器，嵌入 node 半自包含单页 /meow-workflow/memory。 */
		function MemoryView(_props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("iframe", {
				src: "/meow-workflow/memory",
				title: "Meow 工作流 · 项目记忆",
				style: IFRAME_STYLE$1
			});
		}
		//#endregion
		//#region src/client/LedgerView.tsx
		const IFRAME_STYLE = {
			width: "100%",
			height: "100%",
			minHeight: "70vh",
			border: 0,
			display: "block"
		};
		/** 台账视图：iframe 容器，嵌入 node 半自包含单页 /meow-workflow/ledger。 */
		function LedgerView(_props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("iframe", {
				src: "/meow-workflow/ledger",
				title: "Meow 工作流 · 项目台账",
				style: IFRAME_STYLE
			});
		}
		//#endregion
		//#region src/client/WorkflowPanel.tsx
		/**
		* 右侧工作流面板浮层（shell.overlay 槽，T-02 + T-05 交付）。
		*
		* ui-layout 的 `shell.overlay` 是加性全屏浮层（root 域，列表槽），
		* 它的渲染层 `.overlayLayer` 默认 click-through（pointer-events: none），
		* 条目根节点由 CSS 恢复 pointer-events: auto（`.overlayLayer > *`）。
		*
		* 与 meow-dsh-task 的 TaskPanel 完全同构（docs/agent-chain-ui-v2 §2 + §9）：
		*   - 全屏遮罩 `rgba(15,23,42,0.35)`；
		*   - 右停靠 80% 宽 / max-width 1100px 面板；
		*   - header：标题「Meow 工作流」+ Tab 切换 + 关闭 ×；
		*   - 面板内部点击 `stopPropagation` 不冒泡（避免误关）；
		*   - 关闭时渲染 null（完全卸载，不占布局）。
		*
		* 四 Tab 头：
		*   - 发起角色：渲染 <LaunchView />（T-05 交付 — 选角色→填目标→开始，
		*     复用 workflow-api 的 fetchRoles/buildAndSend，成功后自动关闭侧滑）；
		*   - Agent 管理：渲染 <AgentsView />（T-07 交付 — iframe 容器，
		*     src=/meow-workflow/agents，node 半自包含单页）；
		*   - 记忆：渲染 <MemoryView />（iframe 容器，src=/meow-workflow/memory，
		*     项目选择器 + 各角色记忆列表，只读）；
		*   - 台账：渲染 <LedgerView />（iframe 容器，src=/meow-workflow/ledger，
		*     项目选择器 + 各台账簿记录列表，只读）。
		*
		* 面板开关走模块级 panel-store（panel-store.ts），与 RoleButton（conversation.input.right
		* 槽，session 域）共享状态——跨 slot 域天然。
		*/
		const OVERLAY_STYLE = {
			position: "absolute",
			inset: 0,
			zIndex: 30,
			background: "rgba(15, 23, 42, 0.35)"
		};
		const PANEL_STYLE = {
			position: "absolute",
			top: 0,
			right: 0,
			bottom: 0,
			width: "80%",
			maxWidth: "1100px",
			display: "flex",
			flexDirection: "column",
			background: "var(--dsw-alias-bg-base, #fff)",
			borderLeft: "1px solid var(--dsw-alias-border-l2, #e2e5ea)",
			boxShadow: "-8px 0 24px rgba(0, 0, 0, 0.18)"
		};
		const HEADER_STYLE = {
			flex: "none",
			display: "flex",
			alignItems: "center",
			justifyContent: "space-between",
			gap: 8,
			height: 44,
			padding: "0 12px 0 16px",
			borderBottom: "1px solid var(--dsw-alias-border-l1, #eceff3)",
			fontSize: 14,
			fontWeight: 600,
			color: "var(--dsw-alias-label-primary, #111827)"
		};
		const TAB_GROUP_STYLE = {
			display: "inline-flex",
			gap: 4
		};
		const TAB_BTN_ACTIVE = {
			height: 28,
			padding: "0 12px",
			border: "1px solid var(--dsw-alias-border-l2, #e2e5ea)",
			borderRadius: 6,
			background: "var(--dsw-alias-accent, #2563eb)",
			color: "#fff",
			fontSize: 13,
			cursor: "pointer"
		};
		const TAB_BTN_INACTIVE = {
			height: 28,
			padding: "0 12px",
			border: "1px solid var(--dsw-alias-border-l2, #e2e5ea)",
			borderRadius: 6,
			background: "var(--dsw-alias-bg-base, #fff)",
			color: "var(--dsw-alias-label-primary, #111827)",
			fontSize: 13,
			cursor: "pointer"
		};
		const CLOSE_BTN_STYLE = {
			width: 28,
			height: 28,
			border: "none",
			borderRadius: 6,
			background: "transparent",
			color: "var(--dsw-alias-label-tertiary, #6b7280)",
			fontSize: 18,
			lineHeight: 1,
			cursor: "pointer"
		};
		const TAB_BODY_STYLE = {
			flex: 1,
			minHeight: 0,
			overflow: "auto",
			padding: "16px"
		};
		/**
		* 右侧工作流面板浮层：面板关闭时渲染 null（完全卸载，不占布局）。
		* 三 Tab：发起角色 / Agent 管理 / 记忆。
		*/
		function WorkflowPanel(_props) {
			const isOpen = (0, react.useSyncExternalStore)(subscribe, getOpen);
			const [activeTab, setActiveTab] = (0, react.useState)("launch");
			if (!isOpen) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: OVERLAY_STYLE,
				onClick: () => setOpen(false),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: PANEL_STYLE,
					onClick: (event) => event.stopPropagation(),
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: HEADER_STYLE,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "Meow 工作流" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: TAB_GROUP_STYLE,
								role: "tablist",
								"aria-label": "工作流面板 Tab 切换",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										role: "tab",
										"aria-selected": activeTab === "launch",
										"aria-label": "发起角色",
										title: "发起角色",
										onClick: () => setActiveTab("launch"),
										style: activeTab === "launch" ? TAB_BTN_ACTIVE : TAB_BTN_INACTIVE,
										children: "发起角色"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										role: "tab",
										"aria-selected": activeTab === "agents",
										"aria-label": "Agent 管理",
										title: "Agent 管理",
										onClick: () => setActiveTab("agents"),
										style: activeTab === "agents" ? TAB_BTN_ACTIVE : TAB_BTN_INACTIVE,
										children: "Agent 管理"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										role: "tab",
										"aria-selected": activeTab === "memory",
										"aria-label": "记忆",
										title: "记忆",
										onClick: () => setActiveTab("memory"),
										style: activeTab === "memory" ? TAB_BTN_ACTIVE : TAB_BTN_INACTIVE,
										children: "记忆"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										role: "tab",
										"aria-selected": activeTab === "ledger",
										"aria-label": "台账",
										title: "台账",
										onClick: () => setActiveTab("ledger"),
										style: activeTab === "ledger" ? TAB_BTN_ACTIVE : TAB_BTN_INACTIVE,
										children: "台账"
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								"aria-label": "关闭工作流面板",
								title: "关闭",
								onClick: () => setOpen(false),
								style: CLOSE_BTN_STYLE,
								children: "×"
							})
						]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: TAB_BODY_STYLE,
						children: activeTab === "launch" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LaunchView, {}) : activeTab === "agents" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AgentsView, {}) : activeTab === "ledger" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LedgerView, {}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MemoryView, {})
					})]
				})
			});
		}
		//#endregion
		//#region src/client/index.ts
		/** 插件名（cordis 诊断标签；loader 条目名仍为包名 meow-dsh-workflow）。 */
		const name = "meow-dsh-workflow-client";
		/** 需要的服务：`slots`（SlotRegistry，由 @deepseek-ai/dsh-client-runtime 提供）。 */
		const inject = ["slots"];
		/**
		* 客户端插件体：注册输入框按钮 + 右侧工作流面板浮层（slot 注入，随插件卸载自动回收）。
		* @param ctx - 客户端根上下文（含 ctx.slots / ctx.effect 等 cordis 核心面）。
		*/
		function apply(ctx) {
			ctx.slots.inject("conversation.input.right", () => ctx.slots.register({
				name: "conversation.input.right",
				id: "meow-workflow",
				order: 20
			}, RoleButton));
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "meow-workflow-panel"
			}, WorkflowPanel));
		}
		//#endregion
		exports.AgentsView = AgentsView;
		exports.LaunchView = LaunchView;
		exports.RoleButton = RoleButton;
		exports.WorkflowPanel = WorkflowPanel;
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map