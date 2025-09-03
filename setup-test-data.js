// Setup script to create test data for picks system
require('dotenv').config();
const database = require('./config/database');

async function setupTestData() {
    try {
        await database.initialize();
        console.log('🔧 Setting up test data for picks system...\n');
        
        // Check if user "elmer35" exists
        const users = await database.execute('SELECT * FROM users WHERE username = ?', ['elmer35']);
        
        if (users.length === 0) {
            console.log('❌ User "elmer35" not found. Please register first.');
            return;
        }
        
        const user = users[0];
        console.log(`✅ Found user: ${user.username} (ID: ${user.user_id})`);
        
        // Check if test league exists
        let leagues = await database.execute('SELECT * FROM leagues WHERE league_name = ?', ['Test League 2025']);
        
        let league;
        if (leagues.length === 0) {
            // Create test league
            console.log('📋 Creating test league...');
            const result = await database.execute(`
                INSERT INTO leagues (
                    league_name, commissioner_id, entry_fee, max_entries, max_participants,
                    season_year, pool_type, status, privacy, join_code, description,
                    timezone, chat_enabled, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
            `, [
                'Test League 2025',
                user.user_id,
                10.00,
                2,
                10,
                2025,
                'confidence',
                'active',
                'public',
                'TEST2025',
                'Test league for trying out the picks system',
                'America/New_York',
                1
            ]);
            
            league = { league_id: result.insertId, league_name: 'Test League 2025' };
            console.log(`✅ Created league: ${league.league_name} (ID: ${league.league_id})`);
        } else {
            league = leagues[0];
            console.log(`✅ Found existing league: ${league.league_name} (ID: ${league.league_id})`);
        }
        
        // Check if user is in the league
        const leagueUsers = await database.execute(`
            SELECT * FROM league_users WHERE league_id = ? AND user_id = ?
        `, [league.league_id, user.user_id]);
        
        let leagueUser;
        if (leagueUsers.length === 0) {
            // Add user to league
            console.log('👥 Adding user to league...');
            const result = await database.execute(`
                INSERT INTO league_users (league_id, user_id, role, status, joined_at)
                VALUES (?, ?, ?, ?, NOW())
            `, [league.league_id, user.user_id, 'commissioner', 'active']);
            
            leagueUser = { league_user_id: result.insertId };
            console.log(`✅ Added user to league (league_user_id: ${leagueUser.league_user_id})`);
        } else {
            leagueUser = leagueUsers[0];
            console.log(`✅ User already in league (league_user_id: ${leagueUser.league_user_id})`);
        }
        
        // Check if user has league entries
        const entries = await database.execute(`
            SELECT * FROM league_entries WHERE league_user_id = ?
        `, [leagueUser.league_user_id]);
        
        if (entries.length === 0) {
            // Create test entries
            console.log('🏈 Creating league entries...');
            
            const entry1Result = await database.execute(`
                INSERT INTO league_entries (league_user_id, status, created_at)
                VALUES (?, ?, NOW())
            `, [leagueUser.league_user_id, 'active']);
            
            const entry2Result = await database.execute(`
                INSERT INTO league_entries (league_user_id, status, created_at)
                VALUES (?, ?, NOW())
            `, [leagueUser.league_user_id, 'active']);
            
            console.log(`✅ Created entry for user (ID: ${entry1Result.insertId})`);
            console.log(`✅ Created entry for user (ID: ${entry2Result.insertId})`);
        } else {
            console.log(`✅ Found ${entries.length} existing entries:`);
            entries.forEach(entry => {
                console.log(`   - Entry ID: ${entry.entry_id}`);
            });
        }
        
        // Check available games for current week
        const currentWeek = 1; // Start with week 1 for testing
        const games = await database.execute(`
            SELECT COUNT(*) as game_count FROM games 
            WHERE season_year = 2025 AND week = ?
        `, [currentWeek]);
        
        console.log(`\n🏈 Available games for Week ${currentWeek}: ${games[0].game_count}`);
        
        if (games[0].game_count > 0) {
            console.log('\n🎯 Test data setup complete!');
            console.log('\nTo test the picks system:');
            console.log('1. Start the application: npm start');
            console.log('2. Login as "elmer35"');
            console.log('3. Navigate to /picks');
            console.log('4. Click "Make Picks" for one of your entries');
            console.log('5. You should see the drag-and-drop interface!');
        } else {
            console.log('\n⚠️  No games found for 2025 season. Make sure NFL games data is loaded.');
        }
        
    } catch (error) {
        console.error('❌ Error setting up test data:', error);
    } finally {
        await database.close();
        process.exit(0);
    }
}

setupTestData();