const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  fs.readFile(path.join(__dirname, 'client.html'), 'utf8', (err, data) => {
    if (err) {
      res.writeHead(500);
      res.end('Error loading game');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });

const players = new Map();
const enemies = [];

// Создаём врагов
for (let i = 0; i < 15; i++) {
  enemies.push({
    id: i,
    x: Math.random() * 1000,
    y: Math.random() * 600,
    hp: 50,
    maxHp: 50
  });
}

// Обновление врагов (движение к ближайшему игроку)
setInterval(() => {
  players.forEach(player => {
    if (player.hp <= 0) return;
    
    enemies.forEach(enemy => {
      const dist = Math.hypot(enemy.x - player.x, enemy.y - player.y);
      if (dist < 300 && dist > 20) {
        enemy.x += (player.x - enemy.x) / dist * 0.5;
        enemy.y += (player.y - enemy.y) / dist * 0.5;
      }
      if (dist < 25) {
        player.hp -= 2;
      }
    });
  });
  
  // Отправка состояния всем игрокам
  broadcast({
    type: 'update',
    players: Array.from(players.values()),
    enemies: enemies
  });
}, 50);

wss.on('connection', (ws) => {
  const playerId = Date.now().toString();
  const player = {
    id: playerId,
    x: Math.random() * 800 + 100,
    y: Math.random() * 400 + 100,
    hp: 100,
    maxHp: 100,
    kills: 0,
    nickname: 'Игрок',
    color: `hsl(${Math.random() * 360}, 70%, 50%)`
  };
  
  players.set(playerId, player);
  
  // Отправляем новому игроку его ID
  ws.send(JSON.stringify({
    type: 'init',
    playerId: playerId,
    player: player
  }));
  
  ws.on('message', (message) => {
    const data = JSON.parse(message);
    const p = players.get(playerId);
    if (!p) return;
    
    if (data.type === 'move') {
      p.x = Math.max(20, Math.min(980, data.x));
      p.y = Math.max(20, Math.min(580, data.y));
    }
    
    if (data.type === 'attack') {
      for (let enemy of enemies) {
        const dist = Math.hypot(enemy.x - p.x, enemy.y - p.y);
        if (dist < 60 && enemy.hp > 0) {
          enemy.hp -= 25;
          if (enemy.hp <= 0) {
            p.kills++;
            enemy.hp = 50;
            enemy.x = Math.random() * 1000;
            enemy.y = Math.random() * 600;
          }
          break;
        }
      }
    }
    
    if (data.type === 'nickname') {
      p.nickname = data.nickname;
    }
  });
  
  ws.on('close', () => {
    players.delete(playerId);
  });
});

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

server.listen(PORT, () => {
  console.log(`🎮 Сервер запущен на порту ${PORT}`);
});
