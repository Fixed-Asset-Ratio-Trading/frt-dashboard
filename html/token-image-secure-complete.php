<?php
/**
 * Secure Token Image Cache Server - Complete Version
 * 
 * Enhanced version with ALL original features plus strict security controls:
 * - Complete DexScreener, Jupiter, Metaplex, IPFS integration
 * - Manual override processing
 * - Comprehensive metadata scanning
 * - Only allows safe image formats (JPEG, PNG, GIF, WebP, BMP)
 * - Validates MIME types and file signatures
 * - Returns "Not Supported" image for unsafe content
 * - Comprehensive security logging
 * 
 * Usage: /token-image-secure-complete.php?mint=<mint_address>
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET');
header('Access-Control-Allow-Headers: Content-Type');

// Configuration
$CACHE_DIR = __DIR__ . '/cache/token-images';
$CACHE_DURATION = 60 * 24 * 60 * 60; // 60 days
$CHAINSTACK_RPC = 'https://api.mainnet-beta.solana.com';
$CHAINSTACK_AUTH = base64_encode('condescending-fermi:jockey-snore-detest-uproar-fleshy-faucet');

// Security: Allowed MIME types and their file signatures (magic bytes)
$ALLOWED_MIME_TYPES = [
    'image/jpeg' => [
        'extensions' => ['jpg', 'jpeg'],
        'signatures' => [
            "\xFF\xD8\xFF\xE0", // JPEG/JFIF
            "\xFF\xD8\xFF\xE1", // JPEG/Exif
            "\xFF\xD8\xFF\xE2", // JPEG/Canon
            "\xFF\xD8\xFF\xE3", // JPEG/Samsung
            "\xFF\xD8\xFF\xE8", // JPEG/SPIFF
            "\xFF\xD8\xFF\xDB", // JPEG raw
        ]
    ],
    'image/png' => [
        'extensions' => ['png'],
        'signatures' => [
            "\x89\x50\x4E\x47\x0D\x0A\x1A\x0A", // PNG signature
        ]
    ],
    'image/gif' => [
        'extensions' => ['gif'],
        'signatures' => [
            "GIF87a", // GIF87a
            "GIF89a", // GIF89a
        ]
    ],
    'image/webp' => [
        'extensions' => ['webp'],
        'signatures' => [
            "RIFF", // WebP starts with RIFF, needs additional check
        ]
    ],
    'image/bmp' => [
        'extensions' => ['bmp'],
        'signatures' => [
            "BM", // BMP signature
        ]
    ],
];

// Generate "Not Supported" image
function getNotSupportedImage() {
    $svg = '<?xml version="1.0" encoding="UTF-8"?>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
        <rect width="100" height="100" fill="#f0f0f0"/>
        <rect x="10" y="10" width="80" height="80" rx="5" fill="#ff6b6b" opacity="0.2"/>
        <text x="50" y="45" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="#ff6b6b">N/S</text>
        <text x="50" y="65" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" fill="#666">Not Supported</text>
    </svg>';
    return $svg;
}

// Generate default/unknown token image
function getDefaultImage() {
    $svg = '<?xml version="1.0" encoding="UTF-8"?>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
        <circle cx="50" cy="50" r="40" fill="#667eea"/>
        <text x="50" y="60" text-anchor="middle" fill="white" font-size="30">?</text>
    </svg>';
    return $svg;
}

// Security: Validate file signature (magic bytes)
function validateFileSignature($data, $mimeType) {
    global $ALLOWED_MIME_TYPES;
    
    if (!isset($ALLOWED_MIME_TYPES[$mimeType])) {
        return false;
    }
    
    $signatures = $ALLOWED_MIME_TYPES[$mimeType]['signatures'];
    
    foreach ($signatures as $signature) {
        if (substr($data, 0, strlen($signature)) === $signature) {
            // Special check for WebP
            if ($mimeType === 'image/webp') {
                // WebP files have "WEBP" at offset 8
                if (substr($data, 8, 4) !== 'WEBP') {
                    continue;
                }
            }
            return true;
        }
    }
    
    return false;
}

// Security: Validate MIME type and content
function validateImageSecurity($data, $contentType) {
    global $ALLOWED_MIME_TYPES;
    
    // Check if MIME type is allowed
    if (!isset($ALLOWED_MIME_TYPES[$contentType])) {
        error_log("SECURITY: Blocked unsupported MIME type: $contentType");
        return false;
    }
    
    // Validate file signature matches claimed MIME type
    if (!validateFileSignature($data, $contentType)) {
        error_log("SECURITY: File signature doesn't match claimed MIME type: $contentType");
        return false;
    }
    
    // Additional security checks
    if (strlen($data) > 10 * 1024 * 1024) { // 10MB limit
        error_log("SECURITY: File too large: " . strlen($data) . " bytes");
        return false;
    }
    
    // Check for suspicious patterns (basic XSS/script detection)
    $dataStart = substr($data, 0, 1000);
    if (preg_match('/<script|javascript:|onerror=|onclick=/i', $dataStart)) {
        error_log("SECURITY: Suspicious content detected in image data");
        return false;
    }
    
    return true;
}

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
    echo getDefaultImage();
    exit;
}

$cacheFile = $CACHE_DIR . '/' . $mint . '.cache';
$imageFile = $CACHE_DIR . '/' . $mint . '.img';
$securityFile = $CACHE_DIR . '/' . $mint . '.security';

// Check if we've already marked this as unsafe
if (file_exists($securityFile)) {
    $securityData = json_decode(file_get_contents($securityFile), true);
    if ($securityData && isset($securityData['unsafe']) && $securityData['unsafe']) {
        error_log("Serving N/S image for previously blocked mint: $mint");
        header('Content-Type: image/svg+xml');
        header('Content-Disposition: inline');
        header('X-Security-Status: blocked');
        echo getNotSupportedImage();
        exit;
    }
}

// Check cache
if (file_exists($cacheFile) && file_exists($imageFile) && (time() - filemtime($cacheFile)) < $CACHE_DURATION) {
    $cacheData = json_decode(file_get_contents($cacheFile), true);
    if ($cacheData && isset($cacheData['content_type'])) {
        // Re-validate cached content
        $imageData = file_get_contents($imageFile);
        if (validateImageSecurity($imageData, $cacheData['content_type'])) {
            header('Content-Type: ' . $cacheData['content_type']);
            header('Content-Disposition: inline');
            header('Cache-Control: public, max-age=' . $CACHE_DURATION);
            header('X-Security-Status: validated');
            echo $imageData;
            exit;
        } else {
            // Cached content failed security check
            error_log("SECURITY: Cached content failed validation for mint: $mint");
            unlink($imageFile);
            unlink($cacheFile);
            // Mark as unsafe
            file_put_contents($securityFile, json_encode([
                'unsafe' => true,
                'reason' => 'cached_content_failed_validation',
                'timestamp' => time()
            ]));
        }
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
 * Check if URL points to an image file
 */
