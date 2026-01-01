const database = require('../config/database');
const socketManager = require('../config/socket');
const { getNFLSeasonYear } = require('../utils/getCurrentWeek');

class GameResultsProcessor {
    /**
     * Process game result and update all affected picks
     */
    static async processGameResult(gameId, homeScore, awayScore, status = 'completed') {
        const connection = await database.getPool().getConnection();
        
        try {
            await connection.beginTransaction();
            
            // Get game details
            const gameQuery = `
                SELECT g.*, 
                       home_team.full_name as home_team_name,
                       away_team.full_name as away_team_name
                FROM games g
                JOIN teams home_team ON g.home_team_id = home_team.team_id
                JOIN teams away_team ON g.away_team_id = away_team.team_id
                WHERE g.game_id = ?
            `;
            const [game] = await connection.execute(gameQuery, [gameId]);
            
            if (!game) {
                throw new Error(`Game ${gameId} not found`);
            }
            
            // Determine winning team
            let winningTeam = null;
            if (homeScore > awayScore) {
                winningTeam = game.home_team;
            } else if (awayScore > homeScore) {
                winningTeam = game.away_team;
            }
            // If scores are equal, winningTeam remains null (tie)
            
            // Update or insert game result
            const resultQuery = `
                INSERT INTO results (game_id, home_score, away_score, winning_team, status, updated_at)
                VALUES (?, ?, ?, ?, ?, NOW())
                ON DUPLICATE KEY UPDATE
                    home_score = VALUES(home_score),
                    away_score = VALUES(away_score),
                    winning_team = VALUES(winning_team),
                    status = VALUES(status),
                    updated_at = NOW()
            `;
            
            await connection.execute(resultQuery, [
                gameId, homeScore, awayScore, winningTeam, status
            ]);
            
            // Update game status
            await connection.execute(
                'UPDATE games SET status = ? WHERE game_id = ?',
                [status, gameId]
            );
            
            // Update all picks for this game
            const pickUpdateQuery = `
                UPDATE picks p
                SET 
                    is_correct = CASE 
                        WHEN ? IS NULL THEN NULL
                        WHEN p.selected_team = ? THEN 1 
                        ELSE 0 
                    END,
                    points_earned = CASE 
                        WHEN ? IS NULL THEN 0
                        WHEN p.selected_team = ? THEN p.confidence_points 
                        ELSE 0 
                    END,
                    result_updated_at = NOW()
                WHERE p.game_id = ?
            `;
            
            const result = await connection.execute(pickUpdateQuery, [
                winningTeam, winningTeam, winningTeam, winningTeam, gameId
            ]);
            
            await connection.commit();
            
            // Get updated pick information for real-time updates
            const updatedPicks = await this.getGamePicksWithResults(gameId);
            
            // Emit real-time updates
            socketManager.emitToAll('gameResult', {
                gameId,
                game: {
                    ...game,
                    home_score: homeScore,
                    away_score: awayScore,
                    winning_team: winningTeam,
                    status
                },
                updatedPicks: updatedPicks.length
            });
            
            // Processed game result and updated picks
            
            return {
                success: true,
                game,
                homeScore,
                awayScore,
                winningTeam,
                updatedPicks: result.affectedRows,
                message: `Game result processed successfully`
            };
            
        } catch (error) {
            await connection.rollback();
            // Error processing game result
            throw error;
        } finally {
            connection.release();
        }
    }
    
    /**
     * Get all picks for a specific game with results
     */
    static async getGamePicksWithResults(gameId) {
        try {
            const query = `
                SELECT 
                    p.*,
                    le.team_name,
                    u.username,
                    l.league_name
                FROM picks p
                JOIN league_entries le ON p.entry_id = le.entry_id
                JOIN league_users lu ON le.league_user_id = lu.league_user_id
                JOIN users u ON lu.user_id = u.user_id
                JOIN leagues l ON lu.league_id = l.league_id
                WHERE p.game_id = ?
                ORDER BY p.confidence_points DESC
            `;
            
            return await database.execute(query, [gameId]);
        } catch (error) {
            // Error getting game picks
            throw error;
        }
    }
    
    /**
     * Process multiple game results at once
     */
    static async processBulkResults(gameResults) {
        const results = [];
        const errors = [];
        
        for (const result of gameResults) {
            try {
                const processed = await this.processGameResult(
                    result.gameId,
                    result.homeScore,
                    result.awayScore,
                    result.status || 'completed'
                );
                results.push(processed);
            } catch (error) {
                errors.push({
                    gameId: result.gameId,
                    error: error.message
                });
            }
        }
        
        return { results, errors };
    }
    
