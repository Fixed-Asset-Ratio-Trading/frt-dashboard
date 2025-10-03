<?php
/**
 * tSAT Circulating Supply API
 * 
 * Provides circulating supply data for tSAT token following CoinGecko API specifications.
 * Calculates: Total Supply (21T) - tSAT in FRT Pool = Circulating Supply
 * 
 * Endpoint: https://satoshi15.com/circulating-supply.php
 * Format: Returns plain number (CoinGecko format) or JSON with ?format=full
 * 
 * Uses RPC credentials from config.json for Solana mainnet access
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET');
header('Access-Control-Allow-Headers: Content-Type');

// Configuration
$FRT_POOL_ADDRESS = 'AnTuW1uDnQBnwSa2Yso8MFmknz8B3K4V1iZZNdMdEXNj';
$TSAT_TOKEN_ADDRESS = 'tSATdGGSLYBVCrm3pXiib8NmzKcB1iUdjRRseNGssxu';
$TSAT_DECIMALS = 2; // tSAT has 2 decimals
$TOTAL_SUPPLY = 21000000000000; // 21 trillion tSAT (maximum supply in whole tokens)

/**
 * Load configuration from config.json
 */
function loadConfig() {
    $configPaths = [
        '/var/www/html/frt/config.json',
        __DIR__ . '/../html/frt/config.json',
        __DIR__ . '/../frt/config.json',
        __DIR__ . '/../../frt/config.json'
    ];
    
    foreach ($configPaths as $path) {
        if (file_exists($path) && is_readable($path)) {
            $content = file_get_contents($path);
            if ($content !== false) {
                $config = json_decode($content, true);
                if ($config && isset($config['solana']['rpcUrl'])) {
                    return $config;
                }
            }
        }
    }
    
    throw new Exception('Config file not found or not readable');
}

/**
 * Make RPC call to Solana with retry logic
 */
function solanaRpcCall($method, $params, $config) {
    $rpcUrls = [$config['solana']['rpcUrl']];
    
    // Add fallback URLs if available
    if (isset($config['solana']['fallbackRpcUrls'])) {
        $rpcUrls = array_merge($rpcUrls, $config['solana']['fallbackRpcUrls']);
    }
    
    $lastError = null;
    
    foreach ($rpcUrls as $rpcUrl) {
        try {
            $data = [
                'jsonrpc' => '2.0',
                'id' => 1,
                'method' => $method,
                'params' => $params
            ];
            
            $ch = curl_init($rpcUrl);
            if (!$ch) {
                throw new Exception('Failed to initialize cURL');
            }
            
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_POST => true,
                CURLOPT_POSTFIELDS => json_encode($data),
                CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
                CURLOPT_TIMEOUT => 15,
                CURLOPT_CONNECTTIMEOUT => 10,
                CURLOPT_SSL_VERIFYPEER => false, // Temporarily disable SSL verification
                CURLOPT_SSL_VERIFYHOST => false,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_MAXREDIRS => 3
            ]);
            
            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $curlError = curl_error($ch);
            curl_close($ch);
            
            if ($response === false) {
                $lastError = "cURL failed: $curlError";
                continue;
            }
            
            if ($httpCode !== 200) {
                $lastError = "HTTP $httpCode from $rpcUrl";
                continue;
            }
            
            $result = json_decode($response, true);
            if (json_last_error() !== JSON_ERROR_NONE) {
                $lastError = "Invalid JSON response from $rpcUrl";
                continue;
            }
            
            if (isset($result['error'])) {
                $lastError = 'RPC error: ' . ($result['error']['message'] ?? 'Unknown error');
                continue;
            }
            
            return $result['result'] ?? null;
            
        } catch (Exception $e) {
            $lastError = $e->getMessage();
            continue;
        }
    }
    
    throw new Exception($lastError ?? 'All RPC endpoints failed');
}

/**
 * Get token accounts for a specific owner and mint
 */
function getTokenAccountsByOwner($owner, $mint, $config) {
    return solanaRpcCall('getTokenAccountsByOwner', [
        $owner,
        ['mint' => $mint],
        ['encoding' => 'jsonParsed']
    ], $config);
}

/**
 * Get tSAT balance in FRT pool
 */
function getTsatBalanceInPool($poolAddress, $tsatTokenAddress, $decimals, $config) {
    $result = getTokenAccountsByOwner($poolAddress, $tsatTokenAddress, $config);
    
    if (isset($result['value']) && count($result['value']) > 0) {
        $account = $result['value'][0];
        if (isset($account['account']['data']['parsed']['info']['tokenAmount']['amount'])) {
            $rawAmount = intval($account['account']['data']['parsed']['info']['tokenAmount']['amount']);
            // Convert from raw amount to actual tokens by dividing by 10^decimals
            return intval($rawAmount / pow(10, $decimals));
        }
    }
    
    return 0;
}

/**
 * Calculate circulating supply
 */
function calculateCirculatingSupply() {
    global $FRT_POOL_ADDRESS, $TSAT_TOKEN_ADDRESS, $TSAT_DECIMALS, $TOTAL_SUPPLY;
    
    try {
        // Load config
        $config = loadConfig();
        
        // Get tSAT balance locked in the FRT pool (in whole tokens)
        $tsatInPool = getTsatBalanceInPool($FRT_POOL_ADDRESS, $TSAT_TOKEN_ADDRESS, $TSAT_DECIMALS, $config);
        
        // Calculate circulating supply: Total Supply - tSAT locked in pool
        $circulatingSupply = max(0, $TOTAL_SUPPLY - $tsatInPool);
        
        return [
            'circulating_supply' => $circulatingSupply,
            'total_supply' => $TOTAL_SUPPLY,
            'locked_in_pool' => $tsatInPool,
            'timestamp' => time(),
            'last_updated' => date('c'),
            'pool_address' => $FRT_POOL_ADDRESS,
            'tsat_token' => $TSAT_TOKEN_ADDRESS
        ];
        
    } catch (Exception $e) {
        // Return fallback data if calculation fails
        return [
            'circulating_supply' => 0,
            'total_supply' => $TOTAL_SUPPLY,
            'locked_in_pool' => $TOTAL_SUPPLY,
            'timestamp' => time(),
            'last_updated' => date('c'),
            'error' => $e->getMessage()
        ];
    }
}

/**
 * Main API handler
 */
try {
    // Only allow GET requests
    if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] !== 'GET') {
        http_response_code(405);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Method not allowed']);
        exit;
    }
    
    // Calculate circulating supply
    $result = calculateCirculatingSupply();
    
    // Return response based on format
    if (isset($_GET['format']) && $_GET['format'] === 'full') {
        header('Content-Type: application/json');
        echo json_encode($result, JSON_PRETTY_PRINT);
    } else {
        // Return just the circulating supply value (CoinGecko standard format)
        header('Content-Type: text/plain');
        echo $result['circulating_supply'];
    }
    
} catch (Exception $e) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode([
        'error' => 'Internal server error',
        'message' => $e->getMessage()
    ]);
}
?>