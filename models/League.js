const database = require('../config/database');
const crypto = require('crypto');

class League {
    static async create(leagueData) {
        const {
            league_name,
            commissioner_id,
            entry_fee = 0,
            max_entries = 1,
            max_participants = 50,
            unlimited_participants = false,
            season_year = new Date().getFullYear(),
            pool_type = 'confidence',
            pick_method = 'straight_up',
            privacy = 'private',
            description = '',
            timezone = 'America/New_York',
            chat_enabled = true,
            deadline_type = 'per_game',
            weekly_deadline = 'first_game',
            enable_multi_tier = false,
            tier_name = [],
            tier_fee = [],
            tier_description = []
        } = leagueData;

        try {
            // Generate unique join code
            const join_code = this.generateJoinCode();

            // Handle unlimited participants
            const finalMaxParticipants = unlimited_participants ? 999 : parseInt(max_participants);
            
            const league = await database.insert('leagues', {
                league_name,
                commissioner_id,
                entry_fee: parseFloat(entry_fee),
                max_entries: parseInt(max_entries),
                max_participants: finalMaxParticipants,
                season_year: parseInt(season_year),
                pool_type,
                pick_method,
                status: 'active',
                privacy,
                join_code,
                description,
                timezone,
                chat_enabled: chat_enabled ? 1 : 0,
                deadline_type,
                weekly_deadline,
                enable_multi_tier: enable_multi_tier ? 1 : 0
            });

            // Add commissioner as first member
            await database.insert('league_users', {
                user_id: commissioner_id,
                league_id: league.insertId,
                status: 'active',
                role: 'participant'
            });

            // Create multi-tier entries if enabled
            if (enable_multi_tier && Array.isArray(tier_name) && tier_name.length > 0) {
                for (let i = 0; i < tier_name.length; i++) {
                    if (tier_name[i] && tier_name[i].trim()) {
                        await database.insert('league_entry_tiers', {
                            league_id: league.insertId,
                            tier_name: tier_name[i].trim(),
                            entry_fee: parseFloat(tier_fee[i]) || 0,
                            tier_description: tier_description[i] || '',
                            tier_order: i + 1,
                            is_active: 1
                        });
                    }
                }
            }

            // Create first entry for commissioner
            await database.insert('league_entries', {
                league_user_id: await this.getLeagueUserId(league.insertId, commissioner_id),
                entry_number: 1,
                status: 'active'
            });

            // Create default confidence pool settings
            await this.createDefaultSettings(league.insertId, pool_type, pick_method);

            return await this.findById(league.insertId);
        } catch (error) {
            throw error;
        }
    }

    static async findById(league_id) {
        try {
            const league = await database.findById('leagues', league_id, 'league_id');
            if (!league) return null;

            // Get additional league data
            const memberCount = await this.getMemberCount(league_id);
            const entryCount = await this.getEntryCount(league_id);
            const commissioner = await database.findById('users', league.commissioner_id, 'user_id');

            return {
                ...league,
                member_count: memberCount,
                entry_count: entryCount,
                commissioner_name: commissioner ? commissioner.username : 'Unknown'
            };
        } catch (error) {
            throw error;
        }
    }

    static async findByJoinCode(join_code) {
        try {
            return await database.findOne('leagues', { join_code });
        } catch (error) {
            throw error;
        }
    }

    static async findByName(league_name) {
        try {
            return await database.findOne('leagues', { league_name });
        } catch (error) {
            throw error;
        }
    }

    static async findUserLeagues(user_id) {
        try {
            const query = `
                SELECT l.*, lu.role, lu.status as member_status, lu.joined_at,
                       COUNT(DISTINCT lu2.user_id) as member_count,
                       COUNT(DISTINCT le.entry_id) as entry_count
                FROM leagues l
                JOIN league_users lu ON l.league_id = lu.league_id
                LEFT JOIN league_users lu2 ON l.league_id = lu2.league_id AND lu2.status = 'active'
                LEFT JOIN league_entries le ON lu.league_user_id = le.league_user_id AND le.status = 'active'
                WHERE lu.user_id = ? AND lu.status = 'active'
                GROUP BY l.league_id
                ORDER BY lu.joined_at DESC
            `;

            return await database.executeMany(query, [user_id]);
        } catch (error) {
            throw error;
        }
    }

