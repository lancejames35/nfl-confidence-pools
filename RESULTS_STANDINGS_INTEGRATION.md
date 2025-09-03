# Results & Standings Integration for Multi-Tier System

## 1. Standings Page Modifications

### Current Standings Display
- Single leaderboard for all users
- Total points ranking
- Simple win/loss records

### New Multi-Tier Standings Display

#### Option A: Tabbed Interface
```html
<div class="standings-container">
    <!-- Tier Tabs -->
    <ul class="nav nav-tabs" id="tierTabs">
        <li class="nav-item">
            <button class="nav-link active" data-bs-toggle="tab" data-bs-target="#overall">
                Overall Standings
            </button>
        </li>
        <% leagueTiers.forEach(tier => { %>
        <li class="nav-item">
            <button class="nav-link" data-bs-toggle="tab" data-bs-target="#tier<%= tier.tier_id %>">
                <%= tier.tier_name %> 
                <span class="badge bg-secondary ms-1"><%= tier.participant_count %></span>
            </button>
        </li>
        <% }) %>
    </ul>

    <!-- Tab Content -->
    <div class="tab-content">
        <!-- Overall Standings -->
        <div class="tab-pane active" id="overall">
            <!-- All users, with tier badges -->
        </div>
        
        <!-- Tier-specific Standings -->
        <% leagueTiers.forEach(tier => { %>
        <div class="tab-pane" id="tier<%= tier.tier_id %>">
            <!-- Only users in this tier -->
            <!-- Prize pool information -->
            <!-- Payout structure for this tier -->
        </div>
        <% }) %>
    </div>
</div>
```

#### Option B: Split View
```html
<div class="row">
    <!-- Main Standings -->
    <div class="col-lg-8">
        <div class="card">
            <div class="card-header">
                <h5>Overall Standings</h5>
                <div class="tier-filter">
                    <select class="form-select" id="tierFilter">
                        <option value="">All Participants</option>
                        <% leagueTiers.forEach(tier => { %>
                        <option value="<%= tier.tier_id %>"><%= tier.tier_name %> Only</option>
                        <% }) %>
                    </select>
                </div>
            </div>
            <div class="card-body">
                <table class="table table-hover">
                    <thead>
                        <tr>
                            <th>Rank</th>
                            <th>Player</th>
                            <th>Tier</th>
                            <th>Points</th>
                            <th>Record</th>
                            <th>Prize Eligibility</th>
                        </tr>
                    </thead>
                    <tbody>
                        <% standings.forEach((player, index) => { %>
                        <tr data-tier="<%= player.tier_id %>">
                            <td><%= index + 1 %></td>
                            <td>
                                <%= player.username %>
                                <% if (player.tier_name !== 'Standard') { %>
                                    <span class="badge bg-<%= player.tier_color %> ms-1">
                                        <%= player.tier_name %>
                                    </span>
                                <% } %>
                            </td>
                            <td>
                                <span class="tier-badge <%= player.tier_class %>">
                                    <%= player.tier_name %>
                                </span>
                            </td>
                            <td><strong><%= player.total_points %></strong></td>
                            <td><%= player.wins %>-<%= player.losses %></td>
                            <td>
                                <div class="prize-eligibility">
                                    <% if (player.eligible_for_weekly) { %>
                                        <span class="badge bg-primary">Weekly</span>
                                    <% } %>
                                    <% if (player.eligible_for_season) { %>
                                        <span class="badge bg-success">Season</span>
                                    <% } %>
                                    <% if (player.eligible_for_bonuses) { %>
                                        <span class="badge bg-warning">Bonuses</span>
                                    <% } %>
                                </div>
                            </td>
                        </tr>
                        <% }) %>
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <!-- Prize Pool Sidebar -->
    <div class="col-lg-4">
        <!-- Prize pool cards by tier -->
    </div>
</div>
```

