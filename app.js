// Load environment variables first
require('dotenv').config();

const express = require('express');
const http = require('http');
const path = require('path');
const expressLayouts = require('express-ejs-layouts');
const session = require('express-session');
const flash = require('connect-flash');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const useragent = require('express-useragent');
const methodOverride = require('method-override');

// Import configurations
const database = require('./config/database');
const socketManager = require('./config/socket');
const { themeMiddleware } = require('./config/themes');
const scheduledTasks = require('./services/ScheduledTasks');
const logger = require('./config/logger');

// Import middleware
const authMiddleware = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');
const rateLimiter = require('./middleware/rateLimit');
const navigationMiddleware = require('./middleware/navigation');
const SecurityConfig = require('./config/security');

// Import routes
const authRoutes = require('./routes/auth');
const leagueRoutes = require('./routes/leagues');
const pickRoutes = require('./routes/picks');
const standingsRoutes = require('./routes/standings');
const resultsRoutes = require('./routes/results');
const profileRoutes = require('./routes/profile');
const settingsRoutes = require('./routes/settings');
const chatRoutes = require('./routes/chat');
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');

class Application {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.port = process.env.PORT || 3000;
    }

    async initialize() {
        try {
            // Initialize database connection
            await database.initialize();

            // Configure middleware
            this.configureMiddleware();
            
            // Configure view engine
            this.configureViews();
            
            // Configure session
            this.configureSession();
            
            // Configure routes
            this.configureRoutes();
            
            // Configure error handling
            this.configureErrorHandling();
            
            // Initialize Socket.io with session middleware
            socketManager.initialize(this.server, this.sessionMiddleware);
            
            // Start scheduled tasks
            scheduledTasks.start();
            
            logger.info('Application initialized successfully');
        } catch (error) {
            logger.error('Application initialization failed', { error: error.message, stack: error.stack });
            process.exit(1);
        }
    }

    configureMiddleware() {
        // Enhanced security middleware
        this.app.use(SecurityConfig.securityHeaders);
        this.app.use(SecurityConfig.validateRequestSize);
        this.app.use(SecurityConfig.sanitizeInput);
        this.app.use(SecurityConfig.ipSecurity);
        this.app.use(SecurityConfig.securityLogger);
        
        // Helmet security headers
        this.app.use(helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://code.jquery.com"],
                    styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
                    fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
                    imgSrc: ["'self'", "data:", "https:", "http:"],
                    connectSrc: ["'self'", "ws:", "wss:", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"]
                }
            },
            crossOriginEmbedderPolicy: false,
            hsts: {
                maxAge: 31536000,
                includeSubDomains: true,
                preload: true
            }
        }));

        // CORS configuration
        this.app.use(cors({
            origin: process.env.CLIENT_URL || 'http://localhost:3000',
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
        }));

        // Compression and parsing
        this.app.use(compression());
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
        this.app.use(methodOverride('_method'));
        this.app.use(cookieParser());
        this.app.use(useragent.express());

        // Logging
        if (process.env.NODE_ENV === 'development') {
            this.app.use(morgan('dev'));
        } else {
            this.app.use(morgan('combined'));
        }

        // Static files
        this.app.use(express.static(path.join(__dirname, 'public'), {
            maxAge: process.env.NODE_ENV === 'production' ? '1d' : '0',
            etag: process.env.NODE_ENV === 'production'
        }));

        // Rate limiting
        this.app.use('/api/', rateLimiter.apiLimiter);
        this.app.use('/auth/', rateLimiter.authLimiter);
    }

    configureViews() {
        // Set view engine
        this.app.set('view engine', 'ejs');
        this.app.set('views', path.join(__dirname, 'views'));
        
        // Configure layouts
        this.app.use(expressLayouts);
        this.app.set('layout', 'layouts/main');
        this.app.set('layout extractScripts', true);
        this.app.set('layout extractStyles', true);

        // Global view variables and navigation context
        this.app.use(async (req, res, next) => {
            res.locals.appName = 'NFL Confidence Pools';
            res.locals.currentYear = new Date().getFullYear();
            res.locals.environment = process.env.NODE_ENV;
            res.locals.user = req.user || null;
            res.locals.isAuthenticated = !!req.user;
            res.locals.currentUrl = req.originalUrl;
            res.locals.messages = req.flash ? req.flash() : {};
            
            // Navigation context - counts and badges
            if (req.user) {
                try {
                    // Get active leagues count
                    const [leaguesResult] = await database.execute(
                        `SELECT COUNT(DISTINCT l.league_id) as count
                         FROM leagues l
                         JOIN league_users lu ON l.league_id = lu.league_id
                         WHERE lu.user_id = ? AND lu.status = 'active' AND l.status = 'active'`,
                        [req.user.user_id]
                    );
                    res.locals.activeLeaguesCount = leaguesResult[0]?.count || 0;
                    
                    // Get pending picks count (simplified for now)
                    res.locals.pendingPicksCount = 0; // Will be implemented with picks system
                    
                    // Check for new results (simplified for now)
                    res.locals.newResultsCount = 0; // Will be implemented with results system
                } catch (error) {
                    logger.error('Error loading navigation context', { error: error.message });
                    res.locals.activeLeaguesCount = 0;
                    res.locals.pendingPicksCount = 0;
                    res.locals.newResultsCount = 0;
                }
            }
            
            // Breadcrumbs array
            res.locals.breadcrumbs = [];
            
            next();
        });

        // Theme middleware
        this.app.use(themeMiddleware);
    }

    configureSession() {
        // Use enhanced secure session configuration
        const sessionConfig = {
            ...SecurityConfig.getSecureSessionConfig(),
            store: database.getSessionStore()
        };

        if (process.env.NODE_ENV === 'production') {
            this.app.set('trust proxy', 1);
        }

        // Store session middleware for Socket.IO sharing
        this.sessionMiddleware = session(sessionConfig);
        this.app.use(this.sessionMiddleware);
        this.app.use(flash());
    }

    configureRoutes() {
        // Root route - redirect to login
        this.app.get('/', (req, res) => {
            if (req.user) {
                return res.redirect('/dashboard');
            }
            return res.redirect('/auth/login');
        });

        // Direct join route that bypasses the leagues page
        this.app.get('/join', authMiddleware.requireAuth, async (req, res) => {
            const joinCode = req.query.code;
            
            if (!joinCode) {
                req.flash('error', 'No join code provided');
                return res.redirect('/dashboard');
            }

            try {
                const League = require('./models/League');
                
                // Find league by join code (case-insensitive)
                const league = await League.findByJoinCode(joinCode.toUpperCase());
                
                if (!league || league.status !== 'active') {
                    req.flash('error', 'Invalid or expired join code');
                    return res.redirect('/dashboard');
                }
                
                // Check if user is already a member
                const isMember = await League.isUserMember(league.league_id, req.user.user_id);
                if (isMember) {
                    req.flash('info', 'You are already a member of this league');
                    return res.redirect(`/dashboard?league_id=${league.league_id}`);
                }
                
                // Add user to league
                await League.addMember(league.league_id, req.user.user_id);
                
                req.flash('success', `Successfully joined ${league.league_name}!`);
                res.redirect(`/dashboard?league_id=${league.league_id}`);
                
            } catch (error) {
                logger.error('Join error', { error: error.message });
                req.flash('error', 'Error joining league. Please try again.');
                res.redirect('/dashboard');
            }
        });

        // Health check
        this.app.get('/health', async (req, res) => {
            const dbHealth = await database.healthCheck();
            const socketStats = socketManager.getStats();
            
            res.json({
                status: 'ok',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                database: dbHealth,
                sockets: socketStats,
                memory: process.memoryUsage(),
                version: process.env.npm_package_version || '1.0.0'
            });
        });

        // Choose action page (landing page for join codes and ads) - accessible to all users
        this.app.get('/start', (req, res) => {
            res.render('choose-action', {
                title: 'Get Started',
                appName: 'NFL Pools',
                layout: false  // Disable express-ejs-layouts for this route
            });
        });

        // Invite landing page
        this.app.get('/invite/:code', async (req, res) => {
            try {
                const joinCode = req.params.code?.toUpperCase();
                
                if (!joinCode || joinCode.length !== 8) {
                    req.flash('error', 'Invalid invite link');
                    return res.redirect('/start');
                }

                const League = require('./models/League');
                const league = await League.findByJoinCode(joinCode);
                
                if (!league || league.status !== 'active') {
                    req.flash('error', 'This invite link is invalid or has expired');
                    return res.redirect('/start');
                }

                // If user is already logged in, check if they're already a member
                if (req.session && req.session.userId) {
                    const isMember = await League.isUserMember(league.league_id, req.session.userId);
                    if (isMember) {
                        req.flash('success', `Welcome back to ${league.league_name}!`);
                        return res.redirect(`/dashboard?league_id=${league.league_id}`);
                    } else {
                        // User is logged in but not a member - join them directly
                        await League.addMember(league.league_id, req.session.userId);
                        req.flash('success', `Successfully joined ${league.league_name}!`);
                        return res.redirect(`/dashboard?league_id=${league.league_id}`);
                    }
                }

                // User not logged in - redirect directly to registration with join code
                res.redirect(`/auth/register?action=join-league&code=${joinCode}&league=${encodeURIComponent(league.league_name)}`);

            } catch (error) {
                logger.error('Invite landing error', { error: error.message });
                req.flash('error', 'An error occurred processing your invite');
                res.redirect('/start');
            }
        });

        // Authentication routes
        this.app.use('/auth', authRoutes);

        // Protected routes (require authentication)
        this.app.use('/dashboard', authMiddleware.requireAuth, authMiddleware.loadUser, navigationMiddleware, async (req, res) => {
            try {
                // Get user's leagues for dashboard first
                const leagues = await database.execute(
                    `SELECT 
                        l.*,
                        lu.role,
                        le.entry_id,
                        (SELECT COUNT(*) FROM league_users WHERE league_id = l.league_id AND status = 'active') as member_count,
                        CASE WHEN l.commissioner_id = ? THEN 'commissioner' ELSE lu.role END as actual_role,
                        (SELECT SUM(p.points_earned) FROM picks p 
                         JOIN league_entries le2 ON p.entry_id = le2.entry_id 
                         JOIN league_users lu2 ON le2.league_user_id = lu2.league_user_id 
                         WHERE lu2.user_id = ? AND lu2.league_id = l.league_id) as user_total_points,
                        (SELECT COUNT(DISTINCT p.week) FROM picks p 
                         JOIN league_entries le2 ON p.entry_id = le2.entry_id 
                         JOIN league_users lu2 ON le2.league_user_id = lu2.league_user_id 
                         WHERE lu2.user_id = ? AND lu2.league_id = l.league_id) as user_weeks_played,
                        (SELECT COUNT(DISTINCT p.week) FROM picks p 
                         JOIN league_entries le2 ON p.entry_id = le2.entry_id 
                         JOIN league_users lu2 ON le2.league_user_id = lu2.league_user_id 
                         WHERE lu2.user_id = ? AND lu2.league_id = l.league_id 
                         AND p.week IN (
                             SELECT completed_weeks.week FROM (
                                 SELECT g.week 
                                 FROM games g 
                                 LEFT JOIN results r ON g.game_id = r.game_id 
                                 WHERE g.season_year = 2025 
                                 GROUP BY g.week 
                                 HAVING COUNT(g.game_id) = COUNT(r.result_id) 
                                 AND COUNT(g.game_id) = SUM(CASE WHEN g.status = 'completed' THEN 1 ELSE 0 END)
                             ) completed_weeks
                         )) as user_completed_weeks
                     FROM leagues l
                     JOIN league_users lu ON l.league_id = lu.league_id
                     LEFT JOIN league_entries le ON lu.league_user_id = le.league_user_id AND le.status = 'active'
                     WHERE lu.user_id = ? AND lu.status = 'active' AND l.status = 'active'
                     ORDER BY l.league_name ASC
                     LIMIT 10`,
                    [req.user.user_id, req.user.user_id, req.user.user_id, req.user.user_id, req.user.user_id]
                );
                
                // If user has no leagues and isn't coming from a specific action, redirect to start page
                if ((!leagues || leagues.length === 0) && !req.query.from && req.path === '/dashboard') {
                    return res.redirect('/start');
                }
                
                // Determine selected league - validate membership if league_id provided
                let selectedLeagueId = req.query.league_id || req.session.joinedLeagueId || null;
                
                // Clear the joined league ID from session after using it
                if (req.session.joinedLeagueId) {
                    delete req.session.joinedLeagueId;
                }
                
                // SECURITY: Verify user is member of the requested league
                if (selectedLeagueId) {
                    const isMember = leagues && leagues.some(l => l.league_id == selectedLeagueId);
                    if (!isMember) {
                        // User is not a member of this league - clear the selection
                        logger.security('User attempted to access league without membership', { userId: req.user.user_id, leagueId: selectedLeagueId });
                        selectedLeagueId = null;
                        req.flash('error', 'You do not have access to that league');
                    }
                }
                
                // If no valid league selected, use first league user is member of
                if (!selectedLeagueId && leagues && leagues.length > 0) {
                    selectedLeagueId = leagues[0].league_id;
                }
                
                // Get current week info from database
                const { getCurrentNFLWeek, getHoursUntilDeadline } = require('./utils/getCurrentWeek');
                const currentWeek = await getCurrentNFLWeek(database) || 1;
                const hoursToDeadline = await getHoursUntilDeadline(database, currentWeek) || 48;
                
                // Get next pick deadline time for countdown (next upcoming game kickoff)
                const nextGameRows = await database.execute(
                    'SELECT kickoff_timestamp FROM games WHERE season_year = ? AND kickoff_timestamp > CONVERT_TZ(NOW(), "UTC", "America/New_York") ORDER BY kickoff_timestamp ASC LIMIT 1',
                    [new Date().getFullYear()]
                ) || [];
                const nextPickDeadline = (nextGameRows && nextGameRows.length > 0) ? new Date(nextGameRows[0].kickoff_timestamp) : null;
                
                // Get number of games this week
                const [gamesCountRow] = await database.execute(
                    'SELECT COUNT(*) as count FROM games WHERE week = ? AND season_year = ?',
                    [currentWeek, new Date().getFullYear()]
                ) || [];
                const gamesThisWeek = gamesCountRow ? gamesCountRow.count : 16;
                // Dashboard metrics logging removed for production
                
                // Get picks to make count
                const [picksNeededRow] = await database.execute(
                    `SELECT COUNT(DISTINCT le.entry_id) as count
                     FROM league_entries le
                     JOIN league_users lu ON le.league_user_id = lu.league_user_id
                     WHERE lu.user_id = ? AND le.status = 'active'
                     AND le.entry_id NOT IN (
                         SELECT DISTINCT entry_id FROM picks WHERE week = ?
                     )`,
                    [req.user.user_id, currentWeek]
                ) || [];
                const picksToMake = picksNeededRow ? picksNeededRow.count : 0;
                
                // Get user stats - filter by selected league if specified
                let statsQuery;
                let statsParams;
                
                if (selectedLeagueId) {
                    statsQuery = `SELECT 
                        COUNT(DISTINCT p.week) as weeks_played,
                        SUM(p.points_earned) as total_points,
                        SUM(CASE WHEN p.is_correct = 1 THEN 1 ELSE 0 END) as correct_picks,
                        COUNT(p.pick_id) as total_picks
                     FROM picks p
                     JOIN league_entries le ON p.entry_id = le.entry_id
                     JOIN league_users lu ON le.league_user_id = lu.league_user_id
                     JOIN leagues l ON lu.league_id = l.league_id
                     JOIN games g ON p.game_id = g.game_id
                     JOIN results r ON g.game_id = r.game_id
                     WHERE lu.user_id = ? AND l.league_id = ? AND g.status = 'completed' AND r.final_status IN ('final', 'final_ot')`;
                    statsParams = [req.user.user_id, selectedLeagueId];
                } else {
                    statsQuery = `SELECT 
                        COUNT(DISTINCT p.week) as weeks_played,
                        SUM(p.points_earned) as total_points,
                        SUM(CASE WHEN p.is_correct = 1 THEN 1 ELSE 0 END) as correct_picks,
                        COUNT(p.pick_id) as total_picks
                     FROM picks p
                     JOIN league_entries le ON p.entry_id = le.entry_id
                     JOIN league_users lu ON le.league_user_id = lu.league_user_id
                     JOIN games g ON p.game_id = g.game_id
                     JOIN results r ON g.game_id = r.game_id
                     WHERE lu.user_id = ? AND g.status = 'completed' AND r.final_status IN ('final', 'final_ot')`;
                    statsParams = [req.user.user_id];
                }
                
                const [userStats] = await database.execute(statsQuery, statsParams) || [];
                
                const totalPoints = userStats ? (parseInt(userStats.total_points) || 0) : 0;
                const correctPicks = userStats ? (parseInt(userStats.correct_picks) || 0) : 0;
                const totalPicks = userStats ? (parseInt(userStats.total_picks) || 0) : 0;
                const winPercentage = totalPicks > 0 ? Math.round((correctPicks / totalPicks) * 100) : 0;
                
                // Get recent activity - filter by selected league if specified
                let activityQuery;
                let activityParams;
                
                if (selectedLeagueId) {
                    activityQuery = `SELECT 
                        'pick' as type,
                        CONCAT('Submitted picks for Week ', p.week, ' in ', l.league_name) as text,
                        MAX(p.picked_at) as time
                     FROM picks p
                     JOIN league_entries le ON p.entry_id = le.entry_id
                     JOIN league_users lu ON le.league_user_id = lu.league_user_id
                     JOIN leagues l ON lu.league_id = l.league_id
                     WHERE lu.user_id = ? AND l.league_id = ?
                     GROUP BY p.week, l.league_name
                     ORDER BY MAX(p.picked_at) DESC
                     LIMIT 5`;
                    activityParams = [req.user.user_id, selectedLeagueId];
                } else {
                    activityQuery = `SELECT 
                        'pick' as type,
                        CONCAT('Submitted picks for Week ', p.week) as text,
                        MAX(p.picked_at) as time
                     FROM picks p
                     JOIN league_entries le ON p.entry_id = le.entry_id
                     JOIN league_users lu ON le.league_user_id = lu.league_user_id
                     WHERE lu.user_id = ?
                     GROUP BY p.week
                     ORDER BY MAX(p.picked_at) DESC
                     LIMIT 5`;
                    activityParams = [req.user.user_id];
                }
                
                const activities = await database.execute(activityQuery, activityParams) || [];
                
                const recentActivity = activities.map(a => ({
                    icon: a.type === 'pick' ? 'fa-edit' : 'fa-trophy',
                    text: a.text,
                    time: a.time ? formatTimeAgo(a.time) : 'Unknown'
                }));
                
                // Get league settings for selected league
                let leagueSettings = null;
                if (selectedLeagueId) {
                    const settingsQuery = `
                        SELECT 
                            l.pool_type, 
                            l.deadline_type, 
                            l.weekly_deadline,
                            l.privacy,
                            l.pick_method
                        FROM leagues l
                        WHERE l.league_id = ?
                    `;
                    
                    const [settings] = await database.execute(settingsQuery, [selectedLeagueId]);
                    leagueSettings = settings;
                }
                
                // Get commissioner messages for selected league only
                let commissionerMessages = [];
                if (selectedLeagueId) {
                    const messagesQuery = `
                        SELECT lm.*, u.username as posted_by_username, l.league_name
                        FROM league_messages lm
                        LEFT JOIN users u ON lm.posted_by = u.user_id
                        LEFT JOIN leagues l ON lm.league_id = l.league_id
                        WHERE lm.league_id = ?
                        ORDER BY lm.created_at DESC
                        LIMIT 5
                    `;
                    
                    const messages = await database.executeMany(messagesQuery, [selectedLeagueId]);
                    commissionerMessages = messages.map(msg => ({
                        message_id: msg.message_id,
                        title: msg.title,
                        content: msg.content,
                        important: !!msg.important,
                        created_at: msg.created_at,
                        posted_by: msg.posted_by_username || 'Unknown',
                        league_name: msg.league_name
                    }));
                }
                
                // Helper function to format time ago
                function formatTimeAgo(date) {
                    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
                    const intervals = [
                        { label: 'year', seconds: 31536000 },
                        { label: 'month', seconds: 2592000 },
                        { label: 'day', seconds: 86400 },
                        { label: 'hour', seconds: 3600 },
                        { label: 'minute', seconds: 60 }
                    ];
                    
                    for (const interval of intervals) {
                        const count = Math.floor(seconds / interval.seconds);
                        if (count >= 1) {
                            return count === 1 ? `1 ${interval.label} ago` : `${count} ${interval.label}s ago`;
                        }
                    }
                    return 'Just now';
                }
                
                res.render('dashboard/index', {
                    title: 'Dashboard',
                    user: req.user,
                    userLeagues: leagues,
                    selectedLeagueId,
                    leagueSettings,
                    currentWeek,
                    picksToMake,
                    gamesThisWeek,
                    hoursToDeadline,
                    nextPickDeadline, // Pass the next pick deadline time
                    activeLeaguesCount: leagues ? leagues.length : 0,
                    totalWins: 0,  // This would need a more complex query
                    winPercentage,
                    correctPicks,
                    totalPicks,
                    totalPoints,
                    recentActivity,
                    commissionerMessages
                });
            } catch (error) {
                logger.error('Dashboard error', { error: error.message, userId: req.user?.user_id });
                
                // Get current week even in error case
                const { getCurrentNFLWeek } = require('./utils/getCurrentWeek');
                let currentWeek = 1;
                try {
                    currentWeek = await getCurrentNFLWeek(database) || 1;
                } catch (e) {
                    logger.error('Failed to get current week', { error: e.message });
                }
                
                res.render('dashboard/index', {
                    title: 'Dashboard',
                    user: req.user,
                    userLeagues: [],
                    selectedLeagueId: req.query.league_id || null,
                    currentWeek,
                    picksToMake: 0,
                    gamesThisWeek: 16,
                    hoursToDeadline: 48,
                    nextPickDeadline: null, // No game data in error case
                    activeLeaguesCount: 0,
                    totalWins: 0,
                    winPercentage: 0,
                    correctPicks: 0,
                    totalPicks: 0,
                    totalPoints: 0,
                    recentActivity: [],
                    commissionerMessages: [],
                    error: 'Failed to load some dashboard data'
                });
            }
        });

        // Start page for new users (after registration)
        this.app.get('/start', authMiddleware.requireAuth, authMiddleware.loadUser, navigationMiddleware, async (req, res) => {
            try {
                res.render('start/index', {
                    title: 'Get Started',
                    user: req.user
                });
            } catch (error) {
                logger.error('Start page error', { error: error.message, userId: req.user?.user_id });
                res.redirect('/dashboard');
            }
        });

        // API endpoint to get next pick deadline
        this.app.get('/api/next-deadline', authMiddleware.requireAuth, async (req, res) => {
            try {
                const excludeDeadline = req.query.exclude;
                
                let query;
                let params;
                
                if (excludeDeadline) {
                    // Find the next deadline AFTER the one that just expired
                    query = 'SELECT kickoff_timestamp FROM games WHERE season_year = ? AND kickoff_timestamp > ? ORDER BY kickoff_timestamp ASC LIMIT 1';
                    params = [new Date().getFullYear(), excludeDeadline];
                } else {
                    // Use the normal logic for initial load
                    query = 'SELECT kickoff_timestamp FROM games WHERE season_year = ? AND kickoff_timestamp > CONVERT_TZ(NOW(), "UTC", "America/New_York") ORDER BY kickoff_timestamp ASC LIMIT 1';
                    params = [new Date().getFullYear()];
                }
                
                const nextGameRows = await database.execute(query, params) || [];
                
                let nextPickDeadline = null;
                if (nextGameRows && nextGameRows.length > 0) {
                    nextPickDeadline = new Date(nextGameRows[0].kickoff_timestamp);
                }
                
                // Get count of games at this deadline for info
                let gameCount = 0;
                if (nextPickDeadline) {
                    const [countRow] = await database.execute(
                        'SELECT COUNT(*) as count FROM games WHERE kickoff_timestamp = ?',
                        [nextGameRows[0].kickoff_timestamp]
                    ) || [];
                    gameCount = countRow ? countRow.count : 0;
                }
                
                res.json({
                    success: true,
                    nextDeadline: nextPickDeadline ? nextPickDeadline.toISOString() : null,
                    gamesAtDeadline: gameCount
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: 'Failed to get next deadline'
                });
            }
        });

        this.app.use('/leagues', authMiddleware.requireAuth, authMiddleware.loadUser, navigationMiddleware, leagueRoutes);
        this.app.use('/picks', authMiddleware.requireAuth, authMiddleware.loadUser, navigationMiddleware, pickRoutes);
        this.app.use('/standings', authMiddleware.requireAuth, authMiddleware.loadUser, navigationMiddleware, standingsRoutes);
        this.app.use('/results', authMiddleware.requireAuth, authMiddleware.loadUser, navigationMiddleware, resultsRoutes);
        this.app.use('/profile', authMiddleware.requireAuth, authMiddleware.loadUser, navigationMiddleware, profileRoutes);
        this.app.use('/settings', authMiddleware.requireAuth, authMiddleware.loadUser, navigationMiddleware, settingsRoutes);
        this.app.use('/chat', authMiddleware.requireAuth, authMiddleware.loadUser, navigationMiddleware, chatRoutes);
        this.app.use('/admin', authMiddleware.requireAuth, authMiddleware.loadUser, navigationMiddleware, authMiddleware.requireRole('admin'), adminRoutes);

        // API routes
        this.app.use('/api', apiRoutes);

        // 404 handler
        this.app.use('*', (req, res) => {
            res.status(404).render('errors/404', {
                title: 'Page Not Found',
                layout: 'layouts/error'
            });
        });
    }

    configureErrorHandling() {
        // Enhanced global error handler
        this.app.use(SecurityConfig.handleError);

        // Uncaught exception handler
        process.on('uncaughtException', (error) => {
            logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
            this.gracefulShutdown('UNCAUGHT_EXCEPTION');
        });

        // Unhandled rejection handler
        process.on('unhandledRejection', (reason, promise) => {
            logger.error('Unhandled Promise Rejection', { reason, stack: reason?.stack });
            this.gracefulShutdown('UNHANDLED_REJECTION');
        });

        // Graceful shutdown handlers
        process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));
    }

    async start() {
        try {
            await this.initialize();
            
            this.server.listen(this.port, () => {
                logger.info('Server started successfully', {
                    port: this.port,
                    environment: process.env.NODE_ENV || 'development',
                    features: ['mobile-responsive', 'real-time', 'multi-theme'],
                    url: process.env.NODE_ENV === 'development' ? `http://localhost:${this.port}` : undefined
                });
            });
        } catch (error) {
            logger.error('Failed to start server', { error: error.message, stack: error.stack });
            process.exit(1);
        }
    }

    async gracefulShutdown(signal) {
        logger.info('Graceful shutdown initiated', { signal });
        
        // Close server to stop accepting new connections
        this.server.close(async (error) => {
            if (error) {
                logger.error('Error during server close', { error: error.message });
                process.exit(1);
            }
            
            logger.info('HTTP server closed successfully');
            
            try {
                // Stop scheduled tasks
                scheduledTasks.stop();
                
                // Close database connections
                await database.close();
                logger.info('Database connections closed successfully');
                
                logger.info('Graceful shutdown completed successfully');
                process.exit(0);
            } catch (error) {
                logger.error('Error during graceful shutdown', { error: error.message });
                process.exit(1);
            }
        });
        
        // Force close after timeout
        setTimeout(() => {
            logger.error('Graceful shutdown timeout, forcing exit');
            process.exit(1);
        }, 10000);
    }
}

// Create and start application
const app = new Application();

// Only start if this file is run directly (not imported)
if (require.main === module) {
    app.start().catch(error => {
        logger.error('Application startup failed', { error: error.message, stack: error.stack });
        process.exit(1);
    });
}

module.exports = app;