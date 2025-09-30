const database = require('../config/database');
const PickAuditService = require('./PickAuditService');

/**
 * Service for commissioner manual pick assignments
 */
class ManualPickAssignmentService {
    /**
     * Get all users with missing picks for locked games in a league/week
     */
    static async getUsersWithMissingPicks(leagueId, week) {
        try {
            const query = `
                SELECT DISTINCT
                    le.entry_id,
                    lu.user_id,
                    u.username,
                    COUNT(DISTINCT missing_games.game_id) as missing_picks_count
                FROM league_entries le
                JOIN league_users lu ON le.league_user_id = lu.league_user_id
                JOIN users u ON lu.user_id = u.user_id
                CROSS JOIN (
                    SELECT g.game_id
                    FROM games g
                    WHERE g.week = ?
                    AND g.season_year = YEAR(CURDATE())
                    AND (g.status IN ('in_progress', 'completed') OR g.kickoff_timestamp <= NOW())
                ) missing_games
                LEFT JOIN picks p ON le.entry_id = p.entry_id
                    AND p.game_id = missing_games.game_id
                    AND p.week = ?
                WHERE lu.league_id = ?
                AND lu.status = 'active'
                AND le.status = 'active'
                AND p.pick_id IS NULL
                GROUP BY le.entry_id, lu.user_id, u.username
                HAVING missing_picks_count > 0
                ORDER BY u.username
            `;

            return await database.execute(query, [week, week, leagueId]);
        } catch (error) {
            console.error('Error getting users with missing picks:', error);
            return [];
        }
    }

    /**
     * Get detailed pick state for a specific entry/week for commissioner management
     */
    static async getEntryPickState(entryId, week) {
        try {
            // Get the league_id for this entry
            const [entryInfo] = await database.execute(`
                SELECT lu.league_id
                FROM league_entries le
                JOIN league_users lu ON le.league_user_id = lu.league_user_id
                WHERE le.entry_id = ?
            `, [entryId]);

            if (!entryInfo) {
                throw new Error('Entry not found');
            }

            const leagueId = entryInfo.league_id;

            // Check if this user has ANY missing picks for locked games in this week
            const missingPicksQuery = `
                SELECT COUNT(*) as missing_count
                FROM games g
                LEFT JOIN picks p ON g.game_id = p.game_id AND p.entry_id = ? AND p.week = ?
                WHERE g.week = ? AND g.season_year = YEAR(CURDATE())
                AND (g.status IN ('in_progress', 'completed') OR g.kickoff_timestamp <= NOW())
                AND p.pick_id IS NULL
            `;
            const [missingPicksResult] = await database.execute(missingPicksQuery, [entryId, week, week]);
            const hasMissingPicks = missingPicksResult.missing_count > 0;

            // Get all games for the week with pick status
            const query = `
                SELECT
                    g.game_id,
                    g.week,
                    g.kickoff_timestamp,
                    g.status as game_status,
                    at.abbreviation as away_team,
                    ht.abbreviation as home_team,
                    p.pick_id,
                    p.selected_team,
                    p.confidence_points,
                    p.is_locked as pick_is_locked,
                    CASE
                        WHEN g.status IN ('in_progress', 'completed') OR g.kickoff_timestamp <= NOW()
                        THEN 1 ELSE 0
                    END as game_is_locked
                FROM games g
                JOIN teams at ON g.away_team_id = at.team_id
                JOIN teams ht ON g.home_team_id = ht.team_id
                LEFT JOIN picks p ON g.game_id = p.game_id AND p.entry_id = ? AND p.week = ?
                WHERE g.week = ? AND g.season_year = YEAR(CURDATE())
                ORDER BY g.kickoff_timestamp ASC
            `;

            const games = await database.execute(query, [entryId, week, week]);

            // If user has missing picks, make all points available for editing
            // Otherwise, only unlocked points are available for editing
            let lockedPoints = [];
            if (!hasMissingPicks) {
                // Normal behavior - only locked points are unavailable
                const lockedPointsQuery = `
                    SELECT p.confidence_points
                    FROM picks p
                    JOIN games g ON p.game_id = g.game_id
                    WHERE p.entry_id = ? AND p.week = ?
                    AND p.confidence_points IS NOT NULL
                    AND (p.is_locked = 1 OR g.status IN ('in_progress', 'completed') OR g.kickoff_timestamp <= NOW())
                `;
                const lockedPointsResult = await database.execute(lockedPointsQuery, [entryId, week]);
                lockedPoints = lockedPointsResult.map(row => row.confidence_points);
            }
            // If hasMissingPicks is true, lockedPoints stays empty array, making all points available

            // Get all used points for display purposes
            const usedPointsQuery = `
                SELECT confidence_points
                FROM picks
                WHERE entry_id = ? AND week = ? AND confidence_points IS NOT NULL
            `;
            const usedPointsResult = await database.execute(usedPointsQuery, [entryId, week]);
            const usedPoints = usedPointsResult.map(row => row.confidence_points);

            // Available points = all points minus locked points (commissioner can reassign unlocked points)
            const totalGames = games.length;
            const allPoints = Array.from({length: totalGames}, (_, i) => i + 1);
            const availablePoints = allPoints.filter(point => !lockedPoints.includes(point));

            return {
                leagueId,
                entryId,
                week,
                hasMissingPicks,
                games: games.map(game => ({
                    ...game,
                    // Determine if commissioner can edit this game's pick
                    commissioner_editable: this.determineEditableState(game, hasMissingPicks)
                })),
                usedPoints,
                lockedPoints,
                availablePoints, // Points that can be assigned (not locked)
                totalGames
            };
        } catch (error) {
            console.error('Error getting entry pick state:', error);
            throw error;
        }
    }

