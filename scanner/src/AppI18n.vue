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
        <strong>{{ activeTool === 'scanner' ? t.scannerTitle : t.lr0Title }}</strong>
      </div>
      <span class="theme-name">{{ theme === 'dark' ? t.dark : t.light }}</span>
    </div>

    <aside class="sidebar">
      <h3>{{ t.tools }}</h3>
      <div class="project-title">{{ t.codeAnalysis }}</div>
      <button :class="['tool-item', { active: activeTool === 'scanner' }]" @click="activeTool = 'scanner'">
        <span>S</span>
        <div><strong>{{ t.scannerTitle }}</strong><small>{{ t.scannerDesc }}</small></div>
      </button>
      <button :class="['tool-item', { active: activeTool === 'lr0' }]" @click="activeTool = 'lr0'">
        <span>G</span>
        <div><strong>{{ t.lr0Title }}</strong><small>{{ t.lr0Desc }}</small></div>
      </button>
    </aside>

    <main v-if="activeTool === 'scanner'" class="main" :style="mainStyle">
      <section class="editor-area">
        <div class="tabs"><div class="tab"><span class="tab-dot"></span>{{ currentFileName }}<span style="margin-left:auto;color:var(--muted)">×</span></div></div>
        <div class="toolbar">
          <button class="primary" @click="runScanner">▶ {{ t.startScan }}</button>
          <button @click="triggerFileInput">{{ t.openFile }}</button>
          <button @click="loadSample">{{ t.loadSample }}</button>
          <button @click="clearAll">{{ t.clear }}</button>
          <button @click="copyTokens">{{ t.copyTokens }}</button>
          <button @click="downloadTokens">{{ t.downloadTokens }}</button>
          <button @click="toggleLang">{{ lang === 'zh' ? 'English' : '中文' }}</button>
          <button @click="toggleTheme">{{ theme === 'dark' ? t.lightMode : t.darkMode }}</button>
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

      <div class="resize-bar" :title="t.dragResize" @mousedown="startResize"><span></span></div>

      <section class="bottom">
        <div class="panel token-panel">
          <div class="panel-title"><span>{{ t.tokenStream }}</span><span>{{ tokens.length }} {{ t.tokenCountHint }}</span></div>
          <div class="token-content">
            <div class="table-wrap">
              <table>
                <thead><tr><th>#</th><th>{{ t.type }}</th><th>{{ t.lexeme }}</th><th>{{ t.line }}</th></tr></thead>
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
                  <div><strong>{{ t.dfaGraph }}</strong><span>({{ selectedToken.type }}, {{ selectedToken.lexeme }})</span></div>
                  <div class="dfa-actions">
                    <button @click.stop="downloadGraphSvg">{{ t.downloadSvg }}</button>
                    <button @click.stop="downloadDot">{{ t.downloadDot }}</button>
                    <button class="icon-btn" @click.stop="closeGraph">×</button>
                  </div>
                </div>
                <div class="states">
                  <template v-for="(state, index) in dfaPath" :key="index"><span class="state">{{ state }}</span><span v-if="index < dfaPath.length - 1" class="arrow">→</span></template>
                </div>
                <svg ref="dfaSvgRef" class="dfa-svg" :viewBox="svgViewBox" xmlns="http://www.w3.org/2000/svg">
                  <defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="gray"></path></marker></defs>
                  <text x="12" y="20" fill="var(--muted)" font-size="12">{{ t.dfaGraph }}</text>
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
          <button class="primary" @click="buildGrammar">▶ {{ t.buildAutomaton }}</button>
          <select v-model="selectedGrammarSample" @change="applyGrammarSample">
            <option v-for="sample in grammarSamples" :key="sample.id" :value="sample.id">{{ sample.name[lang] }}</option>
          </select>
          <button @click="loadGrammarSample">{{ t.loadSample }}</button>
          <button @click="downloadLR0Report">{{ t.exportReport }}</button>
          <button @click="clearGrammar">{{ t.clear }}</button>
          <button @click="toggleLang">{{ lang === 'zh' ? 'English' : '中文' }}</button>
          <button @click="toggleTheme">{{ theme === 'dark' ? t.lightMode : t.darkMode }}</button>
        </div>

        <div class="lr0-workspace">
          <section class="grammar-card">
            <div class="panel-title"><span>{{ t.grammarInput }}</span><span>{{ t.alternativesHint }}</span></div>
            <textarea v-model="grammarSource" class="grammar-input" spellcheck="false" @keydown.tab.prevent="insertGrammarTab"></textarea>
            <div class="input-hint">{{ t.grammarHint }}</div>
          </section>

          <section class="lr0-result">
            <div v-if="lr0Result.errors.length" class="error-box">
              <strong>{{ t.inputError }}</strong>
              <p v-for="error in lr0Result.errors" :key="error">{{ error }}</p>
            </div>

            <template v-else>
              <div class="summary-grid compact-summary">
                <div class="summary-card"><span>{{ t.productions }}</span><strong>{{ lr0Result.productions.length }}</strong></div>
                <div class="summary-card"><span>{{ t.states }}</span><strong>{{ lr0Result.states.length }}</strong></div>
                <div :class="['summary-card', lr0Result.isLR0 ? 'ok' : 'warn']"><span>{{ t.lr0Check }}</span><strong>{{ lr0Result.isLR0 ? t.passed : t.conflict }}</strong></div>
              </div>

              <div class="view-switch">
                <button :class="{ active: activeLR0Panel === 'overview' }" @click="activeLR0Panel = 'overview'">{{ t.overview }}</button>
                <button :class="{ active: activeLR0Panel === 'graph' }" @click="activeLR0Panel = 'graph'">{{ t.graph }}</button>
                <button :class="{ active: activeLR0Panel === 'details' }" @click="activeLR0Panel = 'details'">{{ t.details }}</button>
              </div>

              <div v-if="activeLR0Panel === 'overview'" class="lr0-panel-space">
                <div class="section-card">
                  <div class="section-head"><h3>{{ t.augmentedGrammar }}</h3><span>{{ lr0Result.augmentedStart }} -> {{ lr0Result.startSymbol }}</span></div>
                  <div class="production-list"><div v-for="production in lr0Result.productions" :key="production.index" class="production-row"><span>({{ production.index }})</span><code>{{ production.text }}</code></div></div>
                </div>

                <div class="section-card">
                  <div class="section-head"><h3>{{ t.conflictCheck }}</h3><span>{{ lr0Summary }}</span></div>
                  <div v-if="conflictExplanations.length" class="conflict-list">
                    <div v-for="conflict in conflictExplanations" :key="conflict.stateId" class="conflict-row conflict-detail">
                      <div class="conflict-title">
                        <strong>I{{ conflict.stateId }}</strong>
                        <span v-if="conflict.shiftReduce" class="conflict-pill sr">{{ t.srConflict }}</span>
                        <span v-if="conflict.reduceReduce" class="conflict-pill rr">{{ t.rrConflict }}</span>
                        <span v-if="conflict.shiftSymbols.length" class="shift-on">{{ t.shiftOn }}：{{ conflict.shiftSymbols.join(', ') }}</span>
                      </div>
                      <p>{{ conflict.reason }}</p>
                      <div v-if="conflict.reduceItems.length" class="explain-block"><b>{{ t.reduceItems }}</b><code v-for="item in conflict.reduceItems" :key="item">{{ item }}</code></div>
                      <div v-if="conflict.shiftItems.length" class="explain-block"><b>{{ t.shiftItems }}</b><code v-for="item in conflict.shiftItems" :key="item">{{ item }}</code></div>
                    </div>
                  </div>
                  <div v-else class="ok-text">{{ t.noConflict }}</div>
                </div>
              </div>

              <div v-else-if="activeLR0Panel === 'graph'" class="section-card graph-card full-graph-card">
                <div class="section-head graph-head">
                  <div><h3>{{ t.itemSetGraph }}</h3><span>{{ t.graphHint }}</span></div>
                  <div class="graph-actions">
                    <button @click="downloadLR0Svg">{{ t.downloadSvg }}</button>
                    <button @click="downloadLR0Png">{{ t.downloadPng }}</button>
                    <button @click="downloadLR0Dot">{{ t.downloadDot }}</button>
                    <button @click="showLR0Dot = true">{{ t.viewDot }}</button>
                  </div>
                </div>
                <div class="graphviz-wrap">
                  <div v-if="graphvizError" class="error-box"><strong>{{ t.graphFail }}</strong><p>{{ graphvizError }}</p></div>
                  <div v-else-if="!lr0SvgMarkup" class="graph-loading">{{ t.renderingGraph }}</div>
                  <div v-else class="graphviz-output" v-html="lr0SvgMarkup"></div>
                </div>
              </div>

              <div v-else class="lr0-details-grid lr0-panel-space">
                <div class="section-card details-card">
                  <div class="section-head"><h3>{{ t.itemSets }}</h3><span>{{ t.closureResult }}</span></div>
                  <div class="state-list detail-scroll">
                    <div v-for="state in lr0Result.states" :key="state.id" class="state-card">
                      <div class="state-title"><strong>I{{ state.id }}</strong><span v-if="conflictForState(state.id).shiftReduce" class="mini-conflict sr">SR</span><span v-if="conflictForState(state.id).reduceReduce" class="mini-conflict rr">RR</span></div>
                      <code v-for="item in state.items" :key="item.text">{{ item.text }}</code>
                    </div>
                  </div>
                </div>

                <div class="section-card details-card">
                  <div class="section-head"><h3>{{ t.gotoTransitions }}</h3><span>{{ lr0Result.transitions.length }} {{ t.edges }}</span></div>
                  <div class="table-wrap goto-table detail-scroll">
                    <table><thead><tr><th>{{ t.from }}</th><th>{{ t.symbol }}</th><th>{{ t.to }}</th></tr></thead><tbody><tr v-for="(edge, index) in lr0Result.transitions" :key="index"><td>I{{ edge.from }}</td><td>{{ edge.symbol }}</td><td>I{{ edge.to }}</td></tr></tbody></table>
                  </div>
                </div>
              </div>
            </template>
          </section>
        </div>
      </section>
    </main>

    <div v-if="showLR0Dot" class="modal-mask" @click.self="showLR0Dot = false">
      <div class="dot-modal"><div class="modal-head"><strong>{{ t.dotSource }}</strong><button class="icon-btn" @click="showLR0Dot = false">×</button></div><pre class="dot-text modal-dot">{{ lr0DotText }}</pre></div>
    </div>

    <footer class="status"><span>Vue + Vite</span><span>{{ statusText }}</span></footer>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Viz from 'viz.js'