function isImageUrl($url) {
    $imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'];
    $extension = strtolower(pathinfo(parse_url($url, PHP_URL_PATH), PATHINFO_EXTENSION));
    return in_array($extension, $imageExtensions);
}

/**
 * Check if URL points to a JSON file
 */
function isJsonUrl($url) {
    $extension = strtolower(pathinfo(parse_url($url, PHP_URL_PATH), PATHINFO_EXTENSION));
    return $extension === 'json' || strpos($url, '.json') !== false;
}

/**
 * Fetch and parse JSON metadata recursively looking for image URIs
 */
function fetchJsonMetadata($url) {
    $context = stream_context_create([
        'http' => [
            'timeout' => 10,
            'user_agent' => 'TokenImageCache/2.0-Secure',
            'follow_location' => 1,
            'max_redirects' => 3
        ]
    ]);
    
    $jsonData = @file_get_contents($url, false, $context);
    if (!$jsonData) return null;
    
    $metadata = json_decode($jsonData, true);
    if (!$metadata) return null;
    
    return findImageUrisInData($metadata);
}

/**
 * Recursively search for image URIs in any data structure
 */
function findImageUrisInData($data, $depth = 0) {
    if ($depth > 5) return []; // Prevent infinite recursion
    
    $imageUris = [];
    
    if (is_string($data)) {
        $data = trim($data);
        if ($data && (isImageUrl($data) || strpos($data, 'ipfs://') === 0 || preg_match('/\/ipfs\/[A-Za-z0-9]+/', $data))) {
            $imageUris[] = $data;
        }
    } elseif (is_array($data)) {
        foreach ($data as $key => $value) {
            // Check common image field names
            if (is_string($key) && preg_match('/^(image|icon|logo|picture|avatar|thumbnail)$/i', $key) && is_string($value)) {
                $imageUris[] = $value;
            }
            // Recursively search nested data
            $nestedUris = findImageUrisInData($value, $depth + 1);
            $imageUris = array_merge($imageUris, $nestedUris);
        }
    }
    
    return array_unique($imageUris);
}

