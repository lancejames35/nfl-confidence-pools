const Pick = require('../models/Pick');
const GameResultsProcessor = require('./GameResultsProcessor');
const WeeklyWinnersService = require('./WeeklyWinnersService');
const database = require('../config/database');
const getCurrentWeek = require('../utils/getCurrentWeek');

/**
 * Scheduled task runner for automated system processes
 */
class ScheduledTasks {
    constructor() {
        this.intervals = new Map();
        this.isRunning = false;
    }
    
    /**
     * Start all scheduled tasks
     */
    start() {
        if (this.isRunning) {
            // Scheduled tasks already running
            return;
        }
        
        // Starting scheduled tasks
        this.isRunning = true;
        
        // Pick locking service - runs every 5 minutes (reduced frequency)
        const pickLockingInterval = setInterval(async () => {
            try {
                await this.processPickLocking();
            } catch (error) {
                // Pick locking task error
            }
        }, 5 * 60 * 1000); // 5 minutes
        
        this.intervals.set('pickLocking', pickLockingInterval);
        // Pick locking task scheduled successfully
        
        // Run pick locking immediately on startup
        this.processPickLocking().catch(error => {
            // Initial pick locking error
        });
        
        // Note: Weekly winner calculation is now event-driven via getDefaultWeekForUIWithWinnerCalculation()
        // No longer using scheduled polling for week transitions
        
        // All scheduled tasks started successfully
    }
    
    /**
     * Stop all scheduled tasks
     */
    stop() {
        if (!this.isRunning) {
            // Scheduled tasks not currently running
            return;
        }
        
        // Stopping scheduled tasks
        
        // Clear all intervals
        for (const [name, interval] of this.intervals) {
            clearInterval(interval);
            // Task stopped successfully
        }
        
        this.intervals.clear();
        this.isRunning = false;
        
        // All scheduled tasks stopped
    }
    
    /**
     * Get status of all scheduled tasks
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            activeTasks: Array.from(this.intervals.keys()),
            taskCount: this.intervals.size
        };
    }
    
    /**
     * Process pick locking using PickLockingService (includes missing picks fallback)
     */
    async processPickLocking() {
        try {
            // Get current NFL week
            const currentWeek = this.getCurrentNFLWeek();
            const database = require('../config/database');

            // First check if there are any games starting soon or in progress
            const upcomingGames = await database.execute(`
                SELECT COUNT(*) as count
                FROM games
                WHERE week = ?
                AND season_year = YEAR(CURDATE())
                AND status IN ('scheduled', 'in_progress')
                AND kickoff_timestamp <= DATE_ADD(NOW(), INTERVAL 30 MINUTE)
            `, [currentWeek]);

            if (upcomingGames[0].count === 0) {
                // No games starting soon, skip processing
                return;
            }

            // Processing pick locking with new service that includes missing picks fallback
            const PickLockingService = require('./PickLockingService');
            await PickLockingService.processAllLeagues();

        } catch (error) {
            // Pick locking process error
        }
    }
    
    
    /**
     * Get current NFL week
     */
    getCurrentNFLWeek() {
        const seasonStart = new Date(new Date().getFullYear(), 8, 5); // Sept 5
        const now = new Date();
        const diffTime = Math.abs(now - seasonStart);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const week = Math.ceil(diffDays / 7);
        return Math.min(Math.max(1, week), 18);
    }

    /**
     * Manually trigger pick locking (for testing)
     */
    async triggerPickLocking() {
        // Manual trigger: Pick locking service
        try {
            await this.processPickLocking();
            // Manual pick locking completed
        } catch (error) {
            // Manual pick locking error
            throw error;
        }
    }
    
    /**
     * Manually trigger weekly winner calculation for a specific week and league (for testing)
     * Note: This is now the primary way to test weekly winner calculation since it's event-driven
     */
    async triggerWeeklyWinnerCalculation(leagueId, week, seasonYear = new Date().getFullYear()) {
        console.log(`Manual trigger: Weekly winner calculation for League ${leagueId}, Week ${week}, Season ${seasonYear}`);
        try {
            const result = await WeeklyWinnersService.calculateWeeklyWinners(leagueId, week, seasonYear);
            console.log('Manual weekly winner calculation result:', result);
            return result;
        } catch (error) {
            console.error('Manual weekly winner calculation error:', error);
            throw error;
        }
    }
}

// Export singleton instance
module.exports = new ScheduledTasks();