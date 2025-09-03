// NFL Week Detection Utility
// Determines current NFL week based on date

function getCurrentNFLWeek() {
    const now = new Date();
    const year = now.getFullYear();
    
    // NFL season typically starts first week of September
    // For 2025 season: September 4, 2025 (Thursday)
    const seasonStart = new Date(year, 8, 4); // Month is 0-indexed, so 8 = September
    
    // If before season start, return week 1
    if (now < seasonStart) {
        return 1;
    }
    
    // Calculate weeks since season start
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const weeksSinceStart = Math.floor((now - seasonStart) / msPerWeek);
    
    // NFL regular season is 18 weeks
    const currentWeek = Math.min(weeksSinceStart + 1, 18);
    
    return currentWeek;
}

// Get deadline for picks (typically Sunday 1pm ET)
function getWeekDeadline(week, year = new Date().getFullYear()) {
    const seasonStart = new Date(year, 8, 4); // September 4
    const targetWeek = new Date(seasonStart.getTime() + ((week - 1) * 7 * 24 * 60 * 60 * 1000));
    
    // Find next Sunday
    const daysUntilSunday = (7 - targetWeek.getDay()) % 7;
    const sunday = new Date(targetWeek);
    sunday.setDate(targetWeek.getDate() + daysUntilSunday);
    
    // Set to 1pm ET (accounting for timezone)
    sunday.setHours(13, 0, 0, 0);
    
    return sunday;
}

// Check if picks are locked for a week
function arePicksLocked(week, year = new Date().getFullYear()) {
    const deadline = getWeekDeadline(week, year);
    return new Date() >= deadline;
}

// Get hours until deadline
function getHoursUntilDeadline(week, year = new Date().getFullYear()) {
    const deadline = getWeekDeadline(week, year);
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