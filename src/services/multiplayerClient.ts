import { FactionSide, MapId, MultiplayerCommand } from '../game/types';

export interface ServerStats {
  onlineCount: number;
  queuedCount: number;
  activeRooms: number;
}

export interface MatchedGameInfo {
  roomId: string;
  mapId: MapId;
  mode: 'ranked_1v1' | 'custom_1v1';
  side: FactionSide;
  opponent: {
    uid: string;
    commanderName: string;
    mmr: number;
    rankTier: string;
    loadout: Record<string, string>;
  };
}

type ListenerMap = {
  onConnect?: (connected: boolean) => void;
  onStats?: (stats: ServerStats) => void;
  onQueueStatus?: (status: 'idle' | 'searching') => void;
  onRoomCreated?: (roomId: string, mapId: MapId) => void;
  onRoomError?: (message: string) => void;
  onMatchFound?: (info: MatchedGameInfo) => void;
  onRemoteCommand?: (cmd: MultiplayerCommand) => void;
  onOpponentExit?: (reason: 'surrender' | 'disconnected') => void;
  onLatency?: (ms: number) => void;
};

class MultiplayerClient {
  private ws: WebSocket | null = null;
  private listeners: ListenerMap = {};
  private pingTimer: number | null = null;

  public connect(listeners: ListenerMap) {
    this.listeners = listeners;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.listeners.onConnect?.(true);
      this.startPingLoop();
    };

    ws.onclose = () => {
      this.listeners.onConnect?.(false);
      this.stopPingLoop();
    };

    ws.onerror = () => {
      this.listeners.onConnect?.(false);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case 'server:stats':
            this.listeners.onStats?.({
              onlineCount: msg.onlineCount ?? 1,
              queuedCount: msg.queuedCount ?? 0,
              activeRooms: msg.activeRooms ?? 0,
            });
            break;
          case 'queue:status':
            this.listeners.onQueueStatus?.(msg.status);
            break;
          case 'room:created':
            this.listeners.onRoomCreated?.(msg.roomId, msg.mapId);
            break;
          case 'room:error':
            this.listeners.onRoomError?.(msg.message);
            break;
          case 'match:found':
            this.listeners.onMatchFound?.({
              roomId: msg.roomId,
              mapId: msg.mapId,
              mode: msg.mode,
              side: msg.side,
              opponent: msg.opponent,
            });
            break;
          case 'match:command':
            this.listeners.onRemoteCommand?.(msg.command);
            break;
          case 'match:opponent_surrendered':
            this.listeners.onOpponentExit?.('surrender');
            break;
          case 'match:opponent_disconnected':
            this.listeners.onOpponentExit?.('disconnected');
            break;
          case 'pong':
            if (typeof msg.clientTime === 'number') {
              this.listeners.onLatency?.(Math.max(1, Date.now() - msg.clientTime));
            }
            break;
        }
      } catch {
        // Ignore malformed packets
      }
    };
  }

  public updateListeners(listeners: ListenerMap) {
    this.listeners = { ...this.listeners, ...listeners };
  }

  private startPingLoop() {
    this.stopPingLoop();
    this.pingTimer = window.setInterval(() => {
      this.send({ type: 'ping', clientTime: Date.now() });
    }, 5000);
  }

  private stopPingLoop() {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  public send(payload: unknown) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  public identify(uid: string, commanderName: string, mmr: number, rankTier: string, loadout: Record<string, string>) {
    this.send({ type: 'player:identify', uid, commanderName, mmr, rankTier, loadout });
  }

  public joinRankedQueue(mapId: MapId) {
    this.send({ type: 'queue:join', mapId });
  }

  public leaveRankedQueue() {
    this.send({ type: 'queue:leave' });
  }

  public createCustomRoom(mapId: MapId) {
    this.send({ type: 'room:create', mapId });
  }

  public joinCustomRoom(roomId: string) {
    this.send({ type: 'room:join', roomId });
  }

  public emitCommand(command: MultiplayerCommand) {
    this.send({ type: 'match:command', command });
  }

  public finishMatch(reason: 'completed' | 'surrender') {
    this.send({ type: 'match:finish', reason });
  }

  public disconnect() {
    this.stopPingLoop();
    this.ws?.close();
    this.ws = null;
  }
}

export const multiplayerClient = new MultiplayerClient();
