# TokenPairRatio Developer Guide
## Fixed Ratio Trading System - Mathematics and Implementation

**File:** `docs/TOKEN_PAIR_RATIO_DEVELOPER_GUIDE.md`  
**Purpose:** Comprehensive guide for developers working with Fixed Ratio Trading calculations  
**Target Audience:** Developers implementing or maintaining Fixed Ratio Trading systems  
**Last Updated:** 2025-01-28

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Fixed Ratio Trading Concepts](#fixed-ratio-trading-concepts)
3. [TokenPairRatio Class](#tokenpairratio-class)
4. [Mathematical Foundation](#mathematical-foundation)
5. [Usage Examples](#usage-examples)
6. [Common Pitfalls](#common-pitfalls)
7. [Best Practices](#best-practices)
8. [Integration Guide](#integration-guide)

---

## 🎯 Overview

The `TokenPairRatio` class is the **single source of truth** for all ratio calculations in the Fixed Ratio Trading system. It handles the complex mathematics required when dealing with tokens that have:

- **Different decimal places** (e.g., SOL has 9 decimals, USDT has 6 decimals)
- **Varying ratios** (e.g., 1 SOL = 160 USDT, or 1 TS = 10,000 MST)
- **Basis points storage** (ratios stored as integers for precision)

This guide explains the mathematical concepts and provides practical examples for developers.

---

## 🔢 Fixed Ratio Trading Concepts

### What is Fixed Ratio Trading?

Fixed Ratio Trading is a trading system where **two tokens are exchanged at a predetermined, unchanging ratio**. Unlike traditional AMMs (Automated Market Makers) where prices fluctuate based on supply and demand, Fixed Ratio Trading maintains a constant exchange rate.

### Key Components

1. **Token Pair**: Two tokens that can be exchanged (e.g., SOL/USDT)
2. **Fixed Ratio**: The unchanging exchange rate (e.g., 1 SOL = 160 USDT)
3. **Basis Points**: Ratios stored as integers for precision (e.g., 160,000 basis points = 160.0)
4. **Token Decimals**: Each token's decimal precision (e.g., SOL = 9 decimals, USDT = 6 decimals)

### Example Scenario

```
Pool: SOL/USDT
Ratio: 1 SOL = 160 USDT
SOL Decimals: 9
USDT Decimals: 6
Basis Points: 160,000 (160 * 1000 for precision)
```

---

## 🏗️ TokenPairRatio Class

### Class Structure

```javascript
class TokenPairRatio {
    constructor(tickerA, ratioA, decimalA, tickerB, ratioB, decimalB)
    
    // Core calculation methods
    CalculateA(bAmountBasisPoints)     // B → A conversion
    CalculateB(aAmountBasisPoints)     // A → B conversion
    SwapAToB(aDisplayAmount)          // A → B (display units)
    SwapBToA(bDisplayAmount)          // B → A (display units)
    
    // Utility methods
    ADisplayToBasisPoints(displayAmount)
    BDisplayToBasisPoints(displayAmount)
    ABasisPointsToDisplay(basisPoints)
    BBasisPointsToDisplay(basisPoints)
    
    // Display methods
    NumberRatioDisplay()
    ExchangeDisplay()
    
    // Factory method
    static fromPoolData(poolData)
}
```

### Constructor Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `tickerA` | string | Token A symbol | "SOL" |
| `ratioA` | number | Token A ratio in basis points | 1000000 |
| `decimalA` | number | Token A decimal places | 9 |
| `tickerB` | string | Token B symbol | "USDT" |
| `ratioB` | number | Token B ratio in basis points | 160000000 |
| `decimalB` | number | Token B decimal places | 6 |

---

## 🧮 Mathematical Foundation

### Understanding Basis Points

**Basis points** are used to store ratios as integers, avoiding floating-point precision issues.

```javascript
// Example: 1 SOL = 160 USDT
// Stored as: 1,000,000 : 160,000,000 basis points
// This means: 1 SOL (1,000,000 basis points) = 160 USDT (160,000,000 basis points)

const ratioABasisPoints = 1000000;  // 1 SOL in basis points
const ratioBBasisPoints = 160000000; // 160 USDT in basis points
```

### Conversion Formulas

#### 1. Display Units to Basis Points
```javascript
basisPoints = displayAmount × 10^decimals
```

#### 2. Basis Points to Display Units
```javascript
displayAmount = basisPoints ÷ 10^decimals
```

#### 3. Token A to Token B Conversion
```javascript
// Given: amountA in basis points
// Formula: amountB = (amountA × ratioB) ÷ ratioA
amountB = Math.floor((amountA * ratioB) / ratioA);
```

#### 4. Token B to Token A Conversion
```javascript
// Given: amountB in basis points
// Formula: amountA = (amountB × ratioA) ÷ ratioB
amountA = Math.floor((amountB * ratioA) / ratioB);
```

### Why Use Math.floor()?

We use `Math.floor()` to ensure we never round up, preventing users from receiving more tokens than they should. This is critical for security and preventing arbitrage attacks.

---

## 💻 Usage Examples

### Example 1: Basic Token Pair Creation

```javascript
// Create a SOL/USDT pair where 1 SOL = 160 USDT
const solUsdtPair = new TokenPairRatio(
    "SOL",    // tickerA
    1000000,  // ratioA (1 SOL in basis points)
    9,        // decimalA (SOL has 9 decimals)
    "USDT",   // tickerB
    160000000, // ratioB (160 USDT in basis points)
    6         // decimalB (USDT has 6 decimals)
);

console.log(solUsdtPair.ExchangeDisplay());
// Output: "1 SOL = 160 USDT"
```

### Example 2: Calculate Expected Output for Swap

```javascript
// User wants to swap 2.5 SOL for USDT
const inputAmount = 2.5; // SOL
const expectedOutput = solUsdtPair.SwapAToB(inputAmount);

console.log(`Input: ${inputAmount} SOL`);
console.log(`Expected Output: ${expectedOutput} USDT`);
// Output: Input: 2.5 SOL
// Output: Expected Output: 400 USDT
```

### Example 3: Smart Contract Integration

```javascript
// For smart contract calls, we need basis points
const inputAmountDisplay = 2.5; // SOL
const inputBasisPoints = solUsdtPair.ADisplayToBasisPoints(inputAmountDisplay);
const expectedOutputBasisPoints = solUsdtPair.CalculateB(inputBasisPoints);

console.log(`Input basis points: ${inputBasisPoints}`);
console.log(`Expected output basis points: ${expectedOutputBasisPoints}`);
// Output: Input basis points: 2500000000
// Output: Expected output basis points: 400000000
```

### Example 4: Creating from Pool Data

```javascript
// Pool data from blockchain
const poolData = {
    tokenASymbol: "SOL",
    tokenBSymbol: "USDT",
    ratioANumerator: 1000000,    // 1 SOL in basis points
    ratioBDenominator: 160000000, // 160 USDT in basis points
    ratioADecimal: 9,            // SOL decimals
    ratioBDecimal: 6             // USDT decimals
};

const tokenPair = TokenPairRatio.fromPoolData(poolData);
console.log(tokenPair.getDebugInfo());
```

### Example 5: Complex Ratio with Different Decimals

```javascript
// Example: 1 TS = 10,000 MST
// TS has 6 decimals, MST has 9 decimals
const tsMstPair = new TokenPairRatio(
    "TS",      // tickerA
    1000000,   // ratioA (1 TS in basis points)
    6,         // decimalA (TS has 6 decimals)
    "MST",     // tickerB
    10000000000, // ratioB (10,000 MST in basis points)
    9          // decimalB (MST has 9 decimals)
);

// Swap 5 TS for MST
const inputTS = 5;
const outputMST = tsMstPair.SwapAToB(inputTS);
console.log(`${inputTS} TS = ${outputMST} MST`);
// Output: 5 TS = 50000 MST
```

---

## ⚠️ Common Pitfalls

### 1. Decimal Mismatch Errors

**Problem**: Using wrong decimal places for calculations
```javascript
// ❌ WRONG: Using display units directly
const wrongOutput = inputAmount * (ratioB / ratioA);

// ✅ CORRECT: Use TokenPairRatio class
const correctOutput = tokenPair.SwapAToB(inputAmount);
```

### 2. Precision Loss

**Problem**: Floating-point arithmetic causing precision loss
```javascript
// ❌ WRONG: Direct floating-point division
const ratio = 160.0 / 1.0; // May have floating-point errors

// ✅ CORRECT: Use basis points and integer arithmetic
const ratioABasisPoints = 1000000;
const ratioBBasisPoints = 160000000;
const amountB = Math.floor((amountA * ratioBBasisPoints) / ratioABasisPoints);
```

### 3. Rounding Errors

**Problem**: Rounding up instead of down
```javascript
// ❌ WRONG: Using Math.round() or Math.ceil()
const amountB = Math.round((amountA * ratioB) / ratioA);

// ✅ CORRECT: Always round down to prevent overpayment
const amountB = Math.floor((amountA * ratioB) / ratioA);
```

### 4. Missing Decimal Information

**Problem**: Not validating decimal information
```javascript
// ❌ WRONG: Assuming decimals
const tokenPair = new TokenPairRatio("SOL", 1000000, 9, "USDT", 160000000, 6);

// ✅ CORRECT: Validate from pool data
const tokenPair = TokenPairRatio.fromPoolData(poolData);
// This will throw an error if decimals are missing
```

---

## 🎯 Best Practices

### 1. Always Use TokenPairRatio Class

```javascript
// ✅ DO: Use the centralized class
const tokenPair = TokenPairRatio.fromPoolData(poolData);
const expectedOutput = tokenPair.SwapAToB(inputAmount);

// ❌ DON'T: Implement calculations manually
const expectedOutput = inputAmount * (poolData.ratioB / poolData.ratioA);
```

### 2. Validate Input Data

```javascript
// ✅ DO: Validate pool data before creating TokenPairRatio
if (!poolData.ratioADecimal || !poolData.ratioBDecimal) {
    throw new Error('Missing token decimal information');
}

const tokenPair = TokenPairRatio.fromPoolData(poolData);
```

### 3. Use Appropriate Methods

```javascript
// ✅ DO: Use display methods for UI
const displayOutput = tokenPair.SwapAToB(inputDisplayAmount);

// ✅ DO: Use basis points methods for smart contracts
const basisPointsOutput = tokenPair.CalculateB(inputBasisPoints);
```

### 4. Handle Edge Cases

```javascript
// ✅ DO: Handle zero amounts and validation
function calculateSwap(tokenPair, inputAmount) {
    if (inputAmount <= 0) {
        throw new Error('Input amount must be positive');
    }
    
    if (!tokenPair) {
        throw new Error('TokenPairRatio instance required');
    }
    
    return tokenPair.SwapAToB(inputAmount);
}
```

### 5. Log Calculations for Debugging

```javascript
// ✅ DO: Log important calculations
console.log('🔍 Swap Calculation Debug:');
console.log(`  Input: ${inputAmount} ${tokenPair.tickerA}`);
console.log(`  Ratio: ${tokenPair.ratioA}:${tokenPair.ratioB} basis points`);
console.log(`  Decimals: ${tokenPair.decimalA}:${tokenPair.decimalB}`);
console.log(`  Expected Output: ${expectedOutput} ${tokenPair.tickerB}`);
```

---

## 🔗 Integration Guide

### 1. Import the Class

```javascript
// In your JavaScript file
// The TokenPairRatio class is available in utils.js
// Make sure utils.js is loaded before your code
```

### 2. Create from Pool Data

```javascript
// Most common usage - create from blockchain pool data
const tokenPair = TokenPairRatio.fromPoolData(poolData);
```

### 3. Use in Swap Functions

```javascript
async function buildSwapTransaction(inputAmount, poolData) {
    const tokenPair = TokenPairRatio.fromPoolData(poolData);
    
    // Calculate expected output
    const expectedOutputDisplay = tokenPair.SwapAToB(inputAmount);
    const expectedOutputBasisPoints = tokenPair.BDisplayToBasisPoints(expectedOutputDisplay);
    
    // Use in smart contract call
    return {
        inputAmount: inputAmount,
        expectedOutput: expectedOutputBasisPoints,
        // ... other transaction data
    };
}
```

### 4. Use in UI Components

```javascript
function updateSwapPreview(inputAmount, poolData) {
    const tokenPair = TokenPairRatio.fromPoolData(poolData);
    
    // Calculate and display expected output
    const expectedOutput = tokenPair.SwapAToB(inputAmount);
    
    document.getElementById('expected-output').textContent = 
        `${expectedOutput} ${tokenPair.tickerB}`;
    
    // Show exchange rate
    document.getElementById('exchange-rate').textContent = 
        tokenPair.ExchangeDisplay();
}
```

---

## 🧪 Testing Examples

### Test Case 1: Basic Conversion

```javascript
// Test: 1 SOL = 160 USDT
const pair = new TokenPairRatio("SOL", 1000000, 9, "USDT", 160000000, 6);

// Test A → B
const output = pair.SwapAToB(1);
console.assert(output === 160, `Expected 160, got ${output}`);

// Test B → A
const output2 = pair.SwapBToA(160);
console.assert(output2 === 1, `Expected 1, got ${output2}`);
```

### Test Case 2: Different Decimals

```javascript
// Test: 1 TS = 10,000 MST (TS: 6 decimals, MST: 9 decimals)
const pair = new TokenPairRatio("TS", 1000000, 6, "MST", 10000000000, 9);

// Test A → B
const output = pair.SwapAToB(1);
console.assert(output === 10000, `Expected 10000, got ${output}`);

// Test with basis points
const inputBasisPoints = pair.ADisplayToBasisPoints(1);
const outputBasisPoints = pair.CalculateB(inputBasisPoints);
console.assert(outputBasisPoints === 10000000000, `Expected 10000000000, got ${outputBasisPoints}`);
```

---

## 📚 Additional Resources

- [Fixed Ratio Trading Overview](../README.md)
- [Pool Display Rules](./ONE_TO_MANY_POOL_DISPLAY_RULES.md)
- [UX Design Token Pair Display](./UX_DESIGN_TOKEN_PAIR_DISPLAY.md)

---

## 🤝 Contributing

When modifying the `TokenPairRatio` class:

1. **Add comprehensive tests** for new functionality
2. **Update this documentation** with new examples
3. **Validate edge cases** with different decimal combinations
4. **Test with real pool data** from the blockchain
5. **Ensure backward compatibility** with existing implementations

---

**Remember**: The `TokenPairRatio` class is the single source of truth for all ratio calculations. Always use this class instead of implementing calculations manually to ensure consistency and prevent errors.
