# Production Database Changes Required

This document outlines the database changes that need to be made in production to support the live NFL scores feature.

## Overview
The live NFL scores system fetches data from ESPN's API and updates game results in real-time. The system requires the `espn_team_id` field to be populated in the `teams` table to match games correctly.

## Required Changes

### 1. Teams Table - ESPN Team ID Column
**Table:** `teams`
**Change:** The `espn_team_id` column must be populated for all NFL teams

**Status:** ✅ User has confirmed this is already done
> "I've already added the espn id's to the teams table."

**Verification Query:**
```sql
SELECT team_id, team_name, abbreviation, espn_team_id 
FROM teams 
WHERE espn_team_id IS NULL;
```
This should return 0 rows if all teams have ESPN IDs.

### 2. Results Table Structure
**Table:** `results`
**Required Columns:** The following columns are used by the live scores system:

- `result_id` (Primary Key)
- `game_id` (Foreign Key to games table)
- `home_score` (INT)
- `away_score` (INT)
- `winning_team` (VARCHAR) - Team abbreviation
- `margin_of_victory` (INT)
- `home_q1`, `home_q2`, `home_q3`, `home_q4`, `home_ot` (INT) - Quarter scores
- `away_q1`, `away_q2`, `away_q3`, `away_q4`, `away_ot` (INT) - Quarter scores
- `overtime` (BOOLEAN/TINYINT)
- `current_quarter` (INT) - Current quarter (1-4, 5+ for overtime)
- `time_remaining` (VARCHAR) - Clock time remaining (e.g., "14:23", "0:00")
- `final_status` (VARCHAR) - "final" when game is complete
- `completed_at` (DATETIME) - When game was completed

### 3. Games Table Structure
**Table:** `games`
**Required Columns:**

- `game_id` (Primary Key)
- `home_team_id` (Foreign Key to teams table)
- `away_team_id` (Foreign Key to teams table)
- `status` (VARCHAR) - Game status: 'scheduled', 'in_progress', 'completed', 'postponed', 'cancelled'
- `kickoff_timestamp` (DATETIME) - Game start time
- `week` (INT) - NFL week number
- `season_year` (INT) - Season year

### 4. Picks Table Structure
**Table:** `picks`
**Required Columns:**

- `pick_id` (Primary Key)
- `entry_id` (Foreign Key)
- `game_id` (Foreign Key to games table)
- `selected_team` (VARCHAR) - Team abbreviation of selected team
- `confidence_points` (INT) - Points assigned to this pick
- `is_correct` (TINYINT) - NULL for tied games, 1 for correct, 0 for incorrect
- `points_earned` (INT) - Actual points earned (0 if incorrect/tied, confidence_points if correct)
- `week` (INT) - NFL week number

**Note:** The system does NOT use `season_year` in the picks table queries.

### 5. Required Foreign Key Relationships

#### Teams to Games
```sql
-- Verify foreign key constraints exist
SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
WHERE TABLE_NAME = 'games' 
AND TABLE_SCHEMA = DATABASE()
AND REFERENCED_TABLE_NAME IS NOT NULL;
```

#### Games to Results
```sql
-- Verify foreign key constraint exists
SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
WHERE TABLE_NAME = 'results' 
AND TABLE_SCHEMA = DATABASE()
AND REFERENCED_TABLE_NAME = 'games';
```

#### Games to Picks
```sql
-- Verify foreign key constraint exists
SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
WHERE TABLE_NAME = 'picks' 
AND TABLE_SCHEMA = DATABASE()
AND REFERENCED_TABLE_NAME = 'games';
```

## Verification Queries

### Check ESPN Team ID Population
```sql
SELECT 
    COUNT(*) as total_teams,
    COUNT(espn_team_id) as teams_with_espn_id,
    COUNT(*) - COUNT(espn_team_id) as missing_espn_id
FROM teams;
```

### Verify Game Matching Will Work
```sql
SELECT 
    g.game_id,
    g.week,
    g.season_year,
    ht.team_name as home_team,
    ht.abbreviation as home_abbr,
    ht.espn_team_id as home_espn_id,
    at.team_name as away_team,
    at.abbreviation as away_abbr,
    at.espn_team_id as away_espn_id
FROM games g
JOIN teams ht ON g.home_team_id = ht.team_id
JOIN teams at ON g.away_team_id = at.team_id
WHERE ht.espn_team_id IS NULL OR at.espn_team_id IS NULL
LIMIT 10;
```
This should return 0 rows if all games can be matched.

### Check Current Season Games
```sql
SELECT 
    COUNT(*) as total_games,
    COUNT(CASE WHEN status = 'scheduled' THEN 1 END) as scheduled,
    COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress,
    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed
FROM games 
WHERE season_year = YEAR(NOW());
```

## API Rate Limiting
The system includes built-in rate limiting:
- **Limit:** 100 calls per hour (conservative limit for ESPN API)
- **Caching:** 2-minute cache to reduce API calls
- **Smart Scheduling:** Only runs during game times, stops when no games are active

## System Behavior
1. **Automatic Scheduling:** Starts 30 minutes before first game, stops when no games are active
2. **Update Frequency:** Every 5 minutes during games
3. **Game Matching:** Uses ESPN team IDs to match API data to database games
4. **Pick Updates:** Automatically updates pick correctness and points earned
5. **Status Updates:** Updates game status (scheduled → in_progress → completed)

## Monitoring
The commissioner dashboard provides real-time monitoring of:
- Scheduler status (active/inactive)
- API usage and rate limiting
- Next game information
- Live games count
- Manual trigger capability

## No Additional Database Changes Required
All necessary database structure should already exist. The only requirement was adding ESPN team IDs to the teams table, which has been confirmed as complete.