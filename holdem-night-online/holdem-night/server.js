// Hold'em Night server: serves the page and runs every table over WebSockets.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const E = require('./engine.js');

const PORT = process.env.PORT || 3000;
const indexPath = path.join(__dirname, 'public', 'index.html');
const server = http.createServer((req, res) => {
  if (req.url === '/healthz'){ res.writeHead(200); return res.end('ok'); }
  fs.readFile(indexPath, (err, data) => {
    if (err){ res.writeHead(500); return res.end('Missing public/index.html'); }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
    res.end(data);
  });
});
const wss = new WebSocketServer({ server, maxPayload: 4096 });
const rooms = new Map();
const MAX_PLAYERS = 8, AUTO_NEXT_MS = 9000;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const out = (ws, o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
const cleanName = s => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 14);
const newCode = () => { for (;;){ let c = ''; for (let i = 0; i < 5; i++) c += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]; if (!rooms.has(c)) return c; } };

function viewFor(room, pid){
  if (!room.game) return null;
  const g = JSON.parse(JSON.stringify(room.game));
  delete g.deck;
  g.seats.forEach(s => { if (s.id !== pid && !s.shown) s.hole = (s.hole || []).map(() => -1); });
  return g;
}
function sendRoom(room, ws){
  out(ws, { t: 'room', hostId: room.hostId, players: room.players.map(p => ({ id: p.id, name: p.name, t: p.t, online: room.conns.has(p.id) })) });
}
function sendGame(room, ws, pid){ out(ws, { t: 'game', game: viewFor(room, pid) }); }
function broadcast(room){
  room.conns.forEach((ws, pid) => { sendRoom(room, ws); sendGame(room, ws, pid); });
}
function broadcastChat(room){ room.conns.forEach(ws => out(ws, { t: 'chat', msgs: room.chat.slice(-60) })); }

function setGame(room, g){
  g.v = (room.game ? room.game.v : 0) + 1;
  room.game = g;
  clearTimeout(room.timer);
  if (g.phase === 'showdown'){
    const v = g.v;
    room.timer = setTimeout(() => { if (room.game && room.game.v === v) setGame(room, E.dealHand(room.game, room.players)); }, AUTO_NEXT_MS);
  }
  room.touched = Date.now();
  broadcast(room);
}

function attach(room, ws, pid, name){
  const old = room.conns.get(pid);
  if (old && old !== ws){ old.pid = null; try { old.close(); } catch(e){} }
  room.conns.set(pid, ws);
  ws.pid = pid; ws.code = room.code;
  let p = room.players.find(x => x.id === pid);
  if (p) p.name = name || p.name; else room.players.push({ id: pid, name, t: Date.now() });
  out(ws, { t: 'joined', code: room.code });
  out(ws, { t: 'chat', msgs: room.chat.slice(-60) });
  broadcast(room);
}

wss.on('connection', ws => {
  ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; });
  let budget = 30, last = Date.now();
  ws.on('message', raw => {
    const now = Date.now(); budget = Math.min(30, budget + (now - last) / 100); last = now;
    if (--budget < 0) return;
    let m; try { m = JSON.parse(raw.toString()); } catch(e){ return; }
    if (!m || typeof m.t !== 'string' || m.t === 'ping') return;
    const pid = typeof m.pid === 'string' && /^[A-Za-z0-9_-]{6,40}$/.test(m.pid) ? m.pid : null;

    if (m.t === 'create'){
      const name = cleanName(m.name);
      if (!pid || !name) return out(ws, { t: 'err', msg: 'Type a name first.' });
      if (rooms.size > 500) return out(ws, { t: 'err', msg: 'The server is busy. Try again later.' });
      const room = { code: newCode(), hostId: pid, players: [], conns: new Map(), game: null, chat: [], timer: null, touched: Date.now() };
      rooms.set(room.code, room);
      return attach(room, ws, pid, name);
    }
    if (m.t === 'join'){
      const name = cleanName(m.name), code = String(m.code || '').toUpperCase();
      const room = rooms.get(code);
      if (!pid || !name) return out(ws, { t: 'err', msg: 'Type a name first.' });
      if (!room) return out(ws, { t: 'err', msg: 'No party with that code.', fatal: true });
      const known = room.players.some(p => p.id === pid);
      if (!known && room.players.length >= MAX_PLAYERS) return out(ws, { t: 'err', msg: 'That table is full (8 players).', fatal: true });
      return attach(room, ws, pid, name);
    }

    const room = rooms.get(ws.code); const me = ws.pid;
    if (!room || !me) return;
    room.touched = Date.now();
    const g = room.game;

    if (m.t === 'start'){
      if (room.hostId !== me || room.players.length < 2) return;
      if (g && g.phase !== 'over' && g.phase !== 'lobby') return;
      return setGame(room, E.dealHand(E.newGame(room.players), room.players));
    }
    if (m.t === 'next'){
      if (g && g.phase === 'showdown' && Date.now() - g.turnAt > 1500) setGame(room, E.dealHand(g, room.players));
      return;
    }
    if (m.t === 'act'){
      if (!g || g.turn < 0 || g.phase === 'showdown' || g.phase === 'over' || g.seats[g.turn].id !== me) return;
      const type = m.type, amt = Number(m.amount);
      if (type !== 'fold' && type !== 'call' && type !== 'raise') return;
      if (type === 'raise' && !Number.isFinite(amt)) return;
      return setGame(room, E.applyAction(g, type, amt));
    }
    if (m.t === 'skip'){
      if (!g || g.turn < 0 || g.phase === 'showdown' || g.phase === 'over') return;
      const seat = g.seats[g.turn]; if (seat.id === me) return;
      const idle = Date.now() - g.turnAt;
      if (idle > 45000 || (!room.conns.has(seat.id) && idle > 8000)) setGame(room, E.applyAction(g, 'fold'));
      return;
    }
    if (m.t === 'chat'){
      const text = String(m.text || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 300);
      const p = room.players.find(x => x.id === me); if (!text || !p) return;
      room.chat.push({ uid: me, name: p.name, text, t: Date.now() });
      if (room.chat.length > 100) room.chat.shift();
      return broadcastChat(room);
    }
  });
  ws.on('close', () => {
    const room = rooms.get(ws.code);
    if (room && ws.pid && room.conns.get(ws.pid) === ws){ room.conns.delete(ws.pid); broadcast(room); }
  });
});

setInterval(() => { wss.clients.forEach(ws => { if (!ws.isAlive) return ws.terminate(); ws.isAlive = false; ws.ping(); }); }, 30000);
setInterval(() => {
  const cutoff = Date.now() - 3 * 3600 * 1000;
  rooms.forEach((r, c) => { if (r.conns.size === 0 && r.touched < cutoff){ clearTimeout(r.timer); rooms.delete(c); } });
}, 10 * 60 * 1000);

server.listen(PORT, () => console.log('Hold\'em Night running on port ' + PORT));
