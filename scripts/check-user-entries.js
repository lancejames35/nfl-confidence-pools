// Check and create user league entries
const database = require('../config/database');

async function checkUserEntries() {
    try {
        const userId = 1; // Your user ID
        
        console.log('=== Checking User League Entries ===');
        
        // Check league_users table
        const [leagueUsers] = await database.execute(
            `SELECT * FROM league_users WHERE user_id = ?`,
            [userId]
        );
        console.log('League Users:', leagueUsers);
        
        if (leagueUsers.length === 0) {
            console.log('❌ No league memberships found');
            return;
        }
        
        // Check entries for each league membership
        for (const membership of leagueUsers) {
            console.log(`\n--- League: ${membership.league_id} ---`);
            
            const [entries] = await database.execute(
                `SELECT * FROM league_entries WHERE league_user_id = ?`,
                [membership.league_user_id]
            );
            
            console.log(`Entries for league_user_id ${membership.league_user_id}:`, entries);
            
            if (entries.length === 0) {
                console.log('⚠️  No entry found, creating one...');
                
                // Create entry
                const [result] = await database.execute(
                    `INSERT INTO league_entries (league_user_id, status, created_at) 
                     VALUES (?, 'active', NOW())`,
                    [membership.league_user_id]
                );
                
                console.log('✅ Created entry with ID:', result.insertId);
            } else {
                console.log('✅ Entry exists:', entries[0]);
            }
        }
        
        console.log('\n=== Final Check ===');
        
        // Run the same query as the picks route
        const [finalCheck] = await database.execute(
            `SELECT lu.*, l.*, le.entry_id, le.team_name
             FROM league_users lu
             JOIN leagues l ON lu.league_id = l.league_id
             LEFT JOIN league_entries le ON lu.league_user_id = le.league_user_id AND le.status = 'active'
             WHERE lu.user_id = ?
             ORDER BY l.created_at ASC
             LIMIT 1`,
            [userId]
        );
        
        console.log('Final query result (what picks route sees):', finalCheck);
        
        console.log('\n✅ Done!');
        process.exit(0);
        
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkUserEntries();