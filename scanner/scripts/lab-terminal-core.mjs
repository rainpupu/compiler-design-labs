const KEYWORDS = new Map([
  ['int', 'INT'], ['float', 'FLOAT'], ['void', 'VOID'], ['char', 'CHAR'],
  ['if', 'IF'], ['else', 'ELSE'], ['while', 'WHILE'], ['return', 'RETURN'], ['input', 'INPUT'], ['print', 'PRINT'],
])

const VALUE_TOKENS = new Set(['ID', 'NUM', 'FLO', 'STR', 'CHR', 'RPAR', 'RBK', 'RBR'])
const TYPE_TOKENS = new Set(['INT', 'FLOAT', 'VOID', 'CHAR'])
const PRECEDENCE = { '||': 1, '&&': 2, '<': 3, '<=': 3, '>': 3, '>=': 3, '==': 3, '!=': 3, '+': 4, '-': 4, '*': 5, '/': 5 }
let nextAstId = 0

function isLetter(ch) { return /^[A-Za-z]$/.test(ch || '') }
function isDigit(ch) { return /^[0-9]$/.test(ch || '') }
function isIdChar(ch) { return /^[A-Za-z0-9]$/.test(ch || '') }

function scanNumber(code, start, allowSign = false) {
  let i = start
  if (allowSign && '+-'.includes(code[i] || '')) i += 1
  const integerStart = i
  while (i < code.length && isDigit(code[i])) i += 1
  const hasInteger = i > integerStart
  let hasDot = false
  let hasFraction = false
  if (code[i] === '.') {
    hasDot = true
    i += 1
    const fractionStart = i
    while (i < code.length && isDigit(code[i])) i += 1
    hasFraction = i > fractionStart
  }
  if (!hasInteger && !(hasDot && hasFraction)) return null
  let hasExponent = false
  if ('eE'.includes(code[i] || '')) {
    const save = i
    let j = i + 1
    if ('+-'.includes(code[j] || '')) j += 1
    const expStart = j
    while (j < code.length && isDigit(code[j])) j += 1
    if (j > expStart) { hasExponent = true; i = j } else i = save
  }
  return { type: hasDot || hasExponent ? 'FLO' : 'NUM', lexeme: code.slice(start, i), start, end: i, line: 0 }
}

function scanQuoted(code, start, quote, tokenType, line) {
  let i = start + 1
  let escaped = false
  while (i < code.length) {
    const ch = code[i]
    if (ch === '\n' && !escaped) return { type: 'ERROR', lexeme: code.slice(start, i), start, end: i, line, error: `未闭合的${quote === '"' ? '字符串' : '字符'}常量` }
    if (!escaped && ch === quote) {
      const lexeme = code.slice(start, i + 1)
      if (tokenType === 'CHR') {
        const body = lexeme.slice(1, -1)
        const charCount = body.startsWith('\\') ? 1 : [...body].length
        if (charCount !== 1) return { type: 'ERROR', lexeme, start, end: i + 1, line, error: '字符常量长度必须为 1' }
      }
      return { type: tokenType, lexeme, start, end: i + 1, line }
    }
    escaped = !escaped && ch === '\\'
    if (ch !== '\\') escaped = false
    i += 1
  }
  return { type: 'ERROR', lexeme: code.slice(start), start, end: code.length, line, error: `未闭合的${quote === '"' ? '字符串' : '字符'}常量` }
}

