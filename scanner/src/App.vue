<template>
  <div :class="['app', theme]">
    <aside class="activity">
      <div class="active">▣</div>
      <div>⌕</div>
      <div>⚙</div>
    </aside>

    <div class="titlebar">
      <div class="brand">
        <span class="scanner-logo" aria-hidden="true">
          <span class="logo-core"></span>
        </span>
        <strong>Scanner</strong>
      </div>
      <span class="theme-name">{{ theme === 'dark' ? 'Dark' : 'Light' }}</span>
    </div>

    <aside class="sidebar">
      <h3>EXPLORER</h3>
      <div class="project-title">SCANNER</div>
      <div class="file active"><span>C</span>{{ currentFileName }}</div>
    </aside>

    <main class="main" :style="mainStyle">
      <section class="editor-area">
        <div class="tabs">
          <div class="tab">
            <span class="tab-dot"></span>
            {{ currentFileName }}
            <span style="margin-left: auto; color: var(--muted)">×</span>
          </div>
        </div>

        <div class="toolbar">
          <button class="primary" @click="runScanner">▶ 开始分析</button>
          <button @click="triggerFileInput">打开文件</button>
          <button @click="loadSample">载入样例</button>
          <button @click="clearAll">清空</button>
          <button @click="copyTokens">复制 token.txt</button>
          <button @click="downloadTokens">下载 token.txt</button>
          <button @click="toggleTheme">
            {{ theme === 'dark' ? '切换白色模式' : '切换黑色模式' }}
          </button>
          <input
            ref="fileInputRef"
            class="hidden-file"
            type="file"
            accept=".c,.cpp,.h,.hpp,.txt"
            @change="handleFileChange"
          />
        </div>

        <div class="editor-wrap">
          <pre ref="lineNoRef" class="line-numbers">{{ lineNumbers }}</pre>
          <div class="code-box">
            <pre ref="highlightRef" class="highlight" v-html="highlightHtml"></pre>
            <textarea
              ref="sourceRef"
              v-model="source"
              class="source"
              spellcheck="false"
              @scroll="syncScroll"
              @keydown.tab.prevent="insertTab"
            ></textarea>
          </div>
        </div>
      </section>

      <div class="resize-bar" title="拖拽调整下方终端区域高度" @mousedown="startResize">
        <span></span>
      </div>

      <section class="bottom">
        <div class="panel token-panel">
          <div class="panel-title">
            <span>Token Stream</span>
            <span>{{ tokens.length }} tokens｜点击一行查看 DFA</span>
          </div>

          <div class="token-content">
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Type</th>
                    <th>Lexeme</th>
                    <th>Line</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(token, index) in tokens"
                    :key="index"
                    :class="{ active: selectedIndex === index }"
                    @click="selectToken(index)"
                  >
                    <td>{{ index + 1 }}</td>
                    <td>
                      <span :class="['badge', badgeTypeClass(token.type)]">
                        {{ token.type }}
                      </span>
                    </td>
                    <td>{{ token.lexeme }}</td>
                    <td>{{ token.line }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <transition name="slide-fade">
              <div v-if="graphVisible && selectedToken" class="dfa-card">
                <div class="dfa-head">
                  <div>
                    <strong>DFA 转移图</strong>
                    <span>({{ selectedToken.type }}, {{ selectedToken.lexeme }})</span>
                  </div>
                  <div class="dfa-actions">
                    <button @click.stop="downloadGraphSvg">下载 SVG</button>
                    <button @click.stop="downloadDot">下载 DOT</button>
                    <button class="icon-btn" @click.stop="closeGraph">×</button>
                  </div>
                </div>

                <div class="states">
                  <template v-for="(state, index) in dfaPath" :key="index">
                    <span class="state">{{ state }}</span>
                    <span v-if="index < dfaPath.length - 1" class="arrow">→</span>
                  </template>
                </div>

                <svg
                  ref="dfaSvgRef"
                  class="dfa-svg"
                  :viewBox="svgViewBox"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <defs>
                    <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
                      <path d="M0,0 L0,6 L9,3 z" fill="gray"></path>
                    </marker>
                  </defs>

                  <text x="12" y="20" fill="var(--muted)" font-size="12">DFA Graph</text>

                  <g v-for="(edge, index) in graph.edges" :key="'edge' + index">
                    <template v-if="edge.from === edge.to">
                      <path
                        :d="loopPath(edge.from)"
                        stroke="var(--muted)"
                        stroke-width="2"
                        fill="none"
                        marker-end="url(#arrow)"
                      />
                      <text
                        :x="nodePos(edge.from).x"
                        :y="nodePos(edge.from).y - 62"
                        text-anchor="middle"
                        fill="var(--text)"
                        font-size="11"
                      >
                        {{ edge.label }}
                      </text>
                    </template>

                    <template v-else>
                      <line
                        :x1="nodePos(edge.from).x + 26"
                        :y1="nodePos(edge.from).y"
                        :x2="nodePos(edge.to).x - 26"
                        :y2="nodePos(edge.to).y"
                        stroke="var(--muted)"
                        stroke-width="2"
                        marker-end="url(#arrow)"
                      />
                      <text
                        :x="(nodePos(edge.from).x + nodePos(edge.to).x) / 2"
                        :y="nodePos(edge.from).y - 14 - (index % 2) * 8"
                        text-anchor="middle"
                        fill="var(--text)"
                        font-size="11"
                      >
                        {{ edge.label }}
                      </text>
                    </template>
                  </g>

                  <g v-for="node in graph.nodes" :key="node">
                    <circle
                      :cx="nodePos(node).x"
                      :cy="nodePos(node).y"
                      r="26"
                      fill="var(--panel2)"
                      :stroke="nodeStroke(node)"
                      stroke-width="2"
                    />
                    <circle
                      v-if="node.startsWith('accept_')"
                      :cx="nodePos(node).x"
                      :cy="nodePos(node).y"
                      r="20"
                      fill="none"
                      :stroke="nodeStroke(node)"
                      stroke-width="2"
                    />
                    <text
                      :x="nodePos(node).x"
                      :y="nodePos(node).y + 4"
                      text-anchor="middle"
                      fill="var(--text)"
                      font-size="11"
                    >
                      {{ node }}
                    </text>
                  </g>
                </svg>

                <pre class="dot-text">{{ dotText }}</pre>
              </div>
            </transition>
          </div>
        </div>
      </section>
    </main>

    <footer class="status">
      <span>Vue + Vite</span>
      <span>{{ statusText }}</span>
    </footer>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { SAMPLE_CODE, escapeHtml, scan, tokenClass } from './scanner.js'
import { buildGraph, dfaPathForToken, makeDot } from './dfa.js'

const source = ref(SAMPLE_CODE)
const tokens = ref([])
const theme = ref('dark')
const selectedIndex = ref(-1)
const statusText = ref('Ready')
const currentFileName = ref('test.c')
const graphVisible = ref(false)

const bottomHeight = ref(330)
const resizeState = ref(null)

const sourceRef = ref(null)
const highlightRef = ref(null)
const lineNoRef = ref(null)
const fileInputRef = ref(null)
const dfaSvgRef = ref(null)

const mainStyle = computed(() => ({
  '--bottom-height': `${bottomHeight.value}px`,
}))

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

const lineNumbers = computed(() =>
  Array.from({ length: source.value.split('\n').length }, (_, index) => index + 1).join('\n')
)

const outputText = computed(() =>
  tokens.value.map((token) => `(${token.type}, ${token.lexeme})`).join('')
)


const selectedToken = computed(() => {
  if (selectedIndex.value < 0) return null
  return tokens.value[selectedIndex.value] || null
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

const dfaPath = computed(() => dfaPathForToken(selectedToken.value))
const graph = computed(() => buildGraph(selectedToken.value))

const svgWidth = computed(() => Math.max(660, graph.value.nodes.length * 112))
const svgViewBox = computed(() => `0 0 ${svgWidth.value} 160`)

const dotText = computed(() => makeDot(graph.value))

function runScanner() {
  tokens.value = scan(source.value)
  selectedIndex.value = -1
  graphVisible.value = false
  statusText.value = `分析完成：${tokens.value.length} tokens`
}

function loadSample() {
  source.value = SAMPLE_CODE
  currentFileName.value = 'test.c'
  runScanner()
}

function clearAll() {
  source.value = ''
  tokens.value = []
  selectedIndex.value = -1
  graphVisible.value = false
  statusText.value = 'Cleared'
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
  statusText.value = `已加载文件：${file.name}`
  event.target.value = ''
}

function selectToken(index) {
  selectedIndex.value = index
  graphVisible.value = true
}

function closeGraph() {
  graphVisible.value = false
}

function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
}

function syncScroll() {
  if (!sourceRef.value || !highlightRef.value || !lineNoRef.value) return

  highlightRef.value.scrollTop = sourceRef.value.scrollTop
  highlightRef.value.scrollLeft = sourceRef.value.scrollLeft
  lineNoRef.value.scrollTop = sourceRef.value.scrollTop
}

function insertTab(event) {
  const textarea = event.target
  const start = textarea.selectionStart
  const end = textarea.selectionEnd

  source.value = `${source.value.slice(0, start)}    ${source.value.slice(end)}`

  nextTick(() => {
    textarea.selectionStart = start + 4
    textarea.selectionEnd = start + 4
  })
}

async function copyTokens() {
  if (!tokens.value.length) {
    runScanner()
  }

  try {
    await navigator.clipboard.writeText(outputText.value)
    statusText.value = 'token.txt 内容已复制'
  } catch {
    statusText.value = '复制失败，请手动复制'
  }
}

function downloadFile(content, filename, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type })
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
  if (!tokens.value.length) {
    runScanner()
  }

  downloadFile(outputText.value, 'token.txt')
  statusText.value = 'token.txt 已下载'
}

