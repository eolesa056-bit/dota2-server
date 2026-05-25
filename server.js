const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

const players = new Map();
const enemies = [];
const promoCodes = new Map([['DOTA100', 100], ['DOTA500', 500], ['DOTA1000', 1000]]);
const bpPromoCodes = new Map([['BPFREE', 'premium'], ['BPPLUS', 'plus']]);
const bannedPlayers = new Set();
const playerWallets = new Map();
const playerSkins = new Map();
const playerBP = new Map();
const playerHeroes = new Map();
const usedNicknames = new Map();
const friendsList = new Map();
const partyMembers = new Map();

for (let i = 0; i < 15; i++) {
  enemies.push({
    id: i, x: Math.random() * 1000, y: Math.random() * 600,
    hp: 60, maxHp: 60,
    type: ['axe','pudge','sven','antimage','sniper','shadowfiend','lina'][i % 7]
  });
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
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

function sendTo(ws, data) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

function getOnlinePlayers() {
  return Array.from(usedNicknames.keys());
}

wss.on('connection', (ws) => {
  let currentNickname = null;
  let playerId = null;

  ws.on('message', (msg) => {
    const data = JSON.parse(msg);

    if (data.type === 'register') {
      const nickname = data.nickname.toLowerCase();
      if (bannedPlayers.has(nickname)) { sendTo(ws, { type: 'error', message: '⛔ Вы забанены!' }); return; }
      if (usedNicknames.has(nickname)) { sendTo(ws, { type: 'error', message: 'Ник занят!' }); return; }
      
      currentNickname = nickname;
      playerId = Date.now().toString();
      usedNicknames.set(nickname, ws);
      
      if (!playerWallets.has(nickname)) playerWallets.set(nickname, 0);
      if (!playerBP.has(nickname)) playerBP.set(nickname, { type: 'free', level: 1, xp: 0 });
      if (!playerSkins.has(nickname)) playerSkins.set(nickname, {});
      if (!playerHeroes.has(nickname)) playerHeroes.set(nickname, { heroId: 'axe', skinIndex: 0 });
      if (!friendsList.has(nickname)) friendsList.set(nickname, []);
      if (!partyMembers.has(nickname)) partyMembers.set(nickname, [nickname]);
      
      const heroData = playerHeroes.get(nickname);
      players.set(playerId, {
        id: playerId, nickname: nickname,
        x: Math.random() * 800 + 100, y: Math.random() * 400 + 100,
        hp: 100, maxHp: 100, kills: 0,
        heroId: heroData.heroId, skinIndex: heroData.skinIndex,
        color: `hsl(${Math.random() * 360}, 70%, 50%)`
      });
      
      sendTo(ws, {
        type: 'registerSuccess', playerId, nickname,
        wallet: playerWallets.get(nickname),
        bp: playerBP.get(nickname),
        skins: playerSkins.get(nickname),
        hero: playerHeroes.get(nickname),
        friends: friendsList.get(nickname),
        party: partyMembers.get(nickname),
        onlinePlayers: getOnlinePlayers()
      });
      broadcast({ type: 'onlineUpdate', onlinePlayers: getOnlinePlayers() });
      return;
    }

    if (data.type === 'promoCode') {
      const code = data.code.toUpperCase();
      const nickname = data.nickname.toLowerCase();
      if (promoCodes.has(code)) {
        const amount = promoCodes.get(code);
        playerWallets.set(nickname, (playerWallets.get(nickname) || 0) + amount);
        promoCodes.delete(code);
        sendTo(ws, { type: 'promoSuccess', amount, wallet: playerWallets.get(nickname) });
      } else if (bpPromoCodes.has(code)) {
        const bpType = bpPromoCodes.get(code);
        const bp = playerBP.get(nickname) || { type: 'free', level: 1, xp: 0 };
        bp.type = bpType;
        if (bpType === 'plus') bp.level = Math.min(100, bp.level + 25);
        playerBP.set(nickname, bp);
        bpPromoCodes.delete(code);
        sendTo(ws, { type: 'bpPromoSuccess', bpType, bp });
      } else {
        sendTo(ws, { type: 'promoError', message: 'Неверный код!' });
      }
      return;
    }

    if (data.type === 'heroSelect') {
      const nickname = data.nickname.toLowerCase();
      playerHeroes.set(nickname, { heroId: data.heroId, skinIndex: data.skinIndex || 0 });
      sendTo(ws, { type: 'heroUpdated', hero: playerHeroes.get(nickname) });
      return;
    }

    if (data.type === 'buySkin') {
      const nickname = data.nickname.toLowerCase();
      const wallet = playerWallets.get(nickname) || 0;
      if (wallet >= data.price) {
        playerWallets.set(nickname, wallet - data.price);
        const skins = playerSkins.get(nickname) || {};
        if (!skins[data.heroId]) skins[data.heroId] = [0];
        if (!skins[data.heroId].includes(data.skinIndex)) skins[data.heroId].push(data.skinIndex);
        playerSkins.set(nickname, skins);
        playerHeroes.set(nickname, { heroId: data.heroId, skinIndex: data.skinIndex });
        sendTo(ws, { type: 'skinBought', wallet: playerWallets.get(nickname), skins, hero: playerHeroes.get(nickname) });
      } else {
        sendTo(ws, { type: 'error', message: 'Недостаточно монет!' });
      }
      return;
    }

    if (data.type === 'addFriend') {
      const nickname = data.nickname.toLowerCase();
      const friendName = data.friendName.toLowerCase();
      if (!usedNicknames.has(friendName)) { sendTo(ws, { type: 'error', message: 'Игрок не найден!' }); return; }
      const friends = friendsList.get(nickname) || [];
      if (!friends.includes(friendName)) { friends.push(friendName); friendsList.set(nickname, friends); }
      sendTo(ws, { type: 'friendsUpdated', friends });
      return;
    }

    if (data.type === 'inviteToParty') {
      const nickname = data.nickname.toLowerCase();
      const targetName = data.targetName.toLowerCase();
      const party = partyMembers.get(nickname) || [nickname];
      if (party.length >= 5) { sendTo(ws, { type: 'error', message: 'Пати заполнена!' }); return; }
      if (!party.includes(targetName)) { party.push(targetName); partyMembers.set(nickname, party); }
      sendTo(ws, { type: 'partyUpdated', party });
      const targetWs = usedNicknames.get(targetName);
      if (targetWs) sendTo(targetWs, { type: 'invitedToParty', by: nickname });
      return;
    }

    if (data.type === 'leaveParty') {
      const nickname = data.nickname.toLowerCase();
      partyMembers.set(nickname, [nickname]);
      sendTo(ws, { type: 'partyUpdated', party: [nickname] });
      return;
    }

    if (data.type === 'banPlayer') {
      const targetName = data.targetName.toLowerCase();
      bannedPlayers.add(targetName);
      const targetWs = usedNicknames.get(targetName);
      if (targetWs) { sendTo(targetWs, { type: 'banned' }); targetWs.close(); usedNicknames.delete(targetName); }
      sendTo(ws, { type: 'banSuccess', target: targetName });
      broadcast({ type: 'onlineUpdate', onlinePlayers: getOnlinePlayers() });
      return;
    }

    if (data.type === 'unbanPlayer') {
      const targetName = data.targetName.toLowerCase();
      bannedPlayers.delete(targetName);
      sendTo(ws, { type: 'unbanSuccess', target: targetName });
      return;
    }

    if (data.type === 'giveCurrency') {
      const targetName = data.targetName.toLowerCase();
      const amount = data.amount;
      playerWallets.set(targetName, (playerWallets.get(targetName) || 0) + amount);
      sendTo(ws, { type: 'currencyGiven', target: targetName, amount });
      return;
    }

    if (data.type === 'createPromoCode') {
      promoCodes.set(data.code.toUpperCase(), data.amount);
      sendTo(ws, { type: 'promoCodeCreated', code: data.code, amount: data.amount });
      return;
    }

    if (data.type === 'createBPPromoCode') {
      bpPromoCodes.set(data.code.toUpperCase(), data.bpType);
      sendTo(ws, { type: 'bpPromoCodeCreated', code: data.code, bpType: data.bpType });
      return;
    }

    if (data.type === 'move' && playerId) {
      const p = players.get(playerId);
      if (p) { p.x = data.x; p.y = data.y; }
      return;
    }

    if (data.type === 'attack' && playerId) {
      const p = players.get(playerId);
      if (!p) return;
      for (let enemy of enemies) {
        const dist = Math.hypot(enemy.x - p.x, enemy.y - p.y);
        if (dist < 60 && enemy.hp > 0) {
          enemy.hp -= 25;
          if (enemy.hp <= 0) { p.kills++; enemy.hp = 60; enemy.x = Math.random() * 1000; enemy.y = Math.random() * 600; }
          break;
        }
      }
      return;
    }
  });

  ws.on('close', () => {
    if (currentNickname) {
      usedNicknames.delete(currentNickname);
      if (playerId) players.delete(playerId);
      broadcast({ type: 'onlineUpdate', onlinePlayers: getOnlinePlayers() });
    }
  });
});

setInterval(() => {
  players.forEach(player => {
    if (player.hp <= 0) return;
    enemies.forEach(enemy => {
      if (enemy.hp <= 0) return;
      const dist = Math.hypot(enemy.x - player.x, enemy.y - player.y);
      if (dist < 400 && dist > 20) { enemy.x += (player.x - enemy.x) / dist * 1.5; enemy.y += (player.y - enemy.y) / dist * 1.5; }
      if (dist < 30) player.hp -= 0.5;
    });
  });
  broadcast({
    type: 'update',
    players: Array.from(players.values()).map(p => ({
      id: p.id, x: p.x, y: p.y, hp: Math.floor(p.hp), maxHp: p.maxHp,
      kills: p.kills, nickname: p.nickname, color: p.color, heroId: p.heroId, skinIndex: p.skinIndex
    })),
    enemies: enemies.filter(e => e.hp > 0)
  });
}, 50);

server.listen(PORT, () => console.log(`🎮 Сервер на порту ${PORT}`));
