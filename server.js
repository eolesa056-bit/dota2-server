const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 10000;

const server = http.createServer((req, res) => {
  const filePath = path.join(__dirname, 'index.html');
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>Сервер работает!</h1>');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('✅ Игрок подключился');
  
  ws.send(JSON.stringify({ 
    type: 'registerSuccess', 
    playerId: Date.now().toString(), 
    nickname: 'Игрок', 
    wallet: 1000 
  }));
  
  ws.on('message', (msg) => {
    console.log('Получено:', msg.toString());
  });
  
  ws.on('close', () => {
    console.log('Игрок отключился');
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
