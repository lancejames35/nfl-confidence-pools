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
        this.reconnectInterval = 5000; // Increased to 5 seconds to reduce reconnection spam
        this.eventHandlers = new Map();
        this.isAuthenticated = false;
        
        // Don't auto-initialize, let the page do it explicitly
        // this.init();
    }
    
    // Expose init method for manual initialization
    initialize() {
        this.init();
    }
    
    init() {
        try {
            // Check if Socket.IO is available
            if (typeof io === 'undefined') {
                // Socket.IO not available - real-time features disabled
                return;
            }
            
            // Configure socket with session-based authentication
            const socketConfig = {
                reconnection: true,
                reconnectionAttempts: this.maxReconnectAttempts,
                reconnectionDelay: this.reconnectInterval,
                reconnectionDelayMax: 30000, // Max delay between reconnections
                timeout: 20000,
                transports: ['websocket', 'polling'],
                autoConnect: true,
                withCredentials: true // Important for session cookies
            };
            
            // Session cookies will automatically be sent with the connection
            
            // Initialize socket connection
            this.socket = io(socketConfig);
            
            this.setupEventListeners();
            // Handle page visibility changes to reduce unnecessary connections
            this.setupVisibilityHandling();
            
        } catch (error) {
            // Failed to initialize socket client
        }
    }
    
    setupEventListeners() {
        if (!this.socket) return;
        
        // Connection events
        this.socket.on('connect', () => {
            this.connected = true;
            this.reconnectAttempts = 0;
            this.updateConnectionStatus(true);
            
            // Check authentication status
            this.socket.emit('auth_check', {}, (response) => {
                if (response && response.authenticated) {
                    this.isAuthenticated = true;
                } else {
                    this.isAuthenticated = false;
                }
            });
        });
        
        this.socket.on('disconnect', () => {
            this.connected = false;
            this.updateConnectionStatus(false);
        });
        
        this.socket.on('connect_error', (error) => {
            // Connection error occurred
            this.updateConnectionStatus(false);
            
            // Handle authentication errors specifically
            if (error.message === 'Authentication required' || error.message === 'Authentication failed') {
                // Authentication failed - user may need to log in again
                // Don't continuously retry authentication failures
                this.socket.disconnect();
            }
        });
        
        this.socket.on('reconnect', (attemptNumber) => {
            // Reconnected after attempts
            this.updateConnectionStatus(true);
        });
        
        this.socket.on('reconnect_error', (error) => {
            this.reconnectAttempts++;
            // Reconnect attempt failed
            
            // If we've exceeded max attempts, stop trying for a while
            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                // Max reconnection attempts reached, will retry after cooldown
                setTimeout(() => {
                    this.reconnectAttempts = 0;
                    if (!this.connected && this.socket) {
                        // Attempting to reconnect after cooldown
                        this.socket.connect();
                    }
                }, 60000); // Wait 1 minute before allowing reconnections again
            }
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
    
    setupVisibilityHandling() {
        // Handle page visibility to reduce reconnection spam when tab is hidden
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                // Page is hidden, disconnect after a delay if still hidden
                this.visibilityTimeout = setTimeout(() => {
                    if (document.hidden && this.connected && this.socket) {
                        // Tab hidden, temporarily disconnecting to save resources
                        this.socket.disconnect();
                    }
                }, 30000); // Wait 30 seconds before disconnecting
            } else {
                // Page is visible again
                if (this.visibilityTimeout) {
                    clearTimeout(this.visibilityTimeout);
                    this.visibilityTimeout = null;
                }
                
                // Reconnect if disconnected
                if (!this.connected && this.socket) {
                    // Tab visible, reconnecting
                    this.socket.connect();
                }
            }
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
        // Game result received
        
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
        // Game started
        
        // Lock picks interface if applicable
        this.lockPicksInterface(data.gameId);
        
        // Show notification
        this.showNotification('Game has started - picks are now locked', 'warning');
        
        this.emit('gameStarted', data);
    }
    
    // Standings update handler
    handleStandingsUpdate(data) {
        // Standings updated
        
        // Refresh standings table if visible
        const standingsTable = document.getElementById('standings-table');
        if (standingsTable) {
            this.refreshStandings();
        }
        
        this.emit('standingsUpdate', data);
    }
    
    // Pick update handler
    handlePickUpdate(data) {
        // Pick updated
        
        // Update pick status in UI
        this.updatePickStatus(data);
        
        this.emit('pickUpdate', data);
    }
    
    // League update handler
    handleLeagueUpdate(data) {
        // League updated
        this.emit('leagueUpdate', data);
    }
    
    // Notification handler
    handleNotification(data) {
        // Notification received
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
                    // Error in event handler
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