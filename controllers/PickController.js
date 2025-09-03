const Pick = require('../models/Pick');
const League = require('../models/League');
const { validationResult } = require('express-validator');
const database = require('../config/database');

class PickController {
    /**
     * Display picks dashboard for user
     */
    static async index(req, res) {
        try {
            // Get user's active leagues with their entries
            const query = `
                SELECT 
                    l.*,
                    lu.role,
                    lu.status as member_status,
                    le.entry_id,
                    le.team_name,
                    le.status as entry_status,
                    le.created_at as entry_created_at
                FROM leagues l
                JOIN league_users lu ON l.league_id = lu.league_id
                LEFT JOIN league_entries le ON lu.league_user_id = le.league_user_id AND le.status = 'active'
                WHERE lu.user_id = ? AND lu.status = 'active' AND l.status = 'active'
                ORDER BY l.created_at DESC, le.created_at ASC
            `;
            
            const results = await database.execute(query, [req.user.user_id]);
            
            // Group results by league
            const leaguesMap = new Map();
            results.forEach(row => {
                if (!leaguesMap.has(row.league_id)) {
                    leaguesMap.set(row.league_id, {
                        league_id: row.league_id,
                        league_name: row.league_name,
                        description: row.description,
                        status: row.status,
                        season_year: row.season_year,
                        pool_type: row.pool_type,
                        entry_fee: row.entry_fee,
                        max_entries: row.max_entries,
                        max_participants: row.max_participants,
                        role: row.role,
                        member_status: row.member_status,
                        entries: []
                    });
                }
                
                if (row.entry_id) {
                    leaguesMap.get(row.league_id).entries.push({
                        entry_id: row.entry_id,
                        team_name: row.team_name,
                        status: row.entry_status,
                        created_at: row.entry_created_at
                    });
                }
            });
            
            const userLeagues = Array.from(leaguesMap.values());
            
            res.render('picks/index', {
                title: 'My Picks',
                leagues: userLeagues,
                user: req.user,
                currentWeek: getCurrentNFLWeek()
            });
        } catch (error) {
            req.flash('error', 'Error loading picks dashboard');
            res.redirect('/dashboard');
        }
    }

