/**
 * Socket.IO Client for Real-time Updates
 * NFL Confidence Pools Platform
 */

class SocketClient {
    constructor() {
        this.socket = null;
        this.connected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectInterval = 2000;
        this.eventHandlers = new Map();
        
        this.init();
    }
    
    init() {
        try {
            // Check if Socket.IO is available
            if (typeof io === 'undefined') {
                console.warn('Socket.IO not available - real-time features disabled');
                return;
            }
            
            // For now, don't try to authenticate with JWT since this app uses sessions
            const socketConfig = {
                reconnection: true,
                reconnectionAttempts: this.maxReconnectAttempts,
                reconnectionDelay: this.reconnectInterval,
                timeout: 20000,
                transports: ['websocket', 'polling']
            };
            
            // Session-based authentication will be handled on the server side
            
            // Initialize socket connection
            this.socket = io(socketConfig);
            
            this.setupEventListeners();
            console.log('🔌 Socket client initialized');
        } catch (error) {
            console.error('Failed to initialize socket client:', error);
        }
    }
    
    setupEventListeners() {
        if (!this.socket) return;
        
        // Connection events
        this.socket.on('connect', () => {
            this.connected = true;
            this.reconnectAttempts = 0;
            console.log('✅ Connected to server');
            this.updateConnectionStatus(true);
        });
        
        this.socket.on('disconnect', () => {
            this.connected = false;
            console.log('❌ Disconnected from server');
            this.updateConnectionStatus(false);
        });
        
        this.socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            this.updateConnectionStatus(false);
        });
        
        this.socket.on('reconnect', (attemptNumber) => {
            console.log(`🔄 Reconnected after ${attemptNumber} attempts`);
            this.updateConnectionStatus(true);
        });
        
        this.socket.on('reconnect_error', (error) => {
            this.reconnectAttempts++;
            console.error(`Reconnect attempt ${this.reconnectAttempts} failed:`, error);
        });
        
        // Game-related events
        this.socket.on('gameResult', (data) => {
            this.handleGameResult(data);
        });
        
        this.socket.on('gameStarted', (data) => {
            this.handleGameStarted(data);
        });
        
        this.socket.on('standingsUpdate', (data) => {
            this.handleStandingsUpdate(data);
        });
        
        this.socket.on('pickUpdate', (data) => {
            this.handlePickUpdate(data);
        });
        
        // League events
        this.socket.on('leagueUpdate', (data) => {
            this.handleLeagueUpdate(data);
        });
        
        // Notification events
        this.socket.on('notification', (data) => {
            this.handleNotification(data);
        });
    }
    
    // Connection status indicator
    updateConnectionStatus(connected) {
        const indicator = document.getElementById('connection-status');
        if (indicator) {
            indicator.className = connected ? 'connected' : 'disconnected';
            indicator.title = connected ? 'Connected' : 'Disconnected';
        }
        
        // Show/hide offline banner
        const offlineBanner = document.getElementById('offline-banner');
        if (offlineBanner) {
            offlineBanner.style.display = connected ? 'none' : 'block';
        }
    }
    
    // Game result handler
    handleGameResult(data) {
        console.log('🏈 Game result received:', data);
        
        // Update game score displays
        this.updateGameScore(data.gameId, data.game);
        
        // Refresh picks if on picks page
        if (window.location.pathname.includes('/picks/')) {
            this.refreshPicksDisplay();
        }
        
        // Show notification
        this.showNotification(
            `Game Result: ${data.game.away_team} ${data.game.away_score} - ${data.game.home_score} ${data.game.home_team}`,
            'info'
        );
        
        // Trigger custom event
        this.emit('gameResult', data);
    }
    
    // Game started handler
    handleGameStarted(data) {
        console.log('🚀 Game started:', data);
        
        // Lock picks interface if applicable
        this.lockPicksInterface(data.gameId);
        
        // Show notification
        this.showNotification('Game has started - picks are now locked', 'warning');
        
        this.emit('gameStarted', data);
    }
    
    // Standings update handler
    handleStandingsUpdate(data) {
        console.log('📊 Standings updated:', data);
        
        // Refresh standings table if visible
        const standingsTable = document.getElementById('standings-table');
        if (standingsTable) {
            this.refreshStandings();
        }
        
        this.emit('standingsUpdate', data);
    }
    
    // Pick update handler
    handlePickUpdate(data) {
        console.log('✏️ Pick updated:', data);
        
        // Update pick status in UI
        this.updatePickStatus(data);
        
        this.emit('pickUpdate', data);
    }
    
    // League update handler
    handleLeagueUpdate(data) {
        console.log('🏆 League updated:', data);
        this.emit('leagueUpdate', data);
    }
    
    // Notification handler
    handleNotification(data) {
        console.log('🔔 Notification:', data);
        this.showNotification(data.message, data.type || 'info');
        this.emit('notification', data);
    }
    
    // Utility methods
    updateGameScore(gameId, game) {
        const gameElements = document.querySelectorAll(`[data-game-id="${gameId}"]`);
        gameElements.forEach(element => {
            const awayScore = element.querySelector('.away-score');
            const homeScore = element.querySelector('.home-score');
            const gameStatus = element.querySelector('.game-status');
            
            if (awayScore) awayScore.textContent = game.away_score;
            if (homeScore) homeScore.textContent = game.home_score;
            if (gameStatus) gameStatus.textContent = game.status;
            
            // Add visual indicators for completed games
            if (game.status === 'completed') {
                element.classList.add('game-completed');
            }
        });
    }
    
    lockPicksInterface(gameId) {
        const pickElements = document.querySelectorAll(`[data-game-id="${gameId}"] input`);
        pickElements.forEach(input => {
            input.disabled = true;
        });
        
        const gameElement = document.querySelector(`[data-game-id="${gameId}"]`);
        if (gameElement) {
            gameElement.classList.add('picks-locked');
        }
    }
    
    updatePickStatus(data) {
        const pickElement = document.querySelector(`[data-pick-id="${data.pickId}"]`);
        if (pickElement) {
            const statusElement = pickElement.querySelector('.pick-status');
            const pointsElement = pickElement.querySelector('.pick-points');
            
            if (statusElement) {
                statusElement.className = `pick-status ${data.isCorrect ? 'correct' : 'incorrect'}`;
                statusElement.textContent = data.isCorrect ? '✓' : '✗';
            }
            
            if (pointsElement) {
                pointsElement.textContent = data.pointsEarned || 0;
            }
        }
    }
    
    refreshPicksDisplay() {
        // Refresh picks without full page reload
        const picksContainer = document.getElementById('picks-container');
        if (picksContainer) {
            // Trigger refresh event that can be handled by picks page
            this.emit('refreshPicks');
        }
    }
    
    refreshStandings() {
        // Refresh standings without full page reload
        const standingsContainer = document.getElementById('standings-container');
        if (standingsContainer) {
            this.emit('refreshStandings');
        }
    }
    
    showNotification(message, type = 'info') {
        // Create toast notification
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <div class="toast-content">
                <span class="toast-message">${message}</span>
                <button class="toast-close" onclick="this.parentElement.parentElement.remove()">×</button>
            </div>
        `;
        
        // Add to toast container or create one
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        
        container.appendChild(toast);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, 5000);
    }
    
    // Event system for custom handlers
    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, []);
        }
        this.eventHandlers.get(event).push(handler);
    }
    
    emit(event, data) {
        const handlers = this.eventHandlers.get(event);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`Error in ${event} handler:`, error);
                }
            });
        }
    }
    
    // Join league room for targeted updates
    joinLeague(leagueId) {
        if (this.socket && this.connected) {
            this.socket.emit('joinLeague', leagueId);
        }
    }
    
    // Leave league room
    leaveLeague(leagueId) {
        if (this.socket && this.connected) {
            this.socket.emit('leaveLeague', leagueId);
        }
    }
    
    // Send pick update
    sendPickUpdate(pickData) {
        if (this.socket && this.connected) {
            this.socket.emit('pickUpdate', pickData);
        }
    }
    
    // Get connection status
    isConnected() {
        return this.connected && this.socket?.connected;
    }
}

// Initialize socket client when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    // Always try to initialize - the SocketClient will handle if io is not available
    window.socketClient = new SocketClient();
    
    // Only proceed with league setup if socket is actually available
    if (window.socketClient.socket) {
        // Wait for connection before joining league
        window.socketClient.socket.on('connect', function() {
            const leagueId = document.body.getAttribute('data-league-id');
            if (leagueId) {
                window.socketClient.joinLeague(leagueId);
            }
        });
    }
});

// Expose SocketClient globally
window.SocketClient = SocketClient;