<template>
  <div :class="['app', theme]">
    <aside class="activity">
      <div class="active">▣</div>
      <div>⌕</div>
      <div>⚙</div>
    </aside>

    <div class="titlebar">
      <div class="brand">
        <span class="scanner-logo" aria-hidden="true"><span class="logo-core"></span></span>
        <strong>{{ activeTool === 'scanner' ? 'Lexical Scanner' : 'LR(0) Builder' }}</strong>
      </div>
      <span class="theme-name">{{ theme === 'dark' ? 'Dark' : 'Light' }}</span>
    </div>

    <aside class="sidebar">
      <h3>TOOLS</h3>
      <div class="project-title">CODE ANALYSIS</div>
      <button :class="['tool-item', { active: activeTool === 'scanner' }]" @click="activeTool = 'scanner'">
        <span>S</span>
        <div><strong>Lexical Scanner</strong><small>Tokenize source code</small></div>
      </button>
      <button :class="['tool-item', { active: activeTool === 'lr0' }]" @click="activeTool = 'lr0'">
        <span>G</span>
        <div><strong>LR(0) Builder</strong><small>Build item sets and graph</small></div>
      </button>
    </aside>

    <main v-if="activeTool === 'scanner'" class="main simple-scanner">
      <section class="scanner-grid">
        <div class="scanner-card">
          <div class="panel-title"><span>Source Code</span><span>{{ currentFileName }}</span></div>
          <textarea v-model="source" class="plain-editor" spellcheck="false"></textarea>
          <div class="scanner-actions">
            <button class="primary" @click="runScanner">▶ Start Scan</button>
            <button @click="triggerFileInput">Open File</button>
            <button @click="loadSample">Load Sample</button>
            <button @click="clearScanner">Clear</button>
            <button @click="downloadTokens">Download token.txt</button>
            <button @click="toggleTheme">{{ theme === 'dark' ? 'Light Mode' : 'Dark Mode' }}</button>
            <input ref="fileInputRef" class="hidden-file" type="file" accept=".c,.cpp,.h,.hpp,.txt" @change="handleFileChange" />
          </div>
        </div>

        <div class="scanner-card token-card">
          <div class="panel-title"><span>Token Stream</span><span>{{ tokens.length }} tokens</span></div>
          <div class="table-wrap token-table">
            <table>
              <thead><tr><th>#</th><th>Type</th><th>Lexeme</th><th>Line</th></tr></thead>
              <tbody>
                <tr v-for="(token, index) in tokens" :key="index">
                  <td>{{ index + 1 }}</td>
                  <td><span :class="['badge', badgeTypeClass(token.type)]">{{ token.type }}</span></td>
                  <td>{{ token.lexeme }}</td>
                  <td>{{ token.line }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>

    <main v-else class="main lr0-main">
      <section class="lr0-page">
        <div class="tabs"><div class="tab wide-tab"><span class="tab-dot"></span>grammar.lr0<span style="margin-left:auto;color:var(--muted)">×</span></div></div>
        <div class="toolbar lr0-toolbar">
          <button class="primary" @click="buildGrammar">▶ Build Automaton</button>
          <button @click="loadGrammarSample">Load Sample</button>
          <button @click="clearGrammar">Clear</button>
          <button @click="toggleTheme">{{ theme === 'dark' ? 'Light Mode' : 'Dark Mode' }}</button>
        </div>

        <div class="lr0-workspace dot-workspace">
          <section class="grammar-card">
            <div class="panel-title"><span>Grammar Input</span><span>Use | for alternatives</span></div>
            <textarea v-model="grammarSource" class="grammar-input" spellcheck="false" @keydown.tab.prevent="insertGrammarTab"></textarea>
            <div class="input-hint">Example: E -&gt; E + T | T. Use spaces between grammar symbols for clearer results.</div>
          </section>

          <section class="lr0-result dot-result">
            <div v-if="lr0Result.errors.length" class="error-box">
              <strong>Input Error</strong>
              <p v-for="error in lr0Result.errors" :key="error">{{ error }}</p>
            </div>

            <template v-else>
              <div class="summary-grid compact-summary">
                <div class="summary-card"><span>Productions</span><strong>{{ lr0Result.productions.length }}</strong></div>
                <div class="summary-card"><span>States</span><strong>{{ lr0Result.states.length }}</strong></div>
                <div :class="['summary-card', lr0Result.isLR0 ? 'ok' : 'warn']"><span>LR(0) Check</span><strong>{{ lr0Result.isLR0 ? 'Passed' : 'Conflict' }}</strong></div>
              </div>

              <div class="view-switch">
                <button :class="{ active: activeLR0Panel === 'overview' }" @click="activeLR0Panel = 'overview'">Overview</button>
                <button :class="{ active: activeLR0Panel === 'graph' }" @click="openGraphPanel">Graph</button>
                <button :class="{ active: activeLR0Panel === 'details' }" @click="activeLR0Panel = 'details'">Item Sets & GOTO</button>
              </div>

              <div v-if="activeLR0Panel === 'overview'" class="lr0-panel-space">
                <div class="section-card">
                  <div class="section-head"><h3>Augmented Grammar</h3><span>{{ lr0Result.augmentedStart }} -> {{ lr0Result.startSymbol }}</span></div>
                  <div class="production-list">
                    <div v-for="production in lr0Result.productions" :key="production.index" class="production-row">
                      <span>({{ production.index }})</span><code>{{ production.text }}</code>
                    </div>
                  </div>
                </div>

                <div class="section-card">
                  <div class="section-head"><h3>Conflict Check</h3><span>{{ lr0Result.summary }}</span></div>
                  <div v-if="conflictList.length" class="conflict-list">
                    <div v-for="conflict in conflictList" :key="conflict.stateId" class="conflict-row">
                      <strong>I{{ conflict.stateId }}</strong>
                      <span v-if="conflict.shiftReduce" class="conflict-pill sr">SR Conflict</span>
                      <span v-if="conflict.reduceReduce" class="conflict-pill rr">RR Conflict</span>
                      <span v-if="conflict.shiftSymbols.length">Shift on: {{ conflict.shiftSymbols.join(', ') }}</span>
                    </div>
                  </div>
                  <div v-else class="ok-text">No shift-reduce or reduce-reduce conflict was found.</div>
                </div>
              </div>

              <div v-else-if="activeLR0Panel === 'graph'" class="section-card graphviz-card">
                <div class="section-head graph-head">
                  <div><h3>LR(0) Item Set Graph</h3><span>Rendered from DOT by Graphviz layout.</span></div>
                  <div class="graph-actions">
                    <button @click="renderLR0Graph">Render</button>
                    <button @click="downloadRenderedSvg">Download SVG</button>
                    <button @click="downloadRenderedPng">Download PNG</button>
                    <button @click="downloadLR0Dot">Download DOT</button>
                    <button @click="showLR0Dot = true">View DOT</button>
                  </div>
                </div>

                <div class="graph-status" v-if="graphStatus">{{ graphStatus }}</div>
                <div class="graphviz-wrap">
                  <div v-if="renderedSvg" class="rendered-dot-image" v-html="renderedSvg"></div>
                  <div v-else class="render-placeholder">
                    Click Render to generate the graph. If network loading is blocked, download the DOT file and render it with Graphviz locally.
                  </div>
                </div>
              </div>

              <div v-else class="lr0-details-grid lr0-panel-space">
                <div class="section-card details-card">
                  <div class="section-head"><h3>Item Sets</h3><span>Closure result for each state</span></div>
                  <div class="state-list detail-scroll">
                    <div v-for="state in lr0Result.states" :key="state.id" class="state-card">
                      <div class="state-title"><strong>I{{ state.id }}</strong><span v-if="conflictForState(state.id).shiftReduce" class="mini-conflict sr">SR</span><span v-if="conflictForState(state.id).reduceReduce" class="mini-conflict rr">RR</span></div>
                      <code v-for="item in state.items" :key="item.text">{{ item.text }}</code>
                    </div>
                  </div>
                </div>

                <div class="section-card details-card">
                  <div class="section-head"><h3>GOTO Transitions</h3><span>{{ lr0Result.transitions.length }} edges</span></div>
                  <div class="table-wrap goto-table detail-scroll">
                    <table><thead><tr><th>From</th><th>Symbol</th><th>To</th></tr></thead><tbody><tr v-for="(edge, index) in lr0Result.transitions" :key="index"><td>I{{ edge.from }}</td><td>{{ edge.symbol }}</td><td>I{{ edge.to }}</td></tr></tbody></table>
                  </div>
                </div>
              </div>
            </template>
          </section>
        </div>
      </section>
    </main>

    <div v-if="showLR0Dot" class="modal-mask" @click.self="showLR0Dot = false">
      <div class="dot-modal">
        <div class="modal-head">
          <strong>DOT Source</strong>
          <div class="modal-actions"><button @click="copyLR0Dot">Copy</button><button class="icon-btn" @click="showLR0Dot = false">×</button></div>
        </div>
        <pre class="dot-text modal-dot">{{ lr0DotText }}</pre>
      </div>
    </div>

    <footer class="status"><span>Vue + Vite</span><span>{{ statusText }}</span></footer>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { SAMPLE_CODE, scan } from './scanner.js'
import { SAMPLE_GRAMMAR, buildLR0 } from './lr0.js'

const activeTool = ref('scanner')
const activeLR0Panel = ref('overview')
const showLR0Dot = ref(false)
const source = ref(SAMPLE_CODE)
const tokens = ref([])
const theme = ref('dark')
const currentFileName = ref('test.c')
const statusText = ref('Ready')
const grammarSource = ref(SAMPLE_GRAMMAR)
const renderedSvg = ref('')
const graphStatus = ref('')
const fileInputRef = ref(null)
let vizPromise = null

const outputText = computed(() => tokens.value.map((token) => `(${token.type}, ${token.lexeme})`).join(''))
const lr0Result = computed(() => buildLR0(grammarSource.value))
const conflictList = computed(() => lr0Result.value.conflicts.filter((c) => c.shiftReduce || c.reduceReduce))
const lr0DotText = computed(() => makeThemedLR0Dot(lr0Result.value, theme.value))

watch([lr0DotText, theme], () => {
  renderedSvg.value = ''
  if (activeLR0Panel.value === 'graph') renderLR0Graph()
})

function badgeTypeClass(type) {
  if (['INT', 'FLOAT', 'VOID', 'IF', 'ELSE', 'WHILE', 'RETURN', 'INPUT', 'PRINT'].includes(type)) return 'kw'
  if (type === 'ID') return 'id'
  if (type === 'NUM') return 'num'
  if (type === 'FLO') return 'flo'
  if (['ADD', 'SUB', 'MUL', 'DIV'].includes(type)) return 'aop'
  if (type === 'ROP') return 'rop'
  if (type === 'BOP') return 'bop'
  if (['ASG', 'AAS', 'AAA'].includes(type)) return 'asg'
  if (['LPAR', 'RPAR', 'LBK', 'RBK', 'LBR', 'RBR', 'CMA', 'COL', 'SEMI', 'DOT'].includes(type)) return 'punc'
  return 'err'
}

function runScanner() {
  tokens.value = scan(source.value)
  statusText.value = `Scan complete: ${tokens.value.length} tokens`
}

function loadSample() {
  source.value = SAMPLE_CODE
  currentFileName.value = 'test.c'
  runScanner()
}

function clearScanner() {
  source.value = ''
  tokens.value = []
  statusText.value = 'Scanner cleared'
}

function triggerFileInput() {
  fileInputRef.value?.click()
}

async function handleFileChange(event) {
  const file = event.target.files?.[0]
  if (!file) return
  source.value = await file.text()
  currentFileName.value = file.name
  runScanner()
  statusText.value = `Loaded file: ${file.name}`
  event.target.value = ''
}

function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
}

