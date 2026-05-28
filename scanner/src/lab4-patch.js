import { SAMPLE_GRAMMAR, SAMPLE_TOKENS, buildSLR1, makeSLR1Dot, makeSLR1Report } from './slr1.js'

const samples = [
  ['expression', '表达式文法（SLR(1)）', SAMPLE_GRAMMAR, SAMPLE_TOKENS],
  ['assign', '赋值语句文法', 'S -> id = E\nE -> E + T | T\nT -> T * F | F\nF -> ( E ) | id', 'id = id + id * id'],
  ['conflict', 'SLR(1) 冲突示例', 'S -> A | B\nA -> a\nB -> a', 'a'],
  ['epsilon', '含 ε 的简单文法', 'S -> A b\nA -> a | epsilon', 'a b'],
]

export function installSLR1Lab() {
  queueMicrotask(() => {
    const sidebar = document.querySelector('.sidebar')
    const app = document.querySelector('#app')
    if (!sidebar || !app || document.querySelector('[data-lab4-slr1]')) return

    const button = document.createElement('button')
    button.className = 'tool-item'
    button.dataset.lab4Slr1 = 'true'
    button.innerHTML = '<span>1</span><div><strong>SLR(1) 分析表生成器</strong><small>生成 ACTION/GOTO 表并可视化分析过程</small></div>'
    sidebar.appendChild(button)

    const setActive = () => {
      document.querySelectorAll('.tool-item').forEach((item) => item.classList.remove('active'))
      button.classList.add('active')
    }
    button.addEventListener('click', () => { setActive(); renderSLR1() })
  })
}

function renderSLR1() {
  const main = document.querySelector('.main')
  const title = document.querySelector('.brand strong')
  const status = document.querySelector('.status span:last-child')
  if (!main) return
  if (title) title.textContent = 'SLR(1) 分析表生成器'
  main.className = 'main lr0-main slr1-main'
  main.innerHTML = `
    <section class="lr0-page">
      <div class="tabs"><div class="tab wide-tab"><span class="tab-dot"></span>grammar.slr1<span style="margin-left:auto;color:var(--muted)">×</span></div></div>
      <div class="toolbar lr0-toolbar">
        <button class="primary" data-run>▶ 生成 SLR(1) 表</button>
        <select data-sample>${samples.map(([id, name]) => `<option value="${id}">${name}</option>`).join('')}</select>
        <button data-load>载入示例</button>
        <button data-report>导出报告</button>
        <button data-clear>清空</button>
      </div>
      <div class="lr0-workspace slr1-workspace">
        <div class="slr1-input-stack">
          <section class="grammar-card"><div class="panel-title"><span>文法输入</span><span>支持 |、ε/epsilon，自动增广文法</span></div><textarea data-grammar class="grammar-input" spellcheck="false"></textarea></section>
          <section class="grammar-card token-card"><div class="panel-title"><span>Token 输入</span><span>示例：id + id * id</span></div><textarea data-tokens class="token-input" spellcheck="false"></textarea></section>
        </div>
        <section class="lr0-result" data-output></section>
      </div>
    </section>`

  const grammar = main.querySelector('[data-grammar]')
  const tokens = main.querySelector('[data-tokens]')
  const select = main.querySelector('[data-sample]')
  const output = main.querySelector('[data-output]')

  const load = (id = 'expression') => {
    const sample = samples.find((item) => item[0] === id) || samples[0]
    grammar.value = sample[2]
    tokens.value = sample[3]
  }
  const run = () => {
    const result = buildSLR1(grammar.value, tokens.value)
    output.innerHTML = renderResult(result, tokens.value)
    output.querySelector('[data-tab-table]')?.addEventListener('click', () => activatePanel(output, 'table'))
    output.querySelector('[data-tab-trace]')?.addEventListener('click', () => activatePanel(output, 'trace'))
    output.querySelector('[data-tab-sets]')?.addEventListener('click', () => activatePanel(output, 'sets'))
    output.querySelector('[data-csv]')?.addEventListener('click', () => downloadCSV(result))
    output.querySelector('[data-dot]')?.addEventListener('click', () => downloadFile(makeSLR1Dot(result), 'slr1_graph.dot', 'text/vnd.graphviz;charset=utf-8'))
    output.querySelector('[data-md]')?.addEventListener('click', () => downloadFile(makeSLR1Report(result, grammar.value, tokens.value, 'zh'), 'slr1_分析报告.md', 'text/markdown;charset=utf-8'))
    if (status) status.textContent = result.errors.length ? 'SLR(1) 文法输入存在错误' : `已生成 SLR(1) 表：${result.lr0.states.length} 个状态，${result.conflicts.length} 个冲突`
  }

  select.addEventListener('change', () => { load(select.value); run() })
  main.querySelector('[data-run]').addEventListener('click', run)
  main.querySelector('[data-load]').addEventListener('click', () => { select.value = 'expression'; load(); run() })
  main.querySelector('[data-clear]').addEventListener('click', () => { grammar.value = ''; tokens.value = ''; output.innerHTML = ''; if (status) status.textContent = '已清空 SLR(1) 输入' })
  main.querySelector('[data-report]').addEventListener('click', () => downloadFile(makeSLR1Report(buildSLR1(grammar.value, tokens.value), grammar.value, tokens.value, 'zh'), 'slr1_分析报告.md', 'text/markdown;charset=utf-8'))
  load(); run()
}