import { Module, render } from 'viz.js/full.render.js'
import { SAMPLE_CODE, escapeHtml, scan, tokenClass } from './scanner.js'
import { buildGraph, dfaPathForToken, makeDot } from './dfa.js'
import { SAMPLE_GRAMMAR, buildLR0 } from './lr0.js'

const i18n = {
  zh: {
    scannerTitle: '词法扫描器', lr0Title: 'LR(0) 项目集构造器', dark: '深色', light: '浅色', tools: '功能', codeAnalysis: '代码分析工具', scannerDesc: '将源代码转换为 token 序列', lr0Desc: '生成项目集、转移图和冲突结果',
    startScan: '开始扫描', openFile: '打开文件', loadSample: '载入示例', clear: '清空', copyTokens: '复制 token.txt', downloadTokens: '下载 token.txt', lightMode: '浅色模式', darkMode: '深色模式', dragResize: '拖动调整大小', tokenStream: 'Token 序列', tokenCountHint: '个 token | 点击某一行查看 DFA', type: '类型', lexeme: '词素', line: '行号', dfaGraph: 'DFA 转移图',
    buildAutomaton: '构造自动机', exportReport: '导出报告', grammarInput: '文法输入', alternativesHint: '使用 | 表示多个候选式', grammarHint: '示例：E -> E + T | T。建议在文法符号之间加入空格，便于识别。', inputError: '输入错误', productions: '产生式数量', states: '状态数量', lr0Check: 'LR(0) 检测', passed: '通过', conflict: '存在冲突', overview: '概览', graph: '转移图', details: '项目集与 GOTO', augmentedGrammar: '增广文法', conflictCheck: '冲突检测', srConflict: '移进-归约冲突', rrConflict: '归约-归约冲突', shiftOn: '移进符号', reduceItems: '归约项目', shiftItems: '移进项目', noConflict: '未发现移进-归约冲突或归约-归约冲突。', isLR0: '未发现冲突，该文法是 LR(0) 文法。', notLR0: '发现冲突，该文法不是 LR(0) 文法。', itemSetGraph: 'LR(0) 项目集转移图', graphHint: '使用 Graphviz DOT 布局渲染。', graphFail: '图形渲染失败', renderingGraph: '正在生成转移图...', itemSets: '项目集', closureResult: '每个状态的 Closure 结果', gotoTransitions: 'GOTO 转移', edges: '条边', from: '起点', symbol: '符号', to: '终点', dotSource: 'DOT 源码', viewDot: '查看 DOT', downloadSvg: '下载 SVG', downloadPng: '下载 PNG', downloadDot: '下载 DOT', reportTitle: 'LR(0) 分析报告', inputGrammar: '输入文法', summary: '概要', result: '检测结果', conflictExplanation: '冲突解释', reason: '原因'
  },
  en: {
    scannerTitle: 'Lexical Scanner', lr0Title: 'LR(0) Builder', dark: 'Dark', light: 'Light', tools: 'TOOLS', codeAnalysis: 'CODE ANALYSIS', scannerDesc: 'Tokenize source code', lr0Desc: 'Build item sets, graph and conflict result',
    startScan: 'Start Scan', openFile: 'Open File', loadSample: 'Load Sample', clear: 'Clear', copyTokens: 'Copy token.txt', downloadTokens: 'Download token.txt', lightMode: 'Light Mode', darkMode: 'Dark Mode', dragResize: 'Drag to resize', tokenStream: 'Token Stream', tokenCountHint: 'tokens | Click a row to view DFA', type: 'Type', lexeme: 'Lexeme', line: 'Line', dfaGraph: 'DFA Transition Graph',
    buildAutomaton: 'Build Automaton', exportReport: 'Export Report', grammarInput: 'Grammar Input', alternativesHint: 'Use | for alternatives', grammarHint: 'Example: E -> E + T | T. Use spaces between grammar symbols for clearer results.', inputError: 'Input Error', productions: 'Productions', states: 'States', lr0Check: 'LR(0) Check', passed: 'Passed', conflict: 'Conflict', overview: 'Overview', graph: 'Graph', details: 'Item Sets & GOTO', augmentedGrammar: 'Augmented Grammar', conflictCheck: 'Conflict Check', srConflict: 'Shift-Reduce Conflict', rrConflict: 'Reduce-Reduce Conflict', shiftOn: 'Shift on', reduceItems: 'Reduce item(s)', shiftItems: 'Shift item(s)', noConflict: 'No shift-reduce or reduce-reduce conflict was found.', isLR0: 'No conflict found. This grammar is LR(0).', notLR0: 'Conflict found. This grammar is not LR(0).', itemSetGraph: 'LR(0) Item Set Graph', graphHint: 'Rendered by Graphviz DOT layout.', graphFail: 'Graph rendering failed', renderingGraph: 'Rendering graph...', itemSets: 'Item Sets', closureResult: 'Closure result for each state', gotoTransitions: 'GOTO Transitions', edges: 'edges', from: 'From', symbol: 'Symbol', to: 'To', dotSource: 'DOT Source', viewDot: 'View DOT', downloadSvg: 'Download SVG', downloadPng: 'Download PNG', downloadDot: 'Download DOT', reportTitle: 'LR(0) Analysis Report', inputGrammar: 'Input Grammar', summary: 'Summary', result: 'Result', conflictExplanation: 'Conflict Explanation', reason: 'Reason'
  }
}

