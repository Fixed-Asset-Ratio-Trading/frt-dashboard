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

### Configuration Files

**Main Config**: `html/config.json`  
**JS Loader**: `html/config.js`

The system uses a JSON configuration file (`config.json`) that is loaded by the JavaScript loader (`config.js`). This makes it easier to update configuration across environments.

#### Example config.json

```json
{
  "solana": {
    "rpcUrl": "http://192.168.2.88:8899",
    "wsUrl": "ws://192.168.2.88:8900",
    "commitment": "confirmed",
    "disableRetryOnRateLimit": true
  },
  "program": {
    "programId": "4aeVqtWhrUh6wpX8acNj2hpWXKEQwxjA3PYb2sHhNyCn",
    "poolStateSeedPrefix": "pool_state"
  },
  "metaplex": {
    "tokenMetadataProgramId": "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
    "candyMachineProgramId": "cndy3Z4yapfJBmL3ShUp5exZKqR3z33thTzeNMm2gRZ",
    "auctionHouseProgramId": "hausS13jsjafwWwGqZTUQRmWyvyxn9EQpqMwV1PBBmk",
    "lastUpdated": "2025-08-16",
    "deploymentType": "remote"
  },
  "wallets": {
    "expectedBackpackWallet": "5GGZiMwU56rYL1L52q7Jz7ELkSN4iYyQqdv418hxPh6t"
  },
  "dashboard": {
    "refreshInterval": 10000
  },
  "version": "1.0.0",
  "lastUpdated": "2025-08-16"
}
```

### Program IDs

The Fixed Ratio Trading program is deployed on multiple Solana networks with the following Program IDs:

| Network | Program ID |
|---------|------------|
| **LocalNet** | `4aeVqtWhrUh6wpX8acNj2hpWXKEQwxjA3PYb2sHhNyCn` |
| **DevNet** | `9iqh69RqeG3RRrFBNZVoE77TMRvYboFUtC2sykaFVzB7` |
| **MainNet** | `quXSYkeZ8ByTCtYY1J1uxQmE36UZ3LmNGgE3CYMFixD` |

### Usage in JavaScript Files

All JavaScript files reference the global `CONFIG` or `TRADING_CONFIG` object:

```javascript
// Initialize Solana connection
connection = new solanaWeb3.Connection(CONFIG.rpcUrl, CONFIG.commitment);

// Get program ID
const programId = new solanaWeb3.PublicKey(CONFIG.programId);
```

### Loading Process

1. The `config.js` file loads settings from `config.json`
2. It then creates the global `TRADING_CONFIG` object
3. For backward compatibility, it also creates an alias: `window.CONFIG = window.TRADING_CONFIG`

### Files Using Centralized Configuration

- ✅ `dashboard.js` - Main dashboard
- ✅ `pool-creation.js` - Pool creation interface  
- ✅ `liquidity.js` - Liquidity management
- ✅ `swap.js` - Token swapping interface
- ✅ `token-creation.js` - Token creation interface
- ✅ `data-service.js` - Data services and API handling

### HTML Files Updated

All HTML files include `config.js` before their respective JavaScript files:

- ✅ `index.html`
- ✅ `pool-creation.html`
- ✅ `liquidity.html`
- ✅ `swap.html`
- ✅ `token-creation.html`

## Changing Configuration

### To Change RPC Endpoint

Edit only `html/config.json`:

```json
{
  "solana": {
    "rpcUrl": "https://your-new-endpoint.com",  // ← Change this line only
    "wsUrl": "ws://your-new-endpoint.com", 
    "commitment": "confirmed",
    "disableRetryOnRateLimit": true
  },
  // ... rest of config unchanged
}
```

### To Change Program ID

Edit only `html/config.json` and use the appropriate Program ID for your target network:

```json
{
  "program": {
    "programId": "YourNewProgramIdHere",  // ← Change this line only
    "poolStateSeedPrefix": "pool_state"
  },
  // ... rest of config unchanged
}
```

### Network-Specific Program IDs

When deploying to different networks, use the corresponding Program ID:

- **LocalNet**: `4aeVqtWhrUh6wpX8acNj2hpWXKEQwxjA3PYb2sHhNyCn`
- **DevNet**: `9iqh69RqeG3RRrFBNZVoE77TMRvYboFUtC2sykaFVzB7`
- **MainNet**: `quXSYkeZ8ByTCtYY1J1uxQmE36UZ3LmNGgE3CYMFixD`

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