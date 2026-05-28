#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { analyzeSource, makeLab5TerminalReport } from './lab-terminal-core.mjs'

function usage() {
  console.log(`实验五终端版：SLR 引导的语义分析框架实现

用法：
  node scripts/lab5-cli.mjs --input <源程序txt/src文件>
  node scripts/lab5-cli.mjs -i <源程序txt/src文件> --out <输出报告txt>

示例：
  node scripts/lab5-cli.mjs --input ../example/1.src
  node scripts/lab5-cli.mjs --input ./test.txt --out ./lab5-result.txt

输出内容：
  1. 抽象语法树 AST
  2. 符号表
  3. 语义错误报告
`)
}

function getArg(name, shortName = '') {
  const args = process.argv.slice(2)
  let index = args.indexOf(name)
  if (index < 0 && shortName) index = args.indexOf(shortName)
  return index >= 0 ? args[index + 1] : ''
}

function resolveInput(input) {
  if (!input) return ''
  const candidates = [
    path.resolve(process.cwd(), input),
    path.resolve(process.cwd(), '..', input),
    path.resolve(process.cwd(), '..', '..', input),
  ]
  return candidates.find((candidate) => fs.existsSync(candidate)) || ''
}

const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h')) {
  usage()
  process.exit(0)
}

const input = getArg('--input', '-i')
if (!input) {
  usage()
  process.exit(1)
}

const inputPath = resolveInput(input)
if (!inputPath) {
  console.error(`找不到输入文件：${input}`)
  process.exit(1)
}

const source = fs.readFileSync(inputPath, 'utf8')
const result = analyzeSource(source)
const report = makeLab5TerminalReport(result, inputPath)
const out = getArg('--out', '-o')

if (out) {
  fs.writeFileSync(path.resolve(process.cwd(), out), report, 'utf8')
  console.log(`实验五分析结果已写入：${out}`)
} else {
  console.log(report)
}