function insertGrammarTab(event) {
  const textarea = event.target
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  grammarSource.value = `${grammarSource.value.slice(0, start)}    ${grammarSource.value.slice(end)}`
  nextTick(() => {
    textarea.selectionStart = start + 4
    textarea.selectionEnd = start + 4
  })
}

function buildGrammar() {
  const result = lr0Result.value
  renderedSvg.value = ''
  statusText.value = result.errors.length ? 'Grammar input contains errors' : `Built ${result.states.length} states, ${result.transitions.length} transitions`
  if (!result.errors.length && activeLR0Panel.value === 'graph') renderLR0Graph()
}

function loadGrammarSample() {
  grammarSource.value = SAMPLE_GRAMMAR
  activeLR0Panel.value = 'overview'
  buildGrammar()
}

function clearGrammar() {
  grammarSource.value = ''
  renderedSvg.value = ''
  statusText.value = 'Grammar cleared'
}

function openGraphPanel() {
  activeLR0Panel.value = 'graph'
  nextTick(renderLR0Graph)
}

function conflictForState(id) {
  return lr0Result.value.conflicts[id] || { shiftReduce: false, reduceReduce: false, shiftSymbols: [], reduceItems: [] }
}

function downloadFile(content, filename, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type })
  downloadBlob(blob, filename)
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

