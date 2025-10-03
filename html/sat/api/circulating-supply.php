<?php
/**
 * tSAT Circulating Supply API
 * 
 * CoinGecko-compatible API endpoint for tSAT circulating supply
 * Returns plain number by default (blockchain.info format)
 * 
 * Usage:
 * - https://satoshi15.com/api/circulating-supply.php (returns number)
 * - https://satoshi15.com/api/circulating-supply.php?format=json (returns JSON)
 * 
 * Based on: https://docs.google.com/document/d/1v27QFoQq1SKT3Priq3aqPgB70Xd_PnDzbOCiuoCyixw/edit
 * Uses RPC credentials from ../../frt/config.json for Solana mainnet access
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET');
header('Access-Control-Allow-Headers: Content-Type');

// Configuration
$FRT_POOL_ADDRESS = 'AnTuW1uDnQBnwSa2Yso8MFmknz8B3K4V1iZZNdMdEXNj';
$TSAT_TOKEN_ADDRESS = 'tSATdGGSLYBVCrm3pXiib8NmzKcB1iUdjRRseNGssxu';
$TSAT_DECIMALS = 2; // tSAT has 2 decimals
$TOTAL_SUPPLY = 21000000000000; // 21 trillion tSAT (whole tokens)
$CACHE_DURATION = 300; // 5 minutes

/**
 * Load configuration from config.json
 */
function loadConfig() {
    $configPaths = [
        __DIR__ . '/../../frt/config.json',
        '/var/www/html/frt/config.json',
        dirname(__DIR__) . '/../frt/config.json'
    ];
    
    foreach ($configPaths as $path) {
        if (file_exists($path)) {
            $config = json_decode(file_get_contents($path), true);
            if ($config && isset($config['solana']['rpcUrl'])) {
                return $config;
            }
        }
    }
    
    throw new Exception('Config file not found');
}

/**
 * Make RPC call to Solana with fallback support
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
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
            curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
            curl_setopt($ch, CURLOPT_TIMEOUT, 15);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
            
            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $curlError = curl_error($ch);
            curl_close($ch);
            
            if ($response === false || $httpCode != 200) {
                $lastError = "HTTP $httpCode: $curlError";
                continue;
            }
            
            $result = json_decode($response, true);
            
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
 * Calculate circulating supply with caching
 */
function calculateCirculatingSupply() {
    global $FRT_POOL_ADDRESS, $TSAT_TOKEN_ADDRESS, $TSAT_DECIMALS, $TOTAL_SUPPLY, $CACHE_DURATION;
    
    // Check cache first
    $cacheKey = 'tsat_circulating_supply_api';
    $cacheFile = sys_get_temp_dir() . '/' . $cacheKey . '.cache';
    
    if (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < $CACHE_DURATION) {
        $cached = json_decode(file_get_contents($cacheFile), true);
        if ($cached) {
            return $cached;
        }
    }
    
    try {
        // Load config with RPC credentials
        $config = loadConfig();
        
        // Get tSAT balance locked in the FRT pool (in whole tokens)
        $tsatInPool = getTsatBalanceInPool($FRT_POOL_ADDRESS, $TSAT_TOKEN_ADDRESS, $TSAT_DECIMALS, $config);
        
        // Calculate circulating supply: Total Supply - tSAT locked in pool
        $circulatingSupply = max(0, $TOTAL_SUPPLY - $tsatInPool);
        
        $result = [
            'circulating_supply' => $circulatingSupply,
            'total_supply' => $TOTAL_SUPPLY,
            'locked_in_pool' => $tsatInPool,
            'timestamp' => time(),
            'last_updated' => date('c'),
            'pool_address' => $FRT_POOL_ADDRESS,
            'tsat_token' => $TSAT_TOKEN_ADDRESS,
            'rpc_provider' => $config['solana']['provider'] ?? 'unknown'
        ];
        
        // Cache the result
        file_put_contents($cacheFile, json_encode($result));
        
        return $result;
        
    } catch (Exception $e) {
        // Return fallback data
        $fallback = [
            'circulating_supply' => 0,
            'total_supply' => $TOTAL_SUPPLY,
            'locked_in_pool' => $TOTAL_SUPPLY,
            'timestamp' => time(),
            'last_updated' => date('c'),
            'error' => $e->getMessage(),
            'fallback' => true
        ];
        
        // Cache fallback for shorter duration
        file_put_contents($cacheFile, json_encode($fallback));
        return $fallback;
    }
}

/**
 * Main API handler
 */
try {
    // Only allow GET requests
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        http_response_code(405);
        if (isset($_GET['format']) && $_GET['format'] === 'json') {
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Method not allowed']);
        } else {
            echo 'Method not allowed';
        }
        exit;
    }
    
    // Calculate circulating supply
    $result = calculateCirculatingSupply();
    
    // Return response based on format
    if (isset($_GET['format']) && $_GET['format'] === 'json') {
        header('Content-Type: application/json');
        echo json_encode($result, JSON_PRETTY_PRINT);
    } else {
        // Return plain number (CoinGecko format like blockchain.info)
        header('Content-Type: text/plain');
        echo $result['circulating_supply'];
    }
    
} catch (Exception $e) {
    http_response_code(500);
    
    if (isset($_GET['format']) && $_GET['format'] === 'json') {
        header('Content-Type: application/json');
        echo json_encode([
            'error' => 'Internal server error',
            'message' => $e->getMessage()
        ]);
    } else {
        echo '0'; // Return 0 on error for plain format
    }
}
?>