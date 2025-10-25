/**
 * 🚨 CENTRALIZED ERROR CODE MAPPING
 * Fixed Ratio Trading Smart Contract Error Codes
 * 
 * All dashboard JavaScript files should import and use these mappings
 * to ensure consistent error messages across the application.
 * 
 * Source: Fixed Ratio Trading API Documentation v0.16.x+
 * Last Updated: Based on latest API documentation
 */

// ========================================
// CUSTOM PROGRAM ERROR CODES
// ========================================

/**
 * Complete mapping of custom program error codes to user-friendly messages
 */
const ERROR_CODES = {
    // === POOL CONFIGURATION ERRORS (1000-1009) ===
    1000: {
        name: "PoolAlreadyExists",
        message: "🔄 Pool with this configuration already exists. Use the existing pool or create one with different tokens/ratios.",
        category: "Pool Configuration",
        severity: "error"
    },
    1001: {
        name: "InvalidTokenPair", 
        message: "❌ Invalid token pair configuration. Ensure both tokens are valid SPL tokens and not identical.",
        category: "Pool Configuration",
        severity: "error"
    },
    1002: {
        name: "InvalidRatio",
        message: "📊 Invalid exchange ratio. One side must equal exactly 1 whole token unit (10^decimals basis points).",
        category: "Pool Configuration", 
        severity: "error"
    },
    1003: {
        name: "InsufficientBalance",
        message: "💰 Insufficient token balance for this operation. Check your wallet balance and try again.",
        category: "Balance",
        severity: "error"
    },
    1004: {
        name: "InvalidTokenAccount",
        message: "🏦 Invalid or uninitialized token account. Ensure your token accounts are properly set up.",
        category: "Account",
        severity: "error"
    },
    1005: {
        name: "UnauthorizedOperation",
        message: "🚫 Unauthorized operation. You don't have permission to perform this action.",
        category: "Authorization",
        severity: "error"
    },
    1006: {
        name: "PoolNotFound",
        message: "🔍 Pool not found. The specified pool may not exist or may have been removed.",
        category: "Pool Configuration",
        severity: "error"
    },
    1007: {
        name: "PoolPaused",
        message: "⏸️ Pool operations are currently paused. Please try again later or contact the pool administrator.",
        category: "Pool State",
        severity: "warning"
    },
    1008: {
        name: "InvalidPoolState",
        message: "⚠️ Invalid pool state detected. Pool may be corrupted or in an unexpected state.",
        category: "Pool State",
        severity: "error"
    },
    1009: {
        name: "PoolConfigurationLocked",
        message: "🔒 Pool configuration is locked and cannot be modified. Pool settings are immutable after creation.",
        category: "Pool Configuration",
        severity: "error"
    },

    // === LIQUIDITY OPERATION ERRORS (1010-1019) ===
    1010: {
        name: "InsufficientLiquidity",
        message: "💧 Insufficient liquidity in the pool for this operation. Try a smaller amount or add liquidity first.",
        category: "Liquidity",
        severity: "error"
    },
    1011: {
        name: "LiquidityAmountTooSmall",
        message: "📏 Liquidity amount too small. Minimum deposit requirements not met.",
        category: "Liquidity",
        severity: "error"
    },
    1012: {
        name: "LiquidityAmountTooLarge",
        message: "📈 Liquidity amount exceeds maximum allowed. Try a smaller amount.",
        category: "Liquidity",
        severity: "error"
    },
    1013: {
        name: "LiquidityOperationsPaused",
        message: "⏸️ Liquidity operations (deposits/withdrawals) are currently paused for this pool.",
        category: "Pool State",
        severity: "warning"
    },
    1014: {
        name: "InsufficientLPTokens",
        message: "🎫 Insufficient LP tokens for withdrawal. Check your LP token balance.",
        category: "Balance",
        severity: "error"
    },
    1015: {
        name: "LiquiditySlippageExceeded",
        message: "📉 Liquidity operation slippage exceeded. Pool conditions changed, please retry.",
        category: "Liquidity",
        severity: "warning"
    },
    1016: {
        name: "WithdrawalProtectionActive",
        message: "🛡️ Withdrawal protection is active. Additional validation required for large withdrawals.",
        category: "Pool State",
        severity: "warning"
    },
    1017: {
        name: "LiquidityRatioImbalance",
        message: "⚖️ Liquidity ratio imbalance detected. Ensure deposits maintain pool balance.",
        category: "Liquidity",
        severity: "error"
    },
    1018: {
        name: "SingleSidedLiquidityNotAllowed",
        message: "🔄 Single-sided liquidity not allowed for this pool. Must provide both tokens.",
        category: "Liquidity",
        severity: "error"
    },
    1019: {
        name: "LiquidityFeeCalculationError",
        message: "🧮 Error calculating liquidity fees. Please try again or contact support.",
        category: "Calculation",
        severity: "error"
    },
    1035: {
        name: "PoolLiquidityPaused",
        message: "⏸️ Pool liquidity operations are paused. Deposits and withdrawals are currently disabled for this pool. Please try again later or contact the pool administrator.",
        category: "Pool State",
        severity: "warning"
    },

    // === SWAP OPERATION ERRORS (1020-1029) ===
    1020: {
        name: "InvalidSwapAmount",
        message: "💱 Invalid swap amount. Amount must be greater than zero and within limits.",
        category: "Swap",
        severity: "error"
    },
    1021: {
        name: "SwapAmountTooSmall",
        message: "📏 Swap amount too small. Minimum swap requirements not met.",
        category: "Swap",
        severity: "error"
    },
    1022: {
        name: "SwapAmountTooLarge",
        message: "📈 Swap amount exceeds maximum allowed. Try a smaller amount.",
        category: "Swap",
        severity: "error"
    },
    1023: {
        name: "SystemPaused",
        message: "🚨 System is currently paused. All operations are temporarily disabled for maintenance or security reasons.",
        category: "System State",
        severity: "warning"
    },
    1024: {
        name: "SwapsPaused",
        message: "⏸️ Swap operations are currently paused for this pool. Liquidity operations may still be available.",
        category: "Pool State",
        severity: "warning"
    },
    1025: {
        name: "SlippageToleranceExceeded",
        message: "📉 Slippage tolerance exceeded. Pool conditions changed during transaction, please retry.",
        category: "Swap",
        severity: "warning"
    },
    1026: {
        name: "SwapDirectionNotSupported",
        message: "🔄 Swap direction not supported. Check token pair configuration.",
        category: "Swap",
        severity: "error"
    },
    1027: {
        name: "SwapsPausedByOwner",
        message: "🚫 Pool swaps are currently paused by the pool owner. Trading has been temporarily disabled. Please contact the pool owner or try again later.",
        category: "Pool State",
        severity: "warning"
    },
    1028: {
        name: "SwapForOwnersOnly",
        message: "🔐 This pool allows swaps by owners only. Contact the pool creator for access.",
        category: "Authorization",
        severity: "error"
    },
    1029: {
        name: "SwapFeeCalculationError",
        message: "🧮 Error calculating swap fees. Please try again or contact support.",
        category: "Calculation",
        severity: "error"
    },

    // === CALCULATION & PRECISION ERRORS (1040-1049) ===
    1040: {
        name: "ArithmeticOverflow",
        message: "🔢 Arithmetic overflow detected. Amount is too large for calculation.",
        category: "Calculation",
        severity: "error"
    },
    1041: {
        name: "ArithmeticUnderflow",
        message: "🔢 Arithmetic underflow detected. Amount resulted in negative value.",
        category: "Calculation", 
        severity: "error"
    },
    1042: {
        name: "DivisionByZero",
        message: "➗ Division by zero error in calculation. Check input values.",
        category: "Calculation",
        severity: "error"
    },
    1043: {
        name: "PrecisionLoss",
        message: "🎯 Precision loss detected in calculation. Result may be inaccurate.",
        category: "Calculation",
        severity: "warning"
    },
    1044: {
        name: "InvalidCalculationInput",
        message: "📊 Invalid input for calculation. Check values and try again.",
        category: "Calculation",
        severity: "error"
    },
    1045: {
        name: "RoundingError",
        message: "🔄 Rounding error in calculation. Small precision differences detected.",
        category: "Calculation",
        severity: "warning"
    },
    1046: {
        name: "ExchangeRateError",
        message: "💱 Error calculating exchange rate. Check pool configuration.",
        category: "Calculation",
        severity: "error"
    },
    1047: {
        name: "AmountMismatch",
        message: "⚖️ Amount mismatch: calculated output doesn't match expected amount. Adjust the amounts and try again.",
        category: "Calculation",
        severity: "error"
    },
    1048: {
        name: "BasisPointsConversionError",
        message: "🔢 Error converting between display amounts and basis points. Check decimal precision.",
        category: "Calculation",
        severity: "error"
    },
    1049: {
        name: "MathematicalConstraintViolation",
        message: "📐 Mathematical constraint violation. Operation violates pool invariants.",
        category: "Calculation",
        severity: "error"
    },

    // === ACCOUNT & AUTHORITY ERRORS (1050-1059) ===
    1050: {
        name: "InvalidAuthority",
        message: "🔑 Invalid authority. You don't have permission to perform this operation.",
        category: "Authorization",
        severity: "error"
    },
    1051: {
        name: "AccountNotInitialized",
        message: "🚀 Account not initialized. Required account needs to be set up first.",
        category: "Account",
        severity: "error"
    },
    1052: {
        name: "AccountAlreadyInitialized",
        message: "✅ Account already initialized. This operation has already been completed.",
        category: "Account",
        severity: "warning"
    },
    1053: {
        name: "InvalidAccountOwner",
        message: "👤 Invalid account owner. Account must be owned by the correct program.",
        category: "Account",
        severity: "error"
    },
    1054: {
        name: "AccountDataTooSmall",
        message: "📦 Account data too small. Account cannot store required information.",
        category: "Account",
        severity: "error"
    },
    1055: {
        name: "InvalidProgramDerivedAddress",
        message: "🔗 Invalid Program Derived Address (PDA). Address doesn't match expected derivation.",
        category: "Account",
        severity: "error"
    },
    1056: {
        name: "RequiredSignatureMissing",
        message: "✍️ Required signature missing. Transaction must be signed by authorized account.",
        category: "Authorization",
        severity: "error"
    },
    1057: {
        name: "InvalidAccountType",
        message: "🏷️ Invalid account type. Account doesn't match expected type for this operation.",
        category: "Account",
        severity: "error"
    },
    1058: {
        name: "AccountFrozen",
        message: "🧊 Account is frozen. Operations are disabled for this account.",
        category: "Account",
        severity: "error"
    },
    1059: {
        name: "InsufficientAccountPermissions",
        message: "🚫 Insufficient account permissions. Account lacks required permissions for this operation.",
        category: "Authorization",
        severity: "error"
    },

    // === FEE & TREASURY ERRORS (1060-1069) ===
    1060: {
        name: "InsufficientFeePayment",
        message: "💳 Insufficient fee payment. Please ensure you have enough SOL to cover operation fees.",
        category: "Fees",
        severity: "error"
    },
    1061: {
        name: "FeeCalculationError",
        message: "🧮 Error calculating fees. Please try again or contact support.",
        category: "Fees",
        severity: "error"
    },
    1062: {
        name: "TreasuryOperationFailed",
        message: "🏛️ Treasury operation failed. Fee collection or withdrawal error.",
        category: "Treasury",
        severity: "error"
    },
    1063: {
        name: "InvalidFeeConfiguration",
        message: "⚙️ Invalid fee configuration. Fee settings are incorrectly configured.",
        category: "Fees",
        severity: "error"
    },
    1064: {
        name: "FeeCollectionPaused",
        message: "⏸️ Fee collection is currently paused. Operations may be temporarily free.",
        category: "Fees",
        severity: "warning"
    },
    1065: {
        name: "TreasuryInsufficientBalance",
        message: "💰 Treasury has insufficient balance for this operation.",
        category: "Treasury",
        severity: "error"
    },
    1066: {
        name: "WithdrawalLimitExceeded",
        message: "📊 Withdrawal limit exceeded. Amount exceeds maximum allowed withdrawal.",
        category: "Treasury",
        severity: "error"
    },
    1067: {
        name: "ConsolidationInProgress",
        message: "🔄 Fee consolidation in progress. Please wait for consolidation to complete.",
        category: "Treasury",
        severity: "warning"
    },
    1068: {
        name: "InvalidFeeRecipient",
        message: "📫 Invalid fee recipient. Fee destination account is incorrectly configured.",
        category: "Fees",
        severity: "error"
    },
    1069: {
        name: "FeeTransferFailed",
        message: "💸 Fee transfer failed. Unable to collect or transfer fees.",
        category: "Fees",
        severity: "error"
    },

    // === TIME & SCHEDULING ERRORS (1070-1079) ===
    1070: {
        name: "OperationTimeoutExpired",
        message: "⏰ Operation timeout expired. Please retry the operation.",
        category: "Timing",
        severity: "warning"
    },
    1071: {
        name: "InvalidTimestamp",
        message: "🕐 Invalid timestamp. Time value is out of acceptable range.",
        category: "Timing",
        severity: "error"
    },
    1072: {
        name: "OperationTooEarly",
        message: "⏰ Operation attempted too early. Please wait before retrying.",
        category: "Timing",
        severity: "warning"
    },
    1073: {
        name: "OperationTooLate",
        message: "⏰ Operation attempted too late. Time window has expired.",
        category: "Timing",
        severity: "error"
    },
    1074: {
        name: "TimelockActive",
        message: "🔒 Timelock is active. Operation is time-restricted and cannot be performed yet.",
        category: "Timing",
        severity: "warning"
    },
    1075: {
        name: "CooldownPeriodActive",
        message: "❄️ Cooldown period active. Please wait before performing this operation again.",
        category: "Timing",
        severity: "warning"
    },
    1076: {
        name: "ScheduledMaintenanceActive",
        message: "🔧 Scheduled maintenance is active. Operations are temporarily unavailable.",
        category: "Timing",
        severity: "warning"
    },
    1077: {
        name: "InvalidSchedule",
        message: "📅 Invalid schedule configuration. Timing parameters are incorrectly set.",
        category: "Timing",
        severity: "error"
    },
    1078: {
        name: "DeadlineExceeded",
        message: "⏰ Deadline exceeded. Operation must be completed within the specified time limit.",
        category: "Timing",
        severity: "error"
    },
    1079: {
        name: "TemporalConstraintViolation",
        message: "🕰️ Temporal constraint violation. Operation violates time-based rules.",
        category: "Timing",
        severity: "error"
    }
};

