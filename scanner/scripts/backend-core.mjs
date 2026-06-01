const DATA_BASE = 0x03E8
const CODE_BASE = 0x07D0
const TEMP_BASE = 0x3000
const CONST_BASE = 0x4000

function hex(value) {
  return `0x${Number(value).toString(16).toUpperCase().padStart(4, '0')}`
}
function typeSize(type) {
  if (type === 'void') return 0
  if (type === 'char') return 1
  return 4
}
function unquoteLiteral(value) {
  const text = String(value ?? '')
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) return text.slice(1, -1)
  return text
}
function stringByteLength(value) {
  return Math.max(1, unquoteLiteral(value).length + 1)
}
function arraySize(extra, baseSize) {
  const match = String(extra || '').match(/size=([0-9x?]+)/)
  if (!match) return baseSize
  const dims = match[1].split('x').map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0)
  if (!dims.length) return baseSize
  return dims.reduce((acc, item) => acc * item, baseSize)
}
function isNumberLiteral(value) {
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(String(value || ''))
}
function isStringLiteral(value) {
  const text = String(value ?? '')
  return text.length >= 2 && text.startsWith('"') && text.endsWith('"')
}
function isCharLiteral(value) {
  const text = String(value ?? '')
  return text.length >= 3 && text.startsWith("'") && text.endsWith("'")
}
function isLiteral(value) {
  return isNumberLiteral(value) || isStringLiteral(value) || isCharLiteral(value)
}
function literalSize(value) {
  if (isStringLiteral(value)) return stringByteLength(value)
  if (isCharLiteral(value)) return 1
  return 4
}
function isTemp(value) {
  return /^t\d+$/.test(String(value || ''))
}
function symbolKey(symbol) {
  return `${symbol.scope}:${symbol.name}`
}

export function allocateMemory(semanticResult) {
  const symbols = semanticResult.symbols || []
  const quads = semanticResult.quads || []
  let dataOffset = 0
  let tempOffset = 0
  let constOffset = 0
  const symbolRows = []
  const symbolAddressByName = new Map()
  const symbolAddressByScopedName = new Map()

  for (const symbol of symbols) {
    if (symbol.kind === 'function') continue
    const baseSize = typeSize(symbol.type)
    const size = String(symbol.kind || '').includes('array') ? arraySize(symbol.extra, baseSize) : baseSize
    const address = DATA_BASE + dataOffset
    dataOffset += Math.max(size, 1)
    const row = { name: symbol.name, kind: symbol.kind, type: symbol.type, scope: symbol.scope, size: Math.max(size, 1), address: hex(address), region: 'DATA' }
    symbolRows.push(row)
    symbolAddressByScopedName.set(symbolKey(symbol), row.address)
    if (!symbolAddressByName.has(symbol.name)) symbolAddressByName.set(symbol.name, row.address)
  }

  const tempRows = []
  const tempAddress = new Map()
  const constRows = []
  const constAddress = new Map()
  const labelAddress = new Map()
  const codeRows = []

  const addTemp = (name) => {
    if (!isTemp(name) || tempAddress.has(name)) return
    const address = TEMP_BASE + tempOffset
    tempOffset += 4
    tempAddress.set(name, hex(address))
    tempRows.push({ name, size: 4, address: hex(address), region: 'TEMP' })
  }
  const addConst = (literal) => {
    const text = String(literal ?? '')
    if (!isLiteral(text) || constAddress.has(text)) return
    const size = literalSize(text)
    const address = CONST_BASE + constOffset
    constOffset += Math.max(size, 1)
    constAddress.set(text, hex(address))
    constRows.push({ literal: text, size, address: hex(address), region: 'CONST' })
  }

  quads.forEach((quad, index) => {
    const address = CODE_BASE + index * 4
    codeRows.push({ index: quad.index, op: quad.op, address: hex(address), region: 'CODE' })
    if (quad.op === 'label' && quad.result) labelAddress.set(quad.result, hex(address))
    ;[quad.arg1, quad.arg2, quad.result].forEach((operand) => {
      if (!operand) return
      if (isTemp(operand)) addTemp(operand)
      if (isLiteral(operand)) addConst(operand)
    })
  })

  return {
    bases: { data: hex(DATA_BASE), code: hex(CODE_BASE), temp: hex(TEMP_BASE), const: hex(CONST_BASE) },
    symbols: symbolRows,
    temporaries: tempRows,
    constants: constRows,
    code: codeRows,
    labels: [...labelAddress.entries()].map(([label, address]) => ({ label, address, region: 'CODE' })),
    resolve(operand) {
      const text = String(operand ?? '')
      if (!text) return ''
      if (tempAddress.has(text)) return tempAddress.get(text)
      if (constAddress.has(text)) return constAddress.get(text)
      if (labelAddress.has(text)) return labelAddress.get(text)
      if (symbolAddressByName.has(text)) return symbolAddressByName.get(text)
      if (isNumberLiteral(text)) return `#${text}`
      if (isStringLiteral(text) || isCharLiteral(text)) return `#${text}`
      return text
    },
  }
}

