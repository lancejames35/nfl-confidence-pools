const database = require('../config/database');
const PickScoringService = require('./PickScoringService');

class WeeklyWinnersService {
    /**
     * Main method: Calculate weekly scores and determine winners
     * Clean 3-step process: calculate scores → find winners → store results
     */
    static async calculateWeeklyWinners(leagueId, week, seasonYear = new Date().getFullYear()) {
        const connection = await database.getConnection();
        
        try {
            await connection.beginTransaction();
            
            // Step 1: Calculate and store weekly scores for all participants
            console.log(`Step 1: Calculating weekly scores for league ${leagueId}, week ${week}...`);
            const scoresCalculated = await this.calculateAndStoreWeeklyScores(leagueId, week, seasonYear, connection);
            
            if (scoresCalculated === 0) {
                await connection.rollback();
                connection.release();
                return { success: false, message: 'No participants found with picks for this week' };
            }
            
            // Step 2: Find the highest score(s) and determine winners
            console.log(`Step 2: Determining winners from ${scoresCalculated} calculated scores...`);
            const winners = await this.determineWinners(leagueId, week, seasonYear, connection);
            
            if (winners.length === 0) {
                await connection.rollback();
                connection.release();
                return { success: false, message: 'No winners could be determined' };
            }
            
            // Step 3: Store winners and update flags
            console.log(`Step 3: Storing ${winners.length} winner(s)...`);
            await this.storeWinners(winners, leagueId, week, seasonYear, connection);
            
            await connection.commit();
            connection.release();
            
            return {
                success: true,
                winners: winners,
                tiebreakerUsed: winners.some(w => w.tiebreaker_used),
                message: `Successfully calculated ${winners.length} winner(s) for Week ${week}`
            };
            
        } catch (error) {
            await connection.rollback();
            connection.release();
            console.error('Error in calculateWeeklyWinners:', error);
            throw error;
        }
    }
    
