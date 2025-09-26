const database = require('../config/database');

/**
 * Service for automatically locking picks based on game kickoff times and league deadline settings
 */
class PickLockingService {
    /**
     * Check and lock picks for all leagues based on their deadline settings
     */
    static async processAllLeagues() {
        try {
            // Pick Locking Service: Starting league processing
            
            // Get all active leagues with their deadline settings
            const leagues = await database.execute(`
                SELECT 
                    l.league_id,
                    l.league_name,
                    l.season_year,
                    cps.pick_deadline_type
                FROM leagues l
                LEFT JOIN confidence_pool_settings cps ON l.league_id = cps.league_id
                WHERE l.status = 'active'
            `);
            
            for (const league of leagues) {
                await this.processLeague(league);
            }
            
            // Pick Locking Service: Completed processing leagues
            
        } catch (error) {
            // Pick Locking Service Error occurred
        }
    }
    
    /**
     * Process pick locking for a specific league
     * @param {Object} league - League data with deadline settings
     */
    static async processLeague(league) {
        try {
            const currentWeek = this.getCurrentNFLWeek();
            
            // Get games for current week that need to be checked
            const games = await database.execute(`
                SELECT game_id, kickoff_timestamp
                FROM games
                WHERE week = ? AND season_year = ?
                ORDER BY kickoff_timestamp ASC
            `, [currentWeek, league.season_year]);
            
            if (games.length === 0) {
                return; // No games this week
            }
            
            let gamesToLock = [];
            
            if (league.pick_deadline_type === 'first_game') {
                // First-game deadline: if first game has started, lock ALL games for the week
                const firstGame = games[0];
                if (this.hasGameStarted(firstGame.kickoff_timestamp)) {
                    gamesToLock = games.map(g => g.game_id);
                    // League locking ALL games due to first-game deadline
                }
            } else {
                // Per-game deadline: lock each game individually at its kickoff time
                games.forEach(game => {
                    if (this.hasGameStarted(game.kickoff_timestamp)) {
                        gamesToLock.push(game.game_id);
                    }
                });
                
                if (gamesToLock.length > 0) {
                    // League locking individual games with per-game deadline
                }
            }
            
            // Lock picks for the determined games
            if (gamesToLock.length > 0) {
                await this.lockPicksForGames(league.league_id, gamesToLock);
            }
            
        } catch (error) {
            // Error processing league
        }
    }
    
    /**
     * Check if a game has started based on Eastern Time
     * @param {Date} kickoffTimestamp - Game kickoff time from database
     * @returns {boolean} - True if game has started
     */
    static hasGameStarted(kickoffTimestamp) {
        // Convert database timestamp (CDT format representing ET) to actual Eastern Time
        // Database stores ET times but server interprets as CDT, so add 1 hour
        const easternKickoff = new Date(kickoffTimestamp.getTime() + (60 * 60 * 1000));
        const currentTime = new Date();
        
        // Lock picks exactly at kickoff time
        return currentTime >= easternKickoff;
    }
    
    /**
     * Lock picks for specific games in a league
     * @param {number} leagueId - League ID
     * @param {Array} gameIds - Array of game IDs to lock
     */
    static async lockPicksForGames(leagueId, gameIds) {
        try {
            const gameIdsPlaceholder = gameIds.map(() => '?').join(',');
            const params = [leagueId, ...gameIds];
            
            const result = await database.execute(`
                UPDATE picks p
                JOIN league_entries le ON p.entry_id = le.entry_id
                JOIN league_users lu ON le.league_user_id = lu.league_user_id
                SET 
                    p.is_locked = 1,
                    p.locked_at = NOW()
                WHERE lu.league_id = ?
                AND p.game_id IN (${gameIdsPlaceholder})
                AND p.is_locked = 0
            `, params);
            
            // Locked picks for league and games successfully
            
            // Emit real-time update for deadline passed
            const socketManager = require('../config/socket');
            if (socketManager && result.affectedRows > 0) {
                socketManager.emitToAll('deadlinePassed', { 
                    gameIds, 
                    leagueId, 
                    lockedPicksCount: result.affectedRows 
                });
            }
            
            // Log the locking action for audit trail
            await this.logLockingAction(leagueId, gameIds, result.affectedRows);
            
            // Note: Automatic missing pick processing has been removed
            // Commissioners can now manually assign picks for users who missed the deadline
            
        } catch (error) {
            // Error locking picks for league
        }
    }
    
    
    /**
     * Log locking actions to audit logs
     * @param {number} leagueId - League ID
     * @param {Array} gameIds - Array of game IDs locked
     * @param {number} picksLocked - Number of picks locked
     */
    static async logLockingAction(leagueId, gameIds, picksLocked) {
        try {
            await database.execute(`
                INSERT INTO audit_logs (
                    league_id,
                    entity_type,
                    action_type,
                    action_description,
                    context_data,
                    is_automated,
                    category
                ) VALUES (?, 'pick', 'lock', ?, ?, 1, 'system_action')
            `, [
                leagueId,
                `Automatically locked ${picksLocked} picks for ${gameIds.length} games`,
                JSON.stringify({ 
                    gameIds: gameIds,
                    picksLocked: picksLocked,
                    timestamp: new Date().toISOString()
                })
            ]);
        } catch (error) {
            // Error logging lock action
        }
    }
    
