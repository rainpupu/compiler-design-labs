import { analyzeSource, astToText, makeTable } from '../scripts/lab-terminal-core.mjs'
import { allocateMemory, generateTargetCode, memoryStats } from '../scripts/backend-core.mjs'
import { getSharedSource, getSharedSourceName, onSharedSourceChange, setSharedSource } from './shared-source.js'

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]))

function table(headers, rows, empty = '空') {
  if (!rows.length) return `<div class="pipeline-empty">${empty}</div>`
  return `<div class="table-wrap lab56-scroll"><table class="slr1-table"><thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
}
function flattenAst(node, depth = 0, rows = []) {
  if (!node) return rows
  rows.push({ id: node.id, depth, kind: node.kind, label: node.label, type: node.type })
  ;(node.children || []).forEach((child) => flattenAst(child, depth + 1, rows))
  return rows
}
function analyze(source) {
  const semantic = analyzeSource(source)
  const memory = allocateMemory(semantic)
  const target = generateTargetCode(semantic, memory)
  return { ...semantic, memory, target }
}

export function installLab56() {
  queueMicrotask(() => {
    const sidebar = document.querySelector('.sidebar')
    const app = document.querySelector('#app')
    if (!sidebar || !app || document.querySelector('[data-lab5-visual]')) return
    const labs = [
      ['5', '实验五：语义分析', 'AST、符号表、语义错误报告'],
      ['6', '实验六：中间代码', '四元式生成'],
      ['7', '实验七：内存分配', '数据段、临时区、常量池、代码段'],
      ['8', '实验八：目标代码', '由四元式生成类汇编代码'],
    ]
    labs.forEach(([stage, title, desc]) => {
      const button = document.createElement('button')
      button.className = 'tool-item'
      button.dataset[`lab${stage}Visual`] = 'true'
      button.innerHTML = `<span>${stage}</span><div><strong>${title}</strong><small>${desc}</small></div>`
      sidebar.appendChild(button)
      button.addEventListener('click', () => {
        document.querySelectorAll('.tool-item').forEach((item) => item.classList.remove('active'))
        button.classList.add('active')
        renderLabPage(stage)
      })
    })
  })
}

function renderLabPage(stage) {
  const main = document.querySelector('.main')
  const title = document.querySelector('.brand strong')
  const status = document.querySelector('.status span:last-child')
  if (!main) return
  const titles = { '5': '实验五：语义分析', '6': '实验六：中间代码生成', '7': '实验七：内存地址分配', '8': '实验八：目标代码生成' }
  if (title) title.textContent = titles[stage]
  main.className = `main lr0-main lab56-main lab${stage}-visual-main`
  main.innerHTML = `
    <section class="lab56-page">
      <div class="tabs"><div class="tab wide-tab"><span class="tab-dot"></span>${escapeHtml(getSharedSourceName())}<span style="margin-left:auto;color:var(--muted)">共享样本</span></div></div>
      <div class="toolbar lr0-toolbar lab56-toolbar">
        <button class="primary" data-run>▶ 运行${titles[stage]}</button>
        <button data-use-shared>使用当前共享样本</button>
        <button data-save-shared>把当前输入设为共享样本</button>
        <button data-json>导出 JSON</button>
        <button data-report>导出文本报告</button>
      </div>
      <div class="lab56-workspace">
        <section class="grammar-card lab56-source-card">
          <div class="panel-title"><span>共享源程序输入</span><span>实验一/二页面选择样本后会自动同步到这里</span></div>
          <textarea data-source class="grammar-input lab56-source" spellcheck="false"></textarea>
          <div class="input-hint">当前页面只展示实验 ${stage} 的单项结果；源程序和其它实验页面共享。</div>
        </section>
        <section class="lr0-result lab56-output" data-output></section>
      </div>
    </section>`

  const sourceBox = main.querySelector('[data-source]')
  const output = main.querySelector('[data-output]')
  sourceBox.value = getSharedSource()
  let latest = null
  const run = () => {
    latest = analyze(sourceBox.value)
    output.innerHTML = renderStage(latest, stage)
    bindOutput(output, latest)
    if (status) status.textContent = `${titles[stage]}完成：错误 ${latest.errors.length}，四元式 ${latest.quads.length}，目标指令 ${latest.target.length}`
  }
  main.querySelector('[data-run]').addEventListener('click', run)
  main.querySelector('[data-use-shared]').addEventListener('click', () => { sourceBox.value = getSharedSource(); run() })
  main.querySelector('[data-save-shared]').addEventListener('click', () => { setSharedSource(sourceBox.value, `lab${stage}-current.src`); if (status) status.textContent = '已更新共享样本' })
  main.querySelector('[data-json]').addEventListener('click', () => downloadFile(JSON.stringify(latest || analyze(sourceBox.value), null, 2), `lab${stage}-output.json`, 'application/json;charset=utf-8'))
  main.querySelector('[data-report]').addEventListener('click', () => downloadFile(makeReport(latest || analyze(sourceBox.value), stage), `lab${stage}-report.txt`, 'text/plain;charset=utf-8'))
  const unsubscribe = onSharedSourceChange(({ source }) => {
    if (!document.body.contains(main)) { unsubscribe(); return }
    sourceBox.value = source
    run()
  })
  run()
}

function renderStage(result, stage) {
  const summary = `<div class="summary-grid compact-summary lab56-summary">
    <div class="summary-card"><span>Token</span><strong>${result.tokens.length}</strong></div>
    <div class="summary-card"><span>AST 节点</span><strong>${result.stats.astNodes}</strong></div>
    <div class="summary-card"><span>符号</span><strong>${result.symbols.length}</strong></div>
    <div class="summary-card ${result.errors.length ? 'warn' : 'ok'}"><span>错误</span><strong>${result.errors.length}</strong></div>
    <div class="summary-card"><span>四元式</span><strong>${result.quads.length}</strong></div>
    <div class="summary-card"><span>目标指令</span><strong>${result.target.length}</strong></div>
  </div>`
  if (stage === '5') return summary + renderLab5(result)
  if (stage === '6') return summary + renderLab6(result)
  if (stage === '7') return summary + renderLab7(result)
  return summary + renderLab8(result)
}
function renderLab5(result) {
  const astRows = flattenAst(result.ast).map((row) => [row.id, `${'  '.repeat(row.depth)}${row.kind}(${row.label})`, row.type || ''])
  return `<div class="view-switch lab56-switch"><button class="active" data-tab="ast">AST</button><button data-tab="symbols">符号表</button><button data-tab="errors">错误报告</button><button data-tab="tokens">Token</button></div>
    <div data-panel="ast" class="lab56-panel"><div class="lab56-grid-two"><div class="section-card"><div class="section-head"><h3>AST 树形表</h3><button data-copy-ast>复制 AST</button></div>${table(['#', '节点', '类型'], astRows)}</div><div class="section-card"><div class="section-head"><h3>AST 文本树</h3></div><pre class="lab56-pre">${escapeHtml(astToText(result.ast).trim())}</pre></div></div></div>
    <div data-panel="symbols" class="lab56-panel" hidden>${renderSymbols(result)}</div>
    <div data-panel="errors" class="lab56-panel" hidden>${renderErrors(result)}</div>
    <div data-panel="tokens" class="lab56-panel" hidden>${renderTokens(result)}</div>`
}
function renderLab6(result) {
  return `<div class="section-card"><div class="section-head"><h3>四元式中间代码</h3><span>(op, arg1, arg2, result)</span><button data-copy-quads>复制四元式</button></div>${table(['#', 'op', 'arg1', 'arg2', 'result'], result.quads.map((q) => [q.index, q.op, q.arg1, q.arg2, q.result]))}</div>`
}
function renderLab7(result) {
  const m = result.memory
  const stats = memoryStats(m)
  return `<div class="section-card"><div class="section-head"><h3>内存映像</h3><span>DATA=${m.bases.data} CODE=${m.bases.code} TEMP=${m.bases.temp} CONST=${m.bases.const}</span></div><div class="input-hint">分配统计：数据对象 ${stats.dataCount}，临时变量 ${stats.tempCount}，常量 ${stats.constCount}，代码指令 ${stats.codeCount}，标签 ${stats.labelCount}</div><h4>数据段 DATA</h4>${table(['name', 'kind', 'type', 'scope', 'size', 'address'], m.symbols.map((s) => [s.name, s.kind, s.type, s.scope, s.size, s.address]))}<h4>临时区 TEMP</h4>${table(['name', 'size', 'address'], m.temporaries.map((t) => [t.name, t.size, t.address]))}<h4>常量池 CONST</h4>${table(['literal', 'size', 'address'], m.constants.map((c) => [c.literal, c.size, c.address]))}<h4>代码段 CODE</h4>${table(['quad#', 'op', 'address'], m.code.map((c) => [c.index, c.op, c.address]))}<h4>标签地址</h4>${table(['label', 'address'], m.labels.map((l) => [l.label, l.address]))}</div>`
}
function renderLab8(result) {
  return `<div class="section-card"><div class="section-head"><h3>目标代码 / 类汇编代码</h3><button data-copy-target>复制目标代码</button></div><pre class="lab56-pre">${escapeHtml(result.target.join('\n') || '空')}</pre></div>`
}
function renderSymbols(result) { return `<div class="section-card"><div class="section-head"><h3>符号表</h3></div>${table(['name', 'kind', 'type', 'scope', 'level', 'address', 'extra'], result.symbols.map((s) => [s.name, s.kind, s.type, s.scope, s.level, s.address, s.extra || '']))}</div>` }
function renderErrors(result) { return result.errors.length ? `<div class="section-card"><div class="section-head"><h3>错误报告</h3></div>${table(['#', '类别', '行号', '词素', '说明'], result.errors.map((e, i) => [i + 1, e.kind, e.line || '-', e.lexeme, e.message]))}</div>` : '<div class="section-card"><div class="ok-text">未发现词法、语法或语义错误。</div></div>' }
function renderTokens(result) { return `<div class="section-card"><div class="section-head"><h3>Token 流</h3></div>${table(['#', '类型', '词素', '行号'], result.tokens.map((t, i) => [i, t.type, t.lexeme, t.line || '-']))}</div>` }
function bindOutput(root, result) {
  root.querySelectorAll('.lab56-switch button').forEach((button) => button.addEventListener('click', () => { const panel = button.dataset.tab; root.querySelectorAll('.lab56-switch button').forEach((item) => item.classList.remove('active')); button.classList.add('active'); root.querySelectorAll('[data-panel]').forEach((item) => { item.hidden = item.dataset.panel !== panel }) }))
  root.querySelector('[data-copy-ast]')?.addEventListener('click', () => navigator.clipboard?.writeText(astToText(result.ast).trim()))
  root.querySelector('[data-copy-quads]')?.addEventListener('click', () => navigator.clipboard?.writeText(result.quads.map((q) => `(${q.op}, ${q.arg1}, ${q.arg2}, ${q.result})`).join('\n')))
  root.querySelector('[data-copy-target]')?.addEventListener('click', () => navigator.clipboard?.writeText(result.target.join('\n')))
}
function makeReport(result, stage) {
  if (stage === '5') return ['实验五：语义分析', astToText(result.ast), makeTable(['name', 'kind', 'type', 'scope'], result.symbols.map((s) => [s.name, s.kind, s.type, s.scope])), result.errors.map((e) => `[${e.kind}] ${e.message}`).join('\n') || '无错误'].join('\n\n')
  if (stage === '6') return makeTable(['#', 'op', 'arg1', 'arg2', 'result'], result.quads.map((q) => [q.index, q.op, q.arg1, q.arg2, q.result]))
  if (stage === '7') return makeTable(['name', 'kind', 'type', 'scope', 'size', 'address'], result.memory.symbols.map((s) => [s.name, s.kind, s.type, s.scope, s.size, s.address]))
  return result.target.join('\n')
}
function downloadFile(content, filename, type) { const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url) }
