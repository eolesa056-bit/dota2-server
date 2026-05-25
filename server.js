const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;

// HTTP сервер для отдачи HTML
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

// WebSocket сервер ПОВЕРХ HTTP
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('✅ WebSocket подключен!');
  
  // Сразу отправляем приветствие
  ws.send(JSON.stringify({ type: 'welcome', message: 'Привет!' }));
  
  ws.on('message', (msg) => {
    console.log('Получено:', msg.toString());
    ws.send(JSON.stringify({ type: 'echo', data: msg.toString() }));
  });
  
  ws.on('close', () => {
    console.log('WebSocket отключился');
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Сервер на порту ${PORT}`);
});