    /**
     * Show pick selection interface for a specific league/week
     */
    static async makePicks(req, res) {
        try {
            let { league_id, entry_id } = req.params;
            const week = req.query.week || getCurrentNFLWeek();
            
            // Verify user has access to this entry
            const league = await League.findById(league_id);
            if (!league) {
                req.flash('error', 'League not found');
                return res.redirect('/picks');
            }
            
            const isMember = await League.isUserMember(league_id, req.user.user_id);
            if (!isMember) {
                req.flash('error', 'You are not a member of this league');
                return res.redirect('/picks');
            }

            // Get confidence pool settings for tiebreaker info
            let settings = {};
            try {
                const [confidenceSettings] = await database.execute(`
                    SELECT primary_tiebreaker, secondary_tiebreaker
                    FROM confidence_pool_settings 
                    WHERE league_id = ?
                `, [league_id]);
                
                if (confidenceSettings) {
                    settings = confidenceSettings;
                }
            } catch (error) {
                console.error('Error fetching confidence pool settings:', error);
                settings = {
                    primary_tiebreaker: 'mnf_total',
                    secondary_tiebreaker: 'highest_confidence_correct'
                };
            }
            
            // Handle 'new' entry_id by finding/creating the user's entry for this league
            if (entry_id === 'new') {
                
                const entryQuery = `
                    SELECT le.entry_id 
                    FROM league_entries le
                    JOIN league_users lu ON le.league_user_id = lu.league_user_id
                    WHERE lu.league_id = ? AND lu.user_id = ? AND le.status = 'active'
                    LIMIT 1
                `;
                const [existingEntry] = await database.execute(entryQuery, [league_id, req.user.user_id]);
                
                
                if (existingEntry && existingEntry[0]) {
                    // User already has an entry, redirect to it
                    const foundEntryId = existingEntry[0].entry_id;
                    return res.redirect(`/picks/${league_id}/${foundEntryId}?week=${week}`);
                } else {
                    // Create new entry for user
                    const userQuery = `SELECT league_user_id FROM league_users WHERE league_id = ? AND user_id = ?`;
                    const [leagueUser] = await database.execute(userQuery, [league_id, req.user.user_id]);
                    
                    if (!leagueUser || !leagueUser[0]) {
                        req.flash('error', 'You are not a member of this league');
                        return res.redirect('/picks');
                    }
                    
                    const [maxEntry] = await database.execute(
                        `SELECT COALESCE(MAX(entry_number), 0) + 1 as next_number
                         FROM league_entries le
                         JOIN league_users lu ON le.league_user_id = lu.league_user_id
                         WHERE lu.league_id = ?`,
                        [league_id]
                    );
                    
                    const entryNumber = maxEntry[0]?.next_number || 1;
                    
                    const [createResult] = await database.execute(
                        `INSERT INTO league_entries (league_user_id, entry_number, status, created_at) 
                         VALUES (?, ?, 'active', NOW())`,
                        [leagueUser[0].league_user_id, entryNumber]
                    );
                    
                    entry_id = createResult.insertId;
                    return res.redirect(`/picks/${league_id}/${entry_id}?week=${week}`);
                }
            }
            
            // Get available games for the week
            const rawGames = await Pick.getAvailableGames(week, league.season_year);
            
            // Transform games to include spread data in expected format
            const games = rawGames.map(game => {
                const transformedGame = { ...game };
                
                // Add spread-specific fields if spread data exists
                if (game.point_spread) {
                    transformedGame.spread_amount = Math.abs(game.point_spread);
                    // Determine favored team based on home_favorite flag
                    transformedGame.favored_team = game.home_favorite ? game.home_team : game.away_team;
                }
                
                return transformedGame;
            });
            
            // Lock any picks for games that have started (for per-game deadlines)
            await Pick.lockStartedGames(entry_id, week);
            
            // Get existing picks if any
            const existingPicks = await Pick.getWeeklyPicks(entry_id, week);
            
            // Check if picks can be edited (week-level)
            const canEdit = await Pick.canEditPicks(entry_id, week);
            
            
            // Get draft picks if any
            const draftPicks = await Pick.getDraftPicks(entry_id, week);
            
            // For per-game leagues, check individual game editability
            let gameEditStatus = {};
            
            
            if (league.pick_method === 'confidence' || league.pool_type === 'confidence') {
                // Get league deadline settings to check if it's per-game
                const settingsQuery = `
                    SELECT pick_deadline_type, custom_deadline_minutes
                    FROM confidence_pool_settings 
                    WHERE league_id = ?
                `;
                const settingsResult = await database.execute(settingsQuery, [league_id]);
                const settings = settingsResult[0]; // Get first row if it exists
                
                
                if (settings && settings.pick_deadline_type === 'per_game') {
                    // Check individual game editability
                    for (const game of games) {
                        gameEditStatus[game.game_id] = await Pick.canEditGame(entry_id, game.game_id);
                    }
                }
            }

            // Load existing tiebreaker value for this entry/week
            let tiebreakerValue = null;
            try {
                const [tiebreaker] = await database.execute(`
                    SELECT predicted_value
                    FROM tiebreakers
                    WHERE entry_id = ? AND week = ? AND tiebreaker_type = 'mnf_total_points'
                    AND is_active = 1
                `, [entry_id, week]);
                
                if (tiebreaker) {
                    tiebreakerValue = tiebreaker.predicted_value;
                }
            } catch (error) {
                console.error('Error fetching tiebreaker value:', error);
            }
            
            res.render('picks/make', {
                title: `Week ${week} Picks - ${league.league_name}`,
                league: { ...league, settings },
                entry_id,
                week,
                games,
                existingPicks,
                draftPicks,
                canEdit,
                gameEditStatus,
                tiebreakerValue,
                user: req.user
            });
        } catch (error) {
            req.flash('error', 'Error loading pick interface');
            res.redirect('/picks');
        }
    }

