const axios = require('axios');
const database = require('../config/database');
const APICallTracker = require('./APICallTracker');

class ESPNApiService {
    constructor() {
        this.baseUrl = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
        this.lastFetchTime = null;
        this.cacheData = null;
        this.cacheTimeout = 300000; // 5 minutes cache (increased from 2 minutes)
        
        // Fallback rate limiting (memory-based as backup)
        this.lastAPICallTime = null;
        this.minTimeBetweenCalls = 300000; // 5 minutes minimum between API calls
    }

    /**
     * Fetch current week's games from ESPN API
     */
    async fetchCurrentWeekGames(week = null) {
        try {
            // Use cache if available and recent
            if (this.cacheData && this.lastFetchTime && 
                (Date.now() - this.lastFetchTime) < this.cacheTimeout) {
                await APICallTracker.logAPICall(this.baseUrl, true, true); // Log as cached response
                return this.cacheData;
            }

            // Check database-backed rate limiting + fallback rate limiting
            let canMakeCall = false;
            try {
                canMakeCall = await APICallTracker.canMakeAPICall();
            } catch (dbError) {
                // Fallback: check if 5 minutes have passed since last call
                const now = Date.now();
                canMakeCall = !this.lastAPICallTime || (now - this.lastAPICallTime) >= this.minTimeBetweenCalls;
            }
            
            if (!canMakeCall) {
                if (this.cacheData) {
                    await APICallTracker.logAPICall(this.baseUrl, true, true);
                    return this.cacheData;
                }
                throw new Error('ESPN API rate limit exceeded and no cached data available');
            }

            const url = week ? `${this.baseUrl}?week=${week}` : this.baseUrl;
            
            
            const response = await axios.get(url, {
                timeout: 15000, // Increased timeout
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'NFLConfidencePool/1.0'
                }
            });

            // Log successful API call to database
            await APICallTracker.logAPICall(url, true, false);
            
            // Update fallback rate limiting
            this.lastAPICallTime = Date.now();
            
            this.cacheData = response.data;
            this.lastFetchTime = Date.now();
            
            
            return response.data;
        } catch (error) {
            // Log failed API call
            const url = week ? `${this.baseUrl}?week=${week}` : this.baseUrl;
            await APICallTracker.logAPICall(url, false, false);
            
            if (error.response?.status === 429) {
                // Use cached data if available
                if (this.cacheData) {
                    return this.cacheData;
                }
            }
            
            throw new Error(`Failed to fetch ESPN data: ${error.message}`);
        }
    }

    /**
     * Get rate limiting status (delegated to database tracker)
     */
    async getRateLimitStatus() {
        const dbStatus = await APICallTracker.getRateLimitStatus();
        
        return {
            callsInLastHour: dbStatus.actualAPICallsInLastHour,
            totalRequestsInLastHour: dbStatus.totalRequestsInLastHour, 
            cachedResponsesInLastHour: dbStatus.cachedResponsesInLastHour,
            maxCallsPerHour: dbStatus.maxCallsPerHour,
            remainingCalls: dbStatus.remainingCalls,
            resetTime: dbStatus.resetTime,
            cacheAge: this.lastFetchTime ? Date.now() - this.lastFetchTime : null,
            canMakeCall: dbStatus.canMakeCall
        };
    }

    /**
     * Sanitize value for database (convert undefined to null)
     */
    sanitizeForDB(value) {
        return value === undefined ? null : value;
    }

    /**
     * Parse ESPN game data into our database format
     */
    parseGameData(espnGame) {
        const competition = espnGame.competitions?.[0];
        if (!competition) {
            throw new Error('No competition data found');
        }
        
        const competitors = competition.competitors || [];
        if (competitors.length < 2) {
            throw new Error('Invalid competitors data');
        }
        
        const homeTeam = competitors.find(c => c.homeAway === 'home');
        const awayTeam = competitors.find(c => c.homeAway === 'away');
        
        if (!homeTeam || !awayTeam) {
            throw new Error('Could not identify home/away teams');
        }
        
        const status = espnGame.status;
        
        // Determine game status
        let gameStatus = 'scheduled';
        let isLive = false;
        let isFinal = false;
        
        switch(status.type.name) {
            case 'STATUS_IN_PROGRESS':
                gameStatus = 'in_progress';
                isLive = true;
                break;
            case 'STATUS_HALFTIME':
                gameStatus = 'in_progress';
                isLive = true;
                break;
            case 'STATUS_FINAL':
                gameStatus = 'completed';
                isFinal = true;
                break;
            case 'STATUS_POSTPONED':
                gameStatus = 'postponed';
                break;
            case 'STATUS_CANCELED':
                gameStatus = 'cancelled';
                break;
            case 'STATUS_DELAYED':
                gameStatus = 'in_progress';
                isLive = true;
                break;
        }
        
        // Get quarter-by-quarter scores
        const homeLineScores = homeTeam.linescores || [];
        const awayLineScores = awayTeam.linescores || [];
        
        return {
            espn_game_id: espnGame.id || null,
            espn_uid: espnGame.uid || null,
            kickoff_time: new Date(espnGame.date),
            game_status: gameStatus,
            is_live: isLive,
            is_final: isFinal,
            current_quarter: status.period || null,
            time_remaining: status.displayClock || null,
            status_detail: status.type?.detail || null,
            
            // Team data
            home_team_id: homeTeam?.team?.id || null,
            away_team_id: awayTeam?.team?.id || null,
            home_team_abbr: homeTeam?.team?.abbreviation || null,
            away_team_abbr: awayTeam?.team?.abbreviation || null,
            home_team_name: homeTeam?.team?.displayName || null,
            away_team_name: awayTeam?.team?.displayName || null,
            
            // Scores
            home_score: parseInt(homeTeam?.score) || 0,
            away_score: parseInt(awayTeam?.score) || 0,
            
            // Quarter scores
            home_q1: homeLineScores[0]?.value || 0,
            home_q2: homeLineScores[1]?.value || 0,
            home_q3: homeLineScores[2]?.value || 0,
            home_q4: homeLineScores[3]?.value || 0,
            home_ot: homeLineScores[4]?.value || 0,
            
            away_q1: awayLineScores[0]?.value || 0,
            away_q2: awayLineScores[1]?.value || 0,
            away_q3: awayLineScores[2]?.value || 0,
            away_q4: awayLineScores[3]?.value || 0,
            away_ot: awayLineScores[4]?.value || 0,
            
            // Additional metadata
            venue: competition.venue?.fullName || null,
            attendance: competition.attendance || null,
            broadcasts: competition.broadcasts?.map(b => b.market) || []
        };
    }

    /**
     * Update database with live scores from ESPN
     */
    async updateLiveScores(week = null, seasonYear = null) {
        const connection = await database.getPool().getConnection();
        
        try {
            await connection.beginTransaction();
            
            // Fetch ESPN data
            const espnData = await this.fetchCurrentWeekGames(week);
            
            if (!espnData.events || espnData.events.length === 0) {
                await connection.commit();
                return { success: true, gamesUpdated: 0, message: 'No games to update' };
            }

            const currentWeek = espnData.week.number;
            const currentSeason = seasonYear || new Date().getFullYear();
            
            let gamesUpdated = 0;
            let gamesProcessed = 0;
            const errors = [];
            const pickUpdateQueue = [];
            const updatedGames = [];

            for (const espnGame of espnData.events) {
                try {
                    const gameData = this.parseGameData(espnGame);
                    // Find matching game in our database using ESPN team IDs
                    const queryParams = [
                        currentWeek, 
                        currentSeason, 
                        this.sanitizeForDB(gameData.home_team_id), 
                        this.sanitizeForDB(gameData.away_team_id)
                    ];
                    
                    const [results] = await connection.execute(
                        `SELECT g.*, 
                         ht.abbreviation as home_abbr, 
                         at.abbreviation as away_abbr,
                         r.result_id,
                         r.home_score as existing_home_score,
                         r.away_score as existing_away_score,
                         r.current_quarter as existing_quarter,
                         r.time_remaining as existing_time
                         FROM games g
                         JOIN teams ht ON g.home_team_id = ht.team_id
                         JOIN teams at ON g.away_team_id = at.team_id
                         LEFT JOIN results r ON g.game_id = r.game_id
                         WHERE g.week = ? 
                         AND g.season_year = ?
                         AND ht.espn_team_id = ?
                         AND at.espn_team_id = ?`,
                        queryParams
                    );
                    
                    if (!results || results.length === 0) {
                        continue;
                    }
                    
                    const existingGame = results[0];
                    if (!existingGame) {
                        continue;
                    }

                    gamesProcessed++;

                    // Update game status
                    if (existingGame.status !== gameData.game_status) {
                        await connection.execute(
                            'UPDATE games SET status = ? WHERE game_id = ?',
                            [this.sanitizeForDB(gameData.game_status), existingGame.game_id]
                        );
                    }

                    // Check if we need to update results
                    const scoresChanged = existingGame.existing_home_score !== gameData.home_score ||
                                        existingGame.existing_away_score !== gameData.away_score;
                    const quarterChanged = existingGame.existing_quarter !== gameData.current_quarter;
                    const timeChanged = existingGame.existing_time !== gameData.time_remaining;
                    
                    if (gameData.is_live || gameData.is_final || scoresChanged || quarterChanged || timeChanged) {
                        // Determine winning team (null if tied)
                        let winningTeam = null;
                        let marginOfVictory = null;
                        
                        if (gameData.home_score !== gameData.away_score) {
                            if (gameData.home_score > gameData.away_score) {
                                winningTeam = gameData.home_team_abbr;
                                marginOfVictory = gameData.home_score - gameData.away_score;
                            } else {
                                winningTeam = gameData.away_team_abbr;
                                marginOfVictory = gameData.away_score - gameData.home_score;
                            }
                        }

                        // Update or insert results
                        if (existingGame.result_id) {
                            // Update existing result
                            await connection.execute(
                                `UPDATE results SET 
                                 home_score = ?,
                                 away_score = ?,
                                 winning_team = ?,
                                 margin_of_victory = ?,
                                 home_q1 = ?, home_q2 = ?, home_q3 = ?, home_q4 = ?, home_ot = ?,
                                 away_q1 = ?, away_q2 = ?, away_q3 = ?, away_q4 = ?, away_ot = ?,
                                 overtime = ?,
                                 current_quarter = ?,
                                 time_remaining = ?,
                                 final_status = ?,
                                 completed_at = ?
                                 WHERE result_id = ?`,
                                [
                                    this.sanitizeForDB(gameData.home_score),
                                    this.sanitizeForDB(gameData.away_score),
                                    this.sanitizeForDB(winningTeam),
                                    this.sanitizeForDB(marginOfVictory),
                                    this.sanitizeForDB(gameData.home_q1), this.sanitizeForDB(gameData.home_q2), this.sanitizeForDB(gameData.home_q3), this.sanitizeForDB(gameData.home_q4), this.sanitizeForDB(gameData.home_ot),
                                    this.sanitizeForDB(gameData.away_q1), this.sanitizeForDB(gameData.away_q2), this.sanitizeForDB(gameData.away_q3), this.sanitizeForDB(gameData.away_q4), this.sanitizeForDB(gameData.away_ot),
                                    gameData.home_ot > 0 || gameData.away_ot > 0 ? 1 : 0,
                                    this.sanitizeForDB(gameData.current_quarter),
                                    this.sanitizeForDB(gameData.time_remaining),
                                    gameData.is_final ? 'final' : null,
                                    gameData.is_final ? new Date() : null,
                                    existingGame.result_id
                                ]
                            );
                        } else {
                            // Insert new result
                            await connection.execute(
                                `INSERT INTO results (
                                    game_id, home_score, away_score, winning_team, margin_of_victory,
                                    home_q1, home_q2, home_q3, home_q4, home_ot,
                                    away_q1, away_q2, away_q3, away_q4, away_ot,
                                    overtime, current_quarter, time_remaining, final_status, completed_at
                                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                                [
                                    existingGame.game_id,
                                    this.sanitizeForDB(gameData.home_score),
                                    this.sanitizeForDB(gameData.away_score),
                                    this.sanitizeForDB(winningTeam),
                                    this.sanitizeForDB(marginOfVictory),
                                    this.sanitizeForDB(gameData.home_q1), this.sanitizeForDB(gameData.home_q2), this.sanitizeForDB(gameData.home_q3), this.sanitizeForDB(gameData.home_q4), this.sanitizeForDB(gameData.home_ot),
                                    this.sanitizeForDB(gameData.away_q1), this.sanitizeForDB(gameData.away_q2), this.sanitizeForDB(gameData.away_q3), this.sanitizeForDB(gameData.away_q4), this.sanitizeForDB(gameData.away_ot),
                                    gameData.home_ot > 0 || gameData.away_ot > 0 ? 1 : 0,
                                    this.sanitizeForDB(gameData.current_quarter),
                                    this.sanitizeForDB(gameData.time_remaining),
                                    gameData.is_final ? 'final' : null,
                                    gameData.is_final ? new Date() : null
                                ]
                            );
                        }

                        // Update picks - set is_correct based on current winning team
                        // NULL if tied, 1 if winning, 0 if losing
                        await connection.execute(
                            `UPDATE picks p
                             SET 
                                p.is_correct = CASE 
                                    WHEN ? IS NULL THEN NULL
                                    WHEN p.selected_team = ? THEN 1
                                    ELSE 0
                                END,
                                p.points_earned = CASE 
                                    WHEN ? IS NULL THEN 0
                                    WHEN p.selected_team = ? THEN p.confidence_points
                                    ELSE 0
                                END
                             WHERE p.game_id = ?`,
                            [
                                winningTeam,
                                winningTeam,
                                winningTeam,
                                winningTeam,
                                existingGame.game_id
                            ]
                        );

                        updatedGames.push({
                            gameId: existingGame.game_id,
                            teams: `${gameData.away_team_abbr} @ ${gameData.home_team_abbr}`,
                            score: `${gameData.away_score}-${gameData.home_score}`,
                            status: gameData.is_final ? 'Final' : `Q${gameData.current_quarter} ${gameData.time_remaining}`,
                            winningTeam: winningTeam
                        });

                        gamesUpdated++;
                    }
                    
                } catch (gameError) {
                    errors.push({ gameId: espnGame.id, error: gameError.message });
                }
            }

            // Update user totals for all affected entries would go here
            // Currently disabled due to unknown column structure in league_entries

            await connection.commit();
            
            // Emit WebSocket update if available
            try {
                const socketManager = require('../config/socket');
                if (socketManager && socketManager.io) {
                    socketManager.broadcastScoreUpdate({
                        week: currentWeek,
                        season: currentSeason,
                        gamesUpdated: updatedGames
                    });
                }
            } catch (socketError) {
                // Socket update failed - continue
            }
            
            const summary = {
                success: true,
                gamesProcessed,
                gamesUpdated,
                updatedGames,
                errors,
                week: currentWeek,
                timestamp: new Date().toISOString()
            };
            
            return summary;
            
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * Update all user totals for the week
     */
    async updateAllUserTotals(connection, week, seasonYear) {
        try {
            // Update weekly scores, season totals, and max possible for all entries
            const updateQuery = `
                UPDATE league_entries le
                SET 
                    le.weekly_score = (
                        SELECT COALESCE(SUM(p.points_earned), 0)
                        FROM picks p
                        WHERE p.entry_id = le.entry_id
                        AND p.week = ?
                    ),
                    le.season_total = (
                        SELECT COALESCE(SUM(p.points_earned), 0)
                        FROM picks p
                        WHERE p.entry_id = le.entry_id
                    ),
                    le.max_possible = (
                        SELECT COALESCE(SUM(
                            CASE 
                                WHEN g.status = 'completed' THEN p.points_earned
                                WHEN g.status IN ('in_progress', 'scheduled') THEN p.confidence_points
                                ELSE 0
                            END
                        ), 0)
                        FROM picks p
                        JOIN games g ON p.game_id = g.game_id
                        WHERE p.entry_id = le.entry_id
                        AND p.week = ?
                    )
                WHERE le.entry_id IN (
                    SELECT DISTINCT entry_id 
                    FROM picks 
                    WHERE week = ?
                )`;

            await connection.execute(updateQuery, [
                week,       // for weekly_score
                week,       // for max_possible
                week        // for WHERE clause
            ]);

        } catch (error) {
            throw error;
        }
    }

    /**
     * Get live game status for API endpoint
     */
    async getLiveGameStatus(week, seasonYear) {
        try {
            const query = `
                SELECT 
                    g.game_id,
                    g.espn_game_id,
                    g.status,
                    r.home_score,
                    r.away_score,
                    r.current_quarter,
                    r.time_remaining,
                    r.winning_team,
                    ht.abbreviation as home_team,
                    at.abbreviation as away_team
                FROM games g
                JOIN teams ht ON g.home_team_id = ht.team_id
                JOIN teams at ON g.away_team_id = at.team_id
                LEFT JOIN results r ON g.game_id = r.game_id
                WHERE g.week = ? AND g.season_year = ?
                ORDER BY g.kickoff_timestamp`;

            const games = await database.execute(query, [week, seasonYear]);
            
            return games.map(game => ({
                ...game,
                isLive: game.status === 'in_progress',
                isFinal: game.status === 'completed',
                displayStatus: this.formatGameStatus(game)
            }));
        } catch (error) {
            throw error;
        }
    }

    /**
     * Format game status for display
     */
    formatGameStatus(game) {
        if (game.status === 'completed') {
            return 'Final';
        } else if (game.status === 'in_progress') {
            const quarter = game.current_quarter;
            const timeRemaining = game.time_remaining || '';
            
            // Handle specific game states
            if (quarter === 2 && timeRemaining === '0:00') {
                return 'Halftime';
            } else if (quarter === 1 && timeRemaining === '0:00') {
                return 'End of 1st';
            } else if (quarter === 3 && timeRemaining === '0:00') {
                return 'End of 3rd';  
            } else if (quarter === 4 && timeRemaining === '0:00') {
                return 'End of 4th';
            } else if (quarter > 4) {
                // Overtime
                if (timeRemaining === '0:00') {
                    return `End of OT${quarter - 4}`;
                } else {
                    return `OT${quarter > 5 ? quarter - 4 : ''} - ${timeRemaining}`;
                }
            } else if (quarter >= 1 && quarter <= 4) {
                const quarterNames = ['', '1st', '2nd', '3rd', '4th'];
                return `${quarterNames[quarter]} - ${timeRemaining}`;
            }
            return 'In Progress';
        } else if (game.status === 'postponed') {
            return 'Postponed';
        } else if (game.status === 'cancelled') {
            return 'Cancelled';
        }
        
        // If we have quarter/time data but status isn't exactly 'in_progress', 
        // treat it as live if it looks like game data
        if (game.current_quarter && game.current_quarter > 0) {
            const quarter = game.current_quarter;
            const timeRemaining = game.time_remaining || '';
            
            if (quarter === 2 && timeRemaining === '0:00') {
                return 'Halftime';
            } else if (quarter === 1 && timeRemaining === '0:00') {
                return 'End of 1st';
            } else if (quarter === 3 && timeRemaining === '0:00') {
                return 'End of 3rd';  
            } else if (quarter === 4 && timeRemaining === '0:00') {
                return 'End of 4th';
            } else if (quarter >= 1 && quarter <= 4) {
                const quarterNames = ['', '1st', '2nd', '3rd', '4th'];
                return `${quarterNames[quarter]} - ${timeRemaining}`;
            } else if (quarter > 4) {
                if (timeRemaining === '0:00') {
                    return `End of OT${quarter - 4}`;
                } else {
                    return `OT${quarter > 5 ? quarter - 4 : ''} - ${timeRemaining}`;
                }
            }
            return 'In Progress';
        }
        
        return 'Scheduled';
    }
}

module.exports = new ESPNApiService();