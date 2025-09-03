const database = require('../config/database');

/**
 * Service for calculating pick correctness and scoring in real-time
 * Handles both straight-up and against-spread calculations
 */
class PickScoringService {
    /**
     * Calculate pick correctness and points for a single pick
     * @param {Object} pick - Pick object with selected_team, confidence_points, etc.
     * @param {Object} game - Game object with results and spread info
     * @param {string} pickType - 'straight_up' or 'against_spread'
     * @returns {Object} - { isCorrect: boolean, pointsEarned: number, status: string }
     */
    static calculatePickResult(pick, game, pickType = 'straight_up') {
        // Check if game has started and has scores
        const hasScores = game.home_score !== null && game.away_score !== null;
        const gameFinished = game.result_status === 'final';
        const gameInProgress = hasScores && !gameFinished;
        
        // If game hasn't started or has no scores yet, return pending
        if (!hasScores) {
            return {
                isCorrect: null,  // null for pending (template checks for this)
                pointsEarned: 0,
                status: 'pending'
            };
        }

        let isCorrect = false;
        let currentLeader = null;
        
        // Determine current leader or if tied
        const homeScore = parseFloat(game.home_score) || 0;
        const awayScore = parseFloat(game.away_score) || 0;
        
        if (homeScore > awayScore) {
            currentLeader = game.home_team;
        } else if (awayScore > homeScore) {
            currentLeader = game.away_team;
        } else {
            // Tied game - stay pending for live games, or use winning_team for final games
            if (gameInProgress) {
                return {
                    isCorrect: null,  // null for pending (template checks for this)
                    pointsEarned: 0,
                    status: 'pending'
                };
            } else if (gameFinished) {
                // Use official winning team for final tied games (overtime, etc.)
                currentLeader = game.winning_team;
            }
        }
        
        if (pickType === 'straight_up') {
            // For live games, use current leader; for final games, use official winner or current leader
            const teamToCompare = (gameFinished && game.winning_team) ? game.winning_team : currentLeader;
            isCorrect = pick.selected_team === teamToCompare;
        } else if (pickType === 'against_spread') {
            // Against the spread calculation (works for both live and final)
            isCorrect = this.calculateAgainstSpread(pick, game);
        }

        return {
            isCorrect: isCorrect ? 1 : 0,  // Convert boolean to integer for template compatibility
            pointsEarned: isCorrect ? (pick.confidence_points || 0) : 0,
            status: isCorrect ? 'correct' : 'incorrect'
        };
    }

    /**
     * Calculate if a pick is correct against the spread
     * @param {Object} pick - Pick with selected_team
     * @param {Object} game - Game with scores and spread data
     * @returns {boolean}
     */
    static calculateAgainstSpread(pick, game) {
        if (!game.point_spread || game.point_spread === null) {
            // If no spread, fall back to straight up
            return pick.selected_team === game.winning_team;
        }

        const homeScore = parseFloat(game.home_score) || 0;
        const awayScore = parseFloat(game.away_score) || 0;
        const spread = parseFloat(game.point_spread) || 0;
        const homeFavorite = game.home_favorite === 1;

        let homeSpreadResult, awaySpreadResult;
        
        if (homeFavorite) {
            // Home team favored by spread points
            homeSpreadResult = homeScore - spread;
            awaySpreadResult = awayScore;
        } else {
            // Away team favored by spread points  
            homeSpreadResult = homeScore;
            awaySpreadResult = awayScore - spread;
        }

        // Determine winner against spread
        let winnerATS;
        if (homeSpreadResult > awaySpreadResult) {
            winnerATS = game.home_team;
        } else if (awaySpreadResult > homeSpreadResult) {
            winnerATS = game.away_team;
        } else {
            // Push - treat as incorrect for confidence pools
            return false;
        }

        return pick.selected_team === winnerATS;
    }

    /**
     * Calculate totals for a user's picks for a specific week
     * @param {Array} picks - Array of pick objects for the week
     * @param {Array} games - Array of game objects with results
     * @param {string} pickType - 'straight_up' or 'against_spread'
     * @returns {Object} - Week totals and pick details
     */
    static calculateWeekTotals(picks, games, pickType = 'straight_up') {
        const gameMap = new Map();
        games.forEach(game => gameMap.set(game.game_id, game));

        let totalPoints = 0;
        let correctPicks = 0;
        let totalPicks = 0;  // Only count games that have started
        let possiblePoints = 0;
        const pickResults = {};

        picks.forEach(pick => {
            const game = gameMap.get(pick.game_id);
            if (!game) return;

            const result = this.calculatePickResult(pick, game, pickType);
            
            pickResults[pick.game_id] = {
                ...pick,
                ...result
            };

            // Only count games that have started (have scores) toward record
            const hasScores = game.home_score !== null && game.away_score !== null;
            if (hasScores) {
                totalPicks++;
                if (result.isCorrect === 1) {  // Check for 1 instead of true
                    correctPicks++;
                    totalPoints += result.pointsEarned;
                }
            }

            // Add to possible points regardless of game status
            possiblePoints += pick.confidence_points || 0;
        });

        return {
            totalPoints,
            correctPicks,
            totalPicks,
            possiblePoints,
            pickResults,
            winPercentage: totalPicks > 0 ? (correctPicks / totalPicks * 100) : 0
        };
    }

