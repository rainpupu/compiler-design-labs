import { LAB56_ERROR_SAMPLE, LAB56_SAMPLE, analyzeLab56, astToMermaid, astToText, flattenAst, makeLab56Report } from './lab56-core.js'

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]))

export function installLab56() {
  queueMicrotask(() => {
    const sidebar = document.querySelector('.sidebar')
    const app = document.querySelector('#app')
    if (!sidebar || !app || document.querySelector('[data-lab5-visual]')) return

    const lab5Button = document.createElement('button')
    lab5Button.className = 'tool-item'
    lab5Button.dataset.lab5Visual = 'true'
    lab5Button.innerHTML = '<span>5</span><div><strong>实验五：语义分析</strong><small>AST、符号表、语义错误报告</small></div>'

    const lab6Button = document.createElement('button')
    lab6Button.className = 'tool-item'
    lab6Button.dataset.lab6Visual = 'true'
    lab6Button.innerHTML = '<span>6</span><div><strong>实验六：中间代码</strong><small>AST 翻译为四元式</small></div>'

    sidebar.appendChild(lab5Button)
    sidebar.appendChild(lab6Button)

    lab5Button.addEventListener('click', () => activateVisualTool(lab5Button, '5'))
    lab6Button.addEventListener('click', () => activateVisualTool(lab6Button, '6'))
  })
}

function activateVisualTool(button, stage) {
  document.querySelectorAll('.tool-item').forEach((item) => item.classList.remove('active'))
  button.classList.add('active')
  renderLabPage(stage)
}

function renderLabPage(stage) {
  const main = document.querySelector('.main')
  const title = document.querySelector('.brand strong')
  const status = document.querySelector('.status span:last-child')
  if (!main) return
  const isLab5 = stage === '5'
  if (title) title.textContent = isLab5 ? '实验五：SLR 引导的语义分析框架' : '实验六：中间代码生成'
  main.className = `main lr0-main lab56-main ${isLab5 ? 'lab5-visual-main' : 'lab6-visual-main'}`
  main.innerHTML = `
    <section class="lab56-page">
      <div class="tabs"><div class="tab wide-tab"><span class="tab-dot"></span>${isLab5 ? 'lab5-semantic.src' : 'lab6-ir.src'}<span style="margin-left:auto;color:var(--muted)">×</span></div></div>
      <div class="toolbar lr0-toolbar lab56-toolbar">
        <button class="primary" data-run>▶ ${isLab5 ? '运行实验五语义分析' : '运行实验六中间代码生成'}</button>
        <button data-ok>载入正确示例</button>
        <button data-error>载入错误示例</button>
        <button data-json>导出 JSON</button>
        <button data-md>导出报告</button>
        <button data-clear>清空</button>
      </div>
      <div class="lab56-workspace">
        <section class="grammar-card lab56-source-card">
          <div class="panel-title"><span>源程序输入</span><span>兼容 example/*.src 的主要语法</span></div>
          <textarea data-source class="grammar-input lab56-source" spellcheck="false"></textarea>
          <div class="input-hint">${isLab5 ? '实验五输出 AST、符号表和语义错误报告。' : '实验六复用 AST 和符号表，将语法树翻译为四元式中间代码。'}</div>
        </section>
        <section class="lr0-result lab56-output" data-output></section>
      </div>
    </section>`

  const source = main.querySelector('[data-source]')
  const output = main.querySelector('[data-output]')
  source.value = LAB56_SAMPLE

  const run = () => {
    const result = analyzeLab56(source.value)
    output.innerHTML = renderResult(result, stage)
    bindOutput(output, result)
    if (status) status.textContent = isLab5
      ? `实验五完成：AST ${result.stats.astNodes} 个节点，符号 ${result.stats.symbols} 个，错误 ${result.stats.errors} 个`
      : `实验六完成：四元式 ${result.stats.quads} 条，符号 ${result.stats.symbols} 个，错误 ${result.stats.errors} 个`
  }

  main.querySelector('[data-run]').addEventListener('click', run)
  main.querySelector('[data-ok]').addEventListener('click', () => { source.value = LAB56_SAMPLE; run() })
  main.querySelector('[data-error]').addEventListener('click', () => { source.value = LAB56_ERROR_SAMPLE; run() })
  main.querySelector('[data-clear]').addEventListener('click', () => { source.value = ''; output.innerHTML = ''; if (status) status.textContent = isLab5 ? '已清空实验五输入' : '已清空实验六输入' })
  main.querySelector('[data-json]').addEventListener('click', () => downloadFile(JSON.stringify(analyzeLab56(source.value), null, 2), isLab5 ? 'lab5-semantic-output.json' : 'lab6-ir-output.json', 'application/json;charset=utf-8'))
  main.querySelector('[data-md]').addEventListener('click', () => downloadFile(makeLab56Report(analyzeLab56(source.value), stage), isLab5 ? 'lab5_semantic_report.md' : 'lab6_ir_report.md', 'text/markdown;charset=utf-8'))
  run()
}

