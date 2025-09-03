// Simple database connection test
require('dotenv').config();
const mysql = require('mysql2/promise');

async function testConnection() {
    try {
        console.log('Testing database connection with:');
        console.log(`Host: ${process.env.DATABASE_HOST}`);
        console.log(`Port: ${process.env.DATABASE_PORT}`);
        console.log(`User: ${process.env.DATABASE_USER}`);
        console.log(`Database: ${process.env.DATABASE_NAME}`);
        
        const connection = await mysql.createConnection({
            host: process.env.DATABASE_HOST,
            port: process.env.DATABASE_PORT,
            user: process.env.DATABASE_USER,
            password: process.env.DATABASE_PASSWORD,
            database: process.env.DATABASE_NAME
        });

        console.log('✅ Connection successful!');
        
        // Test a simple query
        const [rows] = await connection.execute('SELECT COUNT(*) as count FROM users');
        console.log(`✅ Found ${rows[0].count} users in database`);
        
        // Check league_users table (this is crucial for picks)
        const [leagueUsers] = await connection.execute(`
            SELECT COUNT(*) as count FROM league_users WHERE status = 'active'
        `);
        console.log(`✅ Found ${leagueUsers[0].count} active league memberships`);
        
        if (leagueUsers[0].count === 0) {
            console.log('\n❌ ISSUE FOUND: No active league memberships!');
            console.log('This is why your picks page shows no leagues.');
            console.log('\nTo fix this, you need to add users to leagues via the league_users table.');
        }
        
        await connection.end();
        
    } catch (error) {
        console.error('❌ Connection failed:', error.message);
        
        if (error.code === 'ECONNREFUSED') {
            console.log('\nPossible solutions:');
            console.log('1. Make sure MySQL is running');
            console.log('2. Check if MySQL is running on port 3306');
            console.log('3. Try using 127.0.0.1 instead of localhost');
        } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
            console.log('\nDatabase credentials are incorrect');
        } else if (error.code === 'ER_BAD_DB_ERROR') {
            console.log('\nDatabase "pools" does not exist');
        }
    }
}

testConnection();