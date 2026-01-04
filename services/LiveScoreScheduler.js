const cron = require('node-cron');
const database = require('../config/database');
const ESPNApiService = require('./ESPNApiService');
const { getNFLSeasonYear } = require('../utils/getCurrentWeek');

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
            await this.scheduleNextGameCheck();

            // Set up a backup check every hour to catch any missed games
            cron.schedule('0 * * * *', () => {
                this.scheduleNextGameCheck();
            });
        } catch (error) {
            console.error('❌ LiveScoreScheduler initialization failed:', error.message);
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

                const storedEasternTime = new Date(nextGame.kickoff_timestamp);
                const currentEasternTime = this.getCurrentEasternTime();
                const timeUntilMonitoring = storedEasternTime - currentEasternTime;

                console.log(`📅 Next game: ${nextGame.home_team} vs ${nextGame.away_team} at ${storedEasternTime.toISOString()} Eastern`);

                if (timeUntilMonitoring <= 0) {
                    console.log(`🚀 Starting monitoring immediately (game starts soon or already started)`);
                    await this.startLiveUpdates();
                } else {
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
                g.game_id,
                g.kickoff_timestamp,
                g.status,
                g.nfl_game_id,
                g.week,
                g.season_year,
                ht.name as home_team,
                at.name as away_team
            FROM games g
            JOIN teams ht ON g.home_team_id = ht.team_id
            JOIN teams at ON g.away_team_id = at.team_id
            WHERE g.kickoff_timestamp > DATE_SUB(CONVERT_TZ(NOW(), "UTC", "America/New_York"), INTERVAL 2 HOUR)
            AND g.status IN ('scheduled', 'in_progress')
            ORDER BY g.kickoff_timestamp ASC
            LIMIT 1`;

        const results = await database.execute(query);
        if (results.length > 0) {
            return results[0];
        }
        return null;
    }

    /**
     * Check if there are currently live games and start updates if needed
     */
    async checkAndStartLiveUpdates() {
        try {
            // Get games that should trigger ESPN API activation
            const gamesQuery = `
                SELECT kickoff_timestamp, status
                FROM games
                WHERE (
                    status = 'in_progress'
                    OR (
                        status IN ('scheduled', 'in_progress')
                        AND kickoff_timestamp >= DATE_SUB(CONVERT_TZ(NOW(), "UTC", "America/New_York"), INTERVAL 2 HOUR)
                        AND kickoff_timestamp <= DATE_ADD(CONVERT_TZ(NOW(), "UTC", "America/New_York"), INTERVAL 30 MINUTE)
                    )
                )`;

            const games = await database.execute(gamesQuery);
            let liveCount = 0;

            for (const game of games) {
                // Use same timing logic as PickLockingService: compare database Eastern time directly
                // Database query already converts NOW() to Eastern time for comparison
                const hasGameStarted = await this.hasGameStartedLikePickLocking(game.kickoff_timestamp);

                // ESPN API should be active if: in_progress OR game has started (same as pick locking)
                if (game.status === 'in_progress' || hasGameStarted) {
                    liveCount++;
                }
            }

            console.log(`🎮 Live games check: ${liveCount} games found`);

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
            const seasonYear = getNFLSeasonYear();

            // Check if we have any active games for the calculated week
            const currentWeekGames = await database.execute(`
                SELECT kickoff_timestamp, status
                FROM games
                WHERE week = ? AND season_year = ?
                AND (
                    status = 'in_progress'
                    OR (
                        kickoff_timestamp >= DATE_SUB(CONVERT_TZ(NOW(), "UTC", "America/New_York"), INTERVAL 2 HOUR)
                        AND kickoff_timestamp <= DATE_ADD(CONVERT_TZ(NOW(), "UTC", "America/New_York"), INTERVAL 30 MINUTE)
                    )
                )
            `, [currentWeek, seasonYear]);

            let currentWeekLiveCount = 0;

            for (const game of currentWeekGames) {
                const hasGameStarted = await this.hasGameStartedLikePickLocking(game.kickoff_timestamp);

                if (game.status === 'in_progress' || hasGameStarted) {
                    currentWeekLiveCount++;
                }
            }

            // If no live games for current week, check previous week
            if (currentWeekLiveCount === 0 && currentWeek > 1) {
                const prevWeekGames = await database.execute(`
                    SELECT kickoff_timestamp, status
                    FROM games
                    WHERE week = ? AND season_year = ?
                    AND (
                        status = 'in_progress'
                        OR (
                            kickoff_timestamp >= DATE_SUB(CONVERT_TZ(NOW(), "UTC", "America/New_York"), INTERVAL 2 HOUR)
                            AND kickoff_timestamp <= DATE_ADD(CONVERT_TZ(NOW(), "UTC", "America/New_York"), INTERVAL 30 MINUTE)
                        )
                    )
                `, [currentWeek - 1, seasonYear]);

                let prevWeekLiveCount = 0;
                for (const game of prevWeekGames) {
                    const hasGameStarted = await this.hasGameStartedLikePickLocking(game.kickoff_timestamp);

                    if (game.status === 'in_progress' || hasGameStarted) {
                        prevWeekLiveCount++;
                    }
                }

                if (prevWeekLiveCount > 0) {
                    console.log(`📅 Week transition detected: Using week ${currentWeek - 1} instead of ${currentWeek} due to live games`);
                    currentWeek = currentWeek - 1;
                }
            }

            console.log(`🏈 ESPN API Update: currentWeek=${currentWeek}, seasonYear=${seasonYear}`);

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
            // Check if ESPN API should still be active
            const activeGamesQuery = `
                SELECT kickoff_timestamp, status
                FROM games
                WHERE status = 'in_progress'
                OR (
                    status = 'scheduled'
                    AND kickoff_timestamp >= DATE_SUB(CONVERT_TZ(NOW(), "UTC", "America/New_York"), INTERVAL 2 HOUR)
                    AND kickoff_timestamp <= DATE_ADD(CONVERT_TZ(NOW(), "UTC", "America/New_York"), INTERVAL 30 MINUTE)
                )`;

            const activeGames = await database.execute(activeGamesQuery);
            let activeCount = 0;

            for (const game of activeGames) {
                const hasGameStarted = await this.hasGameStartedLikePickLocking(game.kickoff_timestamp);

                if (game.status === 'in_progress' || hasGameStarted) {
                    activeCount++;
                }
            }

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
     * Check if a game should trigger live scoring using the same logic as PickLockingService
     * @param {Date} kickoffTimestamp - Game kickoff time from database
     * @returns {Promise<boolean>} - True if live scoring should start
     */
    async hasGameStartedLikePickLocking(kickoffTimestamp) {
        try {
            const seasonYear = getNFLSeasonYear();
            // Use exact same logic as PickLockingService with league deadline consideration
            const result = await database.execute(`
                SELECT
                    -- Check if this specific game has started (for per_game leagues)
                    CASE WHEN CONVERT_TZ(NOW(), "UTC", "America/New_York") >= ? THEN 1 ELSE 0 END as game_started,

                    -- Check if any first_game league has been triggered (first game started)
                    CASE WHEN EXISTS (
                        SELECT 1 FROM games g2
                        WHERE g2.week = (SELECT week FROM games WHERE kickoff_timestamp = ? LIMIT 1)
                        AND g2.season_year = ?
                        AND CONVERT_TZ(NOW(), "UTC", "America/New_York") >= g2.kickoff_timestamp
                        ORDER BY g2.kickoff_timestamp ASC
                        LIMIT 1
                    ) THEN 1 ELSE 0 END as first_game_started
            `, [kickoffTimestamp, kickoffTimestamp, seasonYear]);

            // Live scoring should start if:
            // 1. This specific game has started (per_game logic), OR
            // 2. The first game of the week has started (first_game logic)
            return result[0].game_started === 1 || result[0].first_game_started === 1;

        } catch (error) {
            console.error('Error checking game start time:', error);
            // Fallback to current method if database query fails
            return this.getCurrentEasternTime() >= new Date(kickoffTimestamp);
        }
    }

    /**
     * Get current time in Eastern timezone (fallback method)
     * @returns {Date} - Current time in Eastern timezone
     */
    getCurrentEasternTime() {
        // Simple fallback - use database conversion method
        const now = new Date();
        // Approximate Eastern time (this is only used for scheduling, not game start comparison)
        const isDST = now.getMonth() >= 2 && now.getMonth() <= 10; // March-November roughly
        const offset = isDST ? -4 : -5; // EDT or EST
        return new Date(now.getTime() + (offset * 60 * 60 * 1000));
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