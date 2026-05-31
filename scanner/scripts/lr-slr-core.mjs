export const DEFAULT_ACCEPTANCE_GRAMMAR = `Program -> FuncList TopCalls
FuncList -> Func FuncList | epsilon
TopCalls -> CallStmt TopCalls | epsilon
Func -> Type ID LPAR Params RPAR Block SEMI
Type -> INT | FLOAT | VOID
Params -> ParamList | epsilon
ParamList -> Param ParamRest
ParamRest -> SEMI Param ParamRest | CMA Param ParamRest | epsilon
Param -> Type ID ArrayParam
ArrayParam -> LBK RBK | LBK NUM RBK | epsilon
Block -> LBR Stmts RBR
Stmts -> Stmt Stmts | epsilon
Stmt -> Decl SEMI | Assign SEMI | Return SEMI | If SEMI | While SEMI | CallStmt SEMI | Print SEMI | Block SEMI | Decl | Assign | Return | If | While | CallStmt | Print | Block
Decl -> Type ID ArrayDecl InitOpt
ArrayDecl -> LBK NUM RBK ArrayDecl | LBK RBK ArrayDecl | epsilon
InitOpt -> ASG Expr | epsilon
Assign -> LValue ASG Expr | LValue AAS Expr
LValue -> ID Indexes
Indexes -> LBK Expr RBK Indexes | epsilon
Return -> RETURN ExprOpt
ExprOpt -> Expr | epsilon
If -> IF LPAR Expr RPAR Block ElseOpt
ElseOpt -> ELSE Block | epsilon
While -> WHILE LPAR Expr RPAR Block
CallStmt -> ID LPAR Args RPAR
Print -> PRINT Expr | PRINT LPAR Expr RPAR
Args -> ArgList | epsilon
ArgList -> Expr ArgRest
ArgRest -> CMA Expr ArgRest | CMA | epsilon
Expr -> Expr BOP Rel | Rel
Rel -> Rel ROP Add | Add
Add -> Add ADD Mul | Add SUB Mul | Mul
Mul -> Mul MUL Unary | Mul DIV Unary | Unary
Unary -> SUB Unary | BOP Unary | Primary
Primary -> ID Indexes | NUM | FLO | LPAR Expr RPAR | CallStmt`

const END = '$'
const EPS = 'ε'