/**
 * Fetch all URIs from metadata and check each one
 */
function findAllUrisInMetadata($metadata) {
    $allUris = [];
    
    // Extract all string values that look like URIs
    $extractUris = function($data) use (&$extractUris, &$allUris) {
        if (is_string($data)) {
            $data = trim($data);
            // Look for HTTP/HTTPS URLs or IPFS URIs
            if (preg_match('/^(https?:\/\/|ipfs:\/\/)/i', $data)) {
                $allUris[] = $data;
            }
        } elseif (is_array($data)) {
            foreach ($data as $value) {
                $extractUris($value);
            }
        }
    };
    
    $extractUris($metadata);
    return array_unique($allUris);
}

/**
 * Try Jupiter Token List API
 */
function fetchFromJupiterTokenList($mint) {
    $jupiterUrl = "https://token.jup.ag/strict";
    
    error_log("Fetching Jupiter Token List for mint: $mint");
    
    $context = stream_context_create([
        'http' => [
            'timeout' => 10,
            'user_agent' => 'TokenImageCache/2.0-Secure'
        ]
    ]);
    
    $jsonData = @file_get_contents($jupiterUrl, false, $context);
    if (!$jsonData) {
        error_log("Failed to fetch Jupiter Token List");
        return null;
    }
    
    error_log("Jupiter Token List fetched, size: " . strlen($jsonData) . " bytes");
    
    $tokenList = json_decode($jsonData, true);
    if (!$tokenList || !is_array($tokenList)) {
        error_log("Failed to parse Jupiter Token List JSON");
        return null;
    }
    
    error_log("Jupiter Token List parsed, found " . count($tokenList) . " tokens");
    
    foreach ($tokenList as $token) {
        if (isset($token['address']) && $token['address'] === $mint) {
            error_log("Found matching token in Jupiter list: " . json_encode($token));
            if (isset($token['logoURI'])) {
                error_log("Found token in Jupiter list: $mint -> " . $token['logoURI']);
                return fetchImageSecure($token['logoURI']);
            } else {
                error_log("Token found but no logoURI field");
            }
        }
    }
    
    error_log("Token $mint not found in Jupiter Token List");
    return null;
}

/**
 * Fetch image from URL with security validation
 */
function fetchImageSecure($url, $maxSize = 5 * 1024 * 1024) { // 5MB limit
    $context = stream_context_create([
        'http' => [
            'timeout' => 10,
            'user_agent' => 'TokenImageCache/2.0-Secure',
            'follow_location' => 1,
            'max_redirects' => 3
        ]
    ]);
    
    $data = @file_get_contents($url, false, $context);
    if ($data === false || strlen($data) > $maxSize) {
        return false;
    }
    
    // Detect content type using PHP's finfo
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $contentType = $finfo->buffer($data);
    
    // Validate security
    if (!validateImageSecurity($data, $contentType)) {
        error_log("SECURITY: Image failed validation from URL: $url");
        return ['unsafe' => true, 'content_type' => $contentType];
    }
    
    return ['data' => $data, 'content_type' => $contentType, 'safe' => true];
}

/**
 * Decode Metaplex metadata to extract URI and other fields
 */
