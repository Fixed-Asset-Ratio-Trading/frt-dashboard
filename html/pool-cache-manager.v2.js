/**
 * Pool Data Cache Manager (v2 - performance-first)
 * - Prefers fast cached data (<5m old) to render immediately
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

    async initialize(config, connection) {
        this.config = config;
        this.connection = connection;
        console.log('🗄️ PoolCacheManager initialized');
    }

    async getPoolData(poolAddress) {
        console.log(`🔄 Loading pool data for: ${poolAddress}`);
        try {
            const promises = [
                this.fetchFromServerCache(poolAddress),
                this.fetchFromSolanaRPC(poolAddress),
                this.fetchFromLocalStorage(poolAddress)
            ];

            const results = await Promise.allSettled(promises.map(p =>
                Promise.race([p, this.createTimeoutPromise(this.CACHE_TIMEOUT)])
            ));

            const selected = await this.selectFreshestData(results, poolAddress);
            if (selected) {
                await this.updateLocalStorageCache(poolAddress, selected);
                console.log(`✅ Pool data loaded from: ${selected.source}`);
                return selected;
            }
            throw new Error('No valid pool data received from any source');
        } catch (error) {
            console.error('❌ Failed to get pool data:', error);
            throw error;
        }
    }

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
            }
            console.warn('⚠️ Pool not found via RPC');
            return null;
        } catch (error) {
            console.warn('⚠️ RPC fetch error:', error.message);
            return null;
        }
    }

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
                console.log('💾 LocalStorage hit for pool');
                poolCache.last_accessed = new Date().toISOString();
                this.updateAccessOrder(cacheData, poolAddress);
                localStorage.setItem(this.LOCALSTORAGE_KEY, JSON.stringify(cacheData));
                return {
                    data: poolCache.data,
                    generated_at: poolCache.generated_at,
                    source: 'localStorage',
                    response_time: 1,
                    schema_version: poolCache.schema_version || this.SCHEMA_VERSION
                };
            }
            console.log('💾 LocalStorage miss');
            return null;
        } catch (error) {
            console.warn('⚠️ LocalStorage error:', error.message);
            return null;
        }
    }

    async selectFreshestData(results, poolAddress) {
        const validResults = results
            .filter(r => r.status === 'fulfilled' && r.value)
            .map(r => r.value)
            .filter(d => d && d.data);
        if (validResults.length === 0) return null;

        const FRESH_THRESHOLD = 5 * 60 * 1000; // 5 minutes
        const now = Date.now();
        const performanceOrder = ['localStorage', 'server-cache-hit', 'server-cache-miss', 'direct-rpc'];
        validResults.sort((a, b) => (performanceOrder.indexOf(a.source) - performanceOrder.indexOf(b.source)));

        let selected = null;
        for (const r of validResults) {
            const age = now - new Date(r.generated_at).getTime();
            if (age < FRESH_THRESHOLD) { selected = r; break; }
        }
        if (!selected) {
            validResults.sort((a, b) => new Date(b.generated_at) - new Date(a.generated_at));
            selected = validResults[0];
        }

        if (validResults.length > 1) {
            console.log('📊 Cache selection (performance-first):');
            validResults.forEach(r => {
                const age = Date.now() - new Date(r.generated_at).getTime();
                console.log(`  ${r === selected ? '✅' : '  '} ${r.source}: ${Math.round(age/1000)}s old (${Math.round(r.response_time)}ms)`);
            });
        }
        return selected;
    }

    async updateLocalStorageCache(poolAddress, freshData) {
        try {
            let cacheData = JSON.parse(localStorage.getItem(this.LOCALSTORAGE_KEY) || '{}');
            if (!cacheData.schema_version) {
                cacheData = { schema_version: this.SCHEMA_VERSION, pools: {}, access_order: [] };
            }
            cacheData.pools[poolAddress] = {
                data: freshData.data,
                generated_at: freshData.generated_at,
                last_accessed: new Date().toISOString(),
                cached_at: new Date().toISOString(),
                source: freshData.source,
                schema_version: this.SCHEMA_VERSION
            };
            this.updateAccessOrder(cacheData, poolAddress);
            while (cacheData.access_order.length > this.MAX_POOLS) {
                const oldest = cacheData.access_order.shift();
                delete cacheData.pools[oldest];
            }
            localStorage.setItem(this.LOCALSTORAGE_KEY, JSON.stringify(cacheData));
            console.log(`💾 Updated localStorage cache (${Object.keys(cacheData.pools).length}/${this.MAX_POOLS} pools)`);
        } catch (e) {
            console.warn('⚠️ Failed to update localStorage cache:', e.message);
        }
    }

    updateAccessOrder(cacheData, poolAddress) {
        const idx = cacheData.access_order.indexOf(poolAddress);
        if (idx > -1) cacheData.access_order.splice(idx, 1);
        cacheData.access_order.push(poolAddress);
    }

    createTimeoutPromise(timeout) { return new Promise((_, reject) => setTimeout(() => reject(new Error('Request timeout')), timeout)); }
    clearCache() { try { localStorage.removeItem(this.LOCALSTORAGE_KEY); console.log('🧹 Cleared localStorage cache'); } catch (e) { console.warn('⚠️ Failed to clear cache:', e.message); } }
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
        } catch (error) { return { error: error.message }; }
    }
}

window.PoolCacheManager = new PoolCacheManager();
console.log('🗄️ PoolCacheManager loaded');


