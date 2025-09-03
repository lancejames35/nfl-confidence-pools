const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

class SocketManager {
    constructor() {
        this.io = null;
        this.connectedUsers = new Map(); // userId -> socket.id
        this.userSockets = new Map(); // socket.id -> user data
        this.leagueRooms = new Map(); // leagueId -> Set of socket.ids
    }

    initialize(server) {
        this.io = new Server(server, {
            cors: {
                origin: process.env.CLIENT_URL || "http://localhost:3000",
                methods: ["GET", "POST"],
                credentials: true
            },
            transports: ['websocket', 'polling']
        });

        // Authentication middleware (optional for now)
        this.io.use(async (socket, next) => {
            try {
                const token = socket.handshake.auth.token || 
                             socket.handshake.headers.authorization?.split(' ')[1] ||
                             socket.handshake.query.token;
                
                if (token) {
                    try {
                        // Try to verify JWT token
                        const secret = process.env.JWT_SECRET || 'fallback-secret';
                        const decoded = jwt.verify(token, secret);
                        socket.userId = decoded.userId || decoded.user_id || decoded.id;
                        socket.username = decoded.username || decoded.name || 'User';
                        socket.isAuthenticated = true;
                        console.log(`✅ JWT authenticated: ${socket.username} (${socket.userId})`);
                    } catch (jwtError) {
                        console.warn('Invalid JWT token:', jwtError.message);
                        // Fall back to session-based auth if available
                        socket.isAuthenticated = false;
                        socket.userId = 'guest_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                        socket.username = 'Guest';
                    }
                } else {
                    // Allow anonymous connections for public features
                    socket.userId = 'anonymous_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                    socket.username = 'Anonymous';
                    socket.isAuthenticated = false;
                }
                
                next();
            } catch (error) {
                console.error('Socket authentication error:', error);
                // Allow connection but mark as unauthenticated
                socket.isAuthenticated = false;
                next();
            }
        });

        // Connection handling
        this.io.on('connection', (socket) => {
            this.handleConnection(socket);
        });

        console.log('✅ Socket.io server initialized');
        return this.io;
    }

    handleConnection(socket) {
        const userId = socket.userId;
        const username = socket.username;

        console.log(`🔌 User connected: ${username} (${userId})`);

        // Store user connection
        this.connectedUsers.set(userId, socket.id);
        this.userSockets.set(socket.id, { userId, username });

        // Join user to their personal room
        socket.join(`user_${userId}`);

        // Handle league room joining
        socket.on('join_league', (data) => {
            this.handleJoinLeague(socket, data);
        });

        // Handle leaving league room
        socket.on('leave_league', (data) => {
            this.handleLeaveLeague(socket, data);
        });

        // Chat message handling
        socket.on('chat_message', (data) => {
            this.handleChatMessage(socket, data);
        });

        // Chat reactions
        socket.on('message_reaction', (data) => {
            this.handleMessageReaction(socket, data);
        });

        // Pick updates (auto-save)
        socket.on('pick_update', (data) => {
            this.handlePickUpdate(socket, data);
        });

        // Tiebreaker updates
        socket.on('tiebreaker_update', (data) => {
            this.handleTiebreakerUpdate(socket, data);
        });

        // Typing indicators for chat
        socket.on('typing_start', (data) => {
            socket.to(`league_${data.leagueId}`).emit('user_typing', {
                userId,
                username,
                isTyping: true
            });
        });

        socket.on('typing_stop', (data) => {
            socket.to(`league_${data.leagueId}`).emit('user_typing', {
                userId,
                username,
                isTyping: false
            });
        });

        // Handle disconnection
        socket.on('disconnect', () => {
            this.handleDisconnection(socket);
        });
    }

    handleJoinLeague(socket, data) {
        const { leagueId } = data;
        const userId = socket.userId;
        const username = socket.username;

        if (!leagueId) return;

        // Join league room
        socket.join(`league_${leagueId}`);

        // Track league membership
        if (!this.leagueRooms.has(leagueId)) {
            this.leagueRooms.set(leagueId, new Set());
        }
        this.leagueRooms.get(leagueId).add(socket.id);

        // Notify others in league
        socket.to(`league_${leagueId}`).emit('user_joined_league', {
            userId,
            username,
            timestamp: new Date().toISOString()
        });

        console.log(`👥 ${username} joined league ${leagueId}`);
    }

    handleLeaveLeague(socket, data) {
        const { leagueId } = data;
        const userId = socket.userId;
        const username = socket.username;

        if (!leagueId) return;

        // Leave league room
        socket.leave(`league_${leagueId}`);

        // Update tracking
        if (this.leagueRooms.has(leagueId)) {
            this.leagueRooms.get(leagueId).delete(socket.id);
            
            if (this.leagueRooms.get(leagueId).size === 0) {
                this.leagueRooms.delete(leagueId);
            }
        }

        // Notify others in league
        socket.to(`league_${leagueId}`).emit('user_left_league', {
            userId,
            username,
            timestamp: new Date().toISOString()
        });

        console.log(`👋 ${username} left league ${leagueId}`);
    }

