const database = require('../config/database');
const GameResultsProcessor = require('../services/GameResultsProcessor');
const PickScoringService = require('../services/PickScoringService');

class ResultsController {
    /**
     * Display game results for a specific week showing all users' picks
     */
    static async weekResults(req, res) {
        try {
            const currentWeek = req.query.week || getCurrentNFLWeek();
            const seasonYear = req.query.season || new Date().getFullYear();
            const leagueId = req.params.league_id ? parseInt(req.params.league_id) : null;
            
            if (!leagueId) {
                req.flash('error', 'League ID is required for results');
                return res.redirect('/dashboard');
            }
            
            // Get league info and check access
            const leagueQuery = 'SELECT * FROM leagues WHERE league_id = ?';
            const [league] = await database.execute(leagueQuery, [leagueId]);
            
            if (!league) {
                req.flash('error', 'League not found');
                return res.redirect('/dashboard');
            }
            
            const hasAccess = await ResultsController.checkLeagueAccess(leagueId, req.user?.user_id);
            if (!hasAccess && league.privacy === 'private') {
                req.flash('error', 'You do not have access to this league');
                return res.redirect('/dashboard');
            }
            
            // Get league settings to determine pick method
            const leagueSettingsQuery = `
                SELECT l.pick_method, cps.pick_type
                FROM leagues l
                LEFT JOIN confidence_pool_settings cps ON l.league_id = cps.league_id
                WHERE l.league_id = ?
            `;
            const [leagueSettings] = await database.execute(leagueSettingsQuery, [leagueId]);
            const pickMethod = leagueSettings?.pick_method || league.pick_method || 'straight_up';

            // Get games for the week
            const gamesQuery = `
                SELECT 
                    g.*,
                    r.home_score,
                    r.away_score,
                    r.winning_team,
                    r.final_status as result_status,
                    r.current_quarter,
                    r.time_remaining,
                    home_team.abbreviation as home_team,
                    home_team.full_name as home_team_name,
                    away_team.abbreviation as away_team, 
                    away_team.full_name as away_team_name,
                    s.point_spread,
                    s.home_favorite
                FROM games g
                JOIN teams home_team ON g.home_team_id = home_team.team_id
                JOIN teams away_team ON g.away_team_id = away_team.team_id
                LEFT JOIN results r ON g.game_id = r.game_id
                LEFT JOIN spreads s ON g.game_id = s.game_id AND s.confidence_level = 'current'
                WHERE g.week = ? AND g.season_year = ?
                ORDER BY g.kickoff_timestamp
            `;
            
            const games = await database.execute(gamesQuery, [currentWeek, seasonYear]);
            
            // Get all league participants with tier information
            const participantsQuery = `
                SELECT DISTINCT
                    le.entry_id,
                    u.username,
                    u.user_id,
                    let.tier_name,
                    let.tier_id,
                    let.tier_description
                FROM league_entries le
                JOIN league_users lu ON le.league_user_id = lu.league_user_id
                JOIN users u ON lu.user_id = u.user_id
                LEFT JOIN league_user_tiers lut ON lu.league_user_id = lut.league_user_id
                LEFT JOIN league_entry_tiers let ON lut.tier_id = let.tier_id
                WHERE lu.league_id = ? AND le.status = 'active'
                ORDER BY u.username
            `;
            
            const participants = await database.execute(participantsQuery, [leagueId]);
            
            // Get all picks for this week and league with tier information
            // Apply visibility logic: show all picks for current user, only locked picks for others
            const picksQuery = `
                SELECT 
                    p.*,
                    le.entry_id,
                    u.username,
                    u.user_id,
                    let.tier_name,
                    let.tier_id,
                    g.kickoff_timestamp,
                    CASE 
                        WHEN CAST(u.user_id AS SIGNED) = CAST(? AS SIGNED) THEN 1
                        WHEN p.is_locked = 1 THEN 1
                        WHEN g.kickoff_timestamp <= NOW() THEN 1
                        ELSE 0
                    END as show_pick
                FROM picks p
                JOIN league_entries le ON p.entry_id = le.entry_id
                JOIN league_users lu ON le.league_user_id = lu.league_user_id
                JOIN users u ON lu.user_id = u.user_id
                JOIN games g ON p.game_id = g.game_id
                LEFT JOIN league_user_tiers lut ON lu.league_user_id = lut.league_user_id
                LEFT JOIN league_entry_tiers let ON lut.tier_id = let.tier_id
                WHERE lu.league_id = ? AND p.week = ?
                ORDER BY p.game_id, p.confidence_points DESC
            `;
            
            // Debug: log the user_id being passed
            const currentUserId = req.user?.user_id || req.user?.id || 0;
            console.log('DEBUG - Current user ID being passed:', currentUserId, 'Full req.user:', req.user);
            console.log('DEBUG - Query parameters:', { currentUserId, leagueId, currentWeek });
            console.log('DEBUG - Participants found:', participants.length);
            
            // Debug: log current user's entry_id in this league
            const currentUserParticipant = participants.find(p => p.user_id == currentUserId);
            console.log('DEBUG - Current user participant:', currentUserParticipant);
            
            const picks = await database.execute(picksQuery, [currentUserId, leagueId, currentWeek]);
            
            // Organize picks by game and calculate user totals dynamically
            const picksByGame = {};
            const userTotals = {};
            
            // Initialize user totals
            participants.forEach(participant => {
                userTotals[participant.entry_id] = {
                    ...participant,
                    totalPoints: 0,
                    correctPicks: 0,
                    totalPicks: 0,
                    picks: {}
                };
            });
            
            // Create game lookup map for scoring calculations
            const gameMap = new Map();
            games.forEach(game => gameMap.set(game.game_id, game));
            
            // Debug: log picks for current user
            const currentUserPicks = picks.filter(p => p.user_id == currentUserId);
            console.log(`DEBUG - Found ${currentUserPicks.length} picks for current user (ID: ${currentUserId})`);
            if (currentUserPicks.length > 0) {
                console.log('First few current user picks:', currentUserPicks.slice(0, 3).map(p => ({
                    game_id: p.game_id,
                    selected_team: p.selected_team,
                    confidence_points: p.confidence_points,
                    show_pick: p.show_pick,
                    user_id: p.user_id
                })));
            }

            // Process picks with dynamic scoring
            picks.forEach(pick => {
                // Organize by game - include all picks for game-level analysis
                if (!picksByGame[pick.game_id]) {
                    picksByGame[pick.game_id] = [];
                }
                picksByGame[pick.game_id].push(pick);
                
                // Calculate user totals dynamically
                if (userTotals[pick.entry_id]) {
                    // Get game data and calculate pick result dynamically
                    const game = gameMap.get(pick.game_id);
                    if (game) {
                        const pickResult = PickScoringService.calculatePickResult(pick, game, pickMethod);
                        
                        // Create enhanced pick object with dynamic calculation
                        const enhancedPick = {
                            ...pick,
                            is_correct: pickResult.isCorrect,
                            points_earned: pickResult.pointsEarned,
                            status: pickResult.status
                        };
                        
                        // Only add the pick to user's visible picks if it should be shown
                        if (pick.show_pick) {
                            userTotals[pick.entry_id].picks[pick.game_id] = enhancedPick;
                            // Debug: log when current user's pick is added
                            if (pick.user_id == currentUserId) {
                                console.log(`DEBUG - Added current user pick for game ${pick.game_id}:`, {
                                    selected_team: pick.selected_team,
                                    confidence_points: pick.confidence_points,
                                    show_pick: pick.show_pick
                                });
                            }
                        } else if (pick.user_id == currentUserId) {
                            console.log(`DEBUG - SKIPPED current user pick for game ${pick.game_id} because show_pick = ${pick.show_pick}`);
                        }
                        
                        // Only count games that have started toward record
                        const hasScores = game.home_score !== null && game.away_score !== null;
                        if (hasScores) {
                            userTotals[pick.entry_id].totalPicks += 1;
                            if (pickResult.isCorrect === 1) {  // Check for 1 instead of true
                                userTotals[pick.entry_id].correctPicks += 1;
                                userTotals[pick.entry_id].totalPoints += pickResult.pointsEarned;
                            }
                        }
                    } else {
                        // Fallback if game not found - only add if should be shown
                        if (pick.show_pick) {
                            userTotals[pick.entry_id].picks[pick.game_id] = pick;
                        }
                    }
                }
            });
            
            // Calculate season totals dynamically for each user
            const seasonTotalsPromises = participants.map(async (participant) => {
                const seasonTotals = await PickScoringService.calculateSeasonTotals(
                    participant.entry_id, 
                    leagueId, 
                    pickMethod
                );
                return { 
                    entry_id: participant.entry_id, 
                    ...seasonTotals 
                };
            });
            
            const seasonTotalsResults = await Promise.all(seasonTotalsPromises);
            const seasonTotalsMap = new Map();
            seasonTotalsResults.forEach(result => {
                seasonTotalsMap.set(result.entry_id, {
                    seasonPoints: result.seasonPoints || 0,
                    seasonPicks: result.seasonPicks || 0,
                    seasonCorrect: result.seasonCorrect || 0
                });
            });
            
            // Convert userTotals to sorted array and add season data
            const userResults = Object.values(userTotals).map(user => {
                const seasonData = seasonTotalsMap.get(user.entry_id) || { seasonPoints: 0, seasonPicks: 0, seasonCorrect: 0 };
                
                // Calculate possible points dynamically using the service
                const userPicks = Object.values(user.picks);
                const possiblePoints = PickScoringService.calculatePossiblePoints(userPicks, games);
                
                return {
                    ...user,
                    seasonPoints: seasonData.seasonPoints,
                    seasonPicks: seasonData.seasonPicks,
                    seasonCorrect: seasonData.seasonCorrect,
                    possiblePoints: possiblePoints
                };
            }).sort((a, b) => b.totalPoints - a.totalPoints);

            // Get MNF tiebreaker predictions if the league uses MNF as a tiebreaker
            const tiebreakerSettings = await ResultsController.getLeagueSettings(league.league_id);
            console.log('Tiebreaker settings:', tiebreakerSettings);
            if (tiebreakerSettings && (tiebreakerSettings.primary_tiebreaker === 'mnf_total' || tiebreakerSettings.secondary_tiebreaker === 'mnf_total')) {
                const entryIds = userResults.map(user => user.entry_id);
                console.log('Entry IDs for tiebreaker lookup:', entryIds);
                
                const tiebreakerQuery = `
                    SELECT entry_id, predicted_value
                    FROM tiebreakers
                    WHERE entry_id IN (${entryIds.map(() => '?').join(',')})
                    AND week = ?
                    AND tiebreaker_type = 'mnf_total_points'
                    AND is_active = 1
                `;
                
                try {
                    const [tiebreakers] = await database.execute(tiebreakerQuery, [...entryIds, currentWeek]);
                    console.log('Tiebreakers found:', tiebreakers);
                    const tiebreakerMap = {};
                    
                    // Ensure tiebreakers is always an array
                    const tiebreakerArray = Array.isArray(tiebreakers) ? tiebreakers : (tiebreakers ? [tiebreakers] : []);
                    
                    tiebreakerArray.forEach(tb => {
                        tiebreakerMap[tb.entry_id] = tb.predicted_value;
                    });
                    console.log('Tiebreaker map:', tiebreakerMap);
                    
                    // Add MNF predictions to user results
                    userResults.forEach(user => {
                        user.mnfPrediction = tiebreakerMap[user.entry_id] || null;
                        console.log(`User ${user.entry_id} MNF prediction: ${user.mnfPrediction}`);
                    });
                } catch (error) {
                    console.error('Error fetching tiebreakers:', error);
                    // Add null values if error occurs
                    userResults.forEach(user => {
                        user.mnfPrediction = null;
                    });
                }
            }
            
            // Add rankings
            let currentRank = 1;
            let previousPoints = null;
            userResults.forEach((user, index) => {
                if (previousPoints !== null && user.totalPoints < previousPoints) {
                    currentRank = index + 1;
                }
                user.rank = currentRank;
                previousPoints = user.totalPoints;
            });
            
            // Get tier summary for filtering (only if multi-tier is enabled)
            let tierSummary = null;
            if (league.enable_multi_tier) {
                tierSummary = ResultsController.getTierSummary(participants);
            }
            
            res.render('results/week-confidence', {
                title: `Week ${currentWeek} Results - ${league.league_name}`,
                league: { ...league, settings: tiebreakerSettings },
                currentWeek,
                seasonYear,
                games,
                picksByGame,
                userResults,
                tierSummary,
                user: req.user,
                mainClass: 'container-fluid my-4'
            });
            
        } catch (error) {
            req.flash('error', 'Error loading game results');
            res.redirect('/dashboard');
        }
    }
    
