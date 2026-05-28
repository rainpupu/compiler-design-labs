import { scan } from './scanner.js'

export const LAB56_SAMPLE = `int add(int a; int b;) {
  return a + b
};

int main() {
  int x;
  int y;
  x = 3;
  y = add(x, 4,);
  if (y > 5) {
    print y
  };
  return y
};
main()`

export const LAB56_ERROR_SAMPLE = `int main() {
  int x;
  float y;
  int x;
  y = 3.14;
  x = y;
  z = x + 1;
  return y
};
main()`

const TYPE_TOKENS = new Set(['INT', 'FLOAT', 'VOID'])
const PRECEDENCE = { '||': 1, '&&': 2, '<': 3, '<=': 3, '>': 3, '>=': 3, '==': 3, '!=': 3, '+': 4, '-': 4, '*': 5, '/': 5 }
let nextNodeId = 0

function astNode(kind, label, children = [], type = '') {
  return { id: ++nextNodeId, kind, label, type, children: children.filter(Boolean) }
}

function makeError(kind, message, token = {}) {
  return { kind, message, line: token.line || 0, lexeme: token.lexeme || '' }
}

function commonType(left, right) {
  if (left === 'error' || right === 'error') return 'error'
  return left === 'float' || right === 'float' ? 'float' : 'int'
}

class SymbolTable {
  constructor(errors) {
    this.errors = errors
    this.scopes = [{ id: 0, name: 'global', parent: null, level: 0, symbols: new Map() }]
    this.stack = [this.scopes[0]]
    this.rows = []
    this.address = 0
  }

  current() { return this.stack[this.stack.length - 1] }

  enter(name) {
    const parent = this.current()
    const scope = { id: this.scopes.length, name, parent: parent.id, level: parent.level + 1, symbols: new Map() }
    this.scopes.push(scope)
    this.stack.push(scope)
    return scope
  }

  leave() {
    if (this.stack.length > 1) this.stack.pop()
  }

  declare(symbol, token) {
    const scope = this.current()
    if (scope.symbols.has(symbol.name)) {
      this.errors.push(makeError('semantic', `重复声明：${symbol.name}`, token))
      return scope.symbols.get(symbol.name)
    }
    const row = {
      ...symbol,
      scope: scope.id,
      level: scope.level,
      address: symbol.kind === 'function' ? '-' : `@${this.address++}`,
      extra: symbol.extra || '',
    }
    scope.symbols.set(symbol.name, row)
    this.rows.push(row)
    return row
  }

  lookup(name) {
    for (let i = this.stack.length - 1; i >= 0; i -= 1) {
      const found = this.stack[i].symbols.get(name)
      if (found) return found
    }
    return null
  }

  global(name) {
    return this.scopes[0].symbols.get(name) || null
  }
}

