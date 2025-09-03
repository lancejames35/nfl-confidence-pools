const { body, param, query, validationResult } = require('express-validator');
const validator = require('validator');

class ValidationMiddleware {
    // Handle validation results
    handleValidation(req, res, next) {
        const errors = validationResult(req);
        
        if (!errors.isEmpty()) {
            const errorMessages = errors.array().map(error => ({
                field: error.path || error.param,
                message: error.msg,
                value: error.value
            }));

            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(400).json({
                    error: true,
                    message: 'Validation failed',
                    details: errorMessages
                });
            }

            // For web forms, flash errors and redirect back
            req.flash('error', errorMessages.map(e => e.message).join(', '));
            return res.redirect('back');
        }

        next();
    }

    // User registration validation
    validateRegistration() {
        return [
            body('username')
                .trim()
                .isLength({ min: 3, max: 50 })
                .withMessage('Username must be between 3 and 50 characters')
                .matches(/^[a-zA-Z0-9_-]+$/)
                .withMessage('Username can only contain letters, numbers, underscores, and hyphens'),
            
            body('email')
                .trim()
                .isEmail()
                .withMessage('Please provide a valid email address')
                .normalizeEmail(),
            
            body('password')
                .isLength({ min: 8 })
                .withMessage('Password must be at least 8 characters long')
                .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
                .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
            
            body('confirmPassword')
                .custom((value, { req }) => {
                    if (value !== req.body.password) {
                        throw new Error('Password confirmation does not match password');
                    }
                    return true;
                }),
            
            body('firstName')
                .optional()
                .trim()
                .isLength({ max: 100 })
                .withMessage('First name cannot exceed 100 characters'),
            
            body('lastName')
                .optional()
                .trim()
                .isLength({ max: 100 })
                .withMessage('Last name cannot exceed 100 characters'),
            
            body('timezone')
                .optional()
                .isIn(['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix'])
                .withMessage('Please select a valid timezone'),

            this.handleValidation
        ];
    }

    // User login validation
    validateLogin() {
        return [
            body('email')
                .trim()
                .isEmail()
                .withMessage('Please provide a valid email address')
                .normalizeEmail(),
            
            body('password')
                .notEmpty()
                .withMessage('Password is required'),

            this.handleValidation
        ];
    }

    // League creation validation
    validateLeagueCreation() {
        return [
            body('league_name')
                .trim()
                .isLength({ min: 3, max: 255 })
                .withMessage('League name must be between 3 and 255 characters'),
            
            body('entry_fee')
                .optional()
                .isFloat({ min: 0, max: 9999.99 })
                .withMessage('Entry fee must be between $0 and $9,999.99'),
            
            body('max_entries')
                .optional()
                .isInt({ min: 1, max: 10 })
                .withMessage('Maximum entries must be between 1 and 10'),
            
            body('max_participants')
                .optional()
                .isInt({ min: 2, max: 500 })
                .withMessage('Maximum participants must be between 2 and 500'),
            
            body('season_year')
                .isInt({ min: 2020, max: 2030 })
                .withMessage('Please provide a valid season year'),
            
            body('pool_type')
                .isIn(['confidence', 'survivor', 'squares'])
                .withMessage('Please select a valid pool type'),
            
            body('privacy')
                .optional()
                .isIn(['public', 'private'])
                .withMessage('Privacy setting must be public or private'),
            
            body('description')
                .optional()
                .trim()
                .isLength({ max: 1000 })
                .withMessage('Description cannot exceed 1000 characters'),
            
            body('theme_style')
                .optional()
                .isIn(['clean_sports', 'bold_gameday', 'classic_fantasy', 'premium_dark'])
                .withMessage('Please select a valid theme'),

            this.handleValidation
        ];
    }

    // Picks submission validation
    validatePicksSubmission() {
        return [
            param('leagueId')
                .isInt({ min: 1 })
                .withMessage('Invalid league ID'),
            
            param('week')
                .isInt({ min: 1, max: 22 })
                .withMessage('Week must be between 1 and 22'),
            
            param('entryId')
                .isInt({ min: 1 })
                .withMessage('Invalid entry ID'),
            
            body('picks')
                .isArray({ min: 1 })
                .withMessage('Picks must be a non-empty array'),
            
            body('picks.*.gameId')
                .isInt({ min: 1 })
                .withMessage('Invalid game ID'),
            
            body('picks.*.selectedTeam')
                .matches(/^[A-Z]{2,4}$/)
                .withMessage('Invalid team abbreviation'),
            
            body('picks.*.confidencePoints')
                .optional()
                .isInt({ min: 1, max: 16 })
                .withMessage('Confidence points must be between 1 and 16'),
            
            body('tiebreakers')
                .optional()
                .isArray()
                .withMessage('Tiebreakers must be an array'),

            this.handleValidation
        ];
    }

    // Chat message validation
    validateChatMessage() {
        return [
            body('message')
                .trim()
                .isLength({ min: 1, max: 1000 })
                .withMessage('Message must be between 1 and 1000 characters'),
            
            body('parentMessageId')
                .optional()
                .isInt({ min: 1 })
                .withMessage('Invalid parent message ID'),

            this.handleValidation
        ];
    }

    // Invitation validation
    validateInvitation() {
        return [
            body('emails')
                .isArray({ min: 1, max: 50 })
                .withMessage('Must provide 1-50 email addresses'),
            
            body('emails.*')
                .isEmail()
                .withMessage('All emails must be valid email addresses'),
            
            body('message')
                .optional()
                .trim()
                .isLength({ max: 500 })
                .withMessage('Invitation message cannot exceed 500 characters'),
            
            body('role')
                .optional()
                .isIn(['participant', 'co_commissioner', 'moderator'])
                .withMessage('Invalid role specified'),

            this.handleValidation
        ];
    }

    // Password reset validation
    validatePasswordReset() {
        return [
            body('email')
                .trim()
                .isEmail()
                .withMessage('Please provide a valid email address')
                .normalizeEmail(),

            this.handleValidation
        ];
    }

    // Password reset confirmation validation
    validatePasswordResetConfirm() {
        return [
            body('token')
                .notEmpty()
                .withMessage('Reset token is required'),
            
            body('password')
                .isLength({ min: 8 })
                .withMessage('Password must be at least 8 characters long')
                .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
                .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
            
            body('confirmPassword')
                .custom((value, { req }) => {
                    if (value !== req.body.password) {
                        throw new Error('Password confirmation does not match password');
                    }
                    return true;
                }),

            this.handleValidation
        ];
    }

    // Profile update validation
    validateProfileUpdate() {
        return [
            body('firstName')
                .optional()
                .trim()
                .isLength({ max: 100 })
                .withMessage('First name cannot exceed 100 characters'),
            
            body('lastName')
                .optional()
                .trim()
                .isLength({ max: 100 })
                .withMessage('Last name cannot exceed 100 characters'),
            
            body('phone')
                .optional()
                .matches(/^\+?[\d\s\-\(\)]+$/)
                .withMessage('Please provide a valid phone number'),
            
            body('bio')
                .optional()
                .trim()
                .isLength({ max: 500 })
                .withMessage('Bio cannot exceed 500 characters'),
            
            body('timezone')
                .optional()
                .isIn(['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix'])
                .withMessage('Please select a valid timezone'),

            this.handleValidation
        ];
    }

    // Tiebreaker validation
    validateTiebreaker() {
        return [
            body('predictedValue')
                .isFloat({ min: 0, max: 999.99 })
                .withMessage('Predicted value must be between 0 and 999.99'),
            
            body('predictedText')
                .optional()
                .trim()
                .isLength({ max: 255 })
                .withMessage('Predicted text cannot exceed 255 characters'),

            this.handleValidation
        ];
    }

    // League settings validation
    validateLeagueSettings() {
        return [
            body('pick_type')
                .optional()
                .isIn(['straight_up', 'against_spread'])
                .withMessage('Pick type must be straight_up or against_spread'),
            
            body('min_confidence_points')
                .optional()
                .isInt({ min: 1, max: 50 })
                .withMessage('Minimum confidence points must be between 1 and 50'),
            
            body('max_confidence_points')
                .optional()
                .isInt({ min: 1, max: 50 })
                .withMessage('Maximum confidence points must be between 1 and 50'),
            
            body('pick_deadline_type')
                .optional()
                .isIn(['kickoff', 'first_game', 'custom'])
                .withMessage('Invalid pick deadline type'),
            
            body('custom_deadline_minutes')
                .optional()
                .isInt({ min: 0, max: 1440 })
                .withMessage('Custom deadline minutes must be between 0 and 1440'),

            this.handleValidation
        ];
    }

    // Custom validation for unique fields
    createUniqueValidator(table, field, excludeId = null) {
        return async (value, { req }) => {
            const database = require('../config/database');
            
            let query = `SELECT ${field} FROM ${table} WHERE ${field} = ?`;
            let params = [value];
            
            if (excludeId) {
                query += ' AND id != ?';
                params.push(excludeId);
            }
            
            const existing = await database.execute(query, params);
            
            if (existing.length > 0) {
                throw new Error(`${field} is already taken`);
            }
            
            return true;
        };
    }

    // Sanitize HTML input to prevent XSS
    sanitizeHtml(value) {
        return validator.escape(value);
    }

    // Custom phone number validation
    validatePhoneNumber(value) {
        // Remove all non-digit characters
        const digits = value.replace(/\D/g, '');
        
        // Check if it's a valid US phone number
        return digits.length === 10 || (digits.length === 11 && digits[0] === '1');
    }

    // Custom team abbreviation validation
    validateTeamAbbreviation(value) {
        const validTeams = [
            'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE',
            'DAL', 'DEN', 'DET', 'GB', 'HOU', 'IND', 'JAX', 'KC',
            'LV', 'LAC', 'LAR', 'MIA', 'MIN', 'NE', 'NO', 'NYG',
            'NYJ', 'PHI', 'PIT', 'SF', 'SEA', 'TB', 'TEN', 'WAS'
        ];
        
        return validTeams.includes(value);
    }

    // Validate confidence points don't have duplicates
    validateUniqueConfidencePoints(picks) {
        const confidenceValues = picks
            .map(pick => pick.confidencePoints)
            .filter(val => val !== undefined && val !== null);
        
        const uniqueValues = new Set(confidenceValues);
        
        return confidenceValues.length === uniqueValues.size;
    }
}

module.exports = new ValidationMiddleware();