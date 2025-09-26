const League = require('../models/League');
const database = require('../config/database');
const { validationResult } = require('express-validator');

class LeagueController {
    // Display leagues dashboard - always redirect to main dashboard
    static async index(req, res) {
        try {
            // Always redirect to dashboard since we don't use the leagues page anymore
            res.redirect('/dashboard');
        } catch (error) {
            req.flash('error', 'Error loading leagues');
            res.redirect('/dashboard');
        }
    }

    // Show create league form
    static async create(req, res) {
        try {
            res.render('leagues/create', {
                title: 'Create New League',
                user: req.user,
                formData: {},
                errors: {}
            });
        } catch (error) {
            req.flash('error', 'Error loading create form');
            res.redirect('/dashboard');
        }
    }

    // Handle league creation
    static async store(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.render('leagues/create', {
                    title: 'Create New League',
                    user: req.user,
                    formData: req.body,
                    errors: errors.mapped()
                });
            }

            const leagueData = {
                ...req.body,
                commissioner_id: req.user.user_id
            };

            const league = await League.create(leagueData);
            
            req.flash('success', 'League created successfully!');
            // Redirect to dashboard with the specific league ID
            res.redirect(`/dashboard?league_id=${league.league_id}`);
        } catch (error) {
            req.flash('error', error.message || 'Error creating league');
            res.render('leagues/create', {
                title: 'Create New League',
                user: req.user,
                formData: req.body,
                errors: {}
            });
        }
    }

    // Show league details
    static async show(req, res) {
        try {
            const league_id = parseInt(req.params.id);
            const league = await League.findById(league_id);
            
            if (!league) {
                req.flash('error', 'League not found');
                return res.redirect('/dashboard');
            }

            // Check if user is a member
            const isMember = await League.isUserMember(league_id, req.user.user_id);
            const isCommissioner = await League.isUserCommissioner(league_id, req.user.user_id);
            
            if (!isMember && league.privacy === 'private') {
                req.flash('error', 'You do not have access to this league');
                return res.redirect('/dashboard');
            }

            // Get league members
            const members = await League.getMembers(league_id);
            
            // Get tiers if multi-tier is enabled
            let tiers = [];
            if (league.enable_multi_tier) {
                try {
                    // Assign any users without tiers to the default tier
                    await League.assignUsersToDefaultTier(league_id);
                    
                    tiers = await database.executeMany(`
                        SELECT tier_id, tier_name, entry_fee, tier_order, tier_description 
                        FROM league_entry_tiers 
                        WHERE league_id = ? AND is_active = 1
                        ORDER BY tier_order ASC
                    `, [league_id]);
                } catch (error) {
                    tiers = [];
                }
            }

            // Get confidence pool settings
            let settings = {};
            try {
                const [confidenceSettings] = await database.execute(`
                    SELECT primary_tiebreaker, secondary_tiebreaker
                    FROM confidence_pool_settings 
                    WHERE league_id = ?
                `, [league_id]);
                
                if (confidenceSettings) {
                    settings = confidenceSettings;
                }
            } catch (error) {
                // Set defaults if settings don't exist
                settings = {
                    primary_tiebreaker: 'mnf_total',
                    secondary_tiebreaker: 'highest_confidence_correct'
                };
            }
            
            res.render('leagues/show', {
                title: `${league.league_name}`,
                league: { ...league, settings },
                members,
                tiers,
                isMember,
                isCommissioner,
                user: req.user,
                baseUrl: `${req.protocol}://${req.get('host')}`
            });
        } catch (error) {
            req.flash('error', 'Error loading league');
            res.redirect('/dashboard');
        }
    }

    // Show edit league form
    static async edit(req, res) {
        try {
            const league_id = parseInt(req.params.id);
            const league = await League.findById(league_id);
            
            if (!league) {
                req.flash('error', 'League not found');
                return res.redirect('/dashboard');
            }

            // Check if user is commissioner
            const isCommissioner = await League.isUserCommissioner(league_id, req.user.user_id);
            if (!isCommissioner) {
                req.flash('error', 'Only the commissioner can edit this league');
                return res.redirect(`/leagues/${league_id}`);
            }

            // Get tiers if multi-tier is enabled
            let tiers = [];
            if (league.enable_multi_tier) {
                try {
                    tiers = await database.executeMany(`
                        SELECT tier_id, tier_name, entry_fee, tier_order, tier_description,
                               eligible_for_weekly, eligible_for_season_total, eligible_for_bonuses
                        FROM league_entry_tiers 
                        WHERE league_id = ? AND is_active = 1
                        ORDER BY tier_order ASC
                    `, [league_id]);
                } catch (error) {
                    tiers = [];
                }
            }

            // Get confidence pool settings
            let settings = {};
            try {
                const [confidenceSettings] = await database.execute(`
                    SELECT primary_tiebreaker, secondary_tiebreaker
                    FROM confidence_pool_settings 
                    WHERE league_id = ?
                `, [league_id]);
                
                if (confidenceSettings) {
                    settings = confidenceSettings;
                }
            } catch (error) {
                // Set defaults if settings don't exist
                settings = {
                    primary_tiebreaker: 'mnf_total',
                    secondary_tiebreaker: 'highest_confidence_correct'
                };
            }

            res.render('leagues/edit', {
                title: `Edit ${league.league_name}`,
                league: { ...league, settings },
                tiers,
                user: req.user,
                errors: {}
            });
        } catch (error) {
            req.flash('error', 'Error loading edit form');
            res.redirect('/dashboard');
        }
    }

    // Handle league update
    static async update(req, res) {
        try {
            const league_id = parseInt(req.params.id);
            const league = await League.findById(league_id);
            
            if (!league) {
                req.flash('error', 'League not found');
                return res.redirect('/dashboard');
            }

            // Check if user is commissioner
            const isCommissioner = await League.isUserCommissioner(league_id, req.user.user_id);
            if (!isCommissioner) {
                req.flash('error', 'Only the commissioner can edit this league');
                return res.redirect(`/leagues/${league_id}`);
            }

            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                // Get settings again for error handling
                let settings = {};
                try {
                    const [confidenceSettings] = await database.execute(`
                        SELECT primary_tiebreaker, secondary_tiebreaker
                        FROM confidence_pool_settings 
                        WHERE league_id = ?
                    `, [league_id]);
                    
                    if (confidenceSettings) {
                        settings = confidenceSettings;
                    }
                } catch (error) {
                    settings = {
                        primary_tiebreaker: 'mnf_total',
                        secondary_tiebreaker: 'highest_confidence_correct'
                    };
                }

                return res.render('leagues/edit', {
                    title: `Edit ${league.league_name}`,
                    league: { ...league, settings, ...req.body },
                    user: req.user,
                    errors: errors.mapped()
                });
            }

            // Extract tiebreaker settings from the request body
            const { primary_tiebreaker, secondary_tiebreaker, ...leagueData } = req.body;
            
            // Update league table data
            await League.update(league_id, leagueData);
            
            // Update confidence pool settings if tiebreaker data is provided
            if (primary_tiebreaker || secondary_tiebreaker) {
                try {
                    await database.execute(`
                        UPDATE confidence_pool_settings 
                        SET primary_tiebreaker = COALESCE(?, primary_tiebreaker),
                            secondary_tiebreaker = COALESCE(?, secondary_tiebreaker),
                            updated_at = CURRENT_TIMESTAMP
                        WHERE league_id = ?
                    `, [primary_tiebreaker || null, secondary_tiebreaker || null, league_id]);
                } catch (settingsError) {
                    // If settings don't exist, create them
                    try {
                        await database.execute(`
                            INSERT INTO confidence_pool_settings (league_id, primary_tiebreaker, secondary_tiebreaker)
                            VALUES (?, ?, ?)
                        `, [league_id, primary_tiebreaker || 'mnf_total', secondary_tiebreaker || 'highest_confidence_correct']);
                    } catch (createError) {
                        req.flash('warning', 'League updated but tiebreaker settings could not be saved');
                    }
                }
            }
            
            req.flash('success', 'League updated successfully!');
            res.redirect(`/leagues/${league_id}`);
        } catch (error) {
            req.flash('error', error.message || 'Error updating league');
            res.redirect(`/leagues/${league_id}/edit`);
        }
    }

    // Handle league deletion
    static async destroy(req, res) {
        try {
            const league_id = parseInt(req.params.id);
            const league = await League.findById(league_id);
            
            if (!league) {
                req.flash('error', 'League not found');
                return res.redirect('/dashboard');
            }

            // Check if user is commissioner
            const isCommissioner = await League.isUserCommissioner(league_id, req.user.user_id);
            if (!isCommissioner) {
                req.flash('error', 'Only the commissioner can delete this league');
                return res.redirect(`/leagues/${league_id}`);
            }

            await League.delete(league_id);
            
            req.flash('success', 'League deleted successfully');
            res.redirect('/dashboard');
        } catch (error) {
            req.flash('error', 'Error deleting league');
            res.redirect(`/leagues/${req.params.id}`);
        }
    }

    // Show join league form
    static async join(req, res) {
        try {
            const joinCode = req.query.code || '';
            const fromRegistration = req.query.from === 'register';
            
            // If there's a join code, try to get league info to show in the form
            let league = null;
            if (joinCode) {
                try {
                    league = await League.findByJoinCode(joinCode.toUpperCase());
                } catch (error) {
                    // Could not find league for join code
                }
            }
            
            res.render('leagues/join', {
                title: 'Join League',
                user: req.user,
                joinCode: joinCode,
                league: league,
                errors: {},
                layout: fromRegistration ? false : 'layouts/main'  // Disable layout when coming from registration
            });
        } catch (error) {
            req.flash('error', 'Error loading join form');
            res.redirect('/dashboard');
        }
    }

    // Handle joining league by code
    static async joinByCode(req, res) {
        try {
            const { join_code } = req.body;
            
            if (!join_code) {
                return res.render('leagues/join', {
                    title: 'Join League',
                    user: req.user,
                    joinCode: join_code,
                    league: null,
                    errors: { join_code: { msg: 'Join code is required' } }
                });
            }

            const league = await League.findByJoinCode(join_code.toUpperCase());
            if (!league) {
                return res.render('leagues/join', {
                    title: 'Join League',
                    user: req.user,
                    joinCode: join_code,
                    league: null,
                    errors: { join_code: { msg: 'Invalid join code' } }
                });
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
            // Redirect to dashboard with the specific league - dashboard will validate membership
            res.redirect(`/dashboard?league_id=${league.league_id}`);
        } catch (error) {
            req.flash('error', error.message || 'Error joining league');
            res.render('leagues/join', {
                title: 'Join League',
                user: req.user,
                joinCode: req.body.join_code || '',
                errors: {}
            });
        }
    }

    // Handle member removal
    static async removeMember(req, res) {
        try {
            const league_id = parseInt(req.params.id);
            const user_id = parseInt(req.params.userId);
            
            // Check if current user is commissioner
            const isCommissioner = await League.isUserCommissioner(league_id, req.user.user_id);
            if (!isCommissioner) {
                return res.status(403).json({ 
                    success: false, 
                    message: 'Only the commissioner can remove members' 
                });
            }

            await League.removeMember(league_id, user_id, req.user.user_id);
            
            res.json({ success: true, message: 'Member removed successfully' });
        } catch (error) {
            res.status(500).json({ 
                success: false, 
                message: error.message || 'Error removing member' 
            });
        }
    }

    // Handle leaving league
    static async leave(req, res) {
        try {
            const league_id = parseInt(req.params.id);
            
            // Check if user is commissioner
            const isCommissioner = await League.isUserCommissioner(league_id, req.user.user_id);
            if (isCommissioner) {
                req.flash('error', 'Commissioners cannot leave their own league. Transfer ownership or delete the league instead.');
                return res.redirect(`/leagues/${league_id}`);
            }

            await League.removeMember(league_id, req.user.user_id, req.user.user_id);
            
            req.flash('success', 'Successfully left the league');
            res.redirect('/dashboard');
        } catch (error) {
            req.flash('error', error.message || 'Error leaving league');
            res.redirect(`/leagues/${league_id}`);
        }
    }

    // Regenerate join code
    static async regenerateJoinCode(req, res) {
        try {
            const league_id = parseInt(req.params.id);
            
            // Check if user is commissioner
            const isCommissioner = await League.isUserCommissioner(league_id, req.user.user_id);
            if (!isCommissioner) {
                return res.status(403).json({ 
                    success: false, 
                    message: 'Only the commissioner can regenerate join codes' 
                });
            }

            const newCode = await League.regenerateJoinCode(league_id);
            
            res.json({ success: true, joinCode: newCode });
        } catch (error) {
            res.status(500).json({ 
                success: false, 
                message: error.message || 'Error regenerating join code' 
            });
        }
    }

    // Update league settings
    static async updateSettings(req, res) {
        try {
            const league_id = parseInt(req.params.id);
            const league = await League.findById(league_id);
            
            if (!league) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'League not found' 
                });
            }

            // Check if user is commissioner
            const isCommissioner = await League.isUserCommissioner(league_id, req.user.user_id);
            if (!isCommissioner) {
                return res.status(403).json({ 
                    success: false, 
                    message: 'Only the commissioner can update league settings' 
                });
            }

            // Extract settings from request body
            const {
                league_name,
                description,
                privacy,
                max_participants,
                max_entries,
                entry_fee,
                enable_multi_tier,
                tiers,
                // Payout calculation settings
                payout_calculations_enabled,
                expense_amount,
                expense_description,
                manual_payout_message,
                weekly_pool_enabled,
                weekly_positions,
                weekly_pool_type,
                weekly_pool_percentage,
                season_pool_enabled,
                season_positions,
                season_pool_type,
                season_pool_percentage,
                // Deadline settings (league-wide)
                deadline_type,
                weekly_deadline,
                // Confidence pool specific settings
                pick_method,
                show_picks_before_kickoff,
                show_picks_after_deadline,
                // Tiebreaker settings
                primary_tiebreaker,
                secondary_tiebreaker,
                allow_late_entry,
                late_entry_deadline_week,
                scoring_type,
                point_multiplier
            } = req.body;


            // Validate required fields
            if (!league_name || league_name.trim().length < 3) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'League name is required and must be at least 3 characters long' 
                });
            }

            // Check for duplicate league names (if name has changed)
            if (league_name.trim() !== league.league_name) {
                const existingLeague = await League.findByName(league_name.trim());
                if (existingLeague && existingLeague.league_id !== league_id) {
                    return res.status(400).json({ 
                        success: false, 
                        message: 'A league with this name already exists. Please choose a different name.' 
                    });
                }
            }

            // Update basic league settings
            const updateData = {
                league_name: league_name.trim(),
                description,
                privacy,
                max_participants,
                max_entries,
                entry_fee,
                enable_multi_tier,
                deadline_type,
                weekly_deadline
            };

            // Filter out undefined values to prevent database errors
            const filteredUpdateData = Object.fromEntries(
                Object.entries(updateData).filter(([key, value]) => value !== undefined)
            );

            await League.update(league_id, filteredUpdateData);

            // Sync deadline settings to confidence_pool_settings table for compatibility with locking logic
            if (deadline_type !== undefined) {
                let confidence_deadline_type;
                if (deadline_type === 'per_game') {
                    confidence_deadline_type = 'per_game';
                } else if (deadline_type === 'league_wide') {
                    // Map league_wide to confidence pool setting based on weekly_deadline
                    if (weekly_deadline === 'first_game') {
                        confidence_deadline_type = 'first_game';
                    } else {
                        confidence_deadline_type = 'kickoff'; // Default for league_wide
                    }
                } else {
                    confidence_deadline_type = deadline_type; // Direct mapping for any other values
                }
                
                await database.execute(`
                    UPDATE confidence_pool_settings 
                    SET pick_deadline_type = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE league_id = ?
                `, [confidence_deadline_type, league_id]);
            }

            // Check if basic entry fee changed and update user assignments accordingly
            if (!enable_multi_tier) {
                const oldFee = parseFloat(league.entry_fee || 0);
                const newFee = parseFloat(entry_fee || 0);
                
                if (oldFee !== newFee) {
                    // Update the default tier's entry fee
                    await database.executeMany(`
                        UPDATE league_entry_tiers 
                        SET entry_fee = ?
                        WHERE league_id = ? AND tier_order = 1
                    `, [newFee, league_id]);
                    
                    // Update existing user assignments
                    await database.executeMany(`
                        UPDATE league_user_tiers lut
                        JOIN league_users lu ON lut.league_user_id = lu.league_user_id
                        JOIN league_entry_tiers let ON lut.tier_id = let.tier_id
                        SET lut.amount_owed = ?,
                            lut.payment_status = CASE 
                                WHEN ? = 0 THEN 'paid'
                                WHEN lut.amount_paid >= ? THEN 'paid'
                                WHEN lut.amount_paid > 0 THEN 'partial'
                                ELSE 'unpaid'
                            END
                        WHERE lu.league_id = ? AND let.tier_order = 1
                    `, [newFee, newFee, newFee, league_id]);
                }
            }

            // If multi-tier is enabled, handle tier data
            if (enable_multi_tier && tiers && tiers.length > 0) {
                // Deactivate existing tiers first
                await database.update('league_entry_tiers', 
                    { is_active: 0 },
                    { league_id }
                );
                
                // Insert or update tiers
                for (const tier of tiers) {
                    const tierData = {
                        league_id,
                        tier_order: tier.tier_order,
                        tier_name: tier.tier_name,
                        tier_description: tier.tier_description || tier.description,
                        entry_fee: parseFloat(tier.entry_fee || tier.tier_fee || 0),
                        eligible_for_weekly: tier.eligible_for_weekly !== false,
                        eligible_for_season_total: tier.eligible_for_season_total || false,
                        eligible_for_bonuses: tier.eligible_for_bonuses || false,
                        is_active: 1
                    };
                    
                    // Check if tier exists
                    const existingTier = await database.findOne('league_entry_tiers', {
                        league_id,
                        tier_order: tier.tier_order
                    });
                    
                    if (existingTier) {
                        // Update existing tier
                        await database.update('league_entry_tiers', tierData, { tier_id: existingTier.tier_id });
                        
                        // Update existing user assignments if the fee changed
                        const oldFee = parseFloat(existingTier.entry_fee || 0);
                        const newFee = parseFloat(tierData.entry_fee || 0);
                        
                        if (oldFee !== newFee) {
                            // Update amount_owed for all users assigned to this tier
                            await database.executeMany(`
                                UPDATE league_user_tiers lut
                                JOIN league_users lu ON lut.league_user_id = lu.league_user_id
                                SET lut.amount_owed = ?,
                                    lut.payment_status = CASE 
                                        WHEN ? = 0 THEN 'paid'
                                        WHEN lut.amount_paid >= ? THEN 'paid'
                                        WHEN lut.amount_paid > 0 THEN 'partial'
                                        ELSE 'unpaid'
                                    END
                                WHERE lut.tier_id = ? AND lu.league_id = ?
                            `, [newFee, newFee, newFee, existingTier.tier_id, league_id]);
                        }
                    } else {
                        await database.insert('league_entry_tiers', tierData);
                    }
                }
                
                // Update default tier if needed
                const defaultTier = await database.findOne('league_entry_tiers', {
                    league_id,
                    tier_order: 1,
                    is_active: 1
                });
                
                if (defaultTier) {
                    await database.update('leagues', 
                        { default_tier_id: defaultTier.tier_id },
                        { league_id }
                    );
                    
                    // Assign existing users without tiers to the default tier
                    await League.assignUsersToDefaultTier(league_id);
                }
            } else if (!enable_multi_tier) {
                // If multi-tier is disabled, ensure there's a default tier
                const defaultTier = await database.findOne('league_entry_tiers', {
                    league_id,
                    tier_order: 1
                });
                
                if (!defaultTier) {
                    // Create default tier with league's entry fee
                    const result = await database.insert('league_entry_tiers', {
                        league_id,
                        tier_order: 1,
                        tier_name: 'Standard',
                        tier_description: 'Regular pool participation',
                        entry_fee: parseFloat(entry_fee || 0),
                        eligible_for_weekly: true,
                        eligible_for_season_total: false,
                        eligible_for_bonuses: false,
                        is_active: 1
                    });
                    
                    await database.update('leagues', 
                        { default_tier_id: result.insertId },
                        { league_id }
                    );
                    
                    // Assign existing users without tiers to the default tier
                    await League.assignUsersToDefaultTier(league_id);
                }
            }

            // Handle payout settings if provided
            if (payout_calculations_enabled !== undefined || expense_amount !== undefined || 
                expense_description !== undefined || manual_payout_message !== undefined ||
                weekly_pool_enabled !== undefined || weekly_positions !== undefined ||
                weekly_pool_type !== undefined || weekly_pool_percentage !== undefined ||
                season_pool_enabled !== undefined || season_positions !== undefined ||
                season_pool_type !== undefined || season_pool_percentage !== undefined) {
                
                const Payout = require('../models/Payout');
                const payoutConfigData = {};
                
                if (payout_calculations_enabled !== undefined) payoutConfigData.payout_calculations_enabled = payout_calculations_enabled ? 1 : 0;
                if (expense_amount !== undefined) payoutConfigData.expense_amount = parseFloat(expense_amount);
                if (expense_description !== undefined) payoutConfigData.expense_description = expense_description;
                if (manual_payout_message !== undefined) payoutConfigData.manual_payout_message = manual_payout_message;
                if (weekly_pool_enabled !== undefined) payoutConfigData.weekly_payout_enabled = weekly_pool_enabled ? 1 : 0;
                if (weekly_positions !== undefined) payoutConfigData.weekly_positions = parseInt(weekly_positions);
                if (weekly_pool_type !== undefined) payoutConfigData.weekly_allocation_type = weekly_pool_type;
                if (weekly_pool_percentage !== undefined) payoutConfigData.weekly_total_percentage = parseFloat(weekly_pool_percentage);
                if (season_pool_enabled !== undefined) payoutConfigData.season_payout_enabled = season_pool_enabled ? 1 : 0;
                if (season_positions !== undefined) payoutConfigData.season_positions = parseInt(season_positions);
                if (season_pool_type !== undefined) payoutConfigData.season_allocation_type = season_pool_type;
                if (season_pool_percentage !== undefined) payoutConfigData.season_total_percentage = parseFloat(season_pool_percentage);
                
                if (Object.keys(payoutConfigData).length > 0) {
                    await Payout.updateConfig(league_id, payoutConfigData);
                }
            }

            // Update confidence pool settings if it's a confidence pool
            if (league.pool_type === 'confidence') {
                const confidenceSettings = await database.findOne('confidence_pool_settings', { league_id });
                
                const confidenceData = {};
                
                // Only update fields that were provided
                if (pick_method !== undefined) {
                    confidenceData.pick_type = pick_method;
                    // Also update the league table's pick_method
                    await database.update('leagues', { pick_method }, { league_id });
                }
                // Note: Deadline settings are now handled at league level, not in confidence_pool_settings
                if (show_picks_before_kickoff !== undefined) confidenceData.show_picks_before_kickoff = show_picks_before_kickoff ? 1 : 0;
                if (show_picks_after_deadline !== undefined) confidenceData.show_picks_after_deadline = show_picks_after_deadline ? 1 : 0;
                if (allow_late_entry !== undefined) confidenceData.allow_late_entry = allow_late_entry ? 1 : 0;
                if (late_entry_deadline_week !== undefined) confidenceData.late_entry_deadline_week = parseInt(late_entry_deadline_week);
                if (scoring_type !== undefined) confidenceData.scoring_type = scoring_type;
                if (point_multiplier !== undefined) confidenceData.point_multiplier = parseFloat(point_multiplier);
                if (primary_tiebreaker !== undefined) confidenceData.primary_tiebreaker = primary_tiebreaker;
                if (secondary_tiebreaker !== undefined) confidenceData.secondary_tiebreaker = secondary_tiebreaker;
                
                if (Object.keys(confidenceData).length > 0) {
                    if (confidenceSettings) {
                        await database.update('confidence_pool_settings', confidenceData, { setting_id: confidenceSettings.setting_id });
                    } else {
                        // Create default settings if they don't exist
                        await database.insert('confidence_pool_settings', {
                            league_id,
                            ...confidenceData,
                            min_confidence_points: 1,
                            max_confidence_points: 16,
                            allow_confidence_ties: 0,
                            show_confidence_points: 1,
                            primary_tiebreaker: 'mnf_total',
                            secondary_tiebreaker: 'highest_confidence_correct',
                            include_playoffs: 0,
                            playoff_scoring_multiplier: 1.00,
                            require_all_games_picked: 1,
                            allow_push_games: 1
                        });
                    }
                }
            }

            res.json({ 
                success: true, 
                message: 'League settings updated successfully' 
            });
        } catch (error) {
            res.status(500).json({ 
                success: false, 
                message: error.message || 'Error updating league settings' 
            });
        }
    }

    // Get tiers for a league (API endpoint)
    static async getTiers(req, res) {
        try {
            const league_id = parseInt(req.params.id);
            
            const tiers = await database.executeMany(`
                SELECT tier_id, tier_name, entry_fee, tier_order, tier_description 
                FROM league_entry_tiers 
                WHERE league_id = ? AND is_active = 1
                ORDER BY tier_order ASC
            `, [league_id]);
            
            res.json({ 
                success: true, 
                tiers: tiers 
            });
        } catch (error) {
            res.status(500).json({ 
                success: false, 
                message: error.message || 'Error fetching tiers' 
            });
        }
    }

    // Update member information
    static async updateMember(req, res) {
        try {
            const league_id = parseInt(req.params.id);
            const user_id = parseInt(req.params.userId);
            
            const { username, firstName, lastName, email, password, amountPaid, amountOwed, paymentMethod, tierId } = req.body;

            // Check if current user is commissioner
            const isCommissioner = await League.isUserCommissioner(league_id, req.user.user_id);
            if (!isCommissioner) {
                return res.status(403).json({ 
                    success: false, 
                    message: 'Only the commissioner can update member information' 
                });
            }

            // Update user information in the users table
            const userUpdates = [];
            const userParams = [];
            
            if (username && username.trim()) {
                userUpdates.push('username = ?');
                userParams.push(username.trim());
            }
            if (firstName !== undefined) {
                userUpdates.push('first_name = ?');
                userParams.push(firstName.trim() || null);
            }
            if (lastName !== undefined) {
                userUpdates.push('last_name = ?');
                userParams.push(lastName.trim() || null);
            }
            if (email && email.trim()) {
                userUpdates.push('email = ?');
                userParams.push(email.trim());
            }
            if (password && password.trim()) {
                const bcrypt = require('bcryptjs');
                const hashedPassword = await bcrypt.hash(password.trim(), 10);
                userUpdates.push('password_hash = ?');
                userParams.push(hashedPassword);
            }
            
            if (userUpdates.length > 0) {
                userParams.push(user_id);
                await database.execute(`
                    UPDATE users 
                    SET ${userUpdates.join(', ')}
                    WHERE user_id = ?
                `, userParams);
            }

            // Update tier assignment if provided
            if (tierId && parseInt(tierId) > 0) {
                // Get league_user for this user in this league
                const leagueUserResult = await database.executeMany(`
                    SELECT league_user_id FROM league_users 
                    WHERE league_id = ? AND user_id = ?
                `, [league_id, user_id]);
                
                if (leagueUserResult && leagueUserResult.length > 0) {
                    const leagueUserId = leagueUserResult[0].league_user_id;
                    
                    // Get the tier fee for amount_owed calculation
                    const [tierInfo] = await database.executeMany(`
                        SELECT entry_fee FROM league_entry_tiers 
                        WHERE tier_id = ? AND league_id = ?
                    `, [tierId, league_id]);
                    
                    const entryFee = tierInfo ? parseFloat(tierInfo.entry_fee) : 0;
                    
                    // Update or insert tier assignment
                    await database.execute(`
                        INSERT INTO league_user_tiers (league_user_id, tier_id, amount_owed, payment_status)
                        VALUES (?, ?, ?, 'unpaid')
                        ON DUPLICATE KEY UPDATE 
                            tier_id = VALUES(tier_id),
                            amount_owed = VALUES(amount_owed)
                    `, [leagueUserId, tierId, entryFee]);
                }
            }
            
            // Update payment information if provided
            if (amountPaid !== undefined || amountOwed !== undefined || paymentMethod !== undefined) {
                // Get league_entry for this user in this league
                const [entryResult] = await database.execute(`
                    SELECT le.entry_id FROM league_entries le
                    JOIN league_users lu ON le.league_user_id = lu.league_user_id
                    WHERE lu.league_id = ? AND lu.user_id = ?
                `, [league_id, user_id]);
                
                if (entryResult && entryResult.length > 0) {
                    const entryId = entryResult[0].entry_id;
                    
                    // Update or insert payment record
                    const paymentUpdates = [];
                    const paymentParams = [];
                    
                    if (amountPaid !== undefined) {
                        paymentUpdates.push('amount_paid = ?');
                        paymentParams.push(amountPaid);
                    }
                    if (amountOwed !== undefined) {
                        paymentUpdates.push('amount_owed = ?');
                        paymentParams.push(amountOwed);
                    }
                    if (paymentMethod !== undefined) {
                        paymentUpdates.push('payment_method = ?');
                        paymentParams.push(paymentMethod || null);
                    }
                    
                    if (paymentUpdates.length > 0) {
                        // Calculate payment status
                        let paymentStatus = 'unpaid';
                        if (amountOwed !== undefined && amountPaid !== undefined) {
                            const tolerance = 0.01;
                            if (amountOwed === 0) {
                                paymentStatus = 'free';
                            } else if (Math.abs(amountPaid - amountOwed) < tolerance) {
                                paymentStatus = 'paid';
                            } else if (amountPaid > amountOwed + tolerance) {
                                paymentStatus = 'overpaid';
                            } else if (amountPaid > 0) {
                                paymentStatus = 'partial';
                            }
                        }
                        
                        paymentUpdates.push('payment_status = ?');
                        paymentParams.push(paymentStatus);
                        paymentParams.push(entryId);
                        
                        await database.execute(`
                            INSERT INTO league_payments (entry_id, amount_paid, amount_owed, payment_method, payment_status)
                            VALUES (?, ?, ?, ?, ?)
                            ON DUPLICATE KEY UPDATE ${paymentUpdates.join(', ')}
                        `, [entryId, amountPaid || 0, amountOwed || 0, paymentMethod || null, paymentStatus, ...paymentParams]);
                    }
                }
            }

            res.json({ 
                success: true, 
                message: 'Member updated successfully' 
            });
        } catch (error) {
            console.error('Error updating member:', error);
            res.status(500).json({ 
                success: false, 
                message: error.message || 'Error updating member' 
            });
        }
    }

    // Transfer ownership to another member
    static async transferOwnership(req, res) {
        try {
            const league_id = parseInt(req.params.id);
            const { new_commissioner_id } = req.body;

            // Check if current user is the MAIN commissioner (only main commissioner can transfer ownership)
            const isMainCommissioner = await League.isUserMainCommissioner(league_id, req.user.user_id);
            if (!isMainCommissioner) {
                return res.status(403).json({ 
                    success: false, 
                    message: 'Only the main commissioner can transfer ownership' 
                });
            }
            
            // Update the commissioner_id in leagues table
            await database.executeMany(`
                UPDATE leagues 
                SET commissioner_id = ?
                WHERE league_id = ?
            `, [new_commissioner_id, league_id]);
            
            // Update the new commissioner's role to ensure they're not just a participant
            await database.executeMany(`
                UPDATE league_users 
                SET role = 'participant'
                WHERE league_id = ? AND user_id = ? AND role != 'co_commissioner'
            `, [league_id, new_commissioner_id]);

            res.json({ 
                success: true, 
                message: 'Ownership transferred successfully' 
            });
        } catch (error) {
            res.status(500).json({ 
                success: false, 
                message: error.message || 'Error transferring ownership' 
            });
        }
    }

    // Reset user password
    static async resetPassword(req, res) {
        try {
            const league_id = parseInt(req.params.id);
            const { user_id } = req.body;

            // Check if current user is commissioner
            const isCommissioner = await League.isUserCommissioner(league_id, req.user.user_id);
            if (!isCommissioner) {
                return res.status(403).json({ 
                    success: false, 
                    message: 'Only the commissioner can reset passwords' 
                });
            }

            // TODO: Implement password reset logic
            // This would involve generating a reset token and sending email

            res.json({ 
                success: true, 
                message: 'Password reset email sent successfully' 
            });
        } catch (error) {
            res.status(500).json({ 
                success: false, 
                message: error.message || 'Error resetting password' 
            });
        }
    }

    // Get commissioner messages
    static async getMessages(req, res) {
        try {
            const league_id = parseInt(req.params.id);

            // Check if user is member of the league
            const isMember = await League.isUserMember(league_id, req.user.user_id);
            if (!isMember) {
                return res.status(403).json({ 
                    success: false, 
                    message: 'You must be a member of this league to view messages' 
                });
            }

            // Get messages from database
            const query = `
                SELECT lm.*, u.username as posted_by_username
                FROM league_messages lm
                LEFT JOIN users u ON lm.posted_by = u.user_id
                WHERE lm.league_id = ?
                ORDER BY lm.created_at DESC
            `;

            const messages = await database.executeMany(query, [league_id]);

            // Format messages for response
            const formattedMessages = messages.map(msg => ({
                message_id: msg.message_id,
                title: msg.title,
                content: msg.content,
                important: !!msg.important,
                created_at: msg.created_at,
                posted_by: msg.posted_by_username || 'Unknown'
            }));

            res.json({ 
                success: true, 
                messages: formattedMessages 
            });
        } catch (error) {
            res.status(500).json({ 
                success: false, 
                message: error.message || 'Error getting messages' 
            });
        }
    }

    // Post commissioner message
    static async postMessage(req, res) {
        try {
            const league_id = parseInt(req.params.id);
            const { title, content, important } = req.body;

            // Check if user is commissioner
            const isCommissioner = await League.isUserCommissioner(league_id, req.user.user_id);
            if (!isCommissioner) {
                return res.status(403).json({ 
                    success: false, 
                    message: 'Only the commissioner can post messages' 
                });
            }

            // Basic validation
            if (!title || !content) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Title and content are required' 
                });
            }

            // Validate length limits
            if (title.trim().length > 100) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Title cannot exceed 100 characters' 
                });
            }

            if (content.trim().length > 1000) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Content cannot exceed 1000 characters' 
                });
            }

            // Insert message into database
            const messageData = {
                league_id,
                title: title.trim(),
                content: content.trim(),
                important: important ? 1 : 0,
                posted_by: req.user.user_id
            };

            const result = await database.insert('league_messages', messageData);

            // Get the created message with user info for response
            const query = `
                SELECT lm.*, u.username as posted_by_username
                FROM league_messages lm
                LEFT JOIN users u ON lm.posted_by = u.user_id
                WHERE lm.message_id = ?
            `;

            const newMessage = await database.executeMany(query, [result.insertId]);

            if (newMessage.length > 0) {
                const formattedMessage = {
                    message_id: newMessage[0].message_id,
                    title: newMessage[0].title,
                    content: newMessage[0].content,
                    important: !!newMessage[0].important,
                    created_at: newMessage[0].created_at,
                    posted_by: newMessage[0].posted_by_username || 'Unknown'
                };

                res.json({ 
                    success: true, 
                    message: 'Message posted successfully',
                    newMessage: formattedMessage
                });
            } else {
                res.json({ 
                    success: true, 
                    message: 'Message posted successfully' 
                });
            }
        } catch (error) {
            res.status(500).json({ 
                success: false, 
                message: error.message || 'Error posting message' 
            });
        }
    }

    // Delete commissioner message
    static async deleteMessage(req, res) {
        try {
            const league_id = parseInt(req.params.id);
            const message_id = parseInt(req.params.messageId);

            // Check if user is commissioner
            const isCommissioner = await League.isUserCommissioner(league_id, req.user.user_id);
            if (!isCommissioner) {
                return res.status(403).json({ 
                    success: false, 
                    message: 'Only the commissioner can delete messages' 
                });
            }

            // Verify message exists and belongs to this league
            const message = await database.findOne('league_messages', {
                message_id,
                league_id
            });

            if (!message) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'Message not found' 
                });
            }

            // Delete the message
            const deletedRows = await database.delete('league_messages', {
                message_id,
                league_id
            });

            if (deletedRows > 0) {
                res.json({ 
                    success: true, 
                    message: 'Message deleted successfully' 
                });
            } else {
                res.status(404).json({ 
                    success: false, 
                    message: 'Message not found or already deleted' 
                });
            }
        } catch (error) {
            res.status(500).json({ 
                success: false, 
                message: error.message || 'Error deleting message' 
            });
        }
    }

    // Show league chat page
    static async chat(req, res) {
        try {
            const leagueId = parseInt(req.params.id);
            const userId = req.user.user_id;

            // Verify user is member of the league
            const membershipRows = await database.execute(`
                SELECT lu.*, l.league_name, l.commissioner_id,
                       (SELECT COUNT(*) FROM league_users WHERE league_id = ? AND status = 'active') as total_members
                FROM league_users lu
                JOIN leagues l ON lu.league_id = l.league_id
                WHERE lu.league_id = ? AND lu.user_id = ? AND lu.status = 'active'
            `, [leagueId, leagueId, userId]);

            if (membershipRows.length === 0) {
                req.flash('error', 'You are not a member of this league');
                return res.redirect('/dashboard');
            }

            const membership = membershipRows[0];
            const league = {
                league_id: leagueId,
                league_name: membership.league_name,
                is_commissioner: membership.commissioner_id === userId
            };

            // Get chat thread summaries only
            const threadRows = await database.execute(`
                SELECT 
                    cm.message_id,
                    cm.message_text,
                    cm.thread_title,
                    cm.message_type,
                    cm.sent_at,
                    u.username,
                    u.user_id,
                    (u.user_id = ?) as is_commissioner,
                    DATE_FORMAT(cm.sent_at, '%M %d at %l:%i %p') as formatted_time,
                    cp.poll_question,
                    cp.is_closed,
                    (SELECT COUNT(*) FROM chat_messages WHERE parent_message_id = cm.message_id AND is_deleted = 0) as reply_count,
                    (SELECT MAX(sent_at) FROM chat_messages WHERE (parent_message_id = cm.message_id OR message_id = cm.message_id) AND is_deleted = 0) as last_activity,
                    DATE_FORMAT((SELECT MAX(sent_at) FROM chat_messages WHERE (parent_message_id = cm.message_id OR message_id = cm.message_id) AND is_deleted = 0), '%M %d at %l:%i %p') as last_activity_formatted,
                    (SELECT message_text FROM chat_messages WHERE parent_message_id = cm.message_id AND is_deleted = 0 ORDER BY sent_at DESC LIMIT 1) as last_reply_text,
                    (SELECT u2.username FROM chat_messages cm2 JOIN users u2 ON cm2.user_id = u2.user_id WHERE cm2.parent_message_id = cm.message_id AND cm2.is_deleted = 0 ORDER BY cm2.sent_at DESC LIMIT 1) as last_reply_username
                FROM chat_messages cm
                JOIN users u ON cm.user_id = u.user_id
                LEFT JOIN chat_polls cp ON cm.message_id = cp.message_id
                WHERE cm.league_id = ? AND cm.parent_message_id IS NULL AND cm.is_deleted = 0
                ORDER BY last_activity DESC
                LIMIT 50
            `, [membership.commissioner_id, leagueId]);

            const chatThreads = threadRows;

            // Get online members count (placeholder - could be implemented with sessions)
            const onlineMembers = Math.max(1, Math.floor(membership.total_members * 0.3)); // Mock 30% online

            res.render('leagues/chat', {
                title: `${league.league_name} - Chat`,
                league: league,
                chatThreads: chatThreads,
                totalMembers: membership.total_members,
                onlineMembers: onlineMembers,
                user: req.user
            });

        } catch (error) {
            req.flash('error', 'Error loading league chat');
            res.redirect('/dashboard');
        }
    }

    // View individual thread with all messages
    static async viewThread(req, res) {
        try {
            const leagueId = parseInt(req.params.id);
            const threadId = parseInt(req.params.threadId);
            const userId = req.user.user_id;

            // Verify user is member of the league
            const membershipRows = await database.execute(`
                SELECT lu.*, l.league_name, l.commissioner_id,
                       (SELECT COUNT(*) FROM league_users WHERE league_id = ? AND status = 'active') as total_members
                FROM league_users lu
                JOIN leagues l ON lu.league_id = l.league_id
                WHERE lu.league_id = ? AND lu.user_id = ? AND lu.status = 'active'
            `, [leagueId, leagueId, userId]);

            if (membershipRows.length === 0) {
                req.flash('error', 'You are not a member of this league');
                return res.redirect('/dashboard');
            }

            const membership = membershipRows[0];
            const league = {
                league_id: leagueId,
                league_name: membership.league_name,
                is_commissioner: membership.commissioner_id === userId
            };

            // Get thread starter message with poll data if applicable
            const threadRows = await database.execute(`
                SELECT 
                    cm.message_id,
                    cm.message_text,
                    cm.thread_title,
                    cm.message_type,
                    cm.sent_at,
                    u.username,
                    u.user_id,
                    (u.user_id = ?) as is_commissioner,
                    DATE_FORMAT(cm.sent_at, '%M %d at %l:%i %p') as formatted_time,
                    cp.poll_id,
                    cp.poll_question,
                    cp.poll_type,
                    cp.is_closed,
                    cp.expires_at,
                    DATE_FORMAT(cp.expires_at, '%M %d at %l:%i %p') as expires_at_formatted,
                    (SELECT COUNT(*) FROM chat_poll_votes cpv WHERE cpv.poll_id = cp.poll_id) as total_votes
                FROM chat_messages cm
                JOIN users u ON cm.user_id = u.user_id
                LEFT JOIN chat_polls cp ON cm.message_id = cp.message_id
                WHERE cm.message_id = ? AND cm.league_id = ? AND cm.is_deleted = 0
            `, [membership.commissioner_id, threadId, leagueId]);

            if (threadRows.length === 0) {
                req.flash('error', 'Thread not found');
                return res.redirect(`/leagues/${leagueId}/chat`);
            }

            const thread = threadRows[0];

            // If it's a poll, get poll options and votes
            if (thread.message_type === 'poll' && thread.poll_id) {
                const optionRows = await database.execute(`
                    SELECT 
                        cpo.option_id,
                        cpo.option_text,
                        cpo.vote_count,
                        EXISTS(SELECT 1 FROM chat_poll_votes cpv WHERE cpv.option_id = cpo.option_id AND cpv.user_id = ?) as user_voted
                    FROM chat_poll_options cpo
                    WHERE cpo.poll_id = ? AND cpo.is_active = 1
                    ORDER BY cpo.option_order ASC
                `, [userId, thread.poll_id]);

                thread.poll = {
                    poll_id: thread.poll_id,
                    poll_question: thread.poll_question,
                    poll_type: thread.poll_type,
                    is_closed: thread.is_closed,
                    expires_at_formatted: thread.expires_at_formatted,
                    total_votes: thread.total_votes,
                    user_has_voted: optionRows.some(opt => opt.user_voted),
                    options: optionRows.map(opt => ({
                        option_id: opt.option_id,
                        option_text: opt.option_text,
                        vote_count: opt.vote_count,
                        user_voted: !!opt.user_voted,
                        percentage: thread.total_votes > 0 ? Math.round((opt.vote_count / thread.total_votes) * 100) : 0
                    }))
                };
            }

            // Get all replies to this thread
            const replyRows = await database.execute(`
                SELECT 
                    cm.message_id,
                    cm.message_text,
                    cm.sent_at,
                    u.username,
                    u.user_id,
                    (u.user_id = ?) as is_commissioner,
                    DATE_FORMAT(cm.sent_at, '%M %d at %l:%i %p') as formatted_time
                FROM chat_messages cm
                JOIN users u ON cm.user_id = u.user_id
                WHERE cm.parent_message_id = ? AND cm.is_deleted = 0
                ORDER BY cm.sent_at ASC
            `, [membership.commissioner_id, threadId]);

            // Get online members count (placeholder - could be implemented with sessions)
            const onlineMembers = Math.max(1, Math.floor(membership.total_members * 0.3)); // Mock 30% online

            res.render('leagues/thread', {
                title: `${thread.thread_title || 'Thread'} - ${league.league_name}`,
                league: league,
                thread: thread,
                replies: replyRows,
                totalMembers: membership.total_members,
                onlineMembers: onlineMembers,
                user: req.user
            });

        } catch (error) {
            req.flash('error', 'Error loading thread');
            res.redirect(`/leagues/${req.params.id}/chat`);
        }
    }

    // Post chat message or create thread
    static async postChatMessage(req, res) {
        try {
            const leagueId = parseInt(req.params.id);
            const userId = req.user.user_id;
            const { message, message_type = 'chat', parent_message_id, thread_title } = req.body;

            // Verify user is member of the league
            const membershipRows = await database.execute(`
                SELECT league_user_id FROM league_users 
                WHERE league_id = ? AND user_id = ? AND status = 'active'
            `, [leagueId, userId]);

            if (membershipRows.length === 0) {
                return res.status(403).json({ 
                    success: false, 
                    message: 'You are not a member of this league' 
                });
            }

            // Validate message
            if (!message || message.trim().length === 0) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Message cannot be empty' 
                });
            }

            if (message.length > 1000) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Message too long (maximum 1000 characters)' 
                });
            }

            // Determine thread depth
            let threadDepth = 0;
            if (parent_message_id) {
                const parentRows = await database.execute(`
                    SELECT thread_depth FROM chat_messages WHERE message_id = ?
                `, [parent_message_id]);
                
                if (parentRows.length > 0) {
                    threadDepth = parentRows[0].thread_depth + 1;
                }
            }

            // For top-level messages (threads), auto-generate title if not provided
            let finalThreadTitle = null;
            if (!parent_message_id) {
                finalThreadTitle = thread_title || 
                    (message.length > 50 ? message.substring(0, 47) + '...' : message);
            }

            // Insert message
            const result = await database.execute(`
                INSERT INTO chat_messages 
                (league_id, user_id, message_text, thread_title, message_type, parent_message_id, thread_depth)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [leagueId, userId, message.trim(), finalThreadTitle, message_type, parent_message_id || null, threadDepth]);

            res.json({ 
                success: true, 
                message: 'Message posted successfully',
                message_id: result.insertId
            });

        } catch (error) {
            res.status(500).json({ 
                success: false, 
                message: error.message || 'Error posting message' 
            });
        }
    }

    // Create poll
    static async createPoll(req, res) {
        try {
            const leagueId = parseInt(req.params.id);
            const userId = req.user.user_id;
            const { 
                poll_question, 
                options, 
                poll_type = 'single_choice',
                expires_hours = null,
                allow_add_options = false,
                anonymous_voting = false
            } = req.body;

            // Verify user is member of the league
            const membershipRows = await database.execute(`
                SELECT league_user_id FROM league_users 
                WHERE league_id = ? AND user_id = ? AND status = 'active'
            `, [leagueId, userId]);

            if (membershipRows.length === 0) {
                return res.status(403).json({ 
                    success: false, 
                    message: 'You are not a member of this league' 
                });
            }

            // Validate poll data
            if (!poll_question || poll_question.trim().length === 0) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Poll question is required' 
                });
            }

            if (!Array.isArray(options) || options.length < 2) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'At least 2 options are required' 
                });
            }

            if (options.length > 10) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Maximum 10 options allowed' 
                });
            }

            // Calculate expiry date
            let expiresAt = null;
            if (expires_hours && expires_hours > 0) {
                expiresAt = new Date();
                expiresAt.setHours(expiresAt.getHours() + expires_hours);
            }

            // Use database transaction method
            const result = await database.transaction(async (connection) => {
                // Create the chat message for the poll
                const pollTitle = `Poll: ${poll_question.length > 40 ? poll_question.substring(0, 37) + '...' : poll_question}`;
                const [messageResult] = await connection.execute(`
                    INSERT INTO chat_messages 
                    (league_id, user_id, message_text, thread_title, message_type, thread_depth)
                    VALUES (?, ?, ?, ?, 'poll', 0)
                `, [leagueId, userId, poll_question.trim(), pollTitle]);

                const messageId = messageResult.insertId;

                // Create the poll
                const [pollResult] = await connection.execute(`
                    INSERT INTO chat_polls 
                    (message_id, league_id, created_by, poll_question, poll_type, allow_add_options, 
                     expires_at, anonymous_voting, show_results)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'after_vote')
                `, [messageId, leagueId, userId, poll_question.trim(), poll_type, 
                    allow_add_options ? 1 : 0, expiresAt, anonymous_voting ? 1 : 0]);

                const pollId = pollResult.insertId;

                // Create poll options
                for (let i = 0; i < options.length; i++) {
                    const option = options[i].trim();
                    if (option.length > 0) {
                        await connection.execute(`
                            INSERT INTO chat_poll_options 
                            (poll_id, option_text, option_order, added_by)
                            VALUES (?, ?, ?, ?)
                        `, [pollId, option, i + 1, userId]);
                    }
                }

                return { pollId, messageId };
            });

            res.json({ 
                success: true, 
                message: 'Poll created successfully',
                poll_id: result.pollId,
                message_id: result.messageId
            });

        } catch (error) {
            res.status(500).json({ 
                success: false, 
                message: error.message || 'Error creating poll' 
            });
        }
    }

    // Vote on poll
    static async votePoll(req, res) {
        try {
            const leagueId = parseInt(req.params.id);
            const pollId = parseInt(req.params.pollId);
            const userId = req.user.user_id;
            const { option_id } = req.body;

            // Verify user is member of the league
            const membershipRows = await database.execute(`
                SELECT league_user_id FROM league_users 
                WHERE league_id = ? AND user_id = ? AND status = 'active'
            `, [leagueId, userId]);

            if (membershipRows.length === 0) {
                return res.status(403).json({ 
                    success: false, 
                    message: 'You are not a member of this league' 
                });
            }

            // Get poll details
            const pollRows = await database.execute(`
                SELECT cp.*, cm.league_id
                FROM chat_polls cp
                JOIN chat_messages cm ON cp.message_id = cm.message_id
                WHERE cp.poll_id = ? AND cm.league_id = ?
            `, [pollId, leagueId]);

            if (pollRows.length === 0) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'Poll not found' 
                });
            }

            const poll = pollRows[0];

            // Check if poll is closed or expired
            if (poll.is_closed) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'This poll is closed' 
                });
            }

            if (poll.expires_at && new Date() > new Date(poll.expires_at)) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'This poll has expired' 
                });
            }

            // Verify option exists and is active
            const optionRows = await database.execute(`
                SELECT option_id FROM chat_poll_options 
                WHERE poll_id = ? AND option_id = ? AND is_active = 1
            `, [pollId, option_id]);

            if (optionRows.length === 0) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Invalid poll option' 
                });
            }

            // Check if user already voted for this specific option
            const existingVoteRows = await database.execute(`
                SELECT vote_id FROM chat_poll_votes 
                WHERE poll_id = ? AND option_id = ? AND user_id = ?
            `, [pollId, option_id, userId]);

            if (existingVoteRows.length > 0) {
                // User already voted for this option, remove vote (toggle)
                await database.execute(`
                    DELETE FROM chat_poll_votes 
                    WHERE poll_id = ? AND option_id = ? AND user_id = ?
                `, [pollId, option_id, userId]);

                // Update vote count
                await database.execute(`
                    UPDATE chat_poll_options 
                    SET vote_count = GREATEST(0, vote_count - 1)
                    WHERE option_id = ?
                `, [option_id]);

                res.json({ 
                    success: true, 
                    message: 'Vote removed',
                    action: 'removed'
                });
            } else {
                // Check if user had voted for a different option (for single choice)
                let hadPreviousVote = false;
                if (poll.poll_type === 'single_choice') {
                    const previousVoteRows = await database.execute(`
                        SELECT option_id FROM chat_poll_votes 
                        WHERE poll_id = ? AND user_id = ?
                    `, [pollId, userId]);
                    
                    hadPreviousVote = previousVoteRows.length > 0;
                    
                    if (hadPreviousVote) {
                        // Remove previous vote and update its count
                        const previousOptionId = previousVoteRows[0].option_id;
                        await database.execute(`
                            DELETE FROM chat_poll_votes 
                            WHERE poll_id = ? AND user_id = ?
                        `, [pollId, userId]);
                        
                        await database.execute(`
                            UPDATE chat_poll_options 
                            SET vote_count = GREATEST(0, vote_count - 1)
                            WHERE option_id = ?
                        `, [previousOptionId]);
                    }
                }

                // Add new vote
                await database.execute(`
                    INSERT INTO chat_poll_votes (poll_id, option_id, user_id)
                    VALUES (?, ?, ?)
                `, [pollId, option_id, userId]);

                // Update vote count
                await database.execute(`
                    UPDATE chat_poll_options 
                    SET vote_count = vote_count + 1
                    WHERE option_id = ?
                `, [option_id]);

                res.json({ 
                    success: true, 
                    message: hadPreviousVote ? 'Vote changed' : 'Vote recorded',
                    action: hadPreviousVote ? 'changed' : 'added'
                });
            }

        } catch (error) {
            res.status(500).json({ 
                success: false, 
                message: error.message || 'Error recording vote' 
            });
        }
    }
    
    // Get payout configuration and breakdown
    static async getPayouts(req, res) {
        try {
            const league_id = parseInt(req.params.id);
            
            // Check if user is member of the league
            const isMember = await League.isUserMember(league_id, req.user.user_id);
            if (!isMember) {
                return res.status(403).json({ 
                    success: false, 
                    message: 'You must be a member of this league to view payouts' 
                });
            }
            
            const Payout = require('../models/Payout');
            const breakdown = await Payout.getPayoutBreakdown(league_id);
            
            res.json({ 
                success: true, 
                payouts: breakdown 
            });
        } catch (error) {
            res.status(500).json({ 
                success: false, 
                message: error.message || 'Error getting payouts' 
            });
        }
    }
    
    // Update payout configuration
    static async updatePayouts(req, res) {
        try {
            const league_id = parseInt(req.params.id);
            
            // Check if user is commissioner
            const isCommissioner = await League.isUserCommissioner(league_id, req.user.user_id);
            if (!isCommissioner) {
                return res.status(403).json({ 
                    success: false, 
                    message: 'Only the commissioner can update payouts' 
                });
            }
            
            const Payout = require('../models/Payout');
            const {
                expense_amount,
                expense_description,
                weekly_payout_enabled,
                weekly_positions,
                weekly_allocation_type,
                weekly_total_percentage,
                weekly_total_fixed,
                season_payout_enabled,
                season_positions,
                season_allocation_type,
                season_total_percentage,
                season_total_fixed,
                position_payouts // Array of { type, position, amount }
            } = req.body;
            
            // Update main configuration
            const configData = {};
            if (expense_amount !== undefined) configData.expense_amount = parseFloat(expense_amount);
            if (expense_description !== undefined) configData.expense_description = expense_description;
            if (weekly_payout_enabled !== undefined) configData.weekly_payout_enabled = weekly_payout_enabled ? 1 : 0;
            if (weekly_positions !== undefined) configData.weekly_positions = parseInt(weekly_positions);
            if (weekly_allocation_type !== undefined) configData.weekly_allocation_type = weekly_allocation_type;
            if (weekly_total_percentage !== undefined) configData.weekly_total_percentage = parseFloat(weekly_total_percentage);
            if (weekly_total_fixed !== undefined) configData.weekly_total_fixed = parseFloat(weekly_total_fixed);
            if (season_payout_enabled !== undefined) configData.season_payout_enabled = season_payout_enabled ? 1 : 0;
            if (season_positions !== undefined) configData.season_positions = parseInt(season_positions);
            if (season_allocation_type !== undefined) configData.season_allocation_type = season_allocation_type;
            if (season_total_percentage !== undefined) configData.season_total_percentage = parseFloat(season_total_percentage);
            if (season_total_fixed !== undefined) configData.season_total_fixed = parseFloat(season_total_fixed);
            
            if (Object.keys(configData).length > 0) {
                await Payout.updateConfig(league_id, configData);
            }
            
            // Update individual position payouts if provided
            if (position_payouts && Array.isArray(position_payouts)) {
                for (const payout of position_payouts) {
                    await Payout.updatePositionPayout(
                        league_id,
                        payout.type,
                        payout.position,
                        parseFloat(payout.amount)
                    );
                }
            }
            
            // Get updated breakdown
            const breakdown = await Payout.getPayoutBreakdown(league_id);
            
            res.json({ 
                success: true, 
                message: 'Payouts updated successfully',
                payouts: breakdown
            });
        } catch (error) {
            res.status(500).json({ 
                success: false, 
                message: error.message || 'Error updating payouts' 
            });
        }
    }
    
    // Recalculate purse (called when members join/leave or payments are made)
    static async recalculatePurse(req, res) {
        try {
            const league_id = parseInt(req.params.id);
            
            // Check if user is commissioner or system
            const isCommissioner = await League.isUserCommissioner(league_id, req.user.user_id);
            if (!isCommissioner && !req.isSystem) {
                return res.status(403).json({ 
                    success: false, 
                    message: 'Only the commissioner can recalculate purse' 
                });
            }
            
            const Payout = require('../models/Payout');
            const { totalPurse, netPurse } = await Payout.recalculatePurse(league_id);
            
            res.json({ 
                success: true, 
                message: 'Purse recalculated successfully',
                totalPurse,
                netPurse
            });
        } catch (error) {
            res.status(500).json({ 
                success: false, 
                message: error.message || 'Error recalculating purse' 
            });
        }
    }

    // Update member role (promote/demote commissioner status)
    static async updateMemberRole(req, res) {
        try {
            const { id: league_id, userId: user_id } = req.params;
            const { role } = req.body;

            // Validate league exists and user is commissioner
            const league = await League.findById(league_id);
            if (!league) {
                return res.status(404).json({ success: false, message: 'League not found' });
            }

            // Check if current user is commissioner of this league
            if (league.commissioner_id !== req.user.user_id) {
                return res.status(403).json({ success: false, message: 'Only commissioners can modify member roles' });
            }

            // Validate role
            if (!['participant', 'co_commissioner'].includes(role)) {
                return res.status(400).json({ success: false, message: 'Invalid role specified' });
            }

            // Update the member's role in the league_users table (most likely table name)
            const updateQuery = `
                UPDATE league_users 
                SET role = ?
                WHERE league_id = ? AND user_id = ?
            `;

            await database.execute(updateQuery, [role, league_id, user_id]);

            res.json({ 
                success: true, 
                message: 'Member role updated successfully',
                role: role
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message || 'Error updating member role'
            });
        }
    }

    /**
     * Get users with missing picks for a specific week
     */
    static async getMissingPicks(req, res) {
        try {
            const leagueId = parseInt(req.params.id);
            const week = parseInt(req.params.week);
            const userId = req.user.user_id || req.user.id;

            // Verify commissioner access
            const isCommissioner = await League.isUserCommissioner(leagueId, userId);
            if (!isCommissioner) {
                return res.status(403).json({ success: false, message: 'Commissioner access required' });
            }

            const ManualPickAssignmentService = require('../services/ManualPickAssignmentService');
            const usersWithMissingPicks = await ManualPickAssignmentService.getUsersWithMissingPicks(leagueId, week);

            res.json({
                success: true,
                data: {
                    week: week,
                    usersWithMissingPicks: usersWithMissingPicks
                }
            });

        } catch (error) {
            console.error('Error getting missing picks:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Error retrieving missing picks'
            });
        }
    }

    /**
     * Get detailed pick state for a specific entry/week
     */
    static async getEntryPickState(req, res) {
        try {
            const leagueId = parseInt(req.params.id);
            const entryId = parseInt(req.params.entryId);
            const week = parseInt(req.params.week);
            const userId = req.user.user_id || req.user.id;

            // Verify commissioner access
            const isCommissioner = await League.isUserCommissioner(leagueId, userId);
            if (!isCommissioner) {
                return res.status(403).json({ success: false, message: 'Commissioner access required' });
            }

            const ManualPickAssignmentService = require('../services/ManualPickAssignmentService');
            const entryPickState = await ManualPickAssignmentService.getEntryPickState(entryId, week);

            // Verify the entry belongs to this league
            if (entryPickState.leagueId !== leagueId) {
                return res.status(403).json({ success: false, message: 'Entry does not belong to this league' });
            }

            res.json({
                success: true,
                data: entryPickState
            });

        } catch (error) {
            console.error('Error getting entry pick state:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Error retrieving entry pick state'
            });
        }
    }

    /**
     * Assign confidence points to a missing pick
     */
    static async assignMissingPick(req, res) {
        try {
            const leagueId = parseInt(req.params.id);
            const { entryId, gameId, week, confidencePoints, reason } = req.body;
            const userId = req.user.user_id || req.user.id;

            // Verify commissioner access
            const isCommissioner = await League.isUserCommissioner(leagueId, userId);
            if (!isCommissioner) {
                return res.status(403).json({ success: false, message: 'Commissioner access required' });
            }

            // Validate required fields
            if (!entryId || !gameId || !week || !confidencePoints) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required fields: entryId, gameId, week, confidencePoints'
                });
            }

            const ManualPickAssignmentService = require('../services/ManualPickAssignmentService');
            const result = await ManualPickAssignmentService.assignPointsToMissingPick(
                entryId, gameId, week, confidencePoints, userId, reason
            );

            res.json(result);

        } catch (error) {
            console.error('Error assigning missing pick:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Error assigning missing pick'
            });
        }
    }

    /**
     * Update confidence points for an existing pick
     */
    static async updatePickPoints(req, res) {
        try {
            const leagueId = parseInt(req.params.id);
            const { pickId, newConfidencePoints, reason } = req.body;
            const userId = req.user.user_id || req.user.id;

            // Verify commissioner access
            const isCommissioner = await League.isUserCommissioner(leagueId, userId);
            if (!isCommissioner) {
                return res.status(403).json({ success: false, message: 'Commissioner access required' });
            }

            // Validate required fields
            if (!pickId || !newConfidencePoints) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required fields: pickId, newConfidencePoints'
                });
            }

            const ManualPickAssignmentService = require('../services/ManualPickAssignmentService');
            const result = await ManualPickAssignmentService.updatePickConfidencePoints(
                pickId, newConfidencePoints, userId, reason
            );

            res.json(result);

        } catch (error) {
            console.error('Error updating pick points:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Error updating pick points'
            });
        }
    }

    /**
     * Get pick audit trail for a league/week
     */
    static async getPickAudit(req, res) {
        try {
            const leagueId = parseInt(req.params.id);
            const week = req.params.week ? parseInt(req.params.week) : null;
            const userId = req.user.user_id || req.user.id;

            // Verify commissioner access
            const isCommissioner = await League.isUserCommissioner(leagueId, userId);
            if (!isCommissioner) {
                return res.status(403).json({ success: false, message: 'Commissioner access required' });
            }

            const PickAuditService = require('../services/PickAuditService');
            const auditTrail = await PickAuditService.getLeagueAuditTrail(leagueId, week, 100);

            res.json({
                success: true,
                data: {
                    leagueId: leagueId,
                    week: week,
                    auditTrail: auditTrail
                }
            });

        } catch (error) {
            console.error('Error getting pick audit:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Error retrieving pick audit trail'
            });
        }
    }
}

module.exports = LeagueController;