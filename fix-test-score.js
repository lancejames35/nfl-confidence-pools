#!/usr/bin/env node
/**
 * Quick fix for test data - updates elmer35's score to the correct 117 points
 */

require('dotenv').config();
const database = require('./config/database');

async function fixTestScore() {
    try {
        await database.initialize();
        console.log('📊 Fixing elmer35 test score...');
        
        // Update to correct score
        const result = await database.execute(`
            UPDATE weekly_scores 
            SET total_points = 117, games_correct = 13 
            WHERE weekly_score_id = 39 AND total_points = 136
        `);
        
        console.log(`✅ Updated ${result.affectedRows || 0} records`);
        
        // Verify the change
        const [updatedScore] = await database.execute(`
            SELECT ws.total_points, ws.games_correct, u.username 
            FROM weekly_scores ws
            JOIN league_entries le ON ws.entry_id = le.entry_id
            JOIN league_users lu ON le.league_user_id = lu.league_user_id
            JOIN users u ON lu.user_id = u.user_id
            WHERE ws.weekly_score_id = 39
        `);
        
        if (updatedScore) {
            console.log(`✅ Verified: ${updatedScore.username} now has ${updatedScore.total_points} points (${updatedScore.games_correct}/16 correct)`);
        }
        
        console.log('\n🧪 Now run: node test-weekly-winners.js');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await database.close();
    }
}

fixTestScore();