    /**
     * Determine if commissioner can edit a pick for a game
     */
    static determineEditableState(game, hasMissingPicks = false) {
        // If user has missing picks, make ALL their games editable (except completely missing ones)
        if (hasMissingPicks && game.pick_id) {
            return 'editable'; // All existing picks become editable
        }

        if (game.game_is_locked && !game.pick_id) {
            return 'missing_locked'; // Can assign points to missing picks
        } else if (game.game_is_locked && game.pick_id && !hasMissingPicks) {
            return 'locked'; // Cannot edit (only when user has no missing picks)
        } else if (!game.game_is_locked && game.pick_id) {
            return 'editable'; // Can edit points on unlocked games
        } else {
            return 'not_picked'; // User hasn't picked yet, not commissioner's job
        }
    }

    /**
     * Assign confidence points to a missing pick
     */
    static async assignPointsToMissingPick(entryId, gameId, week, confidencePoints, commissionerUserId, reason = null) {
        const connection = await database.getPool().getConnection();

        try {
            await connection.beginTransaction();

            // Get league_id for audit logging
            const entryResult = await connection.execute(`
                SELECT lu.league_id
                FROM league_entries le
                JOIN league_users lu ON le.league_user_id = lu.league_user_id
                WHERE le.entry_id = ?
            `, [entryId]);

            const [entryRows] = entryResult;
            const entryInfo = entryRows[0];

            if (!entryInfo) {
                throw new Error('Entry not found');
            }

            const leagueId = entryInfo.league_id;

            // Validate the game is locked and no pick exists
            const gameResult = await connection.execute(`
                SELECT
                    g.game_id,
                    g.status,
                    g.kickoff_timestamp,
                    g.week,
                    g.season_year,
                    p.pick_id
                FROM games g
                LEFT JOIN picks p ON g.game_id = p.game_id AND p.entry_id = ? AND p.week = ?
                WHERE g.game_id = ? AND g.week = ? AND g.season_year = YEAR(CURDATE())
            `, [entryId, week, gameId, week]);

            const [gameRows] = gameResult;
            const gameCheck = gameRows[0];

            if (!gameCheck) {
                throw new Error('Game not found');
            }

            // Check multiple conditions for game being locked
            const statusLocked = gameCheck.status === 'in_progress' || gameCheck.status === 'completed';

            // Handle potential null/invalid kickoff_timestamp
            let timeLocked = false;
            let kickoffTime = null;
            let currentTime = new Date();

            if (gameCheck.kickoff_timestamp) {
                kickoffTime = new Date(gameCheck.kickoff_timestamp);

                // Check if the date is valid
                if (!isNaN(kickoffTime.getTime())) {
                    timeLocked = kickoffTime <= currentTime;
                }
            }

            const gameIsLocked = statusLocked || timeLocked;

            console.log('Game assignment validation:', {
                gameId: gameCheck.game_id,
                status: gameCheck.status,
                kickoff: gameCheck.kickoff_timestamp,
                week: gameCheck.week,
                season_year: gameCheck.season_year,
                pick_id: gameCheck.pick_id,
                currentTime: currentTime.toISOString(),
                kickoffTime: kickoffTime ? kickoffTime.toISOString() : null,
                statusLocked,
                timeLocked,
                gameIsLocked,
                entryId,
                requestedWeek: week,
                confidencePoints
            });

            if (!gameIsLocked) {
                throw new Error(`Cannot assign points to unlocked game. Status: ${gameCheck.status}, Kickoff: ${gameCheck.kickoff_timestamp}`);
            }

            if (gameCheck.pick_id) {
                throw new Error('Pick already exists for this game');
            }

            // Validate confidence points are available (allow duplicates for commissioner actions)
            await this.validateConfidencePoints(entryId, week, confidencePoints, null, connection, true);

            // Create the missing pick with '--' team selection
            console.log('Creating missing pick:', {
                entryId,
                week,
                gameId,
                confidencePoints,
                commissionerUserId
            });

            const [insertResult] = await connection.execute(`
                INSERT INTO picks (
                    entry_id, week, game_id, selected_team, confidence_points,
                    pick_type, is_locked, locked_at, picked_at
                ) VALUES (?, ?, ?, '--', ?, 'confidence', 1, NOW(), NOW())
            `, [entryId, week, gameId, confidencePoints]);

            const pickId = insertResult.insertId;
            console.log('Created pick with ID:', pickId);

            // Log the manual assignment
            await PickAuditService.logManualAssignment(
                entryId, leagueId, gameId, week, confidencePoints,
                commissionerUserId, reason
            );

            await connection.commit();
            console.log('Transaction committed successfully for missing pick:', pickId);

            return {
                success: true,
                pickId: pickId,
                message: `Assigned ${confidencePoints} points to missing pick`
            };

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * Update confidence points for existing pick (locked or unlocked)
     */
    static async updatePickConfidencePoints(pickId, newConfidencePoints, commissionerUserId, reason = null) {
        const connection = await database.getPool().getConnection();

        try {
            await connection.beginTransaction();

            // Get current pick details
            const currentPickResult = await connection.execute(`
                SELECT
                    p.*,
                    lu.league_id,
                    g.status as game_status,
                    g.kickoff_timestamp
                FROM picks p
                JOIN league_entries le ON p.entry_id = le.entry_id
                JOIN league_users lu ON le.league_user_id = lu.league_user_id
                JOIN games g ON p.game_id = g.game_id
                WHERE p.pick_id = ?
            `, [pickId]);

            const [currentPickRows] = currentPickResult;
            const currentPick = currentPickRows[0];

            if (!currentPick) {
                throw new Error('Pick not found');
            }

            // Validate confidence points are available (excluding current pick)
            // Allow duplicates for commissioner actions - they can resolve conflicts by reassigning
            await this.validateConfidencePoints(
                currentPick.entry_id,
                currentPick.week,
                newConfidencePoints,
                pickId,
                connection,
                true // allowDuplicates = true for commissioner actions
            );

            // Store old values for audit
            const oldValues = {
                selected_team: currentPick.selected_team,
                confidence_points: currentPick.confidence_points
            };

            // Update the pick
            console.log('Updating pick:', {
                pickId: pickId,
                currentPoints: currentPick.confidence_points,
                newPoints: newConfidencePoints,
                entryId: currentPick.entry_id,
                week: currentPick.week
            });

            const updateResult = await connection.execute(`
                UPDATE picks
                SET confidence_points = ?, updated_at = NOW()
                WHERE pick_id = ?
            `, [newConfidencePoints, pickId]);

            console.log('Update result:', {
                fullResult: updateResult,
                resultLength: updateResult.length,
                affectedRows: updateResult[0] ? updateResult[0].affectedRows : 'N/A',
                changedRows: updateResult[0] ? updateResult[0].changedRows : 'N/A',
                insertId: updateResult[0] ? updateResult[0].insertId : 'N/A'
            });

            // Verify the update was actually written to database
            const verificationResult = await connection.execute(`
                SELECT confidence_points, updated_at
                FROM picks
                WHERE pick_id = ?
            `, [pickId]);

            const [verificationRows] = verificationResult;
            const verifiedPick = verificationRows[0];
            console.log('Database verification after update:', {
                pickId: pickId,
                currentPointsInDB: verifiedPick ? verifiedPick.confidence_points : 'NOT FOUND',
                expectedPoints: newConfidencePoints,
                updated_at: verifiedPick ? verifiedPick.updated_at : 'NOT FOUND'
            });

            // Log the change
            await PickAuditService.logPickChange({
                pick_id: pickId,
                entry_id: currentPick.entry_id,
                league_id: currentPick.league_id,
                game_id: currentPick.game_id,
                week: currentPick.week,
                action_type: 'update',
                old_values: oldValues,
                new_values: {
                    selected_team: currentPick.selected_team,
                    confidence_points: newConfidencePoints
                },
                changed_by_user_id: commissionerUserId,
                change_reason: reason || 'Commissioner updated confidence points',
                is_commissioner_action: true
            });

            await connection.commit();
            console.log('Transaction committed successfully for pick:', pickId);

            // Final verification after commit using a new connection
            const finalVerificationResult = await database.execute(`
                SELECT confidence_points, updated_at
                FROM picks
                WHERE pick_id = ?
            `, [pickId]);

            const finalVerifiedPick = finalVerificationResult[0];
            console.log('Final database verification after commit:', {
                pickId: pickId,
                finalPointsInDB: finalVerifiedPick ? finalVerifiedPick.confidence_points : 'NOT FOUND',
                expectedPoints: newConfidencePoints,
                updated_at: finalVerifiedPick ? finalVerifiedPick.updated_at : 'NOT FOUND'
            });

            return {
                success: true,
                message: `Updated confidence points from ${currentPick.confidence_points} to ${newConfidencePoints}`
            };

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * Validate that confidence points are available for use
     */
    static async validateConfidencePoints(entryId, week, confidencePoints, excludePickId = null, connection = null, allowDuplicates = false) {
        const db = connection || database;

        // Skip duplicate validation if explicitly allowed (for commissioner actions)
        if (!allowDuplicates) {
            let query = `
                SELECT pick_id
                FROM picks
                WHERE entry_id = ? AND week = ? AND confidence_points = ?
            `;
            const params = [entryId, week, confidencePoints];

            if (excludePickId) {
                query += ` AND pick_id != ?`;
                params.push(excludePickId);
            }

            const duplicateResult = await db.execute(query, params);
            const [duplicateRows] = duplicateResult;
            const existingPick = duplicateRows[0];

            if (existingPick) {
                throw new Error(`Confidence points ${confidencePoints} already assigned to another pick`);
            }
        }

        // Validate points are within valid range
        const gameCountResult = await db.execute(`
            SELECT COUNT(*) as total_games
            FROM games
            WHERE week = ? AND season_year = YEAR(CURDATE())
        `, [week]);

        const [gameCountRows] = gameCountResult;
        const gameCount = gameCountRows[0];

        if (confidencePoints < 1 || confidencePoints > gameCount.total_games) {
            throw new Error(`Confidence points must be between 1 and ${gameCount.total_games}`);
        }

        return true;
    }
}

module.exports = ManualPickAssignmentService;