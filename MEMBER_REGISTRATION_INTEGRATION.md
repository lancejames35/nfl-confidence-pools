# Member Registration Integration for Multi-Tier System

## 1. Join League Flow Modifications

### Current Join Process
1. User enters join code
2. User is added to league as 'member'
3. Single entry fee applies to all

### New Multi-Tier Join Process
1. User enters join code
2. **NEW**: System displays available tiers with pricing
3. User selects desired tier level
4. User confirms participation level and payment requirements
5. User is added with selected tier
6. Payment tracking is initialized

## 2. Join League Page UI Changes

### Tier Selection Component
```html
<!-- After join code validation, before confirmation -->
<div class="tier-selection mt-4">
    <h5>Choose Your Participation Level</h5>
    <div class="row g-3">
        <!-- Tier cards generated dynamically -->
        <% leagueTiers.forEach(tier => { %>
        <div class="col-md-4">
            <div class="card tier-card" data-tier-id="<%= tier.tier_id %>">
                <div class="card-body text-center">
                    <h6 class="card-title"><%= tier.tier_name %></h6>
                    <div class="tier-price">$<%= tier.entry_fee %></div>
                    <p class="card-text small"><%= tier.tier_description %></p>
                    
                    <!-- Benefits list -->
                    <div class="tier-benefits">
                        <% if (tier.eligible_for_weekly) { %>
                            <div class="benefit"><i class="fas fa-check text-success"></i> Weekly Prizes</div>
                        <% } %>
                        <% if (tier.eligible_for_season_total) { %>
                            <div class="benefit"><i class="fas fa-check text-success"></i> Season Total</div>
                        <% } %>
                        <% if (tier.eligible_for_bonuses) { %>
                            <div class="benefit"><i class="fas fa-check text-success"></i> Bonus Prizes</div>
                        <% } %>
                    </div>
                    
                    <button class="btn btn-outline-primary select-tier-btn" data-tier-id="<%= tier.tier_id %>">
                        Select This Level
                    </button>
                </div>
            </div>
        </div>
        <% }) %>
    </div>
</div>
```

### Confirmation Modal
```html
<div class="modal" id="tierConfirmationModal">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Confirm Participation Level</h5>
            </div>
            <div class="modal-body">
                <div class="selected-tier-summary">
                    <h6>You've selected: <span id="selectedTierName"></span></h6>
                    <div class="tier-details">
                        <div class="row">
                            <div class="col-6">
                                <strong>Entry Fee:</strong><br>
                                $<span id="selectedTierFee"></span>
                            </div>
                            <div class="col-6">
                                <strong>Payment Status:</strong><br>
                                <span class="badge bg-warning">Unpaid</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="tier-benefits mt-3">
                        <strong>You'll be eligible for:</strong>
                        <ul id="selectedTierBenefits"></ul>
                    </div>
                </div>
                
                <div class="alert alert-info">
                    <i class="fas fa-info-circle me-2"></i>
                    You can upgrade your tier later, but downgrades may not be allowed depending on league settings.
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Back</button>
                <button type="button" class="btn btn-primary" id="confirmJoinBtn">Join League</button>
            </div>
        </div>
    </div>
</div>
```

## 3. Backend Changes Required

### Join League Route Updates
```javascript
// routes/leagues.js - POST /leagues/join
app.post('/leagues/join', async (req, res) => {
    const { join_code, tier_id } = req.body;
    
    try {
        // 1. Validate join code and get league
        const league = await validateJoinCode(join_code);
        
        // 2. Get selected tier details
        const selectedTier = await database.execute(
            'SELECT * FROM league_entry_tiers WHERE tier_id = ? AND league_id = ?',
            [tier_id, league.league_id]
        );
        
        // 3. Check tier capacity (if applicable)
        if (selectedTier.max_participants) {
            const currentCount = await getTierParticipantCount(tier_id);
            if (currentCount >= selectedTier.max_participants) {
                return res.status(400).json({ 
                    error: 'This tier is full' 
                });
            }
        }
        
        // 4. Add user to league
        const leagueUser = await addUserToLeague(req.user.user_id, league.league_id);
        
        // 5. Assign tier and initialize payment tracking
        await database.execute(`
            INSERT INTO league_user_tiers 
            (league_user_id, tier_id, amount_owed, payment_status) 
            VALUES (?, ?, ?, 'unpaid')
        `, [leagueUser.league_user_id, tier_id, selectedTier.entry_fee]);
        
        res.json({ 
            success: true, 
            league_id: league.league_id,
            tier_name: selectedTier.tier_name,
            amount_owed: selectedTier.entry_fee 
        });
        
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});
```

### Get League Tiers Endpoint
```javascript
// GET /leagues/:id/tiers - Get available tiers for joining
app.get('/leagues/:id/tiers', async (req, res) => {
    try {
        const tiers = await database.execute(`
            SELECT t.*, 
                   COUNT(ut.user_tier_id) as current_participants,
                   (t.max_participants - COUNT(ut.user_tier_id)) as spots_remaining
            FROM league_entry_tiers t
            LEFT JOIN league_user_tiers ut ON t.tier_id = ut.tier_id
            WHERE t.league_id = ? AND t.is_active = TRUE
            GROUP BY t.tier_id
            ORDER BY t.tier_order
        `, [req.params.id]);
        
        res.json(tiers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
```

## 4. Upgrade/Downgrade Functionality

### Mid-Season Tier Changes
- Users can request tier upgrades (if allowed)
- Payment difference calculated automatically
- Historical tracking maintained
- Commissioner approval may be required

### Tier Change Modal (for users)
```html
<div class="modal" id="changeTierModal">
    <div class="modal-body">
        <h6>Change Your Participation Level</h6>
        
        <div class="current-tier mb-3">
            <strong>Current:</strong> Standard ($50)
        </div>
        
        <div class="tier-options">
            <div class="upgrade-option">
                <div class="tier-change-card">
                    <h6>Premium ($100)</h6>
                    <div class="price-difference text-success">
                        + $50.00 additional payment required
                    </div>
                    <div class="benefits-gained">
                        <strong>You'll gain access to:</strong>
                        <ul>
                            <li>Season total prizes</li>
                            <li>Monthly bonuses</li>
                        </ul>
                    </div>
                    <button class="btn btn-success">Upgrade to Premium</button>
                </div>
            </div>
        </div>
    </div>
</div>
```

## 5. Email Notifications

### Tier Selection Confirmation
```
Subject: League Participation Confirmed - [League Name]

Hi [Username],

You've successfully joined [League Name] at the [Tier Name] level.

Your Details:
- Participation Level: [Tier Name]
- Entry Fee: $[Amount]
- Payment Status: Unpaid
- Eligible for: [Benefits list]

Next Steps:
1. Make your payment to the commissioner
2. Start making your picks for Week [X]

Payment can be made via: [Payment methods]

Good luck this season!
```

## 6. Commissioner Tools

### Tier Management Dashboard
- View members by tier
- Process tier upgrades/downgrades
- Generate payment reports by tier
- Send payment reminders by tier

### Bulk Operations
- Move multiple users between tiers
- Apply discounts to specific tiers
- Generate tier-specific communications

This integration ensures seamless onboarding while giving users clear choices about their participation level and associated costs.