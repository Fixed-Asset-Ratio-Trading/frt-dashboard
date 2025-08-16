# Dashboard User Operations Only - Security Architecture

**Fixed Ratio Trading - Dashboard Scope Definition**

## 🎯 **Critical Security Principle**

The dashboard has been **STRICTLY LIMITED** to user-level operations only. All owner operations have been **COMPLETELY REMOVED** and are handled by a separate CLI application.

**This separation ensures:**
- ✅ **No Owner Keypair Access**: Dashboard never handles owner private keys
- ✅ **Reduced Attack Surface**: No sensitive operations in web interface
- ✅ **Clear Responsibility**: Users vs. Owners have different interfaces
- ✅ **Enhanced Security**: Owner operations isolated from web environment

## 👥 **User Operations (Dashboard Supported)**

### **1. 🪙 Token Creation (Testnet Only)**
- **Purpose**: Create test tokens for experimentation
- **Network**: Testnet only (prevents mainnet spam)
- **User Control**: Full control over test token properties
- **API**: `POST /api/tokens/create`

### **2. 🏊 Pool Creation**
- **Purpose**: Create new fixed-ratio trading pools
- **User Control**: Set token pairs and initial ratios
- **Network**: Testnet and mainnet
- **API**: `POST /api/pools/create`

### **3. 💧 Liquidity Management**
- **Purpose**: Add/remove liquidity as regular user
- **Operations**: 
  - Add liquidity to earn LP tokens
  - Remove liquidity by burning LP tokens
- **API**: 
  - `POST /api/liquidity/add`
  - `POST /api/liquidity/remove`

### **4. 🔄 Token Swapping**
- **Purpose**: Execute trades at fixed ratios
- **Features**:
  - Calculate swap outputs
  - Execute swaps with slippage protection
- **API**:
  - `POST /api/swap/calculate` 
  - `POST /api/swap/execute`

### **5. 👀 Pool Viewing (Read-Only)**
- **Purpose**: Browse and search existing pools
- **Information Displayed**:
  - Pool details (tokens, ratios, liquidity)
  - **READ-ONLY**: Owner information, pause status, fee data
- **API**: 
  - `GET /api/pools`
  - `GET /api/pools/{id}`

## 🔑 **Owner Operations (CLI Application ONLY)**

### **Completely Removed from Dashboard:**

#### **💰 Fee Management**
- ❌ ~~Change fee rates~~ → CLI only
- ❌ ~~Withdraw collected fees~~ → CLI only
- ❌ ~~View fee withdrawal history~~ → CLI only
- **Dashboard**: Displays current fee rates and collected amounts (READ-ONLY)

#### **⏸️ System Controls**
- ❌ ~~Emergency pause system~~ → CLI only
- ❌ ~~Unpause system~~ → CLI only
- ❌ ~~Pool pause/unpause~~ → CLI only
- **Dashboard**: Displays current pause status (READ-ONLY)

#### **🔧 Pool Management**
- ❌ ~~Change pool parameters~~ → CLI only
- ❌ ~~Pause specific pools~~ → CLI only
- ❌ ~~Security operations~~ → CLI only
- **Dashboard**: Displays pool owner and status (READ-ONLY)

## 📊 **Data Display vs. Operations**

### **Read-Only Display (Dashboard)**
The dashboard **DISPLAYS** but **CANNOT MODIFY**:

```csharp
// Pool Model - Owner fields marked as READ-ONLY
public class Pool 
{
    // READ-ONLY: Dashboard displays but cannot modify
    public string Owner { get; set; }                    // Pool owner address
    public bool IsPaused { get; set; }                   // Pool pause status
    public bool SwapsPaused { get; set; }               // Swap pause status
    public ulong CollectedFeesTokenA { get; set; }      // Collected fees
    public ulong SwapFeeBasisPoints { get; set; }       // Current fee rate
    
    // USER MODIFIABLE: Dashboard can interact with these
    public ulong TotalTokenALiquidity { get; set; }     // Via liquidity operations
    public ulong TotalTokenBLiquidity { get; set; }     // Via liquidity operations
}
```

