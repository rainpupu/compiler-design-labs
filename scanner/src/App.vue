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
        <div class="toolbar">
          <button class="primary" @click="buildGrammar">▶ Build Automaton</button>
          <button @click="loadGrammarSample">Load Sample</button>
          <button @click="clearGrammar">Clear</button>
          <button @click="copyLR0Dot">Copy DOT</button>
          <button @click="downloadLR0Dot">Download DOT</button>
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
              <div class="summary-grid">
                <div class="summary-card"><span>Productions</span><strong>{{ lr0Result.productions.length }}</strong></div>
                <div class="summary-card"><span>States</span><strong>{{ lr0Result.states.length }}</strong></div>
                <div :class="['summary-card', lr0Result.isLR0 ? 'ok' : 'warn']"><span>LR(0) Check</span><strong>{{ lr0Result.isLR0 ? 'Passed' : 'Conflict' }}</strong></div>
              </div>

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

              <div class="section-card graph-card">
                <div class="section-head"><h3>LR(0) Item Set Graph</h3><span>Colored nodes indicate conflicts</span></div>
                <div class="lr0-svg-wrap">
                  <svg class="lr0-svg" :viewBox="lr0ViewBox" xmlns="http://www.w3.org/2000/svg">
                    <defs><marker id="lr0-arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="gray"></path></marker></defs>
                    <g v-for="(edge, index) in lr0Result.transitions" :key="`e-${index}`">
                      <path :d="lr0EdgePath(edge)" stroke="var(--muted)" stroke-width="1.8" fill="none" marker-end="url(#lr0-arrow)" />
                      <text :x="lr0EdgeLabel(edge).x" :y="lr0EdgeLabel(edge).y" text-anchor="middle" fill="var(--text)" font-size="12">{{ edge.symbol }}</text>
                    </g>
                    <g v-for="state in lr0Result.states" :key="state.id">
                      <rect :x="lr0Node(state.id).x" :y="lr0Node(state.id).y" :width="lr0NodeWidth" :height="lr0NodeHeight(state)" rx="10" :fill="lr0NodeFill(state.id)" :stroke="lr0NodeStroke(state.id)" stroke-width="2" />
                      <text :x="lr0Node(state.id).x + 12" :y="lr0Node(state.id).y + 22" fill="var(--text)" font-size="13" font-weight="700">I{{ state.id }}</text>
                      <text v-for="(item, itemIndex) in state.items" :key="item.text" :x="lr0Node(state.id).x + 12" :y="lr0Node(state.id).y + 42 + itemIndex * 15" fill="var(--text)" font-size="11" font-family="Consolas, monospace">{{ item.text }}</text>
                      <text v-if="conflictForState(state.id).shiftReduce" :x="lr0Node(state.id).x + 12" :y="lr0Node(state.id).y + lr0NodeHeight(state) - 24" fill="#b45309" font-size="11" font-weight="700">[SR Conflict] Shift on: {{ conflictForState(state.id).shiftSymbols.join(', ') }}</text>
                      <text v-if="conflictForState(state.id).reduceReduce" :x="lr0Node(state.id).x + 12" :y="lr0Node(state.id).y + lr0NodeHeight(state) - 9" fill="#dc2626" font-size="11" font-weight="700">[RR Conflict]</text>
                    </g>
                  </svg>
                </div>
              </div>

              <div class="lr0-columns">
                <div class="section-card">
                  <div class="section-head"><h3>Item Sets</h3><span>Closure result for each state</span></div>
                  <div class="state-list">
                    <div v-for="state in lr0Result.states" :key="state.id" class="state-card">
                      <div class="state-title"><strong>I{{ state.id }}</strong><span v-if="conflictForState(state.id).shiftReduce" class="mini-conflict sr">SR</span><span v-if="conflictForState(state.id).reduceReduce" class="mini-conflict rr">RR</span></div>
                      <code v-for="item in state.items" :key="item.text">{{ item.text }}</code>
                    </div>
                  </div>
                </div>

                <div class="section-card">
                  <div class="section-head"><h3>GOTO Transitions</h3><span>{{ lr0Result.transitions.length }} edges</span></div>
                  <div class="table-wrap goto-table">
                    <table><thead><tr><th>From</th><th>Symbol</th><th>To</th></tr></thead><tbody><tr v-for="(edge, index) in lr0Result.transitions" :key="index"><td>I{{ edge.from }}</td><td>{{ edge.symbol }}</td><td>I{{ edge.to }}</td></tr></tbody></table>
                  </div>
                  <pre class="dot-text lr0-dot">{{ lr0DotText }}</pre>
                </div>
              </div>
            </template>
          </section>
        </div>
      </section>
    </main>

    <footer class="status"><span>Vue + Vite</span><span>{{ statusText }}</span></footer>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { SAMPLE_CODE, escapeHtml, scan, tokenClass } from './scanner.js'
import { buildGraph, dfaPathForToken, makeDot } from './dfa.js'
import { SAMPLE_GRAMMAR, buildLR0, makeLR0Dot } from './lr0.js'