function downloadTokens() {
  if (!tokens.value.length) runScanner()
  downloadFile(outputText.value, 'token.txt')
  statusText.value = 'token.txt downloaded'
}

async function copyLR0Dot() {
  if (!lr0DotText.value) return
  try {
    await navigator.clipboard.writeText(lr0DotText.value)
    statusText.value = 'DOT copied'
  } catch {
    statusText.value = 'Copy failed'
  }
}

function downloadLR0Dot() {
  if (!lr0DotText.value) return
  downloadFile(lr0DotText.value, 'lr0_graph.dot', 'text/vnd.graphviz;charset=utf-8')
  statusText.value = 'lr0_graph.dot downloaded'
}

async function loadViz() {
  if (!vizPromise) {
    const url = 'https://cdn.jsdelivr.net/npm/@viz-js/viz@3.12.0/+esm'
    vizPromise = import(/* @vite-ignore */ url).then((mod) => mod.instance())
  }
  return vizPromise
}

async function renderLR0Graph() {
  if (lr0Result.value.errors.length) return
  graphStatus.value = 'Rendering with Graphviz...'
  try {
    const viz = await loadViz()
    const svgElement = viz.renderSVGElement(lr0DotText.value)
    svgElement.removeAttribute('width')
    svgElement.removeAttribute('height')
    svgElement.setAttribute('class', 'graphviz-svg')
    renderedSvg.value = new XMLSerializer().serializeToString(svgElement)
    graphStatus.value = 'Graph rendered successfully.'
  } catch (error) {
    console.error(error)
    graphStatus.value = 'Graphviz renderer could not be loaded. You can still download the DOT file and render it locally.'
  }
}

