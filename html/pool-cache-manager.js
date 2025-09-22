/**
 * Pool Data Cache Manager
 * 
 * Implements the three-tier caching strategy:
 * 1. Server-side file cache (24h TTL)
 * 2. Direct Solana RPC (always fresh)
 * 3. Browser localStorage LRU cache (5 pools max)
 * 
 * Features:
 * - Concurrent requests with freshness comparison
 * - LRU eviction for localStorage
 * - Schema versioning
 * - Comprehensive error handling
 */

class PoolCacheManager {
    constructor() {
        this.SCHEMA_VERSION = '1.0.0';
        this.LOCALSTORAGE_KEY = 'frt_pool_cache';
        this.MAX_POOLS = 5;
        this.CACHE_TIMEOUT = 10000; // 10 seconds timeout per source
        this.connection = null;
        this.config = null;
    }

    /**
     * Initialize the cache manager
     */
    async initialize(config, connection) {
        this.config = config;
        this.connection = connection;
        console.log('🗄️ PoolCacheManager initialized');
    }

    /**
     * Get pool data prioritizing instant render from localStorage if available
     */
    async getPoolData(poolAddress) {
        console.log(`🔄 Loading pool data for: ${poolAddress}`);
        try {
            // 1) Try localStorage first for instant render
            const local = await this.fetchFromLocalStorage(poolAddress);
            const FRESH_THRESHOLD = 5 * 60 * 1000; // 5 minutes
            const isFresh = local && (Date.now() - new Date(local.generated_at).getTime() < FRESH_THRESHOLD);
            if (isFresh) {
                // Fire background refresh (server cache + RPC) without blocking
                (async () => {
                    try {
                        const bgResults = await Promise.allSettled([
                            Promise.race([this.fetchFromServerCache(poolAddress), this.createTimeoutPromise(this.CACHE_TIMEOUT)]),
                            Promise.race([this.fetchFromSolanaRPC(poolAddress), this.createTimeoutPromise(this.CACHE_TIMEOUT)])
                        ]);
                        const updated = await this.selectFreshestData(bgResults, poolAddress);
                        if (updated) await this.updateLocalStorageCache(poolAddress, updated);
                    } catch (_) {}
                })();
                console.log('⚡ Using localStorage for instant render');
                return local;
            }

            // 2) Otherwise, race all sources with performance-first selection
            const results = await Promise.allSettled([
                Promise.race([this.fetchFromServerCache(poolAddress), this.createTimeoutPromise(this.CACHE_TIMEOUT)]),
                Promise.race([this.fetchFromSolanaRPC(poolAddress), this.createTimeoutPromise(this.CACHE_TIMEOUT)]),
                local // may be null
            ]);
            const selected = await this.selectFreshestData(results, poolAddress);
            if (!selected) throw new Error('No valid pool data received from any source');
            await this.updateLocalStorageCache(poolAddress, selected);
            console.log(`✅ Pool data loaded from: ${selected.source}`);
            return selected;
        } catch (error) {
            console.error('❌ Failed to get pool data:', error);
            throw error;
        }
    }

    /**
     * Fetch from server cache endpoint
     */
    async fetchFromServerCache(poolAddress) {
        const startTime = performance.now();
        
        try {
            const response = await fetch(`./pool-data.php?poolAddress=${poolAddress}`);
            const responseTime = performance.now() - startTime;
            
            if (response.ok) {
                const data = await response.json();
                const cacheStatus = response.headers.get('X-Cache-Status') || 'unknown';
                
                console.log(`📋 Server cache ${cacheStatus} (${Math.round(responseTime)}ms)`);
                
                return {
                    data: data.rpc_response,
                    generated_at: data.generated_at,
                    source: `server-cache-${cacheStatus}`,
                    response_time: responseTime,
                    schema_version: data.schema_version
                };
            } else {
                const errorText = await response.text();
                console.warn(`⚠️ Server cache failed (${response.status}):`, errorText);
                return null;
            }
        } catch (error) {
            console.warn('⚠️ Server cache error:', error.message);
            return null;
        }
    }

