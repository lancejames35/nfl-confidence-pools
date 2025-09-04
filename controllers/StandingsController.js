const database = require('../config/database');
const League = require('../models/League');
const GameResultsProcessor = require('../services/GameResultsProcessor');

class StandingsController {
    /**
     * Display league standings
     */
    static async index(req, res) {
        try {
            const leagueId = parseInt(req.params.league_id);
            const currentWeek = req.query.week || getCurrentNFLWeek();
            const view = req.query.view || 'grid'; // grid (new weekly table), overall, weekly (old views)
            
            // Get league info
            const league = await League.findById(leagueId);
            if (!league) {
                req.flash('error', 'League not found');
                return res.redirect('/leagues');
            }
            
            // Check if user is member
            const isMember = await League.isUserMember(leagueId, req.user.user_id);
            if (!isMember && league.privacy === 'private') {
                req.flash('error', 'You do not have access to this league');
                return res.redirect('/leagues');
            }
            
            let standings = [];
            let weeklyStats = null;
            let weeklyTotals = null;
            
            if (view === 'grid') {
                // Get weekly totals for grid view
                weeklyTotals = await StandingsController.getWeeklyTotals(leagueId);
                
                // Get tier information for multi-tier leagues
                let tierInfo = null;
                if (league.enable_multi_tier) {
                    tierInfo = await StandingsController.getTierSummary(leagueId);
                }
                
                res.render('standings/grid', {
                    title: `${league.league_name} - Standings`,
                    league,
                    weeklyTotals,
                    tierInfo,
                    currentWeek,
                    view,
                    isMember,
                    user: req.user
                });
                return;
            } else if (view === 'weekly') {
                standings = await StandingsController.getWeeklyStandings(leagueId, currentWeek);
                weeklyStats = await StandingsController.getWeekStats(leagueId, currentWeek);
            } else {
                standings = await StandingsController.getOverallStandings(leagueId);
            }
            
            // Get recent activity
            const recentActivity = await StandingsController.getRecentActivity(leagueId, 10);
            
            // Get tier information for multi-tier leagues
            let tierInfo = null;
            if (league.enable_multi_tier) {
                tierInfo = await StandingsController.getTierSummary(leagueId);
            }
            
            
            res.render('standings/index', {
                title: `${league.league_name} - Standings`,
                league,
                standings,
                weeklyStats,
                recentActivity,
                tierInfo,
                currentWeek,
                view,
                isMember,
                user: req.user,
                mainClass: 'container-fluid my-4'
            });
        } catch (error) {
            req.flash('error', 'Error loading standings');
            res.redirect('/leagues');
        }
    }
    