// ========================================
// STANDARD SOLANA ERROR CODES  
// ========================================

/**
 * Common Solana program error codes
 */
const SOLANA_ERROR_CODES = {
    0: {
        name: "Success",
        message: "✅ Operation completed successfully.",
        category: "Success",
        severity: "success"
    },
    1: {
        name: "InvalidInstruction",
        message: "❌ Invalid instruction. The instruction format is incorrect or unsupported.",
        category: "Instruction",
        severity: "error"
    },
    2: {
        name: "InvalidAccountData",
        message: "📦 Invalid account data. Account contains unexpected or corrupted data.",
        category: "Account",
        severity: "error"
    },
    3: {
        name: "InvalidAccountInfo",
        message: "ℹ️ Invalid account info. Account information is malformed or missing.",
        category: "Account",
        severity: "error"
    },
    4: {
        name: "IncorrectProgramId",
        message: "🆔 Incorrect program ID. Wrong program was called for this operation.",
        category: "Program",
        severity: "error"
    },
    5: {
        name: "MissingRequiredSignature",
        message: "✍️ Missing required signature. Transaction needs additional authorization.",
        category: "Authorization",
        severity: "error"
    },
    6: {
        name: "AccountAlreadyInitialized", 
        message: "✅ Account already initialized. This setup operation has already been completed.",
        category: "Account",
        severity: "warning"
    },
    7: {
        name: "UninitializedAccount",
        message: "🚀 Uninitialized account. Account needs to be set up before use.",
        category: "Account",
        severity: "error"
    },
    8: {
        name: "UnbalancedInstruction",
        message: "⚖️ Unbalanced instruction. Transaction debits and credits don't match.",
        category: "Instruction",
        severity: "error"
    },
    9: {
        name: "ModifiedProgramId",
        message: "🔄 Modified program ID. Program ID was unexpectedly changed.",
        category: "Program", 
        severity: "error"
    },
    10: {
        name: "ExternalAccountLamportSpend",
        message: "💰 External account lamport spend. Cannot spend lamports from external account.",
        category: "Account",
        severity: "error"
    },
    11: {
        name: "ExternalAccountDataModified",
        message: "📝 External account data modified. Cannot modify external account data.",
        category: "Account",
        severity: "error"
    },
    12: {
        name: "ReadonlyLamportChange",
        message: "💰 Readonly lamport change. Cannot change lamports in readonly account.",
        category: "Account",
        severity: "error"
    },
    13: {
        name: "ReadonlyDataModified",
        message: "📝 Readonly data modified. Cannot modify data in readonly account.",
        category: "Account",
        severity: "error"
    },
    14: {
        name: "DuplicateAccountIndex",
        message: "🔁 Duplicate account index. Same account used multiple times.",
        category: "Account",
        severity: "error"
    },
    15: {
        name: "ExecutableModified",
        message: "⚙️ Executable modified. Cannot modify executable account.",
        category: "Account",
        severity: "error"
    },
    16: {
        name: "RentEpochModified",
        message: "📅 Rent epoch modified. Cannot modify rent epoch.",
        category: "Account",
        severity: "error"
    },
    17: {
        name: "NotEnoughAccountKeys",
        message: "🔑 Not enough account keys. Transaction requires more accounts.",
        category: "Account",
        severity: "error"
    },
    18: {
        name: "AccountDataSizeChanged",
        message: "📦 Account data size changed. Account size cannot be modified.",
        category: "Account",
        severity: "error"
    },
    19: {
        name: "AccountNotExecutable",
        message: "⚙️ Account not executable. Account cannot be executed as a program.",
        category: "Account",
        severity: "error"
    },
    20: {
        name: "AccountBorrowFailed",
        message: "🏦 Account borrow failed. Cannot borrow account data.",
        category: "Account",
        severity: "error"
    }
};

