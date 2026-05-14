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

    <main v-if="activeTool === 'scanner'" class="main" :style="mainStyle">
      <section class="editor-area">
        <div class="tabs"><div class="tab"><span class="tab-dot"></span>{{ currentFileName }}<span style="margin-left:auto;color:var(--muted)">×</span></div></div>
        <div class="toolbar">
          <button class="primary" @click="runScanner">▶ Start Scan</button>
          <button @click="triggerFileInput">Open File</button>
          <button @click="loadSample">Load Sample</button>
          <button @click="clearAll">Clear</button>
          <button @click="copyTokens">Copy token.txt</button>
          <button @click="downloadTokens">Download token.txt</button>
          <button @click="toggleTheme">{{ theme === 'dark' ? 'Light Mode' : 'Dark Mode' }}</button>
          <input ref="fileInputRef" class="hidden-file" type="file" accept=".c,.cpp,.h,.hpp,.txt" @change="handleFileChange" />
        </div>
        <div class="editor-wrap">
          <pre ref="lineNoRef" class="line-numbers">{{ lineNumbers }}</pre>
          <div class="code-box">
            <pre ref="highlightRef" class="highlight" v-html="highlightHtml"></pre>
            <textarea ref="sourceRef" v-model="source" class="source" spellcheck="false" @scroll="syncScroll" @keydown.tab.prevent="insertTab"></textarea>
          </div>
        </div>
      </section>

      <div class="resize-bar" title="Drag to resize" @mousedown="startResize"><span></span></div>

      <section class="bottom">
        <div class="panel token-panel">
          <div class="panel-title"><span>Token Stream</span><span>{{ tokens.length }} tokens | Click a row to view DFA</span></div>
          <div class="token-content">
            <div class="table-wrap">
              <table>
                <thead><tr><th>#</th><th>Type</th><th>Lexeme</th><th>Line</th></tr></thead>
                <tbody>
                  <tr v-for="(token, index) in tokens" :key="index" :class="{ active: selectedIndex === index }" @click="selectToken(index)">
                    <td>{{ index + 1 }}</td>
                    <td><span :class="['badge', badgeTypeClass(token.type)]">{{ token.type }}</span></td>
                    <td>{{ token.lexeme }}</td>
                    <td>{{ token.line }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <transition name="slide-fade">
              <div v-if="graphVisible && selectedToken" class="dfa-card">
                <div class="dfa-head">
                  <div><strong>DFA Transition Graph</strong><span>({{ selectedToken.type }}, {{ selectedToken.lexeme }})</span></div>
                  <div class="dfa-actions"><button @click.stop="downloadGraphSvg">Download SVG</button><button @click.stop="downloadDot">Download DOT</button><button class="icon-btn" @click.stop="closeGraph">×</button></div>
                </div>
                <div class="states">
                  <template v-for="(state, index) in dfaPath" :key="index"><span class="state">{{ state }}</span><span v-if="index < dfaPath.length - 1" class="arrow">→</span></template>
                </div>
                <svg ref="dfaSvgRef" class="dfa-svg" :viewBox="svgViewBox" xmlns="http://www.w3.org/2000/svg">
                  <defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="gray"></path></marker></defs>
                  <text x="12" y="20" fill="var(--muted)" font-size="12">DFA Graph</text>
                  <g v-for="(edge, index) in graph.edges" :key="'edge' + index">
                    <template v-if="edge.from === edge.to">
                      <path :d="loopPath(edge.from)" stroke="var(--muted)" stroke-width="2" fill="none" marker-end="url(#arrow)" />
                      <text :x="nodePos(edge.from).x" :y="nodePos(edge.from).y - 62" text-anchor="middle" fill="var(--text)" font-size="11">{{ edge.label }}</text>
                    </template>
                    <template v-else>
                      <line :x1="nodePos(edge.from).x + 26" :y1="nodePos(edge.from).y" :x2="nodePos(edge.to).x - 26" :y2="nodePos(edge.to).y" stroke="var(--muted)" stroke-width="2" marker-end="url(#arrow)" />
                      <text :x="(nodePos(edge.from).x + nodePos(edge.to).x) / 2" :y="nodePos(edge.from).y - 14 - (index % 2) * 8" text-anchor="middle" fill="var(--text)" font-size="11">{{ edge.label }}</text>
                    </template>
                  </g>
                  <g v-for="node in graph.nodes" :key="node">
                    <circle :cx="nodePos(node).x" :cy="nodePos(node).y" r="26" fill="var(--panel2)" :stroke="nodeStroke(node)" stroke-width="2" />
                    <circle v-if="node.startsWith('accept_')" :cx="nodePos(node).x" :cy="nodePos(node).y" r="20" fill="none" :stroke="nodeStroke(node)" stroke-width="2" />
                    <text :x="nodePos(node).x" :y="nodePos(node).y + 4" text-anchor="middle" fill="var(--text)" font-size="11">{{ node }}</text>
                  </g>
                </svg>
                <pre class="dot-text">{{ dotText }}</pre>
              </div>
            </transition>
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

        <div class="lr0-workspace">
          <section class="grammar-card">
            <div class="panel-title"><span>Grammar Input</span><span>Use | for alternatives</span></div>
            <textarea v-model="grammarSource" class="grammar-input" spellcheck="false" @keydown.tab.prevent="insertGrammarTab"></textarea>
            <div class="input-hint">Example: E -&gt; E + T | T. Use spaces between grammar symbols for clearer results.</div>
          </section>

          <section class="lr0-result">
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
                <button :class="{ active: activeLR0Panel === 'graph' }" @click="activeLR0Panel = 'graph'">Graph</button>
                <button :class="{ active: activeLR0Panel === 'details' }" @click="activeLR0Panel = 'details'">Item Sets & GOTO</button>
              </div>

              <div v-if="activeLR0Panel === 'overview'" class="lr0-panel-space">
                <div class="section-card">
                  <div class="section-head"><h3>Augmented Grammar</h3><span>{{ lr0Result.augmentedStart }} -> {{ lr0Result.startSymbol }}</span></div>
                  <div class="production-list"><div v-for="production in lr0Result.productions" :key="production.index" class="production-row"><span>({{ production.index }})</span><code>{{ production.text }}</code></div></div>
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

              <div v-else-if="activeLR0Panel === 'graph'" class="section-card graph-card full-graph-card">
                <div class="section-head graph-head">
                  <div><h3>LR(0) Item Set Graph</h3><span>Yellow nodes indicate shift-reduce conflicts.</span></div>
                  <div class="graph-actions">
                    <button @click="downloadLR0Svg">Download SVG</button>
                    <button @click="downloadLR0Png">Download PNG</button>
                    <button @click="downloadLR0Dot">Download DOT</button>
                    <button @click="showLR0Dot = true">View DOT</button>
                  </div>
                </div>
                <div class="lr0-svg-wrap improved-graph">
                  <svg ref="lr0SvgRef" class="lr0-svg" :viewBox="lr0ViewBox" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                      <marker id="lr0-arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="gray"></path></marker>
                    </defs>
                    <rect x="0" y="0" :width="lr0SvgWidth" :height="lr0SvgHeight" fill="var(--panel)"></rect>
                    <g v-for="(edge, index) in lr0Result.transitions" :key="`e-${index}`">
                      <path :d="lr0EdgePath(edge, index)" stroke="var(--muted)" stroke-width="1.7" fill="none" marker-end="url(#lr0-arrow)" />
                      <rect :x="lr0EdgeLabel(edge, index).x - 14" :y="lr0EdgeLabel(edge, index).y - 13" width="28" height="18" rx="6" fill="var(--panel)"></rect>
                      <text :x="lr0EdgeLabel(edge, index).x" :y="lr0EdgeLabel(edge, index).y" text-anchor="middle" fill="var(--text)" font-size="12">{{ edge.symbol }}</text>
                    </g>
                    <g v-for="state in lr0Result.states" :key="state.id">
                      <rect :x="lr0Node(state.id).x" :y="lr0Node(state.id).y" :width="lr0NodeWidth" :height="lr0NodeHeight(state)" rx="12" :fill="lr0NodeFill(state.id)" :stroke="lr0NodeStroke(state.id)" stroke-width="2.3" />
                      <text :x="lr0Node(state.id).x + 14" :y="lr0Node(state.id).y + 23" :fill="lr0NodeTextFill(state.id)" font-size="14" font-weight="800">I{{ state.id }}</text>
                      <text v-for="(item, itemIndex) in state.items" :key="item.text" :x="lr0Node(state.id).x + 14" :y="lr0Node(state.id).y + 45 + itemIndex * 16" :fill="lr0NodeTextFill(state.id)" font-size="11.5" font-family="Consolas, monospace">{{ item.text }}</text>
                      <text v-if="conflictForState(state.id).shiftReduce" :x="lr0Node(state.id).x + 14" :y="lr0Node(state.id).y + lr0NodeHeight(state) - 25" fill="#7c2d12" font-size="11.5" font-weight="900">[SR Conflict] Shift on: {{ conflictForState(state.id).shiftSymbols.join(', ') }}</text>
                      <text v-if="conflictForState(state.id).reduceReduce" :x="lr0Node(state.id).x + 14" :y="lr0Node(state.id).y + lr0NodeHeight(state) - 9" fill="#7f1d1d" font-size="11.5" font-weight="900">[RR Conflict]</text>
                    </g>
                  </svg>
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
        <div class="modal-head"><strong>DOT Source</strong><button class="icon-btn" @click="showLR0Dot = false">×</button></div>
        <pre class="dot-text modal-dot">{{ lr0DotText }}</pre>
      </div>
    </div>

    <footer class="status"><span>Vue + Vite</span><span>{{ statusText }}</span></footer>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { SAMPLE_CODE, escapeHtml, scan, tokenClass } from './scanner.js'
import { buildGraph, dfaPathForToken, makeDot } from './dfa.js'
import { SAMPLE_GRAMMAR, buildLR0, makeLR0Dot } from './lr0.js'

const activeTool = ref('scanner')
const activeLR0Panel = ref('overview')
const showLR0Dot = ref(false)
const source = ref(SAMPLE_CODE)
const tokens = ref([])
const theme = ref('dark')
const selectedIndex = ref(-1)
const statusText = ref('Ready')
const currentFileName = ref('test.c')
const graphVisible = ref(false)
const grammarSource = ref(SAMPLE_GRAMMAR)
const bottomHeight = ref(330)
const resizeState = ref(null)
const sourceRef = ref(null)
const highlightRef = ref(null)
const lineNoRef = ref(null)
const fileInputRef = ref(null)
const dfaSvgRef = ref(null)
const lr0SvgRef = ref(null)

const mainStyle = computed(() => ({ '--bottom-height': `${bottomHeight.value}px` }))
const scannedForHighlight = computed(() => scan(source.value))
const highlightHtml = computed(() => {
  const code = source.value
  let html = ''
  let last = 0
  for (const token of scannedForHighlight.value) {
    html += escapeHtml(code.slice(last, token.start))
    html += `<span class="${tokenClass(token.type)}">${escapeHtml(code.slice(token.start, token.end))}</span>`
    last = token.end
  }
  html += escapeHtml(code.slice(last))
  return html.endsWith('\n') ? `${html} ` : html
})
const lineNumbers = computed(() => Array.from({ length: source.value.split('\n').length }, (_, index) => index + 1).join('\n'))
const outputText = computed(() => tokens.value.map((token) => `(${token.type}, ${token.lexeme})`).join(''))
const selectedToken = computed(() => (selectedIndex.value < 0 ? null : tokens.value[selectedIndex.value] || null))
const dfaPath = computed(() => dfaPathForToken(selectedToken.value))
const graph = computed(() => buildGraph(selectedToken.value))
const svgWidth = computed(() => Math.max(660, graph.value.nodes.length * 112))
const svgViewBox = computed(() => `0 0 ${svgWidth.value} 160`)
const dotText = computed(() => makeDot(graph.value))
const lr0Result = computed(() => buildLR0(grammarSource.value))
const lr0DotText = computed(() => makeLR0Dot(lr0Result.value))
const conflictList = computed(() => lr0Result.value.conflicts.filter((c) => c.shiftReduce || c.reduceReduce))
const lr0NodeWidth = 245
const lr0NodeGapX = 340
const lr0NodeGapY = 170
const lr0Layout = computed(() => buildLR0Layout())
const lr0SvgWidth = computed(() => lr0Layout.value.width)
const lr0SvgHeight = computed(() => lr0Layout.value.height)
const lr0ViewBox = computed(() => `0 0 ${lr0SvgWidth.value} ${lr0SvgHeight.value}`)

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
function runScanner() { tokens.value = scan(source.value); selectedIndex.value = -1; graphVisible.value = false; statusText.value = `Scan complete: ${tokens.value.length} tokens` }
function loadSample() { source.value = SAMPLE_CODE; currentFileName.value = 'test.c'; runScanner() }
function clearAll() { source.value = ''; tokens.value = []; selectedIndex.value = -1; graphVisible.value = false; statusText.value = 'Scanner cleared' }
function triggerFileInput() { fileInputRef.value?.click() }
async function handleFileChange(event) { const file = event.target.files?.[0]; if (!file) return; source.value = await file.text(); currentFileName.value = file.name; runScanner(); statusText.value = `Loaded file: ${file.name}`; event.target.value = '' }
function selectToken(index) { selectedIndex.value = index; graphVisible.value = true }
function closeGraph() { graphVisible.value = false }
function toggleTheme() { theme.value = theme.value === 'dark' ? 'light' : 'dark' }
function syncScroll() { if (!sourceRef.value || !highlightRef.value || !lineNoRef.value) return; highlightRef.value.scrollTop = sourceRef.value.scrollTop; highlightRef.value.scrollLeft = sourceRef.value.scrollLeft; lineNoRef.value.scrollTop = sourceRef.value.scrollTop }
function insertTab(event) { const textarea = event.target; const start = textarea.selectionStart; const end = textarea.selectionEnd; source.value = `${source.value.slice(0, start)}    ${source.value.slice(end)}`; nextTick(() => { textarea.selectionStart = start + 4; textarea.selectionEnd = start + 4 }) }
function insertGrammarTab(event) { const textarea = event.target; const start = textarea.selectionStart; const end = textarea.selectionEnd; grammarSource.value = `${grammarSource.value.slice(0, start)}    ${grammarSource.value.slice(end)}`; nextTick(() => { textarea.selectionStart = start + 4; textarea.selectionEnd = start + 4 }) }
async function copyTokens() { if (!tokens.value.length) runScanner(); try { await navigator.clipboard.writeText(outputText.value); statusText.value = 'token.txt copied' } catch { statusText.value = 'Copy failed' } }
function downloadFile(content, filename, type = 'text/plain;charset=utf-8') { const blob = new Blob([content], { type }); downloadBlob(blob, filename) }
function downloadBlob(blob, filename) { const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); document.body.removeChild(anchor); URL.revokeObjectURL(url) }
function downloadTokens() { if (!tokens.value.length) runScanner(); downloadFile(outputText.value, 'token.txt'); statusText.value = 'token.txt downloaded' }
function downloadDot() { if (!dotText.value) return; downloadFile(dotText.value, 'dfa_graph.dot', 'text/vnd.graphviz;charset=utf-8'); statusText.value = 'dfa_graph.dot downloaded' }
function downloadGraphSvg() { if (!dfaSvgRef.value || !selectedToken.value) return; const clone = dfaSvgRef.value.cloneNode(true); clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); clone.setAttribute('width', String(svgWidth.value)); clone.setAttribute('height', '160'); clone.setAttribute('style', getSvgCssVariables()); const content = `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`; downloadFile(content, `dfa_${selectedToken.value.type}.svg`, 'image/svg+xml;charset=utf-8'); statusText.value = 'DFA SVG downloaded' }
function buildGrammar() { const result = lr0Result.value; statusText.value = result.errors.length ? 'Grammar input contains errors' : `Built ${result.states.length} states, ${result.transitions.length} transitions` }
function loadGrammarSample() { grammarSource.value = SAMPLE_GRAMMAR; activeLR0Panel.value = 'overview'; buildGrammar() }
function clearGrammar() { grammarSource.value = ''; statusText.value = 'Grammar cleared' }
async function copyLR0Dot() { if (!lr0DotText.value) return; try { await navigator.clipboard.writeText(lr0DotText.value); statusText.value = 'LR(0) DOT copied' } catch { statusText.value = 'Copy failed' } }
function downloadLR0Dot() { if (!lr0DotText.value) return; downloadFile(lr0DotText.value, 'lr0_graph.dot', 'text/vnd.graphviz;charset=utf-8'); statusText.value = 'lr0_graph.dot downloaded' }
function serializeLR0Svg() { if (!lr0SvgRef.value) return ''; const clone = lr0SvgRef.value.cloneNode(true); clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); clone.setAttribute('width', String(lr0SvgWidth.value)); clone.setAttribute('height', String(lr0SvgHeight.value)); clone.setAttribute('style', getSvgCssVariables()); return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}` }
function downloadLR0Svg() { const content = serializeLR0Svg(); if (!content) return; downloadFile(content, 'lr0_graph.svg', 'image/svg+xml;charset=utf-8'); statusText.value = 'LR(0) SVG downloaded' }
function downloadLR0Png() { const content = serializeLR0Svg(); if (!content) return; const blob = new Blob([content], { type: 'image/svg+xml;charset=utf-8' }); const url = URL.createObjectURL(blob); const image = new Image(); image.onload = () => { const scale = 2; const canvas = document.createElement('canvas'); canvas.width = lr0SvgWidth.value * scale; canvas.height = lr0SvgHeight.value * scale; const ctx = canvas.getContext('2d'); ctx.setTransform(scale, 0, 0, scale, 0, 0); ctx.drawImage(image, 0, 0); canvas.toBlob((pngBlob) => { if (pngBlob) downloadBlob(pngBlob, 'lr0_graph.png'); URL.revokeObjectURL(url); statusText.value = 'LR(0) PNG downloaded' }, 'image/png') }; image.onerror = () => { URL.revokeObjectURL(url); statusText.value = 'PNG export failed' }; image.src = url }
function getSvgCssVariables() { const dark = { '--muted': '#9aa5b1', '--text': '#d4d4d4', '--panel': '#1e1e1e', '--panel2': '#252526', '--border': '#3c3c3c', '--accent': '#6a9955', '--err': '#f44747' }; const light = { '--muted': '#64748b', '--text': '#1e293b', '--panel': '#ffffff', '--panel2': '#f8fafc', '--border': '#cbd5e1', '--accent': '#2563eb', '--err': '#dc2626' }; const selected = theme.value === 'dark' ? dark : light; return Object.entries(selected).map(([key, value]) => `${key}:${value}`).join(';') }
function startResize(event) { resizeState.value = { startY: event.clientY, startHeight: bottomHeight.value }; document.body.classList.add('resizing'); window.addEventListener('mousemove', resizeBottom); window.addEventListener('mouseup', stopResize) }
function resizeBottom(event) { if (!resizeState.value) return; const delta = resizeState.value.startY - event.clientY; const nextHeight = resizeState.value.startHeight + delta; const maxHeight = Math.max(260, window.innerHeight - 260); bottomHeight.value = Math.min(Math.max(nextHeight, 220), maxHeight) }
function stopResize() { resizeState.value = null; document.body.classList.remove('resizing'); window.removeEventListener('mousemove', resizeBottom); window.removeEventListener('mouseup', stopResize) }
onBeforeUnmount(() => { window.removeEventListener('mousemove', resizeBottom); window.removeEventListener('mouseup', stopResize) })
function nodePos(node) { const nodes = graph.value.nodes; const index = nodes.indexOf(node); const gap = svgWidth.value / (nodes.length + 1); return { x: gap * (index + 1), y: 88 } }
function nodeStroke(node) { if (node === 'dead') return 'var(--err)'; if (node.startsWith('accept_')) return '#22c55e'; return 'var(--accent)' }
function loopPath(node) { const position = nodePos(node); return `M ${position.x - 20} ${position.y - 22} C ${position.x - 62} ${position.y - 72}, ${position.x + 62} ${position.y - 72}, ${position.x + 20} ${position.y - 22}` }
function buildLR0Layout() { const states = lr0Result.value.states; const transitions = lr0Result.value.transitions; const count = states.length || 1; const levels = Array(count).fill(Number.POSITIVE_INFINITY); levels[0] = 0; const queue = [0]; while (queue.length) { const from = queue.shift(); for (const edge of transitions.filter((e) => e.from === from)) { if (levels[edge.to] > levels[from] + 1) { levels[edge.to] = levels[from] + 1; queue.push(edge.to) } } } for (let i = 0; i < count; i += 1) if (!Number.isFinite(levels[i])) levels[i] = i; const groups = new Map(); levels.forEach((level, id) => { if (!groups.has(level)) groups.set(level, []); groups.get(level).push(id) }); const sortedLevels = [...groups.keys()].sort((a, b) => a - b); const maxRows = Math.max(...[...groups.values()].map((group) => group.length), 1); const height = Math.max(560, maxRows * lr0NodeGapY + 110); const positions = {}; sortedLevels.forEach((level, colIndex) => { const group = groups.get(level).sort((a, b) => a - b); const usedHeight = (group.length - 1) * lr0NodeGapY; const startY = Math.max(36, (height - usedHeight) / 2 - 40); group.forEach((id, rowIndex) => { positions[id] = { x: 42 + colIndex * lr0NodeGapX, y: startY + rowIndex * lr0NodeGapY } }) }); return { positions, width: sortedLevels.length * lr0NodeGapX + lr0NodeWidth + 90, height } }
function lr0Node(id) { return lr0Layout.value.positions[id] || { x: 40, y: 40 } }
function lr0NodeCenter(id) { const node = lr0Node(id); const state = lr0Result.value.states[id]; return { x: node.x + lr0NodeWidth / 2, y: node.y + lr0NodeHeight(state) / 2 } }
function lr0NodeHeight(state) { if (!state) return 90; const conflict = conflictForState(state.id); let extra = 0; if (conflict.shiftReduce) extra += 20; if (conflict.reduceReduce) extra += 18; return Math.max(100, 60 + state.items.length * 16 + extra) }
function conflictForState(id) { return lr0Result.value.conflicts[id] || { shiftReduce: false, reduceReduce: false, shiftSymbols: [], reduceItems: [] } }
function lr0NodeFill(id) { const conflict = conflictForState(id); if (conflict.shiftReduce && conflict.reduceReduce) return '#f3e8ff'; if (conflict.shiftReduce) return '#fff7ad'; if (conflict.reduceReduce) return '#fee2e2'; return 'var(--panel2)' }
function lr0NodeStroke(id) { const conflict = conflictForState(id); if (conflict.shiftReduce && conflict.reduceReduce) return '#9333ea'; if (conflict.shiftReduce) return '#f59e0b'; if (conflict.reduceReduce) return '#ef4444'; return 'var(--border)' }
function lr0NodeTextFill(id) { const conflict = conflictForState(id); return conflict.shiftReduce || conflict.reduceReduce ? '#111827' : 'var(--text)' }
function lr0EdgeEndpoints(edge) { const fromNode = lr0Node(edge.from); const toNode = lr0Node(edge.to); const fromState = lr0Result.value.states[edge.from]; const toState = lr0Result.value.states[edge.to]; const fromH = lr0NodeHeight(fromState); const toH = lr0NodeHeight(toState); if (edge.from === edge.to) return { x1: fromNode.x + lr0NodeWidth * 0.72, y1: fromNode.y + 6, x2: fromNode.x + lr0NodeWidth * 0.28, y2: fromNode.y + 6, self: true }; if (toNode.x >= fromNode.x) return { x1: fromNode.x + lr0NodeWidth, y1: fromNode.y + fromH / 2, x2: toNode.x, y2: toNode.y + toH / 2, forward: true }; return { x1: fromNode.x, y1: fromNode.y + fromH / 2, x2: toNode.x + lr0NodeWidth, y2: toNode.y + toH / 2, forward: false } }
function lr0EdgeLane(edge, index) { const same = lr0Result.value.transitions.filter((e) => e.from === edge.from && e.to === edge.to); const pos = same.findIndex((e) => e.symbol === edge.symbol); if (same.length <= 1) return ((index % 3) - 1) * 8; return (pos - (same.length - 1) / 2) * 18 }
function lr0EdgePath(edge, index) { const p = lr0EdgeEndpoints(edge); const lane = lr0EdgeLane(edge, index); if (p.self) return `M ${p.x1} ${p.y1} C ${p.x1 + 75} ${p.y1 - 80}, ${p.x2 - 75} ${p.y2 - 80}, ${p.x2} ${p.y2}`; const dx = Math.abs(p.x2 - p.x1); const curve = Math.max(60, dx * 0.45); if (p.forward) return `M ${p.x1} ${p.y1 + lane} C ${p.x1 + curve} ${p.y1 + lane}, ${p.x2 - curve} ${p.y2 + lane}, ${p.x2} ${p.y2 + lane}`; return `M ${p.x1} ${p.y1 + lane} C ${p.x1 - curve} ${p.y1 + 80 + lane}, ${p.x2 + curve} ${p.y2 + 80 + lane}, ${p.x2} ${p.y2 + lane}` }
function lr0EdgeLabel(edge, index) { const p = lr0EdgeEndpoints(edge); const lane = lr0EdgeLane(edge, index); if (p.self) return { x: (p.x1 + p.x2) / 2, y: p.y1 - 58 }; return { x: (p.x1 + p.x2) / 2, y: (p.y1 + p.y2) / 2 + lane - 10 } }
runScanner()
buildGrammar()
</script>
