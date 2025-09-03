# NFL Confidence Pools Database Schema

This document provides a comprehensive overview of the database schema for the NFL Confidence Pools Platform.

## Database Overview

The application uses a MySQL database with 27 tables to handle multiple pool types, user management, scoring, and real-time features.

## Core Tables

### Users & Authentication

#### `users`
Primary user accounts and authentication data.
- **Primary Key**: `user_id`
- **Unique Keys**: `username`, `email`
- **Key Fields**: `username`, `email`, `password_hash`, `account_status`
- **Features**: Two-factor auth, password reset, timezone support

#### `oauth_providers` 
OAuth authentication providers (Google, Facebook, Apple).
- **Foreign Key**: `user_id` → `users.user_id`

#### `user_sessions`
Express session storage managed by express-mysql-session.

### League Management

#### `leagues`
Main league configuration and settings.
- **Primary Key**: `league_id`
- **Key Fields**: `league_name`, `commissioner_id`, `pool_type`, `season_year`
- **Pool Types**: `confidence`, `survivor`, `squares`, `other`
- **Status Types**: `draft`, `active`, `completed`, `cancelled`
- **Missing Field**: `pick_method` (needs to be added for spread betting)

#### `league_users`
User membership in leagues with roles.
- **Foreign Keys**: `user_id` → `users.user_id`, `league_id` → `leagues.league_id`
- **Roles**: `participant`, `co_commissioner`, `moderator`, `observer`

#### `league_entries`
Individual entries within leagues (users can have multiple entries).
- **Foreign Key**: `league_user_id` → `league_users.league_user_id`
- **Key Fields**: `team_name`, `paid_status`, `status`

#### `league_invitations`
Comprehensive invitation system with multiple methods.
- **Invite Methods**: `email`, `join_code`, `direct_link`, `username`
- **Status Tracking**: Full lifecycle from pending to accepted/declined

### Game Data

#### `games`
NFL game schedule and basic information.
- **Primary Key**: `game_id`
- **Key Fields**: `season_year`, `week`, `home_team_id`, `away_team_id`
- **Game Types**: `regular`, `wildcard`, `divisional`, `conference`, `superbowl`

#### `teams`
NFL team information and branding.
- **Primary Key**: `team_id`
- **Key Fields**: `abbreviation`, `full_name`, `city`, `conference`, `division`

#### `spreads`
Betting lines and spreads for games.
- **Foreign Key**: `game_id` → `games.game_id`
- **Key Fields**: `point_spread`, `home_favorite`, `total_points`, `home_moneyline`, `away_moneyline`
- **Confidence Levels**: `opening`, `current`, `closing`

#### `results`
Game results with quarter-by-quarter scores.
- **Foreign Key**: `game_id` → `games.game_id` (UNIQUE)
- **Features**: Overtime tracking, quarter breakdowns

### Pool-Specific Settings

#### `confidence_pool_settings`
Detailed configuration for confidence pools.
- **Foreign Key**: `league_id` → `leagues.league_id` (UNIQUE)
- **Key Fields**: `pick_type`, `min_confidence_points`, `max_confidence_points`
- **Pick Types**: `straight_up`, `against_spread`
- **Tiebreakers**: `head_to_head`, `mnf_total`, `highest_confidence_correct`, `total_games_correct`

#### `survivor_pool_settings`
Configuration for survivor/elimination pools.
- **Elimination Types**: `single`, `double`, `triple`, `strike_count`
- **Features**: Rebuy options, late entry, team restrictions

#### `squares_pool_settings`
Configuration for squares pools.
- **Grid Sizes**: `10x10`, `5x5`, `25x4`
- **Features**: Quarter payouts, randomization timing, trading

### Picks & Scoring

#### `picks`
Individual user picks for games.
- **Foreign Keys**: `entry_id` → `league_entries.entry_id`, `game_id` → `games.game_id`
- **Key Fields**: `selected_team`, `confidence_points`, `pick_type`
- **Pick Types**: `confidence`, `survivor`
- **Features**: Lock mechanism, correctness tracking

#### `pick_drafts`
Auto-save functionality for draft picks.
- **Foreign Key**: `entry_id` → `league_entries.entry_id`
- **Storage**: JSON data with timestamps

#### `weekly_scores`
Calculated weekly performance for each entry.
- **Foreign Keys**: `entry_id` → `league_entries.entry_id`
- **Metrics**: Points, games correct, win percentage, rank
- **Features**: Elimination tracking, bonus/penalty points

