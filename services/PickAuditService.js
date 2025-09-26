const database = require('../config/database');

/**
 * Service for logging all pick changes and providing audit trail
 */
class PickAuditService {
    /**
     * Log any pick change (create, update, delete, manual assignment)
     */
    static async logPickChange(pickData) {
        try {
            const {
                pick_id = null,
                entry_id,
                league_id,
                game_id = null,
                week,
                action_type, // 'create', 'update', 'delete', 'manual_assign'
                old_values = null,
                new_values,
                changed_by_user_id,
                change_reason = null,
                is_commissioner_action = false
            } = pickData;


            // Validate required fields
            if (!entry_id || !league_id || !week || !action_type || !changed_by_user_id) {
                throw new Error('Missing required audit fields');
            }

            if (!new_values) {
                throw new Error('new_values is required for audit logging');
            }

            await database.execute(`
                INSERT INTO pick_audit_log (
                    pick_id, entry_id, league_id, game_id, week,
                    action_type, old_values, new_values,
                    changed_by_user_id, change_reason, is_commissioner_action
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                pick_id, entry_id, league_id, game_id, week,
                action_type,
                old_values ? JSON.stringify(old_values) : null,
                JSON.stringify(new_values),
                changed_by_user_id, change_reason, is_commissioner_action ? 1 : 0
            ]);


        } catch (error) {
            console.error('Error logging pick change:', error);
            console.error('Audit data that failed:', pickData);
            // Don't throw - logging shouldn't break the main operation
        }
    }

    /**
     * Log when user creates a new pick
     */
    static async logPickCreate(pick, userId) {
        await this.logPickChange({
            pick_id: pick.pick_id,
            entry_id: pick.entry_id,
            league_id: pick.league_id, // Will need to fetch this
            game_id: pick.game_id,
            week: pick.week,
            action_type: 'create',
            new_values: {
                selected_team: pick.selected_team,
                confidence_points: pick.confidence_points,
                pick_type: pick.pick_type
            },
            changed_by_user_id: userId,
            change_reason: 'User created pick'
        });
    }

    /**
     * Log when user updates an existing pick
     */
    static async logPickUpdate(oldPick, newPick, userId) {
        await this.logPickChange({
            pick_id: oldPick.pick_id,
            entry_id: oldPick.entry_id,
            league_id: oldPick.league_id,
            game_id: oldPick.game_id,
            week: oldPick.week,
            action_type: 'update',
            old_values: {
                selected_team: oldPick.selected_team,
                confidence_points: oldPick.confidence_points
            },
            new_values: {
                selected_team: newPick.selected_team,
                confidence_points: newPick.confidence_points
            },
            changed_by_user_id: userId,
            change_reason: 'User updated pick'
        });
    }

    /**
     * Log when commissioner manually assigns points to missing pick
     */
    static async logManualAssignment(entryId, leagueId, gameId, week, confidencePoints, commissionerUserId, reason) {
        await this.logPickChange({
            entry_id: entryId,
            league_id: leagueId,
            game_id: gameId,
            week: week,
            action_type: 'manual_assign',
            new_values: {
                selected_team: '--',
                confidence_points: confidencePoints,
                assigned_by_commissioner: true
            },
            changed_by_user_id: commissionerUserId,
            change_reason: reason || 'Commissioner manually assigned points for missing pick',
            is_commissioner_action: true
        });
    }

    /**
     * Log when picks are automatically locked due to game start
     */
    static async logPickLocking(pickIds, userId = null) {
        // This would be called from PickLockingService
        for (const pickId of pickIds) {
            await this.logPickChange({
                pick_id: pickId,
                action_type: 'auto_lock',
                new_values: { is_locked: true, locked_at: new Date() },
                changed_by_user_id: userId,
                change_reason: 'Pick automatically locked due to game start',
                is_commissioner_action: false
            });
        }
    }

    /**
     * Get complete audit trail for an entry and week
     */
    static async getPickAuditTrail(entryId, week) {
        try {
            const auditTrail = await database.execute(`
                SELECT
                    pal.*,
                    u.username as changed_by_username,
                    g.away_team_id, g.home_team_id,
                    at.abbreviation as away_team,
                    ht.abbreviation as home_team
                FROM pick_audit_log pal
                LEFT JOIN users u ON pal.changed_by_user_id = u.user_id
                LEFT JOIN games g ON pal.game_id = g.game_id
                LEFT JOIN teams at ON g.away_team_id = at.team_id
                LEFT JOIN teams ht ON g.home_team_id = ht.team_id
                WHERE pal.entry_id = ? AND pal.week = ?
                ORDER BY pal.created_at DESC
            `, [entryId, week]);

            return auditTrail;
        } catch (error) {
            console.error('Error fetching audit trail:', error);
            return [];
        }
    }

    /**
     * Get league-wide audit trail for commissioners
     */
    static async getLeagueAuditTrail(leagueId, week = null, limit = 100) {
        try {
            // Ensure parameters are the correct type
            const leagueIdNum = parseInt(leagueId);
            const weekNum = week ? parseInt(week) : null;
            const limitNum = parseInt(limit);

            // Use hardcoded LIMIT since parameterized LIMIT causes issues
            let query = `
                SELECT
                    pal.audit_id,
                    pal.pick_id,
                    pal.entry_id,
                    pal.league_id,
                    pal.game_id,
                    pal.week,
                    pal.action_type,
                    pal.old_values,
                    pal.new_values,
                    pal.changed_by_user_id,
                    pal.change_reason,
                    pal.is_commissioner_action,
                    pal.created_at,
                    u.username as changed_by_username,
                    u2.username as entry_username,
                    at.abbreviation as away_team,
                    ht.abbreviation as home_team
                FROM pick_audit_log pal
                LEFT JOIN users u ON pal.changed_by_user_id = u.user_id
                LEFT JOIN league_entries le ON pal.entry_id = le.entry_id
                LEFT JOIN league_users lu ON le.league_user_id = lu.league_user_id
                LEFT JOIN users u2 ON lu.user_id = u2.user_id
                LEFT JOIN games g ON pal.game_id = g.game_id
                LEFT JOIN teams at ON g.away_team_id = at.team_id
                LEFT JOIN teams ht ON g.home_team_id = ht.team_id
                WHERE pal.league_id = ?
                ORDER BY pal.created_at DESC
                LIMIT 100`;
            const params = [leagueIdNum];

            if (weekNum) {
                query = query.replace('WHERE pal.league_id = ?', 'WHERE pal.league_id = ? AND pal.week = ?');
                params.push(weekNum);
            }

            console.log('Using hardcoded LIMIT:', {
                query,
                params,
                types: params.map(p => typeof p),
                originalValues: { leagueId, week, limit }
            });

            const auditRows = await database.execute(query, params);

            console.log(`Retrieved ${auditRows.length} audit entries`);
            return auditRows;
        } catch (error) {
            console.error('Error fetching league audit trail:', error);
            return [];
        }
    }
}

module.exports = PickAuditService;