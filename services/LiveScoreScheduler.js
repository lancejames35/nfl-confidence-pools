const cron = require('node-cron');
const database = require('../config/database');
const ESPNApiService = require('./ESPNApiService');

class LiveScoreScheduler {
    constructor() {
        this.currentTask = null;
        this.isRunning = false;
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
            // If initialization fails, try again in 5 minutes
            setTimeout(() => {
                this.initialize();
            }, 5 * 60 * 1000);
            throw error;
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
                const timeUntilGame = gameTime - now;

                if (timeUntilGame <= 30 * 60 * 1000) {
                    // Game starts within 30 minutes - start live updates soon
                    await this.startLiveUpdates();
                } else {
                    // Game is more than 30 minutes away - schedule a check closer to game time
                    const checkTime = gameTime.getTime() - (30 * 60 * 1000); // 30 minutes before
                    const delay = checkTime - now.getTime();
                    
                    if (this.nextGameCheck) {
                        clearTimeout(this.nextGameCheck);
                    }
                    
                    this.nextGameCheck = setTimeout(() => {
                        this.scheduleNextGameCheck();
                    }, delay);
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
                g.game_id,
                g.kickoff_timestamp,
                g.status,
                ht.abbreviation as home_team,
                at.abbreviation as away_team,
                g.week,
                g.season_year
            FROM games g
            JOIN teams ht ON g.home_team_id = ht.team_id
            JOIN teams at ON g.away_team_id = at.team_id
            WHERE g.kickoff_timestamp > NOW()
            AND g.status IN ('scheduled', 'in_progress')
            ORDER BY g.kickoff_timestamp ASC
            LIMIT 1`;

        const results = await database.execute(query);
        return results.length > 0 ? results[0] : null;
    }

    /**
     * Check if there are currently live games and start updates if needed
     */
    async checkAndStartLiveUpdates() {
        try {
            // Check for games that are currently live or recently started
            const liveGamesQuery = `
                SELECT COUNT(*) as live_count
                FROM games 
                WHERE (
                    status = 'in_progress' 
                    OR (
                        kickoff_timestamp <= NOW() 
                        AND kickoff_timestamp >= DATE_SUB(NOW(), INTERVAL 4 HOUR)
                        AND status IN ('scheduled', 'in_progress')
                    )
                )`;

            const [result] = await database.execute(liveGamesQuery);
            const liveCount = result.live_count || 0;
            
            if (liveCount > 0) {
                await this.startLiveUpdates();
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

        // 5-minute update cycle during games
        this.currentTask = cron.schedule('*/5 * * * *', async () => {
            await this.performLiveUpdate();
        });

        // Also run one update immediately
        await this.performLiveUpdate();

        // Schedule a check to see when all games are finished
        this.scheduleGameEndCheck();
    }

    /**
     * Perform a live score update
     */
    async performLiveUpdate() {
        try {
            // Get current week from database (reuse existing logic)
            const { getCurrentNFLWeek } = require('../utils/getCurrentWeek');
            const currentWeek = await getCurrentNFLWeek(database);
            const seasonYear = new Date().getFullYear();

            const result = await ESPNApiService.updateLiveScores(currentWeek, seasonYear);

            // Check if we should continue running
            await this.checkIfShouldContinue();

        } catch (error) {
            // Live update failed - continue
        }
    }

    /**
     * Check if live updates should continue or stop
     */
    async checkIfShouldContinue() {
        try {
            // Check if there are any games still in progress
            const activeGamesQuery = `
                SELECT COUNT(*) as active_count
                FROM games 
                WHERE status = 'in_progress'
                OR (
                    kickoff_timestamp <= NOW() 
                    AND kickoff_timestamp >= DATE_SUB(NOW(), INTERVAL 4 HOUR)
                    AND status = 'scheduled'
                )`;

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