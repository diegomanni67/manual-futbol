// server.js
// Servidor de matchmaking y tiempo real para juego de fútbol 2D multijugador
// Stack: Node.js + Express + Socket.io

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { randomUUID } = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // En producción, restringí esto al dominio de tu cliente
    methods: ['GET', 'POST'],
  },
  // Permite que un cliente que se corta un rato (pestaña en segundo plano,
  // wifi que titila, etc.) vuelva a conectarse con el MISMO socket.id y
  // recupere sus salas automáticamente, sin que el servidor lo trate como
  // un jugador nuevo. Requiere socket.io >= 4.6.0 en package.json.
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutos para volver
    skipMiddlewares: true,
  },
  // Más tolerancia al ping: los navegadores frenan los timers de las
  // pestañas en segundo plano, así que un pingInterval/pingTimeout muy
  // cortos terminan desconectando gente que solo minimizó la ventana.
  pingInterval: 25000,
  pingTimeout: 60000,
});

const PORT = process.env.PORT || 3000;

// Cuánto esperamos a que un jugador desconectado vuelva antes de dar
// la partida por terminada de verdad.
const RECONNECT_GRACE_MS = 25000;

// socket.id -> { roomId, timeout } — jugadores que se cortaron y todavía
// están dentro del período de gracia.
const pendingDisconnects = new Map();

// ---------------------------------------------------------------------------
// Estado en memoria
// ---------------------------------------------------------------------------

// Cola de jugadores esperando partido. Guardamos los sockets directamente.
const waitingQueue = [];

// Mapa auxiliar: socket.id -> roomId, para saber en qué sala está cada jugador
// (útil al momento de desconexión durante un partido).
const socketRoomMap = new Map();

// Mapa auxiliar: roomId -> { home: socketId, away: socketId }
const rooms = new Map();

app.get('/', (req, res) => {
  res.send('Servidor de matchmaking del juego de fútbol 2D funcionando.');
});

// ---------------------------------------------------------------------------
// Lógica de matchmaking
// ---------------------------------------------------------------------------

function tryCreateMatch() {
  // Mientras haya al menos 2 jugadores en cola, formamos partidos
  while (waitingQueue.length >= 2) {
    const playerHome = waitingQueue.shift();
    const playerAway = waitingQueue.shift();

    // Por si alguno se desconectó justo antes de emparejarse
    if (!playerHome.connected) continue;
    if (!playerAway.connected) {
      // Devolvemos al jugador válido a la cola y seguimos
      waitingQueue.unshift(playerHome);
      continue;
    }

    const roomId = `room_${randomUUID()}`;

    playerHome.join(roomId);
    playerAway.join(roomId);

    rooms.set(roomId, {
      home: playerHome.id,
      away: playerAway.id,
    });

    socketRoomMap.set(playerHome.id, roomId);
    socketRoomMap.set(playerAway.id, roomId);

    playerHome.emit('match_found', {
      roomId,
      role: 'home',
      opponentId: playerAway.id,
    });

    playerAway.emit('match_found', {
      roomId,
      role: 'away',
      opponentId: playerHome.id,
    });

    console.log(`[MATCH] Sala creada: ${roomId} (home=${playerHome.id}, away=${playerAway.id})`);
  }
}

// ---------------------------------------------------------------------------
// Conexión de sockets
// ---------------------------------------------------------------------------

