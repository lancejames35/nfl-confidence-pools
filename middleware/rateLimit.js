const rateLimit = require('express-rate-limit');

// Create different rate limiters for different endpoints

// General API rate limiter
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500, // Limit each IP to 500 requests per windowMs (increased for dashboard usage)
    message: {
        error: true,
        message: 'Too many API requests, please try again later',
        retryAfter: 15 * 60 // seconds
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    skip: (req) => {
        // Skip rate limiting for health checks and live scores monitoring
        return req.path === '/health' || 
               req.path.includes('/live-scores/scheduler/status') ||
               req.path.includes('/live-scores/rate-limit');
    }
});

// Stricter rate limiter for authentication endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 auth requests per windowMs
    message: {
        error: true,
        message: 'Too many authentication attempts, please try again later',
        retryAfter: 15 * 60
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true // Don't count successful requests
});

// Very strict rate limiter for password reset
const passwordResetLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // Limit each IP to 3 password reset requests per hour
    message: {
        error: true,
        message: 'Too many password reset attempts, please try again in an hour',
        retryAfter: 60 * 60
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Moderate rate limiter for league creation
const leagueCreationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // Limit each IP to 10 league creations per hour
    message: {
        error: true,
        message: 'Too many league creation attempts, please try again later',
        retryAfter: 60 * 60
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Lenient rate limiter for picks updates (auto-save functionality)
const picksUpdateLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60, // Allow frequent auto-save updates
    message: {
        error: true,
        message: 'Too many pick updates, please slow down',
        retryAfter: 60
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Chat message rate limiter
const chatLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 20, // 20 messages per minute
    message: {
        error: true,
        message: 'Too many chat messages, please slow down',
        retryAfter: 60
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Invitation sending rate limiter
const invitationLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 20, // 20 invitations per 10 minutes
    message: {
        error: true,
        message: 'Too many invitation attempts, please try again later',
        retryAfter: 10 * 60
    },
    standardHeaders: true,
    legacyHeaders: false
});

// File upload rate limiter
const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 file uploads per 15 minutes
    message: {
        error: true,
        message: 'Too many file upload attempts, please try again later',
        retryAfter: 15 * 60
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Administrative actions rate limiter
const adminLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 50, // 50 admin actions per 5 minutes
    message: {
        error: true,
        message: 'Too many administrative actions, please slow down',
        retryAfter: 5 * 60
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Dynamic rate limiter based on user status
function createUserBasedLimiter(options) {
    return rateLimit({
        ...options,
        keyGenerator: (req) => {
            // Use user ID if authenticated, otherwise IP
            return req.user?.user_id?.toString() || req.ip;
        },
        skip: (req) => {
            // Skip for verified users or premium users (if you have such a system)
            return req.user?.email_verified === true;
        }
    });
}

// WebSocket rate limiter (for Socket.io events)
class SocketRateLimiter {
    constructor() {
        this.userLimits = new Map(); // userId -> { count, resetTime }
        this.ipLimits = new Map(); // ip -> { count, resetTime }
    }

    checkLimit(userId, ip, maxRequests = 30, windowMs = 60000) {
        const now = Date.now();
        const key = userId || ip;
        const limitsMap = userId ? this.userLimits : this.ipLimits;

        if (!limitsMap.has(key)) {
            limitsMap.set(key, { count: 1, resetTime: now + windowMs });
            return true;
        }

        const limit = limitsMap.get(key);
        
        if (now > limit.resetTime) {
            // Reset window
            limit.count = 1;
            limit.resetTime = now + windowMs;
            return true;
        }

        if (limit.count >= maxRequests) {
            return false; // Rate limit exceeded
        }

        limit.count++;
        return true;
    }

    cleanup() {
        const now = Date.now();
        
        // Clean up expired entries
        for (const [key, limit] of this.userLimits.entries()) {
            if (now > limit.resetTime) {
                this.userLimits.delete(key);
            }
        }
        
        for (const [key, limit] of this.ipLimits.entries()) {
            if (now > limit.resetTime) {
                this.ipLimits.delete(key);
            }
        }
    }
}

const socketRateLimiter = new SocketRateLimiter();

// Clean up socket rate limiter every 5 minutes
setInterval(() => {
    socketRateLimiter.cleanup();
}, 5 * 60 * 1000);

module.exports = {
    apiLimiter,
    authLimiter,
    passwordResetLimiter,
    leagueCreationLimiter,
    picksUpdateLimiter,
    chatLimiter,
    invitationLimiter,
    uploadLimiter,
    adminLimiter,
    createUserBasedLimiter,
    socketRateLimiter
};