const activeTool = ref('scanner')
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
const lr0NodeWidth = 220
const lr0CellWidth = 285
const lr0CellHeight = 185
const lr0Columns = computed(() => Math.max(1, Math.ceil(Math.sqrt(Math.max(1, lr0Result.value.states.length) * 1.5))))
const lr0Rows = computed(() => Math.max(1, Math.ceil(Math.max(1, lr0Result.value.states.length) / lr0Columns.value)))
const lr0SvgWidth = computed(() => lr0Columns.value * lr0CellWidth + 80)
const lr0SvgHeight = computed(() => lr0Rows.value * lr0CellHeight + 80)
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
function downloadFile(content, filename, type = 'text/plain;charset=utf-8') { const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); document.body.removeChild(anchor); URL.revokeObjectURL(url) }
function downloadTokens() { if (!tokens.value.length) runScanner(); downloadFile(outputText.value, 'token.txt'); statusText.value = 'token.txt downloaded' }
function downloadDot() { if (!dotText.value) return; downloadFile(dotText.value, 'dfa_graph.dot', 'text/vnd.graphviz;charset=utf-8'); statusText.value = 'dfa_graph.dot downloaded' }
function downloadGraphSvg() { if (!dfaSvgRef.value || !selectedToken.value) return; const clone = dfaSvgRef.value.cloneNode(true); clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); clone.setAttribute('width', String(svgWidth.value)); clone.setAttribute('height', '160'); const content = `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`; downloadFile(content, `dfa_${selectedToken.value.type}.svg`, 'image/svg+xml;charset=utf-8'); statusText.value = 'DFA SVG downloaded' }
function buildGrammar() { const result = lr0Result.value; statusText.value = result.errors.length ? 'Grammar input contains errors' : `Built ${result.states.length} states, ${result.transitions.length} transitions` }
function loadGrammarSample() { grammarSource.value = SAMPLE_GRAMMAR; buildGrammar() }
function clearGrammar() { grammarSource.value = ''; statusText.value = 'Grammar cleared' }
async function copyLR0Dot() { if (!lr0DotText.value) return; try { await navigator.clipboard.writeText(lr0DotText.value); statusText.value = 'LR(0) DOT copied' } catch { statusText.value = 'Copy failed' } }
function downloadLR0Dot() { if (!lr0DotText.value) return; downloadFile(lr0DotText.value, 'lr0_graph.dot', 'text/vnd.graphviz;charset=utf-8'); statusText.value = 'lr0_graph.dot downloaded' }
function startResize(event) { resizeState.value = { startY: event.clientY, startHeight: bottomHeight.value }; document.body.classList.add('resizing'); window.addEventListener('mousemove', resizeBottom); window.addEventListener('mouseup', stopResize) }
function resizeBottom(event) { if (!resizeState.value) return; const delta = resizeState.value.startY - event.clientY; const nextHeight = resizeState.value.startHeight + delta; const maxHeight = Math.max(260, window.innerHeight - 260); bottomHeight.value = Math.min(Math.max(nextHeight, 220), maxHeight) }
function stopResize() { resizeState.value = null; document.body.classList.remove('resizing'); window.removeEventListener('mousemove', resizeBottom); window.removeEventListener('mouseup', stopResize) }
onBeforeUnmount(() => { window.removeEventListener('mousemove', resizeBottom); window.removeEventListener('mouseup', stopResize) })
function nodePos(node) { const nodes = graph.value.nodes; const index = nodes.indexOf(node); const gap = svgWidth.value / (nodes.length + 1); return { x: gap * (index + 1), y: 88 } }
function nodeStroke(node) { if (node === 'dead') return 'var(--err)'; if (node.startsWith('accept_')) return '#22c55e'; return 'var(--accent)' }
function loopPath(node) { const position = nodePos(node); return `M ${position.x - 20} ${position.y - 22} C ${position.x - 62} ${position.y - 72}, ${position.x + 62} ${position.y - 72}, ${position.x + 20} ${position.y - 22}` }
function lr0Node(id) { const col = id % lr0Columns.value; const row = Math.floor(id / lr0Columns.value); return { x: 40 + col * lr0CellWidth, y: 35 + row * lr0CellHeight } }
function lr0NodeCenter(id) { const node = lr0Node(id); const state = lr0Result.value.states[id]; return { x: node.x + lr0NodeWidth / 2, y: node.y + lr0NodeHeight(state) / 2 } }
function lr0NodeHeight(state) { const conflict = conflictForState(state.id); let extra = 0; if (conflict.shiftReduce) extra += 18; if (conflict.reduceReduce) extra += 18; return Math.max(92, 54 + state.items.length * 15 + extra) }
function conflictForState(id) { return lr0Result.value.conflicts[id] || { shiftReduce: false, reduceReduce: false, shiftSymbols: [], reduceItems: [] } }
function lr0NodeFill(id) { const conflict = conflictForState(id); if (conflict.shiftReduce && conflict.reduceReduce) return '#f3e8ff'; if (conflict.shiftReduce) return '#fef9c3'; if (conflict.reduceReduce) return '#fee2e2'; return 'var(--panel2)' }
function lr0NodeStroke(id) { const conflict = conflictForState(id); if (conflict.shiftReduce && conflict.reduceReduce) return '#9333ea'; if (conflict.shiftReduce) return '#f59e0b'; if (conflict.reduceReduce) return '#ef4444'; return 'var(--border)' }
function lr0EdgePath(edge) { const from = lr0NodeCenter(edge.from); const to = lr0NodeCenter(edge.to); if (edge.from === edge.to) return `M ${from.x + 55} ${from.y - 20} C ${from.x + 120} ${from.y - 95}, ${from.x - 120} ${from.y - 95}, ${from.x - 55} ${from.y - 20}`; return `M ${from.x} ${from.y} L ${to.x} ${to.y}` }
function lr0EdgeLabel(edge) { const from = lr0NodeCenter(edge.from); const to = lr0NodeCenter(edge.to); if (edge.from === edge.to) return { x: from.x, y: from.y - 88 }; return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 - 8 } }
runScanner()
buildGrammar()
</script>