    /**
     * Get week summary after results are processed
     */
    static async getWeekSummary(week, seasonYear = getNFLSeasonYear()) {
        try {
            const query = `
                SELECT 
                    COUNT(DISTINCT g.game_id) as total_games,
                    COUNT(DISTINCT CASE WHEN g.status = 'completed' THEN g.game_id END) as completed_games,
                    COUNT(DISTINCT p.pick_id) as total_picks,
                    SUM(CASE WHEN p.is_correct = 1 THEN 1 ELSE 0 END) as correct_picks,
                    SUM(p.points_earned) as total_points_awarded
                FROM games g
                LEFT JOIN picks p ON g.game_id = p.game_id
                WHERE g.week = ? AND g.season_year = ?
            `;
            
            const [summary] = await database.execute(query, [week, seasonYear]);
            
            return {
                week,
                seasonYear,
                ...summary,
                accuracy: summary.total_picks > 0 ? 
                    (summary.correct_picks / summary.total_picks * 100).toFixed(2) : 0
            };
        } catch (error) {
            // Error getting week summary
            throw error;
        }
    }
    
    /**
     * Recalculate all standings for a league after results update
     */
    static async recalculateLeagueStandings(leagueId) {
        try {
            const query = `
                SELECT 
                    le.entry_id,
                    le.team_name,
                    u.username,
                    COUNT(p.pick_id) as total_picks,
                    SUM(CASE WHEN p.is_correct = 1 THEN 1 ELSE 0 END) as correct_picks,
                    SUM(p.points_earned) as total_points,
                    AVG(CASE WHEN p.is_correct = 1 THEN p.confidence_points ELSE NULL END) as avg_correct_confidence
                FROM league_entries le
                JOIN league_users lu ON le.league_user_id = lu.league_user_id
                JOIN users u ON lu.user_id = u.user_id
                LEFT JOIN picks p ON le.entry_id = p.entry_id
                WHERE lu.league_id = ?
                GROUP BY le.entry_id, le.team_name, u.username
                ORDER BY total_points DESC, correct_picks DESC, avg_correct_confidence DESC
            `;
            
            const standings = await database.execute(query, [leagueId]);
            
            // Emit real-time standings update
            socketManager.emitToRoom(`league_${leagueId}`, 'standingsUpdate', standings);
            
            return standings;
        } catch (error) {
            // Error recalculating league standings
            throw error;
        }
    }
    
    /**
     * Auto-process results from external API or manual input
     */
    static async autoProcessWeekResults(week, seasonYear = getNFLSeasonYear()) {
        try {
            // Get all completed games for the week that haven't been processed yet
            const gamesQuery = `
                SELECT g.game_id, home_team.abbreviation as home_team, away_team.abbreviation as away_team
                FROM games g
                JOIN teams home_team ON g.home_team_id = home_team.team_id
                JOIN teams away_team ON g.away_team_id = away_team.team_id
                LEFT JOIN results r ON g.game_id = r.game_id
                WHERE g.week = ? 
                AND g.season_year = ?
                AND g.status = 'completed'
                AND (r.game_id IS NULL OR r.final_status != 'final')
                ORDER BY g.kickoff_timestamp
            `;
            
            const games = await database.execute(gamesQuery, [week, seasonYear]);
            
            // Found completed games to process for the week
            
            // Here you would integrate with NFL API to get actual scores
            // For now, we'll return the games that need processing
            return {
                week,
                seasonYear,
                gamesToProcess: games.length,
                games
            };
            
        } catch (error) {
            // Error in auto-process
            throw error;
        }
    }
    
    /**
     * Manually set game as in progress
     */
    static async setGameInProgress(gameId) {
        try {
            await database.execute(
                'UPDATE games SET status = ? WHERE game_id = ?',
                ['in_progress', gameId]
            );
            
            // Lock all picks for this game
            await database.execute(`
                UPDATE picks 
                SET is_locked = 1, locked_at = NOW() 
                WHERE game_id = ? AND is_locked = 0
            `, [gameId]);
            
            // Emit real-time update
            socketManager.emitToAll('gameStarted', { gameId });
            
            return { success: true, message: 'Game set to in progress and picks locked' };
        } catch (error) {
            // Error setting game in progress
            throw error;
        }
    }
}

module.exports = GameResultsProcessor;