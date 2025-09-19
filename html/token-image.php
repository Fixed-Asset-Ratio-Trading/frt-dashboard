<?php
/**
 * Token Image Cache Server
 * 
 * Fetches and caches token images from:
 * 1. DexScreener (fastest)
 * 2. Metaplex metadata -> JSON -> image
 * 3. IPFS fallback via Pinata gateway
 * 
 * Usage: /token-image.php?mint=<mint_address>
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET');
header('Access-Control-Allow-Headers: Content-Type');

// Configuration
$CACHE_DIR = __DIR__ . '/cache/token-images';
$CACHE_DURATION = 60 * 24 * 60 * 60; // 60 days
$CHAINSTACK_RPC = 'https://api.mainnet-beta.solana.com';
$CHAINSTACK_AUTH = base64_encode('condescending-fermi:jockey-snore-detest-uproar-fleshy-faucet');
$DEFAULT_IMAGE = 'data:image/svg+xml;base64,' . base64_encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#667eea"/><text x="50" y="60" text-anchor="middle" fill="white" font-size="30">?</text></svg>');

// Create cache directory
if (!file_exists($CACHE_DIR)) {
    mkdir($CACHE_DIR, 0755, true);
}

// Get mint parameter
$mint = $_GET['mint'] ?? '';
if (!$mint || !preg_match('/^[A-Za-z0-9]{32,}$/', $mint)) {
    error_log("Invalid mint: $mint");
    header('Content-Type: image/svg+xml');
    header('Content-Disposition: inline');
    echo base64_decode(substr($DEFAULT_IMAGE, strlen('data:image/svg+xml;base64,')));
    exit;
}

$cacheFile = $CACHE_DIR . '/' . $mint . '.cache';
$imageFile = $CACHE_DIR . '/' . $mint . '.img';

// Check cache
if (file_exists($cacheFile) && file_exists($imageFile) && (time() - filemtime($cacheFile)) < $CACHE_DURATION) {
    $cacheData = json_decode(file_get_contents($cacheFile), true);
    if ($cacheData && isset($cacheData['content_type'])) {
        header('Content-Type: ' . $cacheData['content_type']);
        header('Content-Disposition: inline');
        header('Cache-Control: public, max-age=' . $CACHE_DURATION);
        readfile($imageFile);
        exit;
    }
}

/**
 * Convert IPFS URI to HTTP gateway URL
 */
function ipfsToHttp($uri) {
    if (!$uri) return $uri;
    
    // Handle ipfs:// scheme
    if (strpos($uri, 'ipfs://') === 0) {
        $cid = substr($uri, 7);
        return "https://gateway.pinata.cloud/ipfs/$cid";
    }
    
    // Extract CID from any IPFS gateway URL
    if (preg_match('/\/ipfs\/([A-Za-z0-9]+)/', $uri, $matches)) {
        return "https://gateway.pinata.cloud/ipfs/" . $matches[1];
    }
    
    // Plain CID
    if (preg_match('/^[A-Za-z0-9]{46,}$/', $uri)) {
        return "https://gateway.pinata.cloud/ipfs/$uri";
    }
    
    return $uri;
}

/**
 * Fetch image from URL with timeout and size limit
 */
function fetchImage($url, $maxSize = 5 * 1024 * 1024) { // 5MB limit
    $context = stream_context_create([
        'http' => [
            'timeout' => 10,
            'user_agent' => 'TokenImageCache/1.0',
            'follow_location' => 1,
            'max_redirects' => 3
        ]
    ]);
    
    $data = @file_get_contents($url, false, $context);
    if ($data === false || strlen($data) > $maxSize) {
        return false;
    }
    
    // Detect content type
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $contentType = $finfo->buffer($data);
    
    // Only allow images
    if (!preg_match('/^image\//', $contentType)) {
        return false;
    }
    
    return ['data' => $data, 'content_type' => $contentType];
}

/**
 * Derive Metaplex metadata PDA
 */
function deriveMetadataPDA($mint) {
    // This is a simplified version - in production you'd use proper PDA derivation
    // For now, we'll use the RPC to find the account
    return null; // Will use RPC lookup instead
}

/**
 * Decode Metaplex metadata to extract URI
 */
