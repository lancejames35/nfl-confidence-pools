const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const database = require('../config/database');

class User {
    constructor(data) {
        this.user_id = data.user_id || data.id;
        this.id = data.user_id || data.id; // alias for compatibility
        this.username = data.username;
        this.email = data.email;
        this.first_name = data.first_name;
        this.last_name = data.last_name;
        this.password = data.password || data.password_hash;
        this.account_status = data.account_status || 'active';
        this.created_at = data.created_at;
        this.updated_at = data.updated_at;
    }

    static async create(userData) {
        try {
            const hashedPassword = await bcrypt.hash(userData.password, 12);
            
            const query = `
                INSERT INTO users (username, email, password_hash, account_status, created_at, updated_at)
                VALUES (?, ?, ?, ?, NOW(), NOW())
            `;
            
            const values = [
                userData.username,
                userData.email,
                hashedPassword,
                userData.account_status || 'active'
            ];
            
            const result = await database.execute(query, values);
            
            if (result.insertId) {
                return await User.findById(result.insertId);
            }
            
            throw new Error('Failed to create user');
        } catch (error) {
            throw error;
        }
    }

    static async findById(id) {
        try {
            const query = 'SELECT * FROM users WHERE user_id = ? AND account_status = "active"';
            const results = await database.execute(query, [id]);
            
            if (results.length > 0) {
                return new User(results[0]);
            }
            
            return null;
        } catch (error) {
            throw error;
        }
    }

    static async findByUsername(username) {
        try {
            const query = 'SELECT * FROM users WHERE username = ? AND account_status = "active"';
            const results = await database.execute(query, [username]);
            
            if (results.length > 0) {
                return new User(results[0]);
            }
            
            return null;
        } catch (error) {
            throw error;
        }
    }

    static async findByEmail(email) {
        try {
            const query = 'SELECT * FROM users WHERE email = ? AND account_status = "active"';
            const results = await database.execute(query, [email]);
            
            if (results.length > 0) {
                return new User(results[0]);
            }
            
            return null;
        } catch (error) {
            throw error;
        }
    }

    async validatePassword(password) {
        try {
            return await bcrypt.compare(password, this.password);
        } catch (error) {
            return false;
        }
    }

    generateAuthToken() {
        try {
            const payload = {
                user_id: this.user_id,
                username: this.username,
                email: this.email,
                account_status: this.account_status
            };
            
            return jwt.sign(payload, process.env.JWT_SECRET, {
                expiresIn: '24h',
                issuer: 'nfl-pools'
            });
        } catch (error) {
            throw error;
        }
    }

    static async verifyToken(token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.id);
            
            if (!user) {
                throw new Error('User not found');
            }
            
            return user;
        } catch (error) {
            throw error;
        }
    }

    async update(updateData) {
        try {
            const allowedFields = ['username', 'email', 'first_name', 'last_name', 'account_status'];
            const updates = [];
            const values = [];
            
            for (const field of allowedFields) {
                if (updateData[field] !== undefined) {
                    updates.push(`${field} = ?`);
                    values.push(updateData[field]);
                }
            }
            
            if (updates.length === 0) {
                return this;
            }
            
            updates.push('updated_at = NOW()');
            values.push(this.user_id);
            
            const query = `UPDATE users SET ${updates.join(', ')} WHERE user_id = ?`;
            
            await database.execute(query, values);
            
            return await User.findById(this.user_id);
        } catch (error) {
            throw error;
        }
    }

    async updatePassword(newPassword) {
        try {
            const hashedPassword = await bcrypt.hash(newPassword, 12);
            
            const query = 'UPDATE users SET password_hash = ?, updated_at = NOW() WHERE user_id = ?';
            await database.execute(query, [hashedPassword, this.user_id]);
            
            return true;
        } catch (error) {
            throw error;
        }
    }

    async delete() {
        try {
            const query = 'UPDATE users SET account_status = "inactive", updated_at = NOW() WHERE user_id = ?';
            await database.execute(query, [this.user_id]);
            
            return true;
        } catch (error) {
            throw error;
        }
    }

    toJSON() {
        return {
            user_id: this.user_id,
            username: this.username,
            email: this.email,
            first_name: this.first_name,
            last_name: this.last_name,
            account_status: this.account_status,
            created_at: this.created_at,
            updated_at: this.updated_at
        };
    }

    static async checkUsernameAvailable(username, excludeId = null) {
        try {
            let query = 'SELECT user_id FROM users WHERE username = ? AND account_status = "active"';
            const values = [username];
            
            if (excludeId) {
                query += ' AND user_id != ?';
                values.push(excludeId);
            }
            
            const results = await database.execute(query, values);
            return results.length === 0;
        } catch (error) {
            throw error;
        }
    }

    static async checkEmailAvailable(email, excludeId = null) {
        try {
            let query = 'SELECT user_id FROM users WHERE email = ? AND account_status = "active"';
            const values = [email];
            
            if (excludeId) {
                query += ' AND user_id != ?';
                values.push(excludeId);
            }
            
            const results = await database.execute(query, values);
            return results.length === 0;
        } catch (error) {
            throw error;
        }
    }

    static async getAll(options = {}) {
        try {
            let query = 'SELECT * FROM users WHERE account_status = "active"';
            const values = [];
            
            if (options.account_status) {
                query = 'SELECT * FROM users WHERE account_status = ?';
                values.push(options.account_status);
            }
            
            query += ' ORDER BY created_at DESC';
            
            if (options.limit) {
                query += ' LIMIT ?';
                values.push(parseInt(options.limit));
            }
            
            const results = await database.execute(query, values);
            return results.map(row => new User(row));
        } catch (error) {
            throw error;
        }
    }
}

module.exports = User;