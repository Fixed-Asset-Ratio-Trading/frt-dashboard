# Client-Server Pool State Data Caching Implementation Plan

## Overview
Implement a three-tier caching system for pool state data:
1. **Browser**: Concurrent requests to server cache, Solana RPC, and localStorage
2. **Server**: File-based cache of raw Solana RPC JSON responses
3. **LocalStorage**: LRU cache for up to 5 pools with versioning

## Server-Side Implementation (`pool-data.php`)

### Core Functionality
- **Endpoint**: `pool-data.php?poolAddress=<base58_address>`
- **Cache Location**: `pool_data/` directory
- **Cache Format**: Raw Solana RPC `getAccountInfo` JSON response
- **Cache TTL**: 24 hours (managed by cron)

### File Structure
```
pool_data/
├── AnTuW1uDnQBnwSa2Yso8MFmknz8B3K4V1iZZNdMdEXNj.json
├── BnTuW1uDnQBnwSa2Yso8MFmknz8B3K4V1iZZNdMdEXNk.json
└── metrics.log
```

### JSON Cache Format
```json
{
  "schema_version": "1.0.0",
  "generated_at": "2025-09-21T10:30:00.000Z",
  "pool_address": "AnTuW1uDnQBnwSa2Yso8MFmknz8B3K4V1iZZNdMdEXNj",
  "rpc_response": {
    "context": {"slot": 123456},
    "value": {
      "data": ["base64_encoded_account_data", "base64"],
      "executable": false,
      "lamports": 2039280,
      "owner": "quXSYkeZ8ByTCtYY1J1uxQmE3CYMFixD",
      "rentEpoch": 361
    }
  }
}
```

### Security & Validation
- **Pool Address Validation**: 
  - Base58 format check
  - Length validation (32-44 characters)
  - Regex: `/^[A-HJ-NP-Z1-9]{32,44}$/`
- **Path Security**: 
  - No directory traversal (`../`)
  - Only write to `pool_data/` directory
  - Sanitize filename to alphanumeric only
- **Atomic Writes**: 
  - Write to `.tmp` file first
  - Rename to final `.json` file
  - Set proper permissions (644)

### Pool Validation
- Only cache data for valid program-owned accounts
- Verify account owner matches expected program ID
- Return 404 for non-existent or invalid pools

### Metrics & Logging
```json
{
  "timestamp": "2025-09-21T10:30:00.000Z",
  "pool_address": "AnTu...",
  "action": "cache_hit|cache_miss|rpc_fetch|error",
  "response_time_ms": 150,
  "file_size_bytes": 2048,
  "error": "optional_error_message"
}
```

## Client-Side Implementation

### Concurrent Data Fetching Strategy
```javascript
async function getPoolData(poolAddress) {
  const promises = [
    fetchFromServerCache(poolAddress),
    fetchFromSolanaRPC(poolAddress), 
    fetchFromLocalStorage(poolAddress)
  ];
  
  // Race all three sources
  const results = await Promise.allSettled(promises);
  
  // Pick freshest data based on generated_at timestamp
  const freshestData = selectFreshestData(results);
  
  // Update localStorage and UI
  updateLocalStorageCache(poolAddress, freshestData);
  return freshestData;
}
```

### Data Freshness Logic
- **Server Cache**: Use `generated_at` timestamp from JSON
- **Solana RPC**: Always considered "fresh" (current time)
- **LocalStorage**: Use stored `generated_at` timestamp
- **Selection**: Pick data with most recent `generated_at`

### LocalStorage LRU Cache
- **Capacity**: Maximum 5 pools
- **Eviction**: Least recently used (LRU)
- **Storage Format**:
```json
{
  "schema_version": "1.0.0",
  "pools": {
    "AnTu...": {
      "data": {...},
      "generated_at": "2025-09-21T10:30:00.000Z",
      "last_accessed": "2025-09-21T10:35:00.000Z"
    }
  },
  "access_order": ["AnTu...", "BnTu...", ...]
}
```

## Cron Job Implementation

### Cleanup Script
- **Frequency**: Every 24 hours
- **Target**: Files older than 24 hours
- **Safety**: Skip `.tmp` files and files with active locks
- **Logging**: Record purged files and metrics

### Race Condition Prevention
```bash
#!/bin/bash
# pool-cache-cleanup.sh

POOL_DATA_DIR="/var/www/html/pool_data"
TTL_HOURS=24

find "$POOL_DATA_DIR" -name "*.json" -not -name "*.tmp" -mtime +1 | while read file; do
  # Check for lock file
  if [ ! -f "${file}.lock" ]; then
    rm -f "$file"
    echo "$(date): Purged $file" >> "$POOL_DATA_DIR/cleanup.log"
  fi
done
```

## Error Handling & Fallbacks

### Server-Side Errors
- **RPC Timeout**: Return 504 Gateway Timeout
- **Invalid Pool**: Return 404 Not Found
- **File System Errors**: Return 500 Internal Server Error
- **Rate Limiting**: Return 429 Too Many Requests

### Client-Side Fallbacks
- **All Sources Fail**: Show error message with retry option
- **Partial Failure**: Use available data source
- **Timeout Handling**: 10-second timeout per source
- **UI State**: Show loading skeleton until data arrives

## HTTP Headers & CORS

### Response Headers
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET
Access-Control-Allow-Headers: Content-Type
Content-Type: application/json
Cache-Control: public, max-age=60
ETag: "hash_of_content"
```

## Implementation Checklist

### Server Components
- [ ] `pool-data.php` endpoint
- [ ] Pool address validation function
- [ ] Atomic file write operations
- [ ] RPC client with timeout handling
- [ ] Metrics logging system
- [ ] Error response handling
- [ ] CORS headers configuration

### Client Components  
- [ ] Concurrent request manager
- [ ] Data freshness comparison logic
- [ ] LocalStorage LRU cache implementation
- [ ] Error handling and fallbacks
- [ ] UI loading states
- [ ] Cache schema versioning

### Infrastructure
- [ ] `pool_data/` directory creation
- [ ] File permissions setup
- [ ] Cron job installation
- [ ] Log rotation configuration
- [ ] Monitoring alerts

### Testing Scenarios
- [ ] Cache hit/miss behavior
- [ ] Concurrent request handling
- [ ] LocalStorage quota exceeded
- [ ] Network timeout scenarios
- [ ] Invalid pool address handling
- [ ] Cron cleanup verification
- [ ] Schema version migration

## Performance Targets
- **Cache Hit Response**: < 50ms
- **Cache Miss + RPC**: < 2000ms
- **LocalStorage Access**: < 10ms
- **Concurrent Request Completion**: < 3000ms

## Monitoring & Metrics
- Cache hit/miss ratio
- Average response times
- Error rates by type
- Storage utilization
- Cleanup frequency and file counts

This implementation provides a robust, simple caching system that prioritizes speed and reliability while maintaining data freshness through intelligent source selection.

