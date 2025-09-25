<?php
/**
 * Pool Data Cache Server
 * 
 * Provides cached access to Solana pool state data with fallback to RPC
 * - Caches raw Solana RPC getAccountInfo responses
 * - 24-hour file-based cache with atomic writes
 * - Comprehensive validation and metrics logging
 * 
 * Usage: /pool-data.php?poolAddress=<base58_address>
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

// Configuration
$CACHE_DIR = __DIR__ . '/cache/pool_data';
$CACHE_DURATION = 24 * 60 * 60; // 24 hours in seconds
$METRICS_FILE = $CACHE_DIR . '/metrics.log';
$SCHEMA_VERSION = '1.0.0';
$PROGRAM_ID = 'quXSYkeZ8ByTCtYY1J1uxQmE36UZ3LmNGgE3CYMFixD'; // FRT Program ID
$RPC_TIMEOUT = 15; // seconds

// Get RPC URL from config with fallbacks
$RPC_URL = 'https://api.mainnet-beta.solana.com';
$FALLBACK_RPC_URLS = [];
if (file_exists(__DIR__ . '/config.json')) {
    $config = json_decode(file_get_contents(__DIR__ . '/config.json'), true);
    if ($config && isset($config['solana']['rpcUrl'])) {
        $RPC_URL = $config['solana']['rpcUrl'];
    }
    if ($config && isset($config['solana']['fallbackRpcUrls'])) {
        $FALLBACK_RPC_URLS = $config['solana']['fallbackRpcUrls'];
    }
}

// Create cache directory if it doesn't exist
if (!file_exists($CACHE_DIR)) {
    if (!mkdir($CACHE_DIR, 0755, true)) {
        error_log("Failed to create cache directory: $CACHE_DIR");
        http_response_code(500);
        echo json_encode(['error' => 'Server configuration error']);
        exit;
    }
}

/**
 * Validate pool address format
 */
function validatePoolAddress($address) {
    // Base58 characters only (excluding 0, O, I, l), typical Solana address length 32-44
    if (!preg_match('/^[1-9A-HJ-NP-Za-km-z]{32,44}$/', $address)) {
        return false;
    }
    
    // Additional length check for Solana addresses (most are 43-44 characters)
    if (strlen($address) < 32 || strlen($address) > 44) {
        return false;
    }
    
    return true;
}

/**
 * Sanitize filename for safe filesystem operations
 */
function sanitizeFilename($address) {
    // Only allow alphanumeric characters
    return preg_replace('/[^A-Za-z0-9]/', '', $address);
}

/**
 * Log metrics for monitoring
 */
function logMetrics($poolAddress, $action, $responseTimeMs = null, $fileSizeBytes = null, $error = null) {
    global $METRICS_FILE;
    
    $logEntry = [
        'timestamp' => date('c'),
        'pool_address' => substr($poolAddress, 0, 8) . '...', // Truncate for privacy
        'action' => $action,
        'response_time_ms' => $responseTimeMs,
        'file_size_bytes' => $fileSizeBytes,
        'error' => $error
    ];
    
    $logLine = json_encode($logEntry) . "\n";
    @file_put_contents($METRICS_FILE, $logLine, FILE_APPEND | LOCK_EX);
}

/**
 * Fetch pool data from Solana RPC with fallback support
 */
function fetchPoolDataFromRPC($poolAddress) {
    global $RPC_URL, $FALLBACK_RPC_URLS, $RPC_TIMEOUT, $PROGRAM_ID;
    
    // Try primary RPC first, then fallbacks
    $rpcUrls = array_merge([$RPC_URL], $FALLBACK_RPC_URLS);
    
    foreach ($rpcUrls as $currentRpcUrl) {
        $startTime = microtime(true);
        
        $result = tryRpcEndpoint($poolAddress, $currentRpcUrl, $startTime);
        if ($result !== false) {
            return $result;
        }
        
        // Log failed attempt
        logMetrics($poolAddress, 'rpc_endpoint_failed', (microtime(true) - $startTime) * 1000, null, "Failed: $currentRpcUrl");
    }
    
    // All endpoints failed
    logMetrics($poolAddress, 'all_rpc_failed', null, null, 'All RPC endpoints failed');
    return false;
}

/**
 * Try a single RPC endpoint
 */