export function scanSource(code) {
  const tokens = []
  let i = 0
  let line = 1
  let expectOperand = true
  const push = (type, lexeme, start, end, tokenLine, extra = {}) => {
    tokens.push({ type, lexeme, start, end, line: tokenLine, ...extra })
    expectOperand = !VALUE_TOKENS.has(type)
  }

  while (i < code.length) {
    const ch = code[i]
    if (ch === '\n') { line += 1; i += 1; continue }
    if (/\s/.test(ch)) { i += 1; continue }
    if (ch === '"' || ch === "'") {
      const token = scanQuoted(code, i, ch, ch === '"' ? 'STR' : 'CHR', line)
      push(token.type, token.lexeme, token.start, token.end, token.line, token.error ? { message: token.error } : {})
      i = Math.max(token.end, i + 1)
      continue
    }
    if (isLetter(ch)) {
      const start = i
      const tokenLine = line
      i += 1
      while (i < code.length && isIdChar(code[i])) i += 1
      const lexeme = code.slice(start, i)
      push(KEYWORDS.get(lexeme) || 'ID', lexeme, start, i, tokenLine)
      continue
    }
    if (isDigit(ch)) {
      const tokenLine = line
      const number = scanNumber(code, i, false)
      push(number.type, number.lexeme, number.start, number.end, tokenLine)
      i = number.end
      continue
    }
    if (ch === '.') {
      const tokenLine = line
      const number = scanNumber(code, i, false)
      if (number) { push(number.type, number.lexeme, number.start, number.end, tokenLine); i = number.end }
      else { push('DOT', '.', i, i + 1, tokenLine); i += 1 }
      continue
    }
    if (ch === '+') {
      const tokenLine = line
      const next = code[i + 1] || ''
      const next2 = code[i + 2] || ''
      if (next === '+') { push('AAA', '++', i, i + 2, tokenLine); i += 2 }
      else if (next === '=') { push('AAS', '+=', i, i + 2, tokenLine); i += 2 }
      else if (expectOperand && (isDigit(next) || (next === '.' && isDigit(next2)))) {
        const number = scanNumber(code, i, true)
        push(number.type, number.lexeme, number.start, number.end, tokenLine)
        i = number.end
      } else { push('ADD', '+', i, i + 1, tokenLine); i += 1 }
      continue
    }
    if (ch === '-') {
      const tokenLine = line
      const next = code[i + 1] || ''
      const next2 = code[i + 2] || ''
      if (expectOperand && (isDigit(next) || (next === '.' && isDigit(next2)))) {
        const number = scanNumber(code, i, true)
        push(number.type, number.lexeme, number.start, number.end, tokenLine)
        i = number.end
      } else { push('SUB', '-', i, i + 1, tokenLine); i += 1 }
      continue
    }
    if (ch === '*') { push('MUL', '*', i, i + 1, line); i += 1; continue }
    if (ch === '/') {
      if (code[i + 1] === '/') { while (i < code.length && code[i] !== '\n') i += 1 }
      else { push('DIV', '/', i, i + 1, line); i += 1 }
      continue
    }
    if (ch === '<') { if (code[i + 1] === '=') { push('ROP', '<=', i, i + 2, line); i += 2 } else { push('ROP', '<', i, i + 1, line); i += 1 } continue }
    if (ch === '>') { if (code[i + 1] === '=') { push('ROP', '>=', i, i + 2, line); i += 2 } else { push('ROP', '>', i, i + 1, line); i += 1 } continue }
    if (ch === '=') { if (code[i + 1] === '=') { push('ROP', '==', i, i + 2, line); i += 2 } else { push('ASG', '=', i, i + 1, line); i += 1 } continue }
    if (ch === '!') { if (code[i + 1] === '=') { push('ROP', '!=', i, i + 2, line); i += 2 } else { push('BOP', '!', i, i + 1, line); i += 1 } continue }
    if (ch === '&') { if (code[i + 1] === '&') { push('BOP', '&&', i, i + 2, line); i += 2 } else { push('ERROR', ch, i, i + 1, line); i += 1 } continue }
    if (ch === '|') { if (code[i + 1] === '|') { push('BOP', '||', i, i + 2, line); i += 2 } else { push('ERROR', ch, i, i + 1, line); i += 1 } continue }
    const oneCharMap = { '(': 'LPAR', ')': 'RPAR', '[': 'LBK', ']': 'RBK', '{': 'LBR', '}': 'RBR', ',': 'CMA', ':': 'COL', ';': 'SEMI' }
    if (oneCharMap[ch]) { push(oneCharMap[ch], ch, i, i + 1, line); i += 1; continue }
    push('ERROR', ch, i, i + 1, line)
    i += 1
  }
  return tokens
}