    /**
     * Save picks for a week
     */
    static async savePicks(req, res) {
        try {
            const { league_id, entry_id } = req.params;
            const { week, picks, tiebreaker_prediction } = req.body;
            
            // Debug logging
            console.log('DEBUG PICK SAVE - Parameters:', { 
                league_id, 
                entry_id, 
                week, 
                user_id: req.user.user_id,
                picks_count: picks?.length,
                has_tiebreaker: tiebreaker_prediction !== undefined
            });
            console.log('DEBUG PICK SAVE - First few picks:', picks?.slice(0, 3));
            
            // Validate user has access
            const isMember = await League.isUserMember(league_id, req.user.user_id);
            if (!isMember) {
                return res.status(403).json({ 
                    success: false, 
                    error: 'Access denied' 
                });
            }
            
            // Validate picks
            const validation = await Pick.validatePicks(entry_id, week, picks);
            if (!validation.valid) {
                return res.status(400).json({ 
                    success: false, 
                    errors: validation.errors 
                });
            }
            
            // Lock any picks for games that have started (using proper league-aware logic)
            await Pick.lockStartedGames(entry_id, week);
            
            // Save picks
            const result = await Pick.savePicks(entry_id, week, picks);
            
            // Save tiebreaker prediction if provided
            if (tiebreaker_prediction !== undefined && tiebreaker_prediction !== '') {
                try {
                    // First try to update existing record
                    const updateResult = await database.execute(`
                        UPDATE tiebreakers 
                        SET predicted_value = ?,
                            tiebreaker_rank = 1,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE entry_id = ? 
                          AND week = ? 
                          AND tiebreaker_type = 'mnf_total_points'
                          AND is_active = 1
                    `, [parseInt(tiebreaker_prediction), entry_id, week]);
                    
                    // If no rows were updated, insert a new record
                    if (updateResult.affectedRows === 0) {
                        await database.execute(`
                            INSERT INTO tiebreakers (entry_id, week, tiebreaker_type, predicted_value, question, is_active, tiebreaker_rank)
                            VALUES (?, ?, 'mnf_total_points', ?, 'Monday Night Football Total Points', 1, 1)
                        `, [entry_id, week, parseInt(tiebreaker_prediction)]);
                    }
                } catch (tiebreakerError) {
                    console.error('Error saving tiebreaker:', tiebreakerError);
                    // Don't fail the entire save for tiebreaker issues
                }
            }
            
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.json(result);
            }
            
            req.flash('success', 'Picks saved successfully');
            res.redirect(`/picks/${league_id}/${entry_id}?week=${week}`);
        } catch (error) {
            
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(500).json({ 
                    success: false, 
                    error: 'Error saving picks' 
                });
            }
            
