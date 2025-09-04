# Locked Picks Drag & Drop Fix

## Issue Description
When picks were locked (e.g., Dal-Phi locked at 8 points), the drag-and-drop and dropdown functionality had problems:
- Dragging around locked picks caused confidence numbers to get messed up
- Users couldn't select confidence values that should skip over locked numbers
- Example: If 8 is locked, dragging from 6 to 9 should move 9→7 (skipping locked 8)

## Root Cause Analysis
The original algorithm had two major flaws:

1. **Drag & Drop**: 
   - Prevented ANY movement near locked items
   - Used complex position tracking and reversion logic
   - Didn't properly reassign confidence values around locked picks

2. **Dropdown Selection**:
   - Simple shifting logic that didn't account for locked values
   - Would overwrite or conflict with locked confidence numbers
   - No validation against selecting locked values

## Solution Implemented

### 🔧 **1. Improved updateConfidencePoints() Algorithm**

**Before**: Sequential assignment with gap-finding
```javascript
// Old: Tried to find "next available" confidence sequentially
while (nextConfidence > 0) {
  const isConfidenceTaken = /* check if locked */
  if (!isConfidenceTaken) break;
  nextConfidence--;
}
```

**After**: Smart reassignment with locked value exclusion
```javascript
// New: Create available values array, assign by position
const lockedConfidenceValues = new Set();
const availableConfidenceValues = [];
for (let i = totalGames; i >= 1; i--) {
  if (!lockedConfidenceValues.has(i)) {
    availableConfidenceValues.push(i);
  }
}
// Assign by position: 1st unlocked item gets highest available value
```

### 🔧 **2. Enhanced handleConfidenceChange() Logic**

**Before**: Simple shifting without locked pick awareness
```javascript
// Old: Naive shifting
if (newConfidence > oldConfidence) {
  if (currentConf > oldConfidence && currentConf <= newConfidence) {
    newConf = currentConf - 1; // Could overwrite locked picks!
  }
}
```

**After**: Smart reassignment with locked pick validation
```javascript
// New: Check if target value is locked, then reassign all unlocked items
if (lockedConfidenceValues.has(newConfidence)) {
  dropdown.value = oldConfidence; // Reset invalid selection
  return;
}
// Reassign all unlocked items to available values by position
```

### 🔧 **3. Simplified Sortable Configuration**

**Before**: Complex move blocking and position tracking
```javascript
move: function(evt) {
  // Blocked movement around ANY locked items
  if (relatedItem && relatedItem.classList.contains('locked')) {
    return false; // Too restrictive!
  }
}
```

**After**: Allow movement, fix in post-processing
```javascript
move: function(evt) {
  // Only block dragging locked items themselves
  if (draggedItem.classList.contains('locked')) {
    return false;
  }
  return true; // Allow movement around locked items
}
```

## Algorithm Logic

### **Example Scenario**: Dal-Phi locked at 8 points, drag team from 6→9

1. **Locked Values**: {8}
2. **Available Values**: [16,15,14,13,12,11,10,9,7,6,5,4,3,2,1] (excluding 8)
3. **After Drag**: Items reassigned by position, automatically skipping 8
4. **Result**: 
   - Item at position 1 (top) gets 16
   - Item at position 2 gets 15
   - ...
   - **Locked Dal-Phi stays at 8**
   - Other items fill remaining values (9,7,6,5...)

### **Dropdown Selection**: User selects 9 for a team

1. **Validation**: Is 9 locked? No → Allow
2. **Assignment**: Set selected item to 9
3. **Reassignment**: All other unlocked items get remaining available values by position
4. **Result**: Locked items unchanged, others flow around them naturally

## Files Modified

- `views/picks/make.ejs`
  - Enhanced `updateConfidencePoints()` function (lines 1646-1706)
  - Improved `handleConfidenceChange()` function (lines 1942-2044)
  - Simplified Sortable `move`, `onStart`, and `onEnd` handlers (lines 1560-1593)

## Benefits

1. **✅ Locked picks maintain their confidence values**
2. **✅ Users can drag around locked picks without issues**  
3. **✅ Dropdown selections properly skip locked values**
4. **✅ Confidence numbers automatically flow around locked picks**
5. **✅ Simpler, more reliable logic with fewer edge cases**

## Testing Scenarios

- [x] Drag team above locked pick → Other teams reassign properly
- [x] Drag team below locked pick → Confidence flows around locked value  
- [x] Select confidence value via dropdown → Validates against locked values
- [x] Multiple locked picks → Algorithm handles multiple exclusions
- [x] Locked pick at various positions → Works regardless of locked position

The new system provides intuitive behavior where locked picks act as "unmovable anchors" and all other picks flow naturally around them.