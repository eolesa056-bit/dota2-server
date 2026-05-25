const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

const players = new Map();
const enemies = [];
const promoCodes = new Map([['DOTA100', 100], ['DOTA500', 500], ['DOTA1000', 1000]]);
const bannedPlayers = new Set();
const usedNicknames = new Map();

for (let i = 0; i < 15; i++) {
  enemies.push({ id: i, x: Math.random() * 1000, y: Math.random() * 600, hp: 60, maxHp: 60 });
}

const server = http.createServer((req, res) => {
  fs.readFile(path.join(__dirname, 'index.html'), 'utf8', (err, data) => {
    if (err) { res.writeHead(500); res.end('Error'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(msg); });
}

function sendTo(ws, data) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

wss.on('connection', (ws) => {
  let nickname = null;
  let playerId = null;

  ws.on('message', (msg) => {
    const data = JSON.parse(msg);

    // ===== РЕГИСТРАЦИЯ =====
    if (data.type === 'register') {
      const n = data.nickname.toLowerCase();
      
      if (bannedPlayers.has(n)) {
        sendTo(ws, { type: 'error', message: '⛔ Вы забанены!' });
        return;
      }
      
      if (usedNicknames.has(n)) {
        sendTo(ws, { type: 'error', message: 'Ник занят!' });
        return;
      }
      
      nickname = n;
      playerId = Date.now().toString();
      usedNicknames.set(n, ws);
      
      players.set(playerId, {
        id: playerId, nickname: n,
        x: Math.random() * 800 + 100, y: Math.random() * 400 + 100,
        hp: 100, maxHp: 100, kills: 0,
        color: `hsl(${Math.random() * 360}, 70%, 50%)`
      });
      
      sendTo(ws, {
        type: 'registerSuccess',
        playerId: playerId,
        nickname: n,
        wallet: 0
      });
      return;
    }

    // ===== ПРОМОКОД =====
    if (data.type === 'promoCode') {
      const code = data.code.toUpperCase();
      if (promoCodes.has(code)) {
        const amount = promoCodes.get(code);
        promoCodes.delete(code);
        sendTo(ws, { type: 'promoSuccess', amount: amount });
      } else {
        sendTo(ws, { type: 'promoError', message: 'Неверный код!' });
      }
      return;
    }

    // ===== БАН (только root) =====
    if (data.type === 'banPlayer' && nickname === 'root') {
      const target = data.targetName.toLowerCase();
      bannedPlayers.add(target);
      
      // Отключаем игрока если он онлайн
      const targetWs = usedNicknames.get(target);
      if (targetWs) {
        sendTo(targetWs, { type: 'banned' });
        targetWs.close();
        usedNicknames.delete(target);
      }
      
      sendTo(ws, { type: 'banSuccess', target: target });
      return;
    }

    // ===== РАЗБАН (только root) =====
    if (data.type === 'unbanPlayer' && nickname === 'root') {
      const target = data.targetName.toLowerCase();
      bannedPlayers.delete(target);
      sendTo(ws, { type: 'unbanSuccess', target: target });
      return;
    }

    // ===== ДВИЖЕНИЕ =====
    if (data.type === 'move' && playerId) {
      const p = players.get(playerId);
      if (p) { p.x = data.x; p.y = data.y; }
      return;
    }

    // ===== АТАКА =====
    if (data.type === 'attack' && playerId) {
      const p = players.get(playerId);
      if (!p) return;
      for (let enemy of enemies) {
        const dist = Math.hypot(enemy.x - p.x, enemy.y - p.y);
        if (dist < 60 && enemy.hp > 0) {
          enemy.hp -= 25;
          if (enemy.hp <= 0) {
            p.kills++;
            enemy.hp = 60;
            enemy.x = Math.random() * 1000;
            enemy.y = Math.random() * 600;
          }
          break;
        }
      }
      return;
    }
  });

  ws.on('close', () => {
    if (nickname) usedNicknames.delete(nickname);
    if (playerId) players.delete(playerId);
  });
});

// Игровой цикл
setInterval(() => {
  players.forEach(player => {
    if (player.hp <= 0) return;
    enemies.forEach(enemy => {
      if (enemy.hp <= 0) return;
      const dist = Math.hypot(enemy.x - player.x, enemy.y - player.y);
      if (dist < 400 && dist > 20) {
        enemy.x += (player.x - enemy.x) / dist * 1.5;
        enemy.y += (player.y - enemy.y) / dist * 1.5;
      }
      if (dist < 30) player.hp -= 0.5;
    });
  });
  broadcast({
    type: 'update',
    players: Array.from(players.values()).map(p => ({
      id: p.id, x: p.x, y: p.y,
      hp: Math.floor(p.hp), maxHp: p.maxHp,
      kills: p.kills, nickname: p.nickname, color: p.color
    })),
    enemies: enemies.filter(e => e.hp > 0)
  });
}, 50);

server.listen(PORT, () => console.log(`Сервер на порту ${PORT}`));
