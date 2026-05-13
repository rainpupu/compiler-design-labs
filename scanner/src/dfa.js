function isDigit(ch) {
  return /^[0-9]$/.test(ch || '')
}

export function dfaPathForToken(token) {
  if (!token) return []

  const path = ['q0']

  if (['ID', 'INT', 'FLOAT', 'VOID', 'IF', 'ELSE', 'WHILE', 'RETURN', 'INPUT', 'PRINT'].includes(token.type)) {
    for (let i = 0; i < token.lexeme.length; i++) {
      path.push('qID')
    }
    path.push(token.type === 'ID' ? 'accept_ID' : 'accept_KEY')
    return path
  }

  if (['NUM', 'FLO'].includes(token.type)) {
    let state = 'qNUM'

    for (const ch of token.lexeme) {
      if (ch === '.') {
        state = 'qDOT'
      } else if ('eE'.includes(ch)) {
        state = 'qEXP'
      } else if ('+-'.includes(ch) && path.length > 1) {
        state = 'qESIGN'
      } else if (isDigit(ch) && ['qEXP', 'qESIGN'].includes(state)) {
        state = 'qENUM'
      }

      path.push(state)
    }

    path.push(token.type === 'NUM' ? 'accept_NUM' : 'accept_FLO')
    return path
  }

  if (['ADD', 'SUB', 'MUL', 'DIV', 'ROP', 'BOP', 'ASG', 'AAS', 'AAA', 'DOT'].includes(token.type)) {
    return ['q0', 'qOP', `accept_${token.type}`]
  }

  if (['LPAR', 'RPAR', 'LBK', 'RBK', 'LBR', 'RBR', 'CMA', 'COL', 'SEMI'].includes(token.type)) {
    return ['q0', 'qDLI', `accept_${token.type}`]
  }

  return ['q0', 'dead']
}

export function buildGraph(token) {
  if (!token) return { nodes: [], edges: [], accept: '' }

  const accept = `accept_${token.type}`

  if (['ID', 'INT', 'FLOAT', 'VOID', 'IF', 'ELSE', 'WHILE', 'RETURN', 'INPUT', 'PRINT'].includes(token.type)) {
    return {
      nodes: ['q0', 'qID', accept],
      edges: [
        { from: 'q0', to: 'qID', label: 'letter' },
        { from: 'qID', to: 'qID', label: 'letter|digit' },
        { from: 'qID', to: accept, label: 'end' },
      ],
      accept,
    }
  }

  if (token.type === 'NUM') {
    return {
      nodes: ['q0', 'qNUM', accept],
      edges: [
        { from: 'q0', to: 'qNUM', label: 'digit' },
        { from: 'qNUM', to: 'qNUM', label: 'digit' },
        { from: 'qNUM', to: accept, label: 'end' },
      ],
      accept,
    }
  }

  if (token.type === 'FLO') {
    return {
      nodes: ['q0', 'qNUM', 'qDOT', 'qFRAC', 'qEXP', 'qESIGN', 'qENUM', accept],
      edges: [
        { from: 'q0', to: 'qNUM', label: 'digit|sign' },
        { from: 'qNUM', to: 'qNUM', label: 'digit' },
        { from: 'qNUM', to: 'qDOT', label: '.' },
        { from: 'qDOT', to: 'qFRAC', label: 'digit' },
        { from: 'qFRAC', to: 'qFRAC', label: 'digit' },
        { from: 'qNUM', to: 'qEXP', label: 'e|E' },
        { from: 'qFRAC', to: 'qEXP', label: 'e|E' },
        { from: 'qEXP', to: 'qESIGN', label: '+|-' },
        { from: 'qEXP', to: 'qENUM', label: 'digit' },
        { from: 'qESIGN', to: 'qENUM', label: 'digit' },
        { from: 'qENUM', to: 'qENUM', label: 'digit' },
        { from: 'qFRAC', to: accept, label: 'end' },
        { from: 'qENUM', to: accept, label: 'end' },
      ],
      accept,
    }
  }

  if (['ADD', 'SUB', 'MUL', 'DIV', 'ROP', 'BOP', 'ASG', 'AAS', 'AAA', 'DOT'].includes(token.type)) {
    return {
      nodes: ['q0', 'qOP', accept],
      edges: [
        { from: 'q0', to: 'qOP', label: token.lexeme },
        { from: 'qOP', to: accept, label: 'end' },
      ],
      accept,
    }
  }

  if (['LPAR', 'RPAR', 'LBK', 'RBK', 'LBR', 'RBR', 'CMA', 'COL', 'SEMI'].includes(token.type)) {
    return {
      nodes: ['q0', 'qDLI', accept],
      edges: [
        { from: 'q0', to: 'qDLI', label: token.lexeme },
        { from: 'qDLI', to: accept, label: 'end' },
      ],
      accept,
    }
  }

  return {
    nodes: ['q0', 'dead'],
    edges: [{ from: 'q0', to: 'dead', label: token.lexeme }],
    accept: 'dead',
  }
}

function dotId(value) {
  return String(value).replace(/[^A-Za-z0-9_]/g, '_')
}

export function makeDot(graph) {
  if (!graph || graph.nodes.length === 0) return ''

  const lines = ['digraph DFA {', '  rankdir=LR;', '  node [shape=circle];']

  for (const node of graph.nodes) {
    const shape = node.startsWith('accept_') ? 'doublecircle' : 'circle'
    lines.push(`  ${dotId(node)} [shape=${shape}, label="${node}"];`)
  }

  lines.push('  start [shape=point];')
  lines.push('  start -> q0;')

  for (const edge of graph.edges) {
    const label = String(edge.label).replace(/"/g, '\\"')
    lines.push(`  ${dotId(edge.from)} -> ${dotId(edge.to)} [label="${label}"];`)
  }

  lines.push('}')
  return lines.join('\n')
}
