const express = require('express');
const router = express.Router();
const database = require('../config/database');

// Chat landing page - redirect to user's most recent league chat
router.get('/', async (req, res) => {
    try {
        const userId = req.user.user_id;

        // Get user's leagues ordered by recent chat activity, then by membership date
        const userLeagues = await database.execute(`
            SELECT 
                l.league_id,
                l.league_name,
                lu.role,
                (l.commissioner_id = ?) as is_commissioner,
                (SELECT cm.sent_at 
                 FROM chat_messages cm 
                 WHERE cm.league_id = l.league_id 
                 AND cm.is_deleted = 0
                 ORDER BY cm.sent_at DESC 
                 LIMIT 1) as last_message_at,
                lu.joined_at
            FROM leagues l
            JOIN league_users lu ON l.league_id = lu.league_id
            WHERE lu.user_id = ? AND lu.status = 'active'
            ORDER BY last_message_at DESC, lu.joined_at DESC
        `, [userId, userId]);

        if (userLeagues.length === 0) {
            // User has no leagues
            req.flash('info', 'You need to join a league to access chat');
            return res.redirect('/leagues');
        }

        // Redirect to the most recent/active league's chat
        return res.redirect(`/leagues/${userLeagues[0].league_id}/chat`);

    } catch (error) {
        console.error('Error loading chat page:', error);
        req.flash('error', 'Error loading chat');
        res.redirect('/dashboard');
    }
});

module.exports = router;