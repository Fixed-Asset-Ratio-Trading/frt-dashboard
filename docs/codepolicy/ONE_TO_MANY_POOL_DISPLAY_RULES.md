# One-to-Many Pool Display Rules

**File:** `docs/ONE_TO_MANY_POOL_DISPLAY_RULES.md`  
**Purpose:** Define display rules for pools with the one-to-many ratio flag  
**Last Updated:** 2025-01-28

## 📋 Overview

This document establishes the display rules for pools that have the one-to-many ratio flag set (bit 0 in pool flags). These pools require special handling to ensure user-friendly display that shows whole numbers without fractions.

## 🎯 One-to-Many Pool Identification

A pool is considered one-to-many when:
- Pool flags bit 0 is set (`pool.flags & 1 !== 0`)
- The pool ratio represents a 1:many relationship (e.g., 1 SOL = 160 USDT)
- One token represents the "1" unit, the other represents the "many" units

## 📏 Display Rules

### 1. Whole Numbers Only
- **NEVER show fractions** in one-to-many pool displays
- Always display as: "1 [Token] = [Whole Number] [Token]"
- Use `Math.floor()` if necessary to ensure whole numbers

### 2. Token Order Priority
The token representing "1" should always be displayed first (base token):
- Calculate both directions: A→B and B→A
- Choose the direction that produces a whole number ≥ 1
- The token that produces whole numbers becomes the base token

### 3. Calculation Method
For one-to-many pools, use this calculation approach:

```javascript
// Test A → B: 1 TokenA display unit → ? TokenB display units
const oneTokenABasisPoints = 1 * Math.pow(10, tokenADecimals);
const outputBBasisPoints = oneTokenABasisPoints * tokenBRatio / tokenARatio;
const outputBDisplayUnits = outputBBasisPoints / Math.pow(10, tokenBDecimals);

// Test B → A: 1 TokenB display unit → ? TokenA display units  
const oneTokenBBasisPoints = 1 * Math.pow(10, tokenBDecimals);
const outputABasisPoints = oneTokenBBasisPoints * tokenARatio / tokenBRatio;
const outputADisplayUnits = outputABasisPoints / Math.pow(10, tokenADecimals);

// Choose direction that gives whole number ≥ 1
const isWholeNumberAtoB = Number.isInteger(outputBDisplayUnits) && outputBDisplayUnits >= 1;
const isWholeNumberBtoA = Number.isInteger(outputADisplayUnits) && outputADisplayUnits >= 1;
```

## 📝 Examples

### Example 1: MST/TS Pool
**Pool Data:**
- MST (Token A): 1000 basis points, 0 decimals
- TS (Token B): 10000 basis points, 4 decimals
- Pool flags: 1 (one-to-many flag set)

**Calculation:**
- Test MST→TS: 1 MST (1 basis point) → 1 * 10000/1000 = 10 TS basis points → 10/10^4 = 0.001 TS display
- Test TS→MST: 1 TS (10000 basis points) → 10000 * 1000/10000 = 1000 MST basis points → 1000/10^0 = 1000 MST display

**Correct Display:** "1 TS = 1000 MST" ✅ (whole number, TS is base)

### Example 2: SOL/USDT Pool  
**Pool Data:**
- SOL (Token A): 100 basis points, 9 decimals
- USDT (Token B): 16000 basis points, 6 decimals
- Pool flags: 1 (one-to-many flag set)

**Calculation:**
- Test SOL→USDT: 1 SOL (10^9 basis points) → 10^9 * 16000/100 = 1.6×10^12 basis points → 1.6×10^6 USDT display = 1,600,000 USDT
- Test USDT→SOL: 1 USDT (10^6 basis points) → 10^6 * 100/16000 = 6250 basis points → 6250/10^9 = 0.000006250 SOL

**Correct Display:** "1 SOL = 1,600,000 USDT" ✅ (whole number, SOL is base)

## 🚫 Anti-Patterns (What NOT to Do)

### ❌ Showing Fractions
```
Bad: "1 MST = 0.001 TS"
Bad: "1 SOL = 1,600,000.5 USDT"
```

### ❌ Wrong Token Order
```
Bad: "1000 MST = 1 TS" (should be "1 TS = 1000 MST")
```

### ❌ Using Non-Integer Rates
```
Bad: "1 Token = 3.14159 OtherToken"
Good: "1 Token = 3 OtherToken"
```

## 🔧 Implementation Files

The following files implement these rules:

### Primary Implementation
- **`dashboard/utils.js`** - `getCorrectTokenDisplay()` function
  - Contains one-to-many detection and calculation logic
  - Implements the whole number requirement
  - Determines correct token order

### UI Integration
- **`dashboard/liquidity.js`** - Liquidity management page
- **`dashboard/swap.js`** - Token swap page  
- **`dashboard/dashboard.js`** - Main dashboard pool list

### Flag Detection
- **`dashboard/utils.js`** - `interpretPoolFlags()` function
- **`dashboard/data-service.js`** - Pool data loading

## 🧪 Testing

To test one-to-many pool display:

1. **Create a test pool** with one-to-many ratio (e.g., 1:1000)
2. **Verify the flag** is set correctly in pool creation
3. **Check the display** shows whole numbers only
4. **Confirm token order** puts the "1" token first

### Test Cases
- [ ] Pool with decimals 0:4 and ratio 1000:10000 → "1 TS = 1000 MST"
- [ ] Pool with decimals 9:6 and ratio 100:16000 → "1 SOL = 1600 USDT"  
- [ ] Pool with equal decimals but different ratios
- [ ] Edge case: Very large ratios (test performance)

## 🔄 Update Process

When modifying one-to-many display logic:

1. **Update the implementation** in `dashboard/utils.js`
2. **Test with real pool data** to verify calculations
3. **Update cache versions** in HTML files (e.g., `utils.js?v=NEW_VERSION`)
4. **Update this documentation** with any rule changes
5. **Run full UI testing** on all affected pages

## 📚 References

- **Pool Flag Documentation:** See `interpretPoolFlags()` in `utils.js`
- **Swap Formula:** `amount_out = amount_in * ratio_B / ratio_A`
- **Basis Points:** All contract values stored as basis points (no decimals)
- **Display Units:** UI values adjusted for token decimal places

---

**Note:** These rules ensure consistent, user-friendly display across all dashboard interfaces. Any changes to these rules must be reflected in all implementing files and thoroughly tested.