    /**
     * Get overall season standings - OPTIMIZED
     */
    static async getOverallStandings(leagueId) {
        try {
            const currentWeek = getCurrentNFLWeek();
            
            // Optimized single query using window functions and CTEs
            const optimizedQuery = `
                WITH weekly_stats AS (
                    SELECT 
                        entry_id,
                        week,
                        SUM(points_earned) as weekly_points,
                        SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as weekly_correct,
                        COUNT(pick_id) as weekly_picks,
                        SUM(CASE WHEN is_correct = 1 THEN confidence_points ELSE 0 END) as correct_confidence_sum,
                        SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as correct_count
                    FROM picks
                    GROUP BY entry_id, week
                ),
                user_aggregates AS (
                    SELECT 
                        le.entry_id,
                        u.username,
                        u.user_id,
                        let.tier_name,
                        let.tier_id,
                        let.tier_order,
                        let.tier_description,
                        let.entry_fee,
                        let.eligible_for_weekly,
                        let.eligible_for_season_total,
                        let.eligible_for_bonuses,
                        lut.payment_status,
                        
                        -- Season totals
                        COALESCE(SUM(ws.weekly_points), 0) as total_points,
                        COALESCE(SUM(ws.weekly_correct), 0) as correct_picks,
                        COALESCE(SUM(ws.weekly_picks), 0) as total_picks,
                        COUNT(DISTINCT ws.week) as weeks_played,
                        
                        -- Averages and stats
                        COALESCE(AVG(ws.weekly_points), 0) as avg_weekly_points,
                        COALESCE(STDDEV(ws.weekly_points), 0) as consistency_score,
                        COALESCE(MAX(ws.weekly_points), 0) as best_week_points,
                        COALESCE(SUM(ws.correct_confidence_sum) / NULLIF(SUM(ws.correct_count), 0), 0) as avg_correct_confidence,
                        
                        -- Current week performance
                        COALESCE(SUM(CASE WHEN ws.week = ? THEN ws.weekly_points ELSE 0 END), 0) as current_week_points,
                        COALESCE(SUM(CASE WHEN ws.week = ? THEN ws.weekly_correct ELSE 0 END), 0) as current_week_correct,
                        COALESCE(SUM(CASE WHEN ws.week = ? THEN ws.weekly_picks ELSE 0 END), 0) as current_week_picks,
                        
                        -- Recent performance (last 3 weeks)
                        COALESCE(AVG(CASE WHEN ws.week >= ? - 2 THEN ws.weekly_points ELSE NULL END), 0) as recent_avg_points
                        
                    FROM league_entries le
                    JOIN league_users lu ON le.league_user_id = lu.league_user_id
                    JOIN users u ON lu.user_id = u.user_id
                    LEFT JOIN league_user_tiers lut ON lu.league_user_id = lut.league_user_id
                    LEFT JOIN league_entry_tiers let ON lut.tier_id = let.tier_id
                    LEFT JOIN weekly_stats ws ON le.entry_id = ws.entry_id
                    
                    WHERE lu.league_id = ? AND le.status = 'active'
                    GROUP BY le.entry_id, u.username, u.user_id, let.tier_name, let.tier_id, let.tier_order, let.tier_description, let.entry_fee, let.eligible_for_weekly, let.eligible_for_season_total, let.eligible_for_bonuses, lut.payment_status
                )
                SELECT 
                    *,
                    ROW_NUMBER() OVER (ORDER BY total_points DESC, correct_picks DESC, avg_correct_confidence DESC) as position
                FROM user_aggregates
                ORDER BY total_points DESC, correct_picks DESC, avg_correct_confidence DESC
            `;
            
            const standings = await database.execute(optimizedQuery, [
                currentWeek, currentWeek, currentWeek, currentWeek, leagueId
            ]);
            
            // Add calculated fields
            return standings.map((entry) => ({
                ...entry,
                accuracy: entry.total_picks > 0 ? 
                    ((entry.correct_picks / entry.total_picks) * 100).toFixed(1) : '0.0',
                current_week_accuracy: entry.current_week_picks > 0 ? 
                    ((entry.current_week_correct / entry.current_week_picks) * 100).toFixed(1) : '0.0',
                consistency_rank: StandingsController.calculateConsistencyRank(entry.consistency_score, standings)
            }));
        } catch (error) {
            throw error;
        }
    }
    
    /**
     * Get weekly standings for specific week
     */
    static async getWeeklyStandings(leagueId, week) {
        try {
            const query = `
                SELECT 
                    le.entry_id,
                    u.username,
                    u.user_id,
                    COUNT(p.pick_id) as week_picks,
                    SUM(CASE WHEN p.is_correct = 1 THEN 1 ELSE 0 END) as week_correct,
                    SUM(p.points_earned) as week_points,
                    MAX(CASE WHEN p.is_correct = 1 THEN p.confidence_points ELSE 0 END) as best_pick,
                    MIN(CASE WHEN p.is_correct = 0 THEN p.confidence_points ELSE NULL END) as worst_miss,
                    AVG(CASE WHEN p.is_correct = 1 THEN p.confidence_points ELSE NULL END) as avg_correct_confidence,
                    
                    -- Overall season totals for context
                    overall.total_points as season_total,
                    overall.total_correct as season_correct,
                    overall.total_picks as season_picks
                    
                FROM league_entries le
                JOIN league_users lu ON le.league_user_id = lu.league_user_id
                JOIN users u ON lu.user_id = u.user_id
                LEFT JOIN picks p ON le.entry_id = p.entry_id AND p.week = ?
                
                -- Overall season stats
                LEFT JOIN (
                    SELECT 
                        entry_id,
                        SUM(points_earned) as total_points,
                        SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as total_correct,
                        COUNT(*) as total_picks
                    FROM picks
                    GROUP BY entry_id
                ) overall ON le.entry_id = overall.entry_id
                
                WHERE lu.league_id = ?
                GROUP BY le.entry_id, u.username, u.user_id
                ORDER BY week_points DESC, week_correct DESC, avg_correct_confidence DESC
            `;
            
            const standings = await database.execute(query, [week, leagueId]);
            
            return standings.map((entry, index) => ({
                ...entry,
                position: index + 1,
                week_accuracy: entry.week_picks > 0 ? 
                    ((entry.week_correct / entry.week_picks) * 100).toFixed(1) : 0,
                season_accuracy: entry.season_picks > 0 ? 
                    ((entry.season_correct / entry.season_picks) * 100).toFixed(1) : 0
            }));
        } catch (error) {
            throw error;
        }
    }
    
