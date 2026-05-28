#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { analyzeSource, makeLab6TerminalReport } from './lab-terminal-core.mjs'

function usage() {
  console.log(`实验六终端版：中间代码生成

模式一：批量遍历示例代码库并输出结果文件
  node scripts/lab6-cli.mjs --batch <示例代码目录> --out-dir <输出目录>

模式二：选择单个文件并直接在终端显示
  node scripts/lab6-cli.mjs --input <源程序txt/src文件>

也可以把单文件结果写入文件：
  node scripts/lab6-cli.mjs --input <源程序txt/src文件> --out <输出报告txt>

示例：
  node scripts/lab6-cli.mjs --batch ../example --out-dir ../lab6-output
  node scripts/lab6-cli.mjs --input ../example/19.src
  node scripts/lab6-cli.mjs --input ./test.txt --out ./lab6-result.txt

输出内容：
  1. 四元式中间代码
  2. 符号表
  3. 错误报告
`)
}

function getArg(name, shortName = '') {
  const args = process.argv.slice(2)
  let index = args.indexOf(name)
  if (index < 0 && shortName) index = args.indexOf(shortName)
  return index >= 0 ? args[index + 1] : ''
}

function resolvePath(input, mustExist = true) {
  if (!input) return ''
  const candidates = [
    path.resolve(process.cwd(), input),
    path.resolve(process.cwd(), '..', input),
    path.resolve(process.cwd(), '..', '..', input),
  ]
  const found = candidates.find((candidate) => fs.existsSync(candidate))
  if (found || mustExist) return found || ''
  return path.resolve(process.cwd(), input)
}

function listSourceFiles(dir) {
  const result = []
  const walk = (current) => {
    for (const item of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, item.name)
      if (item.isDirectory()) walk(full)
      else if (/\.(src|txt|cmm|c|cpp)$/i.test(item.name)) result.push(full)
    }
  }
  walk(dir)
  return result.sort((a, b) => a.localeCompare(b, 'zh-Hans-CN', { numeric: true }))
}

function runtimeErrorReport(file, err) {
  return [
    '实验六：中间代码生成',
    '='.repeat(72),
    `输入文件：${file}`,
    '',
    '【中间代码：四元式】',
    '空',
    '',
    '【符号表】',
    '空',
    '',
    '【错误报告】',
    `1. [runtime] ${err?.stack || err?.message || String(err)}`,
  ].join('\n')
}

function analyzeFile(file) {
  const source = fs.readFileSync(file, 'utf8')
  const result = analyzeSource(source)
  return { report: makeLab6TerminalReport(result, file), errors: result.stats.errors, quads: result.stats.quads, crashed: false }
}

const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h')) {
  usage()
  process.exit(0)
}

const batchDirArg = getArg('--batch', '-b')
const inputArg = getArg('--input', '-i')

if (batchDirArg) {
  const batchDir = resolvePath(batchDirArg)
  if (!batchDir || !fs.statSync(batchDir).isDirectory()) {
    console.error(`找不到示例代码目录：${batchDirArg}`)
    process.exit(1)
  }
  const outDirArg = getArg('--out-dir', '-d') || 'lab6-output'
  const outDir = resolvePath(outDirArg, false)
  fs.mkdirSync(outDir, { recursive: true })
  const files = listSourceFiles(batchDir)
  if (!files.length) {
    console.error(`目录中没有找到 .src/.txt/.cmm/.c/.cpp 文件：${batchDir}`)
    process.exit(1)
  }
  console.log(`实验六批量模式：共发现 ${files.length} 个源程序文件`)
  const summary = []
  for (const file of files) {
    const base = path.basename(file).replace(/\.[^.]+$/, '')
    const outputFile = path.join(outDir, `${base}.lab6.txt`)
    try {
      const item = analyzeFile(file)
      fs.writeFileSync(outputFile, item.report, 'utf8')
      summary.push({ file, outputFile, errors: item.errors, quads: item.quads, crashed: false })
      console.log(`[OK] ${path.relative(process.cwd(), file)} -> ${path.relative(process.cwd(), outputFile)}  四元式:${item.quads} 错误:${item.errors}`)
    } catch (err) {
      fs.writeFileSync(outputFile, runtimeErrorReport(file, err), 'utf8')
      summary.push({ file, outputFile, errors: 1, quads: 0, crashed: true })
      console.log(`[ERR] ${path.relative(process.cwd(), file)} -> ${path.relative(process.cwd(), outputFile)}  运行时错误: ${err?.message || String(err)}`)
    }
  }
  const summaryText = [
    '实验六批量分析汇总',
    '='.repeat(72),
    `输入目录：${batchDir}`,
    `输出目录：${outDir}`,
    `文件数量：${files.length}`,
    `运行时异常文件数：${summary.filter((item) => item.crashed).length}`,
    '',
    ...summary.map((item, index) => `${index + 1}. ${item.file}\n   输出：${item.outputFile}\n   四元式：${item.quads}，错误：${item.errors}${item.crashed ? '，状态：运行时异常' : ''}`),
  ].join('\n')
  fs.writeFileSync(path.join(outDir, 'summary.txt'), summaryText, 'utf8')
  console.log(`汇总文件：${path.relative(process.cwd(), path.join(outDir, 'summary.txt'))}`)
  process.exit(0)
}

if (inputArg) {
  const inputPath = resolvePath(inputArg)
  if (!inputPath) {
    console.error(`找不到输入文件：${inputArg}`)
    process.exit(1)
  }
  try {
    const item = analyzeFile(inputPath)
    const out = getArg('--out', '-o')
    if (out) {
      fs.writeFileSync(path.resolve(process.cwd(), out), item.report, 'utf8')
      console.log(`实验六分析结果已写入：${out}`)
    } else {
      console.log(item.report)
    }
  } catch (err) {
    console.error(runtimeErrorReport(inputPath, err))
    process.exit(2)
  }
  process.exit(0)
}

usage()
process.exit(1)
