// Check users table structure and find lance@leaguestation.com
require('dotenv').config();
const mysql = require('mysql2/promise');

async function getMyPassword() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DATABASE_HOST || 'localhost',
            port: process.env.DATABASE_PORT || 3306,
            user: process.env.DATABASE_USER,
            password: process.env.DATABASE_PASSWORD,
            database: process.env.DATABASE_NAME || 'pools'
        });

        console.log('✅ Connected to database');

        // First, let's see what columns exist in the users table
        console.log('🔍 Checking users table structure...');
        const [columns] = await connection.execute('DESCRIBE users');
        
        console.log('\n📋 Users table columns:');
        columns.forEach(col => {
            console.log(`- ${col.Field} (${col.Type})`);
        });
        
        // Now let's see what's in the users table
        const [allUsers] = await connection.execute('SELECT * FROM users LIMIT 5');
        
        if (allUsers.length > 0) {
            console.log('\n📋 Users in database:');
            allUsers.forEach((user, index) => {
                console.log(`\nUser ${index + 1}:`);
                Object.keys(user).forEach(key => {
                    console.log(`  ${key}: ${user[key]}`);
                });
            });
        } else {
            console.log('\n📋 No users found in database');
        }

        await connection.end();
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

getMyPassword();