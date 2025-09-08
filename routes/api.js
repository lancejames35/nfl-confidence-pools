const express = require('express');
const router = express.Router();
const database = require('../config/database');
const authMiddleware = require('../middleware/auth');

router.use('/live-scores', authMiddleware.requireAuth, authMiddleware.loadUser, (req, res, next) => {
    // Lazy require to prevent startup crashes
    const liveScoresRoutes = require('./api/live-scores');
    liveScoresRoutes(req, res, next);
});

router.get('/status', (req, res) => {
    res.json({
        status: 'ok',
        message: 'API is running',
        version: '1.0.0',
        timestamp: new Date().toISOString()
    });
});

// Get pick count for a specific entry and week
router.get('/picks/count', async (req, res) => {
    try {
        const { entry_id, week } = req.query;
        
        if (!entry_id || !week) {
            return res.status(400).json({
                error: 'Missing required parameters: entry_id and week'
            });
        }
        
        // Count picks with team selections for this entry and week
        const [result] = await database.execute(
            `SELECT COUNT(*) as count 
             FROM picks 
             WHERE entry_id = ? AND week = ? AND selected_team IS NOT NULL AND selected_team != ''`,
            [entry_id, week]
        );
        
        res.json({
            count: result.count || 0,
            entry_id: parseInt(entry_id),
            week: parseInt(week)
        });
        
    } catch (error) {
        res.status(500).json({
            error: 'Internal server error',
            count: 0
        });
    }
});

// League chat endpoint (used by dashboard)
router.get('/league-chat', authMiddleware.requireAuth, authMiddleware.loadUser, async (req, res) => {
    try {
        // This endpoint appears to be unused/placeholder based on the frontend code
        res.json({ messages: [] });
    } catch (error) {
        res.status(500).json({ error: 'Error loading league chat' });
    }
});

// League invite endpoint (used by dashboard)
router.post('/league/invite', authMiddleware.requireAuth, authMiddleware.loadUser, async (req, res) => {
    try {
        // This endpoint appears to be unused/placeholder based on the frontend code
        res.json({ success: true, message: 'Invite functionality not yet implemented' });
    } catch (error) {
        res.status(500).json({ error: 'Error sending invite' });
    }
});

// Commissioner message endpoint (used by dashboard)
router.post('/commissioner/message', authMiddleware.requireAuth, authMiddleware.loadUser, async (req, res) => {
    try {
        // This endpoint appears to be unused/placeholder based on the frontend code
        res.json({ success: true, message: 'Message functionality moved to league-specific endpoints' });
    } catch (error) {
        res.status(500).json({ error: 'Error posting message' });
    }
});

module.exports = router;