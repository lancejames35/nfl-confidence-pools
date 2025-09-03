const GameResultsProcessor = require('../services/GameResultsProcessor');
const database = require('../config/database');
const { validationResult } = require('express-validator');

class GameController {
    /**
     * Display games management dashboard (admin)
     */
    static async index(req, res) {
        try {
            const currentWeek = req.query.week || getCurrentNFLWeek();
            const seasonYear = req.query.season || new Date().getFullYear();
            
            // Get games for the week
            const gamesQuery = `
                SELECT 
                    g.*,
                    r.home_score,
                    r.away_score,
                    r.winning_team,
                    home_team.full_name as home_team_name,
                    away_team.full_name as away_team_name,
                    COUNT(p.pick_id) as total_picks
                FROM games g
                JOIN teams home_team ON g.home_team_id = home_team.team_id
                JOIN teams away_team ON g.away_team_id = away_team.team_id
                LEFT JOIN results r ON g.game_id = r.game_id
                LEFT JOIN picks p ON g.game_id = p.game_id
                WHERE g.week = ? AND g.season_year = ?
                GROUP BY g.game_id
                ORDER BY g.kickoff_timestamp
            `;
            
            const games = await database.execute(gamesQuery, [currentWeek, seasonYear]);
            
            // Get week summary
            const weekSummary = await GameResultsProcessor.getWeekSummary(currentWeek, seasonYear);
            
            res.render('admin/games/index', {
                title: `Games Management - Week ${currentWeek}`,
                games,
                currentWeek,
                seasonYear,
                weekSummary,
                user: req.user
            });
        } catch (error) {
            req.flash('error', 'Error loading games dashboard');
            res.redirect('/admin');
        }
    }
    
    /**
     * Show form to update game result
     */
    static async showUpdateForm(req, res) {
        try {
            const gameId = parseInt(req.params.id);
            
            const gameQuery = `
                SELECT 
                    g.*,
                    r.home_score,
                    r.away_score,
                    r.winning_team,
                    r.final_status as result_status,
                    home_team.full_name as home_team_name,
                    away_team.full_name as away_team_name
                FROM games g
                JOIN teams home_team ON g.home_team_id = home_team.team_id
                JOIN teams away_team ON g.away_team_id = away_team.team_id
                LEFT JOIN results r ON g.game_id = r.game_id
                WHERE g.game_id = ?
            `;
            
            const [game] = await database.execute(gameQuery, [gameId]);
            
            if (!game) {
                req.flash('error', 'Game not found');
                return res.redirect('/admin/games');
            }
            
            // Get picks for this game
            const picks = await GameResultsProcessor.getGamePicksWithResults(gameId);
            
            res.render('admin/games/update', {
                title: `Update Game Result - ${game.away_team} @ ${game.home_team}`,
                game,
                picks,
                user: req.user
            });
        } catch (error) {
            req.flash('error', 'Error loading game update form');
            res.redirect('/admin/games');
        }
    }
    
    /**
     * Update game result
     */
    static async updateResult(req, res) {
        try {
            const gameId = parseInt(req.params.id);
            const { home_score, away_score, status } = req.body;
            
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                req.flash('error', 'Invalid input data');
                return res.redirect(`/admin/games/${gameId}/update`);
            }
            
            // Process the game result
            const result = await GameResultsProcessor.processGameResult(
                gameId,
                parseInt(home_score),
                parseInt(away_score),
                status || 'completed'
            );
            
            req.flash('success', `Game result updated successfully! ${result.updatedPicks} picks updated.`);
            
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.json(result);
            }
            
            res.redirect('/admin/games');
        } catch (error) {
            req.flash('error', error.message || 'Error updating game result');
            
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(500).json({ success: false, error: error.message });
            }
            
            res.redirect(`/admin/games/${req.params.id}/update`);
        }
    }
    
    /**
     * Bulk update multiple game results
     */
    static async bulkUpdate(req, res) {
        try {
            const { gameResults } = req.body;
            
            if (!Array.isArray(gameResults) || gameResults.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'No game results provided'
                });
            }
            
            const result = await GameResultsProcessor.processBulkResults(gameResults);
            
            res.json({
                success: true,
                processed: result.results.length,
                errors: result.errors.length,
                results: result.results,
                errors: result.errors
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
    
    /**
     * Set game status to in progress
     */
    static async setInProgress(req, res) {
        try {
            const gameId = parseInt(req.params.id);
            
            const result = await GameResultsProcessor.setGameInProgress(gameId);
            
            req.flash('success', result.message);
            
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.json(result);
            }
            
            res.redirect('/admin/games');
        } catch (error) {
            req.flash('error', error.message || 'Error updating game status');
            
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(500).json({ success: false, error: error.message });
            }
            
            res.redirect('/admin/games');
        }
    }
    
    /**
     * Get game details with picks (API endpoint)
     */
    static async getGameDetails(req, res) {
        try {
            const gameId = parseInt(req.params.id);
            
            const gameQuery = `
                SELECT 
                    g.*,
                    r.home_score,
                    r.away_score,
                    r.winning_team,
                    r.final_status as result_status,
                    home_team.full_name as home_team_name,
                    away_team.full_name as away_team_name,
                    COUNT(p.pick_id) as total_picks,
                    SUM(CASE WHEN p.selected_team = home_team.abbreviation THEN 1 ELSE 0 END) as home_picks,
                    SUM(CASE WHEN p.selected_team = away_team.abbreviation THEN 1 ELSE 0 END) as away_picks
                FROM games g
                JOIN teams home_team ON g.home_team_id = home_team.team_id
                JOIN teams away_team ON g.away_team_id = away_team.team_id
                LEFT JOIN results r ON g.game_id = r.game_id
                LEFT JOIN picks p ON g.game_id = p.game_id
                WHERE g.game_id = ?
                GROUP BY g.game_id
            `;
            
            const [game] = await database.execute(gameQuery, [gameId]);
            
            if (!game) {
                return res.status(404).json({ error: 'Game not found' });
            }
            
            const picks = await GameResultsProcessor.getGamePicksWithResults(gameId);
            
            res.json({
                success: true,
                game,
                picks
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
    
    /**
     * Auto-process week results
     */
    static async autoProcessWeek(req, res) {
        try {
            const week = parseInt(req.params.week);
            const seasonYear = req.query.season || new Date().getFullYear();
            
            const result = await GameResultsProcessor.autoProcessWeekResults(week, seasonYear);
            
            res.json({
                success: true,
                message: `Found ${result.gamesToProcess} games to process`,
                ...result
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
}

/**
 * Helper function to get current NFL week
 */
function getCurrentNFLWeek() {
    const seasonStart = new Date(new Date().getFullYear(), 8, 5); // Sept 5
    const now = new Date();
    const diffTime = Math.abs(now - seasonStart);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const week = Math.ceil(diffDays / 7);
    return Math.min(Math.max(1, week), 18); // NFL regular season is 18 weeks
}

module.exports = GameController;