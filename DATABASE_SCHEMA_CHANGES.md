# Database Schema Changes for Multi-Tier Entry System

## New Tables Needed

### 1. `league_entry_tiers` Table
Stores the different entry tiers/levels for each league.

```sql
CREATE TABLE league_entry_tiers (
    tier_id INT PRIMARY KEY AUTO_INCREMENT,
    league_id INT NOT NULL,
    tier_order INT NOT NULL, -- 1, 2, 3, etc.
    tier_name VARCHAR(50) NOT NULL, -- 'Standard', 'Premium', 'Elite'
    tier_description TEXT,
    entry_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    
    -- Prize eligibility flags
    eligible_for_weekly BOOLEAN DEFAULT TRUE,
    eligible_for_season_total BOOLEAN DEFAULT FALSE,
    eligible_for_bonuses BOOLEAN DEFAULT FALSE,
    
    -- Additional settings
    max_participants INT, -- Optional cap per tier
    is_active BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (league_id) REFERENCES leagues(league_id) ON DELETE CASCADE,
    INDEX idx_league_tier (league_id, tier_order)
);
```

### 2. `league_user_tiers` Table
Tracks which tier each league member is participating in.

```sql
CREATE TABLE league_user_tiers (
    user_tier_id INT PRIMARY KEY AUTO_INCREMENT,
    league_user_id INT NOT NULL, -- References league_users table
    tier_id INT NOT NULL,
    
    -- Payment tracking
    payment_status ENUM('unpaid', 'partial', 'paid', 'refunded') DEFAULT 'unpaid',
    amount_paid DECIMAL(10,2) DEFAULT 0.00,
    amount_owed DECIMAL(10,2) NOT NULL,
    
    -- Payment details
    payment_date TIMESTAMP NULL,
    payment_method VARCHAR(50), -- 'cash', 'venmo', 'paypal', etc.
    payment_reference VARCHAR(100), -- Transaction ID, check number, etc.
    payment_notes TEXT,
    
    -- Tier change history
    previous_tier_id INT NULL, -- If user upgraded/downgraded
    tier_changed_at TIMESTAMP NULL,
    tier_change_reason TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (league_user_id) REFERENCES league_users(league_user_id) ON DELETE CASCADE,
    FOREIGN KEY (tier_id) REFERENCES league_entry_tiers(tier_id) ON DELETE CASCADE,
    FOREIGN KEY (previous_tier_id) REFERENCES league_entry_tiers(tier_id),
    
    INDEX idx_league_user (league_user_id),
    INDEX idx_tier (tier_id),
    UNIQUE KEY unique_user_tier (league_user_id) -- One tier per user per league
);
```

## Modified Tables

### 1. `leagues` Table Changes
Add fields to support multi-tier system:

```sql
ALTER TABLE leagues 
ADD COLUMN enable_multi_tier BOOLEAN DEFAULT FALSE,
ADD COLUMN default_tier_id INT NULL,
ADD COLUMN tier_upgrade_allowed BOOLEAN DEFAULT TRUE,
ADD COLUMN tier_downgrade_allowed BOOLEAN DEFAULT FALSE;

-- Add foreign key after creating league_entry_tiers table
ALTER TABLE leagues 
ADD FOREIGN KEY (default_tier_id) REFERENCES league_entry_tiers(tier_id);
```

### 2. `league_users` Table Changes (Optional)
May need to add tier-related caching fields:

```sql
ALTER TABLE league_users 
ADD COLUMN current_tier_name VARCHAR(50),
ADD COLUMN payment_status ENUM('unpaid', 'partial', 'paid', 'refunded') DEFAULT 'unpaid';
```

## Integration Points

### 1. Member Registration Flow
- When joining a league, users choose their tier (if multi-tier enabled)
- Default tier is selected if only one tier or user doesn't choose
- Payment amount calculated based on selected tier

### 2. Results & Standings Pages
- Filter/group by tier eligibility
- Show separate standings for different prize pools
- Display tier badges next to usernames
- Calculate payouts based on tier participation

### 3. Payment Tracking
- Track payments per tier (not just per user)
- Support partial payments and tier upgrades
- Generate payment reports by tier

## Migration Script Example

```sql
-- Step 1: Create new tables
-- (Run the CREATE TABLE statements above)

-- Step 2: Migrate existing leagues to single-tier system
INSERT INTO league_entry_tiers (league_id, tier_order, tier_name, tier_description, entry_fee, eligible_for_weekly)
SELECT league_id, 1, 'Standard', 'Regular pool participation', entry_fee, TRUE
FROM leagues;

-- Step 3: Assign all existing users to the default tier
INSERT INTO league_user_tiers (league_user_id, tier_id, amount_owed, payment_status)
SELECT lu.league_user_id, let.tier_id, let.entry_fee, 'unpaid'
FROM league_users lu
JOIN league_entry_tiers let ON lu.league_id = let.league_id 
WHERE let.tier_order = 1;

-- Step 4: Update leagues to reference their default tier
UPDATE leagues l 
SET default_tier_id = (
    SELECT tier_id FROM league_entry_tiers 
    WHERE league_id = l.league_id AND tier_order = 1
);
```

## Benefits of This Schema

1. **Flexible Tier Management**: Add/remove tiers dynamically
2. **Detailed Payment Tracking**: Full audit trail of payments
3. **Prize Pool Separation**: Clear eligibility rules per tier
4. **Upgrade/Downgrade Support**: Users can change tiers mid-season
5. **Reporting Capabilities**: Easy to generate payment and participation reports
6. **Backward Compatible**: Existing single-tier leagues work seamlessly

## API Endpoints Needed

- `POST /leagues/:id/tiers` - Create new tier
- `PUT /leagues/:id/tiers/:tierId` - Update tier
- `DELETE /leagues/:id/tiers/:tierId` - Remove tier
- `POST /leagues/:id/users/:userId/tier` - Change user's tier
- `POST /leagues/:id/payments` - Record payment
- `GET /leagues/:id/payments` - Get payment report