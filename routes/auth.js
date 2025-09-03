const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const database = require('../config/database');
const authMiddleware = require('../middleware/auth');
const validation = require('../middleware/validation');
const { passwordResetLimiter, authLimiter } = require('../middleware/rateLimit');

const router = express.Router();

// GET /auth/register - Show registration form
router.get('/register', authMiddleware.requireGuest, (req, res) => {
    const action = req.query.action;
    const joinCode = req.query.code || req.query.join_code;
    const leagueName = req.query.league;
    
    let title = 'Create Account';
    if (action === 'create-league') {
        title = 'Sign Up to Create League';
    } else if (action === 'join-league') {
        title = leagueName ? `Sign Up to Join ${leagueName}` : 'Sign Up to Join League';
    }
    
    res.render('auth/register', {
        title,
        action,
        joinCode,
        leagueName,
        layout: 'layouts/auth'
    });
});

// POST /auth/register - Process registration
router.post('/register', 
    authLimiter,
    validation.validateRegistration(),
    async (req, res) => {
        try {
            const { 
                username, 
                email, 
                password, 
                firstName, 
                lastName, 
                timezone 
            } = req.body;

            // Check if user already exists
            const existingUser = await database.executeMany(
                'SELECT user_id FROM users WHERE username = ? OR email = ?',
                [username, email]
            );

            if (existingUser.length > 0) {
                req.flash('error', 'Username or email already exists');
                return res.redirect('/auth/register');
            }

            // Hash password
            const passwordHash = await bcrypt.hash(password, 12);

            // Create user
            const result = await database.execute(
                `INSERT INTO users 
                (username, email, password_hash, first_name, last_name, timezone, created_at) 
                VALUES (?, ?, ?, ?, ?, ?, NOW())`,
                [username, email, passwordHash, firstName || null, lastName || null, timezone || 'America/New_York']
            );

            const userId = result.insertId;

            // Create user session
            authMiddleware.createSession(req, { user_id: userId, username, email });

            // Log successful registration
            console.log(`✅ New user registered: ${username} (${email})`);

            // Save session synchronously to ensure it's persisted before redirect
            await new Promise((resolve, reject) => {
                req.session.save((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            // Handle post-registration actions
            const { action, joinCode } = req.body;
            let redirectTo = '/dashboard';
            
            if (action === 'create-league') {
                redirectTo = '/leagues/create';
                req.flash('success', `Welcome to League Station Pools, ${username}! Let's create your league!`);
            } else if (action === 'join-league' && joinCode) {
                try {
                    // SECURITY: Validate the join code and league before auto-joining
                    const League = require('../models/League');
                    const league = await League.findByJoinCode(joinCode.toUpperCase());
                    
                    if (!league) {
                        req.flash('success', `Welcome to League Station Pools, ${username}!`);
                        req.flash('error', 'Invalid join code. The code you used does not exist.');
                        redirectTo = '/leagues/join';
                    } else if (league.status !== 'active') {
                        req.flash('success', `Welcome to League Station Pools, ${username}!`);
                        req.flash('error', 'This league is no longer active.');
                        redirectTo = '/leagues/join';
                    } else {
                        // Check if league has space for new members
                        const memberCount = await League.getMemberCount(league.league_id);
                        if (memberCount >= league.max_participants) {
                            req.flash('success', `Welcome to League Station Pools, ${username}!`);
                            req.flash('error', `League "${league.league_name}" is full and cannot accept new members.`);
                            redirectTo = '/leagues/join';
                        } else {
                            // All validations passed - redirect to join confirmation instead of auto-joining
                            req.flash('success', `Welcome to League Station Pools, ${username}! Please confirm joining ${league.league_name}.`);
                            redirectTo = `/leagues/join?code=${joinCode}&from=register`;
                            
                            console.log(`✅ User ${username} (ID: ${userId}) registered and needs to confirm joining league ${league.league_name} (ID: ${league.league_id}) with code ${joinCode}`);
                        }
                    }
                } catch (error) {
                    console.error('Error joining league during registration:', error);
                    req.flash('success', `Welcome to League Station Pools, ${username}!`);
                    req.flash('error', 'Could not join league automatically due to an error. Please try joining manually.');
                    redirectTo = `/leagues/join?code=${joinCode}&from=register`;
                }
            } else if (action === 'join-league') {
                redirectTo = '/leagues/join';
                req.flash('success', `Welcome to League Station Pools, ${username}! Let's get you into a league!`);
            } else {
                req.flash('success', `Account created successfully! Welcome to NFL Confidence Pools, ${username}!`);
            }
            
            res.redirect(redirectTo);

        } catch (error) {
            console.error('Registration error:', error);
            req.flash('error', 'Registration failed. Please try again.');
            res.redirect('/auth/register');
        }
    }
);

// GET /auth/login - Show login form
router.get('/login', authMiddleware.requireGuest, (req, res) => {
    const action = req.query.action;
    const joinCode = req.query.code || req.query.join_code;
    const leagueName = req.query.league;
    
    let title = 'Sign In';
    if (action === 'create-league') {
        title = 'Sign In to Create League';
    } else if (action === 'join-league') {
        title = leagueName ? `Sign In to Join ${leagueName}` : 'Sign In to Join League';
    }
    
    res.render('auth/login', {
        title,
        action,
        joinCode,
        leagueName,
        layout: 'layouts/auth'
    });
});

// POST /auth/login - Process login
router.post('/login',
    authLimiter,
    validation.validateLogin(),
    async (req, res) => {
        try {
            const { email, password, remember } = req.body;

            // Find user by email
            const user = await database.executeMany(
                'SELECT user_id, username, email, password_hash, account_status, email_verified FROM users WHERE email = ?',
                [email]
            );

            if (user.length === 0) {
                req.flash('error', 'Invalid email or password');
                return res.redirect('/auth/login');
            }

            const userData = user[0];

            // Check account status
            if (userData.account_status !== 'active') {
                req.flash('error', 'Your account has been suspended. Please contact support.');
                return res.redirect('/auth/login');
            }

            // Verify password
            const passwordValid = await bcrypt.compare(password, userData.password_hash);
            
            if (!passwordValid) {
                req.flash('error', 'Invalid email or password');
                return res.redirect('/auth/login');
            }

            // Update last login
            await database.execute(
                'UPDATE users SET last_login = NOW() WHERE user_id = ?',
                [userData.user_id]
            );

            // Create session
            authMiddleware.createSession(req, userData);

            // Set remember me cookie if requested
            if (remember) {
                const token = authMiddleware.generateToken(userData);
                res.cookie('token', token, {
                    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax'
                });
            }

            console.log(`✅ User logged in: ${userData.username}`);

            // Handle post-login actions
            const { action, joinCode } = req.body;
            let redirectTo = req.session.returnTo || '/dashboard';
            delete req.session.returnTo;
            
            if (action === 'create-league') {
                redirectTo = '/leagues/create';
                req.flash('success', `Welcome back, ${userData.username}! Ready to create your league?`);
            } else if (action === 'join-league' && joinCode) {
                try {
                    // SECURITY: Validate the join code and league before auto-joining
                    const League = require('../models/League');
                    const league = await League.findByJoinCode(joinCode.toUpperCase());
                    
                    if (!league) {
                        req.flash('success', `Welcome back, ${userData.username}!`);
                        req.flash('error', 'Invalid join code. The code you used does not exist.');
                        redirectTo = '/leagues/join';
                    } else if (league.status !== 'active') {
                        req.flash('success', `Welcome back, ${userData.username}!`);
                        req.flash('error', 'This league is no longer active.');
                        redirectTo = '/leagues/join';
                    } else {
                        // Check if already a member
                        const isMember = await League.isUserMember(league.league_id, userData.user_id);
                        if (isMember) {
                            req.flash('success', `Welcome back, ${userData.username}! You're already a member of ${league.league_name}.`);
                            req.session.joinedLeagueId = league.league_id;
                            redirectTo = `/dashboard`;
                        } else {
                            // Check if league has space for new members
                            const memberCount = await League.getMemberCount(league.league_id);
                            if (memberCount >= league.max_participants) {
                                req.flash('success', `Welcome back, ${userData.username}!`);
                                req.flash('error', `League "${league.league_name}" is full and cannot accept new members.`);
                                redirectTo = '/leagues/join';
                            } else {
                                // All validations passed - redirect to join confirmation instead of auto-joining
                                req.flash('success', `Welcome back, ${userData.username}! Please confirm joining ${league.league_name}.`);
                                redirectTo = `/leagues/join?code=${joinCode}`;
                                
                                console.log(`✅ User ${userData.username} (ID: ${userData.user_id}) logged in and needs to confirm joining league ${league.league_name} (ID: ${league.league_id}) with code ${joinCode}`);
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error joining league during login:', error);
                    req.flash('success', `Welcome back, ${userData.username}!`);
                    req.flash('error', 'Could not join league automatically due to an error. Please try joining manually.');
                    redirectTo = `/leagues/join?code=${joinCode}`;
                }
            } else if (action === 'join-league') {
                redirectTo = '/leagues/join';
                req.flash('success', `Welcome back, ${userData.username}! Ready to join a league?`);
            } else {
                req.flash('success', `Welcome back, ${userData.username}!`);
            }
            
            res.redirect(redirectTo);

        } catch (error) {
            console.error('Login error:', error);
            req.flash('error', 'Login failed. Please try again.');
            res.redirect('/auth/login');
        }
    }
);

// POST /auth/logout - Process logout
router.post('/logout', authMiddleware.requireAuth, async (req, res) => {
    try {
        const username = req.user?.username;

        // Clear remember me cookie
        res.clearCookie('token');

        // Destroy session
        await authMiddleware.destroySession(req);

        console.log(`👋 User logged out: ${username}`);

        req.flash('success', 'You have been logged out successfully');
        res.redirect('/');

    } catch (error) {
        console.error('Logout error:', error);
        res.redirect('/dashboard');
    }
});

// GET /auth/forgot-password - Show forgot password form
router.get('/forgot-password', authMiddleware.requireGuest, (req, res) => {
    res.render('auth/forgot-password', {
        title: 'Reset Password',
        layout: 'layouts/auth'
    });
});

// POST /auth/forgot-password - Process forgot password
router.post('/forgot-password',
    passwordResetLimiter,
    validation.validatePasswordReset(),
    async (req, res) => {
        try {
            const { email } = req.body;

            // Find user by email
            const user = await database.executeMany(
                'SELECT user_id, username, email FROM users WHERE email = ? AND account_status = ?',
                [email, 'active']
            );

            // Always show success message for security (don't reveal if email exists)
            req.flash('success', 'If an account with that email exists, password reset instructions have been sent.');

            if (user.length > 0) {
                const userData = user[0];

                // Generate reset token
                const resetToken = crypto.randomBytes(32).toString('hex');
                const resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

                // Save reset token
                await database.execute(
                    'UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE user_id = ?',
                    [resetToken, resetTokenExpires, userData.user_id]
                );

                // TODO: Send email with reset link
                // For now, just log the reset token (remove in production)
                console.log(`🔑 Password reset token for ${email}: ${resetToken}`);

                // In production, you would send an email like:
                // await emailService.sendPasswordReset(userData.email, resetToken);
            }

            res.redirect('/auth/login');

        } catch (error) {
            console.error('Forgot password error:', error);
            req.flash('error', 'An error occurred. Please try again.');
            res.redirect('/auth/forgot-password');
        }
    }
);

// GET /auth/reset-password/:token - Show reset password form
router.get('/reset-password/:token', authMiddleware.requireGuest, async (req, res) => {
    try {
        const { token } = req.params;

        // Find user with valid reset token
        const user = await database.executeMany(
            'SELECT user_id, username, email FROM users WHERE reset_token = ? AND reset_token_expires > NOW()',
            [token]
        );

        if (user.length === 0) {
            req.flash('error', 'Password reset link is invalid or has expired.');
            return res.redirect('/auth/forgot-password');
        }

        res.render('auth/reset-password', {
            title: 'Reset Password',
            layout: 'layouts/auth',
            token
        });

    } catch (error) {
        console.error('Reset password page error:', error);
        req.flash('error', 'An error occurred. Please try again.');
        res.redirect('/auth/forgot-password');
    }
});

// POST /auth/reset-password/:token - Process password reset
router.post('/reset-password/:token',
    validation.validatePasswordResetConfirm(),
    async (req, res) => {
        try {
            const { token } = req.params;
            const { password } = req.body;

            // Find user with valid reset token
            const user = await database.executeMany(
                'SELECT user_id, username, email FROM users WHERE reset_token = ? AND reset_token_expires > NOW()',
                [token]
            );

            if (user.length === 0) {
                req.flash('error', 'Password reset link is invalid or has expired.');
                return res.redirect('/auth/forgot-password');
            }

            const userData = user[0];

            // Hash new password
            const passwordHash = await bcrypt.hash(password, 12);

            // Update password and clear reset token
            await database.execute(
                'UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE user_id = ?',
                [passwordHash, userData.user_id]
            );

            console.log(`🔐 Password reset completed for: ${userData.username}`);

            req.flash('success', 'Password reset successfully. You can now log in with your new password.');
            res.redirect('/auth/login');

        } catch (error) {
            console.error('Reset password error:', error);
            req.flash('error', 'An error occurred. Please try again.');
            res.redirect(`/auth/reset-password/${req.params.token}`);
        }
    }
);

// GET /auth/verify-email/:token - Email verification
router.get('/verify-email/:token', async (req, res) => {
    try {
        const { token } = req.params;

        // In a real app, you'd have email verification tokens
        // For now, just mark as verified
        req.flash('success', 'Email verified successfully!');
        res.redirect('/auth/login');

    } catch (error) {
        console.error('Email verification error:', error);
        req.flash('error', 'Email verification failed.');
        res.redirect('/auth/login');
    }
});

// API Routes for AJAX requests

// POST /auth/api/check-username - Check username availability
router.post('/api/check-username', async (req, res) => {
    try {
        const { username } = req.body;

        if (!username || username.length < 3) {
            return res.json({ available: false, message: 'Username too short' });
        }

        const existing = await database.executeMany(
            'SELECT user_id FROM users WHERE username = ?',
            [username]
        );

        res.json({
            available: existing.length === 0,
            message: existing.length > 0 ? 'Username already taken' : 'Username available'
        });

    } catch (error) {
        console.error('Username check error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /auth/api/check-email - Check email availability
router.post('/api/check-email', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email || !email.includes('@')) {
            return res.json({ available: false, message: 'Invalid email format' });
        }

        const existing = await database.executeMany(
            'SELECT user_id FROM users WHERE email = ?',
            [email]
        );

        res.json({
            available: existing.length === 0,
            message: existing.length > 0 ? 'Email already registered' : 'Email available'
        });

    } catch (error) {
        console.error('Email check error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;