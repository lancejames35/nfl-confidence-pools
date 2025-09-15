const cron = require('node-cron');
const database = require('../config/database');
const ESPNApiService = require('./ESPNApiService');

class LiveScoreScheduler {
    constructor() {
        this.currentTask = null;
        this.isRunning = false;
        this.isUpdating = false;
        this.nextGameCheck = null;
        this.gameEndCheck = null;
    }

    /**
     * Initialize the scheduler - starts the smart cron system
     */
    async initialize() {
        try {
            // Start with checking for the next game
            await this.scheduleNextGameCheck();
            
            // Set up a backup check every hour to catch any missed games
            cron.schedule('0 * * * *', () => {
                this.scheduleNextGameCheck();
            });
        } catch (error) {
            console.error('❌ LiveScoreScheduler initialization failed:', error.message);
            // Don't retry automatically to prevent infinite loops
            // Manual restart will be required if this fails
        }
    }

    /**
     * Check for the next upcoming game and schedule the live updates
     */
    async scheduleNextGameCheck() {
        try {
            // First check if there are currently live games
            await this.checkAndStartLiveUpdates();
            
            // If no live games, then check for next scheduled game
            if (!this.isRunning) {
                const nextGame = await this.getNextGame();
                
                if (!nextGame) {
                    this.stopLiveUpdates();
                    return;
                }

                const now = new Date();
                const gameTime = new Date(nextGame.kickoff_timestamp);
                const startMonitoringTime = new Date(gameTime.getTime() - (30 * 60 * 1000)); // 30 minutes before kickoff
                const timeUntilMonitoring = startMonitoringTime - now;

                console.log(`📅 Next game: ${nextGame.home_team} vs ${nextGame.away_team} at ${gameTime.toISOString()}`);
                console.log(`🕐 Will start monitoring at: ${startMonitoringTime.toISOString()} (30 min before kickoff)`);

                if (timeUntilMonitoring <= 0) {
                    // We should already be monitoring this game - start immediately
                    console.log(`🚀 Starting monitoring immediately (game starts soon or already started)`);
                    await this.startLiveUpdates();
                } else {
                    // Schedule to start monitoring 30 minutes before kickoff
                    console.log(`⏰ Scheduling monitoring to start in ${Math.round(timeUntilMonitoring / (60 * 1000))} minutes`);
                    
                    if (this.nextGameCheck) {
                        clearTimeout(this.nextGameCheck);
                    }
                    
                    this.nextGameCheck = setTimeout(() => {
                        console.log(`🎯 Scheduled monitoring time reached - starting live updates for upcoming game`);
                        this.startLiveUpdates();
                    }, timeUntilMonitoring);
                }
            }

        } catch (error) {
            // Retry in 1 hour on error
            if (this.nextGameCheck) {
                clearTimeout(this.nextGameCheck);
            }
            this.nextGameCheck = setTimeout(() => {
                this.scheduleNextGameCheck();
            }, 3600000); // 1 hour
        }
    }

    /**
     * Get the next upcoming game from database
     */
    async getNextGame() {
        const query = `
            SELECT
                nfl_game_id as game_id,
                kickoff_timestamp,
                status,
                nfl_game_id,
                week,
                season_year
            FROM nfl_games
            WHERE kickoff_timestamp > NOW()
            AND status IN ('scheduled', 'in_progress')
            ORDER BY kickoff_timestamp ASC
            LIMIT 1`;

        const results = await database.execute(query);
        if (results.length > 0) {
            const game = results[0];
            // Extract team names from nfl_game_id (e.g., "2025_W2_HOU_TB" -> "HOU vs TB")
            const parts = game.nfl_game_id.split('_');
            if (parts.length >= 4) {
                game.home_team = parts[3]; // TB
                game.away_team = parts[2]; // HOU
            } else {
                game.home_team = 'TBD';
                game.away_team = 'TBD';
            }
            return game;
        }
        return null;
    }

