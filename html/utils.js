/**
 * Token Pair Display Utilities
 * User-friendly display patterns for Fixed Ratio Trading Dashboard
 */

/**
 * SIMPLE TOKEN DISPLAY CORRECTOR
 * If a token has precision value of 1 in the ratio, it comes first!
 * 
 * @param {string} tokenAName - Token A symbol/name
 * @param {string} tokenBName - Token B symbol/name  
 * @param {number} tokenARatio - Token A ratio value (numerator)
 * @param {number} tokenBRatio - Token B ratio value (denominator)
 * @param {number} tokenAPrecision - Token A decimal precision (optional)
 * @param {number} tokenBPrecision - Token B decimal precision (optional)
 * @returns {Object} Simple display configuration
 */
/**
 * LOGICAL TOKEN DISPLAY - Simplified and Universal
 * 
 * Based on SOLANA_BASIS_POINTS_AND_LOGICAL_RATIO_DISPLAY.md principles:
 * 1. Always show more valuable asset first (rates >= 1)
 * 2. Avoid confusing fractions like 0.001
 * 3. Convert basis points to display units properly
 * 4. Works for ALL pools, not just one-to-many
 */
function getCorrectTokenDisplay(tokenAName, tokenBName, tokenARatio, tokenBRatio, tokenAPrecision = 6, tokenBPrecision = 6, isOneToMany = false) {
    console.log('🔧 LOGICAL DISPLAY:', {
        tokenAName, tokenBName, tokenARatio, tokenBRatio, tokenAPrecision, tokenBPrecision
    });
    
    // Convert basis points to display units using token decimals
    const tokenADisplayUnits = tokenARatio / Math.pow(10, tokenAPrecision);
    const tokenBDisplayUnits = tokenBRatio / Math.pow(10, tokenBPrecision);
    
    console.log('🔧 BASIS POINTS CONVERSION:', {
        tokenABasisPoints: tokenARatio,
        tokenADecimals: tokenAPrecision,
        tokenADisplay: tokenADisplayUnits,
        tokenBBasisPoints: tokenBRatio,
        tokenBDecimals: tokenBPrecision,
        tokenBDisplay: tokenBDisplayUnits
    });
    
    // LOGICAL DISPLAY: Show more valuable asset first to avoid confusing fractions
    // Per SOLANA_BASIS_POINTS_AND_LOGICAL_RATIO_DISPLAY.md principles
    
    // Calculate both direction exchange rates
    const rate_A_to_B = tokenBDisplayUnits / tokenADisplayUnits;  // How much B for 1 A
    const rate_B_to_A = tokenADisplayUnits / tokenBDisplayUnits;  // How much A for 1 B
    
    // Show the direction that produces rates >= 1 (more valuable asset first)
    if (rate_A_to_B >= 1) {
        // A is more valuable: "1 A = X B"
        return {
            baseToken: tokenAName,
            quoteToken: tokenBName,
            displayPair: `${tokenAName}/${tokenBName}`,
            rateText: `1 ${tokenAName} = ${formatNumberWithCommas(rate_A_to_B)} ${tokenBName}`,
            exchangeRate: rate_A_to_B,
            isReversed: false
        };
    } else {
        // B is more valuable: "1 B = X A"
        return {
            baseToken: tokenBName,
            quoteToken: tokenAName,
            displayPair: `${tokenBName}/${tokenAName}`,
            rateText: `1 ${tokenBName} = ${formatNumberWithCommas(rate_B_to_A)} ${tokenAName}`,
            exchangeRate: rate_B_to_A,
            isReversed: true
        };
    }
}

/**
 * OVERRIDE FUNCTION: Use simple logic instead of complex getDisplayTokenOrder
 * 
 * @param {Object} pool - Pool data
 * @param {Object} tokenDecimals - Optional decimal info
 * @returns {Object} Corrected display configuration
 */
function getDisplayTokenOrderCorrected(pool, tokenDecimals = null) {
    // Extract data with fallbacks for different naming conventions
    const tokenAName = pool.tokenASymbol || 'Token A';
    const tokenBName = pool.tokenBSymbol || 'Token B';
    const tokenARatio = pool.ratioANumerator || pool.ratio_a_numerator || 1;
    const tokenBRatio = pool.ratioBDenominator || pool.ratio_b_denominator || 1;
    const tokenAPrecision = tokenDecimals?.tokenADecimals || 6;
    const tokenBPrecision = tokenDecimals?.tokenBDecimals || 6;
    
    console.log('🔧 USING CORRECTED DISPLAY LOGIC');
    
    const flags = interpretPoolFlags(pool);
    const result = getCorrectTokenDisplay(tokenAName, tokenBName, tokenARatio, tokenBRatio, tokenAPrecision, tokenBPrecision, flags.oneToManyRatio);
    
    // Add additional fields that the UI expects
    const getFormattedLiquidity = (rawAmount, isTokenA) => {
        if (tokenDecimals) {
            const decimals = isTokenA ? tokenDecimals.tokenADecimals : tokenDecimals.tokenBDecimals;
            return formatLiquidityAmount(rawAmount, decimals);
        }
        return formatLargeNumber(rawAmount);
    };
    
    return {
        baseToken: result.baseToken,
        quoteToken: result.quoteToken,
        displayPair: result.displayPair,
        rateText: result.rateText,
        exchangeRate: result.exchangeRate,
        baseLiquidity: result.isReversed 
            ? getFormattedLiquidity(pool.tokenBLiquidity || pool.total_token_b_liquidity || 0, false)
            : getFormattedLiquidity(pool.tokenALiquidity || pool.total_token_a_liquidity || 0, true),
        quoteLiquidity: result.isReversed
            ? getFormattedLiquidity(pool.tokenALiquidity || pool.total_token_a_liquidity || 0, true) 
            : getFormattedLiquidity(pool.tokenBLiquidity || pool.total_token_b_liquidity || 0, false),
        isReversed: result.isReversed,
        isOneToManyRatio: flags.oneToManyRatio
    };
}

/**
 * Get user-friendly display order for token pairs
 * NOW USES THE CORRECTED LOGIC!
 * 
 * @param {Object} pool - Pool data with ratioANumerator, ratioBDenominator, tokenASymbol, tokenBSymbol, flags, etc.
 * @param {Object} tokenDecimals - Optional object with tokenADecimals and tokenBDecimals for proper liquidity formatting
 * @returns {Object} Display configuration with base/quote tokens and exchange rates
 */
function getDisplayTokenOrder(pool, tokenDecimals = null) {
    // Use the corrected display logic
    return getDisplayTokenOrderCorrected(pool, tokenDecimals);
}

/**
 * Phase 1.3: Check if pool has One-to-many ratio flag (bit 0) set
 * 
 * @param {Object} pool - Pool data with flags or flagsDecoded
 * @returns {boolean} True if One-to-many ratio flag is set
 */
