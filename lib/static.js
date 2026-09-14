/**
 * meow-dsh-workflow Web 管理页 —— Tab2 Agent 管理自包含单页（HTML + 内嵌 CSS + 内嵌 JS）。
 *
 * 设计文档：docs/agent-chain-ui-v2.md §4 / §5 / §7。
 *
 * 形态（与 meow-dsh-task src/web/static.ts 同款 —— 自包含单页）：
 *   - 内嵌 CSS：表格 + 编辑表单 + 授权三列勾选 + 弹窗；
 *   - 内嵌 JS：纯 fetch `/api/meow-workflow/{agents,tools}`，零本地读盘；
 *   - 中文界面，数据变更后 flash + 自动刷新；错误内联显示后端 error 文案。
 *
 * 表单字段（一一对应 AgentDef schema，§5）：
 *   id / name / summary / systemPrompt / allowedTools / allowedSkills / allowedMcps /
 *   children（动态行 name+description）/ model / launchable。
 *
 * 红线 8（设计文档 §5 + protocol R01-08）：
 *   - 静态 HTML 自身不含 ASCII 双花括号字面（占位符 / 提示文案 / 默认值全部用全角或中文）；
 *   - 表单所有 value 字段在 fetch / 提交前由客户端 JS 经 escapeAsciiBraces 防御；
 *   - 错误 message 经 oneLine 防御。
 *
 * 注意（内嵌约束）：本字符串为 TS 模板字面量，内嵌 JS 不得使用反引号或 ${}——
 * 故 app 逻辑一律用单/双引号字符串 + 拼接，不用模板字符串。
 */