// ========================================
// ERROR MAPPING FUNCTIONS
// ========================================

/**
 * Get user-friendly error message for any error code
 * @param {number|string} errorCode - The error code (decimal or hex)
 * @param {string} [context] - Additional context for the error
 * @returns {object} Error information object
 */
function getErrorInfo(errorCode, context = '') {
    // Convert hex codes to decimal
    if (typeof errorCode === 'string' && errorCode.startsWith('0x')) {
        errorCode = parseInt(errorCode, 16);
    }
    
    // Convert to number if string
    if (typeof errorCode === 'string') {
        errorCode = parseInt(errorCode, 10);
    }

    // Look up in custom error codes first
    if (ERROR_CODES[errorCode]) {
        return {
            ...ERROR_CODES[errorCode],
            code: errorCode,
            hex: '0x' + errorCode.toString(16).toUpperCase(),
            context: context
        };
    }

    // Look up in Solana error codes
    if (SOLANA_ERROR_CODES[errorCode]) {
        return {
            ...SOLANA_ERROR_CODES[errorCode],
            code: errorCode,
            hex: '0x' + errorCode.toString(16).toUpperCase(),
            context: context
        };
    }

    // Unknown error code
    return {
        name: "UnknownError",
        message: `❓ Unknown error code: ${errorCode} (0x${errorCode.toString(16).toUpperCase()}). ${context || 'Please contact support.'}`,
        category: "Unknown",
        severity: "error",
        code: errorCode,
        hex: '0x' + errorCode.toString(16).toUpperCase(),
        context: context
    };
}

