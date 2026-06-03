import { analyzeSource, astToText, makeTable, scanSource } from '../scripts/lab-terminal-core.mjs'
import { DEFAULT_ACCEPTANCE_GRAMMAR, buildLR0, buildSLR1 } from '../scripts/lr-slr-core.mjs'
import { allocateMemory, generateTargetCode, memoryStats } from '../scripts/backend-core.mjs'

const SAMPLE_SET = [
  {
    name: '基础正确样例：float 返回值',
    source: `float main() {
    float x;
    x = 3.14;
    return x
};
main()`,
  },
  {
    name: '字符串输出样例：print("Yes")',
    source: `int main() {
    if (1 < 2) {
        print("Yes");
    }
};
main()`,
  },
  {
    name: '字符变量样例：char c',
    source: `int main() {
    char c;
    c = 'A';
    print(c);
    return 0
};
main()`,
  },
  {
    name: '语义错误样例：未声明变量',
    source: `void test() {
    print a
};
test()`,
  },
  {
    name: '函数调用样例：add',
    source: `int add(int a; int b;) {
    return a + b
};

int main() {
    int x;
    x = add(3, 4,);
    print(x);
    return x
};
main()`,
  },
]

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]))
}
function normalizeForSlr(tokens) {
  const result = []
  for (const token of tokens) {
    if (token.type === 'ERROR') continue
    if (token.type === 'DOT' || token.type === 'COL' || token.type === 'AAA') continue
    if (token.type === 'CHAR') { result.push('INT'); continue }
    if (token.type === 'STR' || token.type === 'CHR') { result.push('NUM'); continue }
    result.push(token.type)
  }
  return result
}
function tableHtml(headers, rows, empty = '空') {
  if (!rows.length) return `<div class="pipeline-empty">${empty}</div>`
  return `<div class="table-wrap pipeline-scroll"><table class="slr1-table"><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
}
function analyzePipeline(source) {
  const tokens = scanSource(source)
  const tokenTypes = normalizeForSlr(tokens)
  const lr0 = buildLR0(DEFAULT_ACCEPTANCE_GRAMMAR)
  const slr = buildSLR1(DEFAULT_ACCEPTANCE_GRAMMAR, tokenTypes)
  const semantic = analyzeSource(source)
  const memory = allocateMemory(semantic)
  const target = generateTargetCode(semantic, memory)
  const reasons = []
  if (!slr.parseAccepted) reasons.push(`SLR(1) 语法分析未接受：${slr.parseError || '未知原因'}`)
  semantic.errors.forEach((e) => reasons.push(`[${e.kind}] line ${e.line || '-'} ${e.lexeme ? `near "${e.lexeme}" ` : ''}${e.message}`))
  return { tokens, tokenTypes, lr0, slr, semantic, memory, target, verdict: { ok: reasons.length === 0, reasons } }
}

export function installPipelineLab() {
  queueMicrotask(() => {
    const sidebar = document.querySelector('.sidebar')
    const app = document.querySelector('#app')
    if (!sidebar || !app || document.querySelector('[data-pipeline-lab]')) return
    const button = document.createElement('button')
    button.className = 'tool-item'
    button.dataset.pipelineLab = 'true'
    button.innerHTML = '<span>∞</span><div><strong>完整流水线：实验一到八</strong><small>样例选择、单项分析、自动串联</small></div>'
    sidebar.appendChild(button)
    button.addEventListener('click', () => {
      document.querySelectorAll('.tool-item').forEach((item) => item.classList.remove('active'))
      button.classList.add('active')
      renderPipelinePage()
    })
  })
}

function renderPipelinePage() {
  const main = document.querySelector('.main')
  const title = document.querySelector('.brand strong')
  const status = document.querySelector('.status span:last-child')
  if (!main) return
  if (title) title.textContent = '完整编译流水线：实验一到八'
  main.className = 'main lr0-main pipeline-main'
  main.innerHTML = `
    <section class="pipeline-page">
      <div class="tabs"><div class="tab wide-tab"><span class="tab-dot"></span>compiler-pipeline.src<span style="margin-left:auto;color:var(--muted)">×</span></div></div>
      <div class="toolbar lr0-toolbar pipeline-toolbar">
        <button class="primary" data-run-all>▶ 自动运行完整流水线</button>
        <button data-run-current>运行当前单项</button>
        <select data-sample>${SAMPLE_SET.map((sample, index) => `<option value="${index}">${esc(sample.name)}</option>`).join('')}</select>
        <button data-load-sample>载入样例</button>
        <label class="pipeline-file-btn">上传本地样例<input data-file type="file" accept=".src,.txt,.cmm,.c,.cpp" multiple hidden></label>
        <button data-json>导出 JSON</button>
        <button data-report>导出报告</button>
      </div>
      <div class="pipeline-workspace">
        <section class="grammar-card pipeline-source-card">
          <div class="panel-title"><span>源程序 / 样例输入</span><span>可粘贴 example/*.src，或上传本地文件</span></div>
          <textarea data-source class="grammar-input pipeline-source" spellcheck="false"></textarea>
          <div class="pipeline-upload-list" data-upload-list></div>
        </section>
        <section class="lr0-result pipeline-output">
          <div class="pipeline-stage-tabs" data-stage-tabs></div>
          <div data-output></div>
        </section>
      </div>
    </section>`

  const sourceBox = main.querySelector('[data-source]')
  const sampleSelect = main.querySelector('[data-sample]')
  const output = main.querySelector('[data-output]')
  const stageTabs = main.querySelector('[data-stage-tabs]')
  const uploadList = main.querySelector('[data-upload-list]')
  let currentStage = 'all'
  let currentResult = null
  let uploaded = []

  sourceBox.value = SAMPLE_SET[0].source
  const run = (stage = currentStage) => {
    currentStage = stage
    currentResult = analyzePipeline(sourceBox.value)
    stageTabs.innerHTML = renderStageTabs(currentStage)
    output.innerHTML = renderStage(currentResult, currentStage)
    bindStageTabs(stageTabs, run)
    bindOutputActions(output, currentResult)
    if (status) status.textContent = `流水线完成：Token ${currentResult.tokens.length}，错误 ${currentResult.verdict.reasons.length}，四元式 ${currentResult.semantic.quads.length}，目标指令 ${currentResult.target.length}`
  }

  main.querySelector('[data-run-all]').addEventListener('click', () => run('all'))
  main.querySelector('[data-run-current]').addEventListener('click', () => run(currentStage))
  main.querySelector('[data-load-sample]').addEventListener('click', () => { sourceBox.value = SAMPLE_SET[Number(sampleSelect.value)].source; run('all') })
  main.querySelector('[data-json]').addEventListener('click', () => {
    const result = currentResult || analyzePipeline(sourceBox.value)
    downloadFile(JSON.stringify(result, null, 2), 'compiler-pipeline-output.json', 'application/json;charset=utf-8')
  })
  main.querySelector('[data-report]').addEventListener('click', () => {
    const result = currentResult || analyzePipeline(sourceBox.value)
    downloadFile(makeReport(result), 'compiler-pipeline-report.txt', 'text/plain;charset=utf-8')
  })
  main.querySelector('[data-file]').addEventListener('change', async (event) => {
    uploaded = []
    for (const file of event.target.files || []) uploaded.push({ name: file.name, source: await file.text() })
    uploadList.innerHTML = uploaded.map((file, index) => `<button data-upload-index="${index}">${esc(file.name)}</button>`).join('')
    uploadList.querySelectorAll('[data-upload-index]').forEach((button) => button.addEventListener('click', () => { sourceBox.value = uploaded[Number(button.dataset.uploadIndex)].source; run('all') }))
    if (uploaded[0]) { sourceBox.value = uploaded[0].source; run('all') }
  })
  run('all')
}

function renderStageTabs(active) {
  const stages = [
    ['all', '总览'], ['lab1', '实验一'], ['lab2', '实验二'], ['lab3', '实验三'], ['lab4', '实验四'], ['lab5', '实验五'], ['lab6', '实验六'], ['lab7', '实验七'], ['lab8', '实验八'],
  ]
  return stages.map(([key, label]) => `<button class="${active === key ? 'active' : ''}" data-stage="${key}">${label}</button>`).join('')
}
function bindStageTabs(root, run) {
  root.querySelectorAll('[data-stage]').forEach((button) => button.addEventListener('click', () => run(button.dataset.stage)))
}
function bindOutputActions(root, result) {
  root.querySelector('[data-copy-target]')?.addEventListener('click', () => navigator.clipboard?.writeText(result.target.join('\n')))
  root.querySelector('[data-copy-ast]')?.addEventListener('click', () => navigator.clipboard?.writeText(astToText(result.semantic.ast).trim()))
  root.querySelector('[data-copy-quads]')?.addEventListener('click', () => navigator.clipboard?.writeText(result.semantic.quads.map((q) => `(${q.op}, ${q.arg1}, ${q.arg2}, ${q.result})`).join('\n')))
}
function renderStage(result, stage) {
  if (stage === 'all') return renderOverview(result)
  if (stage === 'lab1') return renderLab1(result)
  if (stage === 'lab2') return renderLab2(result)
  if (stage === 'lab3') return renderLab3(result)
  if (stage === 'lab4') return renderLab4(result)
  if (stage === 'lab5') return renderLab5(result)
  if (stage === 'lab6') return renderLab6(result)
  if (stage === 'lab7') return renderLab7(result)
  if (stage === 'lab8') return renderLab8(result)
  return ''
}
function renderOverview(result) {
  const stats = memoryStats(result.memory)
  return `
    <div class="summary-grid compact-summary pipeline-summary">
      <div class="summary-card ${result.verdict.ok ? 'ok' : 'warn'}"><span>最终判断</span><strong>${result.verdict.ok ? 'OK' : 'ERR'}</strong></div>
      <div class="summary-card"><span>Token</span><strong>${result.tokens.length}</strong></div>
      <div class="summary-card"><span>AST 节点</span><strong>${result.semantic.stats.astNodes}</strong></div>
      <div class="summary-card"><span>符号</span><strong>${result.semantic.symbols.length}</strong></div>
      <div class="summary-card"><span>四元式</span><strong>${result.semantic.quads.length}</strong></div>
      <div class="summary-card"><span>目标指令</span><strong>${result.target.length}</strong></div>
    </div>
    <div class="pipeline-grid">
      <div class="section-card"><div class="section-head"><h3>错误原因</h3><span>综合词法、SLR 摘要、语义错误</span></div>${result.verdict.reasons.length ? `<ol>${result.verdict.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ol>` : '<div class="ok-text">无错误</div>'}</div>
      <div class="section-card"><div class="section-head"><h3>阶段状态</h3><span>实验一到八</span></div>${tableHtml(['阶段', '核心输出', '状态'], [
        ['实验一', 'DFA/源程序预检', result.tokens.some((t) => t.type === 'ERROR') ? '存在非法 token' : '通过'],
        ['实验二', 'Token 流', `${result.tokens.length} 个 token`],
        ['实验三', 'LR(0) 项目集', `${result.lr0.states.length} 个状态`],
        ['实验四', 'SLR(1) 摘要', result.slr.parseAccepted ? 'ACCEPT' : 'ERROR'],
        ['实验五', 'AST/符号表/错误', `${result.semantic.errors.length} 个错误`],
        ['实验六', '四元式', `${result.semantic.quads.length} 条`],
        ['实验七', '内存映像', `DATA ${stats.dataCount}, TEMP ${stats.tempCount}, CONST ${stats.constCount}`],
        ['实验八', '目标代码', `${result.target.length} 条`],
      ])}</div>
    </div>`
}
function renderLab1(result) {
  const invalid = result.tokens.filter((token) => token.type === 'ERROR')
  return `<div class="section-card"><div class="section-head"><h3>实验一：DFA / 源程序预检</h3><span>用于复杂源程序输入的第一阶段校验</span></div>${tableHtml(['检查项', '结果'], [
    ['是否存在无法识别字符', invalid.length ? `存在 ${invalid.length} 个` : '无'],
    ['源程序 token 化状态', invalid.length ? '失败，见非法 token' : '通过'],
    ['说明', '网页流水线中以词法 DFA 可识别性作为实验一预检结果'],
  ])}${invalid.length ? tableHtml(['type', 'lexeme', 'line'], invalid.map((t) => [t.type, t.lexeme, t.line])) : ''}</div>`
}
function renderLab2(result) {
  return `<div class="section-card"><div class="section-head"><h3>实验二：词法分析 Token 流</h3><span>支持 char/string 常量</span></div>${tableHtml(['#', 'type', 'lexeme', 'line'], result.tokens.map((t, i) => [i, t.type, t.lexeme, t.line || '']))}</div>`
}
function renderLab3(result) {
  const states = result.lr0.states.slice(0, 30)
  return `<div class="section-card"><div class="section-head"><h3>实验三：LR(0) 项目集规范族</h3><span>复杂源程序使用验收主文法构造</span></div>${tableHtml(['项目', '值'], [['产生式数量', result.lr0.productions.length], ['状态数量', result.lr0.states.length], ['GOTO 转移数量', result.lr0.transitions.length], ['LR(0) 判定', result.lr0.isLR0 ? '无冲突' : '存在冲突']])}<pre class="pipeline-pre">${esc(states.map((state) => `I${state.id}\n${state.items.map((item) => '  ' + item.text).join('\n')}`).join('\n\n'))}${result.lr0.states.length > states.length ? `\n... 已省略 ${result.lr0.states.length - states.length} 个状态` : ''}</pre></div>`
}
function renderLab4(result) {
  return `<div class="section-card"><div class="section-head"><h3>实验四：SLR(1) 摘要</h3><span>不展示 ACTION/GOTO 表和逐步分析过程</span></div>${tableHtml(['项目', '值'], [['ACTION 列数量', result.slr.actionColumns.length], ['GOTO 列数量', result.slr.gotoColumns.length], ['冲突数量', result.slr.conflicts.length], ['分析结果', result.slr.parseAccepted ? 'ACCEPT' : 'ERROR'], ['失败原因', result.slr.parseError || '-']])}<h4>FOLLOW 集</h4>${tableHtml(['非终结符', 'FOLLOW'], result.slr.followSets.map((set) => [set.symbol, `{ ${set.values.join(', ')} }`]))}</div>`
}
function renderLab5(result) {
  return `<div class="pipeline-grid"><div class="section-card"><div class="section-head"><h3>实验五：AST</h3><span>语义动作结果</span><button data-copy-ast>复制 AST</button></div><pre class="pipeline-pre">${esc(astToText(result.semantic.ast).trim())}</pre></div><div class="section-card"><div class="section-head"><h3>符号表</h3><span>作用域和类型</span></div>${tableHtml(['name', 'kind', 'type', 'scope', 'level', 'address', 'extra'], result.semantic.symbols.map((s) => [s.name, s.kind, s.type, s.scope, s.level, s.address, s.extra || '']))}<h3>错误报告</h3>${result.semantic.errors.length ? tableHtml(['#', 'kind', 'line', 'lexeme', 'message'], result.semantic.errors.map((e, i) => [i + 1, e.kind, e.line || '-', e.lexeme, e.message])) : '<div class="ok-text">无错误</div>'}</div></div>`
}
function renderLab6(result) {
  return `<div class="section-card"><div class="section-head"><h3>实验六：中间代码生成</h3><span>四元式 (op, arg1, arg2, result)</span><button data-copy-quads>复制四元式</button></div>${tableHtml(['#', 'op', 'arg1', 'arg2', 'result'], result.semantic.quads.map((q) => [q.index, q.op, q.arg1, q.arg2, q.result]))}</div>`
}
function renderLab7(result) {
  const m = result.memory
  return `<div class="section-card"><div class="section-head"><h3>实验七：内存地址分配 / 内存映像</h3><span>DATA=${m.bases.data} CODE=${m.bases.code} TEMP=${m.bases.temp} CONST=${m.bases.const}</span></div><h4>数据段 DATA</h4>${tableHtml(['name', 'kind', 'type', 'scope', 'size', 'address'], m.symbols.map((s) => [s.name, s.kind, s.type, s.scope, s.size, s.address]))}<h4>临时区 TEMP</h4>${tableHtml(['name', 'size', 'address'], m.temporaries.map((t) => [t.name, t.size, t.address]))}<h4>常量池 CONST</h4>${tableHtml(['literal', 'size', 'address'], m.constants.map((c) => [c.literal, c.size, c.address]))}<h4>代码段 CODE</h4>${tableHtml(['quad#', 'op', 'address'], m.code.map((c) => [c.index, c.op, c.address]))}<h4>标签地址</h4>${tableHtml(['label', 'address'], m.labels.map((l) => [l.label, l.address]))}</div>`
}
function renderLab8(result) {
  return `<div class="section-card"><div class="section-head"><h3>实验八：目标代码生成</h3><span>由四元式和内存映像翻译得到</span><button data-copy-target>复制目标代码</button></div><pre class="pipeline-pre">${esc(result.target.join('\n') || '空')}</pre></div>`
}
function makeReport(result) {
  return [
    '完整编译流水线：实验一到八', '='.repeat(72), `最终判断：${result.verdict.ok ? '通过，无错误' : '不通过，存在错误'}`, '', '错误原因：', result.verdict.reasons.length ? result.verdict.reasons.map((r, i) => `${i + 1}. ${r}`).join('\n') : '无', '', 'Token 流：', makeTable(['#', 'type', 'lexeme', 'line'], result.tokens.map((t, i) => [i, t.type, t.lexeme, t.line || ''])), '', 'AST：', astToText(result.semantic.ast).trim(), '', '符号表：', makeTable(['name', 'kind', 'type', 'scope', 'level', 'address', 'extra'], result.semantic.symbols.map((s) => [s.name, s.kind, s.type, s.scope, s.level, s.address, s.extra || ''])), '', '四元式：', makeTable(['#', 'op', 'arg1', 'arg2', 'result'], result.semantic.quads.map((q) => [q.index, q.op, q.arg1, q.arg2, q.result])), '', '目标代码：', result.target.join('\n') || '空',
  ].join('\n')
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
