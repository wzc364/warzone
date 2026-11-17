import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ConnectedPlayer {
  id: string;
  uid: string;
  commanderName: string;
  mmr: number;
  rankTier: string;
  loadout: Record<string, string>;
  ws: WebSocket;
  roomId: string | null;
  queuedAt: number | null;
  preferredMap: string;
}

interface RoomState {
  roomId: string;
  mode: 'ranked_1v1' | 'custom_1v1';
  mapId: string;
  hostId: string;
  guestId: string | null;
  status: 'waiting' | 'active' | 'finished';
  createdAt: number;
  tick: number;
  interval: NodeJS.Timeout | null;
}

const players = new Map<string, ConnectedPlayer>();
const rooms = new Map<string, RoomState>();

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function sendJson(ws: WebSocket, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastQueueStats() {
  const queuedCount = Array.from(players.values()).filter((p) => p.queuedAt !== null).length;
  const activeRooms = Array.from(rooms.values()).filter((r) => r.status === 'active').length;
  const onlineCount = players.size;
  for (const player of players.values()) {
    sendJson(player.ws, {
      type: 'server:stats',
      onlineCount,
      queuedCount,
      activeRooms,
    });
  }
}

function startRoomTickLoop(room: RoomState) {
  if (room.interval) clearInterval(room.interval);
  room.tick = 0;
  room.interval = setInterval(() => {
    if (room.status !== 'active') {
      if (room.interval) clearInterval(room.interval);
      room.interval = null;
      return;
    }
    room.tick += 1;
    const host = players.get(room.hostId);
    const guest = room.guestId ? players.get(room.guestId) : undefined;
    const msg = { type: 'match:tick', roomId: room.roomId, tick: room.tick };
    if (host) sendJson(host.ws, msg);
    if (guest) sendJson(guest.ws, msg);
  }, 150);
}

function tryMatchmaking() {
  const queued = Array.from(players.values())
    .filter((p) => p.queuedAt !== null && !p.roomId)
    .sort((a, b) => (a.queuedAt ?? 0) - (b.queuedAt ?? 0));

  for (let i = 0; i < queued.length; i++) {
    const p1 = queued[i];
    if (!p1.queuedAt || p1.roomId) continue;
    const waitSec = (Date.now() - p1.queuedAt) / 1000;
    const maxDiff = 150 + waitSec * 30;

    for (let j = i + 1; j < queued.length; j++) {
      const p2 = queued[j];
      if (!p2.queuedAt || p2.roomId) continue;
      if (p1.uid === p2.uid) continue;

      if (Math.abs(p1.mmr - p2.mmr) <= maxDiff) {
        p1.queuedAt = null;
        p2.queuedAt = null;
        const roomId = `RNK_${generateRoomCode()}`;
        const mapId = p1.preferredMap || 'iron_valley';
        const room: RoomState = {
          roomId,
          mode: 'ranked_1v1',
          mapId,
          hostId: p1.id,
          guestId: p2.id,
          status: 'active',
          createdAt: Date.now(),
          tick: 0,
          interval: null,
        };
        rooms.set(roomId, room);
        p1.roomId = roomId;
        p2.roomId = roomId;

        sendJson(p1.ws, {
          type: 'match:found',
          roomId,
          mapId,
          mode: 'ranked_1v1',
          side: 'blue',
          opponent: {
            uid: p2.uid,
            commanderName: p2.commanderName,
            mmr: p2.mmr,
            rankTier: p2.rankTier,
            loadout: p2.loadout,
          },
        });
        sendJson(p2.ws, {
          type: 'match:found',
          roomId,
          mapId,
          mode: 'ranked_1v1',
          side: 'red',
          opponent: {
            uid: p1.uid,
            commanderName: p1.commanderName,
            mmr: p1.mmr,
            rankTier: p1.rankTier,
            loadout: p1.loadout,
          },
        });

        startRoomTickLoop(room);
        broadcastQueueStats();
        return;
      }
    }
  }
}

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'ironfront-dominion', timestamp: Date.now() });
  });

  app.get('/api/multiplayer/stats', (_req, res) => {
    const queuedCount = Array.from(players.values()).filter((p) => p.queuedAt !== null).length;
    const waitingRooms = Array.from(rooms.values())
      .filter((r) => r.status === 'waiting' && r.mode === 'custom_1v1')
      .map((r) => {
        const host = players.get(r.hostId);
        return {
          roomId: r.roomId,
          mapId: r.mapId,
          hostName: host?.commanderName ?? 'Commander',
          hostMmr: host?.mmr ?? 1200,
        };
      });
    res.json({
      onlineCount: players.size,
      queuedCount,
      waitingRooms,
    });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    const connId = `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const player: ConnectedPlayer = {
      id: connId,
      uid: connId,
      commanderName: 'Komandan',
      mmr: 1200,
      rankTier: 'Silver',
      loadout: {},
      ws,
      roomId: null,
      queuedAt: null,
      preferredMap: 'iron_valley',
    };
    players.set(connId, player);
    sendJson(ws, { type: 'server:welcome', connectionId: connId });
    broadcastQueueStats();

    ws.on('message', (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        switch (data.type) {
          case 'player:identify': {
            if (typeof data.uid === 'string' && data.uid.length > 0) player.uid = data.uid.slice(0, 128);
            if (typeof data.commanderName === 'string') player.commanderName = data.commanderName.slice(0, 32);
            if (typeof data.mmr === 'number') player.mmr = data.mmr;
            if (typeof data.rankTier === 'string') player.rankTier = data.rankTier;
            if (data.loadout && typeof data.loadout === 'object') player.loadout = data.loadout;
            break;
          }
          case 'queue:join': {
            player.roomId = null;
            player.queuedAt = Date.now();
            player.preferredMap = typeof data.mapId === 'string' ? data.mapId : 'iron_valley';
            sendJson(ws, { type: 'queue:status', status: 'searching', startedAt: player.queuedAt });
            broadcastQueueStats();
            tryMatchmaking();
            break;
          }
          case 'queue:leave': {
            player.queuedAt = null;
            sendJson(ws, { type: 'queue:status', status: 'idle' });
            broadcastQueueStats();
            break;
          }
          case 'room:create': {
            const roomId = generateRoomCode();
            const mapId = typeof data.mapId === 'string' ? data.mapId : 'iron_valley';
            const room: RoomState = {
              roomId,
              mode: 'custom_1v1',
              mapId,
              hostId: player.id,
              guestId: null,
              status: 'waiting',
              createdAt: Date.now(),
              tick: 0,
              interval: null,
            };
            rooms.set(roomId, room);
            player.roomId = roomId;
            player.queuedAt = null;
            sendJson(ws, { type: 'room:created', roomId, mapId, side: 'blue' });
            broadcastQueueStats();
            break;
          }
          case 'room:join': {
            const code = typeof data.roomId === 'string' ? data.roomId.trim().toUpperCase() : '';
            const room = rooms.get(code);
            if (!room || room.status !== 'waiting' || room.guestId) {
              sendJson(ws, { type: 'room:error', message: 'Kode ruangan tidak ditemukan atau sudah penuh.' });
              break;
            }
            if (room.hostId === player.id) {
              sendJson(ws, { type: 'room:error', message: 'Anda sudah menjadi host di ruangan ini.' });
              break;
            }
            const host = players.get(room.hostId);
            if (!host) {
              rooms.delete(code);
              sendJson(ws, { type: 'room:error', message: 'Host ruangan telah terputus.' });
              break;
            }
            room.guestId = player.id;
            room.status = 'active';
            player.roomId = room.roomId;
            player.queuedAt = null;

            sendJson(host.ws, {
              type: 'match:found',
              roomId: room.roomId,
              mapId: room.mapId,
              mode: room.mode,
              side: 'blue',
              opponent: {
                uid: player.uid,
                commanderName: player.commanderName,
                mmr: player.mmr,
                rankTier: player.rankTier,
                loadout: player.loadout,
              },
            });
            sendJson(player.ws, {
              type: 'match:found',
              roomId: room.roomId,
              mapId: room.mapId,
              mode: room.mode,
              side: 'red',
              opponent: {
                uid: host.uid,
                commanderName: host.commanderName,
                mmr: host.mmr,
                rankTier: host.rankTier,
                loadout: host.loadout,
              },
            });
            startRoomTickLoop(room);
            broadcastQueueStats();
            break;
          }
          case 'match:command': {
            if (!player.roomId) break;
            const room = rooms.get(player.roomId);
            if (!room || room.status !== 'active') break;
            const targetId = room.hostId === player.id ? room.guestId : room.hostId;
            if (!targetId) break;
            const opponent = players.get(targetId);
            if (opponent) {
              sendJson(opponent.ws, {
                type: 'match:command',
                fromSide: room.hostId === player.id ? 'blue' : 'red',
                tick: room.tick,
                command: data.command,
              });
            }
            break;
          }
          case 'match:finish': {
            if (!player.roomId) break;
            const room = rooms.get(player.roomId);
            if (!room) break;
            room.status = 'finished';
            if (room.interval) clearInterval(room.interval);
            room.interval = null;
            const targetId = room.hostId === player.id ? room.guestId : room.hostId;
            const opponent = targetId ? players.get(targetId) : undefined;
            if (opponent && data.reason === 'surrender') {
              sendJson(opponent.ws, { type: 'match:opponent_surrendered', roomId: room.roomId });
            }
            player.roomId = null;
            if (opponent) opponent.roomId = null;
            rooms.delete(room.roomId);
            broadcastQueueStats();
            break;
          }
          case 'ping': {
            sendJson(ws, { type: 'pong', clientTime: data.clientTime, serverTime: Date.now() });
            break;
          }
        }
      } catch {
        // Ignore malformed packets
      }
    });

    ws.on('close', () => {
      if (player.roomId) {
        const room = rooms.get(player.roomId);
        if (room) {
          if (room.interval) clearInterval(room.interval);
          const otherId = room.hostId === player.id ? room.guestId : room.hostId;
          const other = otherId ? players.get(otherId) : undefined;
          if (other) {
            other.roomId = null;
            sendJson(other.ws, { type: 'match:opponent_disconnected', roomId: room.roomId });
          }
          rooms.delete(room.roomId);
        }
      }
      players.delete(connId);
      broadcastQueueStats();
    });
  });

  // Periodic matchmaking sweep for widening MMR brackets
  setInterval(tryMatchmaking, 1500);

  const assetsImagesDir = path.resolve(__dirname, 'src/assets/images');
  app.use(
    '/src/assets/images',
    express.static(assetsImagesDir, {
      maxAge: '7d',
      immutable: true,
    })
  );

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath, { maxAge: '1d' }));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Ironfront: Dominion server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
