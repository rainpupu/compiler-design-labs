import { SAMPLE_GRAMMAR, buildLR0 } from './lr0.js'
export { SAMPLE_GRAMMAR }
export const SAMPLE_TOKENS = 'id + id * id'
const END = '$', EPS = 'ε'
const key = (a) => a?.type === 'shift' ? `s${a.to}` : a?.type === 'reduce' ? `r${a.prod}` : a?.type === 'accept' ? 'acc' : ''
const fmt = (xs) => xs?.length ? xs.map(key).join(' / ') : ''
const toks = (s) => String(s || '').trim().match(/[A-Za-z_][A-Za-z0-9_']*|\$|[^\s,]/g) || []

export function buildSLR1(grammar, tokenText = SAMPLE_TOKENS) {
  const lr0 = buildLR0(grammar), tokenList = toks(tokenText)
  if (lr0.errors.length) return empty(lr0, tokenList)
  const P = lr0.productions, T = [...lr0.terminals].sort(), N = [...lr0.nonterminals].sort(), G = N.filter(x => x !== lr0.augmentedStart)
  const Acols = [...new Set([...T, END])], F = first(P, T, N), Follow = follow(P, lr0.startSymbol, F, N)
  const trans = new Map(lr0.transitions.map(e => [`${e.from}:${e.symbol}`, e.to]))
  const actions = lr0.states.map(() => ({})), gotos = lr0.states.map(() => ({}))
  const add = (i, s, a) => { (actions[i][s] ||= []); if (!actions[i][s].some(x => key(x) === key(a))) actions[i][s].push(a) }
  for (const st of lr0.states) for (const it of st.items) {
    const p = P[it.prod], nx = p.rhs[it.dot]
    if (nx) { const to = trans.get(`${st.id}:${nx}`); if (to === undefined) continue; T.includes(nx) ? add(st.id, nx, { type:'shift', to }) : G.includes(nx) && (gotos[st.id][nx] = to) }
    else if (it.prod === 0) add(st.id, END, { type:'accept' })
    else for (const la of Follow[p.lhs] || []) add(st.id, la, { type:'reduce', prod:it.prod })
  }
  const conflicts = []
  actions.forEach((row, i) => Object.entries(row).forEach(([s, c]) => { if (c.length > 1) { const sh = c.some(a => a.type === 'shift'), rs = c.filter(a => a.type === 'reduce'); conflicts.push({ stateId:i, symbol:s, actions:c.map(key), type: sh && rs.length ? 'shift-reduce' : 'reduce-reduce', productions:rs.map(a => P[a.prod].text) }) } }))
  const tableRows = lr0.states.map(st => ({ state:st.id, actions:Object.fromEntries(Acols.map(s => [s, fmt(actions[st.id][s])])), gotos:Object.fromEntries(G.map(s => [s, gotos[st.id][s] ?? ''])) }))
  const parseTrace = parse(tokenList, actions, gotos, P)
  return { lr0, errors:[], actionColumns:Acols, gotoColumns:G, firstSets:show(F, N), followSets:show(Follow, G), actions, gotos, tableRows, conflicts, tokenList, parseTrace, isSLR1:conflicts.length===0, parseAccepted:parseTrace.accepted, parseError:parseTrace.error }
}
function empty(lr0, tokenList){ return { lr0, errors:lr0.errors, actionColumns:[], gotoColumns:[], firstSets:[], followSets:[], actions:[], gotos:[], tableRows:[], conflicts:[], tokenList, parseTrace:{steps:[],accepted:false,error:''}, isSLR1:false, parseAccepted:false, parseError:'' } }
function first(P,T,N){ const F={}; [...T,...N].forEach(s=>F[s]=new Set(T.includes(s)?[s]:[])); let ch=true; while(ch){ ch=false; for(const p of P){ const r=firstSeq(p.rhs,F,N); for(const x of r){ const n=F[p.lhs].size; F[p.lhs].add(x); if(F[p.lhs].size!==n) ch=true } } } return F }
function firstSeq(seq,F,N){ if(!seq.length) return new Set([EPS]); const r=new Set(); let nullable=true; for(const s of seq){ const f=F[s] || new Set(N.includes(s)?[]:[s]); f.forEach(x=>x!==EPS && r.add(x)); if(!f.has(EPS)){ nullable=false; break } } if(nullable) r.add(EPS); return r }
function follow(P,start,F,N){ const R={}; N.forEach(s=>R[s]=new Set()); R[start]?.add(END); let ch=true; while(ch){ ch=false; for(const p of P) for(let i=0;i<p.rhs.length;i++){ const B=p.rhs[i]; if(!N.includes(B)) continue; const f=firstSeq(p.rhs.slice(i+1),F,N); for(const x of f) if(x!==EPS){ const n=R[B].size; R[B].add(x); if(R[B].size!==n) ch=true } if(i===p.rhs.length-1 || f.has(EPS)) for(const x of R[p.lhs]||[]){ const n=R[B].size; R[B].add(x); if(R[B].size!==n) ch=true } } } return R }
function show(S, syms){ return syms.map(symbol => ({ symbol, values:[...(S[symbol]||[])].sort((a,b)=>a===END?1:b===END?-1:a.localeCompare(b)) })) }
function parse(tokens,A,G,P){ const input=[...tokens,END], states=[0], symbols=[END], steps=[]; let ip=0; for(let n=1;n<1000;n++){ const st=states.at(-1), la=input[ip], cell=A[st]?.[la]||[], a=cell[0]; steps.push({ step:n, stateStack:`[${states.join(', ')}]`, symbolStack:`[${symbols.join(' ')}]`, input:input.slice(ip).join(' '), action:fmt(cell)||'error', note:a?note(a,P):`ACTION[${st}, ${la}] is empty`, conflict:cell.length>1 }); if(!a) return {steps,accepted:false,error:`ACTION[${st}, ${la}] is empty`}; if(cell.length>1) return {steps,accepted:false,error:`Conflict at ACTION[${st}, ${la}]`}; if(a.type==='accept') return {steps,accepted:true,error:''}; if(a.type==='shift'){ symbols.push(la); states.push(a.to); ip++; continue } const p=P[a.prod]; p.rhs.forEach(()=>{symbols.pop(); states.pop()}); const to=G[states.at(-1)]?.[p.lhs]; if(to===undefined) return {steps,accepted:false,error:`GOTO[${states.at(-1)}, ${p.lhs}] is empty`}; symbols.push(p.lhs); states.push(to) } return {steps,accepted:false,error:'Parsing stopped after too many steps'} }
function note(a,P){ return a.type==='shift' ? `shift to state ${a.to}` : a.type==='reduce' ? `reduce by (${a.prod}) ${P[a.prod]?.text||''}` : 'accept' }
const esc = v => String(v).replace(/\\/g,'\\\\').replace(/"/g,'\\"')
export function makeSLR1Dot(r, mode='dark', lang='zh'){ const lr0=r?.lr0; if(!lr0 || lr0.errors?.length) return ''; const dark=mode==='dark', bg=dark?'#1e1e1e':'#fff', nb=dark?'#252526':'#fff', bd=dark?'#4b5563':'#111827', tx=dark?'#d4d4d4':'#111827'; const lines=['digraph SLR1_DFA {','  rankdir=LR;',`  graph [bgcolor="${bg}", pad="0.35", nodesep="0.55", ranksep="0.9"];`,`  node [shape=box, style="rounded,filled", fontname="Consolas", fontsize=12, color="${bd}", fontcolor="${tx}", fillcolor="${nb}"];`]; for(const st of lr0.states){ const row=r.tableRows.find(x=>x.state===st.id), acts=row?Object.entries(row.actions).filter(([,v])=>v).map(([s,v])=>`${s}:${v}`):[], cs=r.conflicts.filter(c=>c.stateId===st.id); const lab=[`I${st.id}`,...st.items.map(i=>i.text)]; if(acts.length) lab.push('',`[ACTION] ${acts.join('  ')}`); if(cs.length) lab.push('',lang==='zh'?'[SLR(1) 冲突]':'[SLR(1) Conflict]',...cs.map(c=>`${c.symbol}: ${c.actions.join('/')}`)); lines.push(`  I${st.id} [label="${lab.map(esc).join('\\n')}", fillcolor="${cs.length?'#fee2e2':nb}", color="${cs.length?'#ef4444':bd}", fontcolor="${cs.length?'#111827':tx}", penwidth=2];`) } lr0.transitions.forEach(e=>lines.push(`  I${e.from} -> I${e.to} [label="${esc(e.symbol)}"];`)); return lines.concat('}').join('\n') }
export function makeSLR1Report(r, grammar, tokens, lang='zh'){ if(r.errors.length) return `# SLR(1) 分析报告\n\n${r.errors.map(e=>`- ${e}`).join('\n')}\n`; const L=['# SLR(1) 分析报告','','## 输入文法','```text',grammar.trim(),'```','','## 输入 token 串','```text',tokens.trim(),'```','','## 结论','',`- 状态数量: ${r.lr0.states.length}`,`- ACTION 列: ${r.actionColumns.join(', ')}`,`- GOTO 列: ${r.gotoColumns.join(', ')}`,`- SLR(1) 冲突: ${r.conflicts.length}`,`- 分析结果: ${r.parseAccepted?'ACCEPT':'ERROR'}`,'','## FOLLOW']; r.followSets.forEach(x=>L.push(`- FOLLOW(${x.symbol}) = { ${x.values.join(', ')} }`)); L.push('','## ACTION / GOTO'); L.push(['state',...r.actionColumns.map(x=>`ACTION[${x}]`),...r.gotoColumns.map(x=>`GOTO[${x}]`)].join(' | ')); r.tableRows.forEach(row=>L.push([row.state,...r.actionColumns.map(x=>row.actions[x]||''),...r.gotoColumns.map(x=>row.gotos[x]??'')].join(' | '))); L.push('','## 分析过程'); r.parseTrace.steps.forEach(s=>L.push(`- ${s.step}. ${s.stateStack} ${s.symbolStack} | ${s.input} | ${s.action} | ${s.note}`)); return L.join('\n') }