    /**
     * Check if there are currently live games and start updates if needed
     */
    async checkAndStartLiveUpdates() {
        try {
            // Get all games that could be live, then check with JavaScript time like dashboard
            const gamesQuery = `
                SELECT kickoff_timestamp, status
                FROM nfl_games
                WHERE (
                    status = 'in_progress'
                    OR (
                        status IN ('scheduled', 'in_progress')
                        AND kickoff_timestamp >= DATE_SUB(NOW(), INTERVAL 6 HOUR)
                        AND kickoff_timestamp <= DATE_ADD(NOW(), INTERVAL 2 HOUR)
                    )
                )`;

            const games = await database.execute(gamesQuery);

            // Use JavaScript time logic like dashboard countdown
            const now = new Date();
            let liveCount = 0;

            for (const game of games) {
                const gameTime = new Date(game.kickoff_timestamp);
                const timeUntilKickoff = gameTime.getTime() - now.getTime();
                const minutesUntil = Math.floor(timeUntilKickoff / (1000 * 60));

                // Game is live if: in_progress OR within 30 minutes of kickoff OR started up to 4 hours ago
                if (game.status === 'in_progress' ||
                    (minutesUntil <= 30 && minutesUntil >= -240)) {
                    liveCount++;
                }
            }
            
            console.log(`🎮 Live games check: ${liveCount} games found`, {
                currentTime: new Date().toISOString(),
                query: 'games with status=in_progress OR (kickoff <= NOW() AND kickoff >= NOW()-4h AND status IN scheduled,in_progress)'
            });
            
            if (liveCount > 0) {
                console.log(`🚀 Starting live updates for ${liveCount} active games`);
                await this.startLiveUpdates();
            } else {
                console.log(`😴 No live games found - scheduler staying inactive`);
            }

        } catch (error) {
            // Error checking for live games - continue
        }
    }

    /**
     * Start the live score updates (every 5 minutes during games)
     */
    async startLiveUpdates() {
        if (this.isRunning) {
            return;
        }

        this.isRunning = true;

        // 5-minute update cycle during live games
        this.currentTask = cron.schedule('*/5 * * * *', async () => {
            // Don't start a new update if one is already running
            if (this.isUpdating) {
                console.log('⏳ Skipping live update - previous update still in progress');
                return;
            }
            this.isUpdating = true;
            await this.performLiveUpdate();
            this.isUpdating = false;
        });

        // Also run one update immediately
        this.isUpdating = true;
        await this.performLiveUpdate();
        this.isUpdating = false;

        // Schedule a check to see when all games are finished
        this.scheduleGameEndCheck();
    }