const grammarSamples = [
  { id: 'expression', name: { zh: '表达式文法（移进-归约冲突）', en: 'Expression grammar (SR conflict)' }, grammar: SAMPLE_GRAMMAR },
  { id: 'simple-lr0', name: { zh: '简单 LR(0) 文法', en: 'Simple LR(0) grammar' }, grammar: `S -> A\nA -> a A | b` },
  { id: 'rr-conflict', name: { zh: '归约-归约冲突示例', en: 'Reduce-reduce conflict sample' }, grammar: `S -> A | B\nA -> a\nB -> a` },
  { id: 'parentheses', name: { zh: '括号文法示例', en: 'Parentheses grammar' }, grammar: `S -> ( S ) S | epsilon` },
]

const viz = new Viz({ Module, render })
const activeTool = ref('scanner')
const activeLR0Panel = ref('overview')
const showLR0Dot = ref(false)
const selectedGrammarSample = ref('expression')
const lang = ref(localStorage.getItem('app_lang') || 'zh')
const source = ref(SAMPLE_CODE)
const tokens = ref([])
const theme = ref('dark')
const selectedIndex = ref(-1)
const statusText = ref('就绪')
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
const lr0SvgMarkup = ref('')
const graphvizError = ref('')
const t = computed(() => i18n[lang.value])
const mainStyle = computed(() => ({ '--bottom-height': `${bottomHeight.value}px` }))
const scannedForHighlight = computed(() => scan(source.value))
const highlightHtml = computed(() => { const code = source.value; let html = ''; let last = 0; for (const token of scannedForHighlight.value) { html += escapeHtml(code.slice(last, token.start)); html += `<span class="${tokenClass(token.type)}">${escapeHtml(code.slice(token.start, token.end))}</span>`; last = token.end } html += escapeHtml(code.slice(last)); return html.endsWith('\n') ? `${html} ` : html })
const lineNumbers = computed(() => Array.from({ length: source.value.split('\n').length }, (_, index) => index + 1).join('\n'))
const outputText = computed(() => tokens.value.map((token) => `(${token.type}, ${token.lexeme})`).join(''))
const selectedToken = computed(() => (selectedIndex.value < 0 ? null : tokens.value[selectedIndex.value] || null))
const dfaPath = computed(() => dfaPathForToken(selectedToken.value))
const graph = computed(() => buildGraph(selectedToken.value))
const svgWidth = computed(() => Math.max(660, graph.value.nodes.length * 112))
const svgViewBox = computed(() => `0 0 ${svgWidth.value} 160`)
const dotText = computed(() => makeDot(graph.value))
const lr0Result = computed(() => buildLR0(grammarSource.value))
const conflictList = computed(() => lr0Result.value.conflicts.filter((c) => c.shiftReduce || c.reduceReduce))
const conflictExplanations = computed(() => conflictList.value.map(makeConflictExplanation))
const lr0DotText = computed(() => makeGraphvizDot(lr0Result.value, theme.value))
const lr0Summary = computed(() => lr0Result.value.isLR0 ? t.value.isLR0 : t.value.notLR0)
const lr0ReportText = computed(() => makeLR0Report())

