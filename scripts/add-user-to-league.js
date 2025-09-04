// Script to add user to a league for testing
const database = require('../config/database');

async function addUserToLeague() {
    try {
        const userId = 1; // Your user ID
        
        // Check if there are any leagues
        const [leagues] = await database.execute(
            `SELECT * FROM leagues WHERE status = 'active' LIMIT 1`
        );
        
        if (leagues.length === 0) {
            // No active leagues found. Creating a test league...
            
            // Create a test league
            const [result] = await database.execute(
                `INSERT INTO leagues (league_name, season_year, commissioner_id, status, created_at) 
                 VALUES (?, ?, ?, 'active', NOW())`,
                ['Test League 2025', 2025, userId]
            );
            
            const leagueId = result.insertId;
            // Created league successfully
            
            // Add user to the league
            const [userResult] = await database.execute(
                `INSERT INTO league_users (league_id, user_id, role, status, joined_at) 
                 VALUES (?, ?, 'commissioner', 'active', NOW())`,
                [leagueId, userId]
            );
            
            // Added user to league as commissioner
            
            // Create an entry for the user
            const [entryResult] = await database.execute(
                `INSERT INTO league_entries (league_user_id, status, created_at) 
                 VALUES (?, 'active', NOW())`,
                [userResult.insertId]
            );
            
            // Created entry for user
        } else {
            const league = leagues[0];
            // Found existing league
            
            // Check if user is already in the league
            const [existing] = await database.execute(
                `SELECT * FROM league_users WHERE league_id = ? AND user_id = ?`,
                [league.league_id, userId]
            );
            
            if (existing.length === 0) {
                // Add user to the league
                const [userResult] = await database.execute(
                    `INSERT INTO league_users (league_id, user_id, role, status, joined_at) 
                     VALUES (?, ?, 'member', 'active', NOW())`,
                    [league.league_id, userId]
                );
                
                // Added user to existing league
                
                // Create an entry for the user
                const [entryResult] = await database.execute(
                    `INSERT INTO league_entries (league_user_id, team_name, status, created_at) 
                     VALUES (?, ?, 'active', NOW())`,
                    [userResult.insertId, 'My Team']
                );
                
                // Created entry for user
            } else {
                // User is already in the league
                
                // Check if user has an entry
                const [entries] = await database.execute(
                    `SELECT * FROM league_entries WHERE league_user_id = ?`,
                    [existing[0].league_user_id]
                );
                
                if (entries.length === 0) {
                    // Create an entry
                    const [entryResult] = await database.execute(
                        `INSERT INTO league_entries (league_user_id, team_name, status, created_at) 
                         VALUES (?, ?, 'active', NOW())`,
                        [existing[0].league_user_id, 'My Team']
                    );
                    
                    // Created entry for existing user
                } else {
                    // User already has an entry
                }
            }
        }
        
        // Setup complete!
        process.exit(0);
    } catch (error) {
        // Error occurred
        process.exit(1);
    }
}

addUserToLeague();