function renderResult(result, tokens) {
  if (result.errors.length) return `<div class="error-box"><strong>输入错误</strong>${result.errors.map((e) => `<p>${escapeHtml(e)}</p>`).join('')}</div>`
  return `
    <div class="summary-grid slr1-summary">
      <div class="summary-card"><span>产生式数量</span><strong>${result.lr0.productions.length}</strong></div>
      <div class="summary-card"><span>状态数量</span><strong>${result.lr0.states.length}</strong></div>
      <div class="summary-card ${result.isSLR1 ? 'ok' : 'warn'}"><span>SLR(1) 检测</span><strong>${result.isSLR1 ? '通过' : '存在冲突'}</strong></div>
      <div class="summary-card ${result.parseAccepted ? 'ok' : 'warn'}"><span>语法分析结果</span><strong>${result.parseAccepted ? 'ACCEPT' : 'ERROR'}</strong></div>
    </div>
    <div class="view-switch slr1-switch"><button class="active" data-tab-table>ACTION / GOTO 表</button><button data-tab-trace>分析过程</button><button data-tab-sets>FIRST / FOLLOW</button></div>
    <div data-panel="table" class="slr1-panel">${renderTable(result)}</div>
    <div data-panel="trace" class="slr1-panel" hidden>${renderTrace(result, tokens)}</div>
    <div data-panel="sets" class="slr1-panel" hidden>${renderSets(result)}</div>`
}

function renderTable(result) {
  const header = ['<th>state</th>', ...result.actionColumns.map((s) => `<th>ACTION[${escapeHtml(s)}]</th>`), ...result.gotoColumns.map((s) => `<th>GOTO[${escapeHtml(s)}]</th>`)].join('')
  const rows = result.tableRows.map((row) => `<tr><td>I${row.state}</td>${result.actionColumns.map((s) => `<td class="${cellClass(row.actions[s])}">${escapeHtml(row.actions[s])}</td>`).join('')}${result.gotoColumns.map((s) => `<td>${escapeHtml(row.gotos[s])}</td>`).join('')}</tr>`).join('')
  const conflicts = result.conflicts.length
    ? `<div class="conflict-list slr1-conflicts">${result.conflicts.map((c) => `<div class="conflict-row mini-conflict-row"><strong>I${c.stateId} / ${escapeHtml(c.symbol)}</strong><span class="conflict-pill sr">${escapeHtml(c.type)}</span><code>${escapeHtml(c.actions.join(' / '))}</code></div>`).join('')}</div>`
    : '<div class="ok-text">未发现 SLR(1) 冲突，该文法可按当前表分析。</div>'
  return `<div class="section-card slr1-table-card"><div class="section-head"><div><h3>SLR(1) ACTION / GOTO 分析表</h3><span>s 表示移进，r 表示规约，acc 表示接受</span></div><div class="graph-actions"><button data-csv>下载 CSV</button><button data-dot>下载 DOT</button><button data-md>导出报告</button></div></div>${conflicts}<div class="table-wrap slr1-table-wrap"><table class="slr1-table"><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table></div></div>`
}