function stripBOM(value) { return String(value || '').replace(/^\uFEFF/, '') }
function normalizeArrow(line) { return line.replace(/→/g, '->').replace(/=>/g, '->') }
function tokenizeRhs(rhs) {
  const text = rhs.trim()
  if (!text || ['ε', 'epsilon', 'eps', '@'].includes(text)) return []
  if (/\s/.test(text)) return text.split(/\s+/).filter(Boolean)
  return text.match(/[A-Za-z_][A-Za-z0-9_']*|[^\s]/g) || []
}
function itemKey(item) { return `${item.prod}.${item.dot}` }
function itemSetKey(items) { return [...items].map(itemKey).sort().join(';') }
function productionText(p) { return `${p.lhs} -> ${p.rhs.length ? p.rhs.join(' ') : EPS}` }
function itemText(productions, item) {
  const p = productions[item.prod]
  const rhs = [...p.rhs]
  rhs.splice(item.dot, 0, '·')
  return `${p.lhs} -> ${rhs.length ? rhs.join(' ') : '·'}`
}
function compareItems(a, b) { return a.prod !== b.prod ? a.prod - b.prod : a.dot - b.dot }
function addUniqueItem(set, item) {
  const key = itemKey(item)
  if (set.has(key)) return false
  set.set(key, item)
  return true
}

export function buildLR0(grammarText = DEFAULT_ACCEPTANCE_GRAMMAR) {
  const rawProductions = []
  const nonterminals = new Set()
  const errors = []
  const lines = stripBOM(grammarText)
    .split(/\r?\n/)
    .map((line) => stripBOM(line).trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith('//'))

  for (const [lineIndex, rawLine] of lines.entries()) {
    const line = normalizeArrow(rawLine)
    const arrow = line.indexOf('->')
    if (arrow < 0) { errors.push(`Line ${lineIndex + 1}: missing ->`); continue }
    const lhs = line.slice(0, arrow).trim()
    const rhsAll = line.slice(arrow + 2).trim()
    if (!lhs || !rhsAll) { errors.push(`Line ${lineIndex + 1}: empty left or right side`); continue }
    nonterminals.add(lhs)
    for (const alt of rhsAll.split('|')) rawProductions.push({ lhs, rhs: tokenizeRhs(alt) })
  }

  if (!rawProductions.length) errors.push('Please input at least one production')
  if (errors.length) return emptyLR0(errors)

  const startSymbol = rawProductions[0].lhs
  let augmentedStart = `${startSymbol}'`
  while (nonterminals.has(augmentedStart)) augmentedStart += "'"
  const productions = [{ lhs: augmentedStart, rhs: [startSymbol] }, ...rawProductions]
  nonterminals.add(augmentedStart)

  const terminals = new Set()
  for (const p of productions) for (const sym of p.rhs) if (!nonterminals.has(sym)) terminals.add(sym)

  function closure(items) {
    const result = new Map()
    for (const item of items) addUniqueItem(result, item)
    let changed = true
    while (changed) {
      changed = false
      for (const item of [...result.values()]) {
        const production = productions[item.prod]
        const next = production.rhs[item.dot]
        if (!next || !nonterminals.has(next)) continue
        for (let i = 0; i < productions.length; i += 1) {
          if (productions[i].lhs === next) changed = addUniqueItem(result, { prod: i, dot: 0 }) || changed
        }
      }
    }
    return [...result.values()].sort(compareItems)
  }

  function goTo(items, symbol) {
    const moved = []
    for (const item of items) {
      const production = productions[item.prod]
      if (production.rhs[item.dot] === symbol) moved.push({ prod: item.prod, dot: item.dot + 1 })
    }
    return moved.length ? closure(moved) : []
  }

  const states = []
  const transitions = []
  const stateId = new Map()
  const initial = closure([{ prod: 0, dot: 0 }])
  states.push(initial)
  stateId.set(itemSetKey(initial), 0)
  const queue = [0]
  while (queue.length) {
    const sid = queue.shift()
    const symbols = new Set()
    for (const item of states[sid]) {
      const next = productions[item.prod].rhs[item.dot]
      if (next) symbols.add(next)
    }
    for (const symbol of [...symbols].sort()) {
      const nextState = goTo(states[sid], symbol)
      if (!nextState.length) continue
      const key = itemSetKey(nextState)
      let target = stateId.get(key)
      if (target === undefined) {
        target = states.length
        states.push(nextState)
        stateId.set(key, target)
        queue.push(target)
      }
      transitions.push({ from: sid, to: target, symbol })
    }
  }

  const displayStates = states.map((items, id) => ({
    id,
    items: items.map((item) => ({
      ...item,
      text: itemText(productions, item),
      complete: item.dot === productions[item.prod].rhs.length,
      accept: item.prod === 0 && item.dot === productions[0].rhs.length,
    })),
  }))
  const conflicts = displayStates.map((state) => conflictInfo(state, productions, terminals))
  const hasConflict = conflicts.some((item) => item.shiftReduce || item.reduceReduce)

  return {
    errors: [],
    startSymbol,
    augmentedStart,
    productions: productions.map((p, index) => ({ ...p, index, text: productionText(p) })),
    nonterminals: [...nonterminals].sort(),
    terminals: [...terminals].sort(),
    states: displayStates,
    transitions,
    conflicts,
    isLR0: !hasConflict,
    summary: hasConflict ? '存在 LR(0) 冲突，不是 LR(0) 文法。' : '未发现 LR(0) 冲突，是 LR(0) 文法。',
  }
}

function emptyLR0(errors) {
  return { errors, startSymbol: '', augmentedStart: '', productions: [], nonterminals: [], terminals: [], states: [], transitions: [], conflicts: [], isLR0: false, summary: '' }
}
function conflictInfo(state, productions, terminals) {
  const reduceItems = []
  const shiftSymbols = []
  for (const item of state.items) {
    const production = productions[item.prod]
    if (item.dot === production.rhs.length) {
      if (item.prod !== 0) reduceItems.push(item.text)
    } else {
      const next = production.rhs[item.dot]
      if (terminals.has(next)) shiftSymbols.push(next)
    }
  }
  const uniqueShiftSymbols = [...new Set(shiftSymbols)].sort()
  return { stateId: state.id, shiftReduce: reduceItems.length > 0 && uniqueShiftSymbols.length > 0, reduceReduce: reduceItems.length >= 2, reduceItems, shiftSymbols: uniqueShiftSymbols }
}

function actionKey(action) { return action?.type === 'shift' ? `s${action.to}` : action?.type === 'reduce' ? `r${action.prod}` : action?.type === 'accept' ? 'acc' : '' }
function actionText(actions) { return actions?.length ? actions.map(actionKey).join(' / ') : '' }
function tokenizeTokenText(text) { return String(text || '').trim().match(/[A-Za-z_][A-Za-z0-9_']*|\$|[^\s,]/g) || [] }

export function buildSLR1(grammarText = DEFAULT_ACCEPTANCE_GRAMMAR, tokenText = '') {
  const lr0 = buildLR0(grammarText)
  const tokenList = Array.isArray(tokenText) ? tokenText : tokenizeTokenText(tokenText)
  if (lr0.errors.length) return emptySLR(lr0, tokenList)
  const productions = lr0.productions
  const terminals = [...lr0.terminals].sort()
  const nonterminals = [...lr0.nonterminals].sort()
  const gotoColumns = nonterminals.filter((symbol) => symbol !== lr0.augmentedStart)
  const actionColumns = [...new Set([...terminals, END])]
  const firstSets = first(productions, terminals, nonterminals)
  const followSets = follow(productions, lr0.startSymbol, firstSets, nonterminals)
  const transitionMap = new Map(lr0.transitions.map((edge) => [`${edge.from}:${edge.symbol}`, edge.to]))
  const actions = lr0.states.map(() => ({}))
  const gotos = lr0.states.map(() => ({}))
  const addAction = (state, symbol, action) => {
    actions[state][symbol] ||= []
    if (!actions[state][symbol].some((existing) => actionKey(existing) === actionKey(action))) actions[state][symbol].push(action)
  }

  for (const state of lr0.states) {
    for (const item of state.items) {
      const production = productions[item.prod]
      const next = production.rhs[item.dot]
      if (next) {
        const to = transitionMap.get(`${state.id}:${next}`)
        if (to === undefined) continue
        if (terminals.includes(next)) addAction(state.id, next, { type: 'shift', to })
        else if (gotoColumns.includes(next)) gotos[state.id][next] = to
      } else if (item.prod === 0) addAction(state.id, END, { type: 'accept' })
      else for (const lookahead of followSets[production.lhs] || []) addAction(state.id, lookahead, { type: 'reduce', prod: item.prod })
    }
  }

  const conflicts = []
  actions.forEach((row, stateId) => {
    Object.entries(row).forEach(([symbol, cell]) => {
      if (cell.length <= 1) return
      const hasShift = cell.some((action) => action.type === 'shift')
      const reduces = cell.filter((action) => action.type === 'reduce')
      conflicts.push({ stateId, symbol, actions: cell.map(actionKey), type: hasShift && reduces.length ? 'shift-reduce' : 'reduce-reduce', productions: reduces.map((action) => productions[action.prod].text) })
    })
  })

  const tableRows = lr0.states.map((state) => ({
    state: state.id,
    actions: Object.fromEntries(actionColumns.map((symbol) => [symbol, actionText(actions[state.id][symbol])])),
    gotos: Object.fromEntries(gotoColumns.map((symbol) => [symbol, gotos[state.id][symbol] ?? ''])),
  }))
  const parseTrace = parseSLR(tokenList, actions, gotos, productions)
  return {
    lr0,
    errors: [],
    actionColumns,
    gotoColumns,
    firstSets: showSets(firstSets, nonterminals),
    followSets: showSets(followSets, gotoColumns),
    actions,
    gotos,
    tableRows,
    conflicts,
    tokenList,
    parseTrace,
    isSLR1: conflicts.length === 0,
    parseAccepted: parseTrace.accepted,
    parseError: parseTrace.error,
  }
}

function emptySLR(lr0, tokenList) {
  return { lr0, errors: lr0.errors, actionColumns: [], gotoColumns: [], firstSets: [], followSets: [], actions: [], gotos: [], tableRows: [], conflicts: [], tokenList, parseTrace: { steps: [], accepted: false, error: '' }, isSLR1: false, parseAccepted: false, parseError: '' }
}
function first(productions, terminals, nonterminals) {
  const result = {}
  ;[...terminals, ...nonterminals].forEach((symbol) => { result[symbol] = new Set(terminals.includes(symbol) ? [symbol] : []) })
  let changed = true
  while (changed) {
    changed = false
    for (const production of productions) {
      const firstRhs = firstSequence(production.rhs, result, nonterminals)
      for (const symbol of firstRhs) {
        const size = result[production.lhs].size
        result[production.lhs].add(symbol)
        if (result[production.lhs].size !== size) changed = true
      }
    }
  }
  return result
}
function firstSequence(sequence, firstSets, nonterminals) {
  if (!sequence.length) return new Set([EPS])
  const result = new Set()
  let nullable = true
  for (const symbol of sequence) {
    const set = firstSets[symbol] || new Set(nonterminals.includes(symbol) ? [] : [symbol])
    set.forEach((item) => item !== EPS && result.add(item))
    if (!set.has(EPS)) { nullable = false; break }
  }
  if (nullable) result.add(EPS)
  return result
}
function follow(productions, startSymbol, firstSets, nonterminals) {
  const result = {}
  nonterminals.forEach((symbol) => { result[symbol] = new Set() })
  result[startSymbol]?.add(END)
  let changed = true
  while (changed) {
    changed = false
    for (const production of productions) {
      for (let i = 0; i < production.rhs.length; i += 1) {
        const B = production.rhs[i]
        if (!nonterminals.includes(B)) continue
        const suffixFirst = firstSequence(production.rhs.slice(i + 1), firstSets, nonterminals)
        for (const symbol of suffixFirst) {
          if (symbol === EPS) continue
          const size = result[B].size
          result[B].add(symbol)
          if (result[B].size !== size) changed = true
        }
        if (i === production.rhs.length - 1 || suffixFirst.has(EPS)) {
          for (const symbol of result[production.lhs] || []) {
            const size = result[B].size
            result[B].add(symbol)
            if (result[B].size !== size) changed = true
          }
        }
      }
    }
  }
  return result
}
function showSets(sets, symbols) {
  return symbols.map((symbol) => ({ symbol, values: [...(sets[symbol] || [])].sort((a, b) => (a === END ? 1 : b === END ? -1 : a.localeCompare(b))) }))
}
function parseSLR(tokens, actions, gotos, productions) {
  const input = [...tokens, END]
  const states = [0]
  const symbols = [END]
  const steps = []
  let ip = 0
  for (let step = 1; step < 2000; step += 1) {
    const state = states[states.length - 1]
    const lookahead = input[ip]
    const cell = actions[state]?.[lookahead] || []
    const action = cell[0]
    steps.push({ step, stateStack: `[${states.join(', ')}]`, symbolStack: `[${symbols.join(' ')}]`, input: input.slice(ip).join(' '), action: actionText(cell) || 'error', note: action ? actionNote(action, productions) : `ACTION[${state}, ${lookahead}] 为空`, conflict: cell.length > 1 })
    if (!action) return { steps, accepted: false, error: `ACTION[${state}, ${lookahead}] 为空` }
    if (cell.length > 1) return { steps, accepted: false, error: `ACTION[${state}, ${lookahead}] 存在冲突：${actionText(cell)}` }
    if (action.type === 'accept') return { steps, accepted: true, error: '' }
    if (action.type === 'shift') {
      symbols.push(lookahead)
      states.push(action.to)
      ip += 1
      continue
    }
    const production = productions[action.prod]
    production.rhs.forEach(() => { symbols.pop(); states.pop() })
    const to = gotos[states[states.length - 1]]?.[production.lhs]
    if (to === undefined) return { steps, accepted: false, error: `GOTO[${states[states.length - 1]}, ${production.lhs}] 为空` }
    symbols.push(production.lhs)
    states.push(to)
  }
  return { steps, accepted: false, error: '分析步数超过安全上限' }
}
function actionNote(action, productions) {
  return action.type === 'shift' ? `移进并进入状态 ${action.to}` : action.type === 'reduce' ? `按 (${action.prod}) ${productions[action.prod]?.text || ''} 规约` : '接受'
}