io.on('connection', (socket) => {
  if (socket.recovered) {
    // Es el MISMO jugador de antes, volvió dentro de la ventana de gracia
    // (cambió de pestaña, se le cortó el wifi un toque, etc.). Conserva su
    // socket.id y sus salas, así que no hay que reconstruir nada.
    console.log(`[RECOVER] ${socket.id} volvió a conectarse`);

    const pending = pendingDisconnects.get(socket.id);
    if (pending) {
      clearTimeout(pending.timeout);
      pendingDisconnects.delete(socket.id);
    }

    const roomId = socketRoomMap.get(socket.id);
    if (roomId) {
      const role = rooms.get(roomId)?.home === socket.id ? 'home' : 'away';
      const opponentId = role === 'home' ? rooms.get(roomId)?.away : rooms.get(roomId)?.home;
      socket.emit('match_found', { roomId, role, opponentId, resumed: true });
      socket.to(roomId).emit('opponent_reconnected');
    }
  } else {
    console.log(`[CONNECT] Jugador conectado: ${socket.id}`);
  }

  // Le mandamos el estado actual al que se acaba de conectar...
  socket.emit('online_count', getOnlineStats());
  // ...y avisamos a todos que cambió la cantidad de conectados.
  broadcastOnlineStats();

  // 1. Buscar partido
  socket.on('find_match', () => {
    // Evitamos duplicados si el jugador toca "Buscar partido" varias veces
    if (waitingQueue.includes(socket)) return;

    waitingQueue.push(socket);
    console.log(`[QUEUE] ${socket.id} entró a la cola. Total en cola: ${waitingQueue.length}`);

    tryCreateMatch();
    broadcastOnlineStats();
  });

  // Opcional: permitir cancelar la búsqueda manualmente
  socket.on('cancel_search', () => {
    removeFromQueue(socket);
    broadcastOnlineStats();
  });

  // 4. Retransmisión de movimientos
  socket.on('player_move', (data) => {
    const roomId = socketRoomMap.get(socket.id);
    if (!roomId) return; // El jugador no está en ninguna sala

    const { x, y } = data || {};
    if (typeof x !== 'number' || typeof y !== 'number') return;

    socket.to(roomId).emit('player_move', {
      playerId: socket.id,
      x,
      y,
    });
  });

  // 5. Manejo de desconexiones
  socket.on('disconnect', (reason) => {
    console.log(`[DISCONNECT] Jugador desconectado: ${socket.id} (${reason})`);

    // Caso 1: estaba en la cola esperando partido
    removeFromQueue(socket);

    // Caso 2: estaba jugando una partida — no la matamos al toque, le damos
    // un margen por si vuelve (esto es lo típico cuando alguien minimiza o
    // cambia de pestaña y el navegador le corta la conexión un rato).
    const roomId = socketRoomMap.get(socket.id);
    if (roomId) {
      socket.to(roomId).emit('opponent_reconnecting', { playerId: socket.id });

      const timeout = setTimeout(() => {
        pendingDisconnects.delete(socket.id);

        socket.to(roomId).emit('opponent_disconnected', {
          playerId: socket.id,
        });

        rooms.delete(roomId);
        socketRoomMap.delete(socket.id);

        console.log(`[ROOM] Sala ${roomId} cerrada: ${socket.id} no volvió a tiempo`);
        broadcastOnlineStats();
      }, RECONNECT_GRACE_MS);

      pendingDisconnects.set(socket.id, { roomId, timeout });
    }

    broadcastOnlineStats();
  });
});

function removeFromQueue(socket) {
  const index = waitingQueue.indexOf(socket);
  if (index !== -1) {
    waitingQueue.splice(index, 1);
    console.log(`[QUEUE] ${socket.id} salió de la cola. Total en cola: ${waitingQueue.length}`);
  }
}

// ---------------------------------------------------------------------------
// Contador de gente conectada / buscando partida
// ---------------------------------------------------------------------------

function getOnlineStats() {
  return {
    online: io.engine.clientsCount, // total de sockets conectados al servidor
    searching: waitingQueue.length, // cuántos de esos están buscando rival
    inMatch: rooms.size * 2,        // cuántos están jugando una partida ahora
  };
}

function broadcastOnlineStats() {
  io.emit('online_count', getOnlineStats());
}

// ---------------------------------------------------------------------------
// Arranque del servidor
// ---------------------------------------------------------------------------

server.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