function checkOneToManyRatioFlag(pool) {
    // Check flagsDecoded first (from JSON state)
    if (pool.flagsDecoded && typeof pool.flagsDecoded.one_to_many_ratio === 'boolean') {
        return pool.flagsDecoded.one_to_many_ratio;
    }
    
    // Check raw flags field (bitwise check for bit 0)
    if (typeof pool.flags === 'number') {
        return (pool.flags & 1) !== 0; // Bit 0 (value 1)
    }
    
    return false;
}

/**
 * Phase 1.3: Pool State Flags Interpretation
 * 
 * @param {Object} pool - Pool data with flags
 * @returns {Object} Decoded flag information
 */
function interpretPoolFlags(pool) {
    const flags = pool.flags || 0;
    
    return {
        oneToManyRatio: (flags & 1) !== 0,        // Bit 0 (1): One-to-many ratio configuration
        liquidityPaused: (flags & 2) !== 0,       // Bit 1 (2): Liquidity operations paused
        swapsPaused: (flags & 4) !== 0,           // Bit 2 (4): Swap operations paused
        withdrawalProtection: (flags & 8) !== 0,   // Bit 3 (8): Withdrawal protection active
        singleLpTokenMode: (flags & 16) !== 0      // Bit 4 (16): Single LP token mode (future feature)
    };
}

/**
 * Phase 1.3: Format exchange rate for standard pools with 3 decimal places
 * 
 * @param {number} rate - Exchange rate to format
 * @returns {string} Formatted rate string with 3 decimal places
 */
function formatExchangeRateStandard(rate) {
    if (rate >= 1000000000) {
        // Use human readable format for very large numbers
        return `${(rate / 1000000000).toLocaleString('en-US', { maximumFractionDigits: 3 })}B`;
    } else if (rate >= 1000000) {
        // Use human readable format for millions
        return `${(rate / 1000000).toLocaleString('en-US', { maximumFractionDigits: 3 })}M`;
    } else if (rate >= 100) {
        // 3 decimal places for standard pools as per Phase 1.3 requirements
        return rate.toLocaleString('en-US', { 
            minimumFractionDigits: 3,
            maximumFractionDigits: 3
        });
    } else if (rate >= 1) {
        // 3 decimal places for normal numbers
        return rate.toLocaleString('en-US', { 
            minimumFractionDigits: 3,
            maximumFractionDigits: 3
        });
    } else if (rate >= 0.001) {
        // More decimal places for small numbers but minimum 3
        return rate.toLocaleString('en-US', { 
            minimumFractionDigits: 3,
            maximumFractionDigits: 6
        });
    } else {
        // Scientific notation for very small numbers
        return rate.toExponential(3);
    }
}

/**
 * Legacy format exchange rate function (maintained for compatibility)
 * 
 * @param {number} rate - Exchange rate to format
 * @returns {string} Formatted rate string
 */