    /**
     * Step 1: Calculate weekly scores using same logic as ResultsController
     */
    static async calculateAndStoreWeeklyScores(leagueId, week, seasonYear, connection) {
        // Clear any existing scores for this league/week
        await connection.execute(`
            DELETE ws FROM weekly_scores ws
            JOIN league_entries le ON ws.entry_id = le.entry_id
            JOIN league_users lu ON le.league_user_id = lu.league_user_id
            WHERE lu.league_id = ? AND ws.week = ? AND ws.season_year = ?
        `, [leagueId, week, seasonYear]);
        
        // Get all participants
        const [participants] = await connection.execute(`
            SELECT 
                le.entry_id,
                le.league_user_id,
                lu.user_id,
                u.username
            FROM league_entries le
            JOIN league_users lu ON le.league_user_id = lu.league_user_id
            JOIN users u ON lu.user_id = u.user_id
            WHERE lu.league_id = ? AND le.status = 'active'
        `, [leagueId]);
        
        // Get league settings for pick method
        const leagueSettings = await this.getLeagueSettings(leagueId, connection);
        const pickMethod = leagueSettings?.pick_method || 'straight_up';
        
        // Get games for the week
        const [games] = await connection.execute(`
            SELECT 
                g.*,
                r.home_score,
                r.away_score,
                r.winning_team,
                r.final_status as result_status
            FROM games g
            LEFT JOIN results r ON g.game_id = r.game_id
            WHERE g.week = ? AND g.season_year = ?
            ORDER BY g.kickoff_timestamp
        `, [week, seasonYear]);
        
        // Get all picks for this week and league
        const [picks] = await connection.execute(`
            SELECT 
                p.*,
                le.entry_id,
                u.username
            FROM picks p
            JOIN league_entries le ON p.entry_id = le.entry_id
            JOIN league_users lu ON le.league_user_id = lu.league_user_id
            JOIN users u ON lu.user_id = u.user_id
            WHERE lu.league_id = ? AND p.week = ?
        `, [leagueId, week]);
        
        // Create game lookup map
        const gameMap = new Map();
        games.forEach(game => gameMap.set(game.game_id, game));
        
        // Calculate scores for each participant (same logic as ResultsController)
        const scorePromises = participants.map(async (participant) => {
            const userPicks = picks.filter(p => p.entry_id === participant.entry_id);
            
            if (userPicks.length === 0) {
                return null; // Skip participants with no picks
            }
            
            let totalPoints = 0;
            let correctPicks = 0;
            let totalPicks = userPicks.length;
            
            userPicks.forEach(pick => {
                const game = gameMap.get(pick.game_id);
                if (game) {
                    // Only count final or live games toward record (same as ResultsController)
                    const hasScores = game.home_score !== null && game.away_score !== null;
                    const gameFinished = game.result_status === 'final';
                    const gameInProgress = hasScores && !gameFinished && game.result_status === 'in_progress';
                    const shouldCountGame = gameFinished || gameInProgress;
                    
                    if (shouldCountGame) {
                        const pickResult = PickScoringService.calculatePickResult(pick, game, pickMethod);
                        if (pickResult.isCorrect === 1) {  // Check for 1 instead of true (same as ResultsController)
                            totalPoints += pickResult.pointsEarned;
                            correctPicks++;
                        }
                    }
                }
            });
            
            // Insert weekly score record
            const [result] = await connection.execute(`
                INSERT INTO weekly_scores (entry_id, week, season_year, total_points, games_correct, games_picked)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [participant.entry_id, week, seasonYear, totalPoints, correctPicks, totalPicks]);
            
            return {
                weekly_score_id: result.insertId,
                entry_id: participant.entry_id,
                username: participant.username,
                total_points: totalPoints,
                games_correct: correctPicks,
                games_picked: totalPicks
            };
        });
        
        const results = await Promise.all(scorePromises);
        const validResults = results.filter(r => r !== null);
        
        console.log(`Calculated scores for ${validResults.length} participants`);
        return validResults.length;
    }
    
    /**
     * Step 2: Determine winners from stored weekly scores
     */
    static async determineWinners(leagueId, week, seasonYear, connection) {
        // Get league settings for tiebreaker
        const leagueSettings = await this.getLeagueSettings(leagueId, connection);
        
        // Get all weekly scores for this league/week, sorted by points
        const [weeklyScores] = await connection.execute(`
            SELECT 
                ws.*,
                u.username
            FROM weekly_scores ws
            JOIN league_entries le ON ws.entry_id = le.entry_id
            JOIN league_users lu ON le.league_user_id = lu.league_user_id
            JOIN users u ON lu.user_id = u.user_id
            WHERE lu.league_id = ? AND ws.week = ? AND ws.season_year = ?
            ORDER BY ws.total_points DESC, ws.games_correct DESC
        `, [leagueId, week, seasonYear]);
        
        if (weeklyScores.length === 0) {
            return [];
        }
        
        // Find the highest score(s)
        const maxScore = weeklyScores[0].total_points;
        const topScorers = weeklyScores.filter(score => score.total_points === maxScore);
        
        let winners = [];
        let tiebreakerUsed = false;
        
        if (topScorers.length === 1) {
            // Single winner - no tiebreaker needed
            winners = topScorers.map(scorer => ({
                ...scorer,
                tiebreaker_used: false,
                tiebreaker_guess: null,
                tiebreaker_diff: null
            }));
        } else {
            // Multiple users tied for first place - use tiebreaker if configured
            if (leagueSettings.primary_tiebreaker === 'mnf_total') {
                console.log(`Applying MNF tiebreaker for ${topScorers.length} tied participants...`);
                const tiebreakerResult = await this.resolveMNFTiebreaker(topScorers, week, seasonYear, connection);
                winners = tiebreakerResult.winners;
                tiebreakerUsed = true;
            } else {
                // No tiebreaker configured - all tied users are winners
                winners = topScorers.map(scorer => ({
                    ...scorer,
                    tiebreaker_used: false,
                    tiebreaker_guess: null,
                    tiebreaker_diff: null
                }));
            }
        }
        
        return winners;
    }
    
    /**
     * Step 3: Store winners in weekly_winners table and update flags
     */
    static async storeWinners(winners, leagueId, week, seasonYear, connection) {
        // Clear any existing winners for this league/week
        await connection.execute(`
            DELETE FROM weekly_winners
            WHERE league_id = ? AND week = ? AND season_year = ?
        `, [leagueId, week, seasonYear]);
        
        // Get MNF actual total for tiebreaker records
        const [mnfResult] = await connection.execute(`
            SELECT r.home_score, r.away_score, (r.home_score + r.away_score) as total_points
            FROM games g
            JOIN results r ON g.game_id = r.game_id
            WHERE g.week = ? AND g.season_year = ? AND r.final_status = 'final'
            ORDER BY g.kickoff_timestamp DESC
            LIMIT 1
        `, [week, seasonYear]);
        
        const actualMnfTotal = mnfResult[0]?.total_points || null;
        
        // Insert each winner
        for (const winner of winners) {
            await connection.execute(`
                INSERT INTO weekly_winners (
                    league_id, entry_id, weekly_score_id, week, season_year,
                    total_points, username, tiebreaker_used, tiebreaker_guess,
                    actual_mnf_total, tiebreaker_diff, is_tied_winner, tied_entries_count
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                leagueId,
                winner.entry_id,
                winner.weekly_score_id,
                week,
                seasonYear,
                winner.total_points,
                winner.username,
                winner.tiebreaker_used ? 1 : 0,
                winner.tiebreaker_guess || null,
                actualMnfTotal,
                winner.tiebreaker_diff || null,
                winners.length > 1 ? 1 : 0,
                winners.length
            ]);
        }
        
        // Update is_weekly_winner flags in weekly_scores
        const winnerIds = winners.map(w => w.weekly_score_id);
        if (winnerIds.length > 0) {
            await connection.execute(`
                UPDATE weekly_scores 
                SET is_weekly_winner = 1 
                WHERE weekly_score_id IN (${winnerIds.map(() => '?').join(',')})
            `, winnerIds);
        }
        
        console.log(`Stored ${winners.length} winner(s) successfully`);
    }
    
    /**
     * Resolve MNF tiebreaker by finding closest prediction to actual total
     */
    static async resolveMNFTiebreaker(tiedScorers, week, seasonYear, connection) {
        const entryIds = tiedScorers.map(scorer => scorer.entry_id);
        
        // Get tiebreaker predictions for tied participants
        const [tiebreakerResults] = await connection.execute(`
            SELECT entry_id, predicted_value
            FROM tiebreakers 
            WHERE entry_id IN (${entryIds.map(() => '?').join(',')}) 
            AND week = ? AND tiebreaker_type = 'mnf_total_points'
        `, [...entryIds, week]);
        
        // Get actual MNF total
        const [mnfResult] = await connection.execute(`
            SELECT r.home_score, r.away_score, (r.home_score + r.away_score) as total_points
            FROM games g
            JOIN results r ON g.game_id = r.game_id
            WHERE g.week = ? AND g.season_year = ? AND r.final_status = 'final'
            ORDER BY g.kickoff_timestamp DESC
            LIMIT 1
        `, [week, seasonYear]);
        
        const actualTotal = mnfResult[0]?.total_points;
        
        if (!actualTotal) {
            console.log('No MNF result found, all tied participants remain winners');
            return { winners: tiedScorers };
        }
        
        // Calculate differences for participants with tiebreaker predictions
        const tiebreakerParticipants = tiedScorers.map(scorer => {
            const prediction = tiebreakerResults.find(t => t.entry_id === scorer.entry_id);
            const difference = prediction ? Math.abs(prediction.predicted_value - actualTotal) : 999999;
            
            return {
                ...scorer,
                tiebreaker_used: true,
                tiebreaker_guess: prediction ? prediction.predicted_value : null,
                tiebreaker_diff: prediction ? difference : 999999
            };
        });
        
        // Find the smallest difference
        const minDifference = Math.min(...tiebreakerParticipants.map(p => p.tiebreaker_diff));
        const winners = tiebreakerParticipants.filter(p => p.tiebreaker_diff === minDifference);
        
        console.log(`MNF tiebreaker: actual=${actualTotal}, winners=${winners.length} (diff=${minDifference})`);
        
        return { winners };
    }
    
    /**
     * Get league settings for tiebreaker configuration
     */
    static async getLeagueSettings(leagueId, connection) {
        const [results] = await connection.execute(`
            SELECT cps.primary_tiebreaker, cps.secondary_tiebreaker, l.pick_method
            FROM confidence_pool_settings cps
            RIGHT JOIN leagues l ON cps.league_id = l.league_id
            WHERE l.league_id = ?
        `, [leagueId]);
        
        return results[0] || { primary_tiebreaker: null, secondary_tiebreaker: null, pick_method: 'straight_up' };
    }
    
    /**
     * Get weekly winners for a specific league and week
     */
    static async getWeeklyWinners(leagueId, week, seasonYear = new Date().getFullYear()) {
        try {
            const results = await database.execute(`
                SELECT 
                    ww.*,
                    u.username
                FROM weekly_winners ww
                JOIN league_entries le ON ww.entry_id = le.entry_id
                JOIN league_users lu ON le.league_user_id = lu.league_user_id
                JOIN users u ON lu.user_id = u.user_id
                WHERE ww.league_id = ? AND ww.week = ? AND ww.season_year = ?
                ORDER BY ww.total_points DESC
            `, [leagueId, week, seasonYear]);
            
            // Handle both array destructuring and direct results
            const rows = Array.isArray(results[0]) ? results[0] : results;
            return rows || [];
        } catch (error) {
            console.error('Error in getWeeklyWinners:', error);
            return [];
        }
    }
    
    /**
     * Get weekly winner entry IDs for a specific league and week
     */
    static async getWeeklyWinnerEntryIds(leagueId, week, seasonYear = new Date().getFullYear()) {
        try {
            const results = await database.execute(`
                SELECT entry_id
                FROM weekly_winners
                WHERE league_id = ? AND week = ? AND season_year = ?
            `, [leagueId, week, seasonYear]);
            
            // Handle both array destructuring and direct results
            const rows = Array.isArray(results[0]) ? results[0] : results;
            return (rows || []).map(row => row.entry_id);
        } catch (error) {
            console.error('Error in getWeeklyWinnerEntryIds:', error);
            return [];
        }
    }
    
    /**
     * Get all weekly wins for a user in a specific league (for dashboard)
     */
    static async getUserWeeklyWinsInLeague(userId, leagueId, seasonYear = new Date().getFullYear()) {
        try {
            const results = await database.execute(`
                SELECT 
                    ww.*,
                    ww.week,
                    ww.total_points
                FROM weekly_winners ww
                JOIN league_entries le ON ww.entry_id = le.entry_id
                JOIN league_users lu ON le.league_user_id = lu.league_user_id
                WHERE lu.user_id = ? AND ww.league_id = ? AND ww.season_year = ?
                ORDER BY ww.week
            `, [userId, leagueId, seasonYear]);
            
            // Handle both array destructuring and direct results
            const rows = Array.isArray(results[0]) ? results[0] : results;
            return rows || [];
        } catch (error) {
            console.error('Error in getUserWeeklyWinsInLeague:', error);
            return [];
        }
    }
    
    /**
     * Get all weekly wins for a user across all leagues (for dashboard)
     */
    static async getUserWeeklyWins(userId, seasonYear = new Date().getFullYear()) {
        try {
            const results = await database.execute(`
                SELECT 
                    ww.*,
                    ww.week,
                    ww.league_id,
                    ww.total_points,
                    l.league_name
                FROM weekly_winners ww
                JOIN league_entries le ON ww.entry_id = le.entry_id
                JOIN league_users lu ON le.league_user_id = lu.league_user_id
                JOIN leagues l ON ww.league_id = l.league_id
                WHERE lu.user_id = ? AND ww.season_year = ?
                ORDER BY ww.week, l.league_name
            `, [userId, seasonYear]);
            
            // Handle both array destructuring and direct results
            const rows = Array.isArray(results[0]) ? results[0] : results;
            return rows || [];
        } catch (error) {
            console.error('Error in getUserWeeklyWins:', error);
            return [];
        }
    }
}

module.exports = WeeklyWinnersService;