function decodeMetaplexMetadata($dataBase64) {
    try {
        $data = base64_decode($dataBase64);
        if (!$data) {
            error_log("Failed to decode base64 data");
            return null;
        }
        error_log("Decoded metadata length: " . strlen($data) . " bytes");
        
        // Skip key (1) + updateAuthority (32) + mint (32) = 65 bytes
        $offset = 65;
        
        // Read name string (4 bytes length + data)
        if ($offset + 4 > strlen($data)) {
            error_log("Not enough data for name length at offset $offset");
            return null;
        }
        $nameLen = unpack('V', substr($data, $offset, 4))[1];
        error_log("Name length: $nameLen");
        $offset += 4;
        
        if ($offset + $nameLen > strlen($data)) {
            error_log("Not enough data for name at offset $offset, need $nameLen bytes");
            return null;
        }
        $name = substr($data, $offset, $nameLen);
        $name = rtrim($name, "\0");
        error_log("Name: '$name'");
        $offset += $nameLen;
        
        // Read symbol string
        if ($offset + 4 > strlen($data)) {
            error_log("Not enough data for symbol length at offset $offset");
            return null;
        }
        $symbolLen = unpack('V', substr($data, $offset, 4))[1];
        error_log("Symbol length: $symbolLen");
        $offset += 4;
        
        if ($offset + $symbolLen > strlen($data)) {
            error_log("Not enough data for symbol at offset $offset, need $symbolLen bytes");
            return null;
        }
        $symbol = substr($data, $offset, $symbolLen);
        $symbol = rtrim($symbol, "\0");
        error_log("Symbol: '$symbol'");
        $offset += $symbolLen;
        
        // Read URI string
        if ($offset + 4 > strlen($data)) {
            error_log("Not enough data for URI length at offset $offset");
            return null;
        }
        $uriLen = unpack('V', substr($data, $offset, 4))[1];
        error_log("URI length: $uriLen");
        $offset += 4;
        
        if ($offset + $uriLen > strlen($data)) {
            error_log("Not enough data for URI at offset $offset, need $uriLen bytes");
            return null;
        }
        $uri = substr($data, $offset, $uriLen);
        $uri = rtrim($uri, "\0"); // Remove null padding
        error_log("URI: '$uri'");
        $offset += $uriLen;
        
        // Try to extract additional metadata fields
        $additionalMetadata = [];
        
        // Skip seller fee basis points (2 bytes) if present
        if ($offset + 2 <= strlen($data)) {
            $offset += 2;
            
            // Skip creators array if present
            if ($offset + 4 <= strlen($data)) {
                $hasCreators = unpack('C', substr($data, $offset, 1))[1];
                $offset += 1;
                
                if ($hasCreators && $offset + 4 <= strlen($data)) {
                    $creatorsCount = unpack('V', substr($data, $offset, 4))[1];
                    $offset += 4;
                    
                    // Skip creators (each creator is 34 bytes: 32 for address + 1 for verified + 1 for share)
                    $offset += $creatorsCount * 34;
                }
                
                // Try to read additional metadata as key-value pairs
                while ($offset + 8 < strlen($data)) {
                    try {
                        // Read key length
                        if ($offset + 4 > strlen($data)) break;
                        $keyLen = unpack('V', substr($data, $offset, 4))[1];
                        $offset += 4;
                        
                        if ($keyLen > 100 || $offset + $keyLen > strlen($data)) break; // Sanity check
                        
                        $key = substr($data, $offset, $keyLen);
                        $key = rtrim($key, "\0");
                        $offset += $keyLen;
                        
                        // Read value length
                        if ($offset + 4 > strlen($data)) break;
                        $valueLen = unpack('V', substr($data, $offset, 4))[1];
                        $offset += 4;
                        
                        if ($valueLen > 1000 || $offset + $valueLen > strlen($data)) break; // Sanity check
                        
                        $value = substr($data, $offset, $valueLen);
                        $value = rtrim($value, "\0");
                        $offset += $valueLen;
                        
                        if ($key && $value) {
                            $additionalMetadata[$key] = $value;
                        }
                    } catch (Exception $e) {
                        break; // Stop parsing if we hit any errors
                    }
                }
            }
        }
        
        return [
            'name' => $name,
            'symbol' => $symbol,
            'uri' => $uri,
            'additionalMetadata' => $additionalMetadata
        ];
    } catch (Exception $e) {
        error_log("Metadata decode error: " . $e->getMessage());
        return null;
    }
}

/**
 * Process manual image overrides from local file
 */