            req.flash('error', 'Error saving picks');
            res.redirect('back');
        }
    }

    /**
     * Auto-save draft picks (AJAX endpoint)
     */
    static async autoSave(req, res) {
        try {
            const { entry_id } = req.params;
            const { week, picks, tiebreaker_prediction } = req.body;
            
            console.log('AutoSave called:', { entry_id, week, picks: picks?.length, tiebreaker_prediction });
            
            // Use the same logic as regular save instead of draft
            const result = await Pick.savePicks(entry_id, week, picks);
            
            // Save tiebreaker prediction if provided
            console.log('Tiebreaker value received:', tiebreaker_prediction, 'Type:', typeof tiebreaker_prediction);
            if (tiebreaker_prediction !== undefined && tiebreaker_prediction !== '') {
                try {
                    const entryIdInt = parseInt(entry_id);
                    const weekInt = parseInt(week);
                    const predictionValue = parseFloat(tiebreaker_prediction);
                    
                    console.log('Saving tiebreaker - entry_id:', entryIdInt, 'week:', weekInt, 'value:', predictionValue);
                    
                    // First try to update existing record (whether tiebreaker_rank is NULL or 1)
                    const updateResult = await database.execute(`
                        UPDATE tiebreakers 
                        SET predicted_value = ?,
                            tiebreaker_rank = 1,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE entry_id = ? 
                          AND week = ? 
                          AND tiebreaker_type = 'mnf_total_points'
                          AND is_active = 1
                    `, [predictionValue, entryIdInt, weekInt]);
                    
                    // If no rows were updated, insert a new record
                    if (updateResult.affectedRows === 0) {
                        const tiebreakerResult = await database.execute(`
                            INSERT INTO tiebreakers (entry_id, week, tiebreaker_type, predicted_value, question, is_active, tiebreaker_rank)
                            VALUES (?, ?, 'mnf_total_points', ?, 'Monday Night Football Total Points', 1, 1)
                        `, [entryIdInt, weekInt, predictionValue]);
                        console.log('Tiebreaker inserted:', tiebreakerResult);
                    } else {
                        console.log('Tiebreaker updated:', updateResult);
                    }
                } catch (tiebreakerError) {
                    console.error('Error saving tiebreaker - Full error:', tiebreakerError);
                    console.error('Error details:', tiebreakerError.message, tiebreakerError.code);
                    // Don't fail the entire autosave for tiebreaker issues
                }
            }
            
            res.json(result);
        } catch (error) {
            res.status(500).json({ 
                success: false, 
                error: 'Auto-save failed' 
            });
        }
    }

    /**
     * View picks for a specific week (read-only)
     */
    static async viewPicks(req, res) {
        try {
            const { league_id, entry_id } = req.params;
            const week = req.query.week || getCurrentNFLWeek();
            
            const league = await League.findById(league_id);
            if (!league) {
                req.flash('error', 'League not found');
                return res.redirect('/picks');
            }
            
            // Get picks with game details
            const picks = await Pick.getWeeklyPicks(entry_id, week);
            
            // Get pick statistics
            const stats = await Pick.getPickStats(entry_id, week);
            
            res.render('picks/view', {
                title: `Week ${week} Picks`,
                league,
                entry_id,
                week,
                picks,
                stats,
                user: req.user
            });
        } catch (error) {
            req.flash('error', 'Error loading picks');
            res.redirect('/picks');
        }
    }

    /**
     * View all picks for a league/week (commissioner view)
     */
    static async leaguePicks(req, res) {
        try {
            const { league_id } = req.params;
            const week = req.query.week || getCurrentNFLWeek();
            
            const league = await League.findById(league_id);
            if (!league) {
                req.flash('error', 'League not found');
                return res.redirect('/picks');
            }
            
            // Check if user is member
            const isMember = await League.isUserMember(league_id, req.user.user_id);
            if (!isMember) {
                req.flash('error', 'You are not a member of this league');
                return res.redirect('/picks');
            }
            
            // Get all picks for the league/week
            const leaguePicks = await Pick.getLeagueWeekPicks(league_id, week);
            
            // Group picks by entry
            const picksByEntry = {};
            leaguePicks.forEach(pick => {
                if (!picksByEntry[pick.entry_id]) {
                    picksByEntry[pick.entry_id] = {
                        entry_id: pick.entry_id,
                        team_name: pick.team_name,
                        username: pick.username,
                        picks: []
                    };
                }
                picksByEntry[pick.entry_id].picks.push(pick);
            });
            
            res.render('picks/league', {
                title: `Week ${week} - League Picks`,
                league,
                week,
                picksByEntry: Object.values(picksByEntry),
                user: req.user
            });
        } catch (error) {
            req.flash('error', 'Error loading league picks');
            res.redirect('/picks');
        }
    }

    /**
     * Get pick history for an entry
     */
    static async history(req, res) {
        try {
            const { entry_id } = req.params;
            
            // Get all picks for this entry
            const query = `
                SELECT 
                    p.*,
                    g.week,
                    home.abbreviation as home_team,
                    away.abbreviation as away_team,
                    r.home_score,
                    r.away_score,
                    r.winning_team
                FROM picks p
                JOIN games g ON p.game_id = g.game_id
                JOIN teams home ON g.home_team_id = home.team_id
                JOIN teams away ON g.away_team_id = away.team_id
                LEFT JOIN results r ON g.game_id = r.game_id
                WHERE p.entry_id = ?
                ORDER BY g.week DESC, p.confidence_points DESC
            `;
            
            const picks = await database.execute(query, [entry_id]);
            
            // Group by week
            const picksByWeek = {};
            picks.forEach(pick => {
                if (!picksByWeek[pick.week]) {
                    picksByWeek[pick.week] = [];
                }
                picksByWeek[pick.week].push(pick);
            });
            
            res.render('picks/history', {
                title: 'Pick History',
                picksByWeek,
                entry_id,
                user: req.user
            });
        } catch (error) {
            req.flash('error', 'Error loading pick history');
            res.redirect('/picks');
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

module.exports = PickController;
module.exports.getCurrentNFLWeek = getCurrentNFLWeek;