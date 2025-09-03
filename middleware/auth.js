const jwt = require('jsonwebtoken');
const database = require('../config/database');

class AuthMiddleware {
    // Middleware to check if user is authenticated
    requireAuth(req, res, next) {
        if (req.session && req.session.userId) {
            return next();
        }

        // Check for JWT token in header or cookie
        const token = req.headers.authorization?.split(' ')[1] || req.cookies.token;
        
        if (token) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                req.user = decoded;
                req.session.userId = decoded.userId;
                return next();
            } catch (error) {
                // Token invalid, continue to redirect
            }
        }

        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        req.flash('error', 'Please log in to access this page');
        res.redirect('/auth/login');
    }

    // Middleware to check if user is guest (not authenticated)
    requireGuest(req, res, next) {
        if (req.session && req.session.userId) {
            return res.redirect('/dashboard');
        }
        next();
    }

    // Middleware to load user data if authenticated
    async loadUser(req, res, next) {
        try {
            if (req.session && req.session.userId) {
                const user = await database.findById('users', req.session.userId, 'user_id');
                
                if (user) {
                    // Remove sensitive data
                    delete user.password_hash;
                    delete user.reset_token;
                    delete user.two_factor_secret;
                    
                    req.user = user;
                    res.locals.user = user;
                    res.locals.isAuthenticated = true;
                } else {
                    // User not found, clear session
                    req.session.destroy();
                }
            }
        } catch (error) {
            console.error('Error loading user:', error);
        }
        
        next();
    }

    // Middleware to require specific role
    requireRole(role) {
        return async (req, res, next) => {
            try {
                if (!req.user) {
                    return res.status(401).json({ error: 'Authentication required' });
                }

                // For admin role, check user account status
                if (role === 'admin') {
                    const user = await database.findById('users', req.user.user_id, 'user_id');
                    if (!user || user.account_status !== 'active') {
                        return res.status(403).json({ error: 'Access denied' });
                    }
                    // You might have an admin flag or role system
                    // For now, just check if user_id is in admin list or has admin field
                }

                next();
            } catch (error) {
                console.error('Role check error:', error);
                res.status(500).json({ error: 'Server error' });
            }
        };
    }

    // Middleware to require league membership
    requireLeagueMembership(req, res, next) {
        return async (req, res, next) => {
            try {
                const leagueId = req.params.leagueId || req.params.id;
                const userId = req.user.user_id;

                if (!leagueId) {
                    return res.status(400).json({ error: 'League ID required' });
                }

                // Check if user is member of the league
                const membership = await database.findOne('league_users', {
                    user_id: userId,
                    league_id: leagueId,
                    status: 'active'
                });

                if (!membership) {
                    if (req.xhr || req.headers.accept?.includes('application/json')) {
                        return res.status(403).json({ error: 'League membership required' });
                    }
                    req.flash('error', 'You must be a member of this league to access this page');
                    return res.redirect('/dashboard');
                }

                // Load league data
                const league = await database.findById('leagues', leagueId, 'league_id');
                if (!league) {
                    return res.status(404).json({ error: 'League not found' });
                }

                // Attach to request
                req.league = league;
                req.leagueMembership = membership;
                res.locals.league = league;
                res.locals.leagueMembership = membership;

                next();
            } catch (error) {
                console.error('League membership check error:', error);
                res.status(500).json({ error: 'Server error' });
            }
        };
    }

    // Middleware to require commissioner role in league
    requireCommissioner(req, res, next) {
        try {
            if (!req.league || !req.leagueMembership) {
                return res.status(400).json({ error: 'League context required' });
            }

            const isCommissioner = req.league.commissioner_id === req.user.user_id ||
                                 req.leagueMembership.role === 'co_commissioner';

            if (!isCommissioner) {
                if (req.xhr || req.headers.accept?.includes('application/json')) {
                    return res.status(403).json({ error: 'Commissioner access required' });
                }
                req.flash('error', 'Commissioner access required for this action');
                return res.redirect(`/leagues/${req.league.league_id}`);
            }

            next();
        } catch (error) {
            console.error('Commissioner check error:', error);
            res.status(500).json({ error: 'Server error' });
        }
    }

    // Middleware to check if picks are locked
    async requireUnlockedPicks(req, res, next) {
        try {
            const leagueId = req.params.leagueId || req.params.id;
            const week = req.params.week || req.body.week;

            if (!week) {
                return res.status(400).json({ error: 'Week parameter required' });
            }

            // Get games for this week
            const games = await database.executeMany(
                'SELECT game_id, kickoff_timestamp FROM games WHERE season_year = ? AND week = ? ORDER BY kickoff_timestamp ASC',
                [new Date().getFullYear(), week]
            );

            if (games.length === 0) {
                return res.status(404).json({ error: 'No games found for this week' });
            }

            // Check if deadline has passed (using first game kickoff as deadline)
            const firstGameTime = new Date(games[0].kickoff_timestamp);
            const now = new Date();

            // Get league settings for deadline type
            const settings = await database.findOne('confidence_pool_settings', { league_id: leagueId });
            
            let deadlineTime = firstGameTime;
            if (settings) {
                if (settings.pick_deadline_type === 'custom') {
                    deadlineTime = new Date(firstGameTime.getTime() - (settings.custom_deadline_minutes * 60 * 1000));
                }
                // 'kickoff' uses first game time, 'first_game' is same as kickoff
            }

            if (now >= deadlineTime) {
                return res.status(403).json({ 
                    error: 'Pick deadline has passed',
                    deadline: deadlineTime.toISOString()
                });
            }

            req.pickDeadline = deadlineTime;
            res.locals.pickDeadline = deadlineTime;
            next();
        } catch (error) {
            console.error('Pick deadline check error:', error);
            res.status(500).json({ error: 'Server error' });
        }
    }

    // Generate JWT token
    generateToken(user) {
        const payload = {
            userId: user.user_id,
            username: user.username,
            email: user.email
        };

        return jwt.sign(payload, process.env.JWT_SECRET, {
            expiresIn: process.env.JWT_EXPIRES_IN || '7d',
            issuer: 'nfl-pools',
            audience: 'nfl-pools-users'
        });
    }

    // Verify JWT token
    verifyToken(token) {
        try {
            return jwt.verify(token, process.env.JWT_SECRET);
        } catch (error) {
            return null;
        }
    }

    // Create secure session
    createSession(req, user) {
        req.session.userId = user.user_id;
        req.session.username = user.username;
        req.session.loginTime = new Date().toISOString();
        
        // Save the session to ensure it's persisted before continuing
        req.session.save((err) => {
            if (err) {
                console.error('Session save error:', err);
            }
        });
    }

    // Destroy session
    destroySession(req) {
        return new Promise((resolve, reject) => {
            req.session.destroy((err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    // Rate limiting for sensitive operations
    createRateLimit(windowMs, max, message) {
        const attempts = new Map();

        return (req, res, next) => {
            const key = req.ip + (req.user ? req.user.user_id : '');
            const now = Date.now();
            const windowStart = now - windowMs;

            // Clean old attempts
            if (attempts.has(key)) {
                const userAttempts = attempts.get(key).filter(time => time > windowStart);
                attempts.set(key, userAttempts);
            }

            const currentAttempts = attempts.get(key) || [];

            if (currentAttempts.length >= max) {
                return res.status(429).json({
                    error: message || 'Too many attempts, please try again later',
                    retryAfter: Math.ceil((currentAttempts[0] + windowMs - now) / 1000)
                });
            }

            currentAttempts.push(now);
            attempts.set(key, currentAttempts);
            next();
        };
    }
}

const authMiddleware = new AuthMiddleware();

// Bind methods to maintain context
module.exports = {
    requireAuth: authMiddleware.requireAuth.bind(authMiddleware),
    requireGuest: authMiddleware.requireGuest.bind(authMiddleware),
    loadUser: authMiddleware.loadUser.bind(authMiddleware),
    requireRole: authMiddleware.requireRole.bind(authMiddleware),
    requireLeagueMembership: authMiddleware.requireLeagueMembership.bind(authMiddleware),
    requireCommissioner: authMiddleware.requireCommissioner.bind(authMiddleware),
    requireUnlockedPicks: authMiddleware.requireUnlockedPicks.bind(authMiddleware),
    generateToken: authMiddleware.generateToken.bind(authMiddleware),
    verifyToken: authMiddleware.verifyToken.bind(authMiddleware),
    createSession: authMiddleware.createSession.bind(authMiddleware),
    destroySession: authMiddleware.destroySession.bind(authMiddleware),
    createRateLimit: authMiddleware.createRateLimit.bind(authMiddleware)
};