function astNode(kind, label, children = [], type = '') {
  return { id: ++nextAstId, kind, label, type, children: children.filter(Boolean) }
}
function commonType(left, right) {
  if (left === 'error' || right === 'error') return 'error'
  if (left === 'string' || right === 'string') return left === right ? 'string' : 'error'
  if (left === 'float' || right === 'float') return 'float'
  if (left === 'char' && right === 'char') return 'char'
  return 'int'
}
function makeError(kind, message, token = {}) {
  return { kind, message: token.message || message, line: token.line || 0, lexeme: token.lexeme || '' }
}

class SymbolTable {
  constructor(errors) {
    this.errors = errors
    this.scopes = [{ id: 0, name: 'global', parent: null, level: 0, map: new Map() }]
    this.stack = [this.scopes[0]]
    this.rows = []
    this.address = 0
  }
  current() { return this.stack[this.stack.length - 1] }
  enter(name) { const parent = this.current(); const scope = { id: this.scopes.length, name, parent: parent.id, level: parent.level + 1, map: new Map() }; this.scopes.push(scope); this.stack.push(scope); return scope }
  leave() { if (this.stack.length > 1) this.stack.pop() }
  declare(symbol, token) {
    const scope = this.current()
    if (scope.map.has(symbol.name)) { this.errors.push(makeError('semantic', `重复声明：${symbol.name}`, token)); return scope.map.get(symbol.name) }
    const row = { ...symbol, scope: scope.id, level: scope.level, address: symbol.kind === 'function' ? '-' : `@${this.address++}`, extra: symbol.extra || '' }
    scope.map.set(symbol.name, row)
    this.rows.push(row)
    return row
  }
  lookup(name) { for (let i = this.stack.length - 1; i >= 0; i -= 1) { const found = this.stack[i].map.get(name); if (found) return found } return null }
  global(name) { return this.scopes[0].map.get(name) || null }
}

class Parser {
  constructor(tokens) {
    this.tokens = tokens.filter((token) => token.type !== 'ERROR').concat({ type: '$', lexeme: '$', line: tokens.at(-1)?.line || 1 })
    this.index = 0
    this.errors = tokens.filter((token) => token.type === 'ERROR').map((token) => makeError('lexical', `无法识别字符 ${token.lexeme}`, token))
    this.symbolTable = new SymbolTable(this.errors)
    this.quads = []
    this.steps = []
    this.tempIndex = 0
    this.labelIndex = 0
    this.currentFunction = null
  }

  peek(offset = 0) { return this.tokens[this.index + offset] || this.tokens[this.tokens.length - 1] }
  at(type) { return this.peek().type === type }
  shift(type, lexeme = null) { const token = this.peek(); if (token.type === type && (lexeme === null || token.lexeme === lexeme)) { this.index += 1; this.steps.push({ action: 'shift', token: `${token.type}:${token.lexeme}` }); return token } return null }
  expect(type, message, lexeme = null) { const token = this.shift(type, lexeme); if (token) return token; this.errors.push(makeError('syntax', message || `期望 ${lexeme || type}`, this.peek())); return { type, lexeme: lexeme || type, line: this.peek().line, synthetic: true } }
  emit(op, arg1 = '', arg2 = '', result = '') { this.quads.push({ index: this.quads.length, op, arg1: String(arg1 ?? ''), arg2: String(arg2 ?? ''), result: String(result ?? '') }); return String(result ?? '') }
  temp() { return `t${++this.tempIndex}` }
  label() { return `L${++this.labelIndex}` }
  consumeUnsupported(context) { const token = this.peek(); if (token.type === '$') return astNode('Error', 'EOF', [], 'error'); this.errors.push(makeError('syntax', `${context} 中遇到暂不支持或无法恢复的符号，已跳过`, token)); this.index += 1; return astNode('Error', token.lexeme, [], 'error') }
  skipUntil(stopTypes) { const stops = new Set(stopTypes); while (!stops.has(this.peek().type) && this.peek().type !== '$') this.index += 1 }