function downloadDot() {
  if (!dotText.value) return
  downloadFile(dotText.value, 'dfa_graph.dot', 'text/vnd.graphviz;charset=utf-8')
  statusText.value = 'dfa_graph.dot 已下载'
}

function downloadGraphSvg() {
  if (!dfaSvgRef.value || !selectedToken.value) return

  const clone = dfaSvgRef.value.cloneNode(true)
  const vars = getSvgCssVariables()
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(svgWidth.value))
  clone.setAttribute('height', '160')
  clone.setAttribute('style', vars)

  const content = `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`
  downloadFile(content, `dfa_${selectedToken.value.type}_${selectedToken.value.lexeme.replace(/[^A-Za-z0-9_]/g, '_')}.svg`, 'image/svg+xml;charset=utf-8')
  statusText.value = 'DFA 转移图 SVG 已下载'
}

function getSvgCssVariables() {
  const dark = {
    '--muted': '#9aa5b1',
    '--text': '#d4d4d4',
    '--panel2': '#1f2937',
    '--accent': '#3b82f6',
    '--err': '#f87171',
  }
  const light = {
    '--muted': '#64748b',
    '--text': '#1e293b',
    '--panel2': '#f8fafc',
    '--accent': '#2563eb',
    '--err': '#dc2626',
  }
  const selected = theme.value === 'dark' ? dark : light
  return Object.entries(selected).map(([key, value]) => `${key}:${value}`).join(';')
}