    /**
     * Display detailed results for a specific game
     */
    static async gameDetails(req, res) {
        try {
            const gameId = parseInt(req.params.game_id);
            const leagueId = req.params.league_id ? parseInt(req.params.league_id) : null;
            
            // Get game details with result
            const gameQuery = `
                SELECT 
                    g.*,
                    r.home_score,
                    r.away_score,
                    r.winning_team,
                    r.final_status as result_status,
                    r.updated_at as result_updated_at,
                    home_team.full_name as home_team_name,
                    home_team.primary_color as home_color,
                    home_team.color_secondary as home_color_secondary,
                    away_team.full_name as away_team_name,
                    away_team.primary_color as away_color,
                    away_team.color_secondary as away_color_secondary
                FROM games g
                JOIN teams home_team ON g.home_team_id = home_team.team_id
                JOIN teams away_team ON g.away_team_id = away_team.team_id
                LEFT JOIN results r ON g.game_id = r.game_id
                WHERE g.game_id = ?
            `;
            
            const [game] = await database.execute(gameQuery, [gameId]);
            
            if (!game) {
                req.flash('error', 'Game not found');
                return res.redirect('/results');
            }
            
            // Get league-specific picks if league ID provided
            let picks = [];
            let league = null;
            
            if (leagueId) {
                const leagueQuery = 'SELECT * FROM leagues WHERE league_id = ?';
                [league] = await database.execute(leagueQuery, [leagueId]);
                
                if (league) {
                    const hasAccess = await ResultsController.checkLeagueAccess(leagueId, req.user?.user_id);
                    if (hasAccess || league.privacy === 'public') {
                        const leaguePicksQuery = `
                            SELECT 
                                p.*,
                                u.username,
                                u.user_id,
                                g.kickoff_timestamp,
                                g.status as game_status,
                                CASE 
                                    WHEN CAST(u.user_id AS SIGNED) = CAST(? AS SIGNED) THEN 1
                                    WHEN p.is_locked = 1 THEN 1
                                    WHEN g.kickoff_timestamp <= NOW() THEN 1
                                    ELSE 0
                                END as show_pick
                            FROM picks p
                            JOIN league_entries le ON p.entry_id = le.entry_id
                            JOIN league_users lu ON le.league_user_id = lu.league_user_id
                            JOIN users u ON lu.user_id = u.user_id
                            JOIN games g ON p.game_id = g.game_id
                            WHERE p.game_id = ? AND lu.league_id = ?
                            ORDER BY p.confidence_points DESC, p.created_at ASC
                        `;
                        picks = await database.execute(leaguePicksQuery, [req.user?.user_id || 0, gameId, leagueId]);
                        
                        // Debug logging for pick visibility
                        console.log('Pick visibility debug:', {
                            currentUserId: req.user?.user_id,
                            gameId: gameId,
                            leagueId: leagueId,
                            picksCount: picks.length,
                            picks: picks.map(p => ({
                                username: p.username,
                                user_id: p.user_id,
                                is_locked: p.is_locked,
                                show_pick: p.show_pick,
                                kickoff_timestamp: p.kickoff_timestamp
                            }))
                        });
                    }
                }
            }
            
            // Calculate pick statistics
            const pickStats = this.calculatePickStats(picks, game);
            
            res.render('results/game', {
                title: `${game.away_team} @ ${game.home_team} - Game Results`,
                game,
                league,
                picks,
                pickStats,
                user: req.user
            });
        } catch (error) {
            req.flash('error', 'Error loading game details');
            res.redirect('/results');
        }
    }
    
