const mysql = require('mysql2/promise');
require('dotenv').config();

async function addPickMethodColumn() {
    let connection;
    
    try {
        // Create connection using the same config as the app
        connection = await mysql.createConnection({
            host: process.env.DATABASE_HOST || 'localhost',
            port: process.env.DATABASE_PORT || 3306,
            user: process.env.DATABASE_USER,
            password: process.env.DATABASE_PASSWORD,
            database: process.env.DATABASE_NAME || 'pools',
            charset: 'utf8mb4'
        });

        console.log('✅ Connected to database');

        // Check if column already exists
        const [columns] = await connection.execute(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = ? 
            AND TABLE_NAME = 'leagues' 
            AND COLUMN_NAME = 'pick_method'
        `, [process.env.DATABASE_NAME || 'pools']);

        if (columns.length > 0) {
            console.log('⚠️  pick_method column already exists in leagues table');
            return;
        }

        // Add the column
        console.log('📝 Adding pick_method column to leagues table...');
        await connection.execute(`
            ALTER TABLE leagues 
            ADD COLUMN pick_method ENUM('straight_up', 'against_spread') 
            DEFAULT 'straight_up' 
            AFTER pool_type
        `);

        // Update existing leagues
        console.log('🔄 Updating existing leagues with default value...');
        const [updateResult] = await connection.execute(`
            UPDATE leagues 
            SET pick_method = 'straight_up' 
            WHERE pick_method IS NULL
        `);

        // Verify the change
        const [leagues] = await connection.execute(`
            SELECT league_id, league_name, pool_type, pick_method, status 
            FROM leagues 
            LIMIT 5
        `);

        console.log('✅ Migration completed successfully!');
        console.log('📊 Updated leagues:', updateResult.affectedRows);
        console.log('🔍 Sample leagues:');
        console.table(leagues);

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

// Run the migration
addPickMethodColumn();