/**
 * Live Scores Frontend Handler
 * Handles WebSocket updates and AJAX polling for live NFL scores
 */

// Helper function to get NFL season year (Jan-July = previous year, Aug-Dec = current year)
function getNFLSeasonYearClient() {
    const now = new Date();
    const month = now.getMonth(); // 0-11
    const year = now.getFullYear();
    return month <= 6 ? year - 1 : year;
}

class LiveScoresManager {
    constructor(options = {}) {
        this.socket = null;
        this.currentWeek = options.week || 1;
        this.currentSeason = options.season || getNFLSeasonYearClient();
        this.leagueId = options.leagueId || null;
        this.pollInterval = options.pollInterval || 60000; // 1 minute fallback polling
        this.pollTimer = null;
        this.isSocketConnected = false;
        
        // DOM elements
        this.gameElements = new Map(); // gameId -> DOM element
        this.userTotalElements = new Map(); // entryId -> DOM element
        
        this.init();
    }
    
    init() {
        this.setupSocketConnection();
        this.setupFallbackPolling();
        this.bindEvents();
        this.cacheGameElements();
        
    }
    
    /**
     * Set up WebSocket connection for real-time updates
     */
    setupSocketConnection() {
        if (typeof io !== 'undefined') {
            this.socket = io();
            
            this.socket.on('connect', () => {
                this.isSocketConnected = true;
                
                // Join league room if specified
                if (this.leagueId) {
                    this.socket.emit('join_league', { leagueId: this.leagueId });
                }
                
                // Stop polling since WebSocket is connected
                this.stopPolling();
            });
            
            this.socket.on('disconnect', () => {
                this.isSocketConnected = false;
                
                // Start fallback polling
                this.startPolling();
            });
            
            // Listen for score updates
            this.socket.on('score-update', (data) => {
                this.handleScoreUpdate(data);
            });
            
            // Listen for game status updates
            this.socket.on('game-status-update', (data) => {
                this.handleGameStatusUpdate(data);
            });
            
            // Listen for user totals updates
            this.socket.on('user-totals-update', (data) => {
                this.handleUserTotalsUpdate(data);
            });
            
            // League-specific updates
            this.socket.on('league-score-update', (data) => {
                this.handleScoreUpdate(data);
            });
        } else {
            this.startPolling();
        }
    }
    
    /**
     * Set up fallback AJAX polling
     */
    setupFallbackPolling() {
        // Don't start immediately if socket is available
        if (!this.isSocketConnected) {
            setTimeout(() => {
                if (!this.isSocketConnected) {
                    this.startPolling();
                }
            }, 5000); // Wait 5 seconds for socket connection
        }
    }
    
