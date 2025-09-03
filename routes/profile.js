const express = require('express');
const router = express.Router();
const UserProfileController = require('../controllers/UserProfileController');
const { body } = require('express-validator');

// Own profile routes
router.get('/', UserProfileController.profile);
router.get('/edit', UserProfileController.editProfile);
router.post('/edit', [
    body('username')
        .trim()
        .isLength({ min: 3, max: 30 })
        .withMessage('Username must be between 3 and 30 characters')
        .matches(/^[a-zA-Z0-9_-]+$/)
        .withMessage('Username can only contain letters, numbers, underscores, and hyphens'),
    body('email')
        .trim()
        .isEmail()
        .normalizeEmail()
        .withMessage('Please enter a valid email address')
], UserProfileController.updateProfile);

// Password management
router.get('/change-password', UserProfileController.changePasswordForm);
router.post('/change-password', [
    body('currentPassword')
        .notEmpty()
        .withMessage('Current password is required'),
    body('newPassword')
        .isLength({ min: 8 })
        .withMessage('New password must be at least 8 characters long')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('New password must contain at least one lowercase letter, one uppercase letter, and one number'),
    body('confirmPassword')
        .notEmpty()
        .withMessage('Password confirmation is required')
], UserProfileController.changePassword);

// Pick history
router.get('/picks', UserProfileController.pickHistory);

// Public profile routes (view other users)
router.get('/user/:user_id', UserProfileController.profile);
router.get('/user/:user_id/picks', UserProfileController.pickHistory);

module.exports = router;