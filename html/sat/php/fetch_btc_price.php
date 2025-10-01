<?php
// fetch_btc_price.php - Fetch BTC and tSAT prices and store in JSON file
// This script fetches BTC price from CoinGecko API and tSAT price from DexScreener API

function fetchBTCPrice() {
    // CoinGecko API endpoint for Bitcoin price
    $url = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd';
    
    // Initialize cURL
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    curl_setopt($ch, CURLOPT_USERAGENT, 'tSAT-Price-Fetcher/1.0');
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($httpCode === 200 && $response) {
        $data = json_decode($response, true);
        if (isset($data['bitcoin']['usd'])) {
            return $data['bitcoin']['usd'];
        }
    }
    
    return null;
}

function fetchTSATPrice() {
    // DexScreener API endpoint for tSAT/WBTC pair on Raydium
    $url = 'https://api.dexscreener.com/latest/dex/pairs/solana/HBYPtnEwREpfk2UmaVTfG8MFp9D8xye41uEo9wZo9ox4';
    
    // Initialize cURL
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    curl_setopt($ch, CURLOPT_USERAGENT, 'tSAT-Price-Fetcher/1.0');
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($httpCode === 200 && $response) {
        $data = json_decode($response, true);
        if (isset($data['pair']['priceNative']) && isset($data['pair']['priceUsd'])) {
            return [
                'priceNative' => floatval($data['pair']['priceNative']), // Price in BTC
                'priceUsd' => floatval($data['pair']['priceUsd']) // Price in USD
            ];
        }
    }
    
    return null;
}

function calculatePegDeviation($currentPrice) {
    // Target price is 0.00000001000 BTC (10 satoshis)
    $targetPrice = 0.00000001000;
    
    // Calculate percentage deviation: ((current - target) / target) * 100
    $deviation = (($currentPrice - $targetPrice) / $targetPrice) * 100;
    
    return round($deviation, 4); // Round to 4 decimal places
}

function updatePriceFile($btcPrice, $tsatData) {
    // Set timezone to UTC for consistent timestamps
    date_default_timezone_set('UTC');
    
    $tsatPriceInBTC = $tsatData['priceNative'];
    $tsatPriceInUSD = $tsatData['priceUsd'];
    $pegDeviation = calculatePegDeviation($tsatPriceInBTC);
    
    $priceData = [
        'btc_price_usd' => $btcPrice,
        'tsat_price_usd' => $btcPrice / 100000000, // 1 tSAT = 1 satoshi = 1/100,000,000 BTC (theoretical)
        'tsat_market_price_btc' => $tsatPriceInBTC, // Actual market price in BTC from DEX
        'tsat_market_price_usd' => $tsatPriceInUSD, // Actual market price in USD from DEX
        'tsat_peg_deviation_percent' => $pegDeviation, // Percentage deviation from 10 satoshi target
        'last_updated_utc' => gmdate('Y-m-d\TH:i:s\Z'), // ISO 8601 UTC format
        'timestamp' => time() // Unix timestamp (always UTC)
    ];
    
    $jsonFile = '/var/www/html/sat/satoshi15.json';
    $jsonData = json_encode($priceData, JSON_PRETTY_PRINT);
    
    if (file_put_contents($jsonFile, $jsonData)) {
        echo "Price updated successfully:\n";
        echo "  BTC: $" . number_format($btcPrice, 2) . "\n";
        echo "  tSAT Market Price: " . sprintf("%.12f", $tsatPriceInBTC) . " BTC ($" . sprintf("%.6f", $tsatPriceInUSD) . ")\n";
        echo "  Peg Deviation: " . sprintf("%+.4f", $pegDeviation) . "%\n";
        echo "  Updated at: " . gmdate('Y-m-d H:i:s') . " UTC\n";
        return true;
    } else {
        echo "Failed to write price file\n";
        return false;
    }
}

// Main execution
$btcPrice = fetchBTCPrice();
$tsatData = fetchTSATPrice();

if ($btcPrice !== null && $tsatData !== null) {
    updatePriceFile($btcPrice, $tsatData);
} else {
    if ($btcPrice === null) {
        echo "Failed to fetch BTC price\n";
    }
    if ($tsatData === null) {
        echo "Failed to fetch tSAT price from DexScreener\n";
    }
    exit(1);
}
?>
