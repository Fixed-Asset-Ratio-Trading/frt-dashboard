<?php
// fetch_btc_price.php - Fetch BTC price and store in JSON file
// This script fetches BTC price from CoinGecko API and stores it in satoshi15.json

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

function updatePriceFile($btcPrice) {
    // Set timezone to UTC for consistent timestamps
    date_default_timezone_set('UTC');
    
    $priceData = [
        'btc_price_usd' => $btcPrice,
        'tsat_price_usd' => $btcPrice / 100000000, // 1 tSAT = 1 satoshi = 1/100,000,000 BTC
        'last_updated_utc' => gmdate('Y-m-d\TH:i:s\Z'), // ISO 8601 UTC format
        'timestamp' => time() // Unix timestamp (always UTC)
    ];
    
    $jsonFile = '/var/www/html/satoshi15.json';
    $jsonData = json_encode($priceData, JSON_PRETTY_PRINT);
    
    if (file_put_contents($jsonFile, $jsonData)) {
        echo "Price updated successfully: BTC $" . number_format($btcPrice, 2) . " at " . gmdate('Y-m-d H:i:s') . " UTC\n";
        return true;
    } else {
        echo "Failed to write price file\n";
        return false;
    }
}

// Main execution
$btcPrice = fetchBTCPrice();

if ($btcPrice !== null) {
    updatePriceFile($btcPrice);
} else {
    echo "Failed to fetch BTC price\n";
    exit(1);
}
?>