    /**
     * Get week statistics
     */
    static async getWeekStats(leagueId, week) {
        try {
            const query = `
                SELECT 
                    COUNT(DISTINCT le.entry_id) as total_entries,
                    COUNT(p.pick_id) as total_picks,
                    SUM(CASE WHEN p.is_correct = 1 THEN 1 ELSE 0 END) as total_correct,
                    SUM(p.points_earned) as total_points,
                    AVG(p.confidence_points) as avg_confidence,
                    MAX(p.points_earned) as highest_single_pick,
                    
                    -- Game-by-game breakdown
                    COUNT(DISTINCT p.game_id) as games_with_picks,
                    
                    -- Most popular picks
                    popular_picks.most_popular_team,
                    popular_picks.pick_count as most_popular_count
                    
                FROM league_entries le
                JOIN league_users lu ON le.league_user_id = lu.league_user_id
                LEFT JOIN picks p ON le.entry_id = p.entry_id AND p.week = ?
                
                -- Most popular team pick
                LEFT JOIN (
                    SELECT 
                        p2.selected_team as most_popular_team,
                        COUNT(*) as pick_count
                    FROM picks p2
                    JOIN league_entries le2 ON p2.entry_id = le2.entry_id
                    JOIN league_users lu2 ON le2.league_user_id = lu2.league_user_id
                    WHERE p2.week = ? AND lu2.league_id = ?
                    GROUP BY p2.selected_team
                    ORDER BY pick_count DESC
                    LIMIT 1
                ) popular_picks ON 1=1
                
                WHERE lu.league_id = ?
            `;
            
            const [stats] = await database.execute(query, [week, week, leagueId, leagueId]);
            
            return {
                ...stats,
                accuracy: stats.total_picks > 0 ? 
                    ((stats.total_correct / stats.total_picks) * 100).toFixed(1) : 0,
                avg_points_per_entry: stats.total_entries > 0 ? 
                    (stats.total_points / stats.total_entries).toFixed(1) : 0
            };
        } catch (error) {
            throw error;
        }
    }
    
    /**
     * Get recent activity for the league
     */
    static async getRecentActivity(leagueId, limit = 10) {
        try {
            const query = `
                SELECT 
                    'pick_result' as activity_type,
                    p.result_updated_at as activity_time,
                    u.username,
                    p.selected_team,
                    p.confidence_points,
                    p.points_earned,
                    p.is_correct,
                    home_team.abbreviation as home_team,
                    away_team.abbreviation as away_team,
                    g.week
                FROM picks p
                JOIN league_entries le ON p.entry_id = le.entry_id
                JOIN league_users lu ON le.league_user_id = lu.league_user_id
                JOIN users u ON lu.user_id = u.user_id
                JOIN games g ON p.game_id = g.game_id
                JOIN teams home_team ON g.home_team_id = home_team.team_id
                JOIN teams away_team ON g.away_team_id = away_team.team_id
                WHERE lu.league_id = ?
                AND p.result_updated_at IS NOT NULL
                AND p.is_correct IS NOT NULL
                ORDER BY p.result_updated_at DESC
                LIMIT ?
            `;
            
            const activities = await database.execute(query, [leagueId, limit]);
            
            return activities.map(activity => ({
                ...activity,
                description: StandingsController.generateActivityDescription(activity)
            }));
        } catch (error) {
            return [];
        }
    }
    
    /**
     * Generate human-readable activity description
     */
    static generateActivityDescription(activity) {
        const result = activity.is_correct ? 'won' : 'lost';
        const points = activity.is_correct ? `+${activity.points_earned}` : '0';
        
        return `${activity.username} ${result} ${activity.confidence_points} points on ${activity.selected_team} (${activity.away_team} @ ${activity.home_team}) - ${points} pts`;
    }
    
    /**
     * Calculate consistency rank based on standard deviation
     */
    static calculateConsistencyRank(stddev, allStandings) {
        if (!stddev) return 'N/A';
        
        const stddevs = allStandings
            .map(s => s.consistency_score)
            .filter(s => s !== null && s !== undefined)
            .sort((a, b) => a - b);
        
        const rank = stddevs.indexOf(stddev) + 1;
        const total = stddevs.length;
        
        return `${rank}/${total}`;
    }
    