/**
 * Parse Solana transaction error and extract meaningful information
 * @param {object} error - The error object from Solana
 * @returns {object} Parsed error information
 */
function parseTransactionError(error) {
    // Handle string errors
    if (typeof error === 'string') {
        return {
            name: "StringError",
            message: `❌ ${error}`,
            category: "Transaction",
            severity: "error",
            originalError: error
        };
    }

    // Handle instruction errors with custom program errors
    if (error && error.InstructionError && Array.isArray(error.InstructionError)) {
        const [instructionIndex, instructionError] = error.InstructionError;
        
        if (instructionError.Custom !== undefined) {
            const errorInfo = getErrorInfo(instructionError.Custom, `Instruction ${instructionIndex}`);
            return {
                ...errorInfo,
                instructionIndex,
                originalError: error
            };
        }
        
        // Handle other instruction error types
        const errorType = Object.keys(instructionError)[0];
        return {
            name: errorType,
            message: `❌ Instruction ${instructionIndex} failed: ${errorType}`,
            category: "Instruction",
            severity: "error",
            instructionIndex,
            originalError: error
        };
    }

    // Handle other error types
    if (error && typeof error === 'object') {
        // Look for error message in various fields
        const message = error.message || error.error || error.toString();
        
        return {
            name: "TransactionError",
            message: `❌ Transaction failed: ${message}`,
            category: "Transaction",
            severity: "error",
            originalError: error
        };
    }

    return getErrorInfo(-1, "Unknown transaction error");
}

