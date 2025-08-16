# Dashboard Upgrade Requirements for Fixed Ratio Trading Smart Contract

## Overview

This document outlines all work required to upgrade the dashboard HTML and JavaScript files to support updates to the fixed ratio trading smart contract, including implementation of a Program Account Query script for state data management.

## 1. State Data Management Changes

### 1.1 Remove Persistent Local Storage

**Current:** Dashboard uses persistent browser local storage  
**New:** Implement session-only storage that clears when browser closes

**Implementation:**
- Replace all `localStorage` calls with `sessionStorage`
- Remove any localStorage persistence logic
- Clear sessionStorage on page unload if needed

### 1.2 JSON State File System

**Create a Program Account Query script to generate `.json` file with all smart contract state**

Script should query and export:
- All pool states (`PoolState` struct data)
- Main treasury state (`MainTreasuryState` struct data)  
- System state (`SystemState` struct data)

JSON file loaded on dashboard startup instead of reading from local storage  
Script integrated into `remote_build_and_deploy.sh` to run after deployment

### 1.3 Hybrid State Management

- **On startup:** Load all state from generated `.json` file
- **During session:** Store new pools created in sessionStorage alongside loaded data
- **On browser close:** All session data is cleared

## 2. Pool Display Updates

### 2.1 Pool Listing Format

Display all pools by token pairs with ratios

**Special handling for One-to-many ratio pools (when flags bit 0 is set):**
- Place token with value 1 (excluding decimals) first
- Ignore normalization for these pools
- Example: `USDT/SOL 1002:1` → Display as `SOL/USDT 1:1002`

**Standard pools:** Keep normalized display with fractions to 3 decimal places

Each pool entry shows:
- Token pair names
- Ratio display (using Phase 1.3 display rules)
- **Liquidity** button (navigates to liquidity.html)
- **Swap** button (navigates to swap.html)

### 2.3 Pool Display Rules Consistency

**Phase 1.3 display rules must be applied consistently across all pages:**
- **Main Dashboard**: Pool cards use enhanced display with One-to-many ratio handling
- **Liquidity Page**: Pool information section uses same display logic and flags interpretation
- **Swap Page**: Pool information section uses same display logic and flags interpretation

**Navigation Flow:**
- Dashboard → **Liquidity** button → `liquidity.html?pool={address}`
- Dashboard → **Swap** button → `swap.html?pool={address}`
- All pages maintain consistent pool display formatting and flag interpretation

### 2.2 Pool State Flags Interpretation

Implement bitwise flag checking for pool features:
- **Bit 0 (1):** One-to-many ratio configuration
- **Bit 1 (2):** Liquidity operations paused
- **Bit 2 (4):** Swap operations paused
- **Bit 3 (8):** Withdrawal protection active
- **Bit 4 (16):** Single LP token mode (future feature)

## 3. Liquidity Page Updates

### 3.1 Liquidity Operations Interface

- Add liquidity form with token amount inputs
- Remove liquidity form with LP token amount inputs
- Display current pool liquidity levels
- Show LP token balances for connected wallet

### 3.2 Pool State Display (Expandable Debug Section)

Display **ALL** `PoolState` struct fields in an expandable section:

#### Basic Pool Information:
- `owner`: Pool owner public key
- `token_a_mint`: Token A mint address
- `token_b_mint`: Token B mint address
- `token_a_vault`: Token A vault address
- `token_b_vault`: Token B vault address
- `lp_token_a_mint`: LP Token A mint address
- `lp_token_b_mint`: LP Token B mint address

#### Ratio Configuration:
- `ratio_a_numerator`: Token A ratio numerator
- `ratio_b_denominator`: Token B ratio denominator

#### Liquidity Information:
- `total_token_a_liquidity`: Total Token A in pool
- `total_token_b_liquidity`: Total Token B in pool

#### Bump Seeds:
- `pool_authority_bump_seed`
- `token_a_vault_bump_seed`
- `token_b_vault_bump_seed`
- `lp_token_a_mint_bump_seed`
- `lp_token_b_mint_bump_seed`

#### Pool Flags:
- `flags`: Display as binary and decode each bit

#### Fee Configuration:
- `contract_liquidity_fee`: SOL fee for liquidity operations (lamports)
- `swap_contract_fee`: SOL fee for swap operations (lamports)

#### Token Fee Tracking:
- `collected_fees_token_a`: Accumulated Token A fees
- `collected_fees_token_b`: Accumulated Token B fees
- `total_fees_withdrawn_token_a`: Total Token A fees withdrawn
- `total_fees_withdrawn_token_b`: Total Token B fees withdrawn

#### SOL Fee Tracking:
- `collected_liquidity_fees`: SOL fees from liquidity operations
- `collected_swap_contract_fees`: SOL fees from swap operations
- `total_sol_fees_collected`: Lifetime SOL fees collected

#### Consolidation Data:
- `last_consolidation_timestamp`: Last consolidation time
- `total_consolidations`: Number of consolidations
- `total_fees_consolidated`: Total SOL fees consolidated

