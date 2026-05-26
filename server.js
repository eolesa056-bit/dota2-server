const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;

let players = [];
let enemies = [];
let reports = [];
const promoCodes = new Map([['DOTA100', 100], ['DOTA500', 500], ['DOTA1000', 1000]]);
const bpPromoCodes = new Map([['BPFREE', 'premium'], ['BPPLUS', 'plus']]);
const bannedPlayers = new Set();
const playerWallets = new Map();
const playerBP = new Map();
const playerSkins = new Map();
const playerHeroes = new Map();
const friendsList = new Map();
const partyMembers = new Map();
const usedNicknames = new Map();

usedNicknames.delete('root');
console.log('✅ Root сброшен при запуске');

for (let i = 0; i < 15; i++) {
  enemies.push({ id: i, x: Math.random() * 1000, y: Math.random() * 600, hp: 60, maxHp: 60 });
}

function sendJSON(res, data) {
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch(e) { resolve({}); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
  
  if (req.method === 'GET' && req.url === '/') {
    const filePath = path.join(__dirname, 'index.html');
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end('<h1>Сервер работает!</h1>'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/join') {
    const data = await readBody(req);
    const nickname = data.nickname.toLowerCase();
    if (bannedPlayers.has(nickname)) { sendJSON(res, { error: '⛔ Вы забанены!' }); return; }
    if (usedNicknames.has(nickname)) { sendJSON(res, { error: 'Ник занят!' }); return; }
    
    const playerId = Date.now().toString();
    usedNicknames.set(nickname, playerId);
    if (!playerWallets.has(nickname)) playerWallets.set(nickname, 0);
    if (!playerBP.has(nickname)) playerBP.set(nickname, { type: 'free', level: 1, xp: 0 });
    if (!playerSkins.has(nickname)) playerSkins.set(nickname, {});
    if (!playerHeroes.has(nickname)) playerHeroes.set(nickname, { heroId: 'axe', skinIndex: 0 });
    if (!friendsList.has(nickname)) friendsList.set(nickname, []);
    if (!partyMembers.has(nickname)) partyMembers.set(nickname, [nickname]);
    
    const player = {
      id: playerId, nickname: nickname,
      x: Math.random() * 800 + 100, y: Math.random() * 400 + 100,
      hp: 100, maxHp: 100, kills: 0,
      color: `hsl(${Math.random() * 360}, 70%, 50%)`,
      heroId: playerHeroes.get(nickname).heroId,
      skinIndex: playerHeroes.get(nickname).skinIndex
    };
    players.push(player);
    
    sendJSON(res, { success: true, player, wallet: playerWallets.get(nickname), bp: playerBP.get(nickname), skins: playerSkins.get(nickname), hero: playerHeroes.get(nickname), friends: friendsList.get(nickname), party: partyMembers.get(nickname) });
    return;
  }

  if (req.method === 'GET' && req.url === '/state') {
    players = players.filter(p => {
      if (bannedPlayers.has(p.nickname)) { usedNicknames.delete(p.nickname); return false; }
      return true;
    });
    players.forEach(player => {
      if (player.hp <= 0) return;
      enemies.forEach(enemy => {
        if (enemy.hp <= 0) return;
        const dist = Math.hypot(enemy.x - player.x, enemy.y - player.y);
        if (dist < 400 && dist > 20) { enemy.x += (player.x - enemy.x) / dist * 1.5; enemy.y += (player.y - enemy.y) / dist * 1.5; }
        if (dist < 30) player.hp -= 0.3;
      });
    });
    sendJSON(res, { players, enemies: enemies.filter(e => e.hp > 0) });
    return;
  }

  if (req.method === 'POST' && req.url === '/checkBan') {
    const data = await readBody(req);
    sendJSON(res, { banned: bannedPlayers.has(data.nickname.toLowerCase()) });
    return;
  }

  if (req.method === 'POST' && req.url === '/move') {
    const data = await readBody(req);
    const player = players.find(p => p.id === data.id);
    if (player) { player.x = data.x; player.y = data.y; }
    sendJSON(res, { success: true });
    return;
  }

  if (req.method === 'POST' && req.url === '/attack') {
    const data = await readBody(req);
    const player = players.find(p => p.id === data.id);
    if (player) {
      for (let enemy of enemies) {
        const dist = Math.hypot(enemy.x - player.x, enemy.y - player.y);
        if (dist < 60 && enemy.hp > 0) {
          enemy.hp -= 25;
          if (enemy.hp <= 0) {
            player.kills++;
            playerWallets.set(player.nickname, (playerWallets.get(player.nickname) || 0) + 5);
            const bp = playerBP.get(player.nickname) || { type: 'free', level: 1, xp: 0 };
            bp.xp = (bp.xp || 0) + 10;
            if (bp.xp >= 100) { bp.xp -= 100; bp.level = Math.min(100, bp.level + 1); }
            playerBP.set(player.nickname, bp);
            enemy.hp = 60; enemy.x = Math.random() * 1000; enemy.y = Math.random() * 600;
          }
          break;
        }
      }
    }
    sendJSON(res, { success: true, wallet: playerWallets.get(player.nickname), bp: playerBP.get(player.nickname) });
    return;
  }

  if (req.method === 'POST' && req.url === '/promo') {
    const data = await readBody(req);
    const code = data.code.toUpperCase();
    const nickname = data.nickname.toLowerCase();
    if (promoCodes.has(code)) {
      const amount = promoCodes.get(code);
      playerWallets.set(nickname, (playerWallets.get(nickname) || 0) + amount);
      promoCodes.delete(code);
      sendJSON(res, { success: true, type: 'coins', amount, wallet: playerWallets.get(nickname) });
    } else if (bpPromoCodes.has(code)) {
      const bpType = bpPromoCodes.get(code);
      const bp = playerBP.get(nickname) || { type: 'free', level: 1, xp: 0 };
      bp.type = bpType;
      if (bpType === 'plus') bp.level = Math.min(100, bp.level + 25);
      playerBP.set(nickname, bp);
      bpPromoCodes.delete(code);
      sendJSON(res, { success: true, type: 'bp', bpType, bp });
    } else {
      sendJSON(res, { error: 'Неверный код!' });
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/ban') {
    const data = await readBody(req);
    if (data.admin !== 'root') { sendJSON(res, { error: 'Нет прав!' }); return; }
    bannedPlayers.add(data.target.toLowerCase());
    players = players.filter(p => p.nickname !== data.target.toLowerCase());
    usedNicknames.delete(data.target.toLowerCase());
    sendJSON(res, { success: true });
    return;
  }

  if (req.method === 'POST' && req.url === '/unban') {
    const data = await readBody(req);
    if (data.admin !== 'root') { sendJSON(res, { error: 'Нет прав!' }); return; }
    bannedPlayers.delete(data.target.toLowerCase());
    sendJSON(res, { success: true });
    return;
  }

  if (req.method === 'POST' && req.url === '/resetRoot') {
    usedNicknames.delete('root');
    players = players.filter(p => p.nickname !== 'root');
    sendJSON(res, { success: true });
    return;
  }

  if (req.method === 'POST' && req.url === '/createPromo') {
    const data = await readBody(req);
    if (data.admin !== 'root') { sendJSON(res, { error: 'Нет прав!' }); return; }
    promoCodes.set(data.code.toUpperCase(), data.amount);
    sendJSON(res, { success: true });
    return;
  }

  if (req.method === 'POST' && req.url === '/giveCurrency') {
    const data = await readBody(req);
    if (data.admin !== 'root') { sendJSON(res, { error: 'Нет прав!' }); return; }
    playerWallets.set(data.target.toLowerCase(), (playerWallets.get(data.target.toLowerCase()) || 0) + data.amount);
    sendJSON(res, { success: true });
    return;
  }

  if (req.method === 'POST' && req.url === '/heroSelect') {
    const data = await readBody(req);
    playerHeroes.set(data.nickname.toLowerCase(), { heroId: data.heroId, skinIndex: data.skinIndex || 0 });
    sendJSON(res, { success: true });
    return;
  }

  if (req.method === 'POST' && req.url === '/buySkin') {
    const data = await readBody(req);
    const nickname = data.nickname.toLowerCase();
    const wallet = playerWallets.get(nickname) || 0;
    if (wallet >= data.price) {
      playerWallets.set(nickname, wallet - data.price);
      const skins = playerSkins.get(nickname) || {};
      if (!skins[data.heroId]) skins[data.heroId] = [0];
      if (!skins[data.heroId].includes(data.skinIndex)) skins[data.heroId].push(data.skinIndex);
      playerSkins.set(nickname, skins);
      sendJSON(res, { success: true, wallet: playerWallets.get(nickname), skins });
    } else {
      sendJSON(res, { error: 'Недостаточно монет!' });
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/addFriend') {
    const data = await readBody(req);
    const nickname = data.nickname.toLowerCase();
    const friend = data.friend.toLowerCase();
    if (!usedNicknames.has(friend)) { sendJSON(res, { error: 'Игрок не найден!' }); return; }
    const friends = friendsList.get(nickname) || [];
    if (!friends.includes(friend)) friends.push(friend);
    friendsList.set(nickname, friends);
    sendJSON(res, { success: true, friends });
    return;
  }

  if (req.method === 'POST' && req.url === '/inviteParty') {
    const data = await readBody(req);
    const party = partyMembers.get(data.nickname.toLowerCase()) || [data.nickname.toLowerCase()];
    if (party.length >= 5) { sendJSON(res, { error: 'Пати заполнена!' }); return; }
    if (!party.includes(data.target.toLowerCase())) party.push(data.target.toLowerCase());
    partyMembers.set(data.nickname.toLowerCase(), party);
    sendJSON(res, { success: true, party });
    return;
  }

  // РЕПОРТЫ
  if (req.method === 'POST' && req.url === '/report') {
    const data = await readBody(req);
    reports.push({
      id: Date.now().toString(),
      from: data.from,
      target: data.target,
      reason: data.reason,
      customText: data.customText || '',
      time: new Date().toISOString()
    });
    console.log(`📩 Репорт: ${data.from} → ${data.target}: ${data.reason}`);
    sendJSON(res, { success: true });
    return;
  }

  if (req.method === 'GET' && req.url === '/reports') {
    sendJSON(res, reports);
    return;
  }

  if (req.method === 'POST' && req.url === '/clearReports') {
    const data = await readBody(req);
    if (data.admin !== 'root') { sendJSON(res, { error: 'Нет прав!' }); return; }
    reports = [];
    sendJSON(res, { success: true });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Сервер на порту ${PORT}`);
});
