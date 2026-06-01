#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { analyzeSource, astToText, makeTable, scanSource } from './lab-terminal-core.mjs'
import { DEFAULT_ACCEPTANCE_GRAMMAR, buildLR0, buildSLR1 } from './lr-slr-core.mjs'
import { allocateMemory, generateTargetCode, memoryStats } from './backend-core.mjs'

function usage() {
  console.log(`编译实验验收终端流水线：实验二到实验八

单文件模式：
  node scripts/acceptance-cli.mjs --input <源程序文件>

批量目录模式：
  node scripts/acceptance-cli.mjs --batch <example目录> --out-dir <输出目录>

可选：
  --grammar <文法文件>     使用自定义验收文法，默认使用内置主文法
  --compact              批量输出时减少 LR(0) 项目集规模

示例：
  cd scanner
  npm run accept -- --input ../example/30.src
  npm run accept -- --batch ../example --out-dir ../acceptance-output --compact
`)
}
function getArg(name, shortName = '') { const args = process.argv.slice(2); let i = args.indexOf(name); if (i < 0 && shortName) i = args.indexOf(shortName); return i >= 0 ? args[i + 1] : '' }
function hasArg(name) { return process.argv.slice(2).includes(name) }
function resolvePath(input, mustExist = true) {
  if (!input) return ''
  const candidates = [path.resolve(process.cwd(), input), path.resolve(process.cwd(), '..', input), path.resolve(process.cwd(), '..', '..', input)]
  const found = candidates.find((candidate) => fs.existsSync(candidate))
  if (found || mustExist) return found || ''
  return path.resolve(process.cwd(), input)
}
function listSourceFiles(dir) {
  const files = []
  const walk = (current) => {
    for (const item of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, item.name)
      if (item.isDirectory()) walk(full)
      else if (/\.(src|txt|cmm|c|cpp)$/i.test(item.name)) files.push(full)
    }
  }
  walk(dir)
  return files.sort((a, b) => a.localeCompare(b, 'zh-Hans-CN', { numeric: true }))
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
function section(title, body = '') { return [`\n${title}`, '='.repeat(72), body].join('\n') }
function renderTokens(tokens) { return makeTable(['#', 'type', 'lexeme', 'line'], tokens.map((t, i) => [i, t.type, t.lexeme, t.line || ''])) }
function renderLR0(lr0, compact = false) {
  if (lr0.errors.length) return `LR(0) 构造失败：\n${lr0.errors.map((e) => `- ${e}`).join('\n')}`
  const lines = [`增广开始符号：${lr0.augmentedStart} -> ${lr0.startSymbol}`, `产生式数量：${lr0.productions.length}`, `项目集状态数量：${lr0.states.length}`, `GOTO 转移数量：${lr0.transitions.length}`, `LR(0) 判定：${lr0.isLR0 ? '通过，无冲突' : '不通过，存在冲突'}`, '', '产生式编号：']
  lr0.productions.forEach((p) => lines.push(`(${p.index}) ${p.text}`))
  lines.push('', '项目集规范族：')
  const states = compact ? lr0.states.slice(0, 12) : lr0.states
  states.forEach((state) => { lines.push(`I${state.id}:`); state.items.forEach((item) => lines.push(`  ${item.text}`)); const conflict = lr0.conflicts[state.id]; if (conflict?.shiftReduce) lines.push(`  [移进-归约冲突] shift on: ${conflict.shiftSymbols.join(', ')}`); if (conflict?.reduceReduce) lines.push(`  [归约-归约冲突] ${conflict.reduceItems.join('; ')}`) })
  if (compact && lr0.states.length > states.length) lines.push(`... 已省略 ${lr0.states.length - states.length} 个状态，可单文件模式查看完整输出`)
  lines.push('', 'GOTO 转移：')
  const transitions = compact ? lr0.transitions.slice(0, 40) : lr0.transitions
  transitions.forEach((edge) => lines.push(`GOTO(I${edge.from}, ${edge.symbol}) = I${edge.to}`))
  if (compact && lr0.transitions.length > transitions.length) lines.push(`... 已省略 ${lr0.transitions.length - transitions.length} 条转移`)
  return lines.join('\n')
}
function renderSLR1(slr) {
  if (slr.errors.length) return `SLR(1) 构造失败：\n${slr.errors.map((e) => `- ${e}`).join('\n')}`
  const lines = [`ACTION 列数量：${slr.actionColumns.length}`, `GOTO 列数量：${slr.gotoColumns.length}`, `SLR(1) 冲突数量：${slr.conflicts.length}`, `SLR(1) 语法分析结果：${slr.parseAccepted ? 'ACCEPT' : 'ERROR'}`]
  if (slr.parseError) lines.push(`失败原因：${slr.parseError}`)
  lines.push('')
  if (slr.conflicts.length) { lines.push('冲突详情：'); slr.conflicts.forEach((c) => lines.push(`I${c.stateId}, ${c.symbol}: ${c.type} => ${c.actions.join(' / ')}`)); lines.push('') }
  lines.push('FOLLOW 集：')
  slr.followSets.forEach((set) => lines.push(`FOLLOW(${set.symbol}) = { ${set.values.join(', ')} }`))
  lines.push('', '说明：按要求已省略 ACTION/GOTO 表和 SLR(1) 逐步分析过程，仅保留验收判断摘要、冲突信息和 FOLLOW 集。')
  return lines.join('\n')
}
function renderSemantic(result) {
  return ['AST：', astToText(result.ast).trim() || '空', '', '符号表：', makeTable(['name', 'kind', 'type', 'scope', 'level', 'address', 'extra'], result.symbols.map((s) => [s.name, s.kind, s.type, s.scope, s.level, s.address, s.extra || ''])), '', '语义/语法/词法错误：', result.errors.length ? result.errors.map((e, i) => `${i + 1}. [${e.kind}] line ${e.line || '-'} ${e.lexeme ? `near "${e.lexeme}" ` : ''}${e.message}`).join('\n') : '无错误'].join('\n')
}
function renderIR(result) { return makeTable(['#', 'op', 'arg1', 'arg2', 'result'], result.quads.map((q) => [q.index, q.op, q.arg1, q.arg2, q.result])) }
function renderMemory(memory) {
  const stats = memoryStats(memory)
  return [`内存区域基址：DATA=${memory.bases.data}，CODE=${memory.bases.code}，TEMP=${memory.bases.temp}，CONST=${memory.bases.const}`, `分配统计：数据对象 ${stats.dataCount}，临时变量 ${stats.tempCount}，常量 ${stats.constCount}，代码指令 ${stats.codeCount}，标签 ${stats.labelCount}`, '', '数据段 DATA：', makeTable(['name', 'kind', 'type', 'scope', 'size', 'address'], memory.symbols.map((s) => [s.name, s.kind, s.type, s.scope, s.size, s.address])), '', '临时区 TEMP：', makeTable(['name', 'size', 'address'], memory.temporaries.map((t) => [t.name, t.size, t.address])), '', '常量池 CONST：', makeTable(['literal', 'size', 'address'], memory.constants.map((c) => [c.literal, c.size, c.address])), '', '代码段 CODE：', makeTable(['quad#', 'op', 'address'], memory.code.map((c) => [c.index, c.op, c.address])), '', '标签地址：', makeTable(['label', 'address'], memory.labels.map((l) => [l.label, l.address]))].join('\n')
}
function renderTargetCode(lines) { return lines.length ? lines.join('\n') : '空' }
function resultVerdict(semantic, slr) { const reasons = []; if (!slr.parseAccepted) reasons.push(`SLR(1) 语法分析未接受：${slr.parseError || '未知原因'}`); if (semantic.errors.length) reasons.push(...semantic.errors.map((e) => `[${e.kind}] line ${e.line || '-'} ${e.lexeme ? `near "${e.lexeme}" ` : ''}${e.message}`)); return { ok: reasons.length === 0, reasons } }
function analyzeOne(file, grammarText, options = {}) {
  const source = fs.readFileSync(file, 'utf8')
  const tokens = scanSource(source)
  const tokenTypes = normalizeForSlr(tokens)
  const lr0 = buildLR0(grammarText)
  const slr = buildSLR1(grammarText, tokenTypes)
  const semantic = analyzeSource(source)
  const memory = allocateMemory(semantic)
  const targetCode = generateTargetCode(semantic, memory)
  const verdict = resultVerdict(semantic, slr)
  const lines = ['编译实验验收流水线：实验二到实验八', '='.repeat(72), `输入文件：${file}`, `最终判断：${verdict.ok ? '通过，无错误' : '不通过，存在错误'}`]
  if (verdict.reasons.length) { lines.push('错误原因：'); verdict.reasons.forEach((r, i) => lines.push(`${i + 1}. ${r}`)) }
  lines.push(section('实验二：词法分析 Token 流', renderTokens(tokens)))
  lines.push(section('实验三：LR(0) 项目集规范族', renderLR0(lr0, options.compact)))
  lines.push(section('实验四：SLR(1) 摘要', renderSLR1(slr)))
  lines.push(section('实验五：语义分析 AST / 符号表 / 错误报告', renderSemantic(semantic)))
  lines.push(section('实验六：中间代码生成（四元式）', renderIR(semantic)))
  lines.push(section('实验七：内存地址分配 / 内存映像', renderMemory(memory)))
  lines.push(section('实验八：目标代码生成', renderTargetCode(targetCode)))
  return { report: lines.join('\n'), tokens, lr0, slr, semantic, memory, targetCode, verdict }
}
function runtimeReport(file, err) { return ['编译实验验收流水线：实验二到实验八', '='.repeat(72), `输入文件：${file}`, '最终判断：不通过，工具运行时异常', '', '错误原因：', err?.stack || err?.message || String(err)].join('\n') }

