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
});

const PORT = process.env.PORT || 3000;

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
  console.log(`[CONNECT] Jugador conectado: ${socket.id}`);

  // 1. Buscar partido
  socket.on('find_match', () => {
    // Evitamos duplicados si el jugador toca "Buscar partido" varias veces
    if (waitingQueue.includes(socket)) return;

    waitingQueue.push(socket);
    console.log(`[QUEUE] ${socket.id} entró a la cola. Total en cola: ${waitingQueue.length}`);

    tryCreateMatch();
  });

  // Opcional: permitir cancelar la búsqueda manualmente
  socket.on('cancel_search', () => {
    removeFromQueue(socket);
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
  socket.on('disconnect', () => {
    console.log(`[DISCONNECT] Jugador desconectado: ${socket.id}`);

    // Caso 1: estaba en la cola esperando partido
    removeFromQueue(socket);

    // Caso 2: estaba jugando una partida
    const roomId = socketRoomMap.get(socket.id);
    if (roomId) {
      socket.to(roomId).emit('opponent_disconnected', {
        playerId: socket.id,
      });

      rooms.delete(roomId);
      socketRoomMap.delete(socket.id);

      console.log(`[ROOM] Sala ${roomId} cerrada por desconexión de ${socket.id}`);
    }
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
// Arranque del servidor
// ---------------------------------------------------------------------------

server.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