function resolved(memory, value) {
  const text = String(value ?? '')
  if (!text) return ''
  const address = memory.resolve(text)
  return address && address !== text ? `${text}[${address}]` : text
}
function binaryMnemonic(op) {
  return { '+': 'ADD', '-': 'SUB', '*': 'MUL', '/': 'DIV', '<': 'CMPLT', '<=': 'CMPLE', '>': 'CMPGT', '>=': 'CMPGE', '==': 'CMPEQ', '!=': 'CMPNE', '&&': 'AND', '||': 'OR' }[op] || op.toUpperCase()
}

export function generateTargetCode(semanticResult, memory = allocateMemory(semanticResult)) {
  const lines = []
  for (const quad of semanticResult.quads || []) {
    const address = memory.code.find((row) => row.index === quad.index)?.address || ''
    const prefix = address ? `${address}: ` : ''
    switch (quad.op) {
      case 'func': lines.push(`${prefix}FUNC ${quad.result}`); break
      case 'end': lines.push(`${prefix}END ${quad.result}`); break
      case '=': lines.push(`${prefix}MOV ${resolved(memory, quad.result)}, ${resolved(memory, quad.arg1)}`); break
      case '+': case '-': case '*': case '/': case '<': case '<=': case '>': case '>=': case '==': case '!=': case '&&': case '||': lines.push(`${prefix}${binaryMnemonic(quad.op)} ${resolved(memory, quad.result)}, ${resolved(memory, quad.arg1)}, ${resolved(memory, quad.arg2)}`); break
      case 'uminus': lines.push(`${prefix}NEG ${resolved(memory, quad.result)}, ${resolved(memory, quad.arg1)}`); break
      case '!': lines.push(`${prefix}NOT ${resolved(memory, quad.result)}, ${resolved(memory, quad.arg1)}`); break
      case 'jz': lines.push(`${prefix}JZ ${resolved(memory, quad.arg1)}, ${resolved(memory, quad.result)}`); break
      case 'jmp': lines.push(`${prefix}JMP ${resolved(memory, quad.result)}`); break
      case 'label': lines.push(`${prefix}LABEL ${quad.result}`); break
      case 'arg': lines.push(`${prefix}ARG ${resolved(memory, quad.arg1)}`); break
      case 'call': lines.push(`${prefix}CALL ${quad.arg1}, ${quad.arg2}${quad.result ? `, ${resolved(memory, quad.result)}` : ''}`); break
      case 'return': lines.push(`${prefix}RET ${resolved(memory, quad.arg1)}`); break
      case 'print': lines.push(`${prefix}PRINT ${resolved(memory, quad.arg1)}`); break
      case 'input': lines.push(`${prefix}INPUT ${resolved(memory, quad.result)}`); break
      case '[]': lines.push(`${prefix}LOADIDX ${resolved(memory, quad.result)}, ${resolved(memory, quad.arg1)}, ${resolved(memory, quad.arg2)}`); break
      default: lines.push(`${prefix}${quad.op.toUpperCase()} ${[quad.arg1, quad.arg2, quad.result].filter(Boolean).map((x) => resolved(memory, x)).join(', ')}`)
    }
  }
  return lines
}

export function memoryStats(memory) {
  return { dataCount: memory.symbols.length, tempCount: memory.temporaries.length, constCount: memory.constants.length, codeCount: memory.code.length, labelCount: memory.labels.length }
}