function renderTrace(result, tokens) {
  const rows = result.parseTrace.steps.map((s) => `<tr class="${s.conflict ? 'conflict-row-bg' : ''}"><td>${s.step}</td><td>${escapeHtml(s.stateStack)}</td><td>${escapeHtml(s.symbolStack)}</td><td>${escapeHtml(s.input)}</td><td class="${cellClass(s.action)}">${escapeHtml(s.action)}</td><td>${escapeHtml(s.note)}</td></tr>`).join('')
  const pill = result.parseAccepted ? '<span class="parse-result-pill ok">分析成功：ACCEPT</span>' : `<span class="parse-result-pill warn">${escapeHtml(result.parseError || '分析未通过')}</span>`
  return `<div class="section-card slr1-table-card"><div class="section-head"><div><h3>SLR(1) 分析过程</h3><span>${escapeHtml(tokens.trim())} $</span></div>${pill}</div><div class="table-wrap slr1-table-wrap"><table class="slr1-table trace-table"><thead><tr><th>#</th><th>状态栈</th><th>符号栈</th><th>剩余输入</th><th>动作</th><th>说明</th></tr></thead><tbody>${rows}</tbody></table></div></div>`
}

function renderSets(result) {
  const first = result.firstSets.map((s) => `<div class="set-card"><strong>FIRST(${escapeHtml(s.symbol)})</strong><code>{ ${escapeHtml(s.values.join(', '))} }</code></div>`).join('')
  const follow = result.followSets.map((s) => `<div class="set-card follow"><strong>FOLLOW(${escapeHtml(s.symbol)})</strong><code>{ ${escapeHtml(s.values.join(', '))} }</code></div>`).join('')
  const productions = result.lr0.productions.map((p) => `<div class="production-row"><span>(${p.index})</span><code>${escapeHtml(p.text)}</code></div>`).join('')
  return `<div class="lr0-panel-space"><div class="section-card"><div class="section-head"><h3>FIRST / FOLLOW</h3><span>SLR(1) 使用 FOLLOW 集限制规约动作填表位置。</span></div><div class="set-grid">${first}${follow}</div></div><div class="section-card"><div class="section-head"><h3>产生式编号</h3><span>表中的 rN 表示按第 N 条产生式规约。</span></div><div class="production-list">${productions}</div></div></div>`
}

function activatePanel(root, panel) {
  root.querySelectorAll('.view-switch button').forEach((b) => b.classList.remove('active'))
  root.querySelector(`[data-tab-${panel}]`)?.classList.add('active')
  root.querySelectorAll('[data-panel]').forEach((item) => { item.hidden = item.dataset.panel !== panel })
}
function cellClass(value) {
  const text = String(value || '')
  if (text.includes('/')) return 'action-conflict'
  if (/^s\d+/.test(text)) return 'action-shift'
  if (/^r\d+/.test(text)) return 'action-reduce'
  if (text === 'acc') return 'action-accept'
  return ''
}
function downloadCSV(result) {
  const header = ['state', ...result.actionColumns.map((s) => `ACTION[${s}]`), ...result.gotoColumns.map((s) => `GOTO[${s}]`)]
  const rows = result.tableRows.map((r) => [r.state, ...result.actionColumns.map((s) => r.actions[s] || ''), ...result.gotoColumns.map((s) => r.gotos[s] ?? '')])
  downloadFile([header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n'), 'slr1_action_goto.csv', 'text/csv;charset=utf-8')
}
function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
}
function csvEscape(v) { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
function escapeHtml(v) { return String(v ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])) }