    static async update(league_id, updateData) {
        try {
            // Remove any fields that shouldn't be updated directly
            const { league_id: _, created_at, updated_at, join_code, ...validUpdates } = updateData;

            if (Object.keys(validUpdates).length === 0) {
                throw new Error('No valid fields to update');
            }

            const affectedRows = await database.update('leagues', validUpdates, { league_id });
            
            if (affectedRows === 0) {
                throw new Error('League not found or no changes made');
            }

            return await this.findById(league_id);
        } catch (error) {
            throw error;
        }
    }

    static async delete(league_id) {
        try {
            // This will cascade delete related records due to foreign key constraints
            return await database.delete('leagues', { league_id });
        } catch (error) {
            throw error;
        }
    }

    static async addMember(league_id, user_id, invited_by = null, role = 'participant') {
        try {
            // Check if user is already a member
            const existingMember = await database.findOne('league_users', {
                league_id,
                user_id
            });

            if (existingMember) {
                if (existingMember.status === 'active') {
                    throw new Error('User is already a member of this league');
                } else {
                    // Reactivate if they were previously removed
                    await database.update('league_users', 
                        { status: 'active', role },
                        { league_user_id: existingMember.league_user_id }
                    );
                    return existingMember.league_user_id;
                }
            }

            // Check league capacity
            const memberCount = await this.getMemberCount(league_id);
            const league = await this.findById(league_id);
            
            if (memberCount >= league.max_participants) {
                throw new Error('League is full');
            }

            // Add new member
            const result = await database.insert('league_users', {
                user_id,
                league_id,
                status: 'active',
                role,
                invited_by
            });

            // Create default entry
            await database.insert('league_entries', {
                league_user_id: result.insertId,
                entry_number: 1,
                status: 'active'
            });

            // If league has multi-tier enabled, assign user to default tier
            if (league.enable_multi_tier && league.default_tier_id) {
                // Get the tier info to calculate amount owed
                const tierInfo = await database.executeMany(`
                    SELECT entry_fee FROM league_entry_tiers 
                    WHERE tier_id = ?
                `, [league.default_tier_id]);
                
                if (tierInfo.length > 0) {
                    await database.insert('league_user_tiers', {
                        league_user_id: result.insertId,
                        tier_id: league.default_tier_id,
                        amount_owed: tierInfo[0].entry_fee,
                        payment_status: tierInfo[0].entry_fee > 0 ? 'unpaid' : 'paid'
                    });
                }
            }

            return result.insertId;
        } catch (error) {
            throw error;
        }
    }

    static async removeMember(league_id, user_id, removed_by) {
        try {
            const league = await this.findById(league_id);
            if (!league) {
                throw new Error('League not found');
            }

            if (league.commissioner_id === user_id) {
                throw new Error('Cannot remove the league commissioner');
            }

            return await database.update('league_users', 
                { status: 'removed' },
                { league_id, user_id }
            );
        } catch (error) {
            throw error;
        }
    }

    static async getMembers(league_id) {
        try {
            const query = `
                SELECT lu.*, u.username, u.email, u.first_name, u.last_name,
                       COUNT(le.entry_id) as entry_count,
                       let.tier_name, let.tier_id, let.entry_fee,
                       lut.payment_status, lut.amount_paid, lut.amount_owed,
                       lut.payment_method, lut.payment_date
                FROM league_users lu
                JOIN users u ON lu.user_id = u.user_id
                LEFT JOIN league_entries le ON lu.league_user_id = le.league_user_id AND le.status = 'active'
                LEFT JOIN league_user_tiers lut ON lu.league_user_id = lut.league_user_id
                LEFT JOIN league_entry_tiers let ON lut.tier_id = let.tier_id
                WHERE lu.league_id = ? AND lu.status = 'active'
                GROUP BY lu.league_user_id
                ORDER BY lu.joined_at ASC
            `;

            return await database.executeMany(query, [league_id]);
        } catch (error) {
            throw error;
        }
    }

    static async getMemberCount(league_id) {
        try {
            const result = await database.executeMany(
                'SELECT COUNT(*) as count FROM league_users WHERE league_id = ? AND status = ?',
                [league_id, 'active']
            );
            return result[0].count;
        } catch (error) {
            return 0;
        }
    }

    static async getEntryCount(league_id) {
        try {
            const query = `
                SELECT COUNT(*) as count 
                FROM league_entries le
                JOIN league_users lu ON le.league_user_id = lu.league_user_id
                WHERE lu.league_id = ? AND le.status = 'active'
            `;
            
            const result = await database.executeMany(query, [league_id]);
            return result[0].count;
        } catch (error) {
            return 0;
        }
    }

