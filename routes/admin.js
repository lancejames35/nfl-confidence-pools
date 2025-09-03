const express = require('express');
const router = express.Router();
const GameController = require('../controllers/GameController');
const { body } = require('express-validator');
const PickLockingService = require('../services/PickLockingService');
const scheduledTasks = require('../services/ScheduledTasks');

// Admin dashboard
router.get('/', (req, res) => {
    res.render('admin/index', {
        title: 'Admin Dashboard',
        user: req.user
    });
});

// Games management
router.get('/games', GameController.index);
router.get('/games/:id/update', GameController.showUpdateForm);

// Update game result
router.post('/games/:id/update', [
    body('home_score').isInt({ min: 0 }).withMessage('Home score must be a non-negative integer'),
    body('away_score').isInt({ min: 0 }).withMessage('Away score must be a non-negative integer'),
    body('status').isIn(['scheduled', 'in_progress', 'completed', 'postponed']).withMessage('Invalid status')
], GameController.updateResult);

// Set game as in progress
router.post('/games/:id/start', GameController.setInProgress);

// Bulk update games
router.post('/games/bulk-update', GameController.bulkUpdate);

// Auto-process week
router.post('/games/auto-process/:week', GameController.autoProcessWeek);

// API endpoints
router.get('/api/games/:id', GameController.getGameDetails);

// Pick Locking Management
router.get('/pick-locking/status', async (req, res) => {
    try {
        const taskStatus = scheduledTasks.getStatus();
        const leagues = [];
        
        // Get status for all leagues
        const allLeagues = await require('../config/database').execute(`
            SELECT league_id, league_name FROM leagues WHERE status = 'active'
        `);
        
        for (const league of allLeagues) {
            const status = await PickLockingService.getLeagueStatus(league.league_id);
            leagues.push({
                league_id: league.league_id,
                league_name: league.league_name,
                ...status
            });
        }
        
        res.json({
            success: true,
            taskStatus,
            leagues
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/pick-locking/trigger', async (req, res) => {
    try {
        await scheduledTasks.triggerPickLocking();
        res.json({ success: true, message: 'Pick locking process completed' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/pick-locking/league/:id', async (req, res) => {
    try {
        const leagueId = parseInt(req.params.id);
        const status = await PickLockingService.getLeagueStatus(leagueId);
        res.json({ success: true, ...status });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;