function renderResult(result, stage) {
  const isLab5 = stage === '5'
  return `
    <div class="summary-grid compact-summary lab56-summary">
      <div class="summary-card"><span>Token</span><strong>${result.stats.tokens}</strong></div>
      <div class="summary-card"><span>AST 节点</span><strong>${result.stats.astNodes}</strong></div>
      <div class="summary-card"><span>符号</span><strong>${result.stats.symbols}</strong></div>
      <div class="summary-card ${result.stats.errors ? 'warn' : 'ok'}"><span>错误</span><strong>${result.stats.errors}</strong></div>
      ${isLab5 ? '' : `<div class="summary-card"><span>四元式</span><strong>${result.stats.quads}</strong></div>`}
    </div>
    <div class="view-switch lab56-switch">
      <button class="active" data-tab="ast">AST</button>
      <button data-tab="symbols">符号表</button>
      <button data-tab="errors">错误报告</button>
      ${isLab5 ? '' : '<button data-tab="quads">四元式</button>'}
      <button data-tab="trace">分析过程</button>
      <button data-tab="tokens">Token</button>
    </div>
    <div data-panel="ast" class="lab56-panel">${renderAst(result, isLab5)}</div>
    <div data-panel="symbols" class="lab56-panel" hidden>${renderSymbols(result)}</div>
    <div data-panel="errors" class="lab56-panel" hidden>${renderErrors(result, isLab5)}</div>
    ${isLab5 ? '' : `<div data-panel="quads" class="lab56-panel" hidden>${renderQuads(result)}</div>`}
    <div data-panel="trace" class="lab56-panel" hidden>${renderTrace(result, isLab5)}</div>
    <div data-panel="tokens" class="lab56-panel" hidden>${renderTokens(result)}</div>`
}

function renderAst(result, isLab5) {
  const rows = flattenAst(result.ast)
  const treeRows = rows.map((row) => `<tr><td>${row.id}</td><td style="padding-left:${8 + row.depth * 20}px"><span class="ast-kind">${escapeHtml(row.kind)}</span> ${escapeHtml(row.label)}</td><td>${escapeHtml(row.type)}</td></tr>`).join('')
  return `<div class="lab56-grid-two">
    <div class="section-card"><div class="section-head"><div><h3>AST 树形表</h3><span>${isLab5 ? '语义动作构造的抽象语法树' : '中间代码生成的输入结构'}</span></div><div class="graph-actions"><button data-copy-ast>复制文本树</button><button data-copy-mermaid>复制 Mermaid</button></div></div><div class="table-wrap lab56-scroll"><table class="slr1-table"><thead><tr><th>#</th><th>节点</th><th>类型</th></tr></thead><tbody>${treeRows}</tbody></table></div></div>
    <div class="section-card"><div class="section-head"><h3>AST 文本树</h3><span>可直接放入实验报告</span></div><pre class="lab56-pre">${escapeHtml(astToText(result.ast).trim())}</pre></div>
  </div>`
}

function renderSymbols(result) {
  const rows = result.symbols.map((symbol) => `<tr><td>${escapeHtml(symbol.name)}</td><td>${escapeHtml(symbol.kind)}</td><td>${escapeHtml(symbol.type)}</td><td>${symbol.scope}</td><td>${symbol.level}</td><td>${escapeHtml(symbol.address)}</td><td>${escapeHtml(symbol.extra)}</td></tr>`).join('')
  const scopes = result.scopes.map((scope) => `<div class="set-card"><strong>Scope ${scope.id}</strong><code>${escapeHtml(scope.name)} | level=${scope.level} | parent=${scope.parent ?? '-'}</code></div>`).join('')
  return `<div class="lr0-panel-space"><div class="section-card"><div class="section-head"><h3>符号表</h3><span>变量名、类型、作用域和地址</span></div><div class="table-wrap lab56-scroll"><table class="slr1-table"><thead><tr><th>名称</th><th>种类</th><th>类型</th><th>作用域</th><th>层级</th><th>地址</th><th>附加信息</th></tr></thead><tbody>${rows || '<tr><td colspan="7">空</td></tr>'}</tbody></table></div></div><div class="section-card"><div class="section-head"><h3>作用域记录</h3><span>支持函数和块作用域</span></div><div class="set-grid">${scopes}</div></div></div>`
}