async function ensureRenderedSvg() {
  if (!renderedSvg.value) await renderLR0Graph()
  return renderedSvg.value
}

async function downloadRenderedSvg() {
  const content = await ensureRenderedSvg()
  if (!content) return
  downloadFile(`<?xml version="1.0" encoding="UTF-8"?>\n${content}`, graphFileName('svg'), 'image/svg+xml;charset=utf-8')
  statusText.value = 'SVG downloaded'
}

async function downloadRenderedPng() {
  const content = await ensureRenderedSvg()
  if (!content) return
  const svgBlob = new Blob([content], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(svgBlob)
  const image = new Image()
  image.onload = () => {
    const scale = 2
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth * scale
    canvas.height = image.naturalHeight * scale
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = theme.value === 'dark' ? '#1e1e1e' : '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    ctx.drawImage(image, 0, 0)
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, graphFileName('png'))
      URL.revokeObjectURL(url)
      statusText.value = 'PNG downloaded'
    }, 'image/png')
  }
  image.onerror = () => {
    URL.revokeObjectURL(url)
    statusText.value = 'PNG export failed'
  }
  image.src = url
}

function graphFileName(ext) {
  return theme.value === 'dark' ? `lr0_graph_dark.${ext}` : `lr0_graph_light.${ext}`
}