    /**
     * Perform a live score update
     */
    async performLiveUpdate() {
        const startTime = new Date();
        try {
            console.log(`🔄 Starting live score update at ${startTime.toISOString()}`);
            
            // Get current week from database (use same logic as picks/results pages)
            const { getDefaultWeekForUI } = require('../utils/getCurrentWeek');
            let currentWeek = await getDefaultWeekForUI(database);
            const seasonYear = new Date().getFullYear();

            // Check if we have any live or recently started games for the calculated week using JavaScript time
            const currentWeekGames = await database.execute(`
                SELECT kickoff_timestamp, status
                FROM nfl_games
                WHERE week = ? AND season_year = ?
                AND (
                    status = 'in_progress'
                    OR (
                        kickoff_timestamp >= DATE_SUB(NOW(), INTERVAL 6 HOUR)
                        AND kickoff_timestamp <= DATE_ADD(NOW(), INTERVAL 2 HOUR)
                    )
                )
            `, [currentWeek, seasonYear]);

            // Use JavaScript time logic like dashboard
            const now = new Date();
            let currentWeekLiveCount = 0;

            for (const game of currentWeekGames) {
                const gameTime = new Date(game.kickoff_timestamp);
                const timeUntilKickoff = gameTime.getTime() - now.getTime();
                const minutesUntil = Math.floor(timeUntilKickoff / (1000 * 60));

                if (game.status === 'in_progress' ||
                    (minutesUntil <= 30 && minutesUntil >= -240)) {
                    currentWeekLiveCount++;
                }
            }

            // If no live games for current week, check previous week
            if (currentWeekLiveCount === 0 && currentWeek > 1) {
                const prevWeekGames = await database.execute(`
                    SELECT kickoff_timestamp, status
                    FROM nfl_games
                    WHERE week = ? AND season_year = ?
                    AND (
                        status = 'in_progress'
                        OR (
                            kickoff_timestamp >= DATE_SUB(NOW(), INTERVAL 6 HOUR)
                            AND kickoff_timestamp <= DATE_ADD(NOW(), INTERVAL 2 HOUR)
                        )
                    )
                `, [currentWeek - 1, seasonYear]);

                let prevWeekLiveCount = 0;
                for (const game of prevWeekGames) {
                    const gameTime = new Date(game.kickoff_timestamp);
                    const timeUntilKickoff = gameTime.getTime() - now.getTime();
                    const minutesUntil = Math.floor(timeUntilKickoff / (1000 * 60));

                    if (game.status === 'in_progress' ||
                        (minutesUntil <= 30 && minutesUntil >= -240)) {
                        prevWeekLiveCount++;
                    }
                }

                if (prevWeekLiveCount > 0) {
                    console.log(`📅 Week transition detected: Using week ${currentWeek - 1} instead of ${currentWeek} due to live games`);
                    currentWeek = currentWeek - 1;
                }
            }
            
            console.log(`🏈 ESPN API Update: currentWeek=${currentWeek}, seasonYear=${seasonYear}, currentDate=${new Date().toISOString()}`);

            // Add timeout wrapper to prevent hanging
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('ESPN API timeout after 4 minutes')), 240000)
            );
            
            const updatePromise = ESPNApiService.updateLiveScores(currentWeek, seasonYear);
            const result = await Promise.race([updatePromise, timeoutPromise]);
            
            const endTime = new Date();
            const duration = (endTime - startTime) / 1000;
            console.log(`✅ Live score update completed in ${duration}s at ${endTime.toISOString()}`);

            // Check if we should continue running
            await this.checkIfShouldContinue();

        } catch (error) {
            const endTime = new Date();
            const duration = (endTime - startTime) / 1000;
            console.log(`❌ Live score update failed after ${duration}s: ${error.message}`);
            
            // Continue running even if this update failed
        }
    }

    /**
     * Check if live updates should continue or stop
     */
    async checkIfShouldContinue() {
        try {
            // Check if there are any games still in progress using JavaScript time logic
            const activeGamesQuery = `
                SELECT kickoff_timestamp, status
                FROM nfl_games
                WHERE status = 'in_progress'
                OR (
                    status = 'scheduled'
                    AND kickoff_timestamp >= DATE_SUB(NOW(), INTERVAL 6 HOUR)
                    AND kickoff_timestamp <= DATE_ADD(NOW(), INTERVAL 2 HOUR)
                )`;

            const activeGames = await database.execute(activeGamesQuery);

            // Use JavaScript time logic like dashboard
            const now = new Date();
            let activeCount = 0;

            for (const game of activeGames) {
                const gameTime = new Date(game.kickoff_timestamp);
                const timeUntilKickoff = gameTime.getTime() - now.getTime();
                const minutesUntil = Math.floor(timeUntilKickoff / (1000 * 60));

                if (game.status === 'in_progress' ||
                    (minutesUntil <= 30 && minutesUntil >= -240)) {
                    activeCount++;
                }
            }

            // Remove the old database result line since we're calculating activeCount above
            // const [result] = await database.execute(activeGamesQuery);
            // const activeCount = result.active_count || 0;

            const [result] = await database.execute(activeGamesQuery);
            const activeCount = result.active_count || 0;

            if (activeCount === 0) {
                this.stopLiveUpdates();
                // Schedule check for next game
                setTimeout(() => {
                    this.scheduleNextGameCheck();
                }, 60000); // Wait 1 minute then check for next game
            }

        } catch (error) {
            // Error checking if should continue - continue
        }
    }

    /**
     * Schedule periodic checks to see when games end
     */
    scheduleGameEndCheck() {
        if (this.gameEndCheck) {
            clearInterval(this.gameEndCheck);
        }

        // Check every 30 minutes if games are finished
        this.gameEndCheck = setInterval(async () => {
            await this.checkIfShouldContinue();
        }, 30 * 60 * 1000); // 30 minutes
    }

    /**
     * Stop live score updates
     */
    stopLiveUpdates() {
        if (this.currentTask) {
            this.currentTask.stop();
            this.currentTask = null;
        }

        if (this.gameEndCheck) {
            clearInterval(this.gameEndCheck);
            this.gameEndCheck = null;
        }

        this.isRunning = false;
    }

    /**
     * Get status of the scheduler
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            hasActiveTask: !!this.currentTask,
            hasNextGameCheck: !!this.nextGameCheck,
            hasGameEndCheck: !!this.gameEndCheck
        };
    }


    /**
     * Stop all scheduled tasks (for shutdown)
     */
    shutdown() {
        this.stopLiveUpdates();
        
        if (this.nextGameCheck) {
            clearTimeout(this.nextGameCheck);
            this.nextGameCheck = null;
        }
    }
}

// Export singleton instance
module.exports = new LiveScoreScheduler();