function tryRpcEndpoint($poolAddress, $rpcUrl, $startTime) {
    global $RPC_TIMEOUT, $PROGRAM_ID;
    
    // Prepare RPC request
    $rpcPayload = [
        'jsonrpc' => '2.0',
        'id' => 1,
        'method' => 'getAccountInfo',
        'params' => [
            $poolAddress,
            [
                'encoding' => 'base64',
                'commitment' => 'confirmed'
            ]
        ]
    ];
    
    $context = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => [
                'Content-Type: application/json',
                'User-Agent: FRT-PoolCache/1.0'
            ],
            'content' => json_encode($rpcPayload),
            'timeout' => $RPC_TIMEOUT
        ]
    ]);
    
    $response = @file_get_contents($rpcUrl, false, $context);
    $responseTime = (microtime(true) - $startTime) * 1000; // Convert to milliseconds
    
    if ($response === false) {
        logMetrics($poolAddress, 'rpc_fetch_failed', $responseTime, null, 'Network error');
        return false;
    }
    
    $data = json_decode($response, true);
    if (!$data || isset($data['error'])) {
        $error = isset($data['error']) ? $data['error']['message'] : 'Invalid JSON response';
        logMetrics($poolAddress, 'rpc_fetch_failed', $responseTime, null, $error);
        return false;
    }
    
    // Check if account exists
    if (!isset($data['result']['value']) || $data['result']['value'] === null) {
        logMetrics($poolAddress, 'pool_not_found', $responseTime, null, 'Account does not exist');
        return null; // Account doesn't exist
    }
    
    $accountInfo = $data['result']['value'];
    
    // Verify this is a program-owned account
    $actualOwner = trim($accountInfo['owner']);
    $expectedOwner = trim($PROGRAM_ID);
    
    if ($actualOwner !== $expectedOwner) {
        logMetrics($poolAddress, 'invalid_owner', $responseTime, null, "Expected: '$expectedOwner', Got: '$actualOwner'");
        return null; // Not owned by our program
    }
    
    // Verify account has data (pools should have substantial data)
    if (!isset($accountInfo['data'][0]) || strlen($accountInfo['data'][0]) < 100) {
        logMetrics($poolAddress, 'insufficient_data', $responseTime, null, 'Account data too small');
        return null; // Insufficient data for a pool
    }
    
    logMetrics($poolAddress, 'rpc_fetch', $responseTime, strlen($response));
    
    return [
        'context' => $data['result']['context'],
        'value' => $accountInfo
    ];
}

/**
 * Save pool data to cache with atomic write
 */
function saveToCache($poolAddress, $rpcResponse) {
    global $CACHE_DIR, $SCHEMA_VERSION;
    
    $filename = sanitizeFilename($poolAddress);
    $cacheFile = $CACHE_DIR . '/' . $filename . '.json';
    $tempFile = $cacheFile . '.tmp';
    
    $cacheData = [
        'schema_version' => $SCHEMA_VERSION,
        'generated_at' => date('c'),
        'pool_address' => $poolAddress,
        'rpc_response' => $rpcResponse
    ];
    
    $jsonData = json_encode($cacheData, JSON_PRETTY_PRINT);
    
    // Atomic write: write to temp file, then rename
    if (file_put_contents($tempFile, $jsonData, LOCK_EX) === false) {
        logMetrics($poolAddress, 'cache_write_failed', null, null, 'Failed to write temp file');
        return false;
    }
    
    if (!rename($tempFile, $cacheFile)) {
        @unlink($tempFile); // Clean up temp file
        logMetrics($poolAddress, 'cache_write_failed', null, null, 'Failed to rename temp file');
        return false;
    }
    
    // Set proper permissions
    @chmod($cacheFile, 0644);
    
    logMetrics($poolAddress, 'cache_write', null, strlen($jsonData));
    return true;
}

/**
 * Load pool data from cache
 */
function loadFromCache($poolAddress) {
    global $CACHE_DIR, $CACHE_DURATION, $SCHEMA_VERSION;
    
    $filename = sanitizeFilename($poolAddress);
    $cacheFile = $CACHE_DIR . '/' . $filename . '.json';
    
    if (!file_exists($cacheFile)) {
        return false;
    }
    
    // Check if cache is expired
    $fileAge = time() - filemtime($cacheFile);
    if ($fileAge > $CACHE_DURATION) {
        logMetrics($poolAddress, 'cache_expired', null, filesize($cacheFile));
        return false;
    }
    
    $jsonData = @file_get_contents($cacheFile);
    if ($jsonData === false) {
        logMetrics($poolAddress, 'cache_read_failed', null, null, 'Failed to read cache file');
        return false;
    }
    
    $cacheData = json_decode($jsonData, true);
    if (!$cacheData) {
        logMetrics($poolAddress, 'cache_read_failed', null, null, 'Invalid JSON in cache file');
        return false;
    }
    
    // Check schema version compatibility
    if (!isset($cacheData['schema_version']) || $cacheData['schema_version'] !== $SCHEMA_VERSION) {
        logMetrics($poolAddress, 'cache_schema_mismatch', null, null, "Version: {$cacheData['schema_version']}");
        return false;
    }
    
    logMetrics($poolAddress, 'cache_hit', null, strlen($jsonData));
    return $cacheData;
}