  parseProgram() {
    const children = []
    let guard = 0
    while (!this.at('$')) {
      while (this.shift('SEMI')) {}
      if (this.at('$')) break
      const start = this.index
      const child = TYPE_TOKENS.has(this.peek().type) && this.peek(1).type === 'ID' && this.peek(2).type === 'LPAR' ? this.parseFunction() : this.parseStatement()
      if (child) children.push(child)
      if (this.index === start) children.push(this.consumeUnsupported('顶层程序'))
      if (++guard > this.tokens.length * 4 + 32) { this.errors.push(makeError('syntax', '语法恢复超过安全上限，已停止继续分析', this.peek())); break }
    }
    this.steps.push({ action: 'accept', token: '$' })
    return astNode('Program', 'Program', children)
  }

  parseType() {
    const token = this.peek()
    if (!TYPE_TOKENS.has(token.type)) { this.errors.push(makeError('syntax', '需要类型 int/float/void/char', token)); if (!['RPAR', 'RBR', '$'].includes(token.type)) this.index += 1; return 'error' }
    this.index += 1
    return token.lexeme
  }

  parseFunction() {
    const returnType = this.parseType()
    const id = this.expect('ID', '函数缺少名称')
    this.expect('LPAR', '函数缺少 (')
    const params = []
    let guard = 0
    while (!this.at('RPAR') && !this.at('$')) {
      const start = this.index
      const paramType = this.parseType()
      const paramId = this.expect('ID', '形参缺少名称')
      let isArray = false
      while (this.shift('LBK')) { isArray = true; if (this.at('NUM')) this.index += 1; this.expect('RBK', '数组形参缺少 ]') }
      params.push({ name: paramId.lexeme, type: paramType, isArray, token: paramId })
      if (this.at('SEMI') || this.at('CMA')) this.index += 1
      else if (!this.at('RPAR')) this.errors.push(makeError('syntax', '形参之间需要 ; 或 ,', this.peek()))
      if (this.index === start) this.index += 1
      if (++guard > this.tokens.length) { this.skipUntil(['RPAR']); break }
    }
    this.expect('RPAR', '函数缺少 )')
    const functionSymbol = this.symbolTable.declare({ name: id.lexeme, kind: 'function', type: returnType, params, extra: `params=${params.map((p) => `${p.type}${p.isArray ? '[]' : ''} ${p.name}`).join(',')}` }, id)
    this.currentFunction = functionSymbol
    this.emit('func', '', '', id.lexeme)
    this.symbolTable.enter(`fn:${id.lexeme}`)
    params.forEach((param) => this.symbolTable.declare({ name: param.name, kind: param.isArray ? 'array-param' : 'param', type: param.type, extra: param.isArray ? 'array' : '' }, param.token))
    const body = this.parseBlock(true)
    this.symbolTable.leave()
    this.emit('end', '', '', id.lexeme)
    this.currentFunction = null
    this.shift('SEMI')
    return astNode('FunctionDecl', `${returnType} ${id.lexeme}`, [astNode('ParamList', 'params', params.map((p) => astNode('Param', `${p.type}${p.isArray ? '[]' : ''} ${p.name}`, [], p.type))), body], returnType)
  }

