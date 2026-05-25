const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const players = new Map();
const enemies = [];

for (let i = 0; i < 15; i++) {
  enemies.push({ id: i, x: Math.random() * 1000, y: Math.random() * 600, hp: 60, maxHp: 60, type: i % 7 });
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

wss.on('connection', (ws) => {
  const playerId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
  
  const player = {
    id: playerId,
    x: Math.random() * 800 + 100,
    y: Math.random() * 400 + 100,
    hp: 100, maxHp: 100, kills: 0,
    nickname: 'Игрок',
    color: `hsl(${Math.random() * 360}, 70%, 50%)`,
    heroId: 'axe',
    skinIndex: 0
  };
  
  players.set(playerId, player);
  
  // Отправляем игроку его данные
  ws.send(JSON.stringify({
    type: 'registerSuccess',
    playerId: playerId,
    nickname: 'Игрок',
    wallet: 1000
  }));
  
  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);
      
      if (data.type === 'nickname') {
        player.nickname = data.nickname;
      }
      
      if (data.type === 'heroSelect') {
        player.heroId = data.heroId || 'axe';
        player.skinIndex = data.skinIndex || 0;
      }
      
      if (data.type === 'move') {
        player.x = Math.max(15, Math.min(985, data.x));
        player.y = Math.max(15, Math.min(585, data.y));
      }
      
      if (data.type === 'attack') {
        for (let enemy of enemies) {
          const dist = Math.hypot(enemy.x - player.x, enemy.y - player.y);
          if (dist < 60 && enemy.hp > 0) {
            enemy.hp -= 25;
            if (enemy.hp <= 0) {
              player.kills++;
              enemy.hp = 60;
              enemy.x = Math.random() * 1000;
              enemy.y = Math.random() * 600;
            }
            break;
          }
        }
      }
    } catch (e) {
      console.log('Ошибка обработки сообщения:', e);
    }
  });
  
  ws.on('close', () => {
    players.delete(playerId);
  });
});

// Игровой цикл
setInterval(() => {
  // Движение врагов
  players.forEach(player => {
    if (player.hp <= 0) return;
    enemies.forEach(enemy => {
      if (enemy.hp <= 0) return;
      const dist = Math.hypot(enemy.x - player.x, enemy.y - player.y);
      if (dist < 400 && dist > 20) {
        enemy.x += (player.x - enemy.x) / dist * 1.5;
        enemy.y += (player.y - enemy.y) / dist * 1.5;
      }
      if (dist < 30) {
        player.hp -= 0.5;
      }
    });
  });
  
  // Отправка состояния
  broadcast({
    type: 'update',
    players: Array.from(players.values()).map(p => ({
      id: p.id,
      x: p.x,
      y: p.y,
      hp: Math.floor(p.hp),
      maxHp: p.maxHp,
      kills: p.kills,
      nickname: p.nickname,
      color: p.color,
      heroId: p.heroId,
      skinIndex: p.skinIndex
    })),
    enemies: enemies.filter(e => e.hp > 0)
  });
}, 50);

server.listen(PORT, () => console.log(`Сервер на порту ${PORT}`));