    /**
     * Fetch directly from Solana RPC
     */
    async fetchFromSolanaRPC(poolAddress) {
        if (!this.connection) {
            console.warn('⚠️ No RPC connection available');
            return null;
        }

        const startTime = performance.now();
        
        try {
            const accountInfo = await this.connection.getAccountInfo(
                new solanaWeb3.PublicKey(poolAddress),
                'confirmed'
            );
            
            const responseTime = performance.now() - startTime;
            console.log(`🔗 Direct RPC fetch (${Math.round(responseTime)}ms)`);
            
            if (accountInfo) {
                // Convert to same format as server cache
                const rpcResponse = {
                    context: { slot: await this.connection.getSlot() },
                    value: {
                        data: [accountInfo.data.toString('base64'), 'base64'],
                        executable: accountInfo.executable,
                        lamports: accountInfo.lamports,
                        owner: accountInfo.owner.toString(),
                        rentEpoch: accountInfo.rentEpoch,
                        space: accountInfo.data.length
                    }
                };

                return {
                    data: rpcResponse,
                    generated_at: new Date().toISOString(),
                    source: 'direct-rpc',
                    response_time: responseTime,
                    schema_version: this.SCHEMA_VERSION
                };
            } else {
                console.warn('⚠️ Pool not found via RPC');
                return null;
            }
        } catch (error) {
            console.warn('⚠️ RPC fetch error:', error.message);
            return null;
        }
    }

    /**
     * Fetch from localStorage LRU cache
     */
    async fetchFromLocalStorage(poolAddress) {
        try {
            const cacheData = JSON.parse(localStorage.getItem(this.LOCALSTORAGE_KEY) || '{}');
            
            if (!cacheData.schema_version || cacheData.schema_version !== this.SCHEMA_VERSION) {
                console.log('🧹 LocalStorage schema mismatch, clearing cache');
                localStorage.removeItem(this.LOCALSTORAGE_KEY);
                return null;
            }

            const poolCache = cacheData.pools?.[poolAddress];
            if (poolCache) {
                console.log(`💾 LocalStorage hit for pool`);
                
                // Update last accessed time
                poolCache.last_accessed = new Date().toISOString();
                this.updateAccessOrder(cacheData, poolAddress);
                localStorage.setItem(this.LOCALSTORAGE_KEY, JSON.stringify(cacheData));
                
                return {
                    data: poolCache.data,
                    generated_at: poolCache.generated_at,
                    source: 'localStorage',
                    response_time: 1, // Very fast
                    schema_version: poolCache.schema_version || this.SCHEMA_VERSION
                };
            } else {
                console.log('💾 LocalStorage miss');
                return null;
            }
        } catch (error) {
            console.warn('⚠️ LocalStorage error:', error.message);
            return null;
        }
    }

    /**
     * Select the best data balancing freshness and performance
     */
    async selectFreshestData(results, poolAddress) {
        const validResults = results
            .filter(result => result.status === 'fulfilled' && result.value)
            .map(result => result.value)
            .filter(data => data && data.data);

        if (validResults.length === 0) {
            return null;
        }

        // Performance-first selection: prefer fast cached data if reasonably fresh
        const FRESH_THRESHOLD = 5 * 60 * 1000; // 5 minutes in milliseconds
        const now = Date.now();
        
        // Sort by performance (localStorage > server cache > RPC)
        const performanceOrder = ['localStorage', 'server-cache-hit', 'server-cache-miss', 'direct-rpc'];
        validResults.sort((a, b) => {
            const indexA = performanceOrder.indexOf(a.source);
            const indexB = performanceOrder.indexOf(b.source);
            return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
        });

        // Find the best balance of performance and freshness
        let selectedResult = null;
        
        for (const result of validResults) {
            const age = now - new Date(result.generated_at).getTime();
            
            // If data is fresh enough (< 5 minutes), use the fastest source
            if (age < FRESH_THRESHOLD) {
                selectedResult = result;
                break;
            }
        }
        
        // If no fresh data available, use the freshest regardless of source
        if (!selectedResult) {
            validResults.sort((a, b) => {
                const dateA = new Date(a.generated_at);
                const dateB = new Date(b.generated_at);
                return dateB.getTime() - dateA.getTime();
            });
            selectedResult = validResults[0];
        }
        
        // Log comparison for debugging
        if (validResults.length > 1) {
            console.log('📊 Cache selection (performance-first):');
            validResults.forEach((result) => {
                const age = Date.now() - new Date(result.generated_at).getTime();
                const ageText = Math.round(age/1000);
                const selected = result === selectedResult;
                console.log(`  ${selected ? '✅' : '  '} ${result.source}: ${ageText}s old (${Math.round(result.response_time)}ms)`);
            });
        }

        return selectedResult;
    }