    handleChatMessage(socket, data) {
        const { leagueId, message, parentMessageId } = data;
        const userId = socket.userId;
        const username = socket.username;

        if (!leagueId || !message) return;

        // Basic message validation
        if (message.length > 1000) {
            socket.emit('error', { message: 'Message too long' });
            return;
        }

        // Create message data
        const messageData = {
            messageId: Date.now(), // Temporary ID, should be from database
            leagueId,
            userId,
            username,
            message: message.trim(),
            parentMessageId,
            timestamp: new Date().toISOString(),
            edited: false,
            reactions: {}
        };

        // Broadcast to league room
        this.io.to(`league_${leagueId}`).emit('new_message', messageData);

        console.log(`💬 Chat message in league ${leagueId}: ${username}: ${message.substring(0, 50)}...`);
    }

    handleMessageReaction(socket, data) {
        const { messageId, emoji, action } = data; // action: 'add' or 'remove'
        const userId = socket.userId;
        const username = socket.username;

        if (!messageId || !emoji || !['add', 'remove'].includes(action)) return;

        // This would typically update the database
        // For now, just broadcast the update
        const reactionUpdate = {
            messageId,
            emoji,
            action,
            userId,
            username,
            timestamp: new Date().toISOString()
        };

        // Broadcast to all clients that can see this message
        // In a real implementation, you'd determine which league this message belongs to
        socket.broadcast.emit('reaction_update', reactionUpdate);
    }

    handlePickUpdate(socket, data) {
        const { leagueId, entryId, gameId, selectedTeam, confidencePoints } = data;
        const userId = socket.userId;

        if (!leagueId || !entryId || !gameId) return;

        // Create pick update data
        const pickUpdate = {
            leagueId,
            entryId,
            gameId,
            selectedTeam,
            confidencePoints,
            userId,
            timestamp: new Date().toISOString()
        };

        // Only broadcast to commissioners for live pick tracking
        // Regular users should not see others' picks until deadline
        socket.to(`league_${leagueId}_commissioners`).emit('live_pick_update', pickUpdate);

        console.log(`🏈 Pick update: League ${leagueId}, Entry ${entryId}, Game ${gameId}`);
    }

    handleTiebreakerUpdate(socket, data) {
        const { leagueId, entryId, tiebreakerId, predictedValue } = data;
        const userId = socket.userId;

        if (!leagueId || !entryId || !tiebreakerId) return;

        const tiebreakerUpdate = {
            leagueId,
            entryId,
            tiebreakerId,
            predictedValue,
            userId,
            timestamp: new Date().toISOString()
        };

        // Only broadcast to commissioners
        socket.to(`league_${leagueId}_commissioners`).emit('live_tiebreaker_update', tiebreakerUpdate);
    }

    handleDisconnection(socket) {
        const userData = this.userSockets.get(socket.id);
        
        if (userData) {
            const { userId, username } = userData;
            
            // Clean up tracking
            this.connectedUsers.delete(userId);
            this.userSockets.delete(socket.id);
            
            // Remove from league rooms
            for (const [leagueId, socketIds] of this.leagueRooms.entries()) {
                if (socketIds.has(socket.id)) {
                    socketIds.delete(socket.id);
                    
                    // Notify league members
                    socket.to(`league_${leagueId}`).emit('user_left_league', {
                        userId,
                        username,
                        timestamp: new Date().toISOString()
                    });
                    
                    if (socketIds.size === 0) {
                        this.leagueRooms.delete(leagueId);
                    }
                }
            }
            
            console.log(`🔌 User disconnected: ${username} (${userId})`);
        }
    }

    // Utility methods for emitting events

    // Send notification to specific user
    notifyUser(userId, event, data) {
        const socketId = this.connectedUsers.get(userId);
        if (socketId) {
            this.io.to(socketId).emit(event, data);
        }
    }

    // Send notification to all users in a league
    notifyLeague(leagueId, event, data) {
        this.io.to(`league_${leagueId}`).emit(event, data);
    }

    // Send notification to league commissioners only
    notifyCommissioners(leagueId, event, data) {
        this.io.to(`league_${leagueId}_commissioners`).emit(event, data);
    }

    // Broadcast to all connected clients
    broadcast(event, data) {
        this.io.emit(event, data);
    }
    
    // Emit to all clients (alias for broadcast)
    emitToAll(event, data) {
        this.io.emit(event, data);
    }
    
    // Emit to specific room
    emitToRoom(room, event, data) {
        this.io.to(room).emit(event, data);
    }

    // Get league member count
    getLeagueMemberCount(leagueId) {
        return this.leagueRooms.get(leagueId)?.size || 0;
    }

    // Get total connected users
    getConnectedUserCount() {
        return this.connectedUsers.size;
    }

    // Health check
    getStats() {
        return {
            connectedUsers: this.connectedUsers.size,
            activeLeagues: this.leagueRooms.size,
            totalSockets: this.userSockets.size
        };
    }
}

// Create and export singleton
const socketManager = new SocketManager();

module.exports = socketManager;