function decodeMetaplexMetadata($dataBase64) {
    try {
        $data = base64_decode($dataBase64);
        if (!$data) return null;
        
        // Skip key (1) + updateAuthority (32) + mint (32) = 65 bytes
        $offset = 65;
        
        // Read name string (4 bytes length + data)
        if ($offset + 4 > strlen($data)) return null;
        $nameLen = unpack('V', substr($data, $offset, 4))[1];
        $offset += 4 + $nameLen;
        
        // Read symbol string
        if ($offset + 4 > strlen($data)) return null;
        $symbolLen = unpack('V', substr($data, $offset, 4))[1];
        $offset += 4 + $symbolLen;
        
        // Read URI string
        if ($offset + 4 > strlen($data)) return null;
        $uriLen = unpack('V', substr($data, $offset, 4))[1];
        $offset += 4;
        
        if ($offset + $uriLen > strlen($data)) return null;
        $uri = substr($data, $offset, $uriLen);
        $uri = rtrim($uri, "\0"); // Remove null padding
        
        return $uri;
    } catch (Exception $e) {
        error_log("Metadata decode error: " . $e->getMessage());
        return null;
    }
}

/**
 * Fetch token image using the fallback strategy
 */
function fetchTokenImage($mint) {
    global $CHAINSTACK_RPC, $CHAINSTACK_AUTH;
    
    // 1. Try DexScreener first (fastest)
    $dexUrl = "https://dd.dexscreener.com/ds-data/tokens/solana/$mint.png";
    $result = fetchImage($dexUrl);
    if ($result) {
        error_log("Found image via DexScreener: $mint");
        return $result;
    }
    
    // 2. Try Metaplex metadata
    try {
        // Get metadata PDA via RPC
        $rpcPayload = [
            'jsonrpc' => '2.0',
            'id' => 1,
            'method' => 'getProgramAccounts',
            'params' => [
                'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',
                [
                    'encoding' => 'base64',
                    'filters' => [
                        [
                            'memcmp' => [
                                'offset' => 33,
                                'bytes' => $mint
                            ]
                        ]
                    ]
                ]
            ]
        ];
        
        $context = stream_context_create([
            'http' => [
                'method' => 'POST',
                'header' => [
                    'Content-Type: application/json',
                    'User-Agent: TokenImageCache/1.0'
                ],
                'content' => json_encode($rpcPayload),
                'timeout' => 15
            ]
        ]);
        
        $response = @file_get_contents($CHAINSTACK_RPC, false, $context);
        if ($response) {
            $data = json_decode($response, true);
            if (isset($data['result']) && count($data['result']) > 0) {
                $metadataAccount = $data['result'][0];
                $metadataData = $metadataAccount['account']['data'][0];
                
                $uri = decodeMetaplexMetadata($metadataData);
                if ($uri) {
                    error_log("Found metadata URI: $uri");
                    $httpUri = ipfsToHttp($uri);
                    
                    // Fetch JSON metadata
                    $jsonData = @file_get_contents($httpUri, false, stream_context_create([
                        'http' => ['timeout' => 10]
                    ]));
                    
                    if ($jsonData) {
                        $metadata = json_decode($jsonData, true);
                        if (isset($metadata['image'])) {
                            $imageUrl = ipfsToHttp($metadata['image']);
                            $result = fetchImage($imageUrl);
                            if ($result) {
                                error_log("Found image via Metaplex: $mint -> $imageUrl");
                                return $result;
                            }
                        }
                    }
                    
                    // Fallback: try to extract CID from URI and construct image URL
                    if (preg_match('/\/ipfs\/([A-Za-z0-9]+)/', $uri, $matches)) {
                        $cid = $matches[1];
                        $fallbackUrl = "https://gateway.pinata.cloud/ipfs/$cid";
                        $result = fetchImage($fallbackUrl);
                        if ($result) {
                            error_log("Found image via IPFS fallback: $mint -> $fallbackUrl");
                            return $result;
                        }
                    }
                }
            }
        }
    } catch (Exception $e) {
        error_log("Metaplex lookup error: " . $e->getMessage());
    }
    
    error_log("No image found for mint: $mint");
    return false;
}

// Fetch the image
$imageData = fetchTokenImage($mint);

if ($imageData) {
    // Cache the result
    file_put_contents($cacheFile, json_encode([
        'mint' => $mint,
        'content_type' => $imageData['content_type'],
        'cached_at' => time()
    ]));
    file_put_contents($imageFile, $imageData['data']);
    
    // Serve the image
    header('Content-Type: ' . $imageData['content_type']);
    header('Content-Disposition: inline');
    header('Cache-Control: public, max-age=' . $CACHE_DURATION);
    echo $imageData['data'];
} else {
    // Serve default image
    header('Content-Type: image/svg+xml');
    header('Content-Disposition: inline');
    header('Cache-Control: public, max-age=3600'); // Cache default for 1 hour
    echo base64_decode(substr($DEFAULT_IMAGE, strlen('data:image/svg+xml;base64,')));
}
?>
