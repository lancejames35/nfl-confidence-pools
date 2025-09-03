const express = require('express');
const router = express.Router();
const UserProfileController = require('../controllers/UserProfileController');
const { body } = require('express-validator');

// Settings routes (consolidated account management)
router.get('/', UserProfileController.settings);
router.post('/', [
    body('currentPassword')
        .optional({ nullable: true, checkFalsy: true })
        .isLength({ min: 1 })
        .withMessage('Current password cannot be empty'),
    body('username')
        .trim()
        .isLength({ min: 3, max: 50 })
        .withMessage('Username must be between 3 and 50 characters')
        .matches(/^[a-zA-Z0-9_-]+$/)
        .withMessage('Username can only contain letters, numbers, underscores, and hyphens'),
    body('email')
        .trim()
        .isEmail()
        .normalizeEmail()
        .withMessage('Please enter a valid email address'),
    body('firstName')
        .optional({ nullable: true, checkFalsy: true })
        .trim()
        .isLength({ max: 100 })
        .withMessage('First name cannot exceed 100 characters'),
    body('lastName')
        .optional({ nullable: true, checkFalsy: true })
        .trim()
        .isLength({ max: 100 })
        .withMessage('Last name cannot exceed 100 characters'),
    body('newPassword')
        .optional({ nullable: true, checkFalsy: true })
        .isLength({ min: 8 })
        .withMessage('New password must be at least 8 characters long')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('New password must contain at least one lowercase letter, one uppercase letter, and one number')
], UserProfileController.updateSettings);

module.exports = router;