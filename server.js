const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// 1. SERVIR ARCHIVOS ESTÁTICOS Y PÁGINA PRINCIPAL
// Sirve automáticamente index.html, main.js, imágenes, etc.
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 2. CONFIGURACIÓN DE SOCKET.IO Y CORS
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Cola de espera para el Matchmaking
let waitingQueue = [];

// 3. CONEXIONES DE SOCKET.IO
io.on('connection', (socket) => {
    console.log(`Jugador conectado: ${socket.id}`);

    // EL JUGADOR TOCA "BUSCAR PARTIDO"
    socket.on('find_match', () => {
        // Evitar que el mismo jugador se meta dos veces
        if (waitingQueue.find(s => s.id === socket.id)) return;

        waitingQueue.push(socket);
        console.log(`Jugador ${socket.id} entró a la cola. En espera: ${waitingQueue.length}`);

        // Si hay al menos 2 jugadores, armamos la sala
        if (waitingQueue.length >= 2) {
            const player1 = waitingQueue.shift();
            const player2 = waitingQueue.shift();

            const roomId = `room_${player1.id}_${player2.id}`;

            // Unir a ambos a la sala de Socket.io
            player1.join(roomId);
            player2.join(roomId);

            // Guardar el roomId en la propiedad del socket para referencia rápida
            player1.roomId = roomId;
            player2.roomId = roomId;

            // Notificar a Player 1 (LOCAL)
            player1.emit('match_found', {
                roomId: roomId,
                role: 'home',
                opponentId: player2.id
            });

            // Notificar a Player 2 (VISITA)
            player2.emit('match_found', {
                roomId: roomId,
                role: 'away',
                opponentId: player1.id
            });

            console.log(`¡PARTIDO CREADO! Sala: ${roomId}`);
        }
    });

    // SINCRONIZACIÓN DE MOVIMIENTOS Y PELOTA
    socket.on('player_update', (data) => {
        if (socket.roomId) {
            // Reenviar los datos del jugador a su rival en la misma sala
            socket.to(socket.roomId).emit('opponent_update', data);
        }
    });

    // MANEJO DE DESCONEXIONES
    socket.on('disconnect', () => {
        console.log(`Jugador desconectado: ${socket.id}`);

        // Si estaba en la cola de espera, lo sacamos
        waitingQueue = waitingQueue.filter(s => s.id !== socket.id);

        // Si estaba en un partido, le avisamos al rival
        if (socket.roomId) {
            socket.to(socket.roomId).emit('opponent_disconnected');
        }
    });
});

// 4. INICIO DEL SERVIDOR
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});