function toggleLang() { lang.value = lang.value === 'zh' ? 'en' : 'zh'; localStorage.setItem('app_lang', lang.value); statusText.value = lang.value === 'zh' ? '已切换到中文' : 'Switched to English' }
function makeGraphvizDot(result, mode) { if (!result || result.errors?.length || !result.states?.length) return ''; const dark = mode === 'dark'; const graphBg = dark ? '#1e1e1e' : '#ffffff'; const nodeBg = dark ? '#252526' : '#ffffff'; const border = dark ? '#4b5563' : '#111827'; const text = dark ? '#d4d4d4' : '#111827'; const edge = dark ? '#a3a3a3' : '#111827'; const lines = ['digraph LR0_DFA {', '  rankdir=LR;', `  graph [bgcolor="${graphBg}", pad="0.35", nodesep="0.55", ranksep="0.85"];`, `  node [shape=box, style="rounded,filled", fontname="Consolas", fontsize=12, margin="0.12,0.08", color="${border}", fontcolor="${text}", fillcolor="${nodeBg}"];`, `  edge [fontname="Consolas", fontsize=12, color="${edge}", fontcolor="${text}", arrowsize=0.8];`]; for (const state of result.states) { const conflict = result.conflicts[state.id]; let fill = nodeBg; let color = border; let fontcolor = text; const label = [`I${state.id}`, ...state.items.map((item) => item.text)]; if (conflict.shiftReduce || conflict.reduceReduce) { fill = conflict.shiftReduce && conflict.reduceReduce ? '#f3e8ff' : conflict.shiftReduce ? '#fff7ad' : '#fee2e2'; color = conflict.shiftReduce && conflict.reduceReduce ? '#9333ea' : conflict.shiftReduce ? '#f59e0b' : '#ef4444'; fontcolor = '#111827'; if (conflict.shiftReduce) label.push('', lang.value === 'zh' ? '[移进-归约冲突]' : '[SR Conflict]', `${t.value.shiftOn}: ${conflict.shiftSymbols.join(', ')}`); if (conflict.reduceReduce) label.push('', lang.value === 'zh' ? '[归约-归约冲突]' : '[RR Conflict]') } lines.push(`  I${state.id} [label="${label.map(escapeDot).join('\\n')}", fillcolor="${fill}", color="${color}", fontcolor="${fontcolor}", penwidth=2];`) } for (const item of result.transitions) lines.push(`  I${item.from} -> I${item.to} [label="${escapeDot(item.symbol)}"];`); lines.push('}'); return lines.join('\n') }
function escapeDot(value) { return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"') }
function makeConflictExplanation(conflict) { const state = lr0Result.value.states[conflict.stateId]; const shiftItems = []; for (const item of state.items) { const production = lr0Result.value.productions[item.prod]; const next = production?.rhs?.[item.dot]; if (next && conflict.shiftSymbols.includes(next)) shiftItems.push(item.text) } const reason = lang.value === 'zh' ? conflictReasonZh(conflict) : conflictReasonEn(conflict); return { ...conflict, shiftItems, reason } }
function conflictReasonZh(conflict) { const parts = []; if (conflict.shiftReduce) parts.push(`该状态中存在已经完成的项目，因此可以执行归约；同时又存在圆点位于终结符 ${conflict.shiftSymbols.join('、')} 之前的项目，因此在同一 LR(0) 状态下也可以执行移进，二者发生冲突。`); if (conflict.reduceReduce) parts.push('该状态中存在多个已经完成的项目，因此分析器无法在没有向前看符号的情况下确定应该使用哪一条产生式进行归约。'); return parts.join(' ') }
function conflictReasonEn(conflict) { const parts = []; if (conflict.shiftReduce) parts.push(`The state contains completed item(s), so a reduce action is possible. It also contains item(s) with the dot before terminal ${conflict.shiftSymbols.join(', ')}, so a shift action is possible in the same LR(0) state.`); if (conflict.reduceReduce) parts.push('The state contains more than one completed item, so the parser cannot choose a unique reduce production without lookahead information.'); return parts.join(' ') }
function makeLR0Report() { const result = lr0Result.value; if (result.errors.length) return `# ${t.value.reportTitle}\n\n${t.value.inputError}:\n${result.errors.map((e) => `- ${e}`).join('\n')}\n`; const lines = [`# ${t.value.reportTitle}`, '', `## ${t.value.inputGrammar}`, '```text', grammarSource.value.trim(), '```', '', `## ${t.value.summary}`, '', `- ${t.value.productions}: ${result.productions.length}`, `- ${t.value.states}: ${result.states.length}`, `- ${t.value.result}: ${lr0Summary.value}`, '', `## ${t.value.augmentedGrammar}`, '']; result.productions.forEach((p) => lines.push(`- (${p.index}) ${p.text}`)); lines.push('', `## ${t.value.conflictExplanation}`, ''); if (!conflictExplanations.value.length) lines.push(t.value.noConflict); else for (const c of conflictExplanations.value) { lines.push(`### I${c.stateId}`); if (c.shiftReduce) lines.push(`- ${t.value.type}: ${t.value.srConflict}`); if (c.reduceReduce) lines.push(`- ${t.value.type}: ${t.value.rrConflict}`); if (c.shiftSymbols.length) lines.push(`- ${t.value.shiftOn}: ${c.shiftSymbols.join(', ')}`); lines.push(`- ${t.value.reason}: ${c.reason}`); if (c.reduceItems.length) lines.push(`- ${t.value.reduceItems}: ${c.reduceItems.join('; ')}`); if (c.shiftItems.length) lines.push(`- ${t.value.shiftItems}: ${c.shiftItems.join('; ')}`); lines.push('') } lines.push(`## ${t.value.itemSets}`, ''); result.states.forEach((state) => { lines.push(`### I${state.id}`); state.items.forEach((item) => lines.push(`- ${item.text}`)); lines.push('') }); lines.push(`## ${t.value.gotoTransitions}`, ''); result.transitions.forEach((edge) => lines.push(`- GOTO(I${edge.from}, ${edge.symbol}) = I${edge.to}`)); return lines.join('\n') }
async function renderLR0Graph() { if (!lr0DotText.value || activeTool.value !== 'lr0') return; graphvizError.value = ''; try { lr0SvgMarkup.value = await viz.renderString(lr0DotText.value) } catch (error) { graphvizError.value = error?.message || String(error); lr0SvgMarkup.value = '' } }
watch([lr0DotText, activeTool, activeLR0Panel, lang], () => renderLR0Graph(), { flush: 'post' })
onMounted(() => renderLR0Graph())
function badgeTypeClass(type) { if (['INT', 'FLOAT', 'VOID', 'IF', 'ELSE', 'WHILE', 'RETURN', 'INPUT', 'PRINT'].includes(type)) return 'kw'; if (type === 'ID') return 'id'; if (type === 'NUM') return 'num'; if (type === 'FLO') return 'flo'; if (['ADD', 'SUB', 'MUL', 'DIV'].includes(type)) return 'aop'; if (type === 'ROP') return 'rop'; if (type === 'BOP') return 'bop'; if (['ASG', 'AAS', 'AAA'].includes(type)) return 'asg'; if (['LPAR', 'RPAR', 'LBK', 'RBK', 'LBR', 'RBR', 'CMA', 'COL', 'SEMI', 'DOT'].includes(type)) return 'punc'; return 'err' }
function runScanner() { tokens.value = scan(source.value); selectedIndex.value = -1; graphVisible.value = false; statusText.value = lang.value === 'zh' ? `扫描完成：${tokens.value.length} 个 token` : `Scan complete: ${tokens.value.length} tokens` }
function loadSample() { source.value = SAMPLE_CODE; currentFileName.value = 'test.c'; runScanner() }
function clearAll() { source.value = ''; tokens.value = []; selectedIndex.value = -1; graphVisible.value = false; statusText.value = lang.value === 'zh' ? '已清空扫描器' : 'Scanner cleared' }
function triggerFileInput() { fileInputRef.value?.click() }
async function handleFileChange(event) { const file = event.target.files?.[0]; if (!file) return; source.value = await file.text(); currentFileName.value = file.name; runScanner(); statusText.value = lang.value === 'zh' ? `已载入文件：${file.name}` : `Loaded file: ${file.name}`; event.target.value = '' }
function selectToken(index) { selectedIndex.value = index; graphVisible.value = true }
function closeGraph() { graphVisible.value = false }
function toggleTheme() { theme.value = theme.value === 'dark' ? 'light' : 'dark' }
function syncScroll() { if (!sourceRef.value || !highlightRef.value || !lineNoRef.value) return; highlightRef.value.scrollTop = sourceRef.value.scrollTop; highlightRef.value.scrollLeft = sourceRef.value.scrollLeft; lineNoRef.value.scrollTop = sourceRef.value.scrollTop }
function insertTab(event) { const textarea = event.target; const start = textarea.selectionStart; const end = textarea.selectionEnd; source.value = `${source.value.slice(0, start)}    ${source.value.slice(end)}`; nextTick(() => { textarea.selectionStart = start + 4; textarea.selectionEnd = start + 4 }) }
function insertGrammarTab(event) { const textarea = event.target; const start = textarea.selectionStart; const end = textarea.selectionEnd; grammarSource.value = `${grammarSource.value.slice(0, start)}    ${grammarSource.value.slice(end)}`; nextTick(() => { textarea.selectionStart = start + 4; textarea.selectionEnd = start + 4 }) }
async function copyTokens() { if (!tokens.value.length) runScanner(); try { await navigator.clipboard.writeText(outputText.value); statusText.value = lang.value === 'zh' ? '已复制 token.txt 内容' : 'token.txt copied' } catch { statusText.value = lang.value === 'zh' ? '复制失败' : 'Copy failed' } }
function downloadFile(content, filename, type = 'text/plain;charset=utf-8') { const blob = new Blob([content], { type }); downloadBlob(blob, filename) }
function downloadBlob(blob, filename) { const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); document.body.removeChild(anchor); URL.revokeObjectURL(url) }
function downloadTokens() { if (!tokens.value.length) runScanner(); downloadFile(outputText.value, 'token.txt'); statusText.value = lang.value === 'zh' ? '已下载 token.txt' : 'token.txt downloaded' }
function downloadDot() { if (!dotText.value) return; downloadFile(dotText.value, 'dfa_graph.dot', 'text/vnd.graphviz;charset=utf-8'); statusText.value = lang.value === 'zh' ? '已下载 DFA DOT 文件' : 'DFA DOT downloaded' }
function downloadGraphSvg() { if (!dfaSvgRef.value || !selectedToken.value) return; const clone = dfaSvgRef.value.cloneNode(true); clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); clone.setAttribute('width', String(svgWidth.value)); clone.setAttribute('height', '160'); const content = `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`; downloadFile(content, `dfa_${selectedToken.value.type}.svg`, 'image/svg+xml;charset=utf-8'); statusText.value = lang.value === 'zh' ? '已下载 DFA SVG 图像' : 'DFA SVG downloaded' }
function buildGrammar() { const result = lr0Result.value; activeLR0Panel.value = 'graph'; renderLR0Graph(); statusText.value = result.errors.length ? (lang.value === 'zh' ? '文法输入存在错误' : 'Grammar input contains errors') : (lang.value === 'zh' ? `已生成 ${result.states.length} 个状态、${result.transitions.length} 条转移` : `Built ${result.states.length} states, ${result.transitions.length} transitions`) }
function applyGrammarSample() { const sample = grammarSamples.find((item) => item.id === selectedGrammarSample.value); if (!sample) return; grammarSource.value = sample.grammar; activeLR0Panel.value = 'overview'; buildGrammar(); statusText.value = lang.value === 'zh' ? `已载入：${sample.name.zh}` : `Loaded: ${sample.name.en}` }
function loadGrammarSample() { selectedGrammarSample.value = 'expression'; applyGrammarSample() }
function clearGrammar() { grammarSource.value = ''; lr0SvgMarkup.value = ''; statusText.value = lang.value === 'zh' ? '已清空文法输入' : 'Grammar cleared' }
function downloadLR0Dot() { if (!lr0DotText.value) return; downloadFile(lr0DotText.value, `lr0_graph_${theme.value}.dot`, 'text/vnd.graphviz;charset=utf-8'); statusText.value = lang.value === 'zh' ? '已下载 LR(0) DOT 文件' : 'LR(0) DOT downloaded' }
function downloadLR0Svg() { if (!lr0SvgMarkup.value) return; downloadFile(lr0SvgMarkup.value, `lr0_graph_${theme.value}.svg`, 'image/svg+xml;charset=utf-8'); statusText.value = lang.value === 'zh' ? '已下载 LR(0) SVG 图像' : 'LR(0) SVG downloaded' }
function downloadLR0Png() { if (!lr0SvgMarkup.value) return; const blob = new Blob([lr0SvgMarkup.value], { type: 'image/svg+xml;charset=utf-8' }); const url = URL.createObjectURL(blob); const image = new Image(); image.onload = () => { const scale = 2; const canvas = document.createElement('canvas'); canvas.width = image.width * scale; canvas.height = image.height * scale; const ctx = canvas.getContext('2d'); ctx.fillStyle = theme.value === 'dark' ? '#1e1e1e' : '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.setTransform(scale, 0, 0, scale, 0, 0); ctx.drawImage(image, 0, 0); canvas.toBlob((pngBlob) => { if (pngBlob) downloadBlob(pngBlob, `lr0_graph_${theme.value}.png`); URL.revokeObjectURL(url); statusText.value = lang.value === 'zh' ? '已下载 LR(0) PNG 图像' : 'LR(0) PNG downloaded' }, 'image/png') }; image.onerror = () => { URL.revokeObjectURL(url); statusText.value = lang.value === 'zh' ? 'PNG 导出失败' : 'PNG export failed' }; image.src = url }
function downloadLR0Report() { if (!lr0ReportText.value) return; downloadFile(lr0ReportText.value, lang.value === 'zh' ? 'lr0_分析报告.md' : 'lr0_analysis_report.md', 'text/markdown;charset=utf-8'); statusText.value = lang.value === 'zh' ? '已导出分析报告' : 'Analysis report downloaded' }
function startResize(event) { resizeState.value = { startY: event.clientY, startHeight: bottomHeight.value }; document.body.classList.add('resizing'); window.addEventListener('mousemove', resizeBottom); window.addEventListener('mouseup', stopResize) }
function resizeBottom(event) { if (!resizeState.value) return; const delta = resizeState.value.startY - event.clientY; const nextHeight = resizeState.value.startHeight + delta; const maxHeight = Math.max(260, window.innerHeight - 260); bottomHeight.value = Math.min(Math.max(nextHeight, 220), maxHeight) }
function stopResize() { resizeState.value = null; document.body.classList.remove('resizing'); window.removeEventListener('mousemove', resizeBottom); window.removeEventListener('mouseup', stopResize) }
onBeforeUnmount(() => { window.removeEventListener('mousemove', resizeBottom); window.removeEventListener('mouseup', stopResize) })
function nodePos(node) { const nodes = graph.value.nodes; const index = nodes.indexOf(node); const gap = svgWidth.value / (nodes.length + 1); return { x: gap * (index + 1), y: 88 } }
function nodeStroke(node) { if (node === 'dead') return 'var(--err)'; if (node.startsWith('accept_')) return '#22c55e'; return 'var(--accent)' }
function loopPath(node) { const position = nodePos(node); return `M ${position.x - 20} ${position.y - 22} C ${position.x - 62} ${position.y - 72}, ${position.x + 62} ${position.y - 72}, ${position.x + 20} ${position.y - 22}` }
function conflictForState(id) { return lr0Result.value.conflicts[id] || { shiftReduce: false, reduceReduce: false, shiftSymbols: [], reduceItems: [] } }
runScanner()
buildGrammar()
</script>
