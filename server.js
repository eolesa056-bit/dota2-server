const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  fs.readFile(path.join(__dirname, 'index.html'), 'utf8', (err, data) => {
    if (err) { res.writeHead(500); res.end('Error'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  // Сразу пускаем игрока
  ws.send(JSON.stringify({
    type: 'registerSuccess',
    playerId: Date.now().toString(),
    nickname: 'Игрок',
    wallet: 5000
  }));

  ws.on('message', (msg) => {
    const data = JSON.parse(msg);
    console.log('Получено:', data.type);
  });
});

server.listen(PORT, () => console.log('Сервер запущен на порту ' + PORT));
