export const SAMPLE_CODE =
  'while(true){int a=0;float b=12.3E+4;a+=1;b=b+-0.5;if(a>=10&&b!=.66){print(a);}else{input(b);}}'

const KEYWORDS = new Map([
  ['int', 'INT'],
  ['float', 'FLOAT'],
  ['void', 'VOID'],
  ['if', 'IF'],
  ['else', 'ELSE'],
  ['while', 'WHILE'],
  ['return', 'RETURN'],
  ['input', 'INPUT'],
  ['print', 'PRINT'],
])

const VALUE_TOKENS = new Set(['ID', 'NUM', 'FLO', 'RPAR', 'RBK', 'RBR'])

function isLetter(ch) {
  return /^[A-Za-z]$/.test(ch || '')
}

function isDigit(ch) {
  return /^[0-9]$/.test(ch || '')
}

function isIdChar(ch) {
  return /^[A-Za-z0-9]$/.test(ch || '')
}

function scanNumber(code, start, allowSign = false) {
  let i = start

  if (allowSign && i < code.length && '+-'.includes(code[i])) {
    i++
  }

  const beforeStart = i
  while (i < code.length && isDigit(code[i])) {
    i++
  }
  const hasBefore = i > beforeStart

  let hasDot = false
  let hasAfter = false
  if (i < code.length && code[i] === '.') {
    hasDot = true
    i++

    const afterStart = i
    while (i < code.length && isDigit(code[i])) {
      i++
    }
    hasAfter = i > afterStart
  }

  if (!hasBefore && !(hasDot && hasAfter)) {
    return null
  }

  let hasExp = false
  if (i < code.length && 'eE'.includes(code[i])) {
    const save = i
    let j = i + 1

    if (j < code.length && '+-'.includes(code[j])) {
      j++
    }

    const expStart = j
    while (j < code.length && isDigit(code[j])) {
      j++
    }

    if (j > expStart) {
      hasExp = true
      i = j
    } else {
      i = save
    }
  }

  return {
    type: hasDot || hasExp ? 'FLO' : 'NUM',
    lexeme: code.slice(start, i),
    start,
    end: i,
    line: 0,
  }
}

export function scan(code) {
  const tokens = []
  let i = 0
  let line = 1
  let expectOperand = true

  function push(type, lexeme, start, end, tokenLine) {
    tokens.push({ type, lexeme, start, end, line: tokenLine })
    expectOperand = !VALUE_TOKENS.has(type)
  }

  while (i < code.length) {
    const ch = code[i]

    if (ch === '\n') {
      line++
      i++
      continue
    }

    if (/\s/.test(ch)) {
      i++
      continue
    }

    if (isLetter(ch)) {
      const start = i
      const tokenLine = line
      i++

      while (i < code.length && isIdChar(code[i])) {
        i++
      }

      const lexeme = code.slice(start, i)
      push(KEYWORDS.get(lexeme) || 'ID', lexeme, start, i, tokenLine)
      continue
    }

    if (isDigit(ch)) {
      const tokenLine = line
      const result = scanNumber(code, i, false)
      push(result.type, result.lexeme, result.start, result.end, tokenLine)
      i = result.end
      continue
    }

    if (ch === '.') {
      const tokenLine = line
      const result = scanNumber(code, i, false)

      if (result) {
        push(result.type, result.lexeme, result.start, result.end, tokenLine)
        i = result.end
      } else {
        push('DOT', '.', i, i + 1, tokenLine)
        i++
      }
      continue
    }

    if (ch === '+') {
      const tokenLine = line
      const next = code[i + 1] || ''
      const next2 = code[i + 2] || ''

      if (next === '+') {
        push('AAA', '++', i, i + 2, tokenLine)
        i += 2
      } else if (next === '=') {
        push('AAS', '+=', i, i + 2, tokenLine)
        i += 2
      } else if (expectOperand && (isDigit(next) || (next === '.' && isDigit(next2)))) {
        const result = scanNumber(code, i, true)
        push(result.type, result.lexeme, result.start, result.end, tokenLine)
        i = result.end
      } else {
        push('ADD', '+', i, i + 1, tokenLine)
        i++
      }
      continue
    }

    if (ch === '-') {
      const tokenLine = line
      const next = code[i + 1] || ''
      const next2 = code[i + 2] || ''

      if (expectOperand && (isDigit(next) || (next === '.' && isDigit(next2)))) {
        const result = scanNumber(code, i, true)
        push(result.type, result.lexeme, result.start, result.end, tokenLine)
        i = result.end
      } else {
        push('SUB', '-', i, i + 1, tokenLine)
        i++
      }
      continue
    }

    if (ch === '*') {
      push('MUL', '*', i, i + 1, line)
      i++
      continue
    }

    if (ch === '/') {
      if (code[i + 1] === '/') {
        while (i < code.length && code[i] !== '\n') {
          i++
        }
      } else {
        push('DIV', '/', i, i + 1, line)
        i++
      }
      continue
    }

    if (ch === '<') {
      if (code[i + 1] === '=') {
        push('ROP', '<=', i, i + 2, line)
        i += 2
      } else {
        push('ROP', '<', i, i + 1, line)
        i++
      }
      continue
    }

    if (ch === '>') {
      if (code[i + 1] === '=') {
        push('ROP', '>=', i, i + 2, line)
        i += 2
      } else {
        push('ROP', '>', i, i + 1, line)
        i++
      }
      continue
    }

    if (ch === '=') {
      if (code[i + 1] === '=') {
        push('ROP', '==', i, i + 2, line)
        i += 2
      } else {
        push('ASG', '=', i, i + 1, line)
        i++
      }
      continue
    }

    if (ch === '!') {
      if (code[i + 1] === '=') {
        push('ROP', '!=', i, i + 2, line)
        i += 2
      } else {
        push('BOP', '!', i, i + 1, line)
        i++
      }
      continue
    }

    if (ch === '&') {
      if (code[i + 1] === '&') {
        push('BOP', '&&', i, i + 2, line)
        i += 2
      } else {
        push('ERROR', ch, i, i + 1, line)
        i++
      }
      continue
    }

    if (ch === '|') {
      if (code[i + 1] === '|') {
        push('BOP', '||', i, i + 2, line)
        i += 2
      } else {
        push('ERROR', ch, i, i + 1, line)
        i++
      }
      continue
    }

    const oneCharMap = {
      '(': 'LPAR',
      ')': 'RPAR',
      '[': 'LBK',
      ']': 'RBK',
      '{': 'LBR',
      '}': 'RBR',
      ',': 'CMA',
      ':': 'COL',
      ';': 'SEMI',
    }

    if (oneCharMap[ch]) {
      push(oneCharMap[ch], ch, i, i + 1, line)
      i++
      continue
    }

    push('ERROR', ch, i, i + 1, line)
    i++
  }

  return tokens
}

export function tokenClass(type) {
  if (['INT', 'FLOAT', 'VOID', 'IF', 'ELSE', 'WHILE', 'RETURN', 'INPUT', 'PRINT'].includes(type)) {
    return 'tok-kw'
  }
  if (type === 'ID') return 'tok-id'
  if (['NUM', 'FLO'].includes(type)) return 'tok-num'
  if (['ADD', 'SUB', 'MUL', 'DIV', 'ROP', 'BOP', 'ASG', 'AAS', 'AAA', 'DOT'].includes(type)) return 'tok-op'
  if (['LPAR', 'RPAR', 'LBK', 'RBK', 'LBR', 'RBR', 'CMA', 'COL', 'SEMI'].includes(type)) return 'tok-punc'
  return 'tok-err'
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
