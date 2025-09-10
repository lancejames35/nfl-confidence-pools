const express = require('express');
const router = express.Router();
const PickController = require('../controllers/PickController');

// Direct to pick-making interface - IMMEDIATE page render
router.get('/', async (req, res, next) => {
    try {
        const database = require('../config/database');
        const { getDefaultWeekForUI } = require('../utils/getCurrentWeek');
        
        // Make sure we have the correct user ID - it might be id instead of user_id
        const userId = req.user.id || req.user.user_id;
        
        // Get current week from database or use query param
        const currentWeek = req.query.week || await getDefaultWeekForUI(database) || 1;
        
        // Check if a specific league was requested
        const requestedLeagueId = req.query.league_id ? parseInt(req.query.league_id) : null;
        
        // Get the user's league memberships
        let leagueQuery = `
            SELECT lu.*, l.* 
            FROM league_users lu
            JOIN leagues l ON lu.league_id = l.league_id
            WHERE lu.user_id = ?
        `;
        let queryParams = [userId];
        
        if (requestedLeagueId) {
            // Prioritize the requested league
            leagueQuery += ` ORDER BY (l.league_id = ?) DESC, l.created_at ASC LIMIT 1`;
            queryParams = [userId, requestedLeagueId];
        } else {
            // Default order
            leagueQuery += ` ORDER BY l.created_at ASC LIMIT 1`;
        }
        
        const [leagueMemberships] = await database.execute(leagueQuery, queryParams);
        
        // Convert to array if it's a single object
        const leagueMembershipsArray = Array.isArray(leagueMemberships) ? leagueMemberships : (leagueMemberships ? [leagueMemberships] : []);
        
        if (!leagueMembershipsArray || leagueMembershipsArray.length === 0) {
            return res.render('picks/no-leagues', {
                title: 'Make Picks',
                message: 'You need to join a league first to make picks.'
            });
        }
        
        const membership = leagueMembershipsArray[0];
        
        // Now get the entry if it exists - check if league_user_id exists
        let entries = [];
        if (membership && membership.league_user_id) {
            const [entryResults] = await database.execute(
                `SELECT * FROM league_entries 
                 WHERE league_user_id = ?
                 LIMIT 1`,
                [membership.league_user_id]
            );
            entries = entryResults;
        }
        
        // Convert entries to array if it's a single object
        const entriesArray = Array.isArray(entries) ? entries : (entries ? [entries] : []);
        
        // Combine the data
        const leagues = [{
            ...membership,
            entry_id: entriesArray[0]?.entry_id || null,
            team_name: entriesArray[0]?.team_name || null
        }];
        
        
        if (!leagues || leagues.length === 0) {
            // No leagues - show message
            return res.render('picks/no-leagues', {
                title: 'Make Picks',
                message: 'You need to join a league first to make picks.'
            });
        }
        
        const league = leagues[0];
        
        if (!league) {
            // No valid league data
            return res.render('picks/no-leagues', {
                title: 'Make Picks',
                message: 'Unable to load league data. Please try again.'
            });
        }
        
        if (!league.entry_id) {
            // Auto-create entry for the user
            
            // Get the next entry number for this league
            const [maxEntry] = await database.execute(
                `SELECT COALESCE(MAX(entry_number), 0) + 1 as next_number
                 FROM league_entries le
                 JOIN league_users lu ON le.league_user_id = lu.league_user_id
                 WHERE lu.league_id = ?`,
                [league.league_id]
            );
            
            const entryNumber = maxEntry[0]?.next_number || 1;
            
            const [createResult] = await database.execute(
                `INSERT INTO league_entries (league_user_id, entry_number, status, created_at) 
                 VALUES (?, ?, 'active', NOW())`,
                [league.league_user_id, entryNumber]
            );
            
            // Update the league object with the new entry_id
            league.entry_id = createResult.insertId;
        }
        
        // Redirect to the proper picks URL structure
        return res.redirect(`/picks/${league.league_id}/${league.entry_id}?week=${currentWeek}`);
        
    } catch (error) {
        console.error('Picks routing error:', error);
        next(error);
    }
});

// Auto-save draft picks (AJAX endpoint) - Must come before generic routes  
router.post('/entry/:entry_id/autosave', PickController.autoSave);

// Reset unlocked picks (AJAX endpoint)
router.post('/entry/:entry_id/reset', PickController.resetPicks);

// Show pick selection interface for a specific league/week
router.get('/:league_id/:entry_id', PickController.makePicks);

// Save picks for a week
router.post('/:league_id/:entry_id', PickController.savePicks);
router.put('/:league_id/:entry_id', PickController.savePicks);

// View picks for a specific week (read-only)
router.get('/:league_id/:entry_id/view', PickController.viewPicks);

// View all picks for a league/week (commissioner view)
router.get('/league/:league_id', PickController.leaguePicks);

// Get pick history for an entry
router.get('/history/:entry_id', PickController.history);

// Debug route to check what data is available
router.get('/debug', async (req, res) => {
    try {
        const database = require('../config/database');
        
        // Get user info
        const user = req.user;
        
        // Run the same query as the index method
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
        
        const results = await database.execute(query, [user.user_id]);
        
        // Get some games too
        const games = await database.execute(`
            SELECT game_id, week, home_team, away_team, kickoff_timestamp, status
            FROM games 
            WHERE season_year = 2025 AND week = 1
            ORDER BY kickoff_timestamp
            LIMIT 5
        `);
        
        res.json({
            user: user,
            queryResults: results,
            sampleGames: games,
            debug: {
                resultsCount: results.length,
                gamesCount: games.length,
                message: results.length === 0 ? 'No leagues/entries found for this user' : 'Data found'
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;