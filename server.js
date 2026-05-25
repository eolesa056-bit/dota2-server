const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;

let players = [];
let enemies = [];

// Создаём врагов
for (let i = 0; i < 15; i++) {
  enemies.push({ id: i, x: Math.random() * 1000, y: Math.random() * 600, hp: 60 });
}

const server = http.createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  // Главная страница
  if (req.method === 'GET' && req.url === '/') {
    const filePath = path.join(__dirname, 'index.html');
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>Сервер работает!</h1><p>Откройте игру</p>');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
    return;
  }
  
  // Регистрация игрока
  if (req.method === 'POST' && req.url === '/join') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const data = JSON.parse(body);
      const player = {
        id: Date.now().toString(),
        nickname: data.nickname || 'Игрок',
        x: Math.random() * 800 + 100,
        y: Math.random() * 400 + 100,
        hp: 100, maxHp: 100, kills: 0
      };
      players.push(player);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, player: player }));
    });
    return;
  }
  
  // Получение состояния игры
  if (req.method === 'GET' && req.url === '/state') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ players: players, enemies: enemies }));
    return;
  }
  
  // Движение игрока
  if (req.method === 'POST' && req.url === '/move') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const data = JSON.parse(body);
      const player = players.find(p => p.id === data.id);
      if (player) {
        player.x = data.x;
        player.y = data.y;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    });
    return;
  }
  
  // Атака
  if (req.method === 'POST' && req.url === '/attack') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const data = JSON.parse(body);
      const player = players.find(p => p.id === data.id);
      if (player) {
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
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    });
    return;
  }
  
  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Сервер на порту ${PORT}`);
});
