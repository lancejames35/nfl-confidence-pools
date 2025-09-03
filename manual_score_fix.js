const database = require('./config/database');

async function fixUncoredPicks() {
    try {
        console.log('Starting manual scoring for entry_id 39...');
        
        // Update all picks for entry_id 39 by comparing with results
        const fixQuery = `
            UPDATE picks p
            JOIN results r ON p.game_id = r.game_id
            SET 
                p.is_correct = CASE 
                    WHEN r.winning_team IS NULL THEN NULL
                    WHEN p.selected_team = r.winning_team THEN 1 
                    ELSE 0 
                END,
                p.points_earned = CASE 
                    WHEN r.winning_team IS NULL THEN 0
                    WHEN p.selected_team = r.winning_team THEN p.confidence_points 
                    ELSE 0 
                END
            WHERE p.entry_id = 39 
            AND p.week = 1
            AND p.is_correct IS NULL;
        `;
        
        const [result] = await database.execute(fixQuery);
        console.log(`Updated ${result.affectedRows} picks for entry_id 39`);
        
        // Verify the fix
        const verifyQuery = `
            SELECT entry_id, game_id, selected_team, confidence_points, is_correct, points_earned
            FROM picks 
            WHERE entry_id = 39 AND week = 1
            ORDER BY game_id
            LIMIT 5;
        `;
        
        const [verifyResult] = await database.execute(verifyQuery);
        console.log('Sample of updated picks:', verifyResult);
        
        // Check total points
        const totalQuery = `
            SELECT SUM(points_earned) as total_points, COUNT(*) as total_picks
            FROM picks 
            WHERE entry_id = 39 AND week = 1;
        `;
        
        const [totalResult] = await database.execute(totalQuery);
        console.log('Total points for entry_id 39:', totalResult[0]);
        
        process.exit(0);
    } catch (error) {
        console.error('Error fixing picks:', error);
        process.exit(1);
    }
}

fixUncoredPicks();