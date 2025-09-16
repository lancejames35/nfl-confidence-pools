const express = require('express');
const router = express.Router();
const ESPNApiService = require('../../services/ESPNApiService');
const liveScoreScheduler = require('../../services/LiveScoreScheduler');
const { getCurrentNFLWeek } = require('../../utils/getCurrentWeek');
const database = require('../../config/database');

/**
 * GET /api/live-scores/status
 * Get current live game status for display
 */
router.get('/status', async (req, res) => {
    try {
        const week = parseInt(req.query.week) || await getCurrentNFLWeek(database);
        const seasonYear = parseInt(req.query.season) || new Date().getFullYear();
        
        const gameStatus = await ESPNApiService.getLiveGameStatus(week, seasonYear);
        
        res.json({
            success: true,
            week,
            seasonYear,
            games: gameStatus,
            lastUpdated: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/live-scores/manual-update
 * Manually trigger ESPN API update for current week
 */
router.post('/manual-update', async (req, res) => {
    try {
        const { getDefaultWeekForUI } = require('../../utils/getCurrentWeek');
        const currentWeek = await getDefaultWeekForUI(database);
        const seasonYear = new Date().getFullYear();
        
        console.log(`🔧 Manual ESPN API update triggered for Week ${currentWeek}, Season ${seasonYear}`);
        
        const result = await ESPNApiService.updateLiveScores(currentWeek, seasonYear);
        
        res.json({
            success: true,
            message: `ESPN API update completed for Week ${currentWeek}`,
            week: currentWeek,
            seasonYear: seasonYear,
            gamesProcessed: result.gamesProcessed,
            gamesUpdated: result.gamesUpdated,
            updatedGames: result.updatedGames,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Manual ESPN API update failed:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/live-scores/user-totals/:leagueId
 * Get updated user totals for a league
 */
router.get('/user-totals/:leagueId', async (req, res) => {
    try {
        const leagueId = parseInt(req.params.leagueId);
        const week = parseInt(req.query.week) || await getCurrentNFLWeek(database);
        const seasonYear = parseInt(req.query.season) || new Date().getFullYear();
        
        // Get user totals for the league
        const totalsQuery = `
            SELECT 
                le.entry_id,
                u.username,
                le.weekly_score,
                le.season_total,
                le.max_possible,
                COUNT(CASE WHEN p.is_correct = 1 THEN 1 END) as correct_picks,
                COUNT(CASE WHEN p.is_correct = 0 THEN 1 END) as incorrect_picks,
                COUNT(CASE WHEN p.is_correct IS NULL THEN 1 END) as pending_picks
            FROM league_entries le
            JOIN league_users lu ON le.league_user_id = lu.league_user_id
            JOIN users u ON lu.user_id = u.user_id
            LEFT JOIN picks p ON le.entry_id = p.entry_id AND p.week = ? AND p.season_year = ?
            WHERE lu.league_id = ?
            AND le.status = 'active'
            GROUP BY le.entry_id, u.username, le.weekly_score, le.season_total, le.max_possible
            ORDER BY le.weekly_score DESC, le.season_total DESC`;
        
        const userTotals = await database.execute(totalsQuery, [week, seasonYear, leagueId]);
        
        res.json({
            success: true,
            leagueId,
            week,
            seasonYear,
            userTotals,
            lastUpdated: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/live-scores/picks/:gameId
 * Get all picks for a specific game with current status
 */
router.get('/picks/:gameId', async (req, res) => {
    try {
        const gameId = parseInt(req.params.gameId);
        const leagueId = req.query.league_id ? parseInt(req.query.league_id) : null;
        
        let picksQuery = `
            SELECT 
                p.*,
                u.username,
                le.entry_id,
                g.status as game_status,
                r.winning_team,
                r.home_score,
                r.away_score,
                r.current_quarter,
                r.time_remaining,
                ht.abbreviation as home_team,
                at.abbreviation as away_team
            FROM picks p
            JOIN league_entries le ON p.entry_id = le.entry_id
            JOIN league_users lu ON le.league_user_id = lu.league_user_id
            JOIN users u ON lu.user_id = u.user_id
            JOIN games g ON p.game_id = g.game_id
            JOIN teams ht ON g.home_team_id = ht.team_id
            JOIN teams at ON g.away_team_id = at.team_id
            LEFT JOIN results r ON g.game_id = r.game_id
            WHERE p.game_id = ?`;
        
        const params = [gameId];
        
        if (leagueId) {
            picksQuery += ' AND lu.league_id = ?';
            params.push(leagueId);
        }
        
        picksQuery += ' ORDER BY u.username';
        
        const picks = await database.execute(picksQuery, params);
        
        // Format picks with status colors
        const formattedPicks = picks.map(pick => ({
            ...pick,
            statusColor: getPickStatusColor(pick),
            statusText: getPickStatusText(pick)
        }));
        
        res.json({
            success: true,
            gameId,
            picks: formattedPicks,
            gameInfo: picks.length > 0 ? {
                homeTeam: picks[0].home_team,
                awayTeam: picks[0].away_team,
                homeScore: picks[0].home_score,
                awayScore: picks[0].away_score,
                status: picks[0].game_status,
                currentQuarter: picks[0].current_quarter,
                timeRemaining: picks[0].time_remaining,
                winningTeam: picks[0].winning_team
            } : null,
            lastUpdated: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Helper function to determine pick status color
 */
function getPickStatusColor(pick) {
    if (pick.game_status === 'scheduled') {
        return 'gray'; // Not started
    } else if (pick.is_correct === 1) {
        return 'green'; // Winning/won
    } else if (pick.is_correct === 0) {
        return 'red'; // Losing/lost
    } else if (pick.is_correct === null) {
        return 'yellow'; // Tied game
    }
    return 'gray'; // Default
}

/**
 * Helper function to get pick status text
 */
function getPickStatusText(pick) {
    if (pick.game_status === 'scheduled') {
        return 'Scheduled';
    } else if (pick.game_status === 'completed') {
        return pick.is_correct === 1 ? 'Won' : 'Lost';
    } else if (pick.game_status === 'in_progress') {
        if (pick.is_correct === 1) {
            return 'Winning';
        } else if (pick.is_correct === 0) {
            return 'Losing';
        } else {
            return 'Tied';
        }
    }
    return 'Unknown';
}

/**
 * GET /api/live-scores/scheduler/status
 * Get scheduler status (authenticated users only)
 */
router.get('/scheduler/status', async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        const status = liveScoreScheduler.getStatus();
        
        // Get next game info
        const nextGameQuery = `
            SELECT 
                g.kickoff_timestamp,
                ht.abbreviation as home_team,
                at.abbreviation as away_team,
                g.status
            FROM games g
            JOIN teams ht ON g.home_team_id = ht.team_id
            JOIN teams at ON g.away_team_id = at.team_id
            WHERE g.kickoff_timestamp > NOW()
            ORDER BY g.kickoff_timestamp ASC
            LIMIT 1`;

        const nextGameResult = await database.execute(nextGameQuery);
        const nextGame = nextGameResult.length > 0 ? nextGameResult[0] : null;

        // Get live games count using same logic as LiveScoreScheduler
        const liveGamesQuery = `
            SELECT
                COUNT(*) as live_count,
                GROUP_CONCAT(CONCAT(nfl_game_id, ' (', status, ', stored: ', kickoff_timestamp, ', actual: ', DATE_ADD(kickoff_timestamp, INTERVAL 3 HOUR), ')') SEPARATOR ', ') as active_games
            FROM games
            WHERE (
                status = 'in_progress'
                OR (
                    status IN ('scheduled', 'in_progress')
                    AND kickoff_timestamp >= DATE_SUB(NOW(), INTERVAL 6 HOUR)
                    AND kickoff_timestamp <= DATE_ADD(NOW(), INTERVAL 3 HOUR)
                )
            )
            AND (
                status = 'in_progress'
                OR NOW() >= DATE_ADD(kickoff_timestamp, INTERVAL 3 HOUR)  -- past actual kickoff (stored + 3 hours)
            )`;

        const [liveResult] = await database.execute(liveGamesQuery);
        const liveGamesCount = liveResult.live_count || 0;

        res.json({
            success: true,
            scheduler: status,
            nextGame: nextGame ? {
                teams: `${nextGame.away_team} @ ${nextGame.home_team}`,
                kickoff: nextGame.kickoff_timestamp,
                status: nextGame.status
            } : null,
            liveGamesCount,
            activeGames: liveResult.active_games || 'None',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/live-scores/rate-limit
 * Get ESPN API rate limiting status (authenticated users only)
 */
router.get('/rate-limit', async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        const rateLimitStatus = await ESPNApiService.getRateLimitStatus();
        const APICallTracker = require('../../services/APICallTracker');
        const recentCalls = await APICallTracker.getRecentCalls();

        res.json({
            success: true,
            rateLimit: rateLimitStatus,
            recentCalls: recentCalls,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});


module.exports = router;