    /**
     * Season results overview
     */
    static async seasonOverview(req, res) {
        try {
            const seasonYear = req.query.season || new Date().getFullYear();
            const leagueId = req.params.league_id ? parseInt(req.params.league_id) : null;
            
            // Get weekly summaries
            const weeklySummaries = [];
            for (let week = 1; week <= 18; week++) {
                const summary = await GameResultsProcessor.getWeekSummary(week, seasonYear);
                weeklySummaries.push(summary);
            }
            
            // Get overall season stats
            const seasonStatsQuery = `
                SELECT 
                    COUNT(DISTINCT g.game_id) as total_games,
                    COUNT(DISTINCT CASE WHEN g.status = 'completed' THEN g.game_id END) as completed_games,
                    COUNT(DISTINCT p.pick_id) as total_picks,
                    SUM(CASE WHEN p.is_correct = 1 THEN 1 ELSE 0 END) as correct_picks,
                    SUM(p.points_earned) as total_points_awarded,
                    AVG(CASE WHEN p.is_correct IS NOT NULL THEN p.confidence_points END) as avg_confidence
                FROM games g
                ${leagueId ? `
                LEFT JOIN picks p ON g.game_id = p.game_id 
                    AND p.entry_id IN (
                        SELECT le.entry_id 
                        FROM league_entries le 
                        JOIN league_users lu ON le.league_user_id = lu.league_user_id 
                        WHERE lu.league_id = ?
                    )
                ` : 'LEFT JOIN picks p ON g.game_id = p.game_id'}
                WHERE g.season_year = ?
            `;
            
            const queryParams = leagueId ? [leagueId, seasonYear] : [seasonYear];
            const [seasonStats] = await database.execute(seasonStatsQuery, queryParams);
            
            // Get league info if applicable
            let league = null;
            if (leagueId) {
                const leagueQuery = 'SELECT * FROM leagues WHERE league_id = ?';
                [league] = await database.execute(leagueQuery, [leagueId]);
            }
            
            res.render('results/season', {
                title: `${seasonYear} Season Results ${league ? '- ' + league.league_name : ''}`,
                seasonYear,
                league,
                weeklySummaries,
                seasonStats: {
                    ...seasonStats,
                    accuracy: seasonStats.total_picks > 0 ? 
                        (seasonStats.correct_picks / seasonStats.total_picks * 100).toFixed(2) : 0
                },
                user: req.user
            });
        } catch (error) {
            req.flash('error', 'Error loading season results');
            res.redirect('/');
        }
    }
    