const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h')) { usage(); process.exit(0) }
const inputArg = getArg('--input', '-i')
const batchArg = getArg('--batch', '-b')
const grammarArg = getArg('--grammar', '-g')
const compact = hasArg('--compact')
let grammarText = DEFAULT_ACCEPTANCE_GRAMMAR
if (grammarArg) { const grammarPath = resolvePath(grammarArg); if (!grammarPath) { console.error(`找不到文法文件：${grammarArg}`); process.exit(1) } grammarText = fs.readFileSync(grammarPath, 'utf8') }
if (inputArg) {
  const file = resolvePath(inputArg)
  if (!file) { console.error(`找不到输入文件：${inputArg}`); process.exit(1) }
  try { const { report } = analyzeOne(file, grammarText, { compact: false }); console.log(report) } catch (err) { console.error(runtimeReport(file, err)); process.exit(2) }
  process.exit(0)
}
if (batchArg) {
  const dir = resolvePath(batchArg)
  if (!dir || !fs.statSync(dir).isDirectory()) { console.error(`找不到样例目录：${batchArg}`); process.exit(1) }
  const outDir = resolvePath(getArg('--out-dir', '-d') || 'acceptance-output', false)
  fs.mkdirSync(outDir, { recursive: true })
  const files = listSourceFiles(dir)
  console.log(`验收流水线批量模式：共发现 ${files.length} 个源程序文件`)
  const summary = []
  for (const file of files) {
    const outputFile = path.join(outDir, `${path.basename(file).replace(/\.[^.]+$/, '')}.acceptance.txt`)
    try { const item = analyzeOne(file, grammarText, { compact: true }); fs.writeFileSync(outputFile, item.report, 'utf8'); summary.push({ file, outputFile, ok: item.verdict.ok, errors: item.verdict.reasons.length, tokens: item.tokens.length, quads: item.semantic.stats.quads, target: item.targetCode.length }); console.log(`[${item.verdict.ok ? 'OK' : 'ERR'}] ${path.relative(process.cwd(), file)} -> ${path.relative(process.cwd(), outputFile)}  Token:${item.tokens.length} 四元式:${item.semantic.stats.quads} 目标指令:${item.targetCode.length} 原因数:${item.verdict.reasons.length}`) }
    catch (err) { fs.writeFileSync(outputFile, runtimeReport(file, err), 'utf8'); summary.push({ file, outputFile, ok: false, errors: 1, tokens: 0, quads: 0, target: 0, runtime: true }); console.log(`[CRASH] ${path.relative(process.cwd(), file)} -> ${path.relative(process.cwd(), outputFile)}  ${err?.message || String(err)}`) }
  }
  const summaryText = ['编译实验验收流水线批量汇总', '='.repeat(72), `输入目录：${dir}`, `输出目录：${outDir}`, `文件数量：${files.length}`, `通过数量：${summary.filter((i) => i.ok).length}`, `不通过数量：${summary.filter((i) => !i.ok).length}`, '', ...summary.map((item, i) => `${i + 1}. ${item.file}\n   输出：${item.outputFile}\n   判断：${item.ok ? '通过' : '不通过'}，Token：${item.tokens}，四元式：${item.quads}，目标指令：${item.target}，原因数：${item.errors}${item.runtime ? '，运行时异常' : ''}`)].join('\n')
  fs.writeFileSync(path.join(outDir, 'summary.txt'), summaryText, 'utf8')
  console.log(`汇总文件：${path.relative(process.cwd(), path.join(outDir, 'summary.txt'))}`)
  process.exit(0)
}
usage()
process.exit(1)
