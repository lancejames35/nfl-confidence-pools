# Tier Color Consistency Fix

## Issue Description
The tier colors were inconsistent between the Results page and Standings page. For leagues with both "Weekly" and "Season" tiers:
- **Results page**: Season = Blue (#6366f1), Weekly = Green (#10b981)  
- **Standings page**: Weekly = Blue (#6366f1), Season = Green (#10b981)

## Root Cause Analysis
Both pages use the same color array: `['#6366f1', '#10b981', '#f59e0b', '#8b5cf6', ...]`

However, they were sorting tiers differently:

1. **ResultsController.getTierSummary()**: Sorted tiers **alphabetically**
   ```javascript
   .sort((a, b) => a.tier_name.localeCompare(b.tier_name))
   ```
   Result: "Season" (index 0 = blue), "Weekly" (index 1 = green)

2. **StandingsController.getTierSummary()**: Sorted tiers by **tier_order** from database
   ```sql
   ORDER BY let.tier_order ASC
   ```
   Result: "Weekly" (index 0 = blue), "Season" (index 1 = green)

## Solution Implemented
Updated `ResultsController.getTierSummary()` to use the same database-based ordering as `StandingsController`:

### Changes Made:
1. **Method signature**: Added `leagueId` parameter and made method `async`
2. **Database query**: Query `league_entry_tiers` table to get proper `tier_order`
3. **Consistent sorting**: Both controllers now use `ORDER BY let.tier_order ASC`
4. **Fallback logic**: Maintains alphabetical sorting as fallback if database query fails

### Before:
```javascript
static getTierSummary(participants) {
    // ... logic using alphabetical sort
    return Array.from(tierMap.values()).sort((a, b) => a.tier_name.localeCompare(b.tier_name));
}
```

### After:
```javascript
static async getTierSummary(leagueId, participants) {
    // Query database for tier_order
    const query = `SELECT tier_id, tier_name, tier_order, tier_description 
                   FROM league_entry_tiers 
                   WHERE league_id = ? AND is_active = 1 
                   ORDER BY tier_order ASC`;
    // ... use database ordering
}
```

## Files Modified:
- `controllers/ResultsController.js`
  - Updated `getTierSummary()` method
  - Updated method call in `weekResults()`

## Result:
Both Results and Standings pages now display tier colors in consistent order based on the `tier_order` field in the database, ensuring the same tier always has the same color across all pages.

## Testing:
✅ JavaScript syntax validated
✅ Method signature updated consistently
✅ Fallback logic preserved for error handling