const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const LeagueController = require('../controllers/LeagueController');

// League validation rules
const leagueValidation = [
    body('league_name')
        .trim()
        .isLength({ min: 3, max: 50 })
        .withMessage('League name must be between 3-50 characters')
        .matches(/^[a-zA-Z0-9\s\-_]+$/)
        .withMessage('League name can only contain letters, numbers, spaces, hyphens, and underscores'),
    
    body('description')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage('Description cannot exceed 500 characters'),
    
    body('max_participants')
        .custom((value, { req }) => {
            if (req.body.unlimited_participants) {
                return true; // Skip validation if unlimited is checked
            }
            const num = parseInt(value);
            if (isNaN(num) || num < 2 || num > 998) {
                throw new Error('Maximum participants must be between 2-998');
            }
            return true;
        }),
    
    body('max_entries')
        .isInt({ min: 1, max: 5 })
        .withMessage('Maximum entries per user must be between 1-5'),
    
    body('entry_fee')
        .isFloat({ min: 0, max: 1000 })
        .withMessage('Entry fee must be between $0-$1000'),
    
    body('pool_type')
        .isIn(['confidence', 'survivor', 'squares'])
        .withMessage('Invalid pool type'),
    
    body('privacy')
        .isIn(['public', 'private', 'invite_only'])
        .withMessage('Invalid privacy setting'),
    
    body('timezone')
        .optional()
        .matches(/^[A-Za-z_]+\/[A-Za-z_]+$/)
        .withMessage('Invalid timezone format'),

    body('primary_tiebreaker')
        .optional()
        .isIn(['head_to_head', 'mnf_total', 'highest_confidence_correct', 'total_games_correct'])
        .withMessage('Invalid primary tiebreaker option'),

    body('secondary_tiebreaker')
        .optional()
        .isIn(['head_to_head', 'mnf_total', 'highest_confidence_correct', 'total_games_correct'])
        .withMessage('Invalid secondary tiebreaker option'),
    
    // New deadline validation
    body('deadline_type')
        .optional()
        .isIn(['per_game', 'league_wide'])
        .withMessage('Invalid deadline type'),
    
    body('weekly_deadline')
        .optional()
        .isIn(['first_game', 'thursday_night', 'sunday_early'])
        .withMessage('Invalid weekly deadline setting'),
    
    // Multi-tier validation
    body('enable_multi_tier')
        .optional()
        .isBoolean()
        .withMessage('Multi-tier must be a boolean'),
    
    body('tier_name.*')
        .optional()
        .trim()
        .isLength({ min: 1, max: 50 })
        .withMessage('Tier name must be between 1-50 characters'),
    
    body('tier_fee.*')
        .optional()
        .isFloat({ min: 0, max: 1000 })
        .withMessage('Tier fee must be between $0-$1000'),
    
    body('tier_description.*')
        .optional()
        .trim()
        .isLength({ min: 1, max: 200 })
        .withMessage('Tier description must be between 1-200 characters'),
    
    // Unlimited participants validation
    body('unlimited_participants')
        .optional()
        .isBoolean()
        .withMessage('Unlimited participants must be a boolean')
];

const joinCodeValidation = [
    body('join_code')
        .trim()
        .isLength({ min: 8, max: 8 })
        .withMessage('Join code must be 8 characters')
        .matches(/^[A-Z0-9]+$/)
        .withMessage('Join code must contain only uppercase letters and numbers')
];

// Routes
router.get('/', LeagueController.index);
router.get('/create', LeagueController.create);
router.post('/create', leagueValidation, LeagueController.store);
router.get('/join', LeagueController.join);
router.post('/join', joinCodeValidation, LeagueController.joinByCode);
router.get('/:id', LeagueController.show);
router.get('/:id/edit', LeagueController.edit);
router.put('/:id', leagueValidation, LeagueController.update);
router.delete('/:id', LeagueController.destroy);
router.post('/:id/leave', LeagueController.leave);
router.delete('/:id/members/:userId', LeagueController.removeMember);
router.put('/:id/members/:userId', LeagueController.updateMember);
router.put('/:id/members/:userId/role', LeagueController.updateMemberRole);
router.post('/:id/regenerate-code', LeagueController.regenerateJoinCode);
router.post('/:id/settings', LeagueController.updateSettings);
router.post('/:id/update-member', LeagueController.updateMember);
router.post('/:id/transfer-ownership', LeagueController.transferOwnership);
router.post('/:id/reset-password', LeagueController.resetPassword);
router.get('/:id/messages', LeagueController.getMessages);
router.post('/:id/post-message', LeagueController.postMessage);
router.delete('/:id/messages/:messageId', LeagueController.deleteMessage);
router.get('/:id/chat', LeagueController.chat);
router.get('/:id/chat/thread/:threadId', LeagueController.viewThread);
router.post('/:id/chat/message', LeagueController.postChatMessage);
router.post('/:id/chat/poll', LeagueController.createPoll);
router.post('/:id/chat/poll/:pollId/vote', LeagueController.votePoll);

// Payout routes
router.get('/:id/payouts', LeagueController.getPayouts);
router.post('/:id/payouts', LeagueController.updatePayouts);
router.post('/:id/recalculate-purse', LeagueController.recalculatePurse);

module.exports = router;