    /**
     * Calculate season totals for a user across all weeks
     * @param {number} entryId - User's entry ID
     * @param {number} leagueId - League ID
     * @param {string} pickType - 'straight_up' or 'against_spread'
     * @returns {Object} - Season totals
     */
    static async calculateSeasonTotals(entryId, leagueId, pickType = 'straight_up') {
        try {
            // Get all picks for this entry
            const picksQuery = `
                SELECT p.*, g.week, g.season_year, g.game_id
                FROM picks p
                JOIN games g ON p.game_id = g.game_id
                JOIN league_entries le ON p.entry_id = le.entry_id
                JOIN league_users lu ON le.league_user_id = lu.league_user_id
                WHERE p.entry_id = ? AND lu.league_id = ?
                ORDER BY g.week, g.game_id
            `;
            
            const picks = await database.execute(picksQuery, [entryId, leagueId]);

            // Get all relevant games with results
            const gameIds = picks.map(p => p.game_id);
            if (gameIds.length === 0) {
                return { seasonPoints: 0, seasonPicks: 0, seasonCorrect: 0 };
            }

            const gamesQuery = `
                SELECT g.*, 
                       r.home_score, r.away_score, r.winning_team, r.final_status as result_status,
                       s.point_spread, s.home_favorite,
                       ht.abbreviation as home_team, at.abbreviation as away_team
                FROM games g
                LEFT JOIN results r ON g.game_id = r.game_id
                LEFT JOIN spreads s ON g.game_id = s.game_id AND s.confidence_level = 'current'
                JOIN teams ht ON g.home_team_id = ht.team_id
                JOIN teams at ON g.away_team_id = at.team_id
                WHERE g.game_id IN (${gameIds.map(() => '?').join(',')})
            `;

            const games = await database.execute(gamesQuery, gameIds);
            const gameMap = new Map();
            games.forEach(game => gameMap.set(game.game_id, game));

            // Calculate season totals
            let seasonPoints = 0;
            let seasonCorrect = 0;
            let seasonPicks = 0;

            picks.forEach(pick => {
                const game = gameMap.get(pick.game_id);
                if (!game) return;

                const result = this.calculatePickResult(pick, game, pickType);
                
                // Only count games that have started (have scores) toward record
                const hasScores = game.home_score !== null && game.away_score !== null;
                if (hasScores) {
                    seasonPicks++;
                    if (result.isCorrect === 1) {  // Check for 1 instead of true
                        seasonCorrect++;
                        seasonPoints += result.pointsEarned;
                    }
                }
            });

            return {
                seasonPoints,
                seasonPicks,
                seasonCorrect,
                seasonWinPercentage: seasonPicks > 0 ? (seasonCorrect / seasonPicks * 100) : 0
            };
            
        } catch (error) {
            console.error('Error calculating season totals:', error);
            return { seasonPoints: 0, seasonPicks: 0, seasonCorrect: 0, seasonWinPercentage: 0 };
        }
    }

    /**
     * Calculate possible points remaining for a user
     * @param {Array} picks - User's picks for the week
     * @param {Array} games - Games for the week
     * @returns {number} - Maximum possible points if all remaining games are correct
     */
    static calculatePossiblePoints(picks, games) {
        const gameMap = new Map();
        games.forEach(game => gameMap.set(game.game_id, game));

        let currentPoints = 0;
        let remainingPoints = 0;

        picks.forEach(pick => {
            const game = gameMap.get(pick.game_id);
            if (!game) return;

            const result = this.calculatePickResult(pick, game);
            
            if (result.isCorrect === 1) {
                // Pick is currently correct (final game or live game with clear leader)
                currentPoints += pick.confidence_points || 0;
            } else if (result.isCorrect === null) {
                // Pick is pending (no scores yet, or tied live game)
                remainingPoints += pick.confidence_points || 0;
            }
            // If result.isCorrect === 0, the pick is wrong and contributes 0 points
        });

        return currentPoints + remainingPoints;
    }
}

module.exports = PickScoringService;