    startPolling() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
        }
        
        this.pollTimer = setInterval(() => {
            this.fetchLiveScores();
        }, this.pollInterval);
        
    }
    
    stopPolling() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    }
    
    /**
     * Cache game elements for faster updates
     */
    cacheGameElements() {
        // Cache game score elements
        document.querySelectorAll('[data-game-id]').forEach(element => {
            const gameId = element.dataset.gameId;
            if (!this.gameElements.has(gameId)) {
                this.gameElements.set(gameId, {
                    container: element,
                    homeScore: element.querySelector('.home-score'),
                    awayScore: element.querySelector('.away-score'),
                    status: element.querySelector('.game-status'),
                    quarter: element.querySelector('.quarter'),
                    timeRemaining: element.querySelector('.time-remaining')
                });
            }
        });
        
        // Cache user total elements
        document.querySelectorAll('[data-entry-id]').forEach(element => {
            const entryId = element.dataset.entryId;
            if (!this.userTotalElements.has(entryId)) {
                this.userTotalElements.set(entryId, {
                    container: element,
                    weeklyScore: element.querySelector('.weekly-score'),
                    seasonTotal: element.querySelector('.season-total'),
                    maxPossible: element.querySelector('.max-possible')
                });
            }
        });
        
    }
    
    /**
     * Fetch live scores via AJAX
     */
    async fetchLiveScores() {
        try {
            const response = await fetch(`/api/live-scores/status?week=${this.currentWeek}&season=${this.currentSeason}`);
            const data = await response.json();
            
            if (data.success) {
                this.handleScoreUpdate(data);
            }
        } catch (error) {
            console.error('Error fetching live scores:', error);
        }
    }
    
    /**
     * Handle score update from WebSocket or AJAX
     */
    handleScoreUpdate(data) {
        
        if (data.games) {
            data.games.forEach(game => {
                this.updateGameDisplay(game);
            });
        }
        
        if (data.gamesUpdated) {
            data.gamesUpdated.forEach(game => {
                this.updateGameFromUpdate(game);
            });
        }
        
        // Update picks colors if we have the data
        if (data.week === this.currentWeek) {
            this.updatePicksDisplay();
        }
        
        // Show update notification
        // Score update notification removed per user request
    }
    
    /**
     * Update game display elements
     */
    updateGameDisplay(game) {
        const elements = this.gameElements.get(game.game_id?.toString());
        if (!elements) return;
        
        // Update scores
        if (elements.homeScore && game.home_score !== undefined) {
            elements.homeScore.textContent = game.home_score;
        }
        
        if (elements.awayScore && game.away_score !== undefined) {
            elements.awayScore.textContent = game.away_score;
        }
        
        // Update game status
        if (elements.status && game.displayStatus) {
            elements.status.textContent = game.displayStatus;
            elements.status.className = `game-status ${this.getStatusClass(game)}`;
        }
        
        // Update quarter and time using properly formatted display status
        if (elements.quarter) {
            // Use formatted status (e.g., "Halftime", "End of 1st", "2nd - 14:23")
            elements.quarter.textContent = game.displayStatus || 'In Progress';
        }
        
        if (elements.timeRemaining) {
            // Time is now included in displayStatus, so clear this or hide it
            elements.timeRemaining.textContent = '';
        }
        
        // Add live indicator
        if (game.isLive) {
            elements.container.classList.add('live-game');
        } else {
            elements.container.classList.remove('live-game');
        }
        
        // Add final indicator
        if (game.isFinal) {
            elements.container.classList.add('final-game');
        }
    }
    
    /**
     * Update game from cron update data
     */
    updateGameFromUpdate(gameUpdate) {
        // Find game element by team matchup
        const gameElement = Array.from(document.querySelectorAll('[data-game-teams]')).find(el => {
            return el.dataset.gameTeams === gameUpdate.teams;
        });
        
        if (gameElement) {
            const scoreElement = gameElement.querySelector('.game-score');
            if (scoreElement) {
                scoreElement.textContent = gameUpdate.score;
            }
            
            const statusElement = gameElement.querySelector('.game-status');
            if (statusElement) {
                statusElement.textContent = gameUpdate.status;
            }
        }
    }
    
    /**
     * Update picks display with colors based on current game status
     */
    updatePicksDisplay() {
        document.querySelectorAll('[data-pick-id]').forEach(pickElement => {
            const pickId = pickElement.dataset.pickId;
            const gameId = pickElement.dataset.gameId;
            const selectedTeam = pickElement.dataset.selectedTeam;
            const isCorrect = pickElement.dataset.isCorrect;
            
            // Update pick colors based on is_correct value
            pickElement.classList.remove('pick-winning', 'pick-losing', 'pick-tied', 'pick-pending');
            
            if (isCorrect === '1') {
                pickElement.classList.add('pick-winning');
            } else if (isCorrect === '0') {
                pickElement.classList.add('pick-losing');
            } else if (isCorrect === null || isCorrect === 'null') {
                pickElement.classList.add('pick-tied');
            } else {
                pickElement.classList.add('pick-pending');
            }
        });
    }
    
    /**
     * Handle user totals update
     */
    handleUserTotalsUpdate(data) {
        
        if (data.userTotals) {
            data.userTotals.forEach(user => {
                this.updateUserTotalDisplay(user);
            });
        }
        
        // Standings update notification removed per user request
    }
    
    /**
     * Update user total display elements
     */
    updateUserTotalDisplay(user) {
        const elements = this.userTotalElements.get(user.entry_id?.toString());
        if (!elements) return;
        
        if (elements.weeklyScore) {
            elements.weeklyScore.textContent = user.weekly_score || 0;
        }
        
        if (elements.seasonTotal) {
            elements.seasonTotal.textContent = user.season_total || 0;
        }
        
        if (elements.maxPossible) {
            elements.maxPossible.textContent = user.max_possible || 0;
        }
    }
    
    /**
     * Get CSS class for game status
     */
    getStatusClass(game) {
        if (game.isLive) {
            return 'status-live';
        } else if (game.isFinal) {
            return 'status-final';
        } else {
            return 'status-scheduled';
        }
    }
    
    /**
     * Show update notification to user (removed per user request)
     */
    
    /**
     * Bind event listeners
     */
    bindEvents() {
        // Manual refresh button
        const refreshButton = document.getElementById('refresh-scores');
        if (refreshButton) {
            refreshButton.addEventListener('click', (e) => {
                e.preventDefault();
                this.fetchLiveScores();
                this.showUpdateNotification('Refreshing scores...');
            });
        }
        
        // Page visibility change - resume/pause updates
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                // Page hidden - reduce update frequency
                if (this.pollTimer) {
                    this.stopPolling();
                    // Restart with longer interval
                    this.pollInterval = 300000; // 5 minutes
                    this.startPolling();
                }
            } else {
                // Page visible - restore normal frequency
                this.pollInterval = 60000; // 1 minute
                if (!this.isSocketConnected) {
                    this.stopPolling();
                    this.startPolling();
                }
            }
        });
    }
    
    /**
     * Handle game status update
     */
    handleGameStatusUpdate(data) {
        
        if (data.gameId) {
            this.updateGameDisplay({
                game_id: data.gameId,
                displayStatus: data.status,
                isLive: data.isLive,
                isFinal: data.isFinal
            });
        }
    }
    
    /**
     * Destroy the manager and clean up
     */
    destroy() {
        this.stopPolling();
        
        if (this.socket) {
            this.socket.disconnect();
        }
        
        this.gameElements.clear();
        this.userTotalElements.clear();
        
    }
}

// Auto-initialize if we're on a results page
document.addEventListener('DOMContentLoaded', () => {
    // Check if we're on a results page
    if (document.querySelector('[data-page="results"]') || 
        document.querySelector('.results-container') ||
        window.location.pathname.includes('/results')) {
        
        // Extract configuration from page
        const config = {
            week: parseInt(document.querySelector('[data-current-week]')?.dataset.currentWeek) || 1,
            season: parseInt(document.querySelector('[data-current-season]')?.dataset.currentSeason) || getNFLSeasonYearClient(),
            leagueId: parseInt(document.querySelector('[data-league-id]')?.dataset.leagueId) || null
        };
        
        // Initialize live scores manager
        window.liveScoresManager = new LiveScoresManager(config);
        
    }
});