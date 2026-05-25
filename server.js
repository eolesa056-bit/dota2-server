const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

// Состояние игры
const players = new Map();
const enemies = [];
const promoCodes = new Map([['DOTA100', 100], ['DOTA500', 500], ['DOTA1000', 1000]]);
const bpPromoCodes = new Map([['BPFREE', 'premium'], ['BPPLUS', 'plus']]);
const bannedPlayers = new Set();
const playerWallets = new Map();
const playerBP = new Map();

// Создаём врагов
for (let i = 0; i < 15; i++) {
  enemies.push({
    id: i,
    x: Math.random() * 1000,
    y: Math.random() * 600,
    hp: 60,
    maxHp: 60,
    type: ['axe','pudge','sven','antimage','sniper','shadowfiend','lina'][i % 7]
  });
}

// HTTP сервер
const server = http.createServer((req, res) => {
  fs.readFile(path.join(__dirname, 'index.html'), 'utf8', (err, data) => {
    if (err) {
      res.writeHead(500);
      res.end('Error loading game');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
});

// WebSocket
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  const id = Date.now().toString() + Math.random().toString(36).substr(2, 5);
  
  const player = {
    id: id,
    x: Math.random() * 800 + 100,
    y: Math.random() * 400 + 100,
    hp: 100,
    maxHp: 100,
    kills: 0,
    nickname: 'Игрок',
    heroId: 'axe',
    skinIndex: 0,
    color: `hsl(${Math.random() * 360}, 70%, 50%)`
  };
  
  players.set(id, player);
  
  // Отправляем новому игроку его ID
  ws.send(JSON.stringify({
    type: 'init',
    playerId: id
  }));
  
  ws.on('message', (msg) => {
    const data = JSON.parse(msg);
    const p = players.get(id);
    if (!p) return;
    
    if (data.type === 'move') {
      p.x = Math.max(15, Math.min(985, data.x));
      p.y = Math.max(15, Math.min(585, data.y));
    }
    
    if (data.type === 'attack') {
      for (let enemy of enemies) {
        const dist = Math.hypot(enemy.x - p.x, enemy.y - p.y);
        if (dist < 60 && enemy.hp > 0) {
          enemy.hp -= 25;
          if (enemy.hp <= 0) {
            p.kills++;
            // Возрождаем врага
            enemy.hp = 60;
            enemy.x = Math.random() * 1000;
            enemy.y = Math.random() * 600;
            enemy.type = ['axe','pudge','sven','antimage','sniper','shadowfiend','lina'][Math.floor(Math.random() * 7)];
          }
          break;
        }
      }
    }
    
    if (data.type === 'nickname') {
      p.nickname = data.nickname;
    }
    
    if (data.type === 'heroSelect') {
      p.heroId = data.heroId || 'axe';
      p.skinIndex = data.skinIndex || 0;
    }
  });
  
  ws.on('close', () => {
    players.delete(id);
  });
});

// Игровой цикл
setInterval(() => {
  // Движение врагов к ближайшему игроку
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
  
  // Отправка состояния всем
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
