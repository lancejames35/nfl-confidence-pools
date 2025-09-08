# Live NFL Scores Implementation Guide

## Overview
This system fetches live NFL scores from ESPN API every 5 minutes, updates your database, recalculates user scores in real-time, and pushes updates to the frontend via WebSockets.

## Database Setup

Run these SQL queries to set up the database:

```sql
-- 1. Add ESPN team ID column to teams table
ALTER TABLE teams ADD COLUMN espn_team_id VARCHAR(10) AFTER team_id;

-- 2. Add ESPN game ID column if not using nfl_game_id
ALTER TABLE games ADD COLUMN espn_game_id VARCHAR(20) AFTER nfl_game_id;

-- 3. Add indexes for faster ESPN lookups
CREATE INDEX idx_games_espn_id ON games(espn_game_id);
CREATE INDEX idx_teams_espn_id ON teams(espn_team_id);

-- 4. Update teams with ESPN IDs
UPDATE teams SET espn_team_id = CASE abbreviation
    WHEN 'ARI' THEN '22'
    WHEN 'ATL' THEN '1'
    WHEN 'BAL' THEN '33'
    WHEN 'BUF' THEN '2'
    WHEN 'CAR' THEN '29'
    WHEN 'CHI' THEN '3'
    WHEN 'CIN' THEN '4'
    WHEN 'CLE' THEN '5'
    WHEN 'DAL' THEN '6'
    WHEN 'DEN' THEN '7'
    WHEN 'DET' THEN '8'
    WHEN 'GB' THEN '9'
    WHEN 'HOU' THEN '34'
    WHEN 'IND' THEN '11'
    WHEN 'JAX' THEN '30'
    WHEN 'KC' THEN '12'
    WHEN 'LAC' THEN '24'
    WHEN 'LAR' THEN '14'
    WHEN 'LV' THEN '13'
    WHEN 'MIA' THEN '15'
    WHEN 'MIN' THEN '16'
    WHEN 'NE' THEN '17'
    WHEN 'NO' THEN '18'
    WHEN 'NYG' THEN '19'
    WHEN 'NYJ' THEN '20'
    WHEN 'PHI' THEN '21'
    WHEN 'PIT' THEN '23'
    WHEN 'SF' THEN '25'
    WHEN 'SEA' THEN '26'
    WHEN 'TB' THEN '27'
    WHEN 'TEN' THEN '10'
    WHEN 'WAS' THEN '28'
END;
```

## System Cron Setup

Add this to your server's crontab to run every 5 minutes:

```bash
# Open crontab
crontab -e

# Add this line (runs every 5 minutes during game hours)
*/5 * * * * /usr/bin/node /path/to/pools-app/scripts/update-live-scores.js >> /var/log/nfl-scores.log 2>&1

# Or for more selective timing (only during game days/hours):
*/5 * * * 0,1 /usr/bin/node /path/to/pools-app/scripts/update-live-scores.js >> /var/log/nfl-scores.log 2>&1
```

Replace `/path/to/pools-app` with your actual application path.

## Frontend Integration

### 1. Add CSS to your layout
Add to your main layout file (e.g., `views/layouts/main.ejs`):

```html
<link rel="stylesheet" href="/css/live-scores.css">
```

### 2. Add JavaScript to results pages
Add to results pages where you want live updates:

```html
<script src="/js/live-scores.js"></script>

<!-- Add data attributes to your results container -->
<div class="results-container" 
     data-page="results"
     data-current-week="<%= currentWeek %>"
     data-current-season="<%= seasonYear %>"
     data-league-id="<%= leagueId %>">
```

### 3. Add data attributes to game elements
Update your game display elements:

```html
<div data-game-id="<%= game.game_id %>" data-game-teams="<%= game.away_team %> @ <%= game.home_team %>">
    <span class="away-score"><%= game.away_score || 0 %></span>
    <span class="home-score"><%= game.home_score || 0 %></span>
    <span class="game-status"><%= game.status %></span>
    <span class="quarter">Q<%= game.current_quarter || '' %></span>
    <span class="time-remaining"><%= game.time_remaining || '' %></span>
</div>
```