function formatExchangeRate(rate) {
    if (rate >= 1000000000) {
        // Use human readable format for very large numbers
        return `${(rate / 1000000000).toLocaleString('en-US', { maximumFractionDigits: 2 })}B`;
    } else if (rate >= 1000000) {
        // Use human readable format for millions
        return `${(rate / 1000000).toLocaleString('en-US', { maximumFractionDigits: 2 })}M`;
    } else if (rate >= 100) {
        // No decimal places for large whole numbers
        return rate.toLocaleString('en-US', { 
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        });
    } else if (rate >= 1) {
        // 2 decimal places for normal numbers
        return rate.toLocaleString('en-US', { 
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    } else if (rate >= 0.01) {
        // More decimal places for small numbers
        return rate.toLocaleString('en-US', { 
            minimumFractionDigits: 4,
            maximumFractionDigits: 4
        });
    } else {
        // Scientific notation for very small numbers
        return rate.toExponential(2);
    }
}

/**
 * Get simplified display for pool creation/summary
 * Used during pool creation where we may not have full pool data
 * 
 * @param {string} tokenASymbol - Token A symbol
 * @param {string} tokenBSymbol - Token B symbol
 * @param {number} ratioANumerator - Ratio A numerator
 * @param {number} ratioBDenominator - Ratio B denominator
 * @returns {Object} Simplified display configuration
 */
function getSimpleDisplayOrder(tokenASymbol, tokenBSymbol, ratioANumerator, ratioBDenominator) {
    const mockPool = {
        tokenASymbol,
        tokenBSymbol,
        ratioANumerator,
        ratioBDenominator,
        tokenALiquidity: 0,
        tokenBLiquidity: 0
    };
    
    return getDisplayTokenOrder(mockPool);
}

/**
 * Format large numbers with appropriate units (K, M, B)
 * 
 * @param {number} num - Number to format
 * @returns {string} Formatted number string
 */
function formatLargeNumber(num) {
    if (num >= 1000000000) {
        return (num / 1000000000).toFixed(1) + 'B';
    } else if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    } else {
        return num.toLocaleString('en-US', { 
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        });
    }
}

/**
 * Format liquidity amounts accounting for token decimal precision
 * 
 * @param {number} rawAmount - Raw amount from blockchain (in smallest units)
 * @param {number} decimals - Token decimal places (default: 6)
 * @returns {string} Formatted amount string with units
 */
function formatLiquidityAmount(rawAmount, decimals = 6) {
    if (typeof rawAmount !== 'number' || isNaN(rawAmount) || rawAmount < 0) {
        return '0';
    }
    
    // Convert from raw units to human-readable amount
    const adjustedAmount = rawAmount / Math.pow(10, decimals);
    
    // Use formatLargeNumber for consistent formatting
    return formatLargeNumber(adjustedAmount);
}

/**
 * Get token decimals from mint address using RPC
 * 
 * @param {string} mintAddress - Token mint address
 * @param {Object} connection - Solana connection object
 * @returns {Promise<number>} Token decimals (defaults to 6 if fetch fails)
 */
async function getTokenDecimals(mintAddress, connection) {
    if (!connection || !mintAddress) {
        throw new Error(`Invalid parameters for getTokenDecimals: connection=${!!connection}, mintAddress=${mintAddress}`);
    }
    
    try {
        const mintInfo = await connection.getParsedAccountInfo(
            new solanaWeb3.PublicKey(mintAddress)
        );
        
        if (!mintInfo.value) {
            throw new Error(`Token mint account not found: ${mintAddress}`);
        }
        
        if (!mintInfo.value.data.parsed) {
            throw new Error(`Token mint account data not parsed: ${mintAddress}`);
        }
        
        const decimals = mintInfo.value.data.parsed.info.decimals;
        
        if (decimals === undefined || decimals === null) {
            throw new Error(`Token decimals not found in mint info: ${mintAddress}`);
        }
        
        console.log(`✅ Fetched decimals for token ${mintAddress}: ${decimals}`);
        return decimals;
        
    } catch (error) {
        console.error(`❌ Failed to fetch decimals for token ${mintAddress}:`, error);
        throw new Error(`Cannot determine token decimals for ${mintAddress}. This is required for safe transaction processing. Error: ${error.message}`);
    }
}

/**
 * Format numbers with commas (no abbreviations) - ideal for ratios and exact amounts
 * 
 * @param {number} num - Number to format
 * @returns {string} Formatted number string with commas
 */
function formatNumberWithCommas(num) {
    if (typeof num !== 'number' || isNaN(num)) {
        return '0';
    }
    
    return num.toLocaleString('en-US', { 
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    });
}

/**
 * Create user-friendly pool title
 * 
 * @param {Object} pool - Pool data
 * @returns {string} Formatted pool title
 */
function createPoolTitle(pool) {
    const display = getDisplayTokenOrder(pool);
    return `${display.baseToken}/${display.quoteToken} Pool`;
}

/**
 * Create user-friendly exchange rate display
 * 
 * @param {Object} pool - Pool data
 * @returns {string} Formatted exchange rate
 */
function createExchangeRateDisplay(pool) {
    const display = getDisplayTokenOrder(pool);
    return display.rateText;
}

// ========================================
// BASIS POINTS REFACTOR: CONVERSION UTILITIES
// ========================================

/**
 * **BASIS POINTS REFACTOR: Convert display units to basis points**
 * 
 * Converts user-friendly display amounts (like 1.0 SOL) to basis points
 * (smallest token units) that the smart contract expects. This is the core
 * conversion function that all pool creation and swap operations must use.
 * 
 * @param {number} displayAmount - Amount in display units (e.g., 1.5)
 * @param {number} decimals - Token decimal places (e.g., 9 for SOL)
 * @returns {number} Amount in basis points (e.g., 1500000000000000000 for 1.5 SOL)
 * 
 * @example
 * // Converting 1.5 USDC (6 decimals) to basis points
 * const basisPoints = displayToBasisPoints(1.5, 6); // Returns 1,500,000
 * 
 * // Converting 0.001 BTC (8 decimals) to basis points  
 * const basisPoints = displayToBasisPoints(0.001, 8); // Returns 100,000
 * 
 * // Converting 1.0 SOL (9 decimals) to basis points
 * const basisPoints = displayToBasisPoints(1.0, 9); // Returns 1,000,000,000
 */
function displayToBasisPoints(displayAmount, decimals) {
    if (typeof displayAmount !== 'number' || isNaN(displayAmount) || displayAmount < 0) {
        throw new Error(`Invalid display amount: ${displayAmount}. Must be a positive number.`);
    }
    
    if (typeof decimals !== 'number' || !Number.isInteger(decimals) || decimals < 0 || decimals > 9) {
        throw new Error(`Invalid decimals: ${decimals}. Must be an integer between 0 and 9.`);
    }
    
    const factor = Math.pow(10, decimals);
    const exactCalculation = displayAmount * factor;
    const basisPoints = Math.round(exactCalculation);
    
    // Debug log when rounding occurs (helps track precision fixes)
    if (Math.abs(exactCalculation - basisPoints) > 0.001) {
        console.log(`🔧 ROUNDING APPLIED: ${exactCalculation} → ${basisPoints} (diff: ${Math.abs(exactCalculation - basisPoints)})`);
    }
    
    console.log(`🔧 BASIS POINTS CONVERSION: ${displayAmount} (display) → ${basisPoints} (basis points) [${decimals} decimals]`);
    
    return basisPoints;
}

/**
 * **BASIS POINTS REFACTOR: Convert basis points to display units**
 * 
 * Converts basis points (smallest token units) from the smart contract back to
 * user-friendly display amounts. Used for showing swap results, pool liquidity,
 * and other user-facing amounts.
 * 
 * @param {number} basisPoints - Amount in basis points (e.g., 1500000000000000000)
 * @param {number} decimals - Token decimal places (e.g., 9 for SOL)
 * @returns {number} Amount in display units (e.g., 1.5)
 * 
 * @example
 * // Converting 1,500,000 basis points to USDC display units
 * const display = basisPointsToDisplay(1500000, 6); // Returns 1.5
 * 
 * // Converting 100,000 basis points to BTC display units
 * const display = basisPointsToDisplay(100000, 8); // Returns 0.001
 * 
 * // Converting 1,000,000,000 basis points to SOL display units
 * const display = basisPointsToDisplay(1000000000, 9); // Returns 1.0
 */
function basisPointsToDisplay(basisPoints, decimals) {
    if (typeof basisPoints !== 'number' || isNaN(basisPoints) || basisPoints < 0) {
        throw new Error(`Invalid basis points: ${basisPoints}. Must be a positive number.`);
    }
    
    if (typeof decimals !== 'number' || !Number.isInteger(decimals) || decimals < 0 || decimals > 9) {
        throw new Error(`Invalid decimals: ${decimals}. Must be an integer between 0 and 9.`);
    }
    
    const factor = Math.pow(10, decimals);
    
    // Use more precise calculation for better floating-point handling
    let displayAmount;
    if (decimals === 0) {
        // No conversion needed for 0 decimals
        displayAmount = basisPoints;
    } else {
        // Use BigInt for precise division, then convert to number
        displayAmount = Number(BigInt(basisPoints)) / factor;
        
        // Round to avoid floating-point precision issues (keep reasonable precision)
        const precision = Math.min(decimals, 6); // Max 6 decimal places for display
        displayAmount = Math.round(displayAmount * Math.pow(10, precision)) / Math.pow(10, precision);
    }
    
    console.log(`🔧 BASIS POINTS CONVERSION: ${basisPoints} (basis points) → ${displayAmount} (display) [${decimals} decimals]`);
    
    return displayAmount;
}

/**
 * 🎯 CENTRALIZED BASIS POINTS UTILITIES
 * Standardized functions for consistent basis points ↔ display conversion
 */

/**
 * Convert basis points to display amount with proper decimal handling
 * @param {number} basisPoints - Raw basis points amount
 * @param {number} decimals - Token decimal places
 * @returns {number} Display amount
 */
function basisPointsToDisplay(basisPoints, decimals) {
    if (basisPoints === 0) return 0;
    if (basisPoints === null || basisPoints === undefined) return 0;
    
    // ✅ INTEGER MATH: Use string manipulation to avoid floating-point precision issues
    const basisPointsStr = basisPoints.toString();
    
    if (decimals === 0) {
        // No conversion needed for 0 decimals
        const displayAmount = basisPoints;
        console.log(`🔧 BASIS POINTS TO DISPLAY: ${basisPoints} basis points ÷ 10^${decimals} = ${displayAmount} display units (0 decimals)`);
        return displayAmount;
    } else if (basisPointsStr.length <= decimals) {
        // Number is smaller than decimal places, pad with zeros
        const padded = '0.' + '0'.repeat(decimals - basisPointsStr.length) + basisPointsStr;
        const displayAmount = parseFloat(padded);
        console.log(`🔧 BASIS POINTS TO DISPLAY: ${basisPoints} basis points ÷ 10^${decimals} = ${displayAmount} display units (padded)`);
        return displayAmount;
    } else {
        // Insert decimal point at the correct position
        const insertPos = basisPointsStr.length - decimals;
        const displayStr = basisPointsStr.slice(0, insertPos) + '.' + basisPointsStr.slice(insertPos);
        const displayAmount = parseFloat(displayStr);
        console.log(`🔧 BASIS POINTS TO DISPLAY: ${basisPoints} basis points ÷ 10^${decimals} = ${displayAmount} display units (string math)`);
        return displayAmount;
    }
}

/**
 * Convert display amount to basis points
 * @param {number} displayAmount - Display amount 
 * @param {number} decimals - Token decimal places
 * @returns {number} Basis points amount
 */
function displayToBasisPoints(displayAmount, decimals) {
    if (displayAmount === 0) return 0;
    if (displayAmount === null || displayAmount === undefined) return 0;
    
    const basisPoints = Math.round(displayAmount * Math.pow(10, decimals));
    console.log(`🔧 DISPLAY TO BASIS POINTS: ${displayAmount} display units × 10^${decimals} = ${basisPoints} basis points`);
    return basisPoints;
}

/**
 * Format liquidity amount with proper decimal conversion and display formatting
 * @param {number} basisPoints - Raw basis points amount
 * @param {number} decimals - Token decimal places  
 * @returns {string} Formatted display string
 */
function formatLiquidityWithDecimals(basisPoints, decimals) {
    const displayAmount = basisPointsToDisplay(basisPoints, decimals);
    return formatLargeNumber(displayAmount);
}

/**
 * Get correctly formatted liquidity for a specific token in a pool
 * @param {Object} pool - Pool data
 * @param {string} tokenType - 'A' or 'B' 
 * @returns {string} Formatted liquidity amount
 */
function getTokenLiquidityFormatted(pool, tokenType) {
    if (tokenType === 'A') {
        const rawAmount = pool.tokenALiquidity || pool.total_token_a_liquidity || 0;
        const decimals = pool.ratioADecimal;
        if (decimals === undefined) {
            console.warn('⚠️ Missing Token A decimal info, using raw amount');
            return formatLargeNumber(rawAmount);
        }
        return formatLiquidityWithDecimals(rawAmount, decimals);
    } else {
        const rawAmount = pool.tokenBLiquidity || pool.total_token_b_liquidity || 0;
        const decimals = pool.ratioBDecimal;
        if (decimals === undefined) {
            console.warn('⚠️ Missing Token B decimal info, using raw amount');
            return formatLargeNumber(rawAmount);
        }
        return formatLiquidityWithDecimals(rawAmount, decimals);
    }
}

/**
 * **BASIS POINTS REFACTOR: Validate one-to-many ratio pattern**
 * 
 * Validates whether a ratio qualifies for the one-to-many flag by checking if:
 * 1. Both ratios represent whole numbers in display units
 * 2. One side equals exactly 1.0 in display units  
 * 3. Both sides are positive
 * 
 * This mirrors the smart contract's validation logic and should be used in the
 * dashboard to provide user feedback about flag setting.
 * 
 * @param {number} ratioADisplay - Token A amount in display units
 * @param {number} ratioBDisplay - Token B amount in display units  
 * @param {number} decimalsA - Token A decimal places
 * @param {number} decimalsB - Token B decimal places
 * @returns {boolean} True if the ratio qualifies for one-to-many flag
 * 
 * @example
 * // Valid one-to-many: 1 SOL = 160 USDT
 * const isOneToMany = validateOneToManyRatio(1.0, 160.0, 9, 6); // Returns true
 * 
 * // Invalid: 1.5 SOL = 240 USDT (first side not 1.0)
 * const isOneToMany = validateOneToManyRatio(1.5, 240.0, 9, 6); // Returns false
 * 
 * // Invalid: 1 SOL = 160.5 USDT (not whole number)  
 * const isOneToMany = validateOneToManyRatio(1.0, 160.5, 9, 6); // Returns false
 */
function validateOneToManyRatio(ratioADisplay, ratioBDisplay, decimalsA, decimalsB) {
    try {
        // Convert to basis points for validation
        const basisPointsA = displayToBasisPoints(ratioADisplay, decimalsA);
        const basisPointsB = displayToBasisPoints(ratioBDisplay, decimalsB);
        
        const factorA = Math.pow(10, decimalsA);
        const factorB = Math.pow(10, decimalsB);
        
        // Check if both ratios represent whole numbers in display units
        const aIsWhole = (basisPointsA % factorA) === 0;
        const bIsWhole = (basisPointsB % factorB) === 0;
        
        // Check if both are positive and one equals exactly 1.0
        const bothPositive = ratioADisplay > 0 && ratioBDisplay > 0;
        const oneEqualsOne = ratioADisplay === 1.0 || ratioBDisplay === 1.0;
        
        const result = aIsWhole && bIsWhole && bothPositive && oneEqualsOne;
        
        console.log(`🔍 ONE-TO-MANY VALIDATION:`, {
            ratioADisplay, ratioBDisplay, decimalsA, decimalsB,
            aIsWhole, bIsWhole, bothPositive, oneEqualsOne, result
        });
        
        return result;
        
    } catch (error) {
        console.error('❌ Error validating one-to-many ratio:', error);
        return false;
    }
}

/**
 * 🎯 CENTRALIZED TOKEN PAIR RATIO CLASS
 * 
 * This class is the single source of truth for all ratio calculations across the dashboard.
 * Every page should use this class to ensure consistent ratio calculations and displays.
 * 
 * @class TokenPairRatio
 */
class TokenPairRatio {
    /**
     * Create a TokenPairRatio instance
     * @param {string} tickerA - Token A symbol (e.g., "TS")
     * @param {number} ratioA - Token A ratio in basis points
     * @param {number} decimalA - Token A decimal places
     * @param {string} tickerB - Token B symbol (e.g., "MST")
     * @param {number} ratioB - Token B ratio in basis points
     * @param {number} decimalB - Token B decimal places
     */
    constructor(tickerA, ratioA, decimalA, tickerB, ratioB, decimalB) {
        // Validate inputs
        if (!tickerA || !tickerB) {
            throw new Error('Both ticker symbols are required');
        }
        if (typeof ratioA !== 'number' || ratioA <= 0) {
            throw new Error(`Invalid ratioA: ${ratioA}. Must be a positive number.`);
        }
        if (typeof ratioB !== 'number' || ratioB <= 0) {
            throw new Error(`Invalid ratioB: ${ratioB}. Must be a positive number.`);
        }
        if (typeof decimalA !== 'number' || decimalA < 0 || decimalA > 9) {
            throw new Error(`Invalid decimalA: ${decimalA}. Must be between 0 and 9.`);
        }
        if (typeof decimalB !== 'number' || decimalB < 0 || decimalB > 9) {
            throw new Error(`Invalid decimalB: ${decimalB}. Must be between 0 and 9.`);
        }

        this.tickerA = tickerA;
        this.ratioA = ratioA;
        this.decimalA = decimalA;
        this.tickerB = tickerB;
        this.ratioB = ratioB;
        this.decimalB = decimalB;

        // Calculate display values once
        this.displayA = this.ratioA / Math.pow(10, this.decimalA);
        this.displayB = this.ratioB / Math.pow(10, this.decimalB);
    }

    /**
     * Get whole ratio for Token A (converted to display units)
     * @returns {number} Token A ratio in display units
     */
    WholeRatioA() {
        return this.displayA;
    }

    /**
     * Get whole ratio for Token B (converted to display units)
     * @returns {number} Token B ratio in display units
     */
    WholeRatioB() {
        return this.displayB;
    }

    /**
     * Get standardized number ratio display "1:X" format
     * Always shows 1 first, followed by the larger ratio
     * @returns {string} Ratio display like "1:10,000"
     */
    NumberRatioDisplay() {
        const ratioA = this.WholeRatioA();
        const ratioB = this.WholeRatioB();
        
        if (ratioA <= ratioB) {
            // A is smaller or equal, normalize to "1:X"
            const normalized = ratioB / ratioA;
            return `1:${formatNumberWithCommas(normalized)}`;
        } else {
            // B is smaller, normalize to "1:X"  
            const normalized = ratioA / ratioB;
            return `1:${formatNumberWithCommas(normalized)}`;
        }
    }

    /**
     * Get exchange rate display showing which token is more valuable
     * @returns {string} Exchange rate like "1 TS = 10,000 MST"
     */
    ExchangeDisplay() {
        const ratioA = this.WholeRatioA();
        const ratioB = this.WholeRatioB();
        
        // Calculate exchange rates in both directions
        const rate_A_to_B = ratioB / ratioA;  // How much B for 1 A
        const rate_B_to_A = ratioA / ratioB;  // How much A for 1 B
        
        // Show the direction that produces rates >= 1 (more valuable asset first)
        if (rate_A_to_B >= 1) {
            return `1 ${this.tickerA} = ${formatNumberWithCommas(rate_A_to_B)} ${this.tickerB}`;
        } else {
            return `1 ${this.tickerB} = ${formatNumberWithCommas(rate_B_to_A)} ${this.tickerA}`;
        }
    }

    /**
     * Calculate Token A amount from Token B amount (basis points to basis points)
     * @param {number} bAmountBasisPoints - Token B amount in basis points
     * @returns {number} Token A amount in basis points
     */
    CalculateA(bAmountBasisPoints) {
        if (typeof bAmountBasisPoints !== 'number' || bAmountBasisPoints < 0) {
            throw new Error(`Invalid bAmountBasisPoints: ${bAmountBasisPoints}. Must be a non-negative number.`);
        }
        
        // B → A: (bAmount * ratioA) / ratioB
        return Math.floor((bAmountBasisPoints * this.ratioA) / this.ratioB);
    }

    /**
     * Calculate Token B amount from Token A amount (basis points to basis points)
     * @param {number} aAmountBasisPoints - Token A amount in basis points
     * @returns {number} Token B amount in basis points
     */
    CalculateB(aAmountBasisPoints) {
        if (typeof aAmountBasisPoints !== 'number' || aAmountBasisPoints < 0) {
            throw new Error(`Invalid aAmountBasisPoints: ${aAmountBasisPoints}. Must be a non-negative number.`);
        }
        
        // A → B: (aAmount * ratioB) / ratioA
        return Math.floor((aAmountBasisPoints * this.ratioB) / this.ratioA);
    }

    /**
     * Convert Token A display amount to basis points
     * @param {number} displayAmount - Token A amount in display units
     * @returns {number} Token A amount in basis points
     */
    ADisplayToBasisPoints(displayAmount) {
        return displayToBasisPoints(displayAmount, this.decimalA);
    }

    /**
     * Convert Token B display amount to basis points
     * @param {number} displayAmount - Token B amount in display units
     * @returns {number} Token B amount in basis points
     */
    BDisplayToBasisPoints(displayAmount) {
        return displayToBasisPoints(displayAmount, this.decimalB);
    }

    /**
     * Convert Token A basis points to display amount
     * @param {number} basisPoints - Token A amount in basis points
     * @returns {number} Token A amount in display units
     */
    ABasisPointsToDisplay(basisPoints) {
        return basisPointsToDisplay(basisPoints, this.decimalA);
    }

    /**
     * Convert Token B basis points to display amount
     * @param {number} basisPoints - Token B amount in basis points
     * @returns {number} Token B amount in display units
     */
    BBasisPointsToDisplay(basisPoints) {
        return basisPointsToDisplay(basisPoints, this.decimalB);
    }

    /**
     * Calculate swap from A to B (display units)
     * @param {number} aDisplayAmount - Token A amount in display units
     * @returns {number} Token B amount in display units
     */
    SwapAToB(aDisplayAmount) {
        const aBasisPoints = this.ADisplayToBasisPoints(aDisplayAmount);
        const bBasisPoints = this.CalculateB(aBasisPoints);
        return this.BBasisPointsToDisplay(bBasisPoints);
    }

    /**
     * Calculate swap from B to A (display units)
     * @param {number} bDisplayAmount - Token B amount in display units
     * @returns {number} Token A amount in display units
     */
    SwapBToA(bDisplayAmount) {
        const bBasisPoints = this.BDisplayToBasisPoints(bDisplayAmount);
        const aBasisPoints = this.CalculateA(bBasisPoints);
        return this.ABasisPointsToDisplay(aBasisPoints);
    }

    /**
     * Get debugging information
     * @returns {Object} Debug information about the token pair
     */
    getDebugInfo() {
        return {
            tokens: `${this.tickerA}/${this.tickerB}`,
            ratiosBasisPoints: `${this.ratioA}:${this.ratioB}`,
            decimals: `${this.decimalA}:${this.decimalB}`,
            ratiosDisplay: `${this.displayA}:${this.displayB}`,
            numberRatioDisplay: this.NumberRatioDisplay(),
            exchangeDisplay: this.ExchangeDisplay()
        };
    }

    /**
     * Create TokenPairRatio from pool data
     * @param {Object} poolData - Pool data from RPC or state.json
     * @returns {TokenPairRatio} New TokenPairRatio instance
     */
    static fromPoolData(poolData) {
        const tickerA = poolData.tokenASymbol || 'TokenA';
        const tickerB = poolData.tokenBSymbol || 'TokenB';
        const ratioA = poolData.ratioANumerator || poolData.ratio_a_numerator;
        const ratioB = poolData.ratioBDenominator || poolData.ratio_b_denominator;
        const decimalA = poolData.ratioADecimal !== undefined ? poolData.ratioADecimal : 
                        (poolData.tokenDecimals?.tokenADecimals !== undefined ? poolData.tokenDecimals.tokenADecimals : null);
        const decimalB = poolData.ratioBDecimal !== undefined ? poolData.ratioBDecimal :
                        (poolData.tokenDecimals?.tokenBDecimals !== undefined ? poolData.tokenDecimals.tokenBDecimals : null);

        if (ratioA === undefined || ratioB === undefined) {
            throw new Error('Pool data missing ratio information');
        }
        if (decimalA === null || decimalB === null) {
            throw new Error('Pool data missing decimal information');
        }

        return new TokenPairRatio(tickerA, ratioA, decimalA, tickerB, ratioB, decimalB);
    }
}



/**
 * CENTRALIZED POOL DISPLAY FUNCTION - Handles decimals and display logic
 * Use this function across all dashboard pages for consistent pool display
 */
async function enrichPoolWithCorrectDisplay(poolData, connection) {
    try {
        console.log('🔧 CENTRALIZING POOL DISPLAY: Starting enrichment...');
        
        // Skip if already enriched or missing required data
        if (!poolData || poolData._displayEnriched) {
            console.log('📋 Pool already enriched or invalid data, skipping...');
            return poolData;
        }
        
        // Fetch token decimals if not already available
        let tokenDecimals = null;
        if (poolData.ratioADecimal !== undefined && poolData.ratioBDecimal !== undefined) {
            // Use decimals from state.json if available
            tokenDecimals = {
                tokenADecimals: poolData.ratioADecimal,
                tokenBDecimals: poolData.ratioBDecimal
            };
            console.log(`✅ Using decimals from pool data: TS=${tokenDecimals.tokenADecimals}, MST=${tokenDecimals.tokenBDecimals}`);
        } else if (connection && (poolData.tokenAMint || poolData.token_a_mint) && (poolData.tokenBMint || poolData.token_b_mint)) {
            // Fetch from blockchain if not in pool data
            console.log('🔍 Fetching token decimals from blockchain...');
            const [tokenADecimals, tokenBDecimals] = await Promise.all([
                getTokenDecimals(poolData.tokenAMint || poolData.token_a_mint, connection),
                getTokenDecimals(poolData.tokenBMint || poolData.token_b_mint, connection)
            ]);
            
            tokenDecimals = { tokenADecimals, tokenBDecimals };
            console.log(`✅ Fetched decimals: ${poolData.tokenASymbol || 'TokenA'}=${tokenADecimals}, ${poolData.tokenBSymbol || 'TokenB'}=${tokenBDecimals}`);
        } else {
            // 🚨 CRITICAL ERROR: Cannot fetch token decimals - abort to prevent fund loss
            const error = 'CRITICAL ERROR: Unable to fetch token decimals. Cannot safely perform token calculations. This could result in significant fund loss.';
            console.error('❌ TOKEN DECIMAL FETCH FAILED:', error);
            console.error('📊 Pool data:', poolData);
            console.error('🔗 Connection available:', !!connection);
            throw new Error(error);
        }
        
        // Create corrected display using proper decimals
        const correctedDisplay = getCorrectTokenDisplay(
            poolData.tokenASymbol || 'Token A',
            poolData.tokenBSymbol || 'Token B',
            poolData.ratioANumerator || poolData.ratio_a_numerator || 1,
            poolData.ratioBDenominator || poolData.ratio_b_denominator || 1,
            tokenDecimals.tokenADecimals,
            tokenDecimals.tokenBDecimals
        );
        
        // Enrich pool data with display information
        const enrichedPool = {
            ...poolData,
            tokenDecimals: tokenDecimals,
            correctedDisplay: correctedDisplay,
            _displayEnriched: true  // Mark as enriched to avoid re-processing
        };
        
        console.log('🎯 CENTRALIZED ENRICHMENT COMPLETE:', {
            poolAddress: enrichedPool.address?.slice(0, 8) + '...',
            tokenPair: correctedDisplay.displayPair,
            exchangeRate: correctedDisplay.rateText,
            decimals: `${tokenDecimals.tokenADecimals}:${tokenDecimals.tokenBDecimals}`
        });
        
        return enrichedPool;
        
    } catch (error) {
        console.error('❌ Error enriching pool display:', error);
        // Return original pool data if enrichment fails
        return poolData;
    }
}

/**
 * 🎯 CENTRALIZED: Get consistent pair name across all pages
 * Always returns "TokenA/TokenB" format regardless of ratio
 * 
 * @param {Object} pool - Pool data
 * @returns {string} Consistent pair name (e.g., "TS/MST")
 */
/**
 * 🎯 UPDATED: Show more valuable asset first in pair name
 * Per SOLANA_BASIS_POINTS_AND_LOGICAL_RATIO_DISPLAY.md principles
 */
function getCentralizedPairName(pool) {
    const tokenASymbol = pool.tokenASymbol || 'Token A';
    const tokenBSymbol = pool.tokenBSymbol || 'Token B';
    
    // Get basis points values
    const ratioABasisPoints = pool.ratioANumerator || pool.ratio_a_numerator || 1;
    const ratioBBasisPoints = pool.ratioBDenominator || pool.ratio_b_denominator || 1;
    
    // 🚨 CRITICAL: Get token decimals - NEVER use fallbacks to prevent fund loss
    if (pool.ratioADecimal === undefined || pool.ratioBDecimal === undefined) {
        throw new Error('CRITICAL ERROR: Token decimal information missing from pool data. Cannot calculate pair name safely.');
    }
    const tokenADecimals = pool.ratioADecimal;
    const tokenBDecimals = pool.ratioBDecimal;
    
    // Convert to display units
    const ratioADisplay = ratioABasisPoints / Math.pow(10, tokenADecimals);
    const ratioBDisplay = ratioBBasisPoints / Math.pow(10, tokenBDecimals);
    
    // Calculate exchange rates to determine more valuable asset
    const rate_A_to_B = ratioBDisplay / ratioADisplay;  // How much B for 1 A
    const rate_B_to_A = ratioADisplay / ratioBDisplay;  // How much A for 1 B
    
    // Show more valuable asset first (the one that produces rates >= 1)
    if (rate_A_to_B >= 1) {
        // A is more valuable: "A/B"
        return `${tokenASymbol}/${tokenBSymbol}`;
    } else {
        // B is more valuable: "B/A"
        return `${tokenBSymbol}/${tokenASymbol}`;
    }
}

/**
 * 🎯 CENTRALIZED: Get consistent ratio display across all pages
 * Always shows "1 TokenA = X TokenB" format
 * 
 * @param {Object} pool - Pool data
 * @returns {string} Consistent ratio text (e.g., "1 TS = 10,000 MST")
 */
function getCentralizedRatioText(pool) {
    // Get basis points values
    const ratioABasisPoints = pool.ratioANumerator || pool.ratio_a_numerator || 1;
    const ratioBBasisPoints = pool.ratioBDenominator || pool.ratio_b_denominator || 1;
    
    // 🚨 CRITICAL: Get token decimals - NEVER use fallbacks to prevent fund loss
    if (pool.ratioADecimal === undefined || pool.ratioBDecimal === undefined) {
        throw new Error('CRITICAL ERROR: Token decimal information missing from pool data. Cannot calculate ratio display safely.');
    }
    const tokenADecimals = pool.ratioADecimal;
    const tokenBDecimals = pool.ratioBDecimal;
    
    // Convert to display units
    const ratioADisplay = ratioABasisPoints / Math.pow(10, tokenADecimals);
    const ratioBDisplay = ratioBBasisPoints / Math.pow(10, tokenBDecimals);
    
    // LOGICAL DISPLAY: Show more valuable asset first to avoid confusing fractions
    // Per SOLANA_BASIS_POINTS_AND_LOGICAL_RATIO_DISPLAY.md principles
    
    const tokenASymbol = pool.tokenASymbol || 'Token A';
    const tokenBSymbol = pool.tokenBSymbol || 'Token B';
    
    // Calculate both direction exchange rates
    const rate_A_to_B = ratioBDisplay / ratioADisplay;  // How much B for 1 A
    const rate_B_to_A = ratioADisplay / ratioBDisplay;  // How much A for 1 B
    
    // Show the direction that produces rates >= 1 (more valuable asset first)
    if (rate_A_to_B >= 1) {
        // A is more valuable: "1 A = X B"
        return `1 ${tokenASymbol} = ${formatNumberWithCommas(rate_A_to_B)} ${tokenBSymbol}`;
    } else {
        // B is more valuable: "1 B = X A" 
        return `1 ${tokenBSymbol} = ${formatNumberWithCommas(rate_B_to_A)} ${tokenASymbol}`;
    }
}

/**
 * 🎯 CENTRALIZED: Get consistent ratio display for dashboard cards
 * Shows simplified ratio format (e.g., "1:10,000")
 * 
 * @param {Object} pool - Pool data
 * @returns {string} Simplified ratio text
 */
function getCentralizedRatioDisplay(pool) {
    // Get basis points values
    const ratioABasisPoints = pool.ratioANumerator || pool.ratio_a_numerator || 1;
    const ratioBBasisPoints = pool.ratioBDenominator || pool.ratio_b_denominator || 1;
    
    // 🚨 CRITICAL: Get token decimals - NEVER use fallbacks to prevent fund loss
    if (pool.ratioADecimal === undefined || pool.ratioBDecimal === undefined) {
        throw new Error('CRITICAL ERROR: Token decimal information missing from pool data. Cannot calculate ratio display safely.');
    }
    const tokenADecimals = pool.ratioADecimal;
    const tokenBDecimals = pool.ratioBDecimal;
    
    // Convert to display units
    const ratioADisplay = ratioABasisPoints / Math.pow(10, tokenADecimals);
    const ratioBDisplay = ratioBBasisPoints / Math.pow(10, tokenBDecimals);
    
    // LOGICAL DISPLAY: Show more valuable asset first to avoid confusing fractions
    // Per SOLANA_BASIS_POINTS_AND_LOGICAL_RATIO_DISPLAY.md principles
    
    // Calculate both direction exchange rates
    const rate_A_to_B = ratioBDisplay / ratioADisplay;  // How much B for 1 A
    const rate_B_to_A = ratioADisplay / ratioBDisplay;  // How much A for 1 B
    
    // Show the direction that produces rates >= 1 (more valuable asset first)
    if (rate_A_to_B >= 1) {
        // A is more valuable: "1:X" 
        return `1:${formatNumberWithCommas(rate_A_to_B)}`;
    } else {
        // B is more valuable: "1:X" (but we need to flip the perspective)
        return `1:${formatNumberWithCommas(rate_B_to_A)}`;
    }
}

/**
 * 🎯 CENTRALIZED: Get complete display info for any page
 * Returns consistent object with all display information
 * 
 * @param {Object} pool - Pool data
 * @returns {Object} Complete display information
 */
function getCentralizedDisplayInfo(pool) {
    const pairName = getCentralizedPairName(pool);
    const ratioText = getCentralizedRatioText(pool);
    const ratioDisplay = getCentralizedRatioDisplay(pool);
    
    // Get basis points values for calculations
    const ratioABasisPoints = pool.ratioANumerator || pool.ratio_a_numerator || 1;
    const ratioBBasisPoints = pool.ratioBDenominator || pool.ratio_b_denominator || 1;
    
    // 🚨 CRITICAL: Get token decimals - NEVER use fallbacks to prevent fund loss  
    if (pool.ratioADecimal === undefined || pool.ratioBDecimal === undefined) {
        throw new Error('CRITICAL ERROR: Token decimal information missing from pool data. Cannot calculate display info safely.');
    }
    const tokenADecimals = pool.ratioADecimal;
    const tokenBDecimals = pool.ratioBDecimal;
    
    // Convert to display units
    const ratioADisplay = ratioABasisPoints / Math.pow(10, tokenADecimals);
    const ratioBDisplay = ratioBBasisPoints / Math.pow(10, tokenBDecimals);
    
    // LOGICAL DISPLAY: Calculate exchange rate based on more valuable asset first
    // Per SOLANA_BASIS_POINTS_AND_LOGICAL_RATIO_DISPLAY.md principles
    const rate_A_to_B = ratioBDisplay / ratioADisplay;  // How much B for 1 A
    const rate_B_to_A = ratioADisplay / ratioBDisplay;  // How much A for 1 B
    
    // Use the rate that is >= 1 (more valuable asset direction)
    const exchangeRate = rate_A_to_B >= 1 ? rate_A_to_B : rate_B_to_A;
    
    return {
        pairName: pairName,
        ratioText: ratioText,
        ratioDisplay: ratioDisplay,
        exchangeRate: exchangeRate,
        tokenASymbol: pool.tokenASymbol || 'Token A',
        tokenBSymbol: pool.tokenBSymbol || 'Token B',
        ratioABasisPoints: ratioABasisPoints,
        ratioBBasisPoints: ratioBBasisPoints,
        tokenADecimals: tokenADecimals,
        tokenBDecimals: tokenBDecimals,
        ratioADisplay: ratioADisplay,
        ratioBDisplay: ratioBDisplay
    };
}

/**
 * Query Metaplex Token Metadata for a mint. Uses provided connection or creates one to the configured RPC.
 * Returns { name, symbol } or null if not found.
 */
async function queryTokenMetadata(tokenMintAddress, rpcConnection = null) {
    try {
        if (!tokenMintAddress) {
            throw new Error('Token mint address is required');
        }

        const metaplexCfg = window.TRADING_CONFIG?.metaplex;
        if (!metaplexCfg?.tokenMetadataProgramId) {
            console.warn('⚠️ Metaplex not configured; cannot fetch token metadata');
            return null;
        }

        const programId = new solanaWeb3.PublicKey(metaplexCfg.tokenMetadataProgramId);

        // Create a temporary connection if one was not supplied
        let conn = rpcConnection;
        if (!conn) {
            const rpcUrl = metaplexCfg.remoteRpcUrl || window.TRADING_CONFIG?.solana?.rpcUrl || window.CONFIG?.rpcUrl;
            const connectionConfig = {
                commitment: (window.TRADING_CONFIG?.solana?.commitment || window.CONFIG?.commitment || 'confirmed'),
                disableRetryOnRateLimit: true
            };
            conn = new solanaWeb3.Connection(rpcUrl, connectionConfig);
        }

        const tokenMint = new solanaWeb3.PublicKey(tokenMintAddress);
        const seeds = [
            new TextEncoder().encode('metadata'),
            programId.toBuffer(),
            tokenMint.toBuffer()
        ];
        const [metadataAccount] = solanaWeb3.PublicKey.findProgramAddressSync(seeds, programId);

        const accountInfo = await conn.getAccountInfo(metadataAccount);
        if (!accountInfo || !accountInfo.data) {
            return null;
        }

        // Robust parse supporting Buffer or Uint8Array
        const data = accountInfo.data;
        let offset = 0;

        const skip = (n) => { offset += n; };
        const readU32LE = () => {
            if (typeof data.readUInt32LE === 'function') {
                const value = data.readUInt32LE(offset);
                offset += 4;
                return value;
            }
            const view = new DataView(data.buffer, data.byteOffset + offset, 4);
            const value = view.getUint32(0, true);
            offset += 4;
            return value;
        };
        const readString = (len) => {
            const slice = (typeof data.slice === 'function') ? data.slice(offset, offset + len) : data.subarray(offset, offset + len);
            offset += len;
            return new TextDecoder('utf-8').decode(slice).replace(/\0/g, '').trim();
        };

        // Metaplex Metadata layout (simplified):
        // key(1) | updateAuth(32) | mint(32) | nameLen(4) | name | symbolLen(4) | symbol | ...
        skip(1 + 32 + 32);
        const nameLen = readU32LE();
        const name = readString(nameLen);
        const symbolLen = readU32LE();
        const symbol = readString(symbolLen);

        return { name, symbol };
    } catch (error) {
        console.warn(`❌ Error querying token metadata for ${tokenMintAddress}:`, error);
        return null;
    }
}

// Make functions available globally for use in other dashboard files
if (typeof window !== 'undefined') {
    window.TokenDisplayUtils = {
        getDisplayTokenOrder,
        getDisplayTokenOrderCorrected,  // NEW: The corrected logic
        getCorrectTokenDisplay,         // NEW: Simple corrector function
        formatExchangeRate,
        formatExchangeRateStandard,
        getSimpleDisplayOrder,
        formatLargeNumber,
        formatLiquidityAmount,
        getTokenDecimals,
        formatNumberWithCommas,
        createPoolTitle,
        createExchangeRateDisplay,
        // Phase 1.3: New flag interpretation functions
        checkOneToManyRatioFlag,
        interpretPoolFlags,
        // BASIS POINTS REFACTOR: New conversion functions
        displayToBasisPoints,
        basisPointsToDisplay,
        formatLiquidityWithDecimals,
        getTokenLiquidityFormatted,
        validateOneToManyRatio,
        // 🎯 CENTRALIZED TOKEN PAIR RATIO CLASS
        TokenPairRatio,
        // CENTRALIZED DISPLAY: New unified function
        enrichPoolWithCorrectDisplay,
        // CENTRALIZED: New centralized display functions
        getCentralizedPairName,
        getCentralizedRatioText,
        getCentralizedRatioDisplay,
            getCentralizedDisplayInfo,
            // Metaplex metadata helper
            queryTokenMetadata
    };
}

/**
 * Copy text to clipboard utility
 * @param {string} text - Text to copy to clipboard
 * @returns {Promise<boolean>} - Success status
 */
async function copyToClipboard(text) {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return true;
        } else {
            // Fallback for older browsers or non-secure contexts
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            const result = document.execCommand('copy');
            document.body.removeChild(textArea);
            return result;
        }
    } catch (error) {
        console.error('Failed to copy to clipboard:', error);
        return false;
    }
}