export const AGENTS_INDEX_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Meow 工作流 · Agent 管理</title>
<style>
:root{--bg:#f5f6f8;--card:#fff;--border:#e2e5ea;--primary:#2563eb;--danger:#dc2626;--ok:#16a34a;--muted:#6b7280;}
*{box-sizing:border-box;}
img,pre,code{max-width:100%;overflow-wrap:break-word;word-break:break-word;}
body{margin:0;font-family:"Microsoft YaHei",system-ui,sans-serif;background:var(--bg);color:#111827;}
header{padding:10px 16px;background:var(--card);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;}
header h1{font-size:17px;margin:0;}
.dual-hint{font-size:12px;color:var(--muted);margin-top:2px;overflow-wrap:break-word;word-break:break-word;}
.dual-hint code{background:#eef2ff;color:#4338ca;padding:0 4px;border-radius:4px;}
.head-right{display:flex;align-items:center;gap:10px;}
main{padding:16px 20px;max-width:1100px;min-width:0;overflow-x:auto;}
.card{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:16px;}
.card h2{font-size:15px;margin:0 0 10px;display:flex;align-items:center;gap:8px;}
.card h2 .count{font-size:12px;color:var(--muted);font-weight:normal;}
.row{display:flex;gap:6px;margin:6px 0;flex-wrap:wrap;align-items:center;}
.row > *{min-width:0;}
input,select,textarea,button{font:inherit;padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:#fff;color:#111827;}
input,textarea{min-width:0;}
input[type=text],input:not([type]){width:100%;}
.field select{width:100%;}
textarea{width:100%;display:block;margin:4px 0;resize:vertical;}
button{cursor:pointer;background:#f3f4f6;white-space:nowrap;}
button.primary{background:var(--primary);color:#fff;border-color:var(--primary);}
button.danger{background:#fef2f2;color:var(--danger);border-color:#fecaca;}
button.small{padding:3px 8px;font-size:12px;}
button.link{background:none;border:none;color:var(--primary);padding:2px;font-size:12px;cursor:pointer;}
.muted{color:var(--muted);font-size:12px;}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--border);border-radius:8px;font-size:13px;}
.table-wrap{overflow-x:auto;}
th,td{padding:8px 10px;border-bottom:1px solid var(--border);text-align:left;vertical-align:top;overflow-wrap:break-word;word-break:break-word;}
th{background:#f9fafb;font-weight:600;color:#374151;white-space:nowrap;}
tr:last-child td{border-bottom:none;}
.ops{display:flex;gap:4px;flex-wrap:wrap;align-items:center;}
.launch-dot{color:var(--primary);font-weight:600;font-size:14px;}
.field{margin:8px 0;min-width:0;}
.field label{display:block;font-size:12px;color:var(--muted);margin-bottom:2px;}
.field .hint{font-size:11px;color:var(--muted);margin-top:2px;}
.perm-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:8px 0;}
.perm-col{border:1px solid var(--border);border-radius:8px;padding:8px 10px;background:#fafbfc;min-width:0;}
.perm-col h3{font-size:13px;margin:0 0 6px;color:var(--muted);font-weight:600;}
.perm-opt{display:flex;align-items:center;gap:4px;font-size:12px;padding:2px 0;min-width:0;overflow-wrap:break-word;word-break:break-word;}
.perm-opt.mcp-tool-opt{padding-left:22px;}
.perm-opt input{margin:0;flex:none;}
.children-row{display:flex;gap:6px;margin:6px 0;align-items:flex-start;flex-wrap:wrap;}
.children-row > .field{flex:1;min-width:140px;}
.modal-wrap{position:fixed;inset:0;background:rgba(15,23,42,0.35);z-index:80;display:flex;align-items:center;justify-content:center;}
.modal{background:#fff;border-radius:10px;box-shadow:0 20px 60px rgba(0,0,0,0.2);width:680px;max-width:96vw;max-height:90vh;overflow:auto;}
.modal-head{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border);font-weight:600;}
.modal-close{border:none;background:transparent;font-size:18px;color:var(--muted);cursor:pointer;}
.modal-body{padding:14px 16px;overflow-wrap:break-word;word-break:break-word;}
.flash{position:fixed;right:16px;bottom:16px;background:#111827;color:#fff;padding:10px 16px;border-radius:8px;opacity:0;transition:opacity .2s;z-index:99;pointer-events:none;max-width:60vw;}
.flash.show{opacity:1;}
.flash.err{background:var(--danger);}
.hidden{display:none !important;}
.form-error{color:var(--danger);font-size:12px;margin:6px 0;padding:6px 8px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;}
@media(max-width:720px){main{padding:12px;}.perm-grid{grid-template-columns:1fr;}}
</style>
</head>
<body>
<header>
  <div>
    <h1>Meow 工作流 · Agent 管理</h1>
    <div class="dual-hint">列表与表单数据走 <code>/api/meow-workflow/agents</code> + <code>/api/meow-workflow/tools</code> · 保存直接写 agents.json</div>
  </div>
  <div class="head-right">
    <button id="refreshBtn" class="small" type="button">刷新</button>
    <button id="newBtn" class="small primary" type="button">新建角色</button>
  </div>
</header>
<main>
  <div class="card">
    <h2>Agent 定义库 <span class="count" id="agentCount"></span></h2>
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>ID</th><th>名称</th><th>范式摘要</th><th>可发起</th><th>子角色数</th><th>操作</th></tr>
        </thead>
        <tbody id="agentTbody"></tbody>
      </table>
    </div>
  </div>
</main>
<div id="modalWrap" class="modal-wrap hidden">
  <div class="modal">
    <div class="modal-head">
      <span id="modalTitle"></span>
      <button type="button" class="modal-close" id="modalClose">×</button>
    </div>
    <div class="modal-body" id="modalBody"></div>
  </div>
</div>
<div id="flash" class="flash"></div>
<script>
(function () {
  'use strict';

  // ----- 红线 8：客户端再防一道（与 node 半 protocols.escapePromptBraces 同源） -----
  function escapeAsciiBraces(s) {
    return String(s == null ? '' : s).replace(/\\{\\{/g, '｛｛').replace(/\\}\\}/g, '｝｝');
  }
  function oneLine(s) {
    return escapeAsciiBraces(s).replace(/\\s*\\n+\\s*/g, ' ').trim();
  }
  function summarizeSystemPrompt(text) {
    var line = oneLine(text || '');
    var dot = line.search(/[。！？]/);
    return dot === -1 ? line : line.slice(0, dot + 1);
  }

  // ----- 状态 -----
  var agents = [];
  var tools = { tools: [], skills: [], mcps: [], models: [] };

  function $(sel) { return document.querySelector(sel); }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'text') node.textContent = attrs[k];
        else if (k === 'checked') node.checked = attrs[k];
        else node.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) {
      if (c === null || c === undefined) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function btn(label, cls, onClick) {
    var b = el('button', { type: 'button', class: cls || '', text: label });
    b.addEventListener('click', onClick);
    return b;
  }

  function flash(msg, isErr) {
    var f = $('#flash');
    f.textContent = msg;
    f.classList.toggle('err', !!isErr);
    f.classList.add('show');
    if (f._t) clearTimeout(f._t);
    f._t = setTimeout(function () { f.classList.remove('show'); }, 2600);
  }

  // ----- API -----
  async function api(method, path, body) {
    var opts = { method: method, headers: {} };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    var res = await fetch(path, opts);
    var data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok) {
      var msg = data && data.error ? oneLine(data.error) : ('HTTP ' + res.status);
      var err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  // ----- 渲染：表格 -----
  function renderTable() {
    var tbody = $('#agentTbody');
    tbody.textContent = '';
    $('#agentCount').textContent = agents.length ? ('共 ' + agents.length + ' 个') : '';
    if (!agents.length) {
      var tr0 = el('tr');
      tr0.appendChild(el('td', { colspan: '6', class: 'muted', text: '暂无 Agent 定义，点「新建角色」或「刷新」加载' }));
      tbody.appendChild(tr0);
      return;
    }
    agents.forEach(function (a) {
      var tr = el('tr');
      tr.appendChild(el('td', { text: a.id }));
      tr.appendChild(el('td', { text: a.name }));
      var summaryText = a.summary ? a.summary : summarizeSystemPrompt(a.systemPrompt);
      tr.appendChild(el('td', { text: summaryText }));
      tr.appendChild(el('td', {}, [el('span', { class: 'launch-dot', text: a.launchable ? '●' : '' })]));
      tr.appendChild(el('td', { text: String((a.children || []).length) }));
      var ops = el('td');
      var box = el('div', { class: 'ops' });
      box.appendChild(btn('编辑', 'small link', function () { openEdit(a); }));
      box.appendChild(btn('删除', 'small link danger', function () { doDelete(a); }));
      ops.appendChild(box);
      tr.appendChild(ops);
      tbody.appendChild(tr);
    });
  }

  // ----- 表单 -----
  function emptyAgent() {
    return {
      id: '', name: '', summary: '', systemPrompt: '',
      allowedSkills: [], allowedMcps: [], allowedTools: [],
      children: [], launchable: false,
    };
  }

  function openNew() {
    openForm('新建角色', emptyAgent(), true);
  }

  function openEdit(agent) {
    var copy = JSON.parse(JSON.stringify(agent));
    if (copy.summary === undefined) copy.summary = '';
    openForm('编辑角色：' + copy.id, copy, false);
  }

  function openForm(title, agent, isNew) {
    var idInp = el('input', { name: 'id', value: agent.id });
    if (!isNew) idInp.setAttribute('readonly', 'readonly');
    var nameInp = el('input', { name: 'name', value: agent.name });
    var summaryInp = el('input', { name: 'summary', value: agent.summary || '' });
    var promptInp = el('textarea', { name: 'systemPrompt', rows: 6, placeholder: '身份与行为范式（可含 <语言链引用:agent:角色名>）' });
    promptInp.value = agent.systemPrompt || '';
    // 编辑回显：provider+model 合成为「provider/model」串（与 /tools models 组同格式，保 round-trip）
    var modelValue = agent.provider && agent.model ? (agent.provider + '/' + agent.model)
      : (agent.model || '');
    // R11 修复（模型配置后无法再改）：原实现是 input+datalist，浏览器会把下拉选项按输入框
    // 当前值过滤（Chrome 子串匹配 / Firefox 前缀匹配）——编辑已配置角色时输入框预填了完整
    // 「provider/model」串，其他模型选项都不含该子串 → 下拉只剩当前值自己一个选项（首次为空
    // 才能看到全部）。改用原生 select（永不过滤）：
    //   留空项 ∪ /tools models（LLM 目录枚举）∪ agents.json 已引用 model ∪ 当前编辑值 ∪「自定义…」手输兜底。
    var CUSTOM_MODEL = '__meow_custom__';
    var modelOptions = [];
    var modelSeen = {};
    function pushModel(m) {
      if (typeof m !== 'string') return;
      var t = m.trim();
      if (t === '' || modelSeen[t]) return;
      modelSeen[t] = true;
      modelOptions.push(t);
    }
    (tools.models || []).forEach(pushModel);
    agents.forEach(function (a) {
      if (a.model) pushModel(a.provider ? (a.provider + '/' + a.model) : a.model);
    });
    pushModel(modelValue); // 当前值恒入选项（枚举外的历史手输值也保 round-trip 可见可选）
    var modelSel = el('select', { name: 'model' });
    modelSel.appendChild(el('option', { value: '', text: '（留空 = 继承主 agent 当前模型）' }));
    modelOptions.forEach(function (m) {
      modelSel.appendChild(el('option', { value: m, text: m }));
    });
    modelSel.appendChild(el('option', { value: CUSTOM_MODEL, text: '自定义…（手输模型 id）' }));
    // 手输兜底（枚举失败 / 私有模型）：选「自定义…」时显示，其余选择时隐藏
    var modelCustomInp = el('input', { name: 'modelCustom', class: 'hidden', placeholder: '手输模型 id 或 provider/model 串' });
    if (modelValue !== '') modelSel.value = modelValue;
    modelSel.addEventListener('change', function () {
      if (modelSel.value === CUSTOM_MODEL) {
        modelCustomInp.classList.remove('hidden');
        modelCustomInp.focus();
      } else {
        modelCustomInp.classList.add('hidden');
      }
    });
    var launchableCb = el('input', { type: 'checkbox', name: 'launchable' });
    launchableCb.checked = !!agent.launchable;

    // 授权三列勾选
    var permGrid = el('div', { class: 'perm-grid' });
    permGrid.appendChild(permColumn('系统工具', 'allowedTools', tools.tools, agent.allowedTools || []));
    // R08 问题 2：skills 组为具体技能名（dsh 本地技能 + meow 远程技能），可逐个授权。
    permGrid.appendChild(permColumn('技能（本地+远程）', 'allowedSkills', tools.skills, agent.allowedSkills || []));
    // R11 MCP 工具级授权：server 勾选（allowedMcps = 全部工具）+ server 下逐工具勾选。
    permGrid.appendChild(mcpColumn(agent));

    // children 动态行（R-06 T-06/2：name 输入改为 datalist 选取，自动带出 systemPrompt 首句作职责）
    var childrenBox = el('div', { id: 'childrenBox' });
    var childrenArr = (agent.children || []).slice();
    // 全局 datalist：枚举 agent 库的 name 列表（避免拼错语言链引用导致目录条目缺失）
    var nameDataList = el('datalist', { id: 'agentNameList' });
    function rebuildNameDataList() {
      nameDataList.textContent = '';
      // 收集当前 agents 库 + 当前已输入的 children 名称（去重保序）
      var names = [];
      var seen = {};
      function push(n) {
        if (typeof n !== 'string') return;
        var t = n.trim();
        if (t === '' || seen[t]) return;
        seen[t] = true;
        names.push(t);
      }
      // 1. 来自 agent 库（refresh() 已填充）
      for (var i = 0; i < agents.length; i++) push(agents[i].name);
      // 2. 来自 children 自身（已填入但库里没有的也保留可选项）
      for (var j = 0; j < childrenArr.length; j++) push(childrenArr[j].name);
      names.forEach(function (n) {
        nameDataList.appendChild(el('option', { value: n }));
      });
    }
    /** 在 agent 库找 name 匹配的 systemPrompt（用于自动填职责）。 */
    function resolveChildDescription(name) {
      var t = (name || '').trim();
      if (t === '') return '';
      for (var i = 0; i < agents.length; i++) {
        if (agents[i].name === t) {
          var sp = typeof agents[i].systemPrompt === 'string' ? agents[i].systemPrompt : '';
          // 取首句（到第一个句号/换行/分号止）作为职责简述
          // 注：模板字符串内正则转义须用 \\n（双反斜杠）——单反斜杠 \n 会被模板转义成
          // 真实换行符，输出到浏览器内联脚本后正则字面量含换行 → SyntaxError: missing /
          var stop = sp.search(/[。.;；\\n]/);
          return stop > 0 ? sp.slice(0, stop).trim() : sp.trim();
        }
      }
      return '';
    }
    function rerenderChildren() {
      childrenBox.textContent = '';
      childrenArr.forEach(function (c, idx) {
        var row = el('div', { class: 'children-row' });
        var nameF = el('div', { class: 'field' });
        nameF.appendChild(el('label', { text: '名称' }));
        // datalist 选取：list 指向全局 agentNameList，可手输（输入未匹配时浏览器不强制）
        var nameInpR = el('input', { name: 'childName', value: c.name || '', list: 'agentNameList' });
        nameInpR.addEventListener('input', function (ev) {
          var v = ev.target.value;
          childrenArr[idx].name = v;
          // 选中库里已有 name → 自动带出 systemPrompt 首句到职责（仅当职责为空时填充，避免覆盖手输）
          if (childrenArr[idx].description === '' || childrenArr[idx].description === undefined) {
            var auto = resolveChildDescription(v);
            if (auto !== '') {
              childrenArr[idx].description = auto;
              rerenderChildren();
              return; // rerenderChildren 会重建 DOM，input handler 自然结束
            }
          }
          rebuildNameDataList(); // 名称变化后刷新 datalist 选项
        });
        nameF.appendChild(nameInpR);
        var descF = el('div', { class: 'field' });
        descF.appendChild(el('label', { text: '职责' }));
        var descInp = el('textarea', { name: 'childDesc', rows: 1 });
        descInp.value = c.description || '';
        descInp.addEventListener('input', function (ev) { childrenArr[idx].description = ev.target.value; });
        descF.appendChild(descInp);
        row.appendChild(nameF);
        row.appendChild(descF);
        row.appendChild(btn('－', 'small danger', function () {
          childrenArr.splice(idx, 1);
          rerenderChildren();
        }));
        childrenBox.appendChild(row);
      });
      rebuildNameDataList();
      childrenBox.appendChild(nameDataList); // datalist 放 childrenBox 容器内（form 任何位置皆可被 input.list 引用）
      childrenBox.appendChild(btn('＋ 添加子角色', 'small', function () {
        childrenArr.push({ name: '', description: '' });
        rerenderChildren();
      }));
    }
    rerenderChildren();

    var errorBox = el('div', { class: 'form-error hidden', id: 'formError' });

    var form = el('form');
    form.appendChild(field('ID *（新建可改，编辑只读）', idInp));
    form.appendChild(field('名称 *', nameInp));
    form.appendChild(field('范式摘要（可选）', summaryInp));
    form.appendChild(field('身份与行为范式 *', promptInp));
    var langHint = el('div', { class: 'hint' });
    langHint.appendChild(document.createTextNode('语法提示：'));
    langHint.appendChild(el('code', { text: '<语言链引用:agent:角色名>' }));
    langHint.appendChild(document.createTextNode(' 会被解析进子 agent 目录（保存前不强制校验）'));
    var promptWrap = el('div', { class: 'field' });
    promptWrap.appendChild(el('label', { text: '身份与行为范式 *' }));
    promptWrap.appendChild(promptInp);
    promptWrap.appendChild(langHint);
    form.appendChild(promptWrap);
    var permField = el('div', { class: 'field' });
    permField.appendChild(el('label', { text: '授权勾选（数据源 /api/meow-workflow/tools）' }));
    permField.appendChild(permGrid);
    form.appendChild(permField);
    var childrenField = el('div', { class: 'field' });
    childrenField.appendChild(el('label', { text: '子 agent 目录（children）' }));
    childrenField.appendChild(childrenBox);
    form.appendChild(childrenField);
    // 模型字段（R10/R11）：label + select 下拉（不受当前值过滤）+「自定义…」手输兜底 + 提示
    var modelWrap = el('div', { class: 'field' });
    modelWrap.appendChild(el('label', { text: '模型（可选）' }));
    modelWrap.appendChild(modelSel);
    modelWrap.appendChild(modelCustomInp);
    var modelHint = el('div', { class: 'hint' });
    modelHint.appendChild(document.createTextNode('留空 = 继承主 agent 当前模型；下拉直接选可用模型；选「自定义…」可手输模型 id'));
    modelWrap.appendChild(modelHint);
    form.appendChild(modelWrap);
    var launchableWrap = el('div', { class: 'field' });
    var launchableLabel = el('label');
    launchableLabel.appendChild(launchableCb);
    launchableLabel.appendChild(document.createTextNode(' 可作为发起角色（出现在 Tab1 列表）'));
    launchableWrap.appendChild(launchableLabel);
    form.appendChild(launchableWrap);
    form.appendChild(errorBox);

    var cancelBtn = btn('取消', '', closeModal);
    var saveBtn = btn('保存', 'primary', null);
    form.appendChild(el('div', { class: 'row', style: 'justify-content:flex-end;margin-top:12px;' }, [cancelBtn, saveBtn]));

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var errMsg = validateForm(idInp.value, nameInp.value, promptInp.value, isNew);
      if (errMsg) {
        errorBox.textContent = errMsg;
        errorBox.classList.remove('hidden');
        return;
      }
      errorBox.classList.add('hidden');
      var body = {
        id: escapeAsciiBraces(idInp.value.trim()),
        name: escapeAsciiBraces(nameInp.value.trim()),
        systemPrompt: escapeAsciiBraces(promptInp.value),
      };
      var summaryVal = summaryInp.value.trim();
      if (summaryVal) body.summary = escapeAsciiBraces(summaryVal);
      body.allowedTools = collectChecked('allowedTools');
      body.allowedSkills = collectChecked('allowedSkills');
      body.allowedMcps = collectChecked('allowedMcps');
      body.children = childrenArr
        .filter(function (c) { return (c.name || '').trim() !== ''; })
        .map(function (c) { return { name: escapeAsciiBraces((c.name || '').trim()), description: escapeAsciiBraces(c.description || '') }; });
      // R10/R11 模型选择：provider/model 串拆开存（跨厂商路由）；无斜杠 = 裸 model id（继承父 provider）。
      // 「自定义…」= 读手输框；其余 = 读 select 选中值（留空项 value='' → 不传，继承父模型）。
      var modelVal = modelSel.value === CUSTOM_MODEL ? modelCustomInp.value.trim() : modelSel.value;
      if (modelVal) {
        var slash = modelVal.indexOf('/');
        if (slash > 0 && slash < modelVal.length - 1) {
          body.provider = escapeAsciiBraces(modelVal.slice(0, slash));
          body.model = escapeAsciiBraces(modelVal.slice(slash + 1));
        } else {
          body.model = escapeAsciiBraces(modelVal);
        }
      }
      body.launchable = launchableCb.checked;
      doSave(isNew, body);
    });
    saveBtn.addEventListener('click', function () {
      form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    });

    openModal(title, form);
  }

  function field(labelText, control) {
    var wrap = el('div', { class: 'field' });
    wrap.appendChild(el('label', { text: labelText }));
    wrap.appendChild(control);
    return wrap;
  }

  function permColumn(title, groupName, options, selected) {
    var col = el('div', { class: 'perm-col' });
    col.appendChild(el('h3', { text: title }));
    var sel = new Set(selected || []);
    (options || []).forEach(function (name) {
      var cb = el('input', { type: 'checkbox', name: 'perm', value: name, 'data-group': groupName });
      cb.checked = sel.has(name);
      var lab = el('label', { class: 'perm-opt' });
      lab.appendChild(cb);
      lab.appendChild(el('span', { text: name }));
      col.appendChild(lab);
    });
    if (!(options || []).length) {
      col.appendChild(el('div', { class: 'muted', text: '（暂无）' }));
    }
    return col;
  }

  // R11 MCP 工具级授权列：原实现只列 server 名（allowedMcps，粒度粗到整台服务器）。
  // 现在 server 勾选仍写 allowedMcps（= 该 server 全部工具，运行时前缀展开语义不变），
  // server 下方逐工具勾选写 allowedTools 精确名（mcp__<server>__<tool>，
  // compileAllowedTools 直接入白名单）——细粒度到单个工具。
  // 数据源：/tools mcpTools 组（server → 工具全名，groupToolNames 收集）；
  // 枚举不到工具的 server（离线/枚举降级）只渲染 server 级勾选，行为同旧版兜底。
  function mcpColumn(agent) {
    var col = el('div', { class: 'perm-col' });
    col.appendChild(el('h3', { text: 'MCP 服务器' }));
    var savedMcps = agent.allowedMcps || [];
    var savedTools = agent.allowedTools || [];
    var mcpTools = tools.mcpTools || {};
    var servers = tools.mcps || [];
    if (!servers.length) {
      col.appendChild(el('div', { class: 'muted', text: '（暂无）' }));
      return col;
    }
    col.appendChild(el('div', { class: 'hint', text: '勾服务器 = 全部工具；勾单个工具 = 仅授权该工具' }));
    servers.forEach(function (server) {
      var toolsOfServer = Array.isArray(mcpTools[server]) ? mcpTools[server] : [];
      var serverLab = el('label', { class: 'perm-opt' });
      var serverCb = el('input', { type: 'checkbox', name: 'perm', value: server, 'data-group': 'allowedMcps' });
      serverCb.checked = savedMcps.indexOf(server) !== -1;
      serverLab.appendChild(serverCb);
      serverLab.appendChild(el('span', { text: server }));
      if (toolsOfServer.length) {
        serverLab.appendChild(el('span', { class: 'muted', text: '（' + toolsOfServer.length + ' 个工具）' }));
      }
      col.appendChild(serverLab);
      if (!toolsOfServer.length) {
        col.appendChild(el('div', { class: 'muted mcp-tool-opt', text: '└ 未枚举到工具（仅服务器级授权）' }));
        return;
      }
      toolsOfServer.forEach(function (full) {
        var prefix = 'mcp__' + server + '__';
        var short = full.slice(prefix.length) !== '' ? full.slice(prefix.length) : full;
        var toolCb = el('input', { type: 'checkbox', name: 'perm', value: full, 'data-group': 'allowedTools' });
        toolCb.checked = savedTools.indexOf(full) !== -1;
        var toolLab = el('label', { class: 'perm-opt mcp-tool-opt' });
        toolLab.appendChild(toolCb);
        toolLab.appendChild(el('span', { text: short }));
        col.appendChild(toolLab);
      });
    });
    return col;
  }

  function collectChecked(group) {
    var out = [];
    var boxes = document.querySelectorAll('input[data-group="' + group + '"]');
    boxes.forEach(function (b) { if (b.checked) out.push(b.value); });
    return out;
  }

  function validateForm(idVal, nameVal, promptVal, isNew) {
    var id = (idVal || '').trim();
    if (id === '') return 'id 不能为空';
    if (!/^[a-z0-9_-]+$/.test(id)) return 'id 仅允许小写字母、数字、下划线、短横线';
    if (isNew) {
      if (agents.some(function (a) { return a.id === id; })) return 'id 已存在，请改用编辑模式';
    }
    if ((nameVal || '').trim() === '') return '名称不能为空';
    if ((promptVal || '').trim() === '') return '身份与行为范式不能为空';
    return null;
  }

  // ----- 弹窗 -----
  function openModal(title, bodyNode) {
    $('#modalTitle').textContent = title;
    var body = $('#modalBody');
    body.textContent = '';
    body.appendChild(bodyNode);
    $('#modalWrap').classList.remove('hidden');
  }
  function closeModal() {
    $('#modalWrap').classList.add('hidden');
  }

  // ----- 操作 -----
  async function refresh() {
    try {
      var results = await Promise.all([
        api('GET', '/api/meow-workflow/agents'),
        api('GET', '/api/meow-workflow/tools'),
      ]);
      agents = results[0].agents || [];
      tools = results[1] || { tools: [], skills: [], mcps: [], models: [] };
      renderTable();
    } catch (err) {
      flash('刷新失败: ' + err.message, true);
    }
  }

  async function doSave(isNew, body) {
    try {
      if (isNew) {
        await api('POST', '/api/meow-workflow/agents', body);
        flash('已新建: ' + body.id);
      } else {
        await api('PUT', '/api/meow-workflow/agents/' + encodeURIComponent(body.id), body);
        flash('已保存: ' + body.id);
      }
      closeModal();
      await refresh();
    } catch (err) {
      var box = $('#formError');
      if (box) {
        box.textContent = err.message;
        box.classList.remove('hidden');
      } else {
        flash('保存失败: ' + err.message, true);
      }
    }
  }

  async function doDelete(agent) {
    if (!confirm('确定删除角色「' + agent.id + '」吗？删除后插件不再回填预置值。')) return;
    try {
      await api('DELETE', '/api/meow-workflow/agents/' + encodeURIComponent(agent.id));
      flash('已删除: ' + agent.id);
      await refresh();
    } catch (err) {
      flash('删除失败: ' + err.message, true);
    }
  }

  // ----- 绑定 -----
  $('#refreshBtn').addEventListener('click', refresh);
  $('#newBtn').addEventListener('click', openNew);
  $('#modalClose').addEventListener('click', closeModal);
  $('#modalWrap').addEventListener('click', function (ev) {
    if (ev.target === ev.currentTarget) closeModal();
  });

  // 初始加载
  refresh();

  // 暴露测试钩（node 测试时可校验渲染逻辑；不参与日常交互）
  window.__meowWorkflowAgents = {
    refresh: refresh,
    openNew: openNew,
    escapeAsciiBraces: escapeAsciiBraces,
    oneLine: oneLine,
    summarizeSystemPrompt: summarizeSystemPrompt,
    collectChecked: collectChecked,
  };
})();
</script>
</body>
</html>`;
// ---------------------------------------------------------------------------
// 记忆页 —— 工作流面板「记忆」tab 自包含单页（项目选择器 + 各角色记忆列表）。
// 红线 8：HTML/JS 无 ASCII 双花括号；内嵌 JS 无反引号/模板字符串（与 AGENTS_INDEX_HTML 同约束）。
// ---------------------------------------------------------------------------
export const MEMORY_PAGE_PATH_HINT = '/api/meow-workflow/memory';
export const MEMORY_INDEX_HTML = `\`<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Meow 工作流 · 项目记忆</title>
<style>
:root{--bg:#f5f6f8;--card:#fff;--border:#e2e5ea;--primary:#2563eb;--muted:#6b7280;--ok:#16a34a;--warn:#d97706;--danger:#dc2626;}
*{box-sizing:border-box;}
html,body{height:100%;}
body{margin:0;font-family:"Microsoft YaHei",system-ui,sans-serif;background:var(--bg);color:#111827;display:flex;flex-direction:column;}
header{flex:none;padding:8px 14px;background:var(--card);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;}
header h1{font-size:15px;margin:0;}
.dual-hint{font-size:11px;color:var(--muted);margin-top:1px;}
.head-right{display:flex;align-items:center;gap:8px;}
select{padding:5px 8px;border:1px solid var(--border);border-radius:6px;background:#fff;max-width:300px;font-size:12px;}
#refreshBtn{padding:5px 10px;border:1px solid var(--border);border-radius:6px;background:#fff;cursor:pointer;font-size:12px;}
.layout{flex:1;display:flex;min-height:0;}
nav{width:232px;flex:none;border-right:1px solid var(--border);background:var(--card);overflow-y:auto;padding:8px;}
.nav-title{font-size:11px;color:var(--muted);padding:4px 10px 6px;letter-spacing:.05em;}
.nav-item{display:flex;justify-content:space-between;align-items:center;gap:6px;padding:8px 10px;border-radius:8px;cursor:pointer;font-size:13px;margin-bottom:2px;border:1px solid transparent;min-width:0;}
.nav-item:hover{background:#f1f5f9;}
.nav-item.active{background:#eef2ff;color:#4338ca;border-color:#c7d2fe;font-weight:600;}
.nav-item .label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.nav-item .n{flex:none;font-size:11px;color:var(--muted);background:#f3f4f6;border-radius:999px;padding:1px 8px;}
.nav-item.active .n{background:#e0e7ff;color:#4338ca;}
main{flex:1;min-width:0;overflow-y:auto;padding:14px 18px;}
main .inner{max-width:860px;}
.card{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:12px;}
.card h2{font-size:14px;margin:0 0 8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.card h2 .count{font-size:12px;color:var(--muted);font-weight:normal;}
.empty{color:var(--muted);padding:24px 0;text-align:center;}
#err{color:var(--danger);font-size:13px;padding:8px 0;}.entry{border:1px solid var(--border);border-radius:8px;padding:8px 12px;margin:8px 0;background:#fafbfc;}
.entry .meta{font-size:12px;color:var(--muted);display:flex;gap:8px;flex-wrap:wrap;align-items:center;}
.entry .meta .kind{background:#eef2ff;color:#4338ca;padding:0 6px;border-radius:4px;}
.entry .meta .runid{background:#f0fdf4;color:#15803d;padding:0 6px;border-radius:4px;}
.entry .title{font-weight:600;margin:4px 0 2px;font-size:13px;}
.entry pre{margin:2px 0 0;white-space:pre-wrap;word-break:break-word;font-size:12px;color:#374151;font-family:inherit;}
</style>
</head>
<body>
<header>
  <div><h1>Meow 工作流 · 项目记忆</h1>
  <div class="dual-hint">各 agent 在本项目的记忆（数据走 <code>/api/meow-workflow/memory</code>，只读）</div></div>
  <div class="head-right">
    <label for="projectSel" style="font-size:12px;color:var(--muted);">项目</label>
    <select id="projectSel"></select>
    <button id="refreshBtn" type="button">刷新</button>
  </div>
</header>
<div class="layout">
  <nav id="nav"></nav>
  <main><div id="err"></div><div class="inner" id="content"><div class="empty">加载中…</div></div></main>
</div>
<script>
(function () {
  'use strict';
  var projects = [];
  var currentRole = null;
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function currentProject() {
    var sel = document.getElementById('projectSel');
    return projects.filter(function (x) { return x.project === sel.value; })[0];
  }
  function renderNav() {
    var nav = document.getElementById('nav');
    var p = currentProject();
    if (!p) { nav.innerHTML = '<div class="nav-title">角色</div>'; return; }
    var roles = p.roles.slice().sort(function (a, b) { return b.count - a.count; });
    if (currentRole === null || !roles.some(function (r) { return r.role === currentRole; })) {
      currentRole = roles.length ? roles[0].role : null;
    }
    var html = '<div class="nav-title">角色（' + roles.length + '）</div>';
    for (var i = 0; i < roles.length; i++) {
      var r = roles[i];
      html += '<div class="nav-item' + (r.role === currentRole ? ' active' : '')
        + '" data-role="' + esc(r.role) + '"><span class="label">' + esc(r.role)
        + '</span><span class="n">' + r.count + '</span></div>';
    }
    nav.innerHTML = html;
    var items = nav.querySelectorAll('.nav-item');
    for (var j = 0; j < items.length; j++) {
      items[j].addEventListener('click', function () {
        currentRole = this.getAttribute('data-role');
        renderNav();
        renderContent();
      });
    }
  }
  function renderContent() {
    var box = document.getElementById('content');
    var p = currentProject();
    if (!p) { box.innerHTML = '<div class="empty">当前项目暂无角色记忆</div>'; return; }
    var r = p.roles.filter(function (x) { return x.role === currentRole; })[0];
    if (!r) { box.innerHTML = '<div class="empty">左侧选择一个角色查看记忆</div>'; return; }
    var html = '<div class="card"><h2>' + esc(r.role)
      + ' <span class="count">' + r.count + ' 条记忆</span></h2>';
    for (var j = 0; j < r.entries.length; j++) {
      var e = r.entries[j];
      html += '<div class="entry"><div class="meta">'
        + '<span>' + esc((e.ts || '').replace('T', ' ').slice(0, 16)) + '</span>'
        + (e.kind ? '<span class="kind">' + esc(e.kind) + '</span>' : '')
        + (e.agentRunId ? '<span class="runid">runId=' + esc(e.agentRunId) + '</span>' : '')
        + '</div><div class="title">' + esc(e.title) + '</div>'
        + '<pre>' + esc(e.content) + '</pre></div>';
    }
    box.innerHTML = html + '</div>';
  }
  function render() { renderNav(); renderContent(); }
  function load() {
    document.getElementById('err').textContent = '';
    fetch('/api/meow-workflow/memory').then(function (r) { return r.json(); }).then(function (data) {
      projects = (data && data.projects) || [];
      var sel = document.getElementById('projectSel');
      var cur = sel.value;
      var opts = '';
      for (var i = 0; i < projects.length; i++) {
        opts += '<option value="' + esc(projects[i].project) + '">' + esc(projects[i].project)
          + '（' + projects[i].total + ' 条）</option>';
      }
      sel.innerHTML = opts;
      if (cur && projects.some(function (x) { return x.project === cur; })) sel.value = cur;
      if (projects.length === 0) {
        document.getElementById('nav').innerHTML = '<div class="nav-title">角色</div>';
        document.getElementById('content').innerHTML = '<div class="empty">暂无任何项目记忆</div>';
        return;
      }
      render();
    }).catch(function (e) {
      document.getElementById('err').textContent = '加载失败: ' + (e && e.message ? e.message : e);
    });
  }
  document.getElementById('projectSel').addEventListener('change', function () { currentRole = null; render(); });
  document.getElementById('refreshBtn').addEventListener('click', load);
  load();
})();
</script>
</body>
</html>`;
// ---------------------------------------------------------------------------
// 台账页 —— 工作流面板「台账」tab 自包含单页（项目选择器 + 各簿记录列表，只读）。
// 红线 8：HTML/JS 无 ASCII 双花括号；内嵌 JS 无反引号/模板字符串（同 AGENTS_INDEX_HTML 约束）。
// ---------------------------------------------------------------------------
export const LEDGER_PAGE_PATH_HINT = '/api/meow-workflow/ledger';
export const LEDGER_INDEX_HTML = `\`<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Meow 工作流 · 项目台账</title>
<style>
:root{--bg:#f5f6f8;--card:#fff;--border:#e2e5ea;--primary:#2563eb;--muted:#6b7280;--ok:#16a34a;--warn:#d97706;--danger:#dc2626;}
*{box-sizing:border-box;}
html,body{height:100%;}
body{margin:0;font-family:"Microsoft YaHei",system-ui,sans-serif;background:var(--bg);color:#111827;display:flex;flex-direction:column;}
header{flex:none;padding:8px 14px;background:var(--card);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;}
header h1{font-size:15px;margin:0;}
.dual-hint{font-size:11px;color:var(--muted);margin-top:1px;}
.head-right{display:flex;align-items:center;gap:8px;}
select{padding:5px 8px;border:1px solid var(--border);border-radius:6px;background:#fff;max-width:300px;font-size:12px;}
#refreshBtn{padding:5px 10px;border:1px solid var(--border);border-radius:6px;background:#fff;cursor:pointer;font-size:12px;}
.layout{flex:1;display:flex;min-height:0;}
nav{width:232px;flex:none;border-right:1px solid var(--border);background:var(--card);overflow-y:auto;padding:8px;}
.nav-title{font-size:11px;color:var(--muted);padding:4px 10px 6px;letter-spacing:.05em;}
.nav-item{display:flex;justify-content:space-between;align-items:center;gap:6px;padding:8px 10px;border-radius:8px;cursor:pointer;font-size:13px;margin-bottom:2px;border:1px solid transparent;min-width:0;}
.nav-item:hover{background:#f1f5f9;}
.nav-item.active{background:#eef2ff;color:#4338ca;border-color:#c7d2fe;font-weight:600;}
.nav-item .label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.nav-item .n{flex:none;font-size:11px;color:var(--muted);background:#f3f4f6;border-radius:999px;padding:1px 8px;}
.nav-item.active .n{background:#e0e7ff;color:#4338ca;}
main{flex:1;min-width:0;overflow-y:auto;padding:14px 18px;}
main .inner{max-width:860px;}
.card{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:12px;}
.card h2{font-size:14px;margin:0 0 8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.card h2 .count{font-size:12px;color:var(--muted);font-weight:normal;}
.empty{color:var(--muted);padding:24px 0;text-align:center;}
#err{color:var(--danger);font-size:13px;padding:8px 0;}.record{border:1px solid var(--border);border-radius:8px;padding:8px 12px;margin:8px 0;background:#fafbfc;}
.record .meta{font-size:12px;color:var(--muted);display:flex;gap:8px;flex-wrap:wrap;align-items:center;}
.record .meta .rid{background:#eef2ff;color:#4338ca;padding:0 6px;border-radius:4px;}
.record .meta .status{padding:0 6px;border-radius:4px;background:#f3f4f6;}
.record .meta .status.done{background:#f0fdf4;color:var(--ok);}
.record .meta .status.open{background:#fffbeb;color:var(--warn);}
.record .meta .status.blocked{background:#fef2f2;color:var(--danger);}
.record .title{font-weight:600;margin:4px 0 2px;font-size:13px;}
.record pre{margin:2px 0 0;white-space:pre-wrap;word-break:break-word;font-size:12px;color:#374151;font-family:inherit;}
</style>
</head>
<body>
<header>
  <div><h1>Meow 工作流 · 项目台账</h1>
  <div class="dual-hint">各台账簿记录（数据走 <code>/api/meow-workflow/ledger</code>，只读）</div></div>
  <div class="head-right">
    <label for="projectSel" style="font-size:12px;color:var(--muted);">项目</label>
    <select id="projectSel"></select>
    <button id="refreshBtn" type="button">刷新</button>
  </div>
</header>
<div class="layout">
  <nav id="nav"></nav>
  <main><div id="err"></div><div class="inner" id="content"><div class="empty">加载中…</div></div></main>
</div>
<script>
(function () {
  'use strict';
  var BOOK_NAMES = { decisions: '决策', actions: '行动项', 'need-boss': '待老板拍板', status: '各线进度', product: '产品', market: '市场增长' };
  var projects = [];
  var currentBook = null;
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function bookLabel(b) { return BOOK_NAMES[b] ? BOOK_NAMES[b] + '（' + b + '）' : b; }
  function currentProject() {
    var sel = document.getElementById('projectSel');
    return projects.filter(function (x) { return x.project === sel.value; })[0];
  }
  function renderNav() {
    var nav = document.getElementById('nav');
    var p = currentProject();
    if (!p) { nav.innerHTML = '<div class="nav-title">台账簿</div>'; return; }
    var books = p.books;
    if (currentBook === null || !books.some(function (b) { return b.book === currentBook; })) {
      currentBook = books.length ? books[0].book : null;
    }
    var html = '<div class="nav-title">台账簿（' + books.length + '）</div>';
    for (var i = 0; i < books.length; i++) {
      var b = books[i];
      html += '<div class="nav-item' + (b.book === currentBook ? ' active' : '')
        + '" data-book="' + esc(b.book) + '"><span class="label">' + esc(bookLabel(b.book))
        + '</span><span class="n">' + b.count + '</span></div>';
    }
    nav.innerHTML = html;
    var items = nav.querySelectorAll('.nav-item');
    for (var j = 0; j < items.length; j++) {
      items[j].addEventListener('click', function () {
        currentBook = this.getAttribute('data-book');
        renderNav();
        renderContent();
      });
    }
  }
  function renderContent() {
    var box = document.getElementById('content');
    var p = currentProject();
    if (!p) { box.innerHTML = '<div class="empty">当前项目暂无台账记录</div>'; return; }
    var b = p.books.filter(function (x) { return x.book === currentBook; })[0];
    if (!b) { box.innerHTML = '<div class="empty">左侧选择一个台账簿查看记录</div>'; return; }
    var html = '<div class="card"><h2>' + esc(bookLabel(b.book))
      + ' <span class="count">' + b.count + ' 条记录</span></h2>';
    for (var j = 0; j < b.records.length; j++) {
      var r = b.records[j];
      var st = r.status ? String(r.status) : '';
      html += '<div class="record"><div class="meta">'
        + '<span class="rid">' + esc(r.id) + '</span>'
        + (st ? '<span class="status ' + esc(st) + '">' + esc(st) + '</span>' : '')
        + '<span>' + esc((r.ts || '').replace('T', ' ').slice(0, 16)) + '</span>'
        + (r.author ? '<span>by ' + esc(r.author) + '</span>' : '')
        + '</div><div class="title">' + esc(r.title) + '</div>'
        + '<pre>' + esc(r.content) + '</pre></div>';
    }
    box.innerHTML = html + '</div>';
  }
  function render() { renderNav(); renderContent(); }
  function load() {
    document.getElementById('err').textContent = '';
    fetch('/api/meow-workflow/ledger').then(function (r) { return r.json(); }).then(function (data) {
      projects = (data && data.projects) || [];
      var sel = document.getElementById('projectSel');
      var cur = sel.value;
      var opts = '';
      for (var i = 0; i < projects.length; i++) {
        opts += '<option value="' + esc(projects[i].project) + '">' + esc(projects[i].project)
          + '（' + projects[i].total + ' 条）</option>';
      }
      sel.innerHTML = opts;
      if (cur && projects.some(function (x) { return x.project === cur; })) sel.value = cur;
      if (projects.length === 0) {
        document.getElementById('nav').innerHTML = '<div class="nav-title">台账簿</div>';
        document.getElementById('content').innerHTML = '<div class="empty">暂无任何项目台账</div>';
        return;
      }
      render();
    }).catch(function (e) {
      document.getElementById('err').textContent = '加载失败: ' + (e && e.message ? e.message : e);
    });
  }
  document.getElementById('projectSel').addEventListener('change', function () { currentBook = null; render(); });
  document.getElementById('refreshBtn').addEventListener('click', load);
  load();
})();
</script>
</body>
</html>`;
