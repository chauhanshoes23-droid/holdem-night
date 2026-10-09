/* ===== Poker engine (pure functions) ===== */
const START_CHIPS = 10000;
const LEVELS = [[50,100],[100,200],[150,300],[200,400],[300,600],[500,1000],[1000,2000],[2000,4000]];
const HANDS_PER_LEVEL = 8;
const RN = ['','','2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const SU = ['♠','♥','♦','♣'];
const CAT = ['High card','Pair','Two pair','Three of a kind','Straight','Flush','Full house','Four of a kind','Straight flush'];
const rk = c => c % 13 + 2, su = c => Math.floor(c / 13);
const clone = o => JSON.parse(JSON.stringify(o));
const cryptoObj = (typeof crypto !== 'undefined' && crypto.getRandomValues) ? crypto : require('crypto').webcrypto;
function rnd(n){ const a = new Uint32Array(1); cryptoObj.getRandomValues(a); return a[0] % n; }
function shuffle(a){ for (let i = a.length - 1; i > 0; i--){ const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function eval5(cs){
  const r = cs.map(rk).sort((a, b) => b - a);
  const flush = cs.every(c => su(c) === su(cs[0]));
  const cnt = {}; r.forEach(x => cnt[x] = (cnt[x] || 0) + 1);
  const g = Object.entries(cnt).map(([k, v]) => [+k, v]).sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  let top = 0;
  if (g.length === 5){ if (r[0] - r[4] === 4) top = r[0]; else if (r[0] === 14 && r[1] === 5) top = 5; }
  let cat, tb;
  if (top && flush){ cat = 8; tb = [top]; }
  else if (g[0][1] === 4){ cat = 7; tb = [g[0][0], g[1][0]]; }
  else if (g[0][1] === 3 && g[1][1] === 2){ cat = 6; tb = [g[0][0], g[1][0]]; }
  else if (flush){ cat = 5; tb = r; }
  else if (top){ cat = 4; tb = [top]; }
  else if (g[0][1] === 3){ cat = 3; tb = g.map(x => x[0]); }
  else if (g[0][1] === 2 && g[1][1] === 2){ cat = 2; tb = g.map(x => x[0]); }
  else if (g[0][1] === 2){ cat = 1; tb = g.map(x => x[0]); }
  else { cat = 0; tb = r; }
  let sc = cat; for (let i = 0; i < 5; i++) sc = sc * 15 + (tb[i] || 0);
  return sc;
}
function best7(cards){
  let best = -1;
  for (let a = 0; a < cards.length; a++) for (let b = a + 1; b < cards.length; b++){
    const five = cards.filter((_, i) => i !== a && i !== b);
    if (five.length === 5){ const s = eval5(five); if (s > best) best = s; }
  }
  return best;
}
const catOf = sc => Math.floor(sc / Math.pow(15, 5));

const nextIdx = (s, from, ok) => { const n = s.seats.length; for (let k = 1; k <= n; k++){ const i = (from + k + n * 2) % n; if (ok(s.seats[i])) return i; } return -1; };
const canAct = x => !x.folded && !x.allIn && x.chips > 0;
const nextActor = (s, from) => nextIdx(s, from, canAct);

function put(p, amt){
  amt = Math.max(0, Math.min(amt, p.chips));
  p.chips -= amt; p.bet += amt; p.total += amt;
  if (p.chips === 0) p.allIn = true;
  return amt;
}
function pushLog(s, t){ s.log.push(t); if (s.log.length > 40) s.log.shift(); }
const fmt = n => Number(n).toLocaleString('en-US');

function newGame(players){
  const s = { v: 0, hand: 0, phase: 'lobby', seats: [], dealer: -1, board: [], deck: [], log: [], result: null,
    currentBet: 0, minRaise: 100, sb: 50, bb: 100, turn: -1, turnAt: 0, started: Date.now() };
  players.forEach(p => s.seats.push({ id: p.id, name: p.name, chips: START_CHIPS }));
  return s;
}

function dealHand(s, players){
  s = clone(s);
  (players || []).forEach(p => {
    const ex = s.seats.find(x => x.id === p.id);
    if (ex) ex.name = p.name; else s.seats.push({ id: p.id, name: p.name, chips: START_CHIPS });
  });
  s.hand++;
  const lv = LEVELS[Math.min(Math.floor((s.hand - 1) / HANDS_PER_LEVEL), LEVELS.length - 1)];
  s.sb = lv[0]; s.bb = lv[1];
  s.seats.forEach(p => { p.bet = 0; p.total = 0; p.folded = p.chips <= 0; p.allIn = false; p.acted = false; p.hole = []; p.won = 0; p.shown = false; p.handName = ''; });
  const live = s.seats.filter(p => p.chips > 0);
  if (live.length < 2){ s.phase = 'over'; s.turn = -1; return s; }
  s.dealer = nextIdx(s, s.dealer, p => p.chips > 0);
  s.deck = shuffle(Array.from({ length: 52 }, (_, i) => i));
  s.board = []; s.result = null;
  for (let r = 0; r < 2; r++) s.seats.forEach(p => { if (p.chips > 0) p.hole.push(s.deck.pop()); });
  let sbI, bbI;
  if (live.length === 2){ sbI = s.dealer; bbI = nextIdx(s, sbI, p => p.chips > 0); }
  else { sbI = nextIdx(s, s.dealer, p => p.chips > 0); bbI = nextIdx(s, sbI, p => p.chips > 0); }
  s.sbI = sbI; s.bbI = bbI;
  put(s.seats[sbI], s.sb); put(s.seats[bbI], s.bb);
  s.currentBet = s.bb; s.minRaise = s.bb;
  s.phase = 'preflop'; s.result = null; s.log = s.log || [];
  pushLog(s, `Hand #${s.hand} · blinds ${fmt(s.sb)}/${fmt(s.bb)}`);
  s.turn = nextActor(s, bbI); s.turnAt = Date.now();
  return progress(s);
}

function roundDone(s){
  const act = s.seats.filter(canAct);
  if (act.length === 0) return true;
  if (act.length === 1) return act[0].bet >= s.currentBet;
  return act.every(x => x.acted && x.bet === s.currentBet);
}
const potOf = s => s.seats.reduce((a, x) => a + x.total, 0);

function progress(s){
  for (let guard = 0; guard < 10; guard++){
    const alive = s.seats.filter(x => !x.folded);
    if (alive.length === 1) return finishFold(s, alive[0]);
    if (!roundDone(s)) return s;
    if (s.phase === 'river') return showdown(s);
    nextStreet(s);
  }
  return s;
}
function nextStreet(s){
  s.seats.forEach(p => { p.bet = 0; p.acted = false; });
  s.currentBet = 0; s.minRaise = s.bb;
  if (s.phase === 'preflop'){ s.phase = 'flop'; s.board.push(s.deck.pop(), s.deck.pop(), s.deck.pop()); }
  else if (s.phase === 'flop'){ s.phase = 'turn'; s.board.push(s.deck.pop()); }
  else if (s.phase === 'turn'){ s.phase = 'river'; s.board.push(s.deck.pop()); }
  s.turn = nextActor(s, s.dealer); s.turnAt = Date.now();
}
function finishFold(s, w){
  const amt = potOf(s);
  w.chips += amt; w.won = amt - w.total;
  s.phase = 'showdown'; s.turn = -1;
  s.result = { reveal: false, pots: [{ amount: amt, winners: [w.id], name: '' }] };
  pushLog(s, `${w.name} wins ${fmt(amt)} (everyone folded)`);
  return s;
}
function computePots(s){
  const levels = [...new Set(s.seats.map(x => x.total).filter(t => t > 0))].sort((a, b) => a - b);
  let prev = 0, carry = 0; const pots = [];
  for (const L of levels){
    let amt = carry; carry = 0;
    s.seats.forEach(x => { amt += Math.max(0, Math.min(x.total, L) - prev); });
    const elig = s.seats.filter(x => !x.folded && x.total >= L);
    if (!elig.length){ carry = amt; prev = L; continue; }
    pots.push({ amount: amt, elig: elig.map(x => x.id) });
    prev = L;
  }
  if (carry && pots.length) pots[pots.length - 1].amount += carry;
  return pots;
}
function showdown(s){
  s.phase = 'showdown'; s.turn = -1;
  const score = {};
  s.seats.filter(x => !x.folded).forEach(x => { score[x.id] = best7([...x.hole, ...s.board]); x.shown = true; x.handName = CAT[catOf(score[x.id])]; });
  const res = [];
  const order = id => { const i = s.seats.findIndex(x => x.id === id); return (i - s.dealer + s.seats.length) % s.seats.length; };
  computePots(s).forEach(pot => {
    const top = Math.max(...pot.elig.map(id => score[id]));
    const ws = pot.elig.filter(id => score[id] === top).sort((a, b) => order(a) - order(b));
    const share = Math.floor(pot.amount / ws.length); let rem = pot.amount - share * ws.length;
    ws.forEach(id => { const p = s.seats.find(x => x.id === id); const g = share + (rem-- > 0 ? 1 : 0); p.chips += g; p.won += g; });
    res.push({ amount: pot.amount, winners: ws, name: CAT[catOf(top)] });
  });
  s.seats.forEach(p => { p.won = p.won - p.total; });
  s.result = { reveal: true, pots: res };
  res.forEach((r, i) => {
    const names = r.winners.map(id => s.seats.find(x => x.id === id).name).join(' & ');
    pushLog(s, `${names} ${r.winners.length > 1 ? 'split' : 'wins'} ${fmt(r.amount)} with ${r.name}${res.length > 1 ? (i ? ' (side pot)' : ' (main pot)') : ''}`);
  });
  return s;
}

function legalInfo(s, i){
  const p = s.seats[i];
  const toCall = Math.min(s.currentBet - p.bet, p.chips);
  const maxTo = p.bet + p.chips;
  const minTo = Math.min(maxTo, s.currentBet + s.minRaise);
  const canRaise = p.chips > toCall;
  return { toCall, maxTo, minTo, canRaise };
}
function applyAction(s0, type, amount){
  const s = clone(s0);
  const i = s.turn; if (i < 0) return s;
  const p = s.seats[i];
  if (type === 'fold'){ p.folded = true; pushLog(s, `${p.name} folds`); }
  else if (type === 'call'){
    const paid = put(p, s.currentBet - p.bet); p.acted = true;
    pushLog(s, paid ? `${p.name} calls ${fmt(paid)}${p.allIn ? ' (all-in)' : ''}` : `${p.name} checks`);
  } else if (type === 'raise'){
    const info = legalInfo(s, i);
    const to = Math.max(Math.min(Math.round(amount), info.maxTo), Math.min(info.minTo, info.maxTo));
    const wasBet = s.currentBet === 0;
    put(p, to - p.bet);
    const by = p.bet - s.currentBet;
    if (p.bet > s.currentBet){
      if (by >= s.minRaise){ s.minRaise = by; s.seats.forEach(x => { if (x !== p && canAct(x)) x.acted = false; }); }
      s.currentBet = p.bet;
    }
    p.acted = true;
    pushLog(s, `${p.name} ${p.allIn ? 'goes all-in for ' + fmt(p.bet) : (wasBet ? 'bets ' : 'raises to ') + fmt(p.bet)}`);
  }
  s.turn = nextActor(s, i); s.turnAt = Date.now();
  return progress(s);
}
if (typeof module !== 'undefined') module.exports = { newGame, dealHand, applyAction, legalInfo, potOf, best7, eval5, START_CHIPS, canAct };
