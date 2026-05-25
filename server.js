const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  const filePath = path.join(__dirname, 'index.html');
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Error: ' + err.message);
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('Новый игрок подключился');
  
  ws.on('message', (msg) => {
    console.log('Получено сообщение:', msg.toString());
    ws.send(JSON.stringify({ type: 'echo', data: msg.toString() }));
  });
  
  ws.on('close', () => {
    console.log('Игрок отключился');
  });
  
  ws.send(JSON.stringify({ type: 'welcome', message: 'Добро пожаловать!' }));
});

server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
