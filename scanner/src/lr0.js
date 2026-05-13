export const SAMPLE_GRAMMAR = `E -> E + T | T
T -> T * F | F
F -> ( E ) | id`

function stripBOM(value) {
  return String(value || '').replace(/^\uFEFF/, '')
}

function normalizeArrow(line) {
  return line.replace(/→/g, '->').replace(/=>/g, '->')
}

function tokenizeRhs(rhs) {
  const text = rhs.trim()
  if (!text || ['ε', 'epsilon', 'eps', '@'].includes(text)) return []
  if (/\s/.test(text)) return text.split(/\s+/).filter(Boolean)
  return text.match(/[A-Za-z_][A-Za-z0-9_']*|[^\s]/g) || []
}

function itemKey(item) {
  return `${item.prod}.${item.dot}`
}

function itemSetKey(items) {
  return [...items].map(itemKey).sort().join(';')
}

function addUniqueItem(set, item) {
  const key = itemKey(item)
  if (set.has(key)) return false
  set.set(key, item)
  return true
}

function itemText(productions, item) {
  const p = productions[item.prod]
  const rhs = [...p.rhs]
  rhs.splice(item.dot, 0, '·')
  return `${p.lhs} -> ${rhs.length ? rhs.join(' ') : '·'}`
}

function productionText(p) {
  return `${p.lhs} -> ${p.rhs.length ? p.rhs.join(' ') : 'ε'}`
}

export function buildLR0(input) {
  const rawProductions = []
  const nonterminals = new Set()
  const errors = []
  const lines = stripBOM(input)
    .split(/\r?\n/)
    .map((line) => stripBOM(line).trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith('//'))

  for (const [index, rawLine] of lines.entries()) {
    const line = normalizeArrow(rawLine)
    const pos = line.indexOf('->')
    if (pos < 0) {
      errors.push(`Line ${index + 1}: missing ->`)
      continue
    }

    const lhs = line.slice(0, pos).trim()
    const rhsAll = line.slice(pos + 2).trim()

    if (!lhs || !rhsAll) {
      errors.push(`Line ${index + 1}: empty left or right side`)
      continue
    }

    nonterminals.add(lhs)
    for (const alt of rhsAll.split('|')) {
      rawProductions.push({ lhs, rhs: tokenizeRhs(alt) })
    }
  }

  if (!rawProductions.length) {
    errors.push('Please input at least one production, for example: E -> E + T | T')
    return emptyResult(errors)
  }

  if (errors.length) return emptyResult(errors)

  const startSymbol = rawProductions[0].lhs
  let augmentedStart = `${startSymbol}'`
  while (nonterminals.has(augmentedStart)) augmentedStart += "'"

  const productions = [{ lhs: augmentedStart, rhs: [startSymbol] }, ...rawProductions]
  nonterminals.add(augmentedStart)

  const terminals = new Set()
  for (const p of productions) {
    for (const sym of p.rhs) {
      if (!nonterminals.has(sym)) terminals.add(sym)
    }
  }

  function closure(items) {
    const result = new Map()
    for (const item of items) addUniqueItem(result, item)

    let changed = true
    while (changed) {
      changed = false
      for (const item of [...result.values()]) {
        const p = productions[item.prod]
        const next = p.rhs[item.dot]
        if (!next || !nonterminals.has(next)) continue

        for (let i = 0; i < productions.length; i += 1) {
          if (productions[i].lhs === next) {
            changed = addUniqueItem(result, { prod: i, dot: 0 }) || changed
          }
        }
      }
    }

    return [...result.values()].sort(compareItems)
  }

  function goTo(items, symbol) {
    const moved = []
    for (const item of items) {
      const p = productions[item.prod]
      if (p.rhs[item.dot] === symbol) moved.push({ prod: item.prod, dot: item.dot + 1 })
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
      const p = productions[item.prod]
      const next = p.rhs[item.dot]
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

  const conflicts = displayStates.map((state) => getConflictInfo(state, productions, terminals))
  const hasConflict = conflicts.some((c) => c.shiftReduce || c.reduceReduce)

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
    summary: hasConflict
      ? 'Conflict found. This grammar is not LR(0).'
      : 'No conflict found. This grammar is LR(0).',
  }
}

function emptyResult(errors) {
  return {
    errors,
    startSymbol: '',
    augmentedStart: '',
    productions: [],
    nonterminals: [],
    terminals: [],
    states: [],
    transitions: [],
    conflicts: [],
    isLR0: false,
    summary: '',
  }
}

function compareItems(a, b) {
  if (a.prod !== b.prod) return a.prod - b.prod
  return a.dot - b.dot
}

function getConflictInfo(state, productions, terminals) {
  const reduceItems = []
  const shiftSymbols = []

  for (const item of state.items) {
    const p = productions[item.prod]
    if (item.dot === p.rhs.length) {
      if (item.prod !== 0) reduceItems.push(item.text)
    } else {
      const next = p.rhs[item.dot]
      if (terminals.has(next)) shiftSymbols.push(next)
    }
  }

  const uniqueShiftSymbols = [...new Set(shiftSymbols)].sort()
  return {
    stateId: state.id,
    shiftReduce: reduceItems.length > 0 && uniqueShiftSymbols.length > 0,
    reduceReduce: reduceItems.length >= 2,
    reduceItems,
    shiftSymbols: uniqueShiftSymbols,
  }
}

export function makeLR0Dot(result) {
  if (!result || result.errors?.length || !result.states?.length) return ''
  const lines = ['digraph LR0 {', '  rankdir=LR;', '  node [shape=box, style="rounded,filled", fontname="Consolas"];']

  for (const state of result.states) {
    const conflict = result.conflicts[state.id]
    const fill = conflict.shiftReduce && conflict.reduceReduce ? 'plum' : conflict.shiftReduce ? 'lightyellow' : conflict.reduceReduce ? 'mistyrose' : 'white'
    const color = conflict.shiftReduce && conflict.reduceReduce ? 'purple' : conflict.shiftReduce ? 'orange' : conflict.reduceReduce ? 'red' : 'black'
    const linesText = [`I${state.id}`, ...state.items.map((item) => item.text)]
    if (conflict.shiftReduce) linesText.push('', '[SR Conflict]', `Shift on: ${conflict.shiftSymbols.join(', ')}`)
    if (conflict.reduceReduce) linesText.push('', '[RR Conflict]')
    const label = linesText.map(escapeDot).join('\\n')
    lines.push(`  I${state.id} [label="${label}", fillcolor="${fill}", color="${color}", penwidth=2];`)
  }

  for (const edge of result.transitions) {
    lines.push(`  I${edge.from} -> I${edge.to} [label="${escapeDot(edge.symbol)}"];`)
  }

  lines.push('}')
  return lines.join('\n')
}

function escapeDot(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}
