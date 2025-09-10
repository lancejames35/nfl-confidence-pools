const database = require('../config/database');
const GameResultsProcessor = require('../services/GameResultsProcessor');
const PickScoringService = require('../services/PickScoringService');
const { getCurrentNFLWeek, getDefaultWeekForUIWithWinnerCalculation } = require('../utils/getCurrentWeek');

class ResultsController {
    /**
     * Display game results for a specific week showing all users' picks
     */
    static async weekResults(req, res) {
        try {
            const currentWeek = req.query.week || await getDefaultWeekForUIWithWinnerCalculation(database);
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
                    g.kickoff_timestamp as kickoff_raw,
                    1 as show_pick
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
            
            // Prepare user parameters for pick visibility
            const currentUserId = req.user?.user_id || req.user?.id || 0;
            
            
            // Find current user's participation in this league
            const currentUserParticipant = participants.find(p => p.user_id == currentUserId);
            
            const picks = await database.execute(picksQuery, [leagueId, currentWeek]);
            
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
            
            // Filter picks for current user analysis
            const currentUserPicks = picks.filter(p => p.user_id == currentUserId);

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
                        
                        // Check if game is locked - no timezone adjustment needed as database timestamp is already converted
                        const kickoffTime = new Date(pick.kickoff_timestamp);
                        const currentTime = new Date();
                        const isGameLocked = currentTime >= kickoffTime;
                        
                        
                        // Show picks based on visibility rules:
                        // 1. Always show current user's own picks
                        // 2. Show other users' picks only if pick is locked (which happens at game kickoff)
                        const shouldShowPick = (pick.user_id == currentUserId) || isGameLocked;
                        
                        if (shouldShowPick) {
                            userTotals[pick.entry_id].picks[pick.game_id] = enhancedPick;
                        }
                        
                        // Only count final or live games toward record (not future games)
                        const hasScores = game.home_score !== null && game.away_score !== null;
                        const gameFinished = game.result_status === 'final';
                        const gameInProgress = hasScores && !gameFinished && (game.status === 'in_progress' || game.result_status === 'in_progress');
                        const shouldCountGame = gameFinished || gameInProgress;
                        
                        if (shouldCountGame && shouldShowPick) {
                            userTotals[pick.entry_id].totalPicks += 1;
                            if (pickResult.isCorrect === 1) {  // Check for 1 instead of true
                                userTotals[pick.entry_id].correctPicks += 1;
                                userTotals[pick.entry_id].totalPoints += pickResult.pointsEarned;
                            }
                        }
                    } else {
                        // Fallback if game not found - apply same visibility rules
                        const kickoffTime = new Date(pick.kickoff_timestamp);
                        const currentTime = new Date();
                        const isGameLocked = currentTime >= kickoffTime;
                        
                        const shouldShowPick = (pick.user_id == currentUserId) || isGameLocked;
                        if (shouldShowPick) {
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
                
                // Calculate possible points based on visibility rules:
                // For current user: use all their picks
                // For other users: use full week total minus visible losses only
                let possiblePoints;
                
                if (user.user_id == currentUserId) {
                    // Current user: calculate normally from their visible picks
                    const userPicks = Object.values(user.picks);
                    possiblePoints = PickScoringService.calculatePossiblePoints(userPicks, games);
                } else {
                    // Other users: start with theoretical max (sum 1-16) minus visible losses
                    const totalGames = games.length;
                    const theoreticalMax = (totalGames * (totalGames + 1)) / 2; // Sum of 1+2+3...+n
                    
                    let lossDeductions = 0;
                    Object.values(user.picks).forEach(pick => {
                        // Only subtract points for visible games where they lost
                        if (pick.is_correct === 0) {
                            lossDeductions += pick.confidence_points || 0;
                        }
                    });
                    
                    possiblePoints = theoreticalMax - lossDeductions;
                }
                
                return {
                    ...user,
                    seasonPoints: seasonData.seasonPoints,
                    seasonPicks: seasonData.seasonPicks,
                    seasonCorrect: seasonData.seasonCorrect,
                    possiblePoints: possiblePoints
                };
            }).sort((a, b) => {
                // Check if any user has weekly points scored yet
                const hasWeeklyScores = Object.values(userTotals).some(user => user.totalPoints > 0);
                
                if (hasWeeklyScores) {
                    // Use weekly points sorting (current behavior)
                    return b.totalPoints - a.totalPoints;
                } else {
                    // Fallback to season points sorting when no weekly scores yet
                    return b.seasonPoints - a.seasonPoints;
                }
            });

            // Get MNF tiebreaker predictions if the league uses MNF as a tiebreaker
            const tiebreakerSettings = await ResultsController.getLeagueSettings(league.league_id);
            // Loaded tiebreaker settings for league
            if (tiebreakerSettings && (tiebreakerSettings.primary_tiebreaker === 'mnf_total' || tiebreakerSettings.secondary_tiebreaker === 'mnf_total')) {
                const entryIds = userResults.map(user => user.entry_id);
                // Gathering entry IDs for tiebreaker lookup
                
                // First, get the last game's kickoff time for this week
                const lastGameQuery = `
                    SELECT MAX(kickoff_timestamp) as last_kickoff
                    FROM games 
                    WHERE week = ? AND season_year = (SELECT season_year FROM leagues WHERE league_id = ?)
                `;
                
                const [lastGameResult] = await database.execute(lastGameQuery, [currentWeek, leagueId]);
                const lastGameKickoff = lastGameResult?.last_kickoff;
                const lastGameHasStarted = lastGameKickoff && new Date(lastGameKickoff) <= new Date();
                
                
                const tiebreakerQuery = `
                    SELECT t.entry_id, t.predicted_value, u.user_id
                    FROM tiebreakers t
                    JOIN league_entries le ON t.entry_id = le.entry_id
                    JOIN league_users lu ON le.league_user_id = lu.league_user_id
                    JOIN users u ON lu.user_id = u.user_id
                    WHERE t.entry_id IN (${entryIds.map(() => '?').join(',')})
                    AND t.week = ?
                    AND t.tiebreaker_type = 'mnf_total_points'
                    AND t.is_active = 1
                `;
                
                try {
                    
                    const tiebreakerResults = await database.execute(tiebreakerQuery, [...entryIds, currentWeek]);
                    const tiebreakers = tiebreakerResults;
                    
                    const tiebreakerMap = {};
                    
                    // Ensure tiebreakers is always an array
                    const tiebreakerArray = Array.isArray(tiebreakers) ? tiebreakers : (tiebreakers ? [tiebreakers] : []);
                    
                    tiebreakerArray.forEach(tb => {
                        
                        // Show tiebreaker if:
                        // 1. It's the current user's own tiebreaker, OR
                        // 2. The last game of the week has started
                        const isCurrentUser = (tb.user_id == currentUserId);
                        const shouldShow = isCurrentUser || lastGameHasStarted;
                        
                        if (shouldShow) {
                            tiebreakerMap[tb.entry_id] = tb.predicted_value;
                        }
                    });
                    // Built tiebreaker mapping
                    
                    
                    // Add MNF predictions to user results
                    userResults.forEach(user => {
                        const tiebreakerValue = tiebreakerMap[user.entry_id] || null;
                        user.mnfPrediction = tiebreakerValue;
                        
                    });
                } catch (error) {
                    // Error fetching tiebreakers
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
                tierSummary = await ResultsController.getTierSummary(leagueId, participants);
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
                        
                        // Pick visibility determined for game details
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
            // Error fetching league settings
            return null;
        }
    }

    /**
     * Get tier summary from participants
     */
    static async getTierSummary(leagueId, participants) {
        try {
            // Get tier order from database (same as StandingsController)
            const query = `
                SELECT 
                    let.tier_id,
                    let.tier_name,
                    let.tier_order,
                    let.tier_description
                FROM league_entry_tiers let
                WHERE let.league_id = ? AND let.is_active = 1
                ORDER BY let.tier_order ASC
            `;
            
            const tiers = await database.execute(query, [leagueId]);
            
            // Count participants for each tier
            const tierMap = new Map();
            participants.forEach(participant => {
                if (participant.tier_name) {
                    if (!tierMap.has(participant.tier_id)) {
                        tierMap.set(participant.tier_id, 0);
                    }
                    tierMap.set(participant.tier_id, tierMap.get(participant.tier_id) + 1);
                }
            });
            
            // Build tier summary with proper ordering
            return tiers.map(tier => ({
                tier_id: tier.tier_id,
                tier_name: tier.tier_name,
                tier_description: tier.tier_description,
                tier_order: tier.tier_order,
                count: tierMap.get(tier.tier_id) || 0
            }));
            
        } catch (error) {
            // Fallback to old method if database query fails
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

// getCurrentNFLWeek is now imported from utils/getCurrentWeek

module.exports = ResultsController;