function processImageOverrides() {
    $overrideFile = __DIR__ . '/token-image-overrides.txt';
    
    if (!file_exists($overrideFile)) {
        return false;
    }
    
    error_log("Processing image overrides from: $overrideFile");
    
    $lines = file($overrideFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if (!$lines) {
        error_log("No valid lines found in override file");
        unlink($overrideFile);
        return false;
    }
    
    $processedCount = 0;
    $successCount = 0;
    
    foreach ($lines as $line) {
        $line = trim($line);
        if (empty($line) || strpos($line, '=') === false) {
            continue;
        }
        
        list($mint, $imageUrl) = explode('=', $line, 2);
        $mint = trim($mint);
        $imageUrl = trim($imageUrl);
        
        if (empty($mint) || empty($imageUrl)) {
            continue;
        }
        
        $processedCount++;
        error_log("Processing override: $mint -> $imageUrl");
        
        // Fetch and cache the image with security validation
        $imageResult = fetchImageSecure($imageUrl);
        if ($imageResult && !isset($imageResult['unsafe'])) {
            // Save to cache
            $cacheDir = __DIR__ . '/cache/token-images';
            if (!is_dir($cacheDir)) {
                mkdir($cacheDir, 0755, true);
            }
            
            $cacheFile = $cacheDir . '/' . $mint . '.img';
            $metaFile = $cacheDir . '/' . $mint . '.cache';
            
            $imageData = $imageResult['data'];
            if (file_put_contents($cacheFile, $imageData)) {
                // Save cache metadata
                $cacheData = [
                    'url' => $imageUrl,
                    'timestamp' => time(),
                    'source' => 'manual_override_secure',
                    'content_type' => $imageResult['content_type'],
                    'size' => strlen($imageData),
                    'security_validated' => true
                ];
                file_put_contents($metaFile, json_encode($cacheData));
                
                $successCount++;
                error_log("✅ Successfully cached secure override image: $mint");
            } else {
                error_log("❌ Failed to save override image: $mint");
            }
        } else {
            if (isset($imageResult['unsafe'])) {
                error_log("❌ SECURITY: Unsafe override image blocked: $mint from $imageUrl");
            } else {
                error_log("❌ Failed to fetch override image: $mint from $imageUrl");
            }
        }
    }
    
    error_log("Override processing complete: $successCount/$processedCount secure images cached");
    
    // Delete the override file after processing
    unlink($overrideFile);
    error_log("Override file deleted: $overrideFile");
    
    return $successCount > 0;
}

/**
 * Fetch token image using the comprehensive fallback strategy with security validation
 */
function fetchTokenImage($mint) {
    global $CHAINSTACK_RPC, $CHAINSTACK_AUTH;
    
    // 0. Process manual overrides if file exists (runs once per request cycle)
    static $overridesProcessed = false;
    if (!$overridesProcessed) {
        processImageOverrides();
        $overridesProcessed = true;
    }
    
    // Check cache first (including newly processed overrides)
    $cacheDir = __DIR__ . '/cache/token-images';
    $cacheFile = $cacheDir . '/' . $mint . '.img';
    $metaFile = $cacheDir . '/' . $mint . '.cache';
    
    if (file_exists($cacheFile) && file_exists($metaFile)) {
        $cacheData = json_decode(file_get_contents($metaFile), true);
        if ($cacheData && isset($cacheData['timestamp'])) {
            $age = time() - $cacheData['timestamp'];
            // Cache for 60 days (5184000 seconds)
            if ($age < 5184000) {
                error_log("Found cached image: $mint (source: " . ($cacheData['source'] ?? 'unknown') . ", age: " . round($age/86400, 1) . " days)");
                return file_get_contents($cacheFile);
            }
        }
    }
    
    // 1. Try DexScreener first (fastest)
    $dexUrl = "https://dd.dexscreener.com/ds-data/tokens/solana/$mint.png";
    $result = fetchImageSecure($dexUrl);
    if ($result) {
        if (isset($result['unsafe']) && $result['unsafe']) {
            error_log("SECURITY: Unsafe image detected from DexScreener for mint: $mint");
            return ['unsafe' => true, 'content_type' => $result['content_type'] ?? 'unknown'];
        }
        if (isset($result['safe']) && $result['safe']) {
            error_log("Found secure image via DexScreener: $mint");
            return $result;
        }
    }
    
    // 2. Try Jupiter Token List
    $result = fetchFromJupiterTokenList($mint);
    if ($result) {
        if (isset($result['unsafe']) && $result['unsafe']) {
            error_log("SECURITY: Unsafe image detected from Jupiter for mint: $mint");
            return ['unsafe' => true, 'content_type' => $result['content_type'] ?? 'unknown'];
        }
        if (isset($result['safe']) && $result['safe']) {
            error_log("Found secure image via Jupiter: $mint");
            return $result;
        }
    }
    
    // 3. Try Metaplex metadata with comprehensive URI scanning
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
                    'User-Agent: TokenImageCache/2.0-Secure'
                ],
                'content' => json_encode($rpcPayload),
                'timeout' => 15
            ]
        ]);
        
        $response = @file_get_contents($CHAINSTACK_RPC, false, $context);
        if ($response) {
            $data = json_decode($response, true);
            error_log("RPC response for $mint: " . substr($response, 0, 200) . "...");
            if (isset($data['result']) && count($data['result']) > 0) {
                $metadataAccount = $data['result'][0];
                $metadataData = $metadataAccount['account']['data'][0];
                
                $metadata = decodeMetaplexMetadata($metadataData);
                if ($metadata) {
                    $uri = $metadata['uri'];
                    error_log("Found metadata URI: $uri");
                    error_log("Metadata structure: " . json_encode($metadata));
                    
                    // First, scan the on-chain additional metadata for any image URLs (like "Jupiter logoURI")
                    if (isset($metadata['additionalMetadata']) && is_array($metadata['additionalMetadata'])) {
                        error_log("Scanning additional on-chain metadata fields: " . implode(', ', array_keys($metadata['additionalMetadata'])));
                        
                        $onChainUris = findAllUrisInMetadata($metadata['additionalMetadata']);
                        foreach ($onChainUris as $foundUri) {
                            if (isImageUrl($foundUri)) {
                                // Try original URL first
                                $result = fetchImageSecure($foundUri);
                                if ($result && !isset($result['unsafe'])) {
                                    error_log("Found secure image in on-chain additional metadata: $mint -> $foundUri");
                                    return $result;
                                }
                                if (isset($result['unsafe'])) {
                                    error_log("SECURITY: Unsafe image in on-chain metadata blocked: $foundUri");
                                }
                                
                                // If original fails, try IPFS gateway conversion
                                $httpFoundUri = ipfsToHttp($foundUri);
                                if ($httpFoundUri !== $foundUri) {
                                    $result = fetchImageSecure($httpFoundUri);
                                    if ($result && !isset($result['unsafe'])) {
                                        error_log("Found secure image in on-chain additional metadata (IPFS): $mint -> $httpFoundUri");
                                        return $result;
                                    }
                                    if (isset($result['unsafe'])) {
                                        error_log("SECURITY: Unsafe IPFS image in on-chain metadata blocked: $httpFoundUri");
                                    }
                                }
                            }
                        }
                        
                        // Also use the more comprehensive image finder that looks for logo/icon fields
                        $imageUris = findImageUrisInData($metadata['additionalMetadata']);
                        foreach ($imageUris as $foundUri) {
                            // Try original URL first
                            $result = fetchImageSecure($foundUri);
                            if ($result && !isset($result['unsafe'])) {
                                error_log("Found secure image via comprehensive on-chain scan: $mint -> $foundUri");
                                return $result;
                            }
                            if (isset($result['unsafe'])) {
                                error_log("SECURITY: Unsafe image in comprehensive scan blocked: $foundUri");
                            }
                            
                            // If original fails, try IPFS gateway conversion
                            $httpFoundUri = ipfsToHttp($foundUri);
                            if ($httpFoundUri !== $foundUri) {
                                $result = fetchImageSecure($httpFoundUri);
                                if ($result && !isset($result['unsafe'])) {
                                    error_log("Found secure image via comprehensive on-chain scan (IPFS): $mint -> $httpFoundUri");
                                    return $result;
                                }
                                if (isset($result['unsafe'])) {
                                    error_log("SECURITY: Unsafe IPFS image in comprehensive scan blocked: $httpFoundUri");
                                }
                            }
                        }
                    }
                    
                    // Check if the URI itself contains image data (some tokens store image directly in URI field)
                    if ($uri && isImageUrl($uri)) {
                        $result = fetchImageSecure($uri);
                        if ($result && !isset($result['unsafe'])) {
                            error_log("Found secure direct image in metadata URI field: $mint -> $uri");
                            return $result;
                        }
                        if (isset($result['unsafe'])) {
                            error_log("SECURITY: Unsafe direct image in metadata URI blocked: $uri");
                        }
                        
                        // Try IPFS gateway conversion if original fails
                        $httpUri = ipfsToHttp($uri);
                        if ($httpUri !== $uri) {
                            $result = fetchImageSecure($httpUri);
                            if ($result && !isset($result['unsafe'])) {
                                error_log("Found secure direct image via IPFS gateway conversion: $mint -> $httpUri");
                                return $result;
                            }
                            if (isset($result['unsafe'])) {
                                error_log("SECURITY: Unsafe IPFS direct image blocked: $httpUri");
                            }
                        }
                    }
                    
                    // Only proceed with off-chain metadata if URI is not empty
                    if ($uri) {
                        $httpUri = ipfsToHttp($uri);
                    
                        // Fetch JSON metadata and scan comprehensively
                        $jsonData = @file_get_contents($httpUri, false, stream_context_create([
                            'http' => ['timeout' => 10]
                        ]));
                        
                        if ($jsonData) {
                            $metadata = json_decode($jsonData, true);
                            if ($metadata) {
                                // Find all URIs in the metadata
                                $allUris = findAllUrisInMetadata($metadata);
                                
                                // Try each URI - first images, then JSON files
                                foreach ($allUris as $foundUri) {
                                    // Try original URL first if it looks like an image
                                    if (isImageUrl($foundUri)) {
                                        $result = fetchImageSecure($foundUri);
                                        if ($result && !isset($result['unsafe'])) {
                                            error_log("Found secure image via original URL: $mint -> $foundUri");
                                            return $result;
                                        }
                                        if (isset($result['unsafe'])) {
                                            error_log("SECURITY: Unsafe image via original URL blocked: $foundUri");
                                        }
                                        
                                        // If original fails, try IPFS gateway conversion
                                        $httpFoundUri = ipfsToHttp($foundUri);
                                        if ($httpFoundUri !== $foundUri) { // Only if conversion actually changed the URL
                                            $result = fetchImageSecure($httpFoundUri);
                                            if ($result && !isset($result['unsafe'])) {
                                                error_log("Found secure image via IPFS gateway conversion: $mint -> $httpFoundUri");
                                                return $result;
                                            }
                                            if (isset($result['unsafe'])) {
                                                error_log("SECURITY: Unsafe IPFS image via gateway conversion blocked: $httpFoundUri");
                                            }
                                        }
                                    }
                                }
                                
                                // Then try JSON files for nested image URIs
                                foreach ($allUris as $foundUri) {
                                    if (isJsonUrl($foundUri)) {
                                        // Try original JSON URL first
                                        $nestedImageUris = fetchJsonMetadata($foundUri);
                                        if ($nestedImageUris) {
                                            foreach ($nestedImageUris as $imageUri) {
                                                // Try original image URI first
                                                $result = fetchImageSecure($imageUri);
                                                if ($result && !isset($result['unsafe'])) {
                                                    error_log("Found secure image via nested JSON (original URL): $mint -> $imageUri");
                                                    return $result;
                                                }
                                                if (isset($result['unsafe'])) {
                                                    error_log("SECURITY: Unsafe nested image via original URL blocked: $imageUri");
                                                }
                                                
                                                // If original fails, try IPFS gateway conversion
                                                $httpImageUri = ipfsToHttp($imageUri);
                                                if ($httpImageUri !== $imageUri) {
                                                    $result = fetchImageSecure($httpImageUri);
                                                    if ($result && !isset($result['unsafe'])) {
                                                        error_log("Found secure image via nested JSON (IPFS gateway): $mint -> $httpImageUri");
                                                        return $result;
                                                    }
                                                    if (isset($result['unsafe'])) {
                                                        error_log("SECURITY: Unsafe nested IPFS image blocked: $httpImageUri");
                                                    }
                                                }
                                            }
                                        }
                                        
                                        // If original JSON URL failed, try IPFS gateway conversion
                                        $httpFoundUri = ipfsToHttp($foundUri);
                                        if ($httpFoundUri !== $foundUri) {
                                            $nestedImageUris = fetchJsonMetadata($httpFoundUri);
                                            if ($nestedImageUris) {
                                                foreach ($nestedImageUris as $imageUri) {
                                                    // Try original image URI first
                                                    $result = fetchImageSecure($imageUri);
                                                    if ($result && !isset($result['unsafe'])) {
                                                        error_log("Found secure image via nested JSON (converted JSON, original image): $mint -> $imageUri");
                                                        return $result;
                                                    }
                                                    if (isset($result['unsafe'])) {
                                                        error_log("SECURITY: Unsafe nested image via converted JSON blocked: $imageUri");
                                                    }
                                                    
                                                    // Then try IPFS gateway conversion for image
                                                    $httpImageUri = ipfsToHttp($imageUri);
                                                    if ($httpImageUri !== $imageUri) {
                                                        $result = fetchImageSecure($httpImageUri);
                                                        if ($result && !isset($result['unsafe'])) {
                                                            error_log("Found secure image via nested JSON (converted JSON, converted image): $mint -> $httpImageUri");
                                                            return $result;
                                                        }
                                                        if (isset($result['unsafe'])) {
                                                            error_log("SECURITY: Unsafe nested IPFS image via converted JSON blocked: $httpImageUri");
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                                
                                // Legacy fallback: check standard image field
                                if (isset($metadata['image'])) {
                                    // Try original image URL first
                                    $result = fetchImageSecure($metadata['image']);
                                    if ($result && !isset($result['unsafe'])) {
                                        error_log("Found secure image via standard metadata field (original URL): $mint -> " . $metadata['image']);
                                        return $result;
                                    }
                                    if (isset($result['unsafe'])) {
                                        error_log("SECURITY: Unsafe standard metadata image blocked: " . $metadata['image']);
                                    }
                                    
                                    // If original fails, try IPFS gateway conversion
                                    $imageUrl = ipfsToHttp($metadata['image']);
                                    if ($imageUrl !== $metadata['image']) {
                                        $result = fetchImageSecure($imageUrl);
                                        if ($result && !isset($result['unsafe'])) {
                                            error_log("Found secure image via standard metadata field (IPFS gateway): $mint -> $imageUrl");
                                            return $result;
                                        }
                                        if (isset($result['unsafe'])) {
                                            error_log("SECURITY: Unsafe standard metadata IPFS image blocked: $imageUrl");
                                        }
                                    }
                                }
                            }
                        }
                    }
                    
                    // Final fallback: try to extract CID from URI and construct image URL
                    if (preg_match('/\/ipfs\/([A-Za-z0-9]+)/', $uri, $matches)) {
                        $cid = $matches[1];
                        $fallbackUrl = "https://gateway.pinata.cloud/ipfs/$cid";
                        $result = fetchImageSecure($fallbackUrl);
                        if ($result && !isset($result['unsafe'])) {
                            error_log("Found secure image via IPFS CID fallback: $mint -> $fallbackUrl");
                            return $result;
                        }
                        if (isset($result['unsafe'])) {
                            error_log("SECURITY: Unsafe IPFS CID fallback image blocked: $fallbackUrl");
                        }
                    }
                }
            } else {
                error_log("No metadata accounts found for mint: $mint - RPC returned: " . substr($response, 0, 500));
            }
        } else {
            error_log("RPC call failed for mint: $mint - no response from server");
        }
    } catch (Exception $e) {
        error_log("Metaplex lookup error: " . $e->getMessage());
    }
    
    error_log("No secure image found for mint: $mint");
    return false;
}

// Fetch the image
$imageData = fetchTokenImage($mint);

if ($imageData) {
    if (isset($imageData['unsafe']) && $imageData['unsafe']) {
        // Mark this mint as having unsafe content
        file_put_contents($securityFile, json_encode([
            'unsafe' => true,
            'reason' => 'unsafe_image_content',
            'timestamp' => time(),
            'content_type' => $imageData['content_type'] ?? 'unknown'
        ]));
        
        // Serve "Not Supported" image
        header('Content-Type: image/svg+xml');
        header('Content-Disposition: inline');
        header('X-Security-Status: blocked-unsafe-content');
        header('Cache-Control: public, max-age=3600'); // Cache for 1 hour
        echo getNotSupportedImage();
    } else {
        // Cache the safe result
        file_put_contents($cacheFile, json_encode([
            'mint' => $mint,
            'content_type' => $imageData['content_type'],
            'cached_at' => time(),
            'security_validated' => true
        ]));
        file_put_contents($imageFile, $imageData['data']);
        
        // Serve the safe image
        header('Content-Type: ' . $imageData['content_type']);
        header('Content-Disposition: inline');
        header('X-Security-Status: validated');
        header('Cache-Control: public, max-age=' . $CACHE_DURATION);
        echo $imageData['data'];
    }
} else {
    // Serve default image for not found
    header('Content-Type: image/svg+xml');
    header('Content-Disposition: inline');
    header('X-Security-Status: not-found');
    header('Cache-Control: public, max-age=3600'); // Cache default for 1 hour
    echo getDefaultImage();
}
?>