### 4. Add data attributes to pick elements
Update your pick display elements:

```html
<div data-pick-id="<%= pick.pick_id %>" 
     data-game-id="<%= pick.game_id %>"
     data-selected-team="<%= pick.selected_team %>"
     data-is-correct="<%= pick.is_correct %>"
     class="pick-item <%= getPickStatusClass(pick) %>">
    <span class="confidence-points"><%= pick.confidence_points %></span>
</div>
```

### 5. Add data attributes to user totals
Update your user standings elements:

```html
<div data-entry-id="<%= entry.entry_id %>">
    <span class="weekly-score"><%= entry.weekly_score || 0 %></span>
    <span class="season-total"><%= entry.season_total || 0 %></span>
    <span class="max-possible"><%= entry.max_possible || 0 %></span>
</div>
```

## API Endpoints

The system provides these API endpoints:

- `GET /api/live-scores/status?week=1&season=2025` - Get current game status
- `POST /api/live-scores/update` - Manual update (admin only)
- `GET /api/live-scores/user-totals/:leagueId?week=1` - Get user totals
- `GET /api/live-scores/picks/:gameId?league_id=1` - Get picks for a game

## How It Works

### 1. **Data Flow**
```
ESPN API → ESPNApiService → Database Updates → WebSocket Broadcast → Frontend Updates
    ↓
System Cron (every 5 minutes) → Update live scores → Recalculate picks → Update user totals
```

### 2. **Pick Status Logic**
- **Green (Winning)**: `is_correct = 1` - User picked the currently winning team
- **Red (Losing)**: `is_correct = 0` - User picked the currently losing team  
- **Yellow (Tied)**: `is_correct = NULL` - Game is tied
- **Gray (Scheduled)**: Game hasn't started yet

### 3. **Score Calculations**
- **Weekly Score**: Sum of `points_earned` for current week
- **Season Total**: Sum of `points_earned` for entire season
- **Max Possible**: Current earned + confidence points from unfinished games

### 4. **Real-Time Updates**
- WebSocket pushes updates instantly when scores change
- AJAX polling as fallback (every 1 minute)
- Visual indicators for live games
- Smooth animations for score changes

## Testing

### 1. **Test Manual Update** (Admin only)
```bash
curl -X POST http://localhost:3000/api/live-scores/update \
  -H "Content-Type: application/json" \
  -d '{"week": 1, "season": 2025}'
```

### 2. **Test Cron Script**
```bash
node scripts/update-live-scores.js
```

### 3. **Check API Status**
```bash
curl http://localhost:3000/api/live-scores/status?week=1&season=2025
```

## Troubleshooting

### 1. **Cron Not Running**
- Check cron logs: `tail -f /var/log/nfl-scores.log`
- Verify path: `which node`
- Test script manually: `node scripts/update-live-scores.js`

### 2. **ESPN API Issues**
- Check if ESPN API is accessible: `curl "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"`
- Verify team ID mappings in database
- Check network/firewall restrictions

### 3. **WebSocket Issues**
- Verify Socket.IO is initialized in your app
- Check browser console for connection errors
- Ensure your app server supports WebSockets

### 4. **Database Issues**
- Verify all ESPN team IDs are populated
- Check that games exist for the current week
- Ensure results table has `current_quarter` and `time_remaining` columns

## Performance Notes

- ESPN API is cached for 30 seconds to reduce requests
- Database updates use transactions for consistency
- WebSocket updates are throttled to prevent spam
- Frontend polling reduces frequency when page is hidden

## Security

- Admin-only manual update endpoint
- Rate limiting on API endpoints  
- Input validation on all parameters
- ESPN API uses no authentication (public endpoint)

## Monitoring

Monitor these logs:
- Application logs for ESPN API errors
- Cron logs at `/var/log/nfl-scores.log`
- Database slow query logs
- WebSocket connection logs

The system is now ready for live NFL score updates!