    /**
     * Update localStorage cache with LRU eviction
     */
    async updateLocalStorageCache(poolAddress, freshData) {
        try {
            let cacheData = JSON.parse(localStorage.getItem(this.LOCALSTORAGE_KEY) || '{}');
            
            // Initialize cache structure if needed
            if (!cacheData.schema_version) {
                cacheData = {
                    schema_version: this.SCHEMA_VERSION,
                    pools: {},
                    access_order: []
                };
            }

            // Add/update pool data
            cacheData.pools[poolAddress] = {
                data: freshData.data,
                generated_at: freshData.generated_at,
                last_accessed: new Date().toISOString(),
                cached_at: new Date().toISOString(),
                source: freshData.source,
                schema_version: this.SCHEMA_VERSION,
                extras: (cacheData.pools[poolAddress]?.extras || null)
            };

            // Update access order
            this.updateAccessOrder(cacheData, poolAddress);

            // Enforce LRU eviction (keep only 5 pools)
            while (cacheData.access_order.length > this.MAX_POOLS) {
                const oldestPool = cacheData.access_order.shift();
                delete cacheData.pools[oldestPool];
                console.log(`🗑️ Evicted old pool from cache: ${oldestPool.substring(0, 8)}...`);
            }

            // Save to localStorage
            localStorage.setItem(this.LOCALSTORAGE_KEY, JSON.stringify(cacheData));
            console.log(`💾 Updated localStorage cache (${Object.keys(cacheData.pools).length}/${this.MAX_POOLS} pools)`);
            
        } catch (error) {
            console.warn('⚠️ Failed to update localStorage cache:', error.message);
        }
    }

    /**
     * Update access order for LRU management
     */
    updateAccessOrder(cacheData, poolAddress) {
        // Remove from current position
        const index = cacheData.access_order.indexOf(poolAddress);
        if (index > -1) {
            cacheData.access_order.splice(index, 1);
        }
        
        // Add to end (most recently used)
        cacheData.access_order.push(poolAddress);
    }

    /**
     * Read cached extras (symbols/decimals) for a pool
     */
    getLocalExtras(poolAddress) {
        try {
            const cacheData = JSON.parse(localStorage.getItem(this.LOCALSTORAGE_KEY) || '{}');
            return cacheData.pools?.[poolAddress]?.extras || null;
        } catch (_) { return null; }
    }

    /**
     * Write cached extras (symbols/decimals) for a pool
     */
    setLocalExtras(poolAddress, extras) {
        try {
            const cacheData = JSON.parse(localStorage.getItem(this.LOCALSTORAGE_KEY) || '{}');
            if (!cacheData.schema_version) {
                cacheData.schema_version = this.SCHEMA_VERSION;
                cacheData.pools = {};
                cacheData.access_order = [];
            }
            if (!cacheData.pools[poolAddress]) {
                cacheData.pools[poolAddress] = {
                    data: null,
                    generated_at: new Date().toISOString(),
                    last_accessed: new Date().toISOString(),
                    cached_at: new Date().toISOString(),
                    source: 'localStorage',
                    schema_version: this.SCHEMA_VERSION,
                    extras: null
                };
            }
            cacheData.pools[poolAddress].extras = extras;
            localStorage.setItem(this.LOCALSTORAGE_KEY, JSON.stringify(cacheData));
        } catch (e) {
            console.warn('⚠️ Failed to set local extras:', e?.message);
        }
    }

    /**
     * Create timeout promise
     */
    createTimeoutPromise(timeout) {
        return new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Request timeout')), timeout);
        });
    }

    /**
     * Clear all caches
     */
    clearCache() {
        try {
            localStorage.removeItem(this.LOCALSTORAGE_KEY);
            console.log('🧹 Cleared localStorage cache');
        } catch (error) {
            console.warn('⚠️ Failed to clear cache:', error.message);
        }
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        try {
            const cacheData = JSON.parse(localStorage.getItem(this.LOCALSTORAGE_KEY) || '{}');
            return {
                schema_version: cacheData.schema_version,
                pool_count: Object.keys(cacheData.pools || {}).length,
                max_pools: this.MAX_POOLS,
                pools: Object.keys(cacheData.pools || {}).map(address => ({
                    address: address.substring(0, 8) + '...',
                    generated_at: cacheData.pools[address]?.generated_at,
                    last_accessed: cacheData.pools[address]?.last_accessed,
                    source: cacheData.pools[address]?.source
                }))
            };
        } catch (error) {
            return { error: error.message };
        }
    }
}

// Create global instance
window.PoolCacheManager = new PoolCacheManager();

console.log('🗄️ PoolCacheManager loaded');