  parseBlock(reuseCurrentScope = false) {
    this.expect('LBR', '语句块缺少 {')
    if (!reuseCurrentScope) this.symbolTable.enter('block')
    const children = []
    let guard = 0
    while (!this.at('RBR') && !this.at('$')) {
      const start = this.index
      const statement = this.parseStatement()
      if (statement) children.push(statement)
      while (this.shift('SEMI')) {}
      if (this.index === start) children.push(this.consumeUnsupported('语句块'))
      if (++guard > this.tokens.length * 3 + 16) { this.errors.push(makeError('syntax', '语句块错误恢复超过安全上限，已跳出当前块', this.peek())); break }
    }
    this.expect('RBR', '语句块缺少 }')
    if (!reuseCurrentScope) this.symbolTable.leave()
    return astNode('Block', 'Block', children)
  }

  parseStatement() {
    while (this.shift('SEMI')) {}
    if (TYPE_TOKENS.has(this.peek().type)) return this.parseDeclaration()
    if (this.shift('RETURN')) return this.parseReturn(this.tokens[this.index - 1])
    if (this.shift('IF')) return this.parseIf()
    if (this.shift('WHILE')) return this.parseWhile()
    if (this.shift('PRINT')) return this.parsePrint()
    if (this.shift('INPUT')) return this.parseInput()
    if (this.at('LBR')) return this.parseBlock()
    if (this.at('RBR') || this.at('$')) return null
    const expr = this.parseExpression()
    return astNode('ExprStmt', 'ExprStmt', [expr.ast], expr.type)
  }

  parseDeclaration() {
    const varType = this.parseType()
    const id = this.expect('ID', '声明缺少变量名')
    let isArray = false
    const sizes = []
    while (this.shift('LBK')) { isArray = true; if (this.at('NUM')) { sizes.push(this.peek().lexeme); this.index += 1 } this.expect('RBK', '数组声明缺少 ]') }
    this.symbolTable.declare({ name: id.lexeme, kind: isArray ? 'array' : 'var', type: varType, extra: isArray ? `size=${sizes.join('x') || '?'}` : '' }, id)
    const children = [astNode('Identifier', id.lexeme, [], varType)]
    if (this.shift('ASG')) { const expr = this.at('LBR') ? this.parseInitializerList() : this.parseExpression(); children.push(expr.ast); this.checkAssignable(varType, expr.type, id); this.emit('=', expr.place, '', id.lexeme) }
    return astNode('Declaration', `${varType}${isArray ? '[]' : ''} ${id.lexeme}`, children, varType)
  }

  parseInitializerList() {
    const start = this.expect('LBR', '初始化列表缺少 {')
    const items = []
    while (!this.at('RBR') && !this.at('$')) { if (this.shift('CMA')) continue; const before = this.index; items.push(this.parseExpression().ast); if (this.at('CMA')) this.index += 1; if (this.index === before) this.index += 1 }
    this.expect('RBR', '初始化列表缺少 }')
    return { type: 'int', place: `{init@${start.line || 0}}`, ast: astNode('InitList', '{}', items, 'int') }
  }

  parseReturn(token) {
    let expr = { type: 'void', place: '', ast: null }
    if (!['SEMI', 'RBR', '$'].includes(this.peek().type)) expr = this.parseExpression()
    const expected = this.currentFunction?.type || 'void'
    if (expected === 'void' && expr.type !== 'void') this.errors.push(makeError('semantic', `void 函数不应返回 ${expr.type}`, token))
    if (expected !== 'void') this.checkAssignable(expected, expr.type, token, 'return')
    this.emit('return', expr.place, '', this.currentFunction?.name || '')
    return astNode('ReturnStmt', 'return', expr.ast ? [expr.ast] : [], expr.type)
  }

