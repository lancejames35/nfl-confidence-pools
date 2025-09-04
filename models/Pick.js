const database = require('../config/database');

class Pick {
    /**
     * Get all picks for a specific entry and week
     */
    static async getWeeklyPicks(entry_id, week) {
        try {
            const query = `
                SELECT 
                    p.*,
                    home.abbreviation as home_team,
                    away.abbreviation as away_team,
                    g.game_date,
                    g.game_time,
                    g.kickoff_timestamp,
                    g.status as game_status,
                    r.home_score,
                    r.away_score,
                    r.winning_team,
                    s.point_spread,
                    s.home_favorite
                FROM picks p
                JOIN games g ON p.game_id = g.game_id
                JOIN teams home ON g.home_team_id = home.team_id
                JOIN teams away ON g.away_team_id = away.team_id
                LEFT JOIN results r ON g.game_id = r.game_id
                LEFT JOIN spreads s ON g.game_id = s.game_id AND s.confidence_level = 'current'
                WHERE p.entry_id = ? AND p.week = ?
                ORDER BY p.confidence_points DESC
            `;
            
            return await database.execute(query, [entry_id, week]);
        } catch (error) {
            throw error;
        }
    }

    /**
     * Save or update picks for a week - OPTIMIZED
     */
    static async savePicks(entry_id, week, picks) {
        const connection = await database.getPool().getConnection();
        
        try {
            await connection.beginTransaction();
            
            if (picks.length === 0) {
                await connection.commit();
                return { success: true, message: 'No picks to save' };
            }
            
            // Get all locked picks for this entry/week in one query
            const [lockedPicks] = await connection.execute(
                'SELECT game_id FROM picks WHERE entry_id = ? AND week = ? AND is_locked = 1',
                [entry_id, week]
            );
            
            const lockedGameIds = new Set(lockedPicks.map(row => row.game_id));
            
            // Filter out picks for locked games
            const validPicks = picks.filter(pick => !lockedGameIds.has(pick.game_id));
            
            if (validPicks.length === 0) {
                await connection.commit();
                return { success: true, message: 'No picks to update (all games locked)' };
            }
            
            // Delete existing unlocked picks for this entry/week
            await connection.execute(
                'DELETE FROM picks WHERE entry_id = ? AND week = ? AND is_locked = 0',
                [entry_id, week]
            );
            
            // Batch insert new picks using bulk INSERT
            const insertValues = validPicks.map(pick => [
                entry_id,
                week,
                pick.game_id,
                pick.selected_team,
                pick.confidence_points,
                pick.pick_type || 'confidence',
                pick.is_locked || false
            ]);
            
            if (insertValues.length > 0) {
                const placeholders = insertValues.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
                const query = `
                    INSERT INTO picks (
                        entry_id, week, game_id, selected_team, 
                        confidence_points, pick_type, is_locked
                    ) VALUES ${placeholders}
                `;
                
                const flatValues = insertValues.flat();
                await connection.execute(query, flatValues);
            }
            
            await connection.commit();
            return { 
                success: true, 
                message: 'Picks saved successfully',
                saved_count: validPicks.length,
                locked_count: lockedGameIds.size
            };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * Lock picks for games that have started
     */
    static async lockPicks(entry_id, week) {
        try {
            const query = `
                UPDATE picks p
                JOIN games g ON p.game_id = g.game_id
                SET p.is_locked = 1, p.locked_at = NOW()
                WHERE p.entry_id = ? 
                AND p.week = ?
                AND g.kickoff_timestamp <= NOW()
                AND p.is_locked = 0
            `;
            
            const result = await database.execute(query, [entry_id, week]);
            return result.affectedRows;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Get available games for picking
     */
    static async getAvailableGames(week, season_year) {
        try {
            const query = `
                SELECT 
                    g.*,
                    home.abbreviation as home_team,
                    home.full_name as home_team_name,
                    home.primary_color as home_color,
                    home.logo_url as home_logo,
                    away.abbreviation as away_team,
                    away.full_name as away_team_name,
                    away.primary_color as away_color,
                    away.logo_url as away_logo,
                    s.point_spread,
                    s.home_favorite,
                    s.total_points as over_under,
                    s.home_moneyline,
                    s.away_moneyline
                FROM games g
                JOIN teams home ON g.home_team_id = home.team_id
                JOIN teams away ON g.away_team_id = away.team_id
                LEFT JOIN spreads s ON g.game_id = s.game_id AND s.confidence_level = 'current'
                WHERE g.week = ? 
                AND g.season_year = ?
                ORDER BY g.kickoff_timestamp, g.game_id
            `;
            
            return await database.execute(query, [week, season_year]);
        } catch (error) {
            throw error;
        }
    }

    /**
     * Validate picks before saving
     */
    static async validatePicks(entry_id, week, picks) {
        const errors = [];
        
        // Check for duplicate confidence points
        const confidencePoints = picks.map(p => p.confidence_points);
        const uniquePoints = new Set(confidencePoints);
        
        if (uniquePoints.size !== confidencePoints.length) {
            errors.push('Each game must have a unique confidence point value');
        }
        
        // Check confidence points are in valid range (1-16 for typical week)
        const maxPoints = picks.length;
        for (const pick of picks) {
            if (pick.confidence_points < 1 || pick.confidence_points > maxPoints) {
                errors.push(`Confidence points must be between 1 and ${maxPoints}`);
                break;
            }
        }
        
        // Check all games have picks
        const availableGames = await this.getAvailableGames(week, new Date().getFullYear());
        if (picks.length !== availableGames.length) {
            errors.push('You must make a pick for every game');
        }
        
        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Calculate and update pick results
     */
    static async calculatePickResults(week) {
        try {
            const query = `
                UPDATE picks p
                JOIN games g ON p.game_id = g.game_id
                JOIN results r ON g.game_id = r.game_id
                SET 
                    p.is_correct = CASE 
                        WHEN p.selected_team = r.winning_team THEN 1 
                        ELSE 0 
                    END,
                    p.points_earned = CASE 
                        WHEN p.selected_team = r.winning_team THEN p.confidence_points 
                        ELSE 0 
                    END
                WHERE p.week = ?
                AND g.status = 'completed'
                AND p.is_correct IS NULL
            `;
            
            const result = await database.execute(query, [week]);
            return result.affectedRows;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Get pick statistics for an entry
     */
    static async getPickStats(entry_id, week = null) {
        try {
            let query = `
                SELECT 
                    COUNT(*) as total_picks,
                    SUM(is_correct) as correct_picks,
                    SUM(points_earned) as total_points,
                    MAX(CASE WHEN is_correct = 1 THEN confidence_points ELSE 0 END) as highest_correct,
                    MIN(CASE WHEN is_correct = 0 THEN confidence_points ELSE NULL END) as lowest_incorrect,
                    AVG(CASE WHEN is_correct = 1 THEN confidence_points ELSE NULL END) as avg_correct_confidence
                FROM picks
                WHERE entry_id = ?
            `;
            
            const params = [entry_id];
            
            if (week) {
                query += ' AND week = ?';
                params.push(week);
            }
            
            const results = await database.execute(query, params);
            return results[0];
        } catch (error) {
            throw error;
        }
    }

    /**
     * Get all picks for a league for a specific week
     */
    static async getLeagueWeekPicks(league_id, week) {
        try {
            const query = `
                SELECT 
                    p.*,
                    le.team_name,
                    lu.user_id,
                    u.username,
                    home.abbreviation as home_team,
                    away.abbreviation as away_team,
                    g.kickoff_timestamp
                FROM picks p
                JOIN league_entries le ON p.entry_id = le.entry_id
                JOIN league_users lu ON le.league_user_id = lu.league_user_id
                JOIN users u ON lu.user_id = u.user_id
                JOIN games g ON p.game_id = g.game_id
                JOIN teams home ON g.home_team_id = home.team_id
                JOIN teams away ON g.away_team_id = away.team_id
                WHERE lu.league_id = ?
                AND p.week = ?
                ORDER BY le.entry_id, p.confidence_points DESC
            `;
            
            return await database.execute(query, [league_id, week]);
        } catch (error) {
            throw error;
        }
    }

    /**
     * Check if picks can be edited (not locked)
     */
    static async canEditPicks(entry_id, week) {
        try {
            const query = `
                SELECT 
                    cps.pick_deadline_type,
                    cps.custom_deadline_minutes,
                    MIN(g.kickoff_timestamp) as earliest_kickoff,
                    MAX(g.kickoff_timestamp) as latest_kickoff,
                    COUNT(*) as total_games,
                    SUM(CASE WHEN g.kickoff_timestamp <= NOW() THEN 1 ELSE 0 END) as started_games
                FROM league_entries le
                JOIN league_users lu ON le.league_user_id = lu.league_user_id
                JOIN confidence_pool_settings cps ON lu.league_id = cps.league_id
                JOIN games g ON g.week = ? AND g.season_year = YEAR(NOW())
                WHERE le.entry_id = ?
                GROUP BY cps.pick_deadline_type, cps.custom_deadline_minutes
            `;
            
            const results = await database.execute(query, [week, entry_id]);
            if (results.length === 0) {
                return false; // No league found or no games
            }
            
            const data = results[0];
            let deadlineTime;
            
            // Calculate deadline based on league settings
            if (data.pick_deadline_type === 'kickoff' || data.pick_deadline_type === 'first_game') {
                // Picks close when the first game of the week kicks off
                deadlineTime = data.earliest_kickoff;
            } else if (data.pick_deadline_type === 'custom') {
                // Custom deadline - X minutes before earliest kickoff
                deadlineTime = new Date(data.earliest_kickoff.getTime() - (data.custom_deadline_minutes * 60 * 1000));
            } else if (data.pick_deadline_type === 'per_game') {
                // Per-game deadlines - week is "open" until the last game kicks off
                // Individual games are locked separately when they start
                deadlineTime = data.latest_kickoff;
            } else {
                // Default to first game kickoff if unknown type
                deadlineTime = data.earliest_kickoff;
            }
            
            // Can edit if current time is before deadline
            return new Date() < deadlineTime;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Check if a specific game can be edited (for per-game deadlines)
     */
    static async canEditGame(entry_id, game_id) {
        try {
            const query = `
                SELECT 
                    cps.pick_deadline_type,
                    cps.custom_deadline_minutes,
                    g.kickoff_timestamp
                FROM league_entries le
                JOIN league_users lu ON le.league_user_id = lu.league_user_id
                JOIN confidence_pool_settings cps ON lu.league_id = cps.league_id
                JOIN games g ON g.game_id = ?
                WHERE le.entry_id = ?
            `;
            
            const results = await database.execute(query, [game_id, entry_id]);
            if (results.length === 0) {
                return false; // No league found or game not found
            }
            
            const data = results[0];
            let deadlineTime;
            
            // Calculate deadline based on league settings
            if (data.pick_deadline_type === 'per_game') {
                // Individual game deadline is the kickoff time
                deadlineTime = data.kickoff_timestamp;
            } else if (data.pick_deadline_type === 'custom') {
                // Custom deadline - X minutes before game kickoff
                deadlineTime = new Date(data.kickoff_timestamp.getTime() - (data.custom_deadline_minutes * 60 * 1000));
            } else {
                // For 'kickoff' and 'first_game', use the week-level canEditPicks logic
                // This method should only be called for per_game scenarios
                deadlineTime = data.kickoff_timestamp;
            }
            
            // Can edit if current time is before deadline
            return new Date() < deadlineTime;
        } catch (error) {
            return false;
        }
    }

    /**
     * Lock picks for games that have started (handles all deadline types)
     */
    static async lockStartedGames(entry_id, week) {
        try {
            // Get league deadline settings for this entry
            const settingsQuery = `
                SELECT cps.pick_deadline_type, cps.custom_deadline_minutes,
                       MIN(g.kickoff_timestamp) as earliest_kickoff
                FROM league_entries le
                JOIN league_users lu ON le.league_user_id = lu.league_user_id
                JOIN confidence_pool_settings cps ON lu.league_id = cps.league_id
                JOIN games g ON g.week = ? AND g.season_year = YEAR(NOW())
                WHERE le.entry_id = ?
                GROUP BY cps.pick_deadline_type, cps.custom_deadline_minutes
            `;
            
            const [settings] = await database.execute(settingsQuery, [week, entry_id]);
            if (!settings) return false;
            
            let lockQuery;
            let queryParams;
            
            if (settings.pick_deadline_type === 'per_game') {
                // Per-game: Lock individual games as they start
                lockQuery = `
                    UPDATE picks p
                    JOIN games g ON p.game_id = g.game_id
                    SET p.is_locked = 1, p.locked_at = NOW()
                    WHERE p.entry_id = ? AND p.week = ? AND p.is_locked = 0
                        AND g.kickoff_timestamp <= NOW()
                `;
                queryParams = [entry_id, week];
                
            } else if (settings.pick_deadline_type === 'first_game' || settings.pick_deadline_type === 'kickoff') {
                // First game/kickoff: Lock ALL picks when first game starts
                lockQuery = `
                    UPDATE picks p
                    SET p.is_locked = 1, p.locked_at = NOW()
                    WHERE p.entry_id = ? AND p.week = ? AND p.is_locked = 0
                        AND ? <= NOW()
                `;
                queryParams = [entry_id, week, settings.earliest_kickoff];
                
            } else if (settings.pick_deadline_type === 'custom') {
                // Custom: Lock ALL picks X minutes before first game
                const customDeadline = new Date(settings.earliest_kickoff.getTime() - (settings.custom_deadline_minutes * 60 * 1000));
                lockQuery = `
                    UPDATE picks p
                    SET p.is_locked = 1, p.locked_at = NOW()
                    WHERE p.entry_id = ? AND p.week = ? AND p.is_locked = 0
                        AND ? <= NOW()
                `;
                queryParams = [entry_id, week, customDeadline];
            } else {
                // Unknown deadline type, no locking
                return false;
            }
            
            await database.execute(lockQuery, queryParams);
            return true;
        } catch (error) {
            // Error occurred in lockStartedGames
            return false;
        }
    }

    /**
     * Auto-save picks (for draft functionality)
     */
    static async autoSaveDraft(entry_id, week, picks) {
        try {
            // Store picks in a temporary/draft state
            const draftData = JSON.stringify(picks);
            
            const query = `
                INSERT INTO pick_drafts (entry_id, week, draft_data, saved_at)
                VALUES (?, ?, ?, NOW())
                ON DUPLICATE KEY UPDATE 
                    draft_data = VALUES(draft_data),
                    saved_at = NOW()
            `;
            
            await database.execute(query, [entry_id, week, draftData]);
            
            return { success: true, savedAt: new Date() };
        } catch (error) {
            // Don't throw - auto-save failures shouldn't break the UI
            return { success: false, error: error.message };
        }
    }

    /**
     * Get draft picks if they exist
     */
    static async getDraftPicks(entry_id, week) {
        try {
            const query = `
                SELECT draft_data, saved_at
                FROM pick_drafts
                WHERE entry_id = ? AND week = ?
            `;
            
            const results = await database.execute(query, [entry_id, week]);
            
            if (results.length > 0) {
                const draftData = results[0].draft_data;
                
                // Handle empty or null data
                if (!draftData) {
                    return null;
                }
                
                try {
                    // If draftData is already an object (MySQL JSON type), return it directly
                    if (typeof draftData === 'object') {
                        return {
                            picks: draftData,
                            savedAt: results[0].saved_at
                        };
                    }
                    
                    // If it's a string, try to parse it
                    if (typeof draftData === 'string') {
                        if (draftData.trim() === '') {
                            return null;
                        }
                        return {
                            picks: JSON.parse(draftData),
                            savedAt: results[0].saved_at
                        };
                    }
                    
                    // Unknown type
                    return null;
                    
                } catch (jsonError) {
                    return null;
                }
            }
            
            return null;
        } catch (error) {
            return null;
        }
    }
}

module.exports = Pick;