    /**
     * Check if user has access to league
     */
    static async checkLeagueAccess(leagueId, userId) {
        if (!userId) return false;
        
        try {
            const query = `
                SELECT 1 FROM league_users 
                WHERE league_id = ? AND user_id = ?
            `;
            const [access] = await database.execute(query, [leagueId, userId]);
            return !!access;
        } catch (error) {
            return false;
        }
    }
    
    /**
     * Get league tiebreaker settings
     */
    static async getLeagueSettings(league_id) {
        try {
            const [settings] = await database.execute(`
                SELECT primary_tiebreaker, secondary_tiebreaker
                FROM confidence_pool_settings 
                WHERE league_id = ?
            `, [league_id]);
            
            return settings || null;
        } catch (error) {
            console.error('Error fetching league settings:', error);
            return null;
        }
    }

    /**
     * Get tier summary from participants
     */
    static getTierSummary(participants) {
        const tierMap = new Map();
        
        participants.forEach(participant => {
            if (participant.tier_name) {
                if (!tierMap.has(participant.tier_id)) {
                    tierMap.set(participant.tier_id, {
                        tier_id: participant.tier_id,
                        tier_name: participant.tier_name,
                        tier_description: participant.tier_description,
                        count: 0
                    });
                }
                tierMap.get(participant.tier_id).count++;
            }
        });
        
        return Array.from(tierMap.values()).sort((a, b) => a.tier_name.localeCompare(b.tier_name));
    }
    