/**
 * Format error for display to users
 * @param {object} errorInfo - Error information from getErrorInfo or parseTransactionError
 * @returns {string} Formatted error message
 */
function formatErrorForUser(errorInfo) {
    let message = errorInfo.message;
    
    if (errorInfo.code && errorInfo.code !== -1) {
        message += ` (Error Code: ${errorInfo.hex || errorInfo.code})`;
    }
    
    if (errorInfo.context) {
        message += ` Context: ${errorInfo.context}`;
    }
    
    return message;
}

/**
 * Get error severity emoji
 * @param {string} severity - Error severity level
 * @returns {string} Emoji for the severity
 */
function getErrorEmoji(severity) {
    switch (severity) {
        case 'success': return '✅';
        case 'warning': return '⚠️';
        case 'error': return '❌';
        default: return '❓';
    }
}

/**
 * Check if error code indicates a pause state
 * @param {number} errorCode - The error code to check
 * @returns {boolean} True if error indicates pause state
 */
function isPauseError(errorCode) {
    const pauseErrors = [1007, 1013, 1023, 1024, 1027, 1035, 1064, 1076];
    return pauseErrors.includes(errorCode);
}

/**
 * Check if error code indicates insufficient balance/funds
 * @param {number} errorCode - The error code to check
 * @returns {boolean} True if error indicates balance issue
 */
