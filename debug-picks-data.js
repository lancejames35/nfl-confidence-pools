// Debug script to check picks data specifically
require('dotenv').config();
const database = require('./config/database');

async function debugPicksData() {
    try {
        await database.initialize();
        console.log('🔍 Debugging picks page data for user elmer35...\n');
        
        const userId = 1; // elmer35's user_id
        
        // Check league_users associations
        console.log('=== LEAGUE_USERS for elmer35 ===');
        const leagueUsers = await database.execute(`
            SELECT lu.*, l.league_name, l.status as league_status
            FROM league_users lu
            JOIN leagues l ON lu.league_id = l.league_id
            WHERE lu.user_id = ?
        `, [userId]);
        
        if (leagueUsers.length === 0) {
            console.log('❌ No league_users found for elmer35!');
        } else {
            leagueUsers.forEach(lu => {
                console.log(`League: "${lu.league_name}", User Status: ${lu.status}, League Status: ${lu.league_status}, Role: ${lu.role}`);
            });
        }
        
        // Check league_entries
        console.log('\n=== LEAGUE_ENTRIES for elmer35 ===');
        const entries = await database.execute(`
            SELECT le.*, lu.user_id, l.league_name, l.status as league_status
            FROM league_entries le
            JOIN league_users lu ON le.league_user_id = lu.league_user_id
            JOIN leagues l ON lu.league_id = l.league_id
            WHERE lu.user_id = ?
        `, [userId]);
        
        if (entries.length === 0) {
            console.log('❌ No league_entries found for elmer35!');
        } else {
            entries.forEach(entry => {
                console.log(`Entry: "${entry.team_name}" in "${entry.league_name}", Entry Status: ${entry.status}, League Status: ${entry.league_status}`);
            });
        }
        
        // Run the EXACT same query that PickController.index() uses
        console.log('\n=== EXACT PICKCONTROLLER QUERY ===');
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
        
        const results = await database.execute(picksQuery, [userId]);
        
        if (results.length === 0) {
            console.log('❌ PICKCONTROLLER QUERY RETURNED EMPTY!');
            console.log('\nThis is why the picks page shows "No Active Leagues"');
            console.log('The query requires:');
            console.log('- lu.user_id = 1 (elmer35)');
            console.log('- lu.status = "active"');
            console.log('- l.status = "active"');
            console.log('- le.status = "active" (for entries)');
        } else {
            console.log(`✅ FOUND ${results.length} results:`);
            results.forEach((row, i) => {
                console.log(`${i + 1}. League: "${row.league_name}", Entry: "${row.team_name || 'No entry'}", Member Status: ${row.member_status}, Entry Status: ${row.entry_status}`);
            });
        }
        
        // Show what needs to be fixed
        console.log('\n=== POTENTIAL FIXES ===');
        
        // Check if leagues need to be set to active
        const draftLeagues = await database.execute(`
            SELECT league_id, league_name, status FROM leagues WHERE status = 'draft'
        `);
        
        if (draftLeagues.length > 0) {
            console.log('📝 These leagues are still in "draft" status and need to be "active":');
            draftLeagues.forEach(league => {
                console.log(`- League ID ${league.league_id}: "${league.league_name}"`);
            });
            console.log('Fix: UPDATE leagues SET status = "active" WHERE status = "draft";');
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await database.close();
        process.exit(0);
    }
}

debugPicksData();