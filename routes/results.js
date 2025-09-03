const express = require('express');
const router = express.Router();
const ResultsController = require('../controllers/ResultsController');

// Direct to results view - IMMEDIATE page render
router.get('/', async (req, res, next) => {
    try {
        const database = require('../config/database');
        const { getCurrentNFLWeek } = require('../utils/getCurrentWeek');
        
        // Make sure we have the correct user ID - it might be id instead of user_id
        const userId = req.user.id || req.user.user_id;
        
        // Get current week from database or use query param
        const currentWeek = req.query.week || await getCurrentNFLWeek(database) || 1;
        
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
            leagueQuery += ` ORDER BY (l.league_id = ?) DESC, l.created_at ASC`;
            queryParams = [userId, requestedLeagueId];
        } else {
            // Default order
            leagueQuery += ` ORDER BY l.created_at ASC`;
        }
        
        const [userLeagues] = await database.execute(leagueQuery, queryParams);
        
        // Convert to array if it's a single object
        const userLeaguesArray = Array.isArray(userLeagues) ? userLeagues : (userLeagues ? [userLeagues] : []);
        
        if (!userLeaguesArray || userLeaguesArray.length === 0) {
            // No leagues - show message
            return res.render('results/no-leagues', {
                title: 'Results',
                message: 'You need to join a league first to view results.'
            });
        }
        
        // Use league_id from query or default to first league
        const firstLeague = userLeaguesArray[0];
        if (!firstLeague || !firstLeague.league_id) {
            return res.render('results/no-leagues', {
                title: 'Results',
                message: 'Unable to load league data.'
            });
        }
        
        let leagueId = req.query.league_id || firstLeague.league_id;
        
        // Redirect to the proper results URL structure
        return res.redirect(`/results/league/${leagueId}?week=${currentWeek}`);
        
    } catch (error) {
        console.error('Results routing error:', error);
        next(error);
    }
});
router.get('/week/:week', (req, res) => {
    res.redirect(`/results?week=${req.params.week}`);
});
router.get('/season', ResultsController.seasonOverview);
router.get('/game/:game_id', ResultsController.gameDetails);

// League-specific results
router.get('/league/:league_id', ResultsController.weekResults);
router.get('/league/:league_id/week/:week', (req, res) => {
    res.redirect(`/results/league/${req.params.league_id}?week=${req.params.week}`);
});
router.get('/league/:league_id/season', ResultsController.seasonOverview);
router.get('/league/:league_id/game/:game_id', ResultsController.gameDetails);

module.exports = router;