### Enhanced Player Row Display
```html
<tr class="player-row" data-tier="<%= player.tier_id %>">
    <td class="rank-cell">
        <div class="rank-badge">
            <%= player.overall_rank %>
            <% if (player.tier_rank !== player.overall_rank) { %>
                <small class="tier-rank">(<%= player.tier_rank %> in tier)</small>
            <% } %>
        </div>
    </td>
    <td class="player-cell">
        <div class="player-info">
            <div class="player-name">
                <%= player.username %>
                <% if (player.payment_status === 'unpaid') { %>
                    <i class="fas fa-exclamation-triangle text-warning" title="Payment pending"></i>
                <% } %>
            </div>
            <div class="player-tier">
                <span class="tier-badge tier-<%= player.tier_id %>">
                    <%= player.tier_name %>
                </span>
            </div>
        </div>
    </td>
    <td class="points-cell">
        <div class="points-display">
            <strong class="total-points"><%= player.total_points %></strong>
            <small class="weekly-avg">Avg: <%= player.weekly_average %></small>
        </div>
    </td>
    <td class="record-cell">
        <%= player.correct_picks %>-<%= player.total_picks - player.correct_picks %>
        <small class="percentage">(<%= player.win_percentage %>%)</small>
    </td>
    <td class="eligibility-cell">
        <div class="prize-badges">
            <% if (player.eligible_for_weekly) { %>
                <span class="badge bg-primary" title="Weekly prizes">W</span>
            <% } %>
            <% if (player.eligible_for_season) { %>
                <span class="badge bg-success" title="Season total">S</span>
            <% } %>
            <% if (player.eligible_for_bonuses) { %>
                <span class="badge bg-warning" title="Bonus prizes">B</span>
            <% } %>
        </div>
    </td>
</tr>
```

## 2. Prize Pool Display

### Prize Pool Cards
```html
<div class="prize-pools-sidebar">
    <% leagueTiers.forEach(tier => { %>
    <div class="card prize-pool-card mb-3">
        <div class="card-header bg-<%= tier.color %> text-white">
            <h6 class="mb-0">
                <%= tier.tier_name %> Prize Pool
                <small class="float-end"><%= tier.participant_count %> players</small>
            </h6>
        </div>
        <div class="card-body">
            <div class="prize-breakdown">
                <% if (tier.eligible_for_weekly) { %>
                <div class="prize-item">
                    <strong>Weekly Prizes:</strong>
                    <div class="prize-amount">$<%= tier.weekly_pool_total %></div>
                    <small class="text-muted">$<%= tier.weekly_prize_per_week %> per week</small>
                </div>
                <% } %>
                
                <% if (tier.eligible_for_season) { %>
                <div class="prize-item">
                    <strong>Season Total:</strong>
                    <div class="prize-amount">$<%= tier.season_pool_total %></div>
                    <small class="text-muted">Winner takes all</small>
                </div>
                <% } %>
                
                <% if (tier.eligible_for_bonuses) { %>
                <div class="prize-item">
                    <strong>Bonus Pool:</strong>
                    <div class="prize-amount">$<%= tier.bonus_pool_total %></div>
                    <small class="text-muted">Monthly winners</small>
                </div>
                <% } %>
            </div>
            
            <div class="payout-structure mt-3">
                <strong>Payout Structure:</strong>
                <ul class="list-unstyled small">
                    <li>1st: <%= tier.first_place_percentage %>%</li>
                    <li>2nd: <%= tier.second_place_percentage %>%</li>
                    <% if (tier.third_place_percentage > 0) { %>
                    <li>3rd: <%= tier.third_place_percentage %>%</li>
                    <% } %>
                </ul>
            </div>
        </div>
    </div>
    <% }) %>
</div>
```

## 3. Results Page Integration

### Weekly Results with Tier Context
```html
<div class="weekly-results">
    <div class="week-header">
        <h4>Week <%= currentWeek %> Results</h4>
        <div class="tier-summary">
            <% leagueTiers.forEach(tier => { %>
            <div class="tier-winner">
                <strong><%= tier.tier_name %> Winner:</strong>
                <span class="winner-name"><%= tier.weekly_winner %></span>
                <span class="winner-points">(<%= tier.winning_points %> pts)</span>
            </div>
            <% }) %>
        </div>
    </div>

    <!-- Results table with tier indicators -->
    <div class="results-table">
        <!-- Similar to standings but focused on weekly performance -->
    </div>
</div>
```

