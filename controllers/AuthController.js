const { validationResult } = require('express-validator');
const User = require('../models/User');

class AuthController {
    static async showLogin(req, res) {
        try {
            if (req.user) {
                return res.redirect('/dashboard');
            }
            
            res.render('auth/login', {
                title: 'Login',
                layout: 'layouts/public'
            });
        } catch (error) {
            res.status(500).render('errors/error', {
                title: 'Server Error',
                layout: 'layouts/error',
                error: { message: 'Internal server error' }
            });
        }
    }

    static async showRegister(req, res) {
        try {
            if (req.user) {
                return res.redirect('/dashboard');
            }
            
            res.render('auth/register', {
                title: 'Sign Up',
                layout: 'layouts/public'
            });
        } catch (error) {
            res.status(500).render('errors/error', {
                title: 'Server Error',
                layout: 'layouts/error',
                error: { message: 'Internal server error' }
            });
        }
    }

    static async login(req, res) {
        try {
            const errors = validationResult(req);
            
            if (!errors.isEmpty()) {
                req.flash('error', errors.array()[0].msg);
                return res.redirect('/auth/login');
            }

            const { username, password } = req.body;
            
            // Find user by username or email
            let user = await User.findByUsername(username);
            if (!user) {
                user = await User.findByEmail(username);
            }
            
            if (!user) {
                req.flash('error', 'Invalid username/email or password');
                return res.redirect('/auth/login');
            }

            const isValidPassword = await user.validatePassword(password);
            if (!isValidPassword) {
                req.flash('error', 'Invalid username/email or password');
                return res.redirect('/auth/login');
            }

            // Set up session
            req.session.userId = user.id;
            req.session.user = user.toJSON();
            
            // Generate JWT token for API usage
            const token = user.generateAuthToken();
            res.cookie('token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 24 * 60 * 60 * 1000 // 24 hours
            });

            req.flash('success', `Welcome back, ${user.username}!`);
            
            // Redirect to intended page or dashboard
            const redirectUrl = req.session.redirectTo || '/dashboard';
            delete req.session.redirectTo;
            
            res.redirect(redirectUrl);
        } catch (error) {
            req.flash('error', 'An error occurred during login. Please try again.');
            res.redirect('/auth/login');
        }
    }

    static async register(req, res) {
        try {
            const errors = validationResult(req);
            
            if (!errors.isEmpty()) {
                req.flash('error', errors.array()[0].msg);
                return res.redirect('/auth/register');
            }

            const { username, email, password } = req.body;
            
            // Check if username already exists
            const existingUsername = await User.findByUsername(username);
            if (existingUsername) {
                req.flash('error', 'Username already taken');
                return res.redirect('/auth/register');
            }
            
            // Check if email already exists
            const existingEmail = await User.findByEmail(email);
            if (existingEmail) {
                req.flash('error', 'Email address already registered');
                return res.redirect('/auth/register');
            }

            // Create new user
            const userData = {
                username,
                email,
                password,
                role: 'user'
            };
            
            const newUser = await User.create(userData);
            
            if (!newUser) {
                req.flash('error', 'Failed to create account. Please try again.');
                return res.redirect('/auth/register');
            }

            // Auto-login the user
            req.session.userId = newUser.id;
            req.session.user = newUser.toJSON();
            
            // Generate JWT token
            const token = newUser.generateAuthToken();
            res.cookie('token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 24 * 60 * 60 * 1000 // 24 hours
            });

            req.flash('success', `Welcome to NFL Confidence Pools, ${newUser.username}!`);
            res.redirect('/dashboard');
        } catch (error) {
            req.flash('error', 'An error occurred during registration. Please try again.');
            res.redirect('/auth/register');
        }
    }

    static async logout(req, res) {
        try {
            // Clear session
            req.session.destroy((err) => {
                if (err) {
                }
            });
            
            // Clear JWT cookie
            res.clearCookie('token');
            
            req.flash('success', 'You have been logged out successfully');
            res.redirect('/');
        } catch (error) {
            req.flash('error', 'An error occurred during logout');
            res.redirect('/');
        }
    }

    static async profile(req, res) {
        try {
            res.render('auth/profile', {
                title: 'Profile',
                user: req.user
            });
        } catch (error) {
            res.status(500).render('errors/error', {
                title: 'Server Error',
                layout: 'layouts/error',
                error: { message: 'Internal server error' }
            });
        }
    }

    static async updateProfile(req, res) {
        try {
            const errors = validationResult(req);
            
            if (!errors.isEmpty()) {
                req.flash('error', errors.array()[0].msg);
                return res.redirect('/auth/profile');
            }

            const { username, email } = req.body;
            
            // Check username availability (excluding current user)
            if (username !== req.user.username) {
                const usernameAvailable = await User.checkUsernameAvailable(username, req.user.id);
                if (!usernameAvailable) {
                    req.flash('error', 'Username already taken');
                    return res.redirect('/auth/profile');
                }
            }
            
            // Check email availability (excluding current user)
            if (email !== req.user.email) {
                const emailAvailable = await User.checkEmailAvailable(email, req.user.id);
                if (!emailAvailable) {
                    req.flash('error', 'Email address already registered');
                    return res.redirect('/auth/profile');
                }
            }

            // Update user
            const updatedUser = await req.user.update({ username, email });
            
            if (updatedUser) {
                req.session.user = updatedUser.toJSON();
                req.flash('success', 'Profile updated successfully');
            } else {
                req.flash('error', 'Failed to update profile');
            }
            
            res.redirect('/auth/profile');
        } catch (error) {
            req.flash('error', 'An error occurred while updating your profile');
            res.redirect('/auth/profile');
        }
    }

    static async changePassword(req, res) {
        try {
            const errors = validationResult(req);
            
            if (!errors.isEmpty()) {
                req.flash('error', errors.array()[0].msg);
                return res.redirect('/auth/profile');
            }

            const { currentPassword, newPassword } = req.body;
            
            // Verify current password
            const user = await User.findById(req.user.id);
            const isValidPassword = await user.validatePassword(currentPassword);
            
            if (!isValidPassword) {
                req.flash('error', 'Current password is incorrect');
                return res.redirect('/auth/profile');
            }

            // Update password
            const success = await user.updatePassword(newPassword);
            
            if (success) {
                req.flash('success', 'Password changed successfully');
            } else {
                req.flash('error', 'Failed to change password');
            }
            
            res.redirect('/auth/profile');
        } catch (error) {
            req.flash('error', 'An error occurred while changing your password');
            res.redirect('/auth/profile');
        }
    }

    // API endpoints for AJAX requests
    static async apiCheckUsername(req, res) {
        try {
            const { username } = req.body;
            const excludeId = req.user ? req.user.id : null;
            
            const available = await User.checkUsernameAvailable(username, excludeId);
            
            res.json({ available });
        } catch (error) {
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    static async apiCheckEmail(req, res) {
        try {
            const { email } = req.body;
            const excludeId = req.user ? req.user.id : null;
            
            const available = await User.checkEmailAvailable(email, excludeId);
            
            res.json({ available });
        } catch (error) {
            res.status(500).json({ error: 'Internal server error' });
        }
    }
}

module.exports = AuthController;