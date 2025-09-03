// Debug script to check picks system data
require('dotenv').config();
const database = require('./config/database');

async function debugPicks() {
    try {
        await database.initialize();
        console.log('🔍 Debugging picks system...\n');
        
        // Check users
        console.log('=== USERS ===');
        const users = await database.execute('SELECT user_id, username, email, created_at FROM users ORDER BY user_id');
        users.forEach(user => {
            console.log(`${user.user_id}: ${user.username} (${user.email})`);
        });
        
        // Check leagues
        console.log('\n=== LEAGUES ===');
        const leagues = await database.execute(`
            SELECT league_id, league_name, commissioner_id, status, season_year, created_at 
            FROM leagues 
            ORDER BY league_id
        `);
        leagues.forEach(league => {
            console.log(`${league.league_id}: ${league.league_name} (${league.status}, ${league.season_year})`);
        });
        
        // Check league_users
        console.log('\n=== LEAGUE USERS ===');
        const leagueUsers = await database.execute(`
            SELECT lu.league_user_id, lu.league_id, lu.user_id, lu.role, lu.status,
                   l.league_name, u.username
            FROM league_users lu
            JOIN leagues l ON lu.league_id = l.league_id
            JOIN users u ON lu.user_id = u.user_id
            ORDER BY lu.league_user_id
        `);
        leagueUsers.forEach(lu => {
            console.log(`${lu.league_user_id}: User ${lu.username} in "${lu.league_name}" (${lu.role}, ${lu.status})`);
        });
        
        // Check league_entries
        console.log('\n=== LEAGUE ENTRIES ===');
        const entries = await database.execute(`
            SELECT le.entry_id, le.league_user_id, le.team_name, le.status,
                   l.league_name, u.username
            FROM league_entries le
            JOIN league_users lu ON le.league_user_id = lu.league_user_id
            JOIN leagues l ON lu.league_id = l.league_id
            JOIN users u ON lu.user_id = u.user_id
            ORDER BY le.entry_id
        `);
        entries.forEach(entry => {
            console.log(`${entry.entry_id}: "${entry.team_name}" by ${entry.username} in ${entry.league_name} (${entry.status})`);
        });
        
        // Check games for 2025 season
        console.log('\n=== GAMES (Sample from Week 1) ===');
        const games = await database.execute(`
            SELECT game_id, week, home_team, away_team, kickoff_timestamp, status
            FROM games 
            WHERE season_year = 2025 AND week = 1
            ORDER BY kickoff_timestamp
            LIMIT 5
        `);
        if (games.length > 0) {
            games.forEach(game => {
                console.log(`${game.game_id}: Week ${game.week} - ${game.away_team} @ ${game.home_team} (${game.status})`);
            });
        } else {
            console.log('No games found for 2025 season!');
        }
        
        // Test the exact query used by PickController
        console.log('\n=== TESTING PICK CONTROLLER QUERY ===');
        if (users.length > 0) {
            const testUserId = users[0].user_id;
            console.log(`Testing for user_id: ${testUserId} (${users[0].username})`);
            
            const query = `
                SELECT 
                    l.*,
                    lu.role,
                    lu.status as member_status,
                    le.entry_id,
                    le.team_name,
                    le.status as entry_status,
                    le.created_at as entry_created_at
                FROM leagues l
                JOIN league_users lu ON l.league_id = lu.league_id
                LEFT JOIN league_entries le ON lu.league_user_id = le.league_user_id AND le.status = 'active'
                WHERE lu.user_id = ? AND lu.status = 'active' AND l.status = 'active'
                ORDER BY l.created_at DESC, le.created_at ASC
            `;
            
            const results = await database.execute(query, [testUserId]);
            console.log(`Query returned ${results.length} rows:`);
            results.forEach((row, i) => {
                console.log(`  ${i + 1}: League "${row.league_name}", Entry: "${row.team_name}" (${row.entry_id})`);
            });
        }
        
        console.log('\n=== SUMMARY ===');
        console.log(`Users: ${users.length}`);
        console.log(`Leagues: ${leagues.length}`);  
        console.log(`League Memberships: ${leagueUsers.length}`);
        console.log(`League Entries: ${entries.length}`);
        console.log(`Sample Games: ${games.length}`);
        
        if (entries.length === 0) {
            console.log('\n❌ ISSUE FOUND: No league entries exist!');
            console.log('This is why the picks page shows no active leagues.');
            console.log('\nTo fix this:');
            console.log('1. Run the create-test-league.sql script in MySQL');
            console.log('2. Or create a league through the web interface');
            console.log('3. Make sure to create league ENTRIES (not just league membership)');
        } else {
            console.log('\n✅ Data looks good! Check if user has proper league membership.');
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await database.close();
        process.exit(0);
    }
}

debugPicks();