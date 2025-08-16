# Token Pair Display Design Pattern
**Fixed Ratio Trading Dashboard - UX Design Document**

## 🎯 **Core Principle: User-Centric Display**

**Problem**: Lexicographic normalization (MST/TS) prioritizes technical consistency but confuses users who think in terms of exchange rates.

**Solution**: Always display the "base token" (ratio = 1) first, with clear exchange rate calculations.

## 📊 **Display Algorithm**

### **🧠 Critical Understanding: Interpreting Stored Ratios**

**IMPORTANT**: The stored ratio represents:
> **"ratio units of TokenA per 1 unit of TokenB"**

**Example**: If ratio is 10000, this means "10000 TokenA per 1 TokenB"
- Many TokenA needed → TokenB is more valuable → TokenB should be base token
- Display as: **"1 TokenB = 10,000 TokenA"**

### **Step 1: Calculate Exchange Rates**
```javascript
// CRITICAL: Understand what the stored ratio represents
const tokensA_per_tokenB = ratio;  // How many A per B
const tokensB_per_tokenA = 1 / ratio;  // How many B per A
```

### **Step 2: Determine Base Token (Logical Decision Tree)**
```javascript
function determineDisplayOrder(tokenASymbol, tokenBSymbol, ratio) {
    // Calculate what the stored ratio means
    const tokensA_per_tokenB = ratio;
    const tokensB_per_tokenA = 1 / ratio;
    
    if (tokensA_per_tokenB >= 1.0) {
        // Many TokenA per 1 TokenB → TokenB is more valuable → TokenB is base
        return {
            baseToken: tokenBSymbol,
            quoteToken: tokenASymbol,
            exchangeRate: tokensA_per_tokenB,
            displayAs: `${tokenBSymbol}/${tokenASymbol}`,
            rateText: `1 ${tokenBSymbol} = ${tokensA_per_tokenB.toFixed(2)} ${tokenASymbol}`
        };
    } else {
        // Many TokenB per 1 TokenA → TokenA is more valuable → TokenA is base
        return {
            baseToken: tokenASymbol,
            quoteToken: tokenBSymbol,
            exchangeRate: tokensB_per_tokenA,
            displayAs: `${tokenASymbol}/${tokenBSymbol}`,
            rateText: `1 ${tokenASymbol} = ${tokensB_per_tokenA.toFixed(2)} ${tokenBSymbol}`
        };
    }
}
```

### **Step 3: Worked Examples**

#### **Example 1: TS/MST Pool (User Created: 1 TS = 10,000 MST)**
- **Storage**: MST=TokenA, TS=TokenB, ratio=10000
- **Calculation**: `tokensA_per_tokenB = 10000`
- **Logic**: `10000 >= 1.0` → TS is more valuable → TS is base token
- **Display**: **"1 TS = 10,000.00 MST"** ✅

#### **Example 2: BTC/USDC Pool (User Created: 1 BTC = 50,000 USDC)**
- **Storage**: BTC=TokenA, USDC=TokenB, ratio=0.00002
- **Calculation**: `tokensA_per_tokenB = 0.00002`
- **Logic**: `0.00002 < 1.0` → BTC is more valuable → BTC is base token  
- **Display**: **"1 BTC = 50,000.00 USDC"** ✅

## 🚨 **Common Pitfalls & Debugging**

### **❌ Mistake 1: Misinterpreting the Ratio Direction**
```javascript
// WRONG - Thinking ratio means "how many B per A"
const ratioA_to_B = 1 / ratio;  // This is backwards!

// CORRECT - Understanding ratio means "how many A per B"  
const tokensA_per_tokenB = ratio;  // This is right!
```

### **❌ Mistake 2: Confusing Which Token is More Valuable**
- **High ratio (10000:1)** = Many TokenA per TokenB = **TokenB is MORE valuable**
- **Low ratio (1:10000)** = Few TokenA per TokenB = **TokenA is MORE valuable**

### **🛠️ Debug Methodology**
1. **Check the stored ratio**: What does the `ratio` value represent?
2. **Calculate the meaning**: How many TokenA per TokenB?
3. **Apply logic**: Which token requires fewer units? That's the base token.
4. **Verify with user intent**: Does the result match what the user originally created?

### **🔄 Decision Flowchart**
```
Given: ratio (e.g., 10000)
   ↓
Calculate: tokensA_per_tokenB = ratio
   ↓
Question: Is tokensA_per_tokenB >= 1.0?
   ↓                                    ↓
  YES                                  NO
   ↓                                    ↓
Many TokenA per TokenB              Few TokenA per TokenB
   ↓                                    ↓
TokenB is more valuable             TokenA is more valuable
   ↓                                    ↓
Base = TokenB                       Base = TokenA
Quote = TokenA                      Quote = TokenB
   ↓                                    ↓
Display: "1 TokenB = X TokenA"      Display: "1 TokenA = Y TokenB"
```

### **📊 Visual Examples**

| Technical Storage | User Display | Exchange Rate          | Debug Logic                       |
|-------------------|--------------|------------------------|-----------------------------------|
| MST/TS (10000)    | **TS/MST**   | 1 TS = 10,000.00 MST   | 10000 MST per TS → TS valuable    |
| USDC/BTC (0.00002) | **BTC/USDC** | 1 BTC = 50,000.00 USDC | 0.00002 BTC per USDC → BTC valuable |
| SOL/mSOL (1000)   | **mSOL/SOL** | 1 mSOL = 1,000.00 SOL  | 1000 SOL per mSOL → mSOL valuable |

