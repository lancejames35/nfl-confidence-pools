const { Server } = require('socket.io');
const session = require('express-session');
const database = require('./database');

class SocketManager {
    constructor() {
        this.io = null;
        this.connectedUsers = new Map(); // userId -> socket.id
        this.userSockets = new Map(); // socket.id -> user data
        this.leagueRooms = new Map(); // leagueId -> Set of socket.ids
    }

    initialize(server, sessionMiddleware = null) {
        this.io = new Server(server, {
            cors: {
                origin: process.env.CLIENT_URL || "http://localhost:3000",
                methods: ["GET", "POST"],
                credentials: true
            },
            transports: ['websocket', 'polling']
        });
        
        // Store session middleware for Socket.IO session access
        this.sessionMiddleware = sessionMiddleware;

        // Use session middleware with Socket.IO if provided
        if (sessionMiddleware) {
            this.io.use((socket, next) => {
                // Create a fake response object for session middleware
                const fakeRes = {
                    getHeader: () => null,
                    setHeader: () => {},
                    end: () => {}
                };
                sessionMiddleware(socket.request, fakeRes, next);
            });
        }

        // Session-based authentication middleware
        this.io.use(async (socket, next) => {
            try {
                // Access session data from the socket request
                const session = socket.request.session;
                
                // Socket session debug information available in development mode
                
                if (session && session.userId) {
                    // User is authenticated via session (using session.userId, not session.user)
                    socket.userId = session.userId;
                    socket.username = session.username || 'User';
                    socket.isAuthenticated = true;
                    
                    // Load full user data from database for socket operations
                    try {
                        const userResult = await database.execute(
                            'SELECT user_id, username, email, first_name, last_name FROM users WHERE user_id = ?',
                            [session.userId]
                        );
                        
                        if (userResult[0]) {
                            socket.user = userResult[0];
                            socket.username = userResult[0].username;
                        }
                    } catch (error) {
                        // Error loading user data for socket connection
                    }
                    
                    // Session authenticated successfully
                } else {
                    // No valid session - REJECT the connection for unauthenticated users
                    // Rejecting unauthenticated connection - no userId in session
                    return next(new Error('Authentication required'));
                }
                
                next();
            } catch (error) {
                // Socket authentication error occurred
                // Reject unauthenticated connections
                return next(new Error('Authentication failed'));
            }
        });

        // Connection handling
        this.io.on('connection', (socket) => {
            this.handleConnection(socket);
        });

        // Socket.io server initialized successfully
        return this.io;
    }

    handleConnection(socket) {
        const userId = socket.userId;
        const username = socket.username;
        const isAuthenticated = socket.isAuthenticated;

        // Since we now reject unauthenticated connections, this should always be true
        // Authenticated user connected
        
        // Store user connection
        this.connectedUsers.set(userId, socket.id);
        this.userSockets.set(socket.id, { userId, username, isAuthenticated: true });

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

        // Authentication check
        socket.on('auth_check', (data, callback) => {
            if (callback) {
                callback({
                    authenticated: socket.isAuthenticated,
                    userId: socket.userId,
                    username: socket.username
                });
            }
        });

        // Handle disconnection
        socket.on('disconnect', () => {
            this.handleDisconnection(socket);
        });
    }

    handleJoinLeague(socket, data) {
        // Only allow authenticated users to join league rooms
        if (!socket.isAuthenticated) {
            // Unauthenticated user attempted to join league room
            return;
        }

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

        // User joined league successfully
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

        // User left league
    }

    handleChatMessage(socket, data) {
        // Only authenticated users can send chat messages
        if (!socket.isAuthenticated) {
            // Unauthenticated user attempted to send chat message
            return;
        }

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

        // Chat message sent successfully
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
        // Only authenticated users can update picks
        if (!socket.isAuthenticated) {
            // Unauthenticated user attempted to update picks
            return;
        }

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

        // Pick update processed
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
            
            // Clean up user tracking (all connections are now authenticated)
            this.connectedUsers.delete(userId);
            this.userSockets.delete(socket.id);
            // Authenticated user disconnected
            
            // Remove from league rooms
            for (const [leagueId, socketIds] of this.leagueRooms.entries()) {
                if (socketIds.has(socket.id)) {
                    socketIds.delete(socket.id);
                    
                    // Notify league members of disconnection
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