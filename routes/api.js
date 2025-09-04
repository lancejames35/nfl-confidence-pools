const express = require('express');
const router = express.Router();
const database = require('../config/database');

// API routes placeholder

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
        console.error('Error fetching pick count:', error);
        res.status(500).json({
            error: 'Internal server error',
            count: 0
        });
    }
});

module.exports = router;