### **Operations Separation**

| Operation Type | Dashboard | CLI App |
|---|---|---|
| **View Pool Data** | ✅ Full Access | ✅ Full Access |
| **Create Pools** | ✅ Yes | ❌ Not Needed |
| **Add/Remove Liquidity** | ✅ Yes | ❌ Not Needed |
| **Swap Tokens** | ✅ Yes | ❌ Not Needed |
| **Change Fees** | ❌ **REMOVED** | ✅ **CLI Only** |
| **Withdraw Fees** | ❌ **REMOVED** | ✅ **CLI Only** |
| **Pause/Unpause** | ❌ **REMOVED** | ✅ **CLI Only** |
| **System Controls** | ❌ **REMOVED** | ✅ **CLI Only** |

## 🔒 **Security Benefits**

### **Dashboard Security (User-Only)**
- **No Sensitive Operations**: Cannot access owner functions
- **No Keypair Storage**: Never handles owner private keys
- **Limited Scope**: Only user-level operations available
- **Web Safety**: Safe to expose via web interface

### **CLI Security (Owner-Only)**
- **Local Execution**: Runs locally with owner keypair
- **Full Control**: All owner operations available
- **Secure Environment**: Not exposed via web interface
- **Direct Blockchain**: No web vulnerabilities

## 🚫 **Removed Endpoints**

### **Completely Removed from Dashboard API:**

```typescript
// REMOVED - Owner Operations
❌ POST /api/fees/request-withdrawal
❌ POST /api/fees/execute-withdrawal  
❌ GET  /api/fees/available/{poolId}
❌ GET  /api/fees/history/{poolId}

❌ POST /api/system/pause
❌ POST /api/system/unpause
❌ GET  /api/system/upgrade-status

❌ GET  /fees/withdraw/{poolId}
❌ GET  /system/management

// REMOVED - Delegate System (deprecated)
❌ POST /api/delegates/add
❌ POST /api/delegates/remove
❌ GET  /api/delegates/{poolId}
❌ POST /api/delegates/configure-limits
```

### **Remaining User Endpoints:**

```typescript
// USER OPERATIONS - Still Available
✅ GET  /api/pools                    // View all pools
✅ GET  /api/pools/{id}              // View pool details
✅ POST /api/pools/create            // Create new pool

✅ POST /api/tokens/create           // Create test token (testnet)
✅ GET  /api/tokens                  // Get available tokens

✅ POST /api/liquidity/add           // Add liquidity
✅ POST /api/liquidity/remove        // Remove liquidity
✅ GET  /api/liquidity/balance/{poolId}/{user}

✅ POST /api/swap/calculate          // Calculate swap
✅ POST /api/swap/execute            // Execute swap

✅ GET  /health                      // System health
✅ GET  /system/status               // Read-only system status
```

## 📋 **Implementation Checklist**

### **Completed Removals:**
- [x] **PoolTransaction enum**: Removed owner operation types
- [x] **Postman Collections**: Removed all owner operation sections
- [x] **Pool Model**: Marked owner fields as READ-ONLY
- [x] **SystemState Model**: Marked as READ-ONLY for dashboard
- [x] **API Documentation**: Updated to user operations only

### **Architecture Validation:**
- [x] **No Owner Keypairs**: Dashboard never accesses owner keys
- [x] **No Owner Operations**: All removed from codebase
- [x] **Clear Separation**: User vs. owner operations distinct
- [x] **Security Boundary**: Web interface isolated from sensitive operations

---

**Result**: The dashboard is now a **USER-ONLY INTERFACE** that provides a safe, limited-scope web environment for regular trading operations, while keeping all sensitive owner operations in a secure CLI application. 