/**
 * Parse binary pool data to extract pool state fields
 */
function parsePoolState($binaryData) {
    $offset = 0;
    
    // Helper functions
    $readPubkey = function() use ($binaryData, &$offset) {
        $pubkey = substr($binaryData, $offset, 32);
        $offset += 32;
        return base58_encode($pubkey);
    };
    
    $readU64 = function() use ($binaryData, &$offset) {
        $bytes = substr($binaryData, $offset, 8);
        $offset += 8;
        // Little-endian u64
        $value = 0;
        for ($i = 0; $i < 8; $i++) {
            $value += ord($bytes[$i]) * pow(256, $i);
        }
        return $value;
    };
    
    $readI64 = function() use ($binaryData, &$offset) {
        $bytes = substr($binaryData, $offset, 8);
        $offset += 8;
        // Little-endian i64
        $value = 0;
        for ($i = 0; $i < 8; $i++) {
            $value += ord($bytes[$i]) * pow(256, $i);
        }
        // Handle signed
        if ($value >= pow(2, 63)) {
            $value -= pow(2, 64);
        }
        return $value;
    };
    
    $readU8 = function() use ($binaryData, &$offset) {
        $value = ord($binaryData[$offset]);
        $offset += 1;
        return $value;
    };
    
    // Parse pool state fields
    $owner = $readPubkey();
    $tokenAMint = $readPubkey();
    $tokenBMint = $readPubkey();
    $tokenAVault = $readPubkey();
    $tokenBVault = $readPubkey();
    $lpTokenAMint = $readPubkey();
    $lpTokenBMint = $readPubkey();
    
    $ratioANumerator = $readU64();
    $ratioBDenominator = $readU64();
    $totalTokenALiquidity = $readU64();
    $totalTokenBLiquidity = $readU64();
    
    // Bump seeds
    $poolAuthorityBumpSeed = $readU8();
    $tokenAVaultBumpSeed = $readU8();
    $tokenBVaultBumpSeed = $readU8();
    $lpTokenAMintBumpSeed = $readU8();
    $lpTokenBMintBumpSeed = $readU8();
    
    // Flags
    $flags = $readU8();
    
    // Fee configuration
    $contractLiquidityFee = $readU64();
    $swapContractFee = $readU64();
    
    // Token fee tracking
    $collectedFeesTokenA = $readU64();
    $collectedFeesTokenB = $readU64();
    $totalFeesWithdrawnTokenA = $readU64();
    $totalFeesWithdrawnTokenB = $readU64();
    
    // SOL fee tracking
    $collectedLiquidityFees = $readU64();
    $collectedSwapContractFees = $readU64();
    $totalSolFeesCollected = $readU64();
    
    // Consolidation data
    $lastConsolidationTimestamp = $readI64();
    $totalConsolidations = $readU64();
    $totalFeesConsolidated = $readU64();
    
    return [
        'owner' => $owner,
        'token_a_mint' => $tokenAMint,
        'token_b_mint' => $tokenBMint,
        'token_a_vault' => $tokenAVault,
        'token_b_vault' => $tokenBVault,
        'lp_token_a_mint' => $lpTokenAMint,
        'lp_token_b_mint' => $lpTokenBMint,
        'ratio_a_numerator' => $ratioANumerator,
        'ratio_b_denominator' => $ratioBDenominator,
        'total_token_a_liquidity' => $totalTokenALiquidity,
        'total_token_b_liquidity' => $totalTokenBLiquidity,
        'pool_authority_bump_seed' => $poolAuthorityBumpSeed,
        'token_a_vault_bump_seed' => $tokenAVaultBumpSeed,
        'token_b_vault_bump_seed' => $tokenBVaultBumpSeed,
        'lp_token_a_mint_bump_seed' => $lpTokenAMintBumpSeed,
        'lp_token_b_mint_bump_seed' => $lpTokenBMintBumpSeed,
        'flags' => $flags,
        'contract_liquidity_fee' => $contractLiquidityFee,
        'swap_contract_fee' => $swapContractFee,
        'collected_fees_token_a' => $collectedFeesTokenA,
        'collected_fees_token_b' => $collectedFeesTokenB,
        'total_fees_withdrawn_token_a' => $totalFeesWithdrawnTokenA,
        'total_fees_withdrawn_token_b' => $totalFeesWithdrawnTokenB,
        'collected_liquidity_fees' => $collectedLiquidityFees,
        'collected_swap_contract_fees' => $collectedSwapContractFees,
        'total_sol_fees_collected' => $totalSolFeesCollected,
        'last_consolidation_timestamp' => $lastConsolidationTimestamp,
        'total_consolidations' => $totalConsolidations,
        'total_fees_consolidated' => $totalFeesConsolidated,
        'flags_decoded' => [
            'one_to_many_ratio' => ($flags & 1) !== 0,
            'liquidity_paused' => ($flags & 2) !== 0,
            'swaps_paused' => ($flags & 4) !== 0,
            'withdrawal_protection' => ($flags & 8) !== 0,
            'single_lp_token_mode' => ($flags & 16) !== 0,
            'swap_owner_only' => ($flags & 32) !== 0
        ]
    ];
}