  parseIf() { this.expect('LPAR', 'if 缺少 ('); const cond = this.parseExpression(); this.expect('RPAR', 'if 缺少 )'); const falseLabel = this.label(); const endLabel = this.label(); this.emit('jz', cond.place, '', falseLabel); const thenNode = this.parseStatement(); let elseNode = null; if (this.shift('ELSE')) { this.emit('jmp', '', '', endLabel); this.emit('label', '', '', falseLabel); elseNode = this.parseStatement(); this.emit('label', '', '', endLabel) } else this.emit('label', '', '', falseLabel); return astNode('IfStmt', 'if', [cond.ast, thenNode, elseNode]) }
  parseWhile() { const startLabel = this.label(); const endLabel = this.label(); this.emit('label', '', '', startLabel); this.expect('LPAR', 'while 缺少 ('); const cond = this.parseExpression(); this.expect('RPAR', 'while 缺少 )'); this.emit('jz', cond.place, '', endLabel); const body = this.parseStatement(); this.emit('jmp', '', '', startLabel); this.emit('label', '', '', endLabel); return astNode('WhileStmt', 'while', [cond.ast, body]) }
  parsePrint() { let expr; if (this.shift('LPAR')) { expr = this.parseExpression(); this.expect('RPAR', 'print 缺少 )') } else expr = this.parseExpression(); this.emit('print', expr.place, '', ''); return astNode('PrintStmt', 'print', [expr.ast]) }
  parseInput() { let expr = { ast: null, place: '' }; if (this.shift('LPAR')) { expr = this.parseExpression(); this.expect('RPAR', 'input 缺少 )') } else expr = this.parseExpression(); this.emit('input', '', '', expr.place); return astNode('InputStmt', 'input', [expr.ast]) }

  parseExpression(min = 0) {
    let left = this.parsePrimary()
    while (true) {
      const op = this.peekOperator()
      if (!op || PRECEDENCE[op.lexeme] < min) break
      this.index += 1
      const right = this.parseExpression(PRECEDENCE[op.lexeme] + 1)
      const type = op.type === 'ROP' || op.lexeme === '&&' || op.lexeme === '||' ? 'int' : commonType(left.type, right.type)
      if (type === 'error') this.errors.push(makeError('semantic', `字符串/字符类型不能参与运算 ${op.lexeme}`, op))
      const temp = this.temp()
      this.emit(op.lexeme, left.place, right.place, temp)
      left = { type, place: temp, ast: astNode('BinaryExpr', op.lexeme, [left.ast, right.ast], type) }
    }
    if (min === 0 && (this.at('ASG') || this.at('AAS'))) {
      const op = this.peek(); this.index += 1
      const right = this.at('LBR') ? this.parseInitializerList() : this.parseExpression()
      if (!left.assignable) this.errors.push(makeError('semantic', '赋值左侧不是变量或数组元素', op))
      this.checkAssignable(left.type, right.type, op)
      if (op.type === 'AAS') { const temp = this.temp(); this.emit('+', left.place, right.place, temp); this.emit('=', temp, '', left.place) } else this.emit('=', right.place, '', left.place)
      left = { type: left.type, place: left.place, ast: astNode('AssignExpr', op.lexeme, [left.ast, right.ast], left.type) }
    }
    return left
  }

  peekOperator() { return ['ADD', 'SUB', 'MUL', 'DIV', 'ROP', 'BOP'].includes(this.peek().type) ? this.peek() : null }
  parsePrimary() {
    const token = this.peek()
    if (this.shift('NUM')) return { type: 'int', place: token.lexeme, ast: astNode('NumberLiteral', token.lexeme, [], 'int') }
    if (this.shift('FLO')) return { type: 'float', place: token.lexeme, ast: astNode('FloatLiteral', token.lexeme, [], 'float') }
    if (this.shift('STR')) return { type: 'string', place: token.lexeme, ast: astNode('StringLiteral', token.lexeme, [], 'string') }
    if (this.shift('CHR')) return { type: 'char', place: token.lexeme, ast: astNode('CharLiteral', token.lexeme, [], 'char') }
    if (this.shift('LPAR')) { const expr = this.parseExpression(); this.expect('RPAR', '表达式缺少 )'); return expr }
    if (this.shift('SUB')) { const expr = this.parsePrimary(); const temp = this.temp(); this.emit('uminus', expr.place, '', temp); return { type: expr.type, place: temp, ast: astNode('UnaryExpr', '-', [expr.ast], expr.type) } }
    if (this.shift('BOP', '!')) { const expr = this.parsePrimary(); const temp = this.temp(); this.emit('!', expr.place, '', temp); return { type: 'int', place: temp, ast: astNode('UnaryExpr', '!', [expr.ast], 'int') } }
    if (this.shift('ID')) return this.parseIdentifierTail(token)
    this.errors.push(makeError('syntax', `无法解析表达式 ${token.lexeme}`, token))
    if (token.type !== '$') this.index += 1
    return { type: 'error', place: '?', ast: astNode('Error', token.lexeme, [], 'error') }
  }

