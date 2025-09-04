/**
 * Security Configuration
 * Additional security hardening for production deployment
 */

const logger = require('./logger');

class SecurityConfig {
    
    /**
     * Enhanced error handling for production
     */
    static handleError(error, req, res, next) {
        // Log the full error for debugging
        logger.error('Application error:', {
            message: error.message,
            stack: error.stack,
            url: req.url,
            method: req.method,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            userId: req.user?.user_id
        });

        // In production, don't leak error details
        const isDevelopment = process.env.NODE_ENV !== 'production';
        
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            res.status(error.status || 500).json({
                error: isDevelopment ? error.message : 'Internal server error',
                ...(isDevelopment && { stack: error.stack })
            });
        } else {
            res.status(error.status || 500).render('errors/error', {
                title: 'Error',
                layout: 'layouts/error',
                error: {
                    message: isDevelopment ? error.message : 'Something went wrong',
                    status: error.status || 500
                }
            });
        }
    }

    /**
     * Security headers middleware
     */
    static securityHeaders(req, res, next) {
        // Remove server header
        res.removeHeader('X-Powered-By');
        
        // Add security headers
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
        
        next();
    }

    /**
     * Request logging for security monitoring
     */
    static securityLogger(req, res, next) {
        // Log sensitive operations
        const sensitiveEndpoints = [
            '/auth/login',
            '/auth/register', 
            '/auth/logout',
            '/api/picks',
            '/leagues/join',
            '/admin'
        ];

        const isSensitive = sensitiveEndpoints.some(endpoint => req.path.startsWith(endpoint));
        
        if (isSensitive) {
            logger.security('Sensitive endpoint access', {
                path: req.path,
                method: req.method,
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                userId: req.user?.user_id,
                timestamp: new Date().toISOString()
            });
        }

        next();
    }

    /**
     * Input sanitization middleware
     */
    static sanitizeInput(req, res, next) {
        // Basic XSS protection for string inputs
        const sanitizeObject = (obj) => {
            for (const key in obj) {
                if (typeof obj[key] === 'string') {
                    // Remove potentially dangerous characters
                    obj[key] = obj[key]
                        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                        .replace(/javascript:/gi, '')
                        .replace(/vbscript:/gi, '')
                        .replace(/on\w+\s*=/gi, '');
                } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                    sanitizeObject(obj[key]);
                }
            }
        };

        if (req.body && typeof req.body === 'object') {
            sanitizeObject(req.body);
        }

        if (req.query && typeof req.query === 'object') {
            sanitizeObject(req.query);
        }

        next();
    }

    /**
     * Request size validation
     */
    static validateRequestSize(req, res, next) {
        const contentLength = parseInt(req.get('Content-Length') || '0');
        const maxSize = 10 * 1024 * 1024; // 10MB
        
        if (contentLength > maxSize) {
            return res.status(413).json({ 
                error: 'Request too large',
                maxSize: '10MB'
            });
        }

        next();
    }

    /**
     * IP-based security checks
     */
    static ipSecurity(req, res, next) {
        const clientIP = req.ip || req.connection.remoteAddress;
        
        // Log unusual IP patterns (optional - implement as needed)
        if (req.user && req.user.lastIP && req.user.lastIP !== clientIP) {
            logger.security('IP change detected', {
                userId: req.user.user_id,
                oldIP: req.user.lastIP,
                newIP: clientIP,
                userAgent: req.get('User-Agent')
            });
        }

        next();
    }

    /**
     * Session security enhancement
     */
    static getSecureSessionConfig() {
        return {
            name: process.env.SESSION_NAME || 'pools.sid',
            secret: process.env.SESSION_SECRET || 'your-super-secret-key-change-in-production',
            resave: false,
            saveUninitialized: false,
            rolling: true, // Refresh session on activity
            cookie: {
                secure: process.env.NODE_ENV === 'production', // HTTPS only in production
                httpOnly: true, // Prevent XSS
                maxAge: 24 * 60 * 60 * 1000, // 24 hours
                sameSite: 'strict' // CSRF protection
            }
        };
    }
}

module.exports = SecurityConfig;