# Dashboard Upgrade Implementation Guide

## Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Deploy and Generate State**
   ```bash
   ./scripts/remote_build_and_deploy.sh
   # State file automatically generated at dashboard/state.json
   ```

3. **Start Dashboard**
   ```bash
   npm run start-dashboard
   # Opens dashboard at http://localhost:8080
   ```

## Key Files Created

### 📋 Documentation
- `docs/DASHBOARD_UPGRADE_REQUIREMENTS.md` - Complete upgrade specification
- `dashboard/README-UPGRADE.md` - This implementation guide

### 🔧 Scripts
- `scripts/query_program_state.js` - Program Account Query script
- `package.json` - Node.js dependencies and scripts

### 📊 Generated Data
- `dashboard/state.json` - Auto-generated state data (created by deployment)

## Implementation Checklist

### ✅ Completed
- [x] Program Account Query script
- [x] Integration with deployment pipeline
- [x] State data JSON generation
- [x] Dependencies configuration

### 🔧 To Implement
- [ ] Update dashboard JS to use sessionStorage instead of localStorage
- [ ] Implement JSON state loading on startup
- [ ] Add One-to-many ratio display logic
- [ ] Create expandable state display components
- [ ] Build liquidity and swap pages
- [ ] Add treasury and system state displays

## State Data Structure

The generated `state.json` file contains:

```json
{
  "metadata": {
    "generated_at": "2025-01-22T10:30:00.000Z",
    "program_id": "4aeVqtWhrUh6wpX8acNj2hpWXKEQwxjA3PYb2sHhNyCn",
    "rpc_url": "http://192.168.2.88:8899",
    "script_version": "1.0.0"
  },
  "pools": [
    {
      "address": "...",
      "owner": "...",
      "token_a_mint": "...",
      "token_b_mint": "...",
      "ratio_a_numerator": 1000,
      "ratio_b_denominator": 1,
      "flags_decoded": {
        "one_to_many_ratio": true,
        "liquidity_paused": false,
        "swaps_paused": false
      }
      // ... all other PoolState fields
    }
  ],
  "main_treasury_state": {
    "total_balance": 5000000000,
    "total_pool_creation_fees": 1000000000
    // ... all other MainTreasuryState fields
  },
  "system_state": {
    "is_paused": false,
    "pause_reason_decoded": "No pause / Normal operation"
    // ... all other SystemState fields
  }
}
```

## One-to-Many Ratio Display Logic

For pools with `flags_decoded.one_to_many_ratio = true`:

```javascript
function formatPoolDisplay(pool) {
  if (pool.flags_decoded.one_to_many_ratio) {
    // Find which token has ratio = 1
    if (pool.ratio_a_numerator === 1) {
      // Token A is 1, display as TokenA/TokenB 1:ratio_b
      return `${getTokenSymbol(pool.token_a_mint)}/${getTokenSymbol(pool.token_b_mint)} 1:${pool.ratio_b_denominator}`;
    } else if (pool.ratio_b_denominator === 1) {
      // Token B is 1, display as TokenB/TokenA 1:ratio_a  
      return `${getTokenSymbol(pool.token_b_mint)}/${getTokenSymbol(pool.token_a_mint)} 1:${pool.ratio_a_numerator}`;
    }
  }
  
  // Standard pools: use normalized display
  return `${getTokenSymbol(pool.token_a_mint)}/${getTokenSymbol(pool.token_b_mint)} ${formatRatio(pool.ratio_a_numerator)}:${formatRatio(pool.ratio_b_denominator)}`;
}
```

## Session Storage Migration

Replace all localStorage calls:

```javascript
// OLD
localStorage.setItem('pools', JSON.stringify(pools));
const pools = JSON.parse(localStorage.getItem('pools') || '[]');

// NEW
sessionStorage.setItem('pools', JSON.stringify(pools));
const pools = JSON.parse(sessionStorage.getItem('pools') || '[]');
```

## Expandable UI Components

Use this pattern for all state displays:

```html
<div class="expandable-section">
  <button class="expand-toggle" onclick="toggleExpand('pool-state')">
    🔍 Pool State Data <span class="toggle-icon">▼</span>
  </button>
  <div id="pool-state" class="expandable-content hidden">
    <!-- All pool state fields here -->
  </div>
</div>
```

## Testing the Implementation

1. **Deploy with state generation:**
   ```bash
   ./scripts/remote_build_and_deploy.sh
   ```

2. **Verify state file created:**
   ```bash
   cat dashboard/state.json | jq '.metadata'
   ```

3. **Test state query independently:**
   ```bash
   npm run query-state
   ```

## Environment Reset Handling

When Solana test environment resets:
1. Deployment script detects reset
2. Query script generates new state.json
3. Dashboard loads fresh state on next startup
4. Session storage cleared automatically

## Next Steps

1. Implement the JavaScript updates listed in the requirements document
2. Create the HTML pages for liquidity and swap operations
3. Add CSS for expandable sections
4. Test the complete flow with pool creation and state updates

---

For complete implementation details, see `docs/DASHBOARD_UPGRADE_REQUIREMENTS.md` 