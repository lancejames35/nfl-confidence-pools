const winston = require('winston');
const path = require('path');

class Logger {
    constructor() {
        this.logger = null;
        this.initialize();
    }

    initialize() {
        const logFormat = winston.format.combine(
            winston.format.timestamp({
                format: 'YYYY-MM-DD HH:mm:ss'
            }),
            winston.format.errors({ stack: true }),
            winston.format.json()
        );

        const consoleFormat = winston.format.combine(
            winston.format.timestamp({
                format: 'HH:mm:ss'
            }),
            winston.format.colorize(),
            winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
                const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
                return `${timestamp} [${service || 'APP'}] ${level}: ${message} ${metaStr}`;
            })
        );

        const transports = [];

        // Console transport (for development)
        if (process.env.NODE_ENV !== 'production') {
            transports.push(
                new winston.transports.Console({
                    format: consoleFormat,
                    level: 'debug'
                })
            );
        }

        // File transports (for production)
        if (process.env.NODE_ENV === 'production') {
            transports.push(
                new winston.transports.File({
                    filename: path.join(__dirname, '../logs/error.log'),
                    level: 'error',
                    format: logFormat,
                    maxsize: 5242880, // 5MB
                    maxFiles: 5
                }),
                new winston.transports.File({
                    filename: path.join(__dirname, '../logs/combined.log'),
                    format: logFormat,
                    maxsize: 5242880, // 5MB
                    maxFiles: 5
                })
            );
        }

        this.logger = winston.createLogger({
            level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
            format: logFormat,
            defaultMeta: { service: 'pools-app' },
            transports,
            exceptionHandlers: [
                new winston.transports.File({ 
                    filename: path.join(__dirname, '../logs/exceptions.log'),
                    format: logFormat
                })
            ],
            rejectionHandlers: [
                new winston.transports.File({ 
                    filename: path.join(__dirname, '../logs/rejections.log'),
                    format: logFormat
                })
            ]
        });

        // Create logs directory if it doesn't exist
        const fs = require('fs');
        const logsDir = path.join(__dirname, '../logs');
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }
    }

    info(message, meta = {}) {
        this.logger.info(message, meta);
    }

    error(message, meta = {}) {
        this.logger.error(message, meta);
    }

    warn(message, meta = {}) {
        this.logger.warn(message, meta);
    }

    debug(message, meta = {}) {
        this.logger.debug(message, meta);
    }

    // Security-specific logging
    security(message, meta = {}) {
        this.logger.warn(`[SECURITY] ${message}`, { ...meta, category: 'security' });
    }

    // Database-specific logging
    database(message, meta = {}) {
        this.logger.info(`[DATABASE] ${message}`, { ...meta, category: 'database' });
    }

    // Authentication-specific logging
    auth(message, meta = {}) {
        this.logger.info(`[AUTH] ${message}`, { ...meta, category: 'auth' });
    }

    // Performance logging
    performance(message, meta = {}) {
        this.logger.info(`[PERF] ${message}`, { ...meta, category: 'performance' });
    }
}

// Create singleton instance
const logger = new Logger();

module.exports = logger;