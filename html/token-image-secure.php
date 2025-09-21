<?php
/**
 * Secure Token Image Cache Server
 * 
 * Enhanced version with strict security controls:
 * - Only allows safe image formats (JPEG, PNG, GIF, WebP, BMP)
 * - Validates MIME types and file signatures
 * - Returns "Not Supported" image for unsafe content
 * - Comprehensive security logging
 * 
 * Usage: /token-image-secure.php?mint=<mint_address>
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET');
header('Access-Control-Allow-Headers: Content-Type');

// Configuration
$CACHE_DIR = __DIR__ . '/cache/token-images';
$CACHE_DURATION = 60 * 24 * 60 * 60; // 60 days
$CHAINSTACK_RPC = 'https://api.mainnet-beta.solana.com';

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
 * Simple token image fetcher (simplified for security demo)
 * In production, you would include all the comprehensive fetching logic
 * from the original file, but with fetchImageSecure instead of fetchImage
 */
function fetchTokenImage($mint) {
    // Try DexScreener first (fastest)
    $dexUrl = "https://dd.dexscreener.com/ds-data/tokens/solana/$mint.png";
    $result = fetchImageSecure($dexUrl);
    
    if ($result) {
        if (isset($result['unsafe']) && $result['unsafe']) {
            error_log("SECURITY: Unsafe image detected from DexScreener for mint: $mint");
            return ['unsafe' => true];
        }
        if (isset($result['safe']) && $result['safe']) {
            error_log("Found secure image via DexScreener: $mint");
            return $result;
        }
    }
    
    // Additional sources would go here with same security checks
    // (Jupiter, Metaplex, etc. - all using fetchImageSecure)
    
    error_log("No image found for mint: $mint");
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