/**
 * Base58 encode function with GMP and BCMath fallback
 */
function base58_encode($data) {
    $alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    
    if (extension_loaded('gmp')) {
        // Use GMP for proper base58 encoding (preferred)
        $num = gmp_init('0');
        for ($i = 0; $i < strlen($data); $i++) {
            $num = gmp_add(gmp_mul($num, 256), ord($data[$i]));
        }
        
        $result = '';
        while (gmp_cmp($num, 0) > 0) {
            list($num, $remainder) = gmp_div_qr($num, 58);
            $result = $alphabet[gmp_intval($remainder)] . $result;
        }
        
        // Handle leading zeros
        for ($i = 0; $i < strlen($data) && ord($data[$i]) === 0; $i++) {
            $result = '1' . $result;
        }
        
        return $result;
    } elseif (extension_loaded('bcmath')) {
        // BCMath fallback
        $num = '0';
        for ($i = 0; $i < strlen($data); $i++) {
            $num = bcadd(bcmul($num, '256'), ord($data[$i]));
        }
        
        $result = '';
        while (bccomp($num, '0') > 0) {
            $remainder = bcmod($num, '58');
            $num = bcdiv($num, '58');
            $result = $alphabet[intval($remainder)] . $result;
        }
        
        // Handle leading zeros
        for ($i = 0; $i < strlen($data) && ord($data[$i]) === 0; $i++) {
            $result = '1' . $result;
        }
        
        return $result;
    } else {
        // Last resort: return hex with error message
        error_log("ERROR: Neither GMP nor BCMath extensions available for base58 encoding");
        return 'hex:' . bin2hex($data);
    }
}

/**
 * Fetch token decimals from mint account
 */
function fetchTokenDecimals($mintAddress, $rpcUrl) {
    global $RPC_TIMEOUT;
    
    $rpcPayload = [
        'jsonrpc' => '2.0',
        'id' => 1,
        'method' => 'getAccountInfo',
        'params' => [
            $mintAddress,
            [
                'encoding' => 'base64',
                'commitment' => 'confirmed'
            ]
        ]
    ];
    
    $context = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => [
                'Content-Type: application/json',
                'User-Agent: FRT-PoolCache/1.0'
            ],
            'content' => json_encode($rpcPayload),
            'timeout' => $RPC_TIMEOUT
        ]
    ]);
    
    $response = @file_get_contents($rpcUrl, false, $context);
    if ($response === false) {
        return 6; // Default decimals
    }
    
    $data = json_decode($response, true);
    if (!$data || !isset($data['result']['value']['data'][0])) {
        return 6; // Default decimals
    }
    
    // Parse mint data to get decimals (at offset 44)
    $mintData = base64_decode($data['result']['value']['data'][0]);
    if (strlen($mintData) > 44) {
        return ord($mintData[44]);
    }
    
    return 6; // Default decimals
}

/**
 * Load token metadata from cache (created by token-image.php)
 */