    /**
     * Get weekly totals for grid view (all weeks, all users) - OPTIMIZED
     */
    static async getWeeklyTotals(leagueId) {
        try {
            // Single optimized query that gets all user data and weekly totals
            const optimizedQuery = `
                SELECT 
                    le.entry_id,
                    u.username,
                    u.user_id,
                    let.tier_id,
                    let.tier_name,
                    let.tier_order,
                    let.tier_description,
                    
                    -- Weekly aggregated data using JSON
                    COALESCE(GROUP_CONCAT(
                        DISTINCT CONCAT(weekly_stats.week, ':', weekly_stats.week_points, ':', weekly_stats.week_correct, ':', weekly_stats.week_picks)
                        ORDER BY weekly_stats.week
                        SEPARATOR ','
                    ), '') as weekly_data,
                    
                    -- Season totals
                    COALESCE(SUM(weekly_stats.week_points), 0) as seasonTotal,
                    COALESCE(SUM(weekly_stats.week_correct), 0) as seasonCorrect,
                    COALESCE(SUM(weekly_stats.week_picks), 0) as seasonPicks
                    
                FROM league_entries le
                JOIN league_users lu ON le.league_user_id = lu.league_user_id
                JOIN users u ON lu.user_id = u.user_id
                LEFT JOIN league_user_tiers lut ON lu.league_user_id = lut.league_user_id
                LEFT JOIN league_entry_tiers let ON lut.tier_id = let.tier_id
                LEFT JOIN (
                    SELECT 
                        entry_id,
                        week,
                        SUM(points_earned) as week_points,
                        SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as week_correct,
                        COUNT(pick_id) as week_picks
                    FROM picks
                    WHERE week BETWEEN 1 AND 18
                    GROUP BY entry_id, week
                ) weekly_stats ON le.entry_id = weekly_stats.entry_id
                
                WHERE lu.league_id = ? AND le.status = 'active'
                GROUP BY le.entry_id, u.username, u.user_id, let.tier_id, let.tier_name, let.tier_order, let.tier_description
                ORDER BY seasonTotal DESC, seasonCorrect DESC, u.username
            `;
            
            const results = await database.execute(optimizedQuery, [leagueId]);
            
            // Process the results into the expected format
            const processedUsers = results.map((row, index) => {
                // Initialize weeks structure
                const weeks = {};
                for (let week = 1; week <= 18; week++) {
                    weeks[week] = { points: 0, correct: 0, picks: 0 };
                }
                
                // Parse weekly data from the concatenated string
                if (row.weekly_data) {
                    const weeklyEntries = row.weekly_data.split(',');
                    weeklyEntries.forEach(entry => {
                        const [week, points, correct, picks] = entry.split(':');
                        if (week && weeks[parseInt(week)]) {
                            weeks[parseInt(week)] = {
                                points: parseInt(points) || 0,
                                correct: parseInt(correct) || 0,
                                picks: parseInt(picks) || 0
                            };
                        }
                    });
                }
                
                return {
                    entry_id: row.entry_id,
                    username: row.username,
                    user_id: row.user_id,
                    tier_id: row.tier_id,
                    tier_name: row.tier_name,
                    tier_order: row.tier_order,
                    weeks: weeks,
                    seasonTotal: parseInt(row.seasonTotal) || 0,
                    seasonCorrect: parseInt(row.seasonCorrect) || 0,
                    seasonPicks: parseInt(row.seasonPicks) || 0,
                    rank: index + 1 // Since we already ordered by seasonTotal DESC
                };
            });
            
            return processedUsers;
        } catch (error) {
            throw error;
        }
    }
    
    /**
     * API endpoint for live standings
     */
    static async getStandingsAPI(req, res) {
        try {
            const leagueId = parseInt(req.params.league_id);
            const week = req.query.week || getCurrentNFLWeek();
            const type = req.query.type || 'overall';
            
            let standings;
            if (type === 'weekly') {
                standings = await StandingsController.getWeeklyStandings(leagueId, week);
            } else {
                standings = await StandingsController.getOverallStandings(leagueId);
            }
            
            res.json({
                success: true,
                standings,
                week,
                type,
                lastUpdated: new Date()
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
    
    /**
     * Get tier summary information for multi-tier leagues
     */
    static async getTierSummary(leagueId) {
        try {
            const query = `
                SELECT 
                    let.tier_id,
                    let.tier_name,
                    let.tier_order,
                    let.tier_description,
                    let.entry_fee,
                    let.eligible_for_weekly,
                    let.eligible_for_season_total,
                    let.eligible_for_bonuses,
                    COUNT(DISTINCT lut.league_user_id) as participant_count,
                    SUM(CASE WHEN lut.payment_status = 'paid' THEN 1 ELSE 0 END) as paid_count,
                    SUM(let.entry_fee) as total_prize_pool
                FROM league_entry_tiers let
                LEFT JOIN league_user_tiers lut ON let.tier_id = lut.tier_id
                LEFT JOIN league_users lu ON lut.league_user_id = lu.league_user_id
                WHERE let.league_id = ? AND let.is_active = 1
                GROUP BY let.tier_id, let.tier_name, let.tier_order, let.tier_description, let.entry_fee, let.eligible_for_weekly, let.eligible_for_season_total, let.eligible_for_bonuses
                ORDER BY let.tier_order ASC
            `;
            
            const result = await database.execute(query, [leagueId]);
            // For this database setup, result is directly the array of rows
            return result || [];
        } catch (error) {
            // Error getting tier summary - return empty array for fallback
            return [];
        }
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

module.exports = StandingsController;