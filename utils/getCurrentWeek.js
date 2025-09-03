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
            WHERE season_year = YEAR(CURDATE())
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
        console.error('Error getting current week:', error);
        return 1; // Default to week 1 on error
    }
}

// Get the deadline for picks (first game of the week)
async function getWeekDeadline(database, week) {
    try {
        const [games] = await database.execute(`
            SELECT MIN(kickoff_timestamp) as first_game
            FROM games
            WHERE season_year = YEAR(CURDATE()) AND week = ?
        `, [week]);
        
        if (games && games[0] && games[0].first_game) {
            return new Date(games[0].first_game);
        }
        
        return null;
    } catch (error) {
        console.error('Error getting week deadline:', error);
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

module.exports = {
    getCurrentNFLWeek,
    getWeekDeadline,
    arePicksLocked,
    getHoursUntilDeadline
};