function renderErrors(result, isLab5) {
  if (!result.errors.length) return '<div class="section-card"><div class="ok-text">未发现词法、语法或语义错误。</div></div>'
  const rows = result.errors.map((error, index) => `<tr><td>${index + 1}</td><td><span class="conflict-pill rr">${escapeHtml(error.kind)}</span></td><td>${error.line || '-'}</td><td>${escapeHtml(error.lexeme)}</td><td>${escapeHtml(error.message)}</td></tr>`).join('')
  return `<div class="section-card"><div class="section-head"><h3>错误报告</h3><span>${isLab5 ? '实验五必做输出之一' : '中间代码生成前的语义验证结果'}</span></div><div class="table-wrap lab56-scroll"><table class="slr1-table"><thead><tr><th>#</th><th>类别</th><th>行号</th><th>附近词素</th><th>说明</th></tr></thead><tbody>${rows}</tbody></table></div></div>`
}

function renderQuads(result) {
  const rows = result.quads.map((quad) => `<tr><td>${quad.index}</td><td><code>${escapeHtml(quad.op)}</code></td><td>${escapeHtml(quad.arg1)}</td><td>${escapeHtml(quad.arg2)}</td><td>${escapeHtml(quad.result)}</td></tr>`).join('')
  return `<div class="section-card"><div class="section-head"><div><h3>实验六中间代码：四元式</h3><span>(op, arg1, arg2, result)</span></div><div class="graph-actions"><button data-copy-quads>复制四元式</button></div></div><div class="table-wrap lab56-scroll"><table class="slr1-table"><thead><tr><th>#</th><th>op</th><th>arg1</th><th>arg2</th><th>result</th></tr></thead><tbody>${rows || '<tr><td colspan="5">空</td></tr>'}</tbody></table></div></div>`
}

function renderTrace(result, isLab5) {
  const rows = result.steps.map((step, index) => `<tr><td>${index}</td><td>${escapeHtml(step.action)}</td><td>${escapeHtml(step.token)}</td></tr>`).join('')
  return `<div class="section-card"><div class="section-head"><h3>${isLab5 ? '语义分析过程' : '翻译前分析过程'}</h3><span>展示 token 移进/接受过程，语义动作结果体现在 AST、符号表和四元式中。</span></div><div class="table-wrap lab56-scroll"><table class="slr1-table"><thead><tr><th>#</th><th>动作</th><th>Token</th></tr></thead><tbody>${rows}</tbody></table></div></div>`
}

function renderTokens(result) {
  const rows = result.tokens.map((token, index) => `<tr><td>${index}</td><td><span class="badge">${escapeHtml(token.type)}</span></td><td>${escapeHtml(token.lexeme)}</td><td>${token.line || '-'}</td></tr>`).join('')
  return `<div class="section-card"><div class="section-head"><h3>Token 流</h3><span>来自实验二词法分析输出</span></div><div class="table-wrap lab56-scroll"><table class="slr1-table"><thead><tr><th>#</th><th>类型</th><th>词素</th><th>行号</th></tr></thead><tbody>${rows}</tbody></table></div></div>`
}

function bindOutput(root, result) {
  root.querySelectorAll('.lab56-switch button').forEach((button) => {
    button.addEventListener('click', () => {
      const panel = button.dataset.tab
      root.querySelectorAll('.lab56-switch button').forEach((item) => item.classList.remove('active'))
      button.classList.add('active')
      root.querySelectorAll('[data-panel]').forEach((item) => { item.hidden = item.dataset.panel !== panel })
    })
  })
  root.querySelector('[data-copy-ast]')?.addEventListener('click', () => navigator.clipboard?.writeText(astToText(result.ast).trim()))
  root.querySelector('[data-copy-mermaid]')?.addEventListener('click', () => navigator.clipboard?.writeText(astToMermaid(result.ast)))
  root.querySelector('[data-copy-quads]')?.addEventListener('click', () => navigator.clipboard?.writeText(result.quads.map((q) => `(${q.op}, ${q.arg1}, ${q.arg2}, ${q.result})`).join('\n')))
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
