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
            WHERE g.kickoff_timestamp > CONVERT_TZ(NOW(), @@session.time_zone, 'America/New_York')
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
            // Use Eastern Time like the rest of the application
            const liveGamesQuery = `
                SELECT COUNT(*) as live_count
                FROM games 
                WHERE (
                    status = 'in_progress' 
                    OR (
                        kickoff_timestamp <= CONVERT_TZ(NOW(), @@session.time_zone, 'America/New_York') 
                        AND kickoff_timestamp >= DATE_SUB(CONVERT_TZ(NOW(), @@session.time_zone, 'America/New_York'), INTERVAL 4 HOUR)
                        AND status IN ('scheduled', 'in_progress')
                    )
                )`;

            const [result] = await database.execute(liveGamesQuery);
            const liveCount = result.live_count || 0;
            
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

        // 10-minute update cycle during debugging to prevent excessive API calls
        this.currentTask = cron.schedule('*/10 * * * *', async () => {
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
            
            // Get current week from database (reuse existing logic)
            const { getCurrentNFLWeek } = require('../utils/getCurrentWeek');
            const currentWeek = await getCurrentNFLWeek(database);
            const seasonYear = new Date().getFullYear();

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
            // Check if there are any games still in progress
            const activeGamesQuery = `
                SELECT COUNT(*) as active_count
                FROM games 
                WHERE status = 'in_progress'
                OR (
                    kickoff_timestamp <= CONVERT_TZ(NOW(), @@session.time_zone, 'America/New_York') 
                    AND kickoff_timestamp >= DATE_SUB(CONVERT_TZ(NOW(), @@session.time_zone, 'America/New_York'), INTERVAL 4 HOUR)
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