  parseIdentifierTail(id) {
    if (this.shift('LPAR')) {
      const args = []
      let guard = 0
      while (!this.at('RPAR') && !this.at('$')) { if (this.shift('CMA')) continue; const start = this.index; args.push(this.parseExpression()); if (this.at('CMA')) this.index += 1; if (this.index === start) this.index += 1; if (++guard > this.tokens.length) { this.skipUntil(['RPAR']); break } }
      this.expect('RPAR', '函数调用缺少 )')
      const fn = this.symbolTable.global(id.lexeme)
      if (!fn || fn.kind !== 'function') this.errors.push(makeError('semantic', `函数未声明：${id.lexeme}`, id))
      else { const params = fn.params || []; if (params.length !== args.length) this.errors.push(makeError('semantic', `函数 ${id.lexeme} 参数数量不匹配：需要 ${params.length}，实际 ${args.length}`, id)); for (let i = 0; i < Math.min(params.length, args.length); i += 1) this.checkAssignable(params[i].type, args[i].type, id, `arg${i + 1}`) }
      args.forEach((arg) => this.emit('arg', arg.place, '', ''))
      const type = fn?.type || 'error'
      const temp = type === 'void' ? '' : this.temp()
      this.emit('call', id.lexeme, String(args.length), temp)
      return { type, place: temp || `${id.lexeme}()`, ast: astNode('CallExpr', `${id.lexeme}()`, args.map((arg) => arg.ast), type) }
    }
    const symbol = this.symbolTable.lookup(id.lexeme)
    if (!symbol) this.errors.push(makeError('semantic', `未声明变量：${id.lexeme}`, id))
    const type = symbol?.type || 'error'
    let place = id.lexeme
    let ast = astNode('Identifier', id.lexeme, [], type)
    while (this.shift('LBK')) { const index = this.at('RBK') ? { type: 'int', place: '', ast: null } : this.parseExpression(); this.expect('RBK', '数组访问缺少 ]'); if (symbol && !String(symbol.kind).includes('array')) this.errors.push(makeError('semantic', `${id.lexeme} 不是数组`, id)); const temp = this.temp(); this.emit('[]', place, index.place, temp); place = temp; ast = astNode('ArrayAccess', `${id.lexeme}[]`, [ast, index.ast], type) }
    return { type, place, assignable: true, ast }
  }

  checkAssignable(expected, actual, token, where = 'assign') {
    if (expected === 'error' || actual === 'error' || expected === actual) return
    if (expected === 'float' && (actual === 'int' || actual === 'char')) return
    if (expected === 'int' && actual === 'char') return
    if (expected === 'char' && actual === 'int') return
    this.errors.push(makeError('semantic', `类型不匹配：${where} 需要 ${expected}，实际 ${actual}`, token))
  }
}

export function analyzeSource(source) {
  nextAstId = 0
  const tokens = scanSource(source)
  const parser = new Parser(tokens)
  const ast = parser.parseProgram()
  return { tokens, ast, symbols: parser.symbolTable.rows, scopes: parser.symbolTable.scopes.map((scope) => ({ id: scope.id, name: scope.name, parent: scope.parent, level: scope.level })), errors: parser.errors, quads: parser.quads, steps: parser.steps, stats: { tokens: tokens.length, astNodes: nextAstId, symbols: parser.symbolTable.rows.length, errors: parser.errors.length, quads: parser.quads.length } }
}