## 4. Swap Page Updates

### 4.1 Swap Interface

- Token selection dropdowns (auto-populated from pool)
- Amount input field
- Display exchange rate based on pool ratio
- Show expected output amount
- Swap direction toggle button

### 4.2 Pool State Display

Same expandable debug section as liquidity page showing all `PoolState` fields

## 5. Main Dashboard Updates

### 5.1 Treasury State Display (Expandable Section)

Display **ALL** `MainTreasuryState` fields:

#### Balance Information:
- `total_balance`: Current SOL balance
- `rent_exempt_minimum`: Minimum balance requirement
- `total_withdrawn`: Total SOL withdrawn by authority

#### Operation Counters:
- `pool_creation_count`: Number of pools created
- `liquidity_operation_count`: Number of liquidity operations
- `regular_swap_count`: Number of regular swaps
- `treasury_withdrawal_count`: Number of treasury withdrawals
- `failed_operation_count`: Number of failed operations

#### Fee Totals:
- `total_pool_creation_fees`: Total fees from pool creation
- `total_liquidity_fees`: Total fees from liquidity operations
- `total_regular_swap_fees`: Total fees from regular swaps
- `total_swap_contract_fees`: Total swap contract fees

#### Consolidation Information:
- `last_update_timestamp`: Last update time
- `total_consolidations_performed`: Number of consolidations
- `last_consolidation_timestamp`: Last consolidation time

### 5.2 System State Display (Expandable Section)

Display **ALL** `SystemState` fields:
- `is_paused`: Global pause status
- `pause_timestamp`: When system was paused
- `pause_reason_code`: Reason code with decoded meaning

## 6. Program Account Query Script Requirements

### 6.1 Script Functionality

- Query all program accounts for pools, treasury, and system state
- Serialize data to JSON format
- Save to predefined location for dashboard loading
- Handle errors gracefully with appropriate logging

### 6.2 Integration with Deployment

- Add script execution to `remote_build_and_deploy.sh`
- Run after successful smart contract deployment
- Ensure JSON file is created before dashboard can be accessed

### 6.3 Reset Handling

- Script should detect Solana test environment resets
- Clear/recreate JSON file when reset detected
- Provide clean state for fresh deployments

## 7. Technical Implementation Tasks

### 7.1 JavaScript Updates

- [ ] Refactor state management from localStorage to sessionStorage
- [ ] Implement JSON file loading on startup
- [ ] Add pool ratio display logic with One-to-many handling
- [ ] Create expandable UI components for state display
- [ ] Implement bitwise flag decoding for pool states
- [ ] Add proper error handling for state loading failures

### 7.2 HTML Updates

- [ ] Create liquidity page with all required elements
- [ ] Create swap page with all required elements
- [ ] Update main dashboard with expandable state sections
- [ ] Add CSS for expandable/collapsible sections
- [ ] Ensure responsive design for all new elements

### 7.3 Program Account Query Script

- [ ] Create script using appropriate Solana SDK
- [ ] Implement account filtering for program-owned accounts
- [ ] Add JSON serialization for all state structures
- [ ] Include error handling and logging
- [ ] Test with various pool configurations

### 7.4 Deployment Script Updates

- [ ] Modify `remote_build_and_deploy.sh` to execute query script
- [ ] Add checks for successful JSON generation
- [ ] Include cleanup for old state files
- [ ] Add logging for debugging deployment issues

## 8. Testing Requirements

### 8.1 State Management Tests

- Verify sessionStorage properly replaces localStorage
- Test JSON file loading on various browsers
- Confirm state persistence during session
- Verify state clearing on browser close

### 8.2 Display Tests

- Test One-to-many ratio display logic
- Verify all pool state fields display correctly
- Test expandable sections functionality
- Confirm proper number formatting (3 decimal places)

### 8.3 Integration Tests

- Test full deployment flow with state generation
- Verify dashboard loads with generated JSON
- Test pool creation and state updates
- Confirm proper handling of Solana environment resets

## 9. Implementation Priority

### Phase 1: Core Infrastructure
1. Create Program Account Query script
2. Integrate script with deployment process
3. Update state management from localStorage to sessionStorage

### Phase 2: UI Updates
1. Update pool listing with One-to-many logic
2. Create expandable state display components
3. Update main dashboard with treasury/system state

### Phase 3: Page Development
1. Build liquidity page with full pool state display
2. Build swap page with full pool state display
3. Add proper navigation between pages

### Phase 4: Testing & Polish
1. Comprehensive testing across all browsers
2. Performance optimization
3. Error handling improvements
4. Documentation updates

## 10. Future Considerations

- Pool fee update functionality (when implemented in smart contract)
- Single LP token mode support (when bit 4 is utilized)
- Enhanced error recovery mechanisms
- Performance optimization for large numbers of pools
- Real-time state synchronization options

---

**Note:** This upgrade maintains backward compatibility while introducing new features and improving state management efficiency. All changes are designed to work seamlessly with the existing smart contract architecture. 