// Debug script to check database state
require('dotenv').config();
const database = require('./config/database');

async function debugDatabase() {
    try {
        await database.initialize();
        console.log('🔍 Debugging database state...\n');
        
        // Check users
        console.log('=== USERS ===');
        const users = await database.execute('SELECT user_id, username, email FROM users');
        users.forEach(user => {
            console.log(`User: ${user.username} (ID: ${user.user_id})`);
        });
        
        // Check leagues
        console.log('\n=== LEAGUES ===');
        const leagues = await database.execute('SELECT league_id, league_name, commissioner_id, status FROM leagues');
        leagues.forEach(league => {
            console.log(`League: ${league.league_name} (ID: ${league.league_id}, Commissioner: ${league.commissioner_id}, Status: ${league.status})`);
        });
        
        // Check league_users (this is crucial for picks to work)
        console.log('\n=== LEAGUE USERS ===');
        const leagueUsers = await database.execute(`
            SELECT lu.*, u.username, l.league_name 
            FROM league_users lu
            JOIN users u ON lu.user_id = u.user_id
            JOIN leagues l ON lu.league_id = l.league_id
        `);
        
        if (leagueUsers.length === 0) {
            console.log('❌ NO LEAGUE_USERS FOUND - This is why picks page is empty!');
        } else {
            leagueUsers.forEach(lu => {
                console.log(`${lu.username} in "${lu.league_name}" (Role: ${lu.role}, Status: ${lu.status})`);
            });
        }
        
        // Check league_entries 
        console.log('\n=== LEAGUE ENTRIES ===');
        const entries = await database.execute(`
            SELECT le.*, lu.user_id, u.username, l.league_name
            FROM league_entries le
            JOIN league_users lu ON le.league_user_id = lu.league_user_id
            JOIN users u ON lu.user_id = u.user_id
            JOIN leagues l ON lu.league_id = l.league_id
        `);
        
        if (entries.length === 0) {
            console.log('❌ NO LEAGUE_ENTRIES FOUND - This is needed for picks!');
        } else {
            entries.forEach(entry => {
                console.log(`Entry: "${entry.team_name}" by ${entry.username} in "${entry.league_name}" (Entry ID: ${entry.entry_id})`);
            });
        }
        
        // Check games for current season
        console.log('\n=== GAMES (2025 Season) ===');
        const games = await database.execute(`
            SELECT COUNT(*) as count, MIN(week) as min_week, MAX(week) as max_week
            FROM games 
            WHERE season_year = 2025
        `);
        
        if (games[0].count === 0) {
            console.log('❌ NO GAMES FOUND for 2025 season - Needed for picks!');
        } else {
            console.log(`Found ${games[0].count} games for 2025 (Weeks ${games[0].min_week}-${games[0].max_week})`);
            
            // Show a few sample games
            const sampleGames = await database.execute(`
                SELECT game_id, week, home_team, away_team, kickoff_timestamp, status
                FROM games 
                WHERE season_year = 2025 
                ORDER BY week, kickoff_timestamp 
                LIMIT 5
            `);
            
            console.log('Sample games:');
            sampleGames.forEach(game => {
                console.log(`  Week ${game.week}: ${game.away_team} @ ${game.home_team} (${game.kickoff_timestamp})`);
            });
        }
        
        // Test the exact query used by PickController.index()
        console.log('\n=== TESTING PICKS CONTROLLER QUERY ===');
        const userId = 1; // elmer35's user_id
        const picksQuery = `
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
        
        const picksResults = await database.execute(picksQuery, [userId]);
        
        if (picksResults.length === 0) {
            console.log('❌ PICKS QUERY RETURNED NO RESULTS');
            console.log('This means either:');
            console.log('1. User is not in any leagues (league_users missing)');
            console.log('2. No active leagues');
            console.log('3. No active league entries');
        } else {
            console.log('✅ PICKS QUERY RESULTS:');
            picksResults.forEach(result => {
                console.log(`  League: ${result.league_name}, Entry: ${result.team_name || 'No entry'}, Role: ${result.role}`);
            });
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await database.close();
        process.exit(0);
    }
}

debugDatabase();