#### `season_scores`
Aggregated season-long statistics and rankings.
- **Foreign Key**: `entry_id` → `league_entries.entry_id` (UNIQUE)
- **Advanced Metrics**: Streaks, trending, head-to-head records
- **Features**: Rank tracking, perfect weeks, recent form

### Tiebreakers

#### `tiebreakers`
Tiebreaker questions and predictions.
- **Types**: `mnf_total_points`, `game_total_points`, `margin_of_victory`, `player_stat`, `custom_question`
- **Features**: Accuracy scoring, override capability

### Communication

#### `chat_messages`
League chat system with advanced features.
- **Message Types**: `chat`, `system`, `announcement`, `pick_reminder`, `score_update`
- **Features**: Threading, editing, reactions, mentions, attachments

#### `message_reactions`
Emoji reactions to chat messages.

#### `notifications`
Comprehensive notification system.
- **Types**: Pick deadlines, results, chat, standings, invites
- **Delivery Methods**: Email, SMS, push, in-app
- **Features**: Scheduling, batching, retry logic

#### `notification_preferences`
User preferences for notification delivery.

### Financial

#### `payout_structures`
Flexible payout configuration system.
- **Payout Types**: `season_final`, `weekly`, `quarterly`, `game_specific`, `elimination_order`
- **Amount Types**: `fixed`, `percentage`, `entry_multiple`

#### `scoring_rules`
Custom scoring rules and multipliers.
- **Rule Categories**: `base_scoring`, `bonus`, `penalty`, `multiplier`, `payout`

### Squares Pool

#### `squares_assignments`
Individual square ownership tracking.
- **Features**: Transfer capability, assignment methods

### System

#### `audit_logs`
Comprehensive audit trail for all actions.
- **Entity Types**: `league`, `user`, `pick`, `score`, `chat_message`, `invitation`, `payout`, `setting`
- **Action Types**: `create`, `update`, `delete`, `login`, `logout`, `invite`, `join`, `kick`, `promote`, `demote`, `lock`, `unlock`, `calculate`
- **Features**: Batch operations, sensitivity levels, security events

## Key Relationships

```
users (1) → (N) league_users (N) → (1) leagues
league_users (1) → (N) league_entries
league_entries (1) → (N) picks
games (1) → (N) picks
games (1) → (1) results
games (1) → (N) spreads
league_entries (1) → (1) season_scores
league_entries (1) → (N) weekly_scores
```

## Indexing Strategy

The database uses strategic indexing on:
- Foreign key relationships
- Frequently queried date/time fields (`kickoff_timestamp`, `created_at`)
- Status fields for filtering active records
- User identification fields (`user_id`, `league_id`, `week`)
- Performance critical fields (`rank`, `points`, `status`)

## Data Types & Constraints

- **IDs**: All primary keys are `INT` with `AUTO_INCREMENT`
- **Money**: Financial fields use `DECIMAL(10,2)` for precision
- **Percentages**: `DECIMAL(5,2)` for win percentages, etc.
- **Booleans**: `TINYINT(1)` for flags and boolean values
- **Timestamps**: Full timezone support with `TIMESTAMP` fields
- **JSON**: Modern JSON columns for flexible data storage
- **ENUMs**: Strict value constraints for categorical data

## Missing Schema Updates

### Required for Spread Betting Feature

The `leagues` table needs a `pick_method` column:

```sql
ALTER TABLE leagues 
ADD COLUMN pick_method ENUM('straight_up', 'against_spread') 
DEFAULT 'straight_up' 
AFTER pool_type;
```

This field is already implemented in the application code but missing from the database schema.

## Pool Type Capabilities

### Confidence Pools
- **Pick Types**: Straight up or against the spread
- **Scoring**: Confidence points (1-16 typically)
- **Tiebreakers**: Multiple options including MNF total, highest confidence correct
- **Features**: Late entry, playoff scoring, push handling

### Survivor Pools
- **Elimination**: Single, double, triple, or custom strike count
- **Restrictions**: Can prevent same team selection twice
- **Features**: Rebuy options, late entry with loss matching

### Squares Pools
- **Grid Options**: 10x10, 5x5, or 25x4
- **Payouts**: Configurable quarter and final payouts
- **Features**: Random number assignment, square trading

## Development Notes

- All tables use consistent naming conventions
- Foreign key constraints ensure data integrity
- Timestamps track creation and updates uniformly
- JSON fields provide flexibility for evolving features
- Audit logging captures all significant actions
- The schema supports multi-tenancy through league isolation

## Version History

- **Current**: Schema supports confidence, survivor, and squares pools
- **Pending**: Addition of `pick_method` column for spread betting support

---

*Last Updated: 2025-01-25*
*Database Version: MySQL 8.0+*