function startResize(event) {
  resizeState.value = {
    startY: event.clientY,
    startHeight: bottomHeight.value,
  }
  document.body.classList.add('resizing')
  window.addEventListener('mousemove', resizeBottom)
  window.addEventListener('mouseup', stopResize)
}

function resizeBottom(event) {
  if (!resizeState.value) return

  const delta = resizeState.value.startY - event.clientY
  const nextHeight = resizeState.value.startHeight + delta
  const maxHeight = Math.max(260, window.innerHeight - 260)
  bottomHeight.value = Math.min(Math.max(nextHeight, 220), maxHeight)
}

function stopResize() {
  resizeState.value = null
  document.body.classList.remove('resizing')
  window.removeEventListener('mousemove', resizeBottom)
  window.removeEventListener('mouseup', stopResize)
}

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', resizeBottom)
  window.removeEventListener('mouseup', stopResize)
})

function nodePos(node) {
  const nodes = graph.value.nodes
  const index = nodes.indexOf(node)
  const gap = svgWidth.value / (nodes.length + 1)

  return {
    x: gap * (index + 1),
    y: 88,
  }
}

function nodeStroke(node) {
  if (node === 'dead') return 'var(--err)'
  if (node.startsWith('accept_')) return '#22c55e'
  return 'var(--accent)'
}

function loopPath(node) {
  const position = nodePos(node)
  return `M ${position.x - 20} ${position.y - 22} C ${position.x - 62} ${position.y - 72}, ${
    position.x + 62
  } ${position.y - 72}, ${position.x + 20} ${position.y - 22}`
}

runScanner()
</script>
