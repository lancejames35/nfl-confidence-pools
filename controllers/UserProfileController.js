const database = require('../config/database');
const User = require('../models/User');
const { validationResult } = require('express-validator');

class UserProfileController {
    /**
     * Display user's profile with comprehensive statistics
     */
    static async profile(req, res) {
        try {
            const userId = req.params.user_id ? parseInt(req.params.user_id) : req.user.user_id;
            const isOwnProfile = userId === req.user.user_id;
            
            // Get user details
            const user = await User.findById(userId);
            if (!user) {
                req.flash('error', 'User not found');
                return res.redirect('/dashboard');
            }
            
            // Get comprehensive user statistics
            const [userStats, leagueHistory, recentActivity, achievements] = await Promise.all([
                this.getUserStats(userId),
                this.getLeagueHistory(userId),
                this.getRecentActivity(userId, 10),
                this.getUserAchievements(userId)
            ]);
            
            res.render('profile/index', {
                title: `${user.username}'s Profile`,
                profileUser: user,
                isOwnProfile,
                userStats,
                leagueHistory,
                recentActivity,
                achievements,
                user: req.user
            });
        } catch (error) {
            req.flash('error', 'Error loading profile');
            res.redirect('/dashboard');
        }
    }
    
    /**
     * Show profile edit form
     */
    static async editProfile(req, res) {
        try {
            const user = await User.findById(req.user.user_id);
            if (!user) {
                req.flash('error', 'User not found');
                return res.redirect('/dashboard');
            }
            
            res.render('profile/edit', {
                title: 'Edit Profile',
                profileUser: user,
                user: req.user
            });
        } catch (error) {
            req.flash('error', 'Error loading profile edit form');
            res.redirect('/profile');
        }
    }
    
    /**
     * Update user profile
     */
    static async updateProfile(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                req.flash('error', 'Please correct the errors in your form');
                return res.redirect('/profile/edit');
            }
            
            const { username, email } = req.body;
            const userId = req.user.user_id;
            
            // Check username availability (excluding current user)
            if (username !== req.user.username) {
                const usernameAvailable = await User.checkUsernameAvailable(username, userId);
                if (!usernameAvailable) {
                    req.flash('error', 'Username is already taken');
                    return res.redirect('/profile/edit');
                }
            }
            
            // Check email availability (excluding current user)
            if (email !== req.user.email) {
                const emailAvailable = await User.checkEmailAvailable(email, userId);
                if (!emailAvailable) {
                    req.flash('error', 'Email is already registered');
                    return res.redirect('/profile/edit');
                }
            }
            
            // Update user
            const user = await User.findById(userId);
            await user.update({ username, email });
            