function loadTokenMetadataFromCache($mintAddress) {
    $metadataCacheDir = __DIR__ . '/cache/token-metadata';
    $metadataFile = $metadataCacheDir . '/' . $mintAddress . '.json';
    
    if (!file_exists($metadataFile)) {
        return null;
    }
    
    // Check if cache is expired (60 days)
    if ((time() - filemtime($metadataFile)) > (60 * 24 * 60 * 60)) {
        return null;
    }
    
    $cacheData = json_decode(file_get_contents($metadataFile), true);
    return $cacheData ? $cacheData['metadata'] : null;
}

/**
 * Trigger token-image.php to populate metadata cache
 */
function triggerTokenImageCaching($mintAddress) {
    // Make a request to token-image.php which will cache the metadata
    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'timeout' => 15,
            'user_agent' => 'FRT-PoolCache/1.0'
        ]
    ]);
    
    $baseUrl = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http') . 
               '://' . $_SERVER['HTTP_HOST'] . 
               dirname($_SERVER['REQUEST_URI']);
    
    $tokenImageUrl = $baseUrl . "/token-image.php?mint=" . $mintAddress;
    
    // Fire and forget request to populate cache
    @file_get_contents($tokenImageUrl, false, $context);
}

/**
 * Fetch token metadata using cached data from token-image.php
 */
function fetchTokenMetadata($mintAddress, $rpcUrl) {
    // First, try to load from cache
    $cachedMetadata = loadTokenMetadataFromCache($mintAddress);
    if ($cachedMetadata) {
        return [
            'symbol' => $cachedMetadata['symbol'] ?? substr($mintAddress, 0, 4),
            'name' => $cachedMetadata['name'] ?? 'Token ' . substr($mintAddress, 0, 4)
        ];
    }
    
    // If not cached, trigger token-image.php to populate cache
    triggerTokenImageCaching($mintAddress);
    
    // Try to load again after triggering
    $cachedMetadata = loadTokenMetadataFromCache($mintAddress);
    if ($cachedMetadata) {
        return [
            'symbol' => $cachedMetadata['symbol'] ?? substr($mintAddress, 0, 4),
            'name' => $cachedMetadata['name'] ?? 'Token ' . substr($mintAddress, 0, 4)
        ];
    }
    
    // Fallback to basic info
    return [
        'symbol' => substr($mintAddress, 0, 4),
        'name' => 'Token ' . substr($mintAddress, 0, 4)
    ];
}

// Main execution starts here
$startTime = microtime(true);

// Get and validate pool address parameter
$poolAddress = $_GET['poolAddress'] ?? '';

if (empty($poolAddress)) {
    http_response_code(400);
    echo json_encode([
        'error' => 'Missing poolAddress parameter',
        'usage' => 'pool-data.php?poolAddress=<base58_address>'
    ]);
    exit;
}

if (!validatePoolAddress($poolAddress)) {
    http_response_code(400);
    logMetrics($poolAddress, 'invalid_address', null, null, 'Invalid format');
    echo json_encode([
        'error' => 'Invalid pool address format',
        'provided' => $poolAddress
    ]);
    exit;
}

// Try to load from cache first
$cachedData = loadFromCache($poolAddress);

if ($cachedData !== false) {
    // Cache hit - check if we need to enrich with parsed data
    if (!isset($cachedData['parsed_pool_data'])) {
        try {
            // Parse cached binary data
            $binaryData = base64_decode($cachedData['rpc_response']['value']['data'][0]);
            $parsedPoolData = parsePoolState($binaryData);
            $parsedPoolData['address'] = $poolAddress;
            
            // Fetch token metadata
            $tokenADecimals = fetchTokenDecimals($parsedPoolData['token_a_mint'], $RPC_URL);
            $tokenBDecimals = fetchTokenDecimals($parsedPoolData['token_b_mint'], $RPC_URL);
            $tokenAMetadata = fetchTokenMetadata($parsedPoolData['token_a_mint'], $RPC_URL);
            $tokenBMetadata = fetchTokenMetadata($parsedPoolData['token_b_mint'], $RPC_URL);
            
            // Add enriched data
            $parsedPoolData['ratio_a_decimal'] = $tokenADecimals;
            $parsedPoolData['ratio_b_decimal'] = $tokenBDecimals;
            $parsedPoolData['ratio_a_actual'] = $parsedPoolData['ratio_a_numerator'] / pow(10, $tokenADecimals);
            $parsedPoolData['ratio_b_actual'] = $parsedPoolData['ratio_b_denominator'] / pow(10, $tokenBDecimals);
            $parsedPoolData['token_a_ticker'] = $tokenAMetadata['symbol'];
            $parsedPoolData['token_b_ticker'] = $tokenBMetadata['symbol'];
            $parsedPoolData['token_a_description'] = $tokenAMetadata['name'];
            $parsedPoolData['token_b_description'] = $tokenBMetadata['name'];
            
            $cachedData['parsed_pool_data'] = $parsedPoolData;
            
            logMetrics($poolAddress, 'cache_enriched', null, null, null);
        } catch (Exception $e) {
            logMetrics($poolAddress, 'cache_enrich_failed', null, null, $e->getMessage());
        }
    }
    
    header('Cache-Control: public, max-age=60');
    header('X-Cache-Status: hit');
    header('X-Generated-At: ' . $cachedData['generated_at']);
    
    echo json_encode($cachedData);
    exit;
}

