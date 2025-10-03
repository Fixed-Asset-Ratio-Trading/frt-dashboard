<?php
/**
 * tSAT Circulating Supply API - Debug Version
 * 
 * This version bypasses cache and provides detailed error reporting
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

// Configuration
$FRT_POOL_ADDRESS = 'AnTuW1uDnQBnwSa2Yso8MFmknz8B3K4V1iZZNdMdEXNj';
$TSAT_TOKEN_ADDRESS = 'tSATdGGSLYBVCrm3pXiib8NmzKcB1iUdjRRseNGssxu';
$TSAT_DECIMALS = 2;
$TOTAL_SUPPLY = 21000000000000;

$debug = [];

try {
    // Load configuration
    $configPaths = [
        '/var/www/html/frt/config.json',
        __DIR__ . '/../frt/config.json',
        __DIR__ . '/../../frt/config.json'
    ];
    
    $config = null;
    foreach ($configPaths as $path) {
        $debug[] = "Checking config path: $path";
        if (file_exists($path)) {
            $debug[] = "Config file exists: $path";
            $config = json_decode(file_get_contents($path), true);
            if ($config && isset($config['solana']['rpcUrl'])) {
                $debug[] = "Config loaded successfully from: $path";
                break;
            }
        }
    }
    
    if (!$config) {
        throw new Exception('Config file not found or invalid');
    }
    
    $rpcUrl = $config['solana']['rpcUrl'];
    $debug[] = "Using RPC URL: $rpcUrl";
    
    // Make RPC call
    $data = [
        'jsonrpc' => '2.0',
        'id' => 1,
        'method' => 'getTokenAccountsByOwner',
        'params' => [
            $FRT_POOL_ADDRESS,
            ['mint' => $TSAT_TOKEN_ADDRESS],
            ['encoding' => 'jsonParsed']
        ]
    ];
    
    $debug[] = "Making RPC call to get token accounts";
    
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
    
    $debug[] = "HTTP Code: $httpCode";
    if ($curlError) {
        $debug[] = "Curl Error: $curlError";
    }
    
    if ($response === false || $httpCode != 200) {
        throw new Exception("RPC call failed: HTTP $httpCode, Error: $curlError");
    }
    
    $result = json_decode($response, true);
    
    if (isset($result['error'])) {
        throw new Exception('RPC error: ' . ($result['error']['message'] ?? 'Unknown error'));
    }
    
    $debug[] = "RPC call successful";
    
    // Extract token balance
    $tsatInPool = 0;
    if (isset($result['result']['value']) && count($result['result']['value']) > 0) {
        $account = $result['result']['value'][0];
        if (isset($account['account']['data']['parsed']['info']['tokenAmount']['amount'])) {
            $rawAmount = intval($account['account']['data']['parsed']['info']['tokenAmount']['amount']);
            $tsatInPool = intval($rawAmount / pow(10, $TSAT_DECIMALS));
            $debug[] = "Raw amount: $rawAmount";
            $debug[] = "Actual amount (with decimals): $tsatInPool tSAT";
        }
    } else {
        $debug[] = "No token accounts found in response";
    }
    
    // Calculate circulating supply
    $circulatingSupply = max(0, $TOTAL_SUPPLY - $tsatInPool);
    $debug[] = "Circulating supply calculated: $circulatingSupply";
    
    $result = [
        'success' => true,
        'circulating_supply' => $circulatingSupply,
        'total_supply' => $TOTAL_SUPPLY,
        'locked_in_pool' => $tsatInPool,
        'timestamp' => time(),
        'last_updated' => date('c'),
        'debug' => $debug
    ];
    
    echo json_encode($result, JSON_PRETTY_PRINT);
    
} catch (Exception $e) {
    $debug[] = "Exception caught: " . $e->getMessage();
    
    $result = [
        'success' => false,
        'error' => $e->getMessage(),
        'circulating_supply' => 0,
        'total_supply' => $TOTAL_SUPPLY,
        'locked_in_pool' => $TOTAL_SUPPLY,
        'timestamp' => time(),
        'last_updated' => date('c'),
        'debug' => $debug
    ];
    
    echo json_encode($result, JSON_PRETTY_PRINT);
}
?>
