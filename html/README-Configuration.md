# Dashboard Configuration

## 🔐 SECURITY ARCHITECTURE (UPDATED)

### Dashboard Scope: User Operations Only

**IMPORTANT:** Following security upgrades, the HTML dashboard has been **STRICTLY LIMITED** to user-level operations only. This ensures:

- ✅ **No Owner Keypair Access**: Dashboard never handles owner private keys
- ✅ **Reduced Attack Surface**: No sensitive operations in web interface  
- ✅ **Clear Responsibility**: Users vs. Owners have different interfaces
- ✅ **Enhanced Security**: Owner operations isolated from web environment

### Supported Operations

**✅ Dashboard Supports (User Authority):**
- **Pool Creation**: Create new fixed-ratio trading pools
- **Liquidity Management**: Add/remove liquidity as regular user
- **Token Swapping**: Execute trades at fixed ratios
- **Token Creation**: Create test tokens (testnet only)
- **Pool Viewing**: Browse and search existing pools (read-only)

**❌ Dashboard Does NOT Support (Owner Authority - CLI Only):**
- **System Pause/Unpause**: Emergency system controls
- **Fee Management**: Change fee rates and withdraw collected fees
- **Pool Management**: Pause/unpause individual pools
- **Security Operations**: All operations requiring owner keypair

### Security Features

1. **Configuration Validation**: Dashboard validates security mode on startup
2. **Error Handling**: Enhanced error messages for security restrictions
3. **Read-Only System State**: System information displayed as read-only
4. **Operation Blocking**: Automatic blocking of owner operations with clear messages

### For Owner Operations

Use the separate CLI application for all owner-level operations. The dashboard will display clear error messages if restricted operations are attempted.

---

## Centralized Configuration

All Fixed Ratio Trading dashboard JavaScript files now use a centralized configuration system for easy maintenance.

### Configuration File

**Location**: `dashboard/config.js`

This file contains all shared configuration values:

```javascript
window.TRADING_CONFIG = {
    rpcUrl: 'https://vmdevbox1.dcs1.cc',
    programId: '4aeVqtWhrUh6wpX8acNj2hpWXKEQwxjA3PYb2sHhNyCn',
    commitment: 'confirmed',
    refreshInterval: 10000,
    poolStateSeedPrefix: 'pool_state',
    expectedWallet: '5GGZiMwU56rYL1L52q7Jz7ELkSN4iYyQqdv418hxPh6t',
    version: '1.0.0',
    lastUpdated: '2024-01-15'
};
```

### Usage in JavaScript Files

All JavaScript files now reference the global `CONFIG` object:

```javascript
// Initialize Solana connection
connection = new solanaWeb3.Connection(CONFIG.rpcUrl, CONFIG.commitment);

// Get program ID
const programId = new solanaWeb3.PublicKey(CONFIG.programId);
```

### Files Using Centralized Configuration

- ✅ `dashboard.js` - Main dashboard
- ✅ `pool-creation.js` - Pool creation interface  
- ✅ `liquidity.js` - Liquidity management
- ✅ `token-creation.js` - Token creation interface

### HTML Files Updated

All HTML files now include `config.js` before their respective JavaScript files:

- ✅ `index.html`
- ✅ `pool-creation.html`
- ✅ `liquidity.html`
- ✅ `token-creation.html`

## Changing Configuration

### To Change RPC Endpoint

Edit only `dashboard/config.js`:

```javascript
window.TRADING_CONFIG = {
    rpcUrl: 'https://your-new-endpoint.com',  // ← Change this line only
    // ... rest of config unchanged
};
```

### To Change Program ID

Edit only `dashboard/config.js`:

```javascript
window.TRADING_CONFIG = {
    programId: 'YourNewProgramIdHere',  // ← Change this line only
    // ... rest of config unchanged
};
```

### To Change Both

Edit only `dashboard/config.js`:

```javascript
window.TRADING_CONFIG = {
    rpcUrl: 'https://your-new-endpoint.com',
    programId: 'YourNewProgramIdHere',
    // ... rest of config unchanged
};
```

## Benefits

✅ **Single source of truth** - Change one file to update all dashboards
✅ **No more inconsistencies** - All files use same configuration  
✅ **Easy maintenance** - Update endpoint/program ID in one place
✅ **Version control** - Track configuration changes in one file
✅ **Error reduction** - No more forgetting to update one file

## Backward Compatibility

The configuration system maintains backward compatibility by aliasing:

```javascript
window.CONFIG = window.TRADING_CONFIG;
```

This means existing code using `CONFIG` will continue to work. 