// Cache miss - fetch from RPC
logMetrics($poolAddress, 'cache_miss');

$rpcData = fetchPoolDataFromRPC($poolAddress);

if ($rpcData === false) {
    // RPC fetch failed
    http_response_code(504);
    echo json_encode([
        'error' => 'Failed to fetch pool data from Solana RPC',
        'pool_address' => $poolAddress
    ]);
    exit;
}

if ($rpcData === null) {
    // Pool doesn't exist or is invalid
    http_response_code(404);
    echo json_encode([
        'error' => 'Pool not found or invalid',
        'pool_address' => $poolAddress
    ]);
    exit;
}

// Parse the pool data and fetch token metadata
$parsedPoolData = null;
$tokenAData = null;
$tokenBData = null;

try {
    // Parse binary pool data
    $binaryData = base64_decode($rpcData['value']['data'][0]);
    $parsedPoolData = parsePoolState($binaryData);
    
    // Add address to parsed data
    $parsedPoolData['address'] = $poolAddress;
    
    // Fetch token decimals and metadata
    $tokenADecimals = fetchTokenDecimals($parsedPoolData['token_a_mint'], $RPC_URL);
    $tokenBDecimals = fetchTokenDecimals($parsedPoolData['token_b_mint'], $RPC_URL);
    
    error_log("Fetching metadata for Token A: " . $parsedPoolData['token_a_mint']);
    $tokenAMetadata = fetchTokenMetadata($parsedPoolData['token_a_mint'], $RPC_URL);
    error_log("Token A metadata: " . json_encode($tokenAMetadata));
    
    error_log("Fetching metadata for Token B: " . $parsedPoolData['token_b_mint']);
    $tokenBMetadata = fetchTokenMetadata($parsedPoolData['token_b_mint'], $RPC_URL);
    error_log("Token B metadata: " . json_encode($tokenBMetadata));
    
    // Add decimal and metadata information
    $parsedPoolData['ratio_a_decimal'] = $tokenADecimals;
    $parsedPoolData['ratio_b_decimal'] = $tokenBDecimals;
    $parsedPoolData['ratio_a_actual'] = $parsedPoolData['ratio_a_numerator'] / pow(10, $tokenADecimals);
    $parsedPoolData['ratio_b_actual'] = $parsedPoolData['ratio_b_denominator'] / pow(10, $tokenBDecimals);
    
    $parsedPoolData['token_a_ticker'] = $tokenAMetadata['symbol'];
    $parsedPoolData['token_b_ticker'] = $tokenBMetadata['symbol'];
    $parsedPoolData['token_a_description'] = $tokenAMetadata['name'];
    $parsedPoolData['token_b_description'] = $tokenBMetadata['name'];
    
    logMetrics($poolAddress, 'pool_parsed_successfully', null, null, null);
} catch (Exception $e) {
    logMetrics($poolAddress, 'pool_parse_failed', null, null, $e->getMessage());
    // Continue with raw data if parsing fails
}

// Save to cache (non-blocking - don't fail if cache write fails)
saveToCache($poolAddress, $rpcData);

// Prepare response with both raw and parsed data
$responseData = [
    'schema_version' => $SCHEMA_VERSION,
    'generated_at' => date('c'),
    'pool_address' => $poolAddress,
    'rpc_response' => $rpcData
];

// Add parsed data if available
if ($parsedPoolData !== null) {
    $responseData['parsed_pool_data'] = $parsedPoolData;
}

// Serve fresh data
header('Cache-Control: public, max-age=60');
header('X-Cache-Status: miss');
header('X-Generated-At: ' . $responseData['generated_at']);

$totalTime = (microtime(true) - $startTime) * 1000;
logMetrics($poolAddress, 'request_complete', $totalTime, strlen(json_encode($responseData)));

echo json_encode($responseData);
?>