function isBalanceError(errorCode) {
    const balanceErrors = [1003, 1014, 1060, 1065];
    return balanceErrors.includes(errorCode);
}

/**
 * Get suggested actions for an error code
 * @param {number} errorCode - The error code
 * @returns {Array<string>} Array of suggested actions
 */
function getErrorSuggestions(errorCode) {
    const suggestions = {
        1003: ["Check your wallet balance", "Add more tokens to your wallet", "Try a smaller amount"],
        1007: ["Wait for pool to be unpaused", "Contact pool administrator", "Try a different pool"],
        1023: ["Wait for system maintenance to complete", "Check system status", "Try again later"],
        1035: ["Wait for pool liquidity operations to be resumed", "Contact the pool administrator", "Try a different pool", "Check pool status for updates"],
        1047: ["Verify expected output amount", "Check for precision differences", "Try adjusting input amount"],
        1060: ["Add more SOL to your wallet for fees", "Check fee requirements", "Ensure sufficient balance for gas"]
    };
    
    return suggestions[errorCode] || ["Try again later", "Contact support if issue persists"];
}

// ========================================
// EXPORTS
// ========================================

// Make functions available globally for HTML script tags
if (typeof window !== 'undefined') {
    window.ErrorCodes = ERROR_CODES;
    window.SolanaErrorCodes = SOLANA_ERROR_CODES;
    window.getErrorInfo = getErrorInfo;
    window.parseTransactionError = parseTransactionError;
    window.formatErrorForUser = formatErrorForUser;
    window.getErrorEmoji = getErrorEmoji;
    window.isPauseError = isPauseError;
    window.isBalanceError = isBalanceError;
    window.getErrorSuggestions = getErrorSuggestions;
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ERROR_CODES,
        SOLANA_ERROR_CODES,
        getErrorInfo,
        parseTransactionError,
        formatErrorForUser,
        getErrorEmoji,
        isPauseError,
        isBalanceError,
        getErrorSuggestions
    };
}