export function astToText(ast, prefix = '', isLast = true, isRoot = true) {
  if (!ast) return ''
  let text = `${prefix}${isRoot ? '' : isLast ? '└─ ' : '├─ '}${ast.kind}(${ast.label})${ast.type ? ` : ${ast.type}` : ''}\n`
  const nextPrefix = isRoot ? '' : prefix + (isLast ? '   ' : '│  ')
  ;(ast.children || []).forEach((child, index) => { text += astToText(child, nextPrefix, index === ast.children.length - 1, false) })
  return text
}
export function makeTable(headers, rows) {
  if (!rows.length) return '空'
  const widths = headers.map((header, index) => Math.max(String(header).length, ...rows.map((row) => String(row[index] ?? '').length)))
  const line = (row) => row.map((cell, index) => ` ${String(cell ?? '').padEnd(widths[index])} `).join('|')
  return [line(headers), widths.map((width) => '-'.repeat(width + 2)).join('+'), ...rows.map(line)].join('\n')
}
export function makeLab5TerminalReport(result, inputName = '') {
  const lines = []
  lines.push('实验五：SLR 引导的语义分析框架实现')
  lines.push('='.repeat(72))
  if (inputName) lines.push(`输入文件：${inputName}`)
  lines.push(`Token 数量：${result.stats.tokens}`)
  lines.push(`AST 节点数：${result.stats.astNodes}`)
  lines.push(`符号数量：${result.stats.symbols}`)
  lines.push(`错误数量：${result.stats.errors}`)
  lines.push('')
  lines.push('【抽象语法树 AST】')
  lines.push(astToText(result.ast).trim() || '空')
  lines.push('')
  lines.push('【符号表】')
  lines.push(makeTable(['name', 'kind', 'type', 'scope', 'level', 'address', 'extra'], result.symbols.map((s) => [s.name, s.kind, s.type, s.scope, s.level, s.address, s.extra || ''])))
  lines.push('')
  lines.push('【语义错误报告】')
  lines.push(result.errors.length ? result.errors.map((e, i) => `${i + 1}. [${e.kind}] line ${e.line || '-'} ${e.lexeme ? `near "${e.lexeme}" ` : ''}${e.message}`).join('\n') : '无错误')
  return lines.join('\n')
}
export function makeLab6TerminalReport(result, inputName = '') {
  const lines = []
  lines.push('实验六：中间代码生成')
  lines.push('='.repeat(72))
  if (inputName) lines.push(`输入文件：${inputName}`)
  lines.push(`Token 数量：${result.stats.tokens}`)
  lines.push(`AST 节点数：${result.stats.astNodes}`)
  lines.push(`符号数量：${result.stats.symbols}`)
  lines.push(`错误数量：${result.stats.errors}`)
  lines.push(`四元式数量：${result.stats.quads}`)
  lines.push('')
  lines.push('【中间代码：四元式】')
  lines.push(makeTable(['#', 'op', 'arg1', 'arg2', 'result'], result.quads.map((q) => [q.index, q.op, q.arg1, q.arg2, q.result])))
  lines.push('')
  lines.push('【符号表】')
  lines.push(makeTable(['name', 'kind', 'type', 'scope', 'level', 'address', 'extra'], result.symbols.map((s) => [s.name, s.kind, s.type, s.scope, s.level, s.address, s.extra || ''])))
  lines.push('')
  lines.push('【错误报告】')
  lines.push(result.errors.length ? result.errors.map((e, i) => `${i + 1}. [${e.kind}] line ${e.line || '-'} ${e.lexeme ? `near "${e.lexeme}" ` : ''}${e.message}`).join('\n') : '无错误')
  return lines.join('\n')
}
