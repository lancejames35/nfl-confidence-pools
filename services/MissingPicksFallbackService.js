const database = require('../config/database');

class MissingPicksFallbackService {
    /**
     * Apply fallback picks for users missing picks when a game gets locked
     */
    static async applyFallbackForLockedGame(gameId) {
        try {
            console.log(`🎯 Checking for missing picks for locked game ${gameId}`);
            
            // Get game details
            const [gameInfo] = await database.execute(`
                SELECT game_id, week, season_year, status
                FROM games 
                WHERE game_id = ?
            `, [gameId]);
            
            if (!gameInfo) {
                console.log(`⚠️ Game ${gameId} not found`);
                return { success: false, message: 'Game not found' };
            }
            
            const { week, season_year } = gameInfo;
            
            // Find all entries that are missing picks for this game
            const missingPicks = await this.findMissingPicks(gameId, week, season_year);
            
            if (missingPicks.length === 0) {
                console.log(`✅ No missing picks found for game ${gameId}`);
                return { success: true, message: 'No missing picks to process' };
            }
            
            console.log(`🔧 Found ${missingPicks.length} missing picks for game ${gameId}`);
            
            let successCount = 0;
            let failureCount = 0;
            
            // Process each missing pick
            for (const missingPick of missingPicks) {
                try {
                    await this.applyFallbackForEntry(missingPick.entry_id, week, season_year, gameId);
                    successCount++;
                    console.log(`✅ Applied fallback for entry ${missingPick.entry_id} (${missingPick.username})`);
                } catch (error) {
                    failureCount++;
                    console.error(`❌ Failed to apply fallback for entry ${missingPick.entry_id}: ${error.message}`);
                }
            }
            
            console.log(`📊 Fallback processing completed: ${successCount} successful, ${failureCount} failed`);
            
            return {
                success: true,
                message: `Processed ${missingPicks.length} missing picks`,
                successCount,
                failureCount
            };
            
        } catch (error) {
            console.error(`❌ Error in applyFallbackForLockedGame: ${error.message}`);
            return { success: false, message: error.message };
        }
    }
    
    /**
     * Find all entries missing picks for a specific game
     */
    static async findMissingPicks(gameId, week, seasonYear) {
        try {
            const query = `
                SELECT DISTINCT
                    le.entry_id,
                    u.username,
                    lu.league_id
                FROM league_entries le
                JOIN league_users lu ON le.league_user_id = lu.league_user_id
                JOIN users u ON lu.user_id = u.user_id
                LEFT JOIN picks p ON le.entry_id = p.entry_id AND p.week = ? AND p.game_id = ?
                WHERE p.pick_id IS NULL
                ORDER BY le.entry_id
            `;
            
            return await database.execute(query, [week, gameId]);
        } catch (error) {
            throw new Error(`Failed to find missing picks: ${error.message}`);
        }
    }
    
    /**
     * Apply fallback logic for a specific entry
     */
    static async applyFallbackForEntry(entryId, week, seasonYear, gameId) {
        const connection = await database.getPool().getConnection();
        
        try {
            await connection.beginTransaction();
            
            // Get current picks for this entry/week
            const [currentPicks] = await connection.execute(`
                SELECT 
                    p.pick_id,
                    p.game_id,
                    p.confidence_points,
                    p.is_locked,
                    g.status as game_status
                FROM picks p
                JOIN games g ON p.game_id = g.game_id
                WHERE p.entry_id = ? AND p.week = ?
                ORDER BY p.confidence_points
            `, [entryId, week]);
            
            // Separate locked and unlocked picks
            const lockedPoints = new Set();
            const unlockedPicks = [];
            
            for (const pick of currentPicks) {
                if (pick.is_locked || pick.game_status === 'completed') {
                    lockedPoints.add(pick.confidence_points);
                } else {
                    unlockedPicks.push(pick);
                }
            }
            
            // Find the lowest available confidence point
            const totalGames = await this.getTotalGamesInWeek(week, seasonYear);
            let lowestAvailable = 1;
            
            while (lockedPoints.has(lowestAvailable) && lowestAvailable <= totalGames) {
                lowestAvailable++;
            }
            
            if (lowestAvailable > totalGames) {
                throw new Error(`No available confidence points for entry ${entryId}`);
            }
            
            // Shift unlocked picks that need to move
            const picksToShift = unlockedPicks.filter(pick => pick.confidence_points >= lowestAvailable);
            
            // Sort by confidence_points descending to avoid conflicts during update
            picksToShift.sort((a, b) => b.confidence_points - a.confidence_points);
            
            // Shift each pick up by 1
            for (const pick of picksToShift) {
                await connection.execute(`
                    UPDATE picks 
                    SET confidence_points = confidence_points + 1
                    WHERE pick_id = ?
                `, [pick.pick_id]);
            }
            
            // Insert the missing pick
            await connection.execute(`
                INSERT INTO picks (
                    entry_id, week, game_id, selected_team, confidence_points, 
                    pick_type, is_locked, locked_at
                ) VALUES (?, ?, ?, '--', ?, 'confidence', 1, NOW())
            `, [entryId, week, gameId, lowestAvailable]);
            
            await connection.commit();
            
            console.log(`📝 Entry ${entryId}: Inserted missing pick at confidence ${lowestAvailable}, shifted ${picksToShift.length} picks`);
            
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }
    
    /**
     * Get total number of games in a week
     */
    static async getTotalGamesInWeek(week, seasonYear) {
        try {
            const [result] = await database.execute(`
                SELECT COUNT(*) as total_games
                FROM games
                WHERE week = ? AND season_year = ?
            `, [week, seasonYear]);
            
            return result.total_games || 16; // Default to 16 if query fails
        } catch (error) {
            console.error(`Error getting total games for week ${week}: ${error.message}`);
            return 16; // Default fallback
        }
    }
    
    /**
     * Process fallbacks for all currently live/locked games (for initialization)
     */
    static async processAllLiveGames() {
        try {
            console.log(`🔄 Processing fallbacks for all live/locked games`);
            
            // Get all games that are currently live or recently started
            const liveGames = await database.execute(`
                SELECT game_id, week, season_year, status
                FROM games
                WHERE status IN ('in_progress', 'completed')
                OR (
                    kickoff_timestamp <= NOW()
                    AND kickoff_timestamp >= DATE_SUB(NOW(), INTERVAL 4 HOUR)
                )
            `);
            
            let totalProcessed = 0;
            
            for (const game of liveGames) {
                const result = await this.applyFallbackForLockedGame(game.game_id);
                if (result.successCount > 0) {
                    totalProcessed += result.successCount;
                }
            }
            
            console.log(`✅ Processed fallbacks for ${liveGames.length} games, ${totalProcessed} missing picks filled`);
            
            return {
                success: true,
                gamesProcessed: liveGames.length,
                picksProcessed: totalProcessed
            };
            
        } catch (error) {
            console.error(`❌ Error processing all live games: ${error.message}`);
            return { success: false, message: error.message };
        }
    }
}

module.exports = MissingPicksFallbackService;