    /**
     * Get current NFL week
     * @returns {number} - Current NFL week (1-18)
     */
    static getCurrentNFLWeek() {
        const seasonStart = new Date(new Date().getFullYear(), 8, 5); // Sept 5
        const now = new Date();
        const diffTime = Math.abs(now - seasonStart);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const week = Math.ceil(diffDays / 7);
        return Math.min(Math.max(1, week), 18);
    }
    
    /**
     * Check specific games/picks for a league (for testing/debugging)
     * @param {number} leagueId - League ID to check
     * @returns {Object} - Status of games and picks for the league
     */
    static async getLeagueStatus(leagueId) {
        try {
            const currentWeek = this.getCurrentNFLWeek();
            
            // Get league settings
            const [leagueSettings] = await database.execute(`
                SELECT l.league_name, cps.pick_deadline_type
                FROM leagues l
                LEFT JOIN confidence_pool_settings cps ON l.league_id = cps.league_id
                WHERE l.league_id = ?
            `, [leagueId]);
            
            if (!leagueSettings) {
                return { error: 'League not found' };
            }
            
            // Get games for current week
            const games = await database.execute(`
                SELECT 
                    g.game_id,
                    g.kickoff_timestamp,
                    ht.abbreviation as home_team,
                    at.abbreviation as away_team
                FROM games g
                JOIN teams ht ON g.home_team_id = ht.team_id
                JOIN teams at ON g.away_team_id = at.team_id
                WHERE g.week = ? AND g.season_year = ?
                ORDER BY g.kickoff_timestamp ASC
            `, [currentWeek, new Date().getFullYear()]);
            
            // Check pick status for each game
            const gameStatus = games.map(game => {
                const hasStarted = this.hasGameStarted(game.kickoff_timestamp);
                const easternKickoff = new Date(game.kickoff_timestamp.getTime() + (60 * 60 * 1000));
                
                return {
                    game_id: game.game_id,
                    matchup: `${game.away_team} @ ${game.home_team}`,
                    kickoff_et: easternKickoff.toISOString(),
                    has_started: hasStarted,
                    should_be_locked: hasStarted
                };
            });
            
            // Get actual pick lock status
            const pickStatus = await database.execute(`
                SELECT 
                    p.game_id,
                    COUNT(p.pick_id) as total_picks,
                    SUM(CASE WHEN p.is_locked = 1 THEN 1 ELSE 0 END) as locked_picks
                FROM picks p
                JOIN league_entries le ON p.entry_id = le.entry_id
                JOIN league_users lu ON le.league_user_id = lu.league_user_id
                WHERE lu.league_id = ? AND p.week = ?
                GROUP BY p.game_id
            `, [leagueId, currentWeek]);
            
            return {
                league: leagueSettings,
                currentWeek,
                deadlineType: leagueSettings.pick_deadline_type,
                games: gameStatus,
                picks: pickStatus
            };
            
        } catch (error) {
            // Error getting league status
            return { error: error.message };
        }
    }
}

module.exports = PickLockingService;