            req.flash('success', 'Profile updated successfully');
            res.redirect('/profile');
        } catch (error) {
            req.flash('error', 'Error updating profile');
            res.redirect('/profile/edit');
        }
    }
    
    /**
     * Show password change form
     */
    static async changePasswordForm(req, res) {
        res.render('profile/change-password', {
            title: 'Change Password',
            user: req.user
        });
    }
    
    /**
     * Update user password
     */
    static async changePassword(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                req.flash('error', 'Please correct the errors in your form');
                return res.redirect('/profile/change-password');
            }
            
            const { currentPassword, newPassword, confirmPassword } = req.body;
            
            if (newPassword !== confirmPassword) {
                req.flash('error', 'New passwords do not match');
                return res.redirect('/profile/change-password');
            }
            
            const user = await User.findById(req.user.user_id);
            const isCurrentPasswordValid = await user.validatePassword(currentPassword);
            
            if (!isCurrentPasswordValid) {
                req.flash('error', 'Current password is incorrect');
                return res.redirect('/profile/change-password');
            }
            
            await user.updatePassword(newPassword);
            
            req.flash('success', 'Password updated successfully');
            res.redirect('/profile');
        } catch (error) {
            req.flash('error', 'Error changing password');
            res.redirect('/profile/change-password');
        }
    }
    
    /**
     * Display user's detailed pick history
     */
    static async pickHistory(req, res) {
        try {
            const userId = req.params.user_id ? parseInt(req.params.user_id) : req.user.user_id;
            const isOwnProfile = userId === req.user.user_id;
            const page = parseInt(req.query.page) || 1;
            const limit = 25;
            const offset = (page - 1) * limit;
            
            const user = await User.findById(userId);
            if (!user) {
                req.flash('error', 'User not found');
                return res.redirect('/dashboard');
            }
            
            // Get pick history with pagination
            const picksQuery = `
                SELECT 
                    p.*,
                    g.week,
                    g.season_year,
                    home_team.abbreviation as home_team,
                    away_team.abbreviation as away_team,
                    g.kickoff_timestamp,
                    r.home_score,
                    r.away_score,
                    r.winning_team,
                    l.league_name,
                    le.team_name as entry_name,
                    home_team.full_name as home_team_name,
                    away_team.full_name as away_team_name
                FROM picks p
                JOIN league_entries le ON p.entry_id = le.entry_id
                JOIN league_users lu ON le.league_user_id = lu.league_user_id
                JOIN leagues l ON lu.league_id = l.league_id
                JOIN games g ON p.game_id = g.game_id
                JOIN teams home_team ON g.home_team_id = home_team.team_id
                JOIN teams away_team ON g.away_team_id = away_team.team_id
                LEFT JOIN results r ON g.game_id = r.game_id
                WHERE lu.user_id = ?
                ORDER BY g.kickoff_timestamp DESC, p.created_at DESC
                LIMIT ? OFFSET ?
            `;
            
            const picks = await database.execute(picksQuery, [userId, limit, offset]);
            
            // Get total count for pagination
            const countQuery = `
                SELECT COUNT(*) as total
                FROM picks p
                JOIN league_entries le ON p.entry_id = le.entry_id
                JOIN league_users lu ON le.league_user_id = lu.league_user_id
                WHERE lu.user_id = ?
            `;
            const [{ total }] = await database.execute(countQuery, [userId]);
            
            const totalPages = Math.ceil(total / limit);
            
            res.render('profile/pick-history', {
                title: `${user.username}'s Pick History`,
                profileUser: user,
                isOwnProfile,
                picks,
                pagination: {
                    current: page,
                    total: totalPages,
                    hasNext: page < totalPages,
                    hasPrev: page > 1,
                    next: page + 1,
                    prev: page - 1
                },
                user: req.user
            });
        } catch (error) {
            req.flash('error', 'Error loading pick history');
            res.redirect('/profile');
        }
    }
    
    /**
     * Get comprehensive user statistics
     */
    static async getUserStats(userId) {
        try {
            const statsQuery = `
                SELECT 
                    COUNT(DISTINCT lu.league_id) as total_leagues,
                    COUNT(DISTINCT le.entry_id) as total_entries,
                    COUNT(p.pick_id) as total_picks,
                    SUM(CASE WHEN p.is_correct = 1 THEN 1 ELSE 0 END) as correct_picks,
                    SUM(p.points_earned) as total_points,
                    AVG(CASE WHEN p.is_correct = 1 THEN p.confidence_points END) as avg_correct_confidence,
                    MAX(p.points_earned) as best_single_pick,
                    COUNT(DISTINCT g.week) as weeks_played,
                    COUNT(DISTINCT g.season_year) as seasons_played
                FROM league_users lu
                JOIN league_entries le ON lu.league_user_id = le.league_user_id
                LEFT JOIN picks p ON le.entry_id = p.entry_id
                LEFT JOIN games g ON p.game_id = g.game_id
                WHERE lu.user_id = ?
            `;
            
            const [stats] = await database.execute(statsQuery, [userId]);
            
            // Get league standings (current positions)
            const standingsQuery = `
                SELECT 
                    l.league_name,
                    le.team_name,
                    SUM(p.points_earned) as league_points,
                    COUNT(CASE WHEN p.is_correct = 1 THEN 1 END) as league_correct,
                    COUNT(p.pick_id) as league_picks,
                    (
                        SELECT COUNT(*) + 1
                        FROM league_entries le2
                        JOIN league_users lu2 ON le2.league_user_id = lu2.league_user_id
                        LEFT JOIN picks p2 ON le2.entry_id = p2.entry_id
                        WHERE lu2.league_id = l.league_id
                        AND SUM(p2.points_earned) > SUM(p.points_earned)
                        GROUP BY le2.entry_id
                    ) as current_position
                FROM leagues l
                JOIN league_users lu ON l.league_id = lu.league_id
                JOIN league_entries le ON lu.league_user_id = le.league_user_id
                LEFT JOIN picks p ON le.entry_id = p.entry_id
                WHERE lu.user_id = ?
                GROUP BY l.league_id, le.entry_id
                ORDER BY league_points DESC
            `;
            
            const standings = await database.execute(standingsQuery, [userId]);
            
            // Calculate derived stats
            const accuracy = stats.total_picks > 0 ? 
                (stats.correct_picks / stats.total_picks * 100).toFixed(1) : 0;
            
            const avgPointsPerPick = stats.total_picks > 0 ? 
                (stats.total_points / stats.total_picks).toFixed(1) : 0;
            
            return {
                ...stats,
                accuracy,
                avgPointsPerPick,
                standings,
                avgCorrectConfidence: stats.avg_correct_confidence ? 
                    parseFloat(stats.avg_correct_confidence).toFixed(1) : null
            };
        } catch (error) {
            throw error;
        }
    }
    
    /**
     * Get user's league history
     */
    static async getLeagueHistory(userId) {
        try {
            const query = `
                SELECT 
                    l.*,
                    le.team_name,
                    le.created_at as joined_at,
                    COUNT(p.pick_id) as picks_made,
                    SUM(p.points_earned) as total_points,
                    SUM(CASE WHEN p.is_correct = 1 THEN 1 ELSE 0 END) as correct_picks,
                    CASE 
                        WHEN l.status = 'active' THEN 'Active'
                        WHEN l.status = 'completed' THEN 'Completed'
                        ELSE 'Inactive'
                    END as league_status
                FROM leagues l
                JOIN league_users lu ON l.league_id = lu.league_id
                JOIN league_entries le ON lu.league_user_id = le.league_user_id
                LEFT JOIN picks p ON le.entry_id = p.entry_id
                WHERE lu.user_id = ?
                GROUP BY l.league_id, le.entry_id
                ORDER BY le.created_at DESC
            `;
            
            return await database.execute(query, [userId]);
        } catch (error) {
            throw error;
        }
    }
    
    /**
     * Get user's recent activity
     */
    static async getRecentActivity(userId, limit = 10) {
        try {
            const query = `
                SELECT 
                    'pick_made' as activity_type,
                    p.created_at as activity_time,
                    p.selected_team,
                    p.confidence_points,
                    p.points_earned,
                    p.is_correct,
                    home_team.abbreviation as home_team,
                    away_team.abbreviation as away_team,
                    g.week,
                    l.league_name,
                    le.team_name as entry_name
                FROM picks p
                JOIN league_entries le ON p.entry_id = le.entry_id
                JOIN league_users lu ON le.league_user_id = lu.league_user_id
                JOIN leagues l ON lu.league_id = l.league_id
                JOIN games g ON p.game_id = g.game_id
                WHERE lu.user_id = ?
                ORDER BY p.created_at DESC
                LIMIT ?
            `;
            
            const activities = await database.execute(query, [userId, limit]);
            
            return activities.map(activity => ({
                ...activity,
                description: this.generateActivityDescription(activity)
            }));
        } catch (error) {
            return [];
        }
    }
    
    /**
     * Get user achievements and milestones
     */
    static async getUserAchievements(userId) {
        try {
            const stats = await this.getUserStats(userId);
            const achievements = [];
            
            // Pick-based achievements
            if (stats.total_picks >= 100) {
                achievements.push({
                    title: 'Century Club',
                    description: 'Made 100+ picks',
                    icon: 'fas fa-hundred-points',
                    category: 'picks',
                    earned: true
                });
            }
            
            if (stats.total_picks >= 500) {
                achievements.push({
                    title: 'Pick Master',
                    description: 'Made 500+ picks',
                    icon: 'fas fa-star',
                    category: 'picks',
                    earned: true
                });
            }
            
            // Accuracy achievements
            if (parseFloat(stats.accuracy) >= 70 && stats.total_picks >= 50) {
                achievements.push({
                    title: 'Sharp Shooter',
                    description: '70%+ accuracy (50+ picks)',
                    icon: 'fas fa-bullseye',
                    category: 'accuracy',
                    earned: true
                });
            }
            
            if (parseFloat(stats.accuracy) >= 60 && stats.total_picks >= 100) {
                achievements.push({
                    title: 'Consistent Performer',
                    description: '60%+ accuracy (100+ picks)',
                    icon: 'fas fa-chart-line',
                    category: 'accuracy',
                    earned: true
                });
            }
            
            // League achievements
            if (stats.total_leagues >= 5) {
                achievements.push({
                    title: 'League Hopper',
                    description: 'Joined 5+ leagues',
                    icon: 'fas fa-users',
                    category: 'leagues',
                    earned: true
                });
            }
            
            // Points achievements
            if (stats.total_points >= 1000) {
                achievements.push({
                    title: 'Point Collector',
                    description: 'Earned 1000+ points',
                    icon: 'fas fa-coins',
                    category: 'points',
                    earned: true
                });
            }
            
            // Time-based achievements
            if (stats.seasons_played >= 2) {
                achievements.push({
                    title: 'Veteran Player',
                    description: 'Played 2+ seasons',
                    icon: 'fas fa-medal',
                    category: 'experience',
                    earned: true
                });
            }
            
            return achievements;
        } catch (error) {
            return [];
        }
    }
    
    /**
     * Generate activity description
     */
    static generateActivityDescription(activity) {
        const result = activity.is_correct === 1 ? 'won' : activity.is_correct === 0 ? 'lost' : 'pending';
        const points = activity.is_correct === 1 ? `+${activity.points_earned}` : '0';
        
        return `Picked ${activity.selected_team} (${activity.confidence_points} confidence) for ${activity.away_team} @ ${activity.home_team} - ${result} (${points} pts)`;
    }

    /**
     * Display settings page
     */
    static async settings(req, res) {
        try {
            const user = await User.findById(req.user.user_id);
            if (!user) {
                req.flash('error', 'User not found');
                return res.redirect('/dashboard');
            }

            res.render('settings/index', {
                title: 'Account Settings',
                user: user
            });
        } catch (error) {
            req.flash('error', 'Error loading settings');
            res.redirect('/dashboard');
        }
    }

    /**
     * Update user settings
     */
    static async updateSettings(req, res) {
        try {
            // Check validation errors
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                const firstError = errors.array()[0];
                return res.status(400).json({
                    success: false,
                    message: firstError.msg,
                    field: firstError.param
                });
            }

            const { currentPassword, firstName, lastName, username, email, newPassword } = req.body;

            // Get current user
            const user = await User.findById(req.user.user_id);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            // Check if any changes are being made
            const hasChanges = (
                firstName !== (user.first_name || '') ||
                lastName !== (user.last_name || '') ||
                username !== user.username ||
                email !== user.email ||
                newPassword
            );

            if (!hasChanges) {
                return res.json({
                    success: true,
                    message: 'No changes to save'
                });
            }

            // Only verify current password if changes are being made
            if (!currentPassword) {
                return res.status(400).json({
                    success: false,
                    message: 'Current password is required to make changes',
                    field: 'currentPassword'
                });
            }

            const isCurrentPasswordValid = await user.validatePassword(currentPassword);
            if (!isCurrentPasswordValid) {
                return res.status(400).json({
                    success: false,
                    message: 'Current password is incorrect',
                    field: 'currentPassword'
                });
            }

            // Check if username is changing and if new username is available
            let usernameChanged = false;
            if (username !== user.username) {
                const existingUser = await User.findByUsername(username);
                if (existingUser && existingUser.user_id !== user.user_id) {
                    return res.status(400).json({
                        success: false,
                        message: 'Username is already taken',
                        field: 'username'
                    });
                }
                usernameChanged = true;
            }

            // Check if email is changing and if new email is available
            if (email !== user.email) {
                const existingUser = await User.findByEmail(email);
                if (existingUser && existingUser.user_id !== user.user_id) {
                    return res.status(400).json({
                        success: false,
                        message: 'Email is already registered',
                        field: 'email'
                    });
                }
            }

            // Update user information
            const updateData = {
                first_name: firstName || null,
                last_name: lastName || null,
                username: username,
                email: email
            };

            await user.update(updateData);
            
            // Update password separately if provided
            if (newPassword) {
                await user.updatePassword(newPassword);
            }

            // Update session user data if username changed
            if (usernameChanged) {
                req.user.username = username;
            }

            res.json({
                success: true,
                message: 'Settings updated successfully',
                usernameChanged: usernameChanged
            });

        } catch (error) {
            // Settings update error
            res.status(500).json({
                success: false,
                message: 'An error occurred while updating settings'
            });
        }
    }
}

module.exports = UserProfileController;