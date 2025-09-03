const database = require('../config/database');

class Payout {
    // Get or create payout configuration for a league
    static async getConfig(league_id) {
        try {
            let config = await database.findOne('league_payout_config', { league_id });
            
            if (!config) {
                // Create default configuration
                const result = await database.insert('league_payout_config', {
                    league_id,
                    expense_amount: 0,
                    expense_description: '',
                    weekly_payout_enabled: true,
                    weekly_positions: 3,
                    weekly_allocation_type: 'percentage',
                    weekly_total_percentage: 70.00,
                    weekly_total_fixed: 0,
                    season_payout_enabled: true,
                    season_positions: 3,
                    season_allocation_type: 'percentage',
                    season_total_percentage: 30.00,
                    season_total_fixed: 0,
                    total_purse: 0,
                    net_purse: 0,
                    payout_calculations_enabled: true,
                    manual_payout_message: ''
                });
                
                config = await database.findOne('league_payout_config', { config_id: result.insertId });
            }
            
            return config;
        } catch (error) {
            throw error;
        }
    }
    
    // Update payout configuration
    static async updateConfig(league_id, configData) {
        try {
            const config = await this.getConfig(league_id);
            
            // Remove fields that shouldn't be updated directly
            const { config_id, league_id: _, total_purse, net_purse, created_at, updated_at, ...updateData } = configData;
            
            // Update the configuration
            await database.update('league_payout_config', updateData, { config_id: config.config_id });
            
            // Recalculate purse after update
            await this.recalculatePurse(league_id);
            
            return await this.getConfig(league_id);
        } catch (error) {
            throw error;
        }
    }
    
    // Calculate total purse for a league
    static async calculateTotalPurse(league_id) {
        try {
            // Get league info
            const league = await database.findOne('leagues', { league_id });
            if (!league) {
                throw new Error('League not found');
            }
            
            let totalPurse = 0;
            
            if (league.enable_multi_tier) {
                // Calculate from tier payments
                const query = `
                    SELECT 
                        SUM(lut.amount_paid) as total_collected
                    FROM league_user_tiers lut
                    JOIN league_users lu ON lut.league_user_id = lu.league_user_id
                    WHERE lu.league_id = ? AND lu.status = 'active'
                `;
                const result = await database.executeMany(query, [league_id]);
                totalPurse = result[0]?.total_collected || 0;
            } else {
                // Calculate from simple entry fee × active members
                const memberQuery = `
                    SELECT COUNT(*) as member_count 
                    FROM league_users 
                    WHERE league_id = ? AND status = 'active'
                `;
                const memberResult = await database.executeMany(memberQuery, [league_id]);
                const memberCount = memberResult[0]?.member_count || 0;
                
                // Get total entries considering max_entries per user
                const entryQuery = `
                    SELECT COUNT(*) as entry_count 
                    FROM league_entries le
                    JOIN league_users lu ON le.league_user_id = lu.league_user_id
                    WHERE lu.league_id = ? AND le.status = 'active'
                `;
                const entryResult = await database.executeMany(entryQuery, [league_id]);
                const entryCount = entryResult[0]?.entry_count || 0;
                
                // Use entry count if available, otherwise use member count
                const multiplier = entryCount > 0 ? entryCount : memberCount;
                totalPurse = (league.entry_fee || 0) * multiplier;
            }
            
            return parseFloat(totalPurse);
        } catch (error) {
            throw error;
        }
    }
    
    // Recalculate and update purse
    static async recalculatePurse(league_id) {
        try {
            const totalPurse = await this.calculateTotalPurse(league_id);
            const config = await this.getConfig(league_id);
            
            const netPurse = Math.max(0, totalPurse - (config.expense_amount || 0));
            
            await database.update('league_payout_config', 
                { 
                    total_purse: totalPurse,
                    net_purse: netPurse 
                },
                { league_id }
            );
            
            // Also update individual payout structures if they exist
            await this.updatePayoutStructures(league_id, netPurse);
            
            return { totalPurse, netPurse };
        } catch (error) {
            throw error;
        }
    }
    