### Tier-Specific Leaderboards
```html
<div class="tier-leaderboards">
    <% leagueTiers.forEach(tier => { %>
    <div class="tier-leaderboard mb-4">
        <div class="tier-header">
            <h5><%= tier.tier_name %> Leaderboard</h5>
            <div class="tier-stats">
                <span>Players: <%= tier.participant_count %></span>
                <span>Prize Pool: $<%= tier.total_prize_pool %></span>
            </div>
        </div>
        
        <div class="top-players">
            <% tier.topPlayers.slice(0, 3).forEach((player, index) => { %>
            <div class="top-player position-<%= index + 1 %>">
                <div class="rank-badge rank-<%= index + 1 %>"><%= index + 1 %></div>
                <div class="player-details">
                    <div class="player-name"><%= player.username %></div>
                    <div class="player-stats">
                        <span class="points"><%= player.total_points %> pts</span>
                        <span class="record"><%= player.wins %>-<%= player.losses %></span>
                    </div>
                </div>
                <% if (index === 0) { %>
                <div class="leader-badge">
                    <i class="fas fa-crown text-warning"></i>
                </div>
                <% } %>
            </div>
            <% }) %>
        </div>
    </div>
    <% }) %>
</div>
```

## 4. Database Queries for Tier-Aware Standings

### Main Standings Query
```sql
SELECT 
    u.user_id,
    u.username,
    u.first_name,
    u.last_name,
    
    -- Tier information
    t.tier_id,
    t.tier_name,
    t.tier_description,
    t.eligible_for_weekly,
    t.eligible_for_season_total,
    t.eligible_for_bonuses,
    
    -- Payment status
    ut.payment_status,
    ut.amount_paid,
    ut.amount_owed,
    
    -- Performance stats
    COALESCE(SUM(p.points_earned), 0) as total_points,
    COUNT(DISTINCT p.week) as weeks_played,
    SUM(CASE WHEN p.is_correct = 1 THEN 1 ELSE 0 END) as correct_picks,
    COUNT(p.pick_id) as total_picks,
    
    -- Rankings
    ROW_NUMBER() OVER (ORDER BY COALESCE(SUM(p.points_earned), 0) DESC) as overall_rank,
    ROW_NUMBER() OVER (
        PARTITION BY t.tier_id 
        ORDER BY COALESCE(SUM(p.points_earned), 0) DESC
    ) as tier_rank
    
FROM users u
JOIN league_users lu ON u.user_id = lu.user_id
JOIN league_user_tiers ut ON lu.league_user_id = ut.league_user_id
JOIN league_entry_tiers t ON ut.tier_id = t.tier_id
LEFT JOIN league_entries le ON lu.league_user_id = le.league_user_id
LEFT JOIN picks p ON le.entry_id = p.entry_id

WHERE lu.league_id = ? AND lu.status = 'active'

GROUP BY u.user_id, t.tier_id
ORDER BY total_points DESC, correct_picks DESC, u.username;
```

### Prize Pool Calculations
```sql
-- Calculate prize pools by tier
SELECT 
    t.tier_id,
    t.tier_name,
    COUNT(ut.user_tier_id) as participant_count,
    SUM(ut.amount_paid) as total_collected,
    
    -- Prize pool calculations
    CASE WHEN t.eligible_for_weekly = 1 
         THEN SUM(ut.amount_paid) * 0.7 -- 70% for weekly
         ELSE 0 END as weekly_pool,
         
    CASE WHEN t.eligible_for_season_total = 1 
         THEN SUM(ut.amount_paid) * 0.25 -- 25% for season
         ELSE 0 END as season_pool,
         
    CASE WHEN t.eligible_for_bonuses = 1 
         THEN SUM(ut.amount_paid) * 0.05 -- 5% for bonuses
         ELSE 0 END as bonus_pool

FROM league_entry_tiers t
JOIN league_user_tiers ut ON t.tier_id = ut.tier_id
WHERE t.league_id = ?
GROUP BY t.tier_id;
```

## 5. Mobile Responsive Considerations

### Mobile Standings Table
```html
<!-- Mobile card view instead of table -->
<div class="mobile-standings d-lg-none">
    <% standings.forEach((player, index) => { %>
    <div class="player-card">
        <div class="player-header">
            <div class="rank-badge"><%= index + 1 %></div>
            <div class="player-name"><%= player.username %></div>
            <div class="tier-badge tier-<%= player.tier_id %>">
                <%= player.tier_name %>
            </div>
        </div>
        <div class="player-stats">
            <div class="stat">
                <strong><%= player.total_points %></strong>
                <small>Points</small>
            </div>
            <div class="stat">
                <strong><%= player.win_percentage %>%</strong>
                <small>Accuracy</small>
            </div>
            <div class="prize-eligibility">
                <!-- Prize badges -->
            </div>
        </div>
    </div>
    <% }) %>
</div>
```

This integration ensures users understand exactly what they're competing for based on their tier level, while maintaining clear visibility of overall league performance.