/**
 * Format address for display (first 8 chars + ... + last 4 chars)
 * @param {string} address - Full address
 * @returns {string} - Formatted address
 */
function formatAddressForDisplay(address) {
    if (!address || address.length < 12) return address;
    return `${address.slice(0, 8)}...${address.slice(-4)}`;
}

/**
 * Create a copy button element
 * @param {string} text - Text to copy
 * @param {string} displayText - Text to display on button (optional)
 * @returns {HTMLElement} - Copy button element
 */
function createCopyButton(text, displayText = '📋') {
    const button = document.createElement('button');
    button.className = 'copy-btn';
    button.innerHTML = displayText;
    button.title = 'Copy to clipboard';
    button.onclick = async (e) => {
        e.stopPropagation();
        const success = await copyToClipboard(text);
        if (success) {
            button.innerHTML = '✅';
            button.style.background = '#10b981';
            setTimeout(() => {
                button.innerHTML = displayText;
                button.style.background = '';
            }, 2000);
        } else {
            button.innerHTML = '❌';
            button.style.background = '#ef4444';
            setTimeout(() => {
                button.innerHTML = displayText;
                button.style.background = '';
            }, 2000);
        }
    };
    return button;
}

// Add copy utilities to window object
if (typeof window !== 'undefined') {
    window.CopyUtils = {
        copyToClipboard,
        formatAddressForDisplay,
        createCopyButton
    };
}

// Export for Node.js environments (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        getDisplayTokenOrder,
        getDisplayTokenOrderCorrected,  // NEW: The corrected logic
        getCorrectTokenDisplay,         // NEW: Simple corrector function
        formatExchangeRate,
        formatExchangeRateStandard,
        getSimpleDisplayOrder,
        formatLargeNumber,
        formatLiquidityAmount,
        getTokenDecimals,
        formatNumberWithCommas,
        createPoolTitle,
        createExchangeRateDisplay,
        // Phase 1.3: New flag interpretation functions
        checkOneToManyRatioFlag,
        interpretPoolFlags,
        // BASIS POINTS REFACTOR: New conversion functions
        displayToBasisPoints,
        basisPointsToDisplay,
        formatLiquidityWithDecimals,
        getTokenLiquidityFormatted,
        validateOneToManyRatio,
        // 🎯 CENTRALIZED TOKEN PAIR RATIO CLASS
        TokenPairRatio,
        // CENTRALIZED DISPLAY: New unified function
        enrichPoolWithCorrectDisplay,
        // CENTRALIZED: New centralized display functions
        getCentralizedPairName,
        getCentralizedRatioText,
        getCentralizedRatioDisplay,
        getCentralizedDisplayInfo
    };
} 