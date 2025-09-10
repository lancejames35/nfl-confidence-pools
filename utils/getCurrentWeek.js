// Get the current NFL week based on actual game dates in database
async function getCurrentNFLWeek(database) {
    try {
        // Get all weeks with their max game dates
        const [weeks] = await database.execute(`
            SELECT 
                week,
                MAX(kickoff_timestamp) as last_game,
                MIN(kickoff_timestamp) as first_game
            FROM games
            WHERE season_year = 2025
            GROUP BY week
            ORDER BY week ASC
        `);
        
        if (!weeks || weeks.length === 0) {
            return 1; // Default to week 1 if no games
        }
        
        const now = new Date();
        
        // Find the current week based on the date
        for (let i = 0; i < weeks.length; i++) {
            const weekData = weeks[i];
            const lastGameDate = new Date(weekData.last_game);
            
            // Add 2 days (48 hours) to the last game to get the transition point (Wednesday 12am)
            const transitionDate = new Date(lastGameDate.getTime() + (2 * 24 * 60 * 60 * 1000));
            transitionDate.setHours(0, 0, 0, 0); // Set to midnight
            
            // If we haven't reached the transition date yet, this is the current week
            if (now < transitionDate) {
                return weekData.week;
            }
        }
        
        // If we've passed all weeks, return the last week if exists
        if (weeks.length > 0) {
            return weeks[weeks.length - 1].week;
        }
        
        return 1; // Default to week 1
        
    } catch (error) {
        // Error getting current week
        return 1; // Default to week 1 on error
    }
}

// Get the deadline for picks (first game of the week)
async function getWeekDeadline(database, week) {
    try {
        const [games] = await database.execute(`
            SELECT MIN(kickoff_timestamp) as first_game
            FROM games
            WHERE season_year = 2025 AND week = ?
        `, [week]);
        
        if (games && games[0] && games[0].first_game) {
            return new Date(games[0].first_game);
        }
        
        return null;
    } catch (error) {
        // Error getting week deadline
        return null;
    }
}

// Check if picks are locked for a week
async function arePicksLocked(database, week) {
    const deadline = await getWeekDeadline(database, week);
    if (!deadline) return false;
    
    return new Date() >= deadline;
}

// Get hours until deadline
async function getHoursUntilDeadline(database, week) {
    const deadline = await getWeekDeadline(database, week);
    if (!deadline) return 0;
    
    const now = new Date();
    if (now >= deadline) {
        return 0;
    }
    
    const msUntilDeadline = deadline - now;
    const hoursUntilDeadline = Math.ceil(msUntilDeadline / (60 * 60 * 1000));
    
    return hoursUntilDeadline;
}

// Track last processed week for automatic weekly winner calculation
let lastProcessedWeek = null;

// Get the default week for UI (picks/results pages)
// Logic: Move to next week the day after the max kickoff date for current week
async function getDefaultWeekForUI(database) {
    try {
        // Get all weeks with their max game dates (stored as UTC in database)
        const weeks = await database.execute(`
            SELECT 
                week,
                MAX(kickoff_timestamp) as last_game_utc
            FROM games
            WHERE season_year = 2025
            GROUP BY week
            ORDER BY week ASC
        `);
        
        if (!weeks || weeks.length === 0) {
            return 1; // Default to week 1 if no games
        }
        
        // Get current time in UTC, then we'll use the comparison logic that matches existing codebase
        const nowUTC = new Date();
        
        // Find the appropriate week based on max kickoff date logic
        for (let i = 0; i < weeks.length; i++) {
            const weekData = weeks[i];
            const lastGameUTC = new Date(weekData.last_game_utc);
            
            // Get the date portion only (midnight UTC) of the day after the last game
            // This matches your logic: "current date is greater than max kickoff date"
            const dayAfterLastGame = new Date(lastGameUTC);
            dayAfterLastGame.setDate(lastGameUTC.getDate() + 1);
            dayAfterLastGame.setHours(0, 0, 0, 0); // Set to midnight UTC
            
            // If current date hasn't passed the day after the last game, this is the current week
            if (nowUTC < dayAfterLastGame) {
                return weekData.week;
            }
        }
        
        // If we've gone past all scheduled weeks, find the week that has games
        // This handles the case where we're in early season
        for (let week = 1; week <= 18; week++) {
            const weekGames = await database.execute(`
                SELECT COUNT(*) as game_count 
                FROM games 
                WHERE week = ? AND season_year = 2025
            `, [week]);
            
            if (weekGames && weekGames[0] && weekGames[0].game_count > 0) {
                return week;
            }
        }
        return 1; // Default to week 1
        
    } catch (error) {
        console.error('Error getting default week for UI:', error);
        return 1; // Default to week 1 on error
    }
}

// Enhanced version that triggers weekly winner calculation on week transitions
async function getDefaultWeekForUIWithWinnerCalculation(database) {
    try {
        const currentWeek = await getDefaultWeekForUI(database);
        
        // Handle initialization - check for missed weeks that need calculation
        if (lastProcessedWeek === null) {
            console.log(`Weekly winner service initializing - current week is ${currentWeek}`);
            
            // Check for any weeks that have closed but don't have winners calculated
            setImmediate(async () => {
                try {
                    await checkAndCalculateMissedWeeks(currentWeek);
                } catch (error) {
                    console.error('Failed to check for missed weeks:', error);
                }
            });
            
            lastProcessedWeek = currentWeek;
            return currentWeek;
        }
        
        // Check for week transition and trigger weekly winner calculation
        if (currentWeek > lastProcessedWeek) {
            const closedWeek = lastProcessedWeek;
            console.log(`Week transition detected: Week ${closedWeek} closed, now on week ${currentWeek}`);
            
            // Trigger weekly winner calculation asynchronously for the closed week
            setImmediate(async () => {
                try {
                    await triggerWeeklyWinnerCalculation(closedWeek);
                } catch (error) {
                    console.error(`Failed to calculate weekly winners for week ${closedWeek}:`, error);
                }
            });
        }
        
        // Update tracked week
        lastProcessedWeek = currentWeek;
        
        return currentWeek;
        
    } catch (error) {
        console.error('Error in getDefaultWeekForUIWithWinnerCalculation:', error);
        return await getDefaultWeekForUI(database);
    }
}

// Trigger weekly winner calculation for all active leagues
async function triggerWeeklyWinnerCalculation(week) {
    try {
        // Lazy load to avoid circular dependency
        const WeeklyWinnersService = require('../services/WeeklyWinnersService');
        const database = require('../config/database');
        
        const seasonYear = new Date().getFullYear();
        console.log(`Starting weekly winner calculation for week ${week}, season ${seasonYear}`);
        
        // Get all active leagues
        const [activeLeagues] = await database.execute(`
            SELECT league_id, league_name 
            FROM leagues 
            WHERE status = 'active'
            ORDER BY league_id
        `);
        
        if (activeLeagues.length === 0) {
            console.log('No active leagues found for weekly winner calculation');
            return;
        }
        
        console.log(`Found ${activeLeagues.length} active leagues to process`);
        
        let successCount = 0;
        let failureCount = 0;
        
        // Process each league
        for (const league of activeLeagues) {
            try {
                console.log(`Calculating weekly winners for League ${league.league_id} (${league.league_name})`);
                
                const result = await WeeklyWinnersService.calculateWeeklyWinners(
                    league.league_id, 
                    week, 
                    seasonYear
                );
                
                if (result.success) {
                    console.log(`✅ League ${league.league_id}: ${result.winners.length} winner(s) calculated`);
                    if (result.winners.length > 0) {
                        const winnerNames = result.winners.map(w => w.username).join(', ');
                        console.log(`   Winners: ${winnerNames}`);
                    }
                    successCount++;
                } else {
                    console.error(`❌ League ${league.league_id}: ${result.message}`);
                    failureCount++;
                }
                
            } catch (leagueError) {
                console.error(`❌ League ${league.league_id} calculation failed:`, leagueError);
                failureCount++;
            }
        }
        
        console.log(`Weekly winner calculation completed for week ${week}: ${successCount} successful, ${failureCount} failed`);
        
    } catch (error) {
        console.error('Failed to calculate weekly winners for all leagues:', error);
    }
}

// Check for weeks that have closed but don't have winners calculated yet
async function checkAndCalculateMissedWeeks(currentWeek) {
    try {
        // Lazy load to avoid circular dependency
        const database = require('../config/database');
        
        console.log(`Checking for missed weekly winner calculations up to current week ${currentWeek}`);
        
        // Get all active leagues
        const [activeLeagues] = await database.execute(`
            SELECT league_id, league_name 
            FROM leagues 
            WHERE status = 'active'
            ORDER BY league_id
        `);
        
        if (activeLeagues.length === 0) {
            console.log('No active leagues found for missed week check');
            return;
        }
        
        const seasonYear = new Date().getFullYear();
        
        // Check each week from 1 to currentWeek-1 (closed weeks)
        for (let week = 1; week < currentWeek; week++) {
            console.log(`Checking if week ${week} needs winner calculation...`);
            
            // Check if this week is actually closed (has games and max kickoff date has passed)
            const [weekGames] = await database.execute(`
                SELECT 
                    COUNT(*) as game_count,
                    MAX(kickoff_timestamp) as last_game_utc
                FROM games
                WHERE week = ? AND season_year = ?
            `, [week, seasonYear]);
            
            if (!weekGames || weekGames.game_count === 0) {
                console.log(`Week ${week}: No games found, skipping`);
                continue;
            }
            
            // Check if week is actually closed using same logic as getDefaultWeekForUI
            const lastGameUTC = new Date(weekGames.last_game_utc);
            const dayAfterLastGame = new Date(lastGameUTC);
            dayAfterLastGame.setDate(lastGameUTC.getDate() + 1);
            dayAfterLastGame.setHours(0, 0, 0, 0);
            
            const nowUTC = new Date();
            const weekIsClosed = nowUTC >= dayAfterLastGame;
            
            if (!weekIsClosed) {
                console.log(`Week ${week}: Not yet closed, skipping`);
                continue;
            }
            
            // Check if any league already has winners calculated for this week
            let needsCalculation = false;
            for (const league of activeLeagues) {
                const [existingWinners] = await database.execute(`
                    SELECT COUNT(*) as winner_count
                    FROM weekly_winners
                    WHERE league_id = ? AND week = ? AND season_year = ?
                `, [league.league_id, week, seasonYear]);
                
                if (existingWinners.winner_count === 0) {
                    needsCalculation = true;
                    break; // At least one league needs calculation
                }
            }
            
            if (needsCalculation) {
                console.log(`Week ${week}: Needs winner calculation, triggering now...`);
                await triggerWeeklyWinnerCalculation(week);
            } else {
                console.log(`Week ${week}: Already has winners calculated`);
            }
        }
        
        console.log('Missed week check completed');
        
    } catch (error) {
        console.error('Error checking for missed weeks:', error);
    }
}

module.exports = {
    getCurrentNFLWeek,
    getWeekDeadline,
    arePicksLocked,
    getHoursUntilDeadline,
    getDefaultWeekForUI,
    getDefaultWeekForUIWithWinnerCalculation,
    triggerWeeklyWinnerCalculation,
    checkAndCalculateMissedWeeks
};