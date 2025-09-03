const mysql = require('mysql2/promise');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);

class Database {
    constructor() {
        this.pool = null;
        this.sessionStore = null;
        this.isConnected = false;
    }

    async initialize() {
        try {
            // Create connection pool
            this.pool = mysql.createPool({
                host: process.env.DATABASE_HOST || 'localhost',
                port: process.env.DATABASE_PORT || 3306,
                user: process.env.DATABASE_USER,
                password: process.env.DATABASE_PASSWORD,
                database: process.env.DATABASE_NAME || 'pools',
                waitForConnections: true,
                connectionLimit: parseInt(process.env.DATABASE_CONNECTION_LIMIT) || 10,
                queueLimit: 0,
                charset: 'utf8mb4',
                timezone: '+00:00'
            });

            // Test connection
            const connection = await this.pool.getConnection();
            console.log('✅ Database connected successfully');
            connection.release();

            // Initialize session store
            this.initializeSessionStore();
            
            this.isConnected = true;
            return true;
        } catch (error) {
            console.error('❌ Database connection failed:', error.message);
            process.exit(1);
        }
    }

    initializeSessionStore() {
        const sessionStoreOptions = {
            host: process.env.DATABASE_HOST || 'localhost',
            port: process.env.DATABASE_PORT || 3306,
            user: process.env.DATABASE_USER,
            password: process.env.DATABASE_PASSWORD,
            database: process.env.DATABASE_NAME || 'pools',
            createDatabaseTable: true,
            schema: {
                tableName: 'user_sessions',
                columnNames: {
                    session_id: 'session_id',
                    expires: 'expires',
                    data: 'data'
                }
            }
        };

        this.sessionStore = new MySQLStore(sessionStoreOptions);
    }

    getPool() {
        if (!this.isConnected || !this.pool) {
            throw new Error('Database not initialized. Call initialize() first.');
        }
        return this.pool;
    }

    getSessionStore() {
        if (!this.sessionStore) {
            throw new Error('Session store not initialized.');
        }
        return this.sessionStore;
    }

    async execute(query, params = []) {
        try {
            const [results] = await this.pool.execute(query, params);
            return results;
        } catch (error) {
            console.error('Database query error:', {
                query: query.substring(0, 100) + '...',
                error: error.message
            });
            throw error;
        }
    }

    async executeMany(query, params = []) {
        try {
            const [results] = await this.pool.query(query, params);
            return results;
        } catch (error) {
            console.error('Database query error:', {
                query: query.substring(0, 100) + '...',
                error: error.message
            });
            throw error;
        }
    }

    async transaction(callback) {
        const connection = await this.pool.getConnection();
        
        try {
            await connection.beginTransaction();
            const result = await callback(connection);
            await connection.commit();
            return result;
        } catch (error) {
            await connection.rollback();
            console.error('Transaction error:', error.message);
            throw error;
        } finally {
            connection.release();
        }
    }

    async close() {
        if (this.pool) {
            await this.pool.end();
            console.log('📝 Database connections closed');
        }
    }

    // Utility methods for common operations
    async findById(table, id, idColumn = 'id') {
        const query = `SELECT * FROM \`${table}\` WHERE \`${idColumn}\` = ? LIMIT 1`;
        const results = await this.execute(query, [id]);
        return results[0] || null;
    }

    async findOne(table, conditions = {}) {
        const whereClause = Object.keys(conditions).map(key => `\`${key}\` = ?`).join(' AND ');
        const values = Object.values(conditions);
        
        const query = `SELECT * FROM \`${table}\` ${whereClause ? 'WHERE ' + whereClause : ''} LIMIT 1`;
        const results = await this.execute(query, values);
        return results[0] || null;
    }

    async findMany(table, conditions = {}, options = {}) {
        const whereClause = Object.keys(conditions).map(key => `\`${key}\` = ?`).join(' AND ');
        const values = Object.values(conditions);
        
        let query = `SELECT * FROM \`${table}\` ${whereClause ? 'WHERE ' + whereClause : ''}`;
        
        if (options.orderBy) {
            query += ` ORDER BY ${options.orderBy}`;
        }
        
        if (options.limit) {
            query += ` LIMIT ${parseInt(options.limit)}`;
        }
        
        if (options.offset) {
            query += ` OFFSET ${parseInt(options.offset)}`;
        }
        
        return await this.execute(query, values);
    }

    async insert(table, data) {
        const columns = Object.keys(data);
        const values = Object.values(data);
        const placeholders = columns.map(() => '?').join(', ');
        const columnNames = columns.map(col => `\`${col}\``).join(', ');
        
        const query = `INSERT INTO \`${table}\` (${columnNames}) VALUES (${placeholders})`;
        const result = await this.execute(query, values);
        
        return {
            insertId: result.insertId,
            affectedRows: result.affectedRows
        };
    }

    async update(table, data, conditions) {
        const setClause = Object.keys(data).map(key => `\`${key}\` = ?`).join(', ');
        const whereClause = Object.keys(conditions).map(key => `\`${key}\` = ?`).join(' AND ');
        
        const query = `UPDATE \`${table}\` SET ${setClause} WHERE ${whereClause}`;
        const result = await this.execute(query, [...Object.values(data), ...Object.values(conditions)]);
        
        return result.affectedRows;
    }

    async delete(table, conditions) {
        const whereClause = Object.keys(conditions).map(key => `\`${key}\` = ?`).join(' AND ');
        
        const query = `DELETE FROM \`${table}\` WHERE ${whereClause}`;
        const result = await this.execute(query, Object.values(conditions));
        
        return result.affectedRows;
    }

    // Health check method
    async healthCheck() {
        try {
            await this.execute('SELECT 1');
            return { status: 'healthy', timestamp: new Date().toISOString() };
        } catch (error) {
            return { 
                status: 'unhealthy', 
                error: error.message, 
                timestamp: new Date().toISOString() 
            };
        }
    }
}

// Create and export singleton instance
const database = new Database();

module.exports = database;