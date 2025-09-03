const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'error',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'nfl-pools' },
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' })
    ]
});

// Add console logging in development
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
        )
    }));
}

class ErrorHandler {
    // Main error handling middleware
    handle(error, req, res, next) {
        // Log the error
        this.logError(error, req);

        // Don't send error details in production
        const isProduction = process.env.NODE_ENV === 'production';
        
        // Determine error status code
        const statusCode = this.getStatusCode(error);
        
        // Create error response
        const errorResponse = this.createErrorResponse(error, isProduction);
        
        // Set status code
        res.status(statusCode);

        // Send appropriate response based on request type
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.json(errorResponse);
        }

        // Render error page for web requests
        res.render('errors/error', {
            title: `Error ${statusCode}`,
            error: errorResponse,
            layout: 'layouts/error'
        });
    }

    // Log error with context
    logError(error, req) {
        const errorData = {
            message: error.message,
            stack: error.stack,
            url: req.originalUrl,
            method: req.method,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            userId: req.user?.user_id,
            timestamp: new Date().toISOString()
        };

        // Add request body for non-GET requests (but sanitize sensitive data)
        if (req.method !== 'GET') {
            errorData.body = this.sanitizeRequestBody(req.body);
        }

        logger.error('Application Error', errorData);
    }

    // Determine HTTP status code from error
    getStatusCode(error) {
        // Known error types
        if (error.statusCode) return error.statusCode;
        if (error.status) return error.status;
        
        // Database errors
        if (error.code === 'ER_DUP_ENTRY') return 409;
        if (error.code === 'ER_NO_SUCH_TABLE') return 500;
        if (error.code?.startsWith('ER_')) return 500;
        
        // JWT errors
        if (error.name === 'JsonWebTokenError') return 401;
        if (error.name === 'TokenExpiredError') return 401;
        
        // Validation errors
        if (error.name === 'ValidationError') return 400;
        if (error.name === 'CastError') return 400;
        
        // Default to 500 for unknown errors
        return 500;
    }

    // Create error response object
    createErrorResponse(error, isProduction) {
        const statusCode = this.getStatusCode(error);
        
        const response = {
            error: true,
            status: statusCode,
            timestamp: new Date().toISOString()
        };

        // Add error message
        if (error.message) {
            response.message = isProduction ? this.getProductionMessage(statusCode, error) : error.message;
        } else {
            response.message = this.getDefaultMessage(statusCode);
        }

        // Add stack trace in development
        if (!isProduction && error.stack) {
            response.stack = error.stack;
        }

        // Add validation details for 400 errors
        if (statusCode === 400 && error.details) {
            response.details = error.details;
        }

        return response;
    }

    // Get production-safe error messages
    getProductionMessage(statusCode, error) {
        // Don't expose internal details in production
        switch (statusCode) {
            case 400:
                return 'Invalid request data';
            case 401:
                return 'Authentication required';
            case 403:
                return 'Access denied';
            case 404:
                return 'Resource not found';
            case 409:
                return 'Resource already exists';
            case 429:
                return 'Too many requests';
            case 500:
                return 'Internal server error';
            default:
                return 'An error occurred';
        }
    }

    // Get default messages for status codes
    getDefaultMessage(statusCode) {
        const messages = {
            400: 'Bad Request',
            401: 'Unauthorized',
            403: 'Forbidden',
            404: 'Not Found',
            409: 'Conflict',
            429: 'Too Many Requests',
            500: 'Internal Server Error',
            502: 'Bad Gateway',
            503: 'Service Unavailable'
        };

        return messages[statusCode] || 'An error occurred';
    }

    // Sanitize request body to remove sensitive data
    sanitizeRequestBody(body) {
        if (!body || typeof body !== 'object') return body;

        const sensitiveFields = ['password', 'token', 'secret', 'key', 'auth'];
        const sanitized = { ...body };

        for (const field of sensitiveFields) {
            if (sanitized[field]) {
                sanitized[field] = '[REDACTED]';
            }
        }

        return sanitized;
    }

    // Handle async errors
    asyncHandler(fn) {
        return (req, res, next) => {
            Promise.resolve(fn(req, res, next)).catch(next);
        };
    }

    // Create custom error
    createError(message, statusCode = 500, details = null) {
        const error = new Error(message);
        error.statusCode = statusCode;
        if (details) error.details = details;
        return error;
    }

    // Handle 404 errors
    notFoundHandler(req, res, next) {
        const error = this.createError(`Route not found: ${req.originalUrl}`, 404);
        next(error);
    }

    // Handle database connection errors
    databaseErrorHandler(error, req, res, next) {
        logger.error('Database Error', {
            error: error.message,
            stack: error.stack,
            code: error.code,
            url: req.originalUrl,
            timestamp: new Date().toISOString()
        });

        // Check if it's a connection error
        if (error.code === 'PROTOCOL_CONNECTION_LOST' || 
            error.code === 'ECONNREFUSED' || 
            error.code === 'ENOTFOUND') {
            
            res.status(503).json({
                error: true,
                status: 503,
                message: 'Database temporarily unavailable'
            });
        } else {
            next(error);
        }
    }

    // Handle validation errors
    validationErrorHandler(error, req, res, next) {
        if (error.name === 'ValidationError' || (error.errors && Array.isArray(error.errors))) {
            const validationErrors = error.errors || [error.message];
            
            return res.status(400).json({
                error: true,
                status: 400,
                message: 'Validation failed',
                details: validationErrors
            });
        }
        
        next(error);
    }

    // Handle JWT errors
    jwtErrorHandler(error, req, res, next) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                error: true,
                status: 401,
                message: 'Invalid authentication token'
            });
        }

        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                error: true,
                status: 401,
                message: 'Authentication token expired'
            });
        }

        next(error);
    }
}

const errorHandler = new ErrorHandler();

// Export middleware function
module.exports = (error, req, res, next) => {
    // Skip if response already sent
    if (res.headersSent) {
        return next(error);
    }

    // Handle specific error types
    errorHandler.databaseErrorHandler(error, req, res, (err) => {
        if (err) {
            errorHandler.validationErrorHandler(err, req, res, (err2) => {
                if (err2) {
                    errorHandler.jwtErrorHandler(err2, req, res, (err3) => {
                        if (err3) {
                            errorHandler.handle(err3, req, res, next);
                        }
                    });
                }
            });
        }
    });
};

// Export error handler class for creating custom errors
module.exports.ErrorHandler = errorHandler;