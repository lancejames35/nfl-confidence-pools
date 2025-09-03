const Pick = require('../models/Pick');
const GameResultsProcessor = require('./GameResultsProcessor');

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
            console.log('⚠️ Scheduled tasks already running');
            return;
        }
        
        console.log('🚀 Starting scheduled tasks...');
        this.isRunning = true;
        
        // Pick locking service - runs every minute
        const pickLockingInterval = setInterval(async () => {
            try {
                await this.processPickLocking();
            } catch (error) {
                console.error('❌ Pick locking task error:', error);
            }
        }, 60 * 1000); // 60 seconds
        
        this.intervals.set('pickLocking', pickLockingInterval);
        console.log('✅ Pick locking task scheduled (every 60 seconds)');
        
        // Run pick locking immediately on startup
        this.processPickLocking().catch(error => {
            console.error('❌ Initial pick locking error:', error);
        });
        
        console.log('✅ All scheduled tasks started');
    }
    
    /**
     * Stop all scheduled tasks
     */
    stop() {
        if (!this.isRunning) {
            console.log('⚠️ Scheduled tasks not running');
            return;
        }
        
        console.log('🛑 Stopping scheduled tasks...');
        
        // Clear all intervals
        for (const [name, interval] of this.intervals) {
            clearInterval(interval);
            console.log(`✅ Stopped ${name} task`);
        }
        
        this.intervals.clear();
        this.isRunning = false;
        
        console.log('✅ All scheduled tasks stopped');
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
     * Process pick locking using existing Pick model methods
     */
    async processPickLocking() {
        try {
            console.log('🔒 Processing pick locking...');
            
            // Get current NFL week
            const currentWeek = this.getCurrentNFLWeek();
            
            // Get all active league entries for current week
            const database = require('../config/database');
            const entries = await database.execute(`
                SELECT DISTINCT le.entry_id, lu.league_id
                FROM league_entries le
                JOIN league_users lu ON le.league_user_id = lu.league_user_id
                JOIN leagues l ON lu.league_id = l.league_id
                WHERE l.status = 'active' AND le.status = 'active'
            `);
            
            let totalLocked = 0;
            
            // Process each entry to lock started games
            for (const entry of entries) {
                try {
                    await Pick.lockStartedGames(entry.entry_id, currentWeek);
                    totalLocked++;
                } catch (error) {
                    console.error(`❌ Error locking picks for entry ${entry.entry_id}:`, error);
                }
            }
            
            if (totalLocked > 0) {
                console.log(`🔐 Processed ${totalLocked} entries for pick locking`);
            }
            
        } catch (error) {
            console.error('❌ Pick locking process error:', error);
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
        console.log('🔧 Manual trigger: Pick locking service');
        try {
            await this.processPickLocking();
            console.log('✅ Manual pick locking completed');
        } catch (error) {
            console.error('❌ Manual pick locking error:', error);
            throw error;
        }
    }
}

// Export singleton instance
module.exports = new ScheduledTasks();