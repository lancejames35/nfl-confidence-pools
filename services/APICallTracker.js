const database = require('../config/database');

/**
 * Database-backed API call tracker for persistent rate limiting
 */
class APICallTracker {
    constructor() {
        this.service = 'espn_api';
        this.maxCallsPerHour = 50; // Very conservative limit
        this.tableReady = false;
        this.initPromise = null;
    }

    /**
     * Create API call tracking table if it doesn't exist
     */
    async ensureTableExists() {
        if (this.tableReady) return true;
        
        if (this.initPromise) {
            return await this.initPromise;
        }
        
        this.initPromise = this.createTable();
        return await this.initPromise;
    }
    
    async createTable() {
        try {
            await database.execute(`
                CREATE TABLE IF NOT EXISTS api_call_log (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    service VARCHAR(50) NOT NULL,
                    endpoint VARCHAR(255),
                    called_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    success BOOLEAN DEFAULT TRUE,
                    response_cached BOOLEAN DEFAULT FALSE,
                    INDEX idx_service_time (service, called_at),
                    INDEX idx_called_at (called_at)
                )
            `);
            this.tableReady = true;
            return true;
        } catch (error) {
            console.error('Failed to create API call tracking table:', error);
            return false;
        }
    }

    /**
     * Check if we can make an API call within rate limits
     */
    async canMakeAPICall() {
        try {
            const tableExists = await this.ensureTableExists();
            if (!tableExists) {
                console.warn('API call tracking table not available, allowing limited calls');
                return true; // Allow calls but without tracking
            }
            
            const oneHourAgo = new Date(Date.now() - 3600000);
            
            const [result] = await database.execute(`
                SELECT COUNT(*) as call_count 
                FROM api_call_log 
                WHERE service = ? 
                AND called_at > ? 
                AND success = TRUE 
                AND response_cached = FALSE
            `, [this.service, oneHourAgo]);

            const recentCalls = result.call_count || 0;
            return recentCalls < this.maxCallsPerHour;
            
        } catch (error) {
            console.error('Error checking API rate limit:', error);
            return false; // Fail safe - don't make calls if we can't track them
        }
    }

    /**
     * Log an API call attempt
     */
    async logAPICall(endpoint, success = true, cached = false) {
        try {
            const tableExists = await this.ensureTableExists();
            if (!tableExists) {
                return; // Skip logging if table not available
            }
            
            await database.execute(`
                INSERT INTO api_call_log (service, endpoint, success, response_cached)
                VALUES (?, ?, ?, ?)
            `, [this.service, endpoint, success, cached]);

            // Clean up old entries (older than 25 hours) 
            await database.execute(`
                DELETE FROM api_call_log 
                WHERE called_at < DATE_SUB(NOW(), INTERVAL 25 HOUR)
            `);

        } catch (error) {
            console.error('Error logging API call:', error);
        }
    }

    /**
     * Get rate limiting status
     */
    async getRateLimitStatus() {
        try {
            const tableExists = await this.ensureTableExists();
            if (!tableExists) {
                return {
                    actualAPICallsInLastHour: 0,
                    totalRequestsInLastHour: 0,
                    cachedResponsesInLastHour: 0,
                    maxCallsPerHour: this.maxCallsPerHour,
                    remainingCalls: this.maxCallsPerHour,
                    resetTime: null,
                    canMakeCall: true,
                    error: 'Tracking table not available'
                };
            }
            
            const oneHourAgo = new Date(Date.now() - 3600000);
            
            // Get actual API calls (not cached responses)
            const [callResult] = await database.execute(`
                SELECT COUNT(*) as call_count 
                FROM api_call_log 
                WHERE service = ? 
                AND called_at > ? 
                AND response_cached = FALSE
            `, [this.service, oneHourAgo]);

            // Get total requests (including cached)
            const [totalResult] = await database.execute(`
                SELECT COUNT(*) as total_requests 
                FROM api_call_log 
                WHERE service = ? 
                AND called_at > ?
            `, [this.service, oneHourAgo]);

            // Get oldest call time for reset calculation
            const [oldestResult] = await database.execute(`
                SELECT MIN(called_at) as oldest_call 
                FROM api_call_log 
                WHERE service = ? 
                AND called_at > ?
                AND response_cached = FALSE
            `, [this.service, oneHourAgo]);

            const actualCalls = callResult.call_count || 0;
            const totalRequests = totalResult.total_requests || 0;
            const cachedResponses = totalRequests - actualCalls;
            const remainingCalls = Math.max(0, this.maxCallsPerHour - actualCalls);
            
            const oldestCall = oldestResult.oldest_call;
            const resetTime = oldestCall ? new Date(oldestCall.getTime() + 3600000) : null;

            return {
                actualAPICallsInLastHour: actualCalls,
                totalRequestsInLastHour: totalRequests,
                cachedResponsesInLastHour: cachedResponses,
                maxCallsPerHour: this.maxCallsPerHour,
                remainingCalls,
                resetTime: resetTime ? resetTime.toISOString() : null,
                canMakeCall: actualCalls < this.maxCallsPerHour
            };

        } catch (error) {
            console.error('Error getting rate limit status:', error);
            return {
                actualAPICallsInLastHour: 999,
                totalRequestsInLastHour: 999,
                cachedResponsesInLastHour: 0,
                maxCallsPerHour: this.maxCallsPerHour,
                remainingCalls: 0,
                resetTime: null,
                canMakeCall: false,
                error: error.message
            };
        }
    }

    /**
     * Get recent API call history for debugging (last 20 calls)
     */
    async getRecentCalls() {
        try {
            const tableExists = await this.ensureTableExists();
            if (!tableExists) {
                return [];
            }
            
            // MySQL doesn't allow LIMIT with parameter placeholders in some versions
            const calls = await database.execute(`
                SELECT endpoint, called_at, success, response_cached
                FROM api_call_log 
                WHERE service = ?
                ORDER BY called_at DESC 
                LIMIT 20
            `, [this.service]);

            return calls;
        } catch (error) {
            console.error('Error getting recent calls:', error);
            return [];
        }
    }
}

module.exports = new APICallTracker();