class Parser {
  constructor(tokens) {
    this.rawTokens = tokens
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

  shift(type, lexeme = null) {
    const token = this.peek()
    if (token.type === type && (lexeme === null || token.lexeme === lexeme)) {
      this.index += 1
      this.steps.push({ action: 'shift', token: `${token.type}:${token.lexeme}` })
      return token
    }
    return null
  }

  expect(type, message, lexeme = null) {
    const token = this.shift(type, lexeme)
    if (token) return token
    this.errors.push(makeError('syntax', message || `期望 ${lexeme || type}`, this.peek()))
    return { type, lexeme: lexeme || type, line: this.peek().line, synthetic: true }
  }

  emit(op, arg1 = '', arg2 = '', result = '') {
    const quad = { index: this.quads.length, op, arg1: String(arg1 ?? ''), arg2: String(arg2 ?? ''), result: String(result ?? '') }
    this.quads.push(quad)
    return quad.result
  }

  temp() { return `t${++this.tempIndex}` }
  label() { return `L${++this.labelIndex}` }

  parseProgram() {
    const children = []
    while (this.peek().type !== '$') {
      while (this.shift('SEMI')) {}
      if (this.peek().type === '$') break
      if (TYPE_TOKENS.has(this.peek().type) && this.peek(1).type === 'ID' && this.peek(2).type === 'LPAR') children.push(this.parseFunction())
      else children.push(this.parseStatement())
    }
    this.steps.push({ action: 'accept', token: '$' })
    return astNode('Program', 'Program', children)
  }

  parseType() {
    const token = this.peek()
    if (!TYPE_TOKENS.has(token.type)) {
      this.errors.push(makeError('syntax', '需要类型 int/float/void', token))
      return 'error'
    }
    this.index += 1
    return token.lexeme
  }

  parseFunction() {
    const returnType = this.parseType()
    const id = this.expect('ID', '函数缺少名称')
    this.expect('LPAR', '函数缺少左括号 (')
    const params = []
    while (this.peek().type !== 'RPAR' && this.peek().type !== '$') {
      const paramType = this.parseType()
      const paramId = this.expect('ID', '形参缺少名称')
      let isArray = false
      if (this.shift('LBK')) {
        isArray = true
        if (this.peek().type === 'NUM') this.index += 1
        this.expect('RBK', '数组形参缺少 ]')
      }
      params.push({ name: paramId.lexeme, type: paramType, isArray, token: paramId })
      if (this.peek().type === 'SEMI' || this.peek().type === 'CMA') this.index += 1
      else if (this.peek().type !== 'RPAR') this.errors.push(makeError('syntax', '形参之间需要 ; 或 ,', this.peek()))
    }
    this.expect('RPAR', '函数缺少右括号 )')
    const functionSymbol = this.symbolTable.declare({
      name: id.lexeme,
      kind: 'function',
      type: returnType,
      params,
      extra: `params=${params.map((param) => `${param.type}${param.isArray ? '[]' : ''} ${param.name}`).join(',')}`,
    }, id)
    this.currentFunction = functionSymbol
    this.emit('func', '', '', id.lexeme)
    this.symbolTable.enter(`fn:${id.lexeme}`)
    params.forEach((param) => this.symbolTable.declare({ name: param.name, kind: param.isArray ? 'array-param' : 'param', type: param.type, extra: param.isArray ? 'array' : '' }, param.token))
    const body = this.parseBlock(true)
    this.symbolTable.leave()
    this.emit('end', '', '', id.lexeme)
    this.currentFunction = null
    this.shift('SEMI')
    return astNode('FunctionDecl', `${returnType} ${id.lexeme}`, [
      astNode('ParamList', 'params', params.map((param) => astNode('Param', `${param.type}${param.isArray ? '[]' : ''} ${param.name}`, [], param.type))),
      body,
    ], returnType)
  }

  parseBlock(reuseCurrentScope = false) {
    this.expect('LBR', '语句块缺少 {')
    if (!reuseCurrentScope) this.symbolTable.enter('block')
    const children = []
    while (this.peek().type !== 'RBR' && this.peek().type !== '$') {
      const statement = this.parseStatement()
      if (statement) children.push(statement)
      while (this.shift('SEMI')) {}
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
    if (this.peek().type === 'LBR') return this.parseBlock()
    if (this.peek().type === 'RBR' || this.peek().type === '$') return null
    const expr = this.parseExpression()
    return astNode('ExprStmt', 'ExprStmt', [expr.ast], expr.type)
  }

  parseDeclaration() {
    const varType = this.parseType()
    const id = this.expect('ID', '声明缺少变量名')
    let isArray = false
    let size = ''
    if (this.shift('LBK')) {
      isArray = true
      if (this.peek().type === 'NUM') {
        size = this.peek().lexeme
        this.index += 1
      }
      this.expect('RBK', '数组声明缺少 ]')
    }
    this.symbolTable.declare({ name: id.lexeme, kind: isArray ? 'array' : 'var', type: varType, extra: isArray ? `size=${size || '?'}` : '' }, id)
    const children = [astNode('Identifier', id.lexeme, [], varType)]
    if (this.shift('ASG')) {
      const expr = this.parseExpression()
      children.push(expr.ast)
      this.checkAssignable(varType, expr.type, id)
      this.emit('=', expr.place, '', id.lexeme)
    }
    return astNode('Declaration', `${varType}${isArray ? '[]' : ''} ${id.lexeme}`, children, varType)
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

  parseIf() {
    this.expect('LPAR', 'if 缺少 (')
    const cond = this.parseExpression()
    this.expect('RPAR', 'if 缺少 )')
    const falseLabel = this.label()
    const endLabel = this.label()
    this.emit('jz', cond.place, '', falseLabel)
    const thenNode = this.parseStatement()
    let elseNode = null
    if (this.shift('ELSE')) {
      this.emit('jmp', '', '', endLabel)
      this.emit('label', '', '', falseLabel)
      elseNode = this.parseStatement()
      this.emit('label', '', '', endLabel)
    } else {
      this.emit('label', '', '', falseLabel)
    }
    return astNode('IfStmt', 'if', [cond.ast, thenNode, elseNode])
  }

  parseWhile() {
    const startLabel = this.label()
    const endLabel = this.label()
    this.emit('label', '', '', startLabel)
    this.expect('LPAR', 'while 缺少 (')
    const cond = this.parseExpression()
    this.expect('RPAR', 'while 缺少 )')
    this.emit('jz', cond.place, '', endLabel)
    const body = this.parseStatement()
    this.emit('jmp', '', '', startLabel)
    this.emit('label', '', '', endLabel)
    return astNode('WhileStmt', 'while', [cond.ast, body])
  }

  parsePrint() {
    let expr
    if (this.shift('LPAR')) {
      expr = this.parseExpression()
      this.expect('RPAR', 'print 缺少 )')
    } else {
      expr = this.parseExpression()
    }
    this.emit('print', expr.place, '', '')
    return astNode('PrintStmt', 'print', [expr.ast])
  }

  parseExpression(min = 0) {
    let left = this.parsePrimary()
    while (true) {
      const op = this.peekOperator()
      if (!op || PRECEDENCE[op.lexeme] < min) break
      this.index += 1
      const right = this.parseExpression(PRECEDENCE[op.lexeme] + 1)
      const type = op.type === 'ROP' || op.lexeme === '&&' || op.lexeme === '||' ? 'int' : commonType(left.type, right.type)
      const temp = this.temp()
      this.emit(op.lexeme, left.place, right.place, temp)
      left = { type, place: temp, ast: astNode('BinaryExpr', op.lexeme, [left.ast, right.ast], type) }
    }
    if (min === 0 && (this.peek().type === 'ASG' || this.peek().type === 'AAS')) {
      const op = this.peek()
      this.index += 1
      const right = this.parseExpression()
      if (!left.assignable) this.errors.push(makeError('semantic', '赋值左侧不是变量或数组元素', op))
      this.checkAssignable(left.type, right.type, op)
      if (op.type === 'AAS') {
        const temp = this.temp()
        this.emit('+', left.place, right.place, temp)
        this.emit('=', temp, '', left.place)
      } else {
        this.emit('=', right.place, '', left.place)
      }
      left = { type: left.type, place: left.place, ast: astNode('AssignExpr', op.lexeme, [left.ast, right.ast], left.type) }
    }
    return left
  }

  peekOperator() {
    const token = this.peek()
    if (['ADD', 'SUB', 'MUL', 'DIV', 'ROP', 'BOP'].includes(token.type)) return token
    return null
  }

  parsePrimary() {
    const token = this.peek()
    if (this.shift('NUM')) return { type: 'int', place: token.lexeme, ast: astNode('NumberLiteral', token.lexeme, [], 'int') }
    if (this.shift('FLO')) return { type: 'float', place: token.lexeme, ast: astNode('FloatLiteral', token.lexeme, [], 'float') }
    if (this.shift('LPAR')) {
      const expr = this.parseExpression()
      this.expect('RPAR', '表达式缺少 )')
      return expr
    }
    if (this.shift('SUB')) {
      const expr = this.parsePrimary()
      const temp = this.temp()
      this.emit('uminus', expr.place, '', temp)
      return { type: expr.type, place: temp, ast: astNode('UnaryExpr', '-', [expr.ast], expr.type) }
    }
    if (this.shift('ID')) return this.parseIdentifierTail(token)
    this.errors.push(makeError('syntax', `无法解析表达式 ${token.lexeme}`, token))
    this.index += 1
    return { type: 'error', place: '?', ast: astNode('Error', token.lexeme, [], 'error') }
  }

  parseIdentifierTail(id) {
    if (this.shift('LPAR')) {
      const args = []
      while (this.peek().type !== 'RPAR' && this.peek().type !== '$') {
        if (this.shift('CMA')) continue
        args.push(this.parseExpression())
        if (this.peek().type === 'CMA') this.index += 1
      }
      this.expect('RPAR', '函数调用缺少 )')
      const fn = this.symbolTable.global(id.lexeme)
      if (!fn || fn.kind !== 'function') this.errors.push(makeError('semantic', `函数未声明：${id.lexeme}`, id))
      else {
        const params = fn.params || []
        if (params.length !== args.length) this.errors.push(makeError('semantic', `函数 ${id.lexeme} 参数数量不匹配：需要 ${params.length}，实际 ${args.length}`, id))
        for (let i = 0; i < Math.min(params.length, args.length); i += 1) this.checkAssignable(params[i].type, args[i].type, id, `arg${i + 1}`)
      }
      args.forEach((arg) => this.emit('arg', arg.place, '', ''))
      const type = fn?.type || 'error'
      const temp = type === 'void' ? '' : this.temp()
      this.emit('call', id.lexeme, String(args.length), temp)
      return { type, place: temp || `${id.lexeme}()`, ast: astNode('CallExpr', `${id.lexeme}()`, args.map((arg) => arg.ast), type) }
    }

    const symbol = this.symbolTable.lookup(id.lexeme)
    if (!symbol) this.errors.push(makeError('semantic', `未声明变量：${id.lexeme}`, id))
    const type = symbol?.type || 'error'
    if (this.shift('LBK')) {
      const index = this.peek().type === 'RBK' ? { type: 'int', place: '', ast: null } : this.parseExpression()
      this.expect('RBK', '数组访问缺少 ]')
      if (symbol && !String(symbol.kind).includes('array')) this.errors.push(makeError('semantic', `${id.lexeme} 不是数组`, id))
      const temp = this.temp()
      this.emit('[]', id.lexeme, index.place, temp)
      return { type, place: temp, assignable: true, ast: astNode('ArrayAccess', `${id.lexeme}[]`, [index.ast], type) }
    }
    return { type, place: id.lexeme, assignable: true, ast: astNode('Identifier', id.lexeme, [], type) }
  }

  checkAssignable(expected, actual, token, where = 'assign') {
    if (expected === 'error' || actual === 'error' || expected === actual) return
    if (expected === 'float' && actual === 'int') return
    this.errors.push(makeError('semantic', `类型不匹配：${where} 需要 ${expected}，实际 ${actual}`, token))
  }
}

export function analyzeLab56(source) {
  nextNodeId = 0
  const tokens = scan(source)
  const parser = new Parser(tokens)
  const ast = parser.parseProgram()
  return {
    tokens,
    ast,
    symbols: parser.symbolTable.rows,
    scopes: parser.symbolTable.scopes.map((scope) => ({ id: scope.id, name: scope.name, parent: scope.parent, level: scope.level })),
    errors: parser.errors,
    quads: parser.quads,
    steps: parser.steps,
    stats: { tokens: tokens.length, astNodes: nextNodeId, symbols: parser.symbolTable.rows.length, errors: parser.errors.length, quads: parser.quads.length },
  }
}

export function astToText(node, prefix = '', isLast = true, isRoot = true) {
  if (!node) return ''
  let text = `${prefix}${isRoot ? '' : isLast ? '└─ ' : '├─ '}${node.kind}(${node.label})${node.type ? ` : ${node.type}` : ''}\n`
  const nextPrefix = isRoot ? '' : prefix + (isLast ? '   ' : '│  ')
  ;(node.children || []).forEach((child, index) => {
    text += astToText(child, nextPrefix, index === node.children.length - 1, false)
  })
  return text
}

export function flattenAst(node, depth = 0, rows = []) {
  if (!node) return rows
  rows.push({ id: node.id, depth, kind: node.kind, label: node.label, type: node.type })
  ;(node.children || []).forEach((child) => flattenAst(child, depth + 1, rows))
  return rows
}

export function astToMermaid(node) {
  const lines = ['graph TD']
  const walk = (current) => {
    if (!current) return
    const label = `${current.kind}: ${current.label}${current.type ? `\\n${current.type}` : ''}`.replace(/"/g, "'")
    lines.push(`  N${current.id}["${label}"]`)
    for (const child of current.children || []) {
      lines.push(`  N${current.id} --> N${child.id}`)
      walk(child)
    }
  }
  walk(node)
  return lines.join('\n')
}

export function makeLab56Report(result, stage = '6') {
  const lines = []
  lines.push(stage === '5' ? '# 实验五：语义分析报告' : '# 实验六：中间代码生成报告')
  lines.push('', `- Token 数量：${result.stats.tokens}`, `- AST 节点数量：${result.stats.astNodes}`, `- 符号数量：${result.stats.symbols}`, `- 错误数量：${result.stats.errors}`, `- 四元式数量：${result.stats.quads}`, '')
  lines.push('## AST', '', '```text', astToText(result.ast).trim(), '```', '')
  lines.push('## 符号表', '')
  if (result.symbols.length) {
    lines.push('| 名称 | 种类 | 类型 | 作用域 | 层级 | 地址 | 附加信息 |', '|---|---|---|---:|---:|---|---|')
    result.symbols.forEach((symbol) => lines.push(`| ${symbol.name} | ${symbol.kind} | ${symbol.type} | ${symbol.scope} | ${symbol.level} | ${symbol.address} | ${symbol.extra || ''} |`))
  } else lines.push('空')
  lines.push('', '## 错误报告', '')
  if (result.errors.length) result.errors.forEach((error, index) => lines.push(`${index + 1}. [${error.kind}] line ${error.line || '-'} ${error.lexeme ? `near ${error.lexeme} ` : ''}${error.message}`))
  else lines.push('无错误')
  if (stage !== '5') {
    lines.push('', '## 四元式', '')
    if (result.quads.length) {
      lines.push('| # | op | arg1 | arg2 | result |', '|---:|---|---|---|---|')
      result.quads.forEach((quad) => lines.push(`| ${quad.index} | ${quad.op} | ${quad.arg1} | ${quad.arg2} | ${quad.result} |`))
    } else lines.push('空')
  }
  return lines.join('\n')
}