function makeThemedLR0Dot(result, mode) {
  if (!result || result.errors?.length || !result.states?.length) return ''
  const dark = mode === 'dark'
  const graphBg = dark ? '#1e1e1e' : '#ffffff'
  const normalFill = dark ? '#252526' : '#ffffff'
  const normalFont = dark ? '#d4d4d4' : '#111827'
  const edgeColor = dark ? '#c9c9c9' : '#111827'
  const normalBorder = dark ? '#5a5a5a' : '#111827'
  const label = dark ? '#d4d4d4' : '#111827'
  const lines = [
    'digraph LR0 {',
    '  rankdir=LR;',
    '  splines=true;',
    '  overlap=false;',
    '  nodesep=0.45;',
    '  ranksep=0.9;',
    `  bgcolor="${graphBg}";`,
    `  graph [fontname="Consolas", color="${graphBg}"];`,
    `  node [shape=box, style="rounded,filled", fontname="Consolas", fontsize=12, margin="0.12,0.08", penwidth=2, color="${normalBorder}", fillcolor="${normalFill}", fontcolor="${normalFont}"];`,
    `  edge [fontname="Consolas", fontsize=12, color="${edgeColor}", fontcolor="${label}", arrowsize=0.8];`,
  ]

  for (const state of result.states) {
    const conflict = result.conflicts[state.id]
    let fill = normalFill
    let color = normalBorder
    let font = normalFont
    const nodeLines = [`I${state.id}`, ...state.items.map((item) => item.text)]
    if (conflict.shiftReduce) nodeLines.push('', '[SR Conflict]', `Shift on: ${conflict.shiftSymbols.join(', ')}`)
    if (conflict.reduceReduce) nodeLines.push('', '[RR Conflict]')
    if (conflict.shiftReduce && conflict.reduceReduce) {
      fill = '#f3e8ff'
      color = '#9333ea'
      font = '#111827'
    } else if (conflict.shiftReduce) {
      fill = '#fff7ad'
      color = '#f59e0b'
      font = '#111827'
    } else if (conflict.reduceReduce) {
      fill = '#fee2e2'
      color = '#ef4444'
      font = '#111827'
    }
    lines.push(`  I${state.id} [label="${nodeLines.map(escapeDot).join('\\n')}", fillcolor="${fill}", color="${color}", fontcolor="${font}"];`)
  }

  for (const edge of result.transitions) {
    lines.push(`  I${edge.from} -> I${edge.to} [label="${escapeDot(edge.symbol)}"];`)
  }

  lines.push('}')
  return lines.join('\n')
}

function escapeDot(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

runScanner()
buildGrammar()
</script>

<style scoped>
.simple-scanner,
.lr0-main {
  background: var(--panel);
}

.scanner-grid {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(360px, 0.9fr) minmax(460px, 1.1fr);
  gap: 20px;
  padding: 20px;
  overflow: hidden;
}

.scanner-card {
  min-height: 0;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--panel2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.plain-editor {
  flex: 1;
  min-height: 360px;
  resize: none;
  border: none;
  outline: none;
  padding: 18px;
  background: var(--panel);
  color: var(--text);
  font-family: var(--font-code);
  font-size: 14px;
  line-height: 1.65;
}

.scanner-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 12px;
  border-top: 1px solid var(--border);
}

.token-table {
  flex: 1;
  min-height: 0;
}

.dot-workspace {
  grid-template-columns: 370px minmax(0, 1fr);
}

.dot-result {
  overflow: auto;
}

.graphviz-card {
  min-height: calc(100vh - 278px);
  display: flex;
  flex-direction: column;
}

.graphviz-wrap {
  flex: 1;
  min-height: 520px;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--panel);
  padding: 18px;
}

.rendered-dot-image {
  width: max-content;
  min-width: 100%;
}

.rendered-dot-image :deep(svg) {
  display: block;
  max-width: none;
  height: auto;
}

.render-placeholder,
.graph-status {
  color: var(--muted);
  line-height: 1.6;
}

.graph-status {
  margin: -4px 0 12px;
}

.graph-actions,
.modal-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.details-card {
  height: calc(100vh - 305px);
  min-height: 520px;
}

.modal-actions {
  align-items: center;
}

@media (max-width: 1200px) {
  .scanner-grid,
  .dot-workspace,
  .lr0-details-grid {
    grid-template-columns: 1fr;
    overflow: auto;
  }

  .details-card {
    height: auto;
    min-height: 420px;
  }
}
</style>
