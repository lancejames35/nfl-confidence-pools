const express = require('express');
const router = express.Router();
const StandingsController = require('../controllers/StandingsController');

// Direct to standings - no intermediate page
router.get('/', async (req, res) => {
    try {
        const database = require('../config/database');
        const userId = req.user.user_id;
        
        // Check if a specific league was requested
        const requestedLeagueId = req.query.league_id ? parseInt(req.query.league_id) : null;
        
        // Get the user's league memberships
        let leagueQuery = `
            SELECT 
                l.*,
                le.entry_id,
                lu.league_user_id
             FROM leagues l
             JOIN league_users lu ON l.league_id = lu.league_id
             LEFT JOIN league_entries le ON lu.league_user_id = le.league_user_id AND le.status = 'active'
             WHERE lu.user_id = ? AND lu.status = 'active' AND l.status = 'active'
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
        
        // Convert to array if necessary
        const leaguesArray = Array.isArray(userLeagues) ? userLeagues : (userLeagues ? [userLeagues] : []);
        
        // Use the prioritized league (first in result)
        let leagueId = null;
        if (leaguesArray.length > 0) {
            leagueId = leaguesArray[0].league_id;
        }
        
        if (!leagueId) {
            return res.redirect('/dashboard?message=join-first');
        }
        
        // Redirect to league-specific standings
        return res.redirect(`/standings/${leagueId}`);
    } catch (error) {
        console.error('Standings routing error:', error);
        res.redirect('/dashboard');
    }
});

// League standings
router.get('/:league_id', StandingsController.index);

// API endpoint for live standings
router.get('/api/:league_id', StandingsController.getStandingsAPI);

module.exports = router;