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

// Get RPC URL from config
$RPC_URL = 'https://api.mainnet-beta.solana.com';
if (file_exists(__DIR__ . '/config.json')) {
    $config = json_decode(file_get_contents(__DIR__ . '/config.json'), true);
    if ($config && isset($config['solana']['rpcUrl'])) {
        $RPC_URL = $config['solana']['rpcUrl'];
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
 * Fetch pool data from Solana RPC
 */
function fetchPoolDataFromRPC($poolAddress) {
    global $RPC_URL, $RPC_TIMEOUT, $PROGRAM_ID;
    
    $startTime = microtime(true);
    
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
    
    $response = @file_get_contents($RPC_URL, false, $context);
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
    // Cache hit - serve cached data
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

// Save to cache (non-blocking - don't fail if cache write fails)
saveToCache($poolAddress, $rpcData);

// Prepare response
$responseData = [
    'schema_version' => $SCHEMA_VERSION,
    'generated_at' => date('c'),
    'pool_address' => $poolAddress,
    'rpc_response' => $rpcData
];

// Serve fresh data
header('Cache-Control: public, max-age=60');
header('X-Cache-Status: miss');
header('X-Generated-At: ' . $responseData['generated_at']);

$totalTime = (microtime(true) - $startTime) * 1000;
logMetrics($poolAddress, 'request_complete', $totalTime, strlen(json_encode($responseData)));

echo json_encode($responseData);
?>