    static async getLeagueUserId(league_id, user_id) {
        try {
            const result = await database.findOne('league_users', {
                league_id,
                user_id,
                status: 'active'
            });
            return result ? result.league_user_id : null;
        } catch (error) {
            return null;
        }
    }

    static async createDefaultSettings(league_id, pool_type, pick_method = 'straight_up') {
        try {
            if (pool_type === 'confidence') {
                // Create confidence pool settings (deadline settings are now handled at league level)
                await database.insert('confidence_pool_settings', {
                    league_id,
                    pick_type: pick_method,
                    min_confidence_points: 1,
                    max_confidence_points: 16,
                    allow_confidence_ties: 0,
                    pick_deadline_type: 'kickoff', // Default value for backward compatibility, but not used
                    custom_deadline_minutes: 0,
                    show_picks_before_kickoff: 0,
                    show_picks_after_deadline: 1,
                    show_confidence_points: 1,
                    allow_late_entry: 0,
                    late_entry_deadline_week: 4,
                    late_entry_scoring: 'from_join_week',
                    primary_tiebreaker: 'mnf_total',
                    secondary_tiebreaker: 'highest_confidence_correct',
                    include_playoffs: 0,
                    playoff_scoring_multiplier: 1.00,
                    require_all_games_picked: 1,
                    allow_push_games: 1
                });
            }
            // Add other pool type settings as needed
        } catch (error) {
            throw error;
        }
    }

    static generateJoinCode() {
        // Generate a 8-character alphanumeric code
        return crypto.randomBytes(4).toString('hex').toUpperCase();
    }

    static async regenerateJoinCode(league_id) {
        try {
            let newCode;
            let isUnique = false;
            let attempts = 0;
            const maxAttempts = 10;

            while (!isUnique && attempts < maxAttempts) {
                newCode = this.generateJoinCode();
                const existing = await this.findByJoinCode(newCode);
                isUnique = !existing;
                attempts++;
            }

            if (!isUnique) {
                throw new Error('Could not generate unique join code');
            }

            await database.update('leagues', 
                { join_code: newCode },
                { league_id }
            );

            return newCode;
        } catch (error) {
            throw error;
        }
    }

    static async isUserMember(league_id, user_id) {
        try {
            const member = await database.findOne('league_users', {
                league_id,
                user_id,
                status: 'active'
            });
            return !!member;
        } catch (error) {
            return false;
        }
    }

    static async isUserCommissioner(league_id, user_id) {
        try {
            // First check if user is the main commissioner
            const league = await database.findById('leagues', league_id, 'league_id');
            if (league && league.commissioner_id === user_id) {
                return true;
            }
            
            // Then check if user is a co-commissioner
            const coCommissioner = await database.executeMany(`
                SELECT role 
                FROM league_users 
                WHERE league_id = ? AND user_id = ? AND role = 'co_commissioner' AND status = 'active'
            `, [league_id, user_id]);
            
            return coCommissioner && coCommissioner.length > 0;
        } catch (error) {
            return false;
        }
    }
    
    static async isUserMainCommissioner(league_id, user_id) {
        try {
            const league = await database.findById('leagues', league_id, 'league_id');
            return league && league.commissioner_id === user_id;
        } catch (error) {
            return false;
        }
    }

    static async assignUsersToDefaultTier(league_id) {
        try {
            const league = await this.findById(league_id);
            if (!league || !league.enable_multi_tier || !league.default_tier_id) {
                return false;
            }

            // Find users without tier assignments
            const usersWithoutTiers = await database.executeMany(`
                SELECT lu.league_user_id 
                FROM league_users lu
                LEFT JOIN league_user_tiers lut ON lu.league_user_id = lut.league_user_id
                WHERE lu.league_id = ? AND lu.status = 'active' AND lut.user_tier_id IS NULL
            `, [league_id]);

            if (usersWithoutTiers.length === 0) {
                return true;
            }

            // Get the default tier info
            const tierInfo = await database.executeMany(`
                SELECT entry_fee FROM league_entry_tiers 
                WHERE tier_id = ?
            `, [league.default_tier_id]);

            if (tierInfo.length === 0) {
                return false;
            }

            // Assign all users without tiers to the default tier
            for (const user of usersWithoutTiers) {
                await database.insert('league_user_tiers', {
                    league_user_id: user.league_user_id,
                    tier_id: league.default_tier_id,
                    amount_owed: tierInfo[0].entry_fee,
                    payment_status: tierInfo[0].entry_fee > 0 ? 'unpaid' : 'paid'
                });
            }

            return true;
        } catch (error) {
            throw error;
        }
    }
}

module.exports = League;