## 🎨 **UI/UX Guidelines**

### **Display Hierarchy**
1. **Primary**: Base token (always ratio = 1)
2. **Secondary**: Quote token (calculated ratio with 2 decimals)
3. **Rate Format**: `1 BASE = X.XX QUOTE`

### **Visual Indicators**
- **Bold** the base token symbol
- Use **larger font** for base token
- Show exchange rate prominently
- Use consistent color coding

### **Edge Cases**
- **Equal Ratio (1:1)**: Use alphabetical order as tiebreaker
- **Very Large Numbers**: Use scientific notation (1.23e6)
- **Very Small Numbers**: Show more decimals (0.000123)

## 📱 **Implementation Areas**

### **Dashboard Components**
1. **Pool Cards** (`dashboard.js`)
   - Pool title: "TS/MST Pool"
   - Exchange rate: "1 TS = 10,000.00 MST"
   - Liquidity display order

2. **Pool Creation** (`pool-creation.js`)
   - Token selection display
   - Pool summary preview
   - Ratio input labeling

3. **Liquidity Management** (`liquidity.js`)
   - Pool information header
   - Token balance displays
   - Add liquidity forms

4. **Pool Success** (`pool-success.html`)
   - Pool creation confirmation
   - Final pool details

## 🔧 **Technical Implementation**

### **Core Function**
```javascript
// File: dashboard/utils.js (new file)
function getDisplayTokenOrder(pool) {
    const ratioA_to_B = pool.ratio;
    
    if (ratioA_to_B >= 1.0) {
        return {
            baseToken: pool.tokenBSymbol,
            quoteToken: pool.tokenASymbol,
            baseLiquidity: pool.tokenBLiquidity,
            quoteLiquidity: pool.tokenALiquidity,
            exchangeRate: ratioA_to_B,
            displayPair: `${pool.tokenBSymbol}/${pool.tokenASymbol}`,
            rateText: `1 ${pool.tokenBSymbol} = ${ratioA_to_B.toFixed(2)} ${pool.tokenASymbol}`
        };
    } else {
        const ratioB_to_A = 1 / pool.ratio;
        return {
            baseToken: pool.tokenASymbol,
            quoteToken: pool.tokenBSymbol,
            baseLiquidity: pool.tokenALiquidity,
            quoteLiquidity: pool.tokenBLiquidity,
            exchangeRate: ratioB_to_A,
            displayPair: `${pool.tokenASymbol}/${pool.tokenBSymbol}`,
            rateText: `1 ${pool.tokenASymbol} = ${ratioB_to_A.toFixed(2)} ${pool.tokenBSymbol}`
        };
    }
}
```

### **Backward Compatibility**
- Pool creation logic remains unchanged
- Lexicographic normalization still used for PDAs
- Only display layer affected

## 📋 **Benefits**

1. **Intuitive**: Users see "1 BTC = 50,000 USDC" not "50,000 USDC = 1 BTC"
2. **Consistent**: Base token always has ratio 1.00
3. **Clear**: Exchange rates are immediately understandable
4. **Professional**: Matches standard trading interfaces

## 🚀 **Implementation Priority**

1. **High**: Pool cards in main dashboard
2. **High**: Pool creation summary
3. **Medium**: Liquidity management displays
4. **Low**: Success page confirmations

## 📝 **Future Considerations**

- **Price Feeds**: Integration with external price oracles
- **Formatting**: Internationalization for different number formats
- **Responsive**: Mobile-optimized display patterns
- **Accessibility**: Screen reader friendly descriptions

## ✅ **Implementation Validation**

### **Test Cases for Verification**
```javascript
// Test Case 1: High-value base token (like TS in TS/MST)
const test1 = getDisplayTokenOrder({
    tokenASymbol: 'MST', tokenBSymbol: 'TS',
    ratio: 10000
});
// Expected: baseToken='TS', rateText='1 TS = 10,000.00 MST'

// Test Case 2: Low-value base token (like USDC in BTC/USDC)  
const test2 = getDisplayTokenOrder({
    tokenASymbol: 'BTC', tokenBSymbol: 'USDC',
    ratio: 0.00002
});
// Expected: baseToken='BTC', rateText='1 BTC = 50,000.00 USDC'

// Test Case 3: Equal ratio (edge case)
const test3 = getDisplayTokenOrder({
    tokenASymbol: 'USDC', tokenBSymbol: 'USDT',
    ratio: 1
});
// Expected: baseToken='USDT' (reverse logic), rateText='1 USDT = 1.00 USDC'
```

### **Quick Validation Questions**
- ❓ Does your displayed exchange rate match what the user originally entered?
- ❓ Is the base token (ratio = 1) the more valuable token?
- ❓ Does the pair ordering make intuitive sense to traders?
- ❓ Are large numbers formatted appropriately (10K not 10000.00)?

---

**Note**: This design pattern improves user experience while maintaining technical integrity of the underlying normalization system. The key insight is understanding that stored ratios represent "TokenA per TokenB" relationships, not display relationships. 