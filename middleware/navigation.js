const database = require('../config/database');

/**
 * Check if the current page is league-specific and should show the league switcher
 */
function isLeagueSpecificPage(url) {
    // Remove query parameters and hash from URL for clean comparison
    const cleanUrl = url.split('?')[0].split('#')[0];
    
    const leagueSpecificPaths = [
        '/dashboard',
        '/picks',
        '/results', 
        '/standings',
        '/chat',
        '/leagues'
    ];
    
    return leagueSpecificPaths.some(specificPath => cleanUrl.startsWith(specificPath));
}

/**
 * Middleware to add navigation data to res.locals
 * This includes user leagues for the league switcher
 */
async function addNavigationData(req, res, next) {
    try {
        // Only add league data if user is authenticated and on league-specific pages
        if (req.user && req.user.user_id && isLeagueSpecificPage(req.originalUrl)) {
            // Get user's leagues for navigation switcher with entry information
            const userLeagues = await database.executeMany(`
                SELECT 
                    l.league_id,
                    l.league_name,
                    (l.commissioner_id = ?) as is_commissioner,
                    le.entry_id
                FROM leagues l
                JOIN league_users lu ON l.league_id = lu.league_id
                LEFT JOIN league_entries le ON lu.league_user_id = le.league_user_id AND le.status = 'active'
                WHERE lu.user_id = ? AND lu.status = 'active'
                ORDER BY l.league_name ASC
            `, [req.user.user_id, req.user.user_id]);


            // Add context-aware URLs for league switching
            const cleanUrl = req.originalUrl.split('?')[0].split('#')[0];
            userLeagues.forEach(league => {
                if (cleanUrl.startsWith('/picks')) {
                    league.switchUrl = `/picks?league_id=${league.league_id}`;
                } else if (cleanUrl.startsWith('/results')) {
                    league.switchUrl = `/results?league_id=${league.league_id}`;
                } else if (cleanUrl.startsWith('/standings')) {
                    league.switchUrl = `/standings?league_id=${league.league_id}`;
                } else if (cleanUrl.startsWith('/chat')) {
                    league.switchUrl = `/leagues/${league.league_id}/chat`;
                } else {
                    // Default to league details page for dashboard and other pages
                    league.switchUrl = `/leagues/${league.league_id}`;
                }
            });

            res.locals.userLeagues = userLeagues;

            // Set current league if we're on a league-specific page
            let currentLeague = null;
            let detectedLeagueId = null;
            
            // Parse the URL path to extract league_id since req.params isn't available in middleware
            const urlPath = req.originalUrl.split('?')[0]; // Remove query string
            
            // Check URL patterns for league_id
            let pathMatch;
            
            // Pattern 1: /picks/7/8 or /picks/7/new
            if ((pathMatch = urlPath.match(/^\/picks\/(\d+)\//))) {
                detectedLeagueId = parseInt(pathMatch[1]);
            }
            // Pattern 2: /standings/7
            else if ((pathMatch = urlPath.match(/^\/standings\/(\d+)/))) {
                detectedLeagueId = parseInt(pathMatch[1]);
            }
            // Pattern 3: /results/league/7
            else if ((pathMatch = urlPath.match(/^\/results\/league\/(\d+)/))) {
                detectedLeagueId = parseInt(pathMatch[1]);
            }
            // Pattern 4: /leagues/7
            else if ((pathMatch = urlPath.match(/^\/leagues\/(\d+)/))) {
                detectedLeagueId = parseInt(pathMatch[1]);
            }
            // Pattern 5: Query parameter ?league_id=7
            else if (req.query && req.query.league_id) {
                detectedLeagueId = parseInt(req.query.league_id);
            } else {
            }
            
            if (detectedLeagueId) {
                currentLeague = userLeagues.find(league => league.league_id === detectedLeagueId);
            }
            
            if (currentLeague) {
                res.locals.currentLeague = currentLeague;
            }

            // Generate context-aware navigation URLs
            // If no current league from URL, check for preserved league context
            if (!currentLeague && userLeagues.length > 0) {
                // Check multiple sources for league preference
                const clientLeagueId = req.query.client_league_id ? parseInt(req.query.client_league_id) : null;
                const sessionLeagueId = req.session?.lastSelectedLeague;
                
                // Priority: client_league_id > session > first league
                let preferredLeagueId = clientLeagueId || sessionLeagueId;
                
                if (preferredLeagueId) {
                    currentLeague = userLeagues.find(league => league.league_id === preferredLeagueId);
                }
                
                // If still no current league, use first league
                if (!currentLeague) {
                    currentLeague = userLeagues[0];
                }
                res.locals.currentLeague = currentLeague;
            }
            
            if (currentLeague) {
                // Use direct routes with league context for better URL handling
                const entryParam = currentLeague.entry_id ? `/${currentLeague.entry_id}` : '';
                
                res.locals.contextualNavUrls = {
                    picks: currentLeague.entry_id ? `/picks/${currentLeague.league_id}/${currentLeague.entry_id}` : `/picks?league_id=${currentLeague.league_id}`,
                    results: `/results?league_id=${currentLeague.league_id}`,
                    standings: `/standings?league_id=${currentLeague.league_id}`,
                    chat: `/leagues/${currentLeague.league_id}/chat`
                };
                
                
                // Remember this league in session for consistency
                if (req.session) {
                    req.session.lastSelectedLeague = currentLeague.league_id;
                }
            } else if (userLeagues.length > 0) {
                // Fallback to first league
                const defaultLeague = userLeagues[0];
                const entryParam = defaultLeague.entry_id ? `/${defaultLeague.entry_id}` : '';
                
                res.locals.contextualNavUrls = {
                    picks: defaultLeague.entry_id ? `/picks/${defaultLeague.league_id}/${defaultLeague.entry_id}` : `/picks?league_id=${defaultLeague.league_id}`,
                    results: `/results?league_id=${defaultLeague.league_id}`,
                    standings: `/standings?league_id=${defaultLeague.league_id}`,
                    chat: `/leagues/${defaultLeague.league_id}/chat`
                };
                
                if (req.session) {
                    req.session.lastSelectedLeague = defaultLeague.league_id;
                }
            } else {
                // No leagues - use default URLs
                res.locals.contextualNavUrls = {
                    picks: '/picks',
                    results: '/results',
                    standings: '/standings',
                    chat: '/chat'
                };
            }
        }
        
        // Add current URL for navigation highlighting
        res.locals.currentUrl = req.originalUrl;
        
        next();
    } catch (error) {
        // Don't block the request, just continue without navigation data
        next();
    }
}

module.exports = addNavigationData;