    /**
     * Calculate pick statistics for a game
     */
    static calculatePickStats(picks, game) {
        if (!picks.length) return null;
        
        const homePicksCount = picks.filter(p => p.selected_team === game.home_team).length;
        const awayPicksCount = picks.filter(p => p.selected_team === game.away_team).length;
        const totalPicks = picks.length;
        
        const correctPicks = picks.filter(p => p.is_correct === 1);
        const incorrectPicks = picks.filter(p => p.is_correct === 0);
        
        const totalPointsEarned = picks.reduce((sum, p) => sum + (p.points_earned || 0), 0);
        const avgConfidence = picks.reduce((sum, p) => sum + p.confidence_points, 0) / totalPicks;
        
        return {
            totalPicks,
            homePicksCount,
            awayPicksCount,
            homePicksPercent: totalPicks > 0 ? (homePicksCount / totalPicks * 100).toFixed(1) : 0,
            awayPicksPercent: totalPicks > 0 ? (awayPicksCount / totalPicks * 100).toFixed(1) : 0,
            correctPicks: correctPicks.length,
            incorrectPicks: incorrectPicks.length,
            accuracy: totalPicks > 0 ? (correctPicks.length / totalPicks * 100).toFixed(1) : 0,
            totalPointsEarned,
            avgConfidence: avgConfidence.toFixed(1)
        };
    }
}

/**
 * Helper function to get current NFL week
 */
function getCurrentNFLWeek() {
    const seasonStart = new Date(new Date().getFullYear(), 8, 5); // Sept 5
    const now = new Date();
    const diffTime = Math.abs(now - seasonStart);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const week = Math.ceil(diffDays / 7);
    return Math.min(Math.max(1, week), 18); // NFL regular season is 18 weeks
}

module.exports = ResultsController;