    // Update or create individual payout structures
    static async updatePayoutStructures(league_id, netPurse) {
        try {
            const config = await this.getConfig(league_id);
            
            // Delete existing structures for this league
            await database.delete('payout_structures', { league_id });
            
            // Calculate weekly payouts
            if (config.weekly_payout_enabled && config.weekly_positions > 0) {
                const weeklyPool = config.weekly_allocation_type === 'percentage' 
                    ? (netPurse * config.weekly_total_percentage / 100)
                    : config.weekly_total_fixed;
                
                // Default distribution for positions (60%, 30%, 10% for top 3)
                const defaultDistribution = [60, 30, 10, 5, 3, 2];
                
                for (let position = 1; position <= config.weekly_positions; position++) {
                    const percentage = defaultDistribution[position - 1] || (100 - defaultDistribution.slice(0, position - 1).reduce((a, b) => a + b, 0)) / (config.weekly_positions - position + 1);
                    
                    await database.insert('payout_structures', {
                        league_id,
                        payout_name: `Week Winner - Position ${position}`,
                        pool_type: 'confidence',
                        payout_type: 'weekly',
                        payout_frequency: 'weekly',
                        amount_type: 'fixed',
                        amount_value: (weeklyPool * percentage / 100) / 18, // Divide by 18 weeks
                        position_start: position,
                        position_end: position,
                        min_participants: position,
                        is_active: 1,
                        priority_order: position
                    });
                }
            }
            
            // Calculate season payouts
            if (config.season_payout_enabled && config.season_positions > 0) {
                const seasonPool = config.season_allocation_type === 'percentage'
                    ? (netPurse * config.season_total_percentage / 100)
                    : config.season_total_fixed;
                
                // Default distribution for positions (50%, 30%, 20% for top 3)
                const defaultDistribution = [50, 30, 20, 10, 5, 3];
                
                for (let position = 1; position <= config.season_positions; position++) {
                    const percentage = defaultDistribution[position - 1] || (100 - defaultDistribution.slice(0, position - 1).reduce((a, b) => a + b, 0)) / (config.season_positions - position + 1);
                    
                    await database.insert('payout_structures', {
                        league_id,
                        payout_name: `Season Total - Position ${position}`,
                        pool_type: 'confidence',
                        payout_type: 'season_final',
                        payout_frequency: 'once',
                        amount_type: 'fixed',
                        amount_value: seasonPool * percentage / 100,
                        position_start: position,
                        position_end: position,
                        min_participants: position,
                        is_active: 1,
                        priority_order: position + 100 // Season payouts have higher priority
                    });
                }
            }
            
            return true;
        } catch (error) {
            throw error;
        }
    }
    
    // Get detailed payout breakdown
    static async getPayoutBreakdown(league_id) {
        try {
            const config = await this.getConfig(league_id);
            const structures = await database.findMany('payout_structures', { league_id, is_active: 1 });
            
            // Calculate weekly and season totals
            let weeklyTotal = 0;
            let seasonTotal = 0;
            
            const weeklyPayouts = [];
            const seasonPayouts = [];
            
            for (const structure of structures) {
                const payout = {
                    position: structure.position_start,
                    name: structure.payout_name,
                    amount: parseFloat(structure.amount_value),
                    type: structure.amount_type
                };
                
                if (structure.payout_type === 'weekly') {
                    weeklyPayouts.push(payout);
                    weeklyTotal += payout.amount * 18; // 18 weeks
                } else if (structure.payout_type === 'season_final') {
                    seasonPayouts.push(payout);
                    seasonTotal += payout.amount;
                }
            }
            
            return {
                config,
                totalPurse: parseFloat(config.total_purse),
                expenses: parseFloat(config.expense_amount),
                netPurse: parseFloat(config.net_purse),
                weeklyPayouts: {
                    enabled: config.weekly_payout_enabled,
                    positions: config.weekly_positions,
                    total: weeklyTotal,
                    breakdown: weeklyPayouts.sort((a, b) => a.position - b.position)
                },
                seasonPayouts: {
                    enabled: config.season_payout_enabled,
                    positions: config.season_positions,
                    total: seasonTotal,
                    breakdown: seasonPayouts.sort((a, b) => a.position - b.position)
                },
                unallocated: parseFloat(config.net_purse) - weeklyTotal - seasonTotal
            };
        } catch (error) {
            throw error;
        }
    }
    
    // Update individual position payout
    static async updatePositionPayout(league_id, payout_type, position, amount) {
        try {
            const structure = await database.findOne('payout_structures', {
                league_id,
                payout_type,
                position_start: position
            });
            
            if (structure) {
                await database.update('payout_structures',
                    { amount_value: amount },
                    { payout_id: structure.payout_id }
                );
            }
            
            return true;
        } catch (error) {
            throw error;
        }
    }
}

module.exports = Payout;