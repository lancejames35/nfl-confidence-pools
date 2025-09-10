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

module.exports = {
    getCurrentNFLWeek,
    getWeekDeadline,
    arePicksLocked,
    getHoursUntilDeadline,
    getDefaultWeekForUI
};