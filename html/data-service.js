// Fixed Ratio Trading - Centralized Data Service
// This service provides a unified interface for loading pool and system state data
// RPC-only: loads live data directly from the blockchain (no local state.json)

class TradingDataService {
    constructor() {
        this.connection = null;
        this.config = null;
        this.cache = new Map();
        this.cacheTimeout = 30000; // 30 seconds
    }

    /**
     * Initialize the data service with configuration
     */
    async initialize(config, connection = null) {
        this.config = config;
        this.connection = connection;
        console.log('📊 TradingDataService initialized');
    }

    /**
     * Load all data (RPC only)
     * @returns {Object} Complete state data
     */
    async loadAllData(source = 'rpc') {
        try {
            console.log('📥 Loading data from RPC (RPC-only mode)');
            return await this.loadFromRPC();
        } catch (error) {
            console.error('❌ Error loading data:', error);
            throw error;
        }
    }

    /**
     * Load data from RPC
     */
    async loadFromRPC() {
        if (!this.connection) {
            throw new Error('RPC connection not initialized');
        }

        try {
            console.log('🔍 Loading data from RPC...');
            
            // Get all program accounts
            const programAccounts = await this.connection.getProgramAccounts(
                new solanaWeb3.PublicKey(this.config.programId),
                { encoding: 'base64' }
            );
            
            console.log(`📊 Found ${programAccounts.length} program accounts`);
            
            // Parse pools (filter by size to avoid parsing treasury/system state)
            const pools = [];
            for (const account of programAccounts) {
                if (account.account.data.length > 300) { // Pool states are larger
                    try {
                        const poolData = this.parsePoolState(account.account.data, account.pubkey.toString());
                        if (poolData) {
                            pools.push(poolData);
                        }
                    } catch (error) {
                        console.warn(`Failed to parse pool at ${account.pubkey.toString()}:`, error);
                    }
                }
            }

            // Enrich pools with on-chain token decimals to replace former state.json dependency
            if (pools.length > 0 && window.TokenDisplayUtils?.getTokenDecimals) {
                await Promise.all(pools.map(async (pool) => {
                    try {
                        const [decA, decB] = await Promise.all([
                            window.TokenDisplayUtils.getTokenDecimals(pool.tokenAMint, this.connection),
                            window.TokenDisplayUtils.getTokenDecimals(pool.tokenBMint, this.connection)
                        ]);
                        pool.ratioADecimal = decA;
                        pool.ratioBDecimal = decB;
                        // Optional: compute display ratios for convenience
                        pool.ratioAActual = (pool.ratioANumerator || 0) / Math.pow(10, decA);
                        pool.ratioBActual = (pool.ratioBDenominator || 0) / Math.pow(10, decB);
                    } catch (e) {
                        console.warn('⚠️ Failed to fetch token decimals for pool', pool.address, e?.message);
                    }
                }));
            }

            // Load treasury and system state from PDAs
            let mainTreasuryState = null;
            let systemState = null;
            let pdaAddresses = null;
            try {
                const { mainTreasuryPda, systemStatePda } = await this.derivePDAAddresses();
                pdaAddresses = {
                    main_treasury: mainTreasuryPda.toString(),
                    system_state: systemStatePda.toString()
                };
                const [treasuryAcc, systemAcc] = await Promise.all([
                    this.connection.getAccountInfo(mainTreasuryPda, 'confirmed'),
                    this.connection.getAccountInfo(systemStatePda, 'confirmed')
                ]);
                if (treasuryAcc?.data) mainTreasuryState = this.parseMainTreasuryState(treasuryAcc.data);
                if (systemAcc?.data) systemState = this.parseSystemState(systemAcc.data);
            } catch (e) {
                console.warn('⚠️ Failed to load treasury/system state:', e?.message);
            }
            
            return {
                pools,
                mainTreasuryState,
                systemState,
                pdaAddresses,
                metadata: {
                    generated_at: new Date().toISOString(),
                    source: 'rpc'
                },
                source: 'rpc'
            };
        } catch (error) {
            console.error('❌ Error loading from RPC:', error);
            throw error;
        }
    }

    /**
     * Get a specific pool by address
     * @param {string} poolAddress - Pool address
     * @param {string} source - Data source preference
     * @returns {Object} Pool data
     */
    async getPool(poolAddress, source = 'rpc') {
        try {
            const cacheKey = `pool_${poolAddress}_${source}`;
            
            // Check cache first
            if (this.cache.has(cacheKey)) {
                const cached = this.cache.get(cacheKey);
                if (Date.now() - cached.timestamp < this.cacheTimeout) {
                    console.log(`📋 Using cached pool data for ${poolAddress}`);
                    return cached.data;
                }
            }
            
            let poolData = null;
            
            // Load directly from RPC for real-time data
            poolData = await this.getPoolFromRPC(poolAddress);
            
            if (poolData) {
                // Enrich with decimals if available
                if (window.TokenDisplayUtils?.getTokenDecimals) {
                    try {
                        const [decA, decB] = await Promise.all([
                            window.TokenDisplayUtils.getTokenDecimals(poolData.tokenAMint, this.connection),
                            window.TokenDisplayUtils.getTokenDecimals(poolData.tokenBMint, this.connection)
                        ]);
                        poolData.ratioADecimal = decA;
                        poolData.ratioBDecimal = decB;
                        poolData.ratioAActual = (poolData.ratioANumerator || 0) / Math.pow(10, decA);
                        poolData.ratioBActual = (poolData.ratioBDenominator || 0) / Math.pow(10, decB);
                    } catch (e) {
                        console.warn('⚠️ Failed to enrich pool with decimals:', e?.message);
                    }
                }
                // Cache the result
                this.cache.set(cacheKey, {
                    data: poolData,
                    timestamp: Date.now()
                });
            }
            
            return poolData;
        } catch (error) {
            console.error(`❌ Error getting pool ${poolAddress}:`, error);
            throw error;
        }
    }

    /**
     * Get pool data directly from RPC
     */
    async getPoolFromRPC(poolAddress) {
        if (!this.connection) {
            throw new Error('RPC connection not initialized');
        }

        try {
            console.log(`🔍 Loading pool ${poolAddress} from RPC...`);
            
            const poolAccount = await this.connection.getAccountInfo(
                new solanaWeb3.PublicKey(poolAddress)
            );
            
            if (!poolAccount) {
                throw new Error('Pool account not found');
            }
            
            return this.parsePoolState(poolAccount.data, poolAddress);
        } catch (error) {
            console.error(`❌ Error loading pool from RPC:`, error);
            throw error;
        }
    }

    /**
     * Centralized pool state parsing
     * This is the single source of truth for pool parsing logic
     */
    parsePoolState(data, address) {
        try {
            const dataArray = new Uint8Array(data);
            let offset = 0;
            
            // Helper functions to read bytes
            const readPubkey = () => {
                const pubkey = dataArray.slice(offset, offset + 32);
                offset += 32;
                return new solanaWeb3.PublicKey(pubkey).toString();
            };
            
            const readU64 = () => {
                const view = new DataView(dataArray.buffer, offset, 8);
                const value = view.getBigUint64(0, true); // little-endian
                offset += 8;
                return Number(value);
            };

            const readI64 = () => {
                const view = new DataView(dataArray.buffer, offset, 8);
                const value = view.getBigInt64(0, true); // little-endian
                offset += 8;
                return Number(value);
            };

            const readU8 = () => {
                const value = dataArray[offset];
                offset += 1;
                return value;
            };

            const readBool = () => {
                const value = dataArray[offset] !== 0;
                offset += 1;
                return value;
            };
            
            // Parse all PoolState fields according to the struct definition
            const owner = readPubkey();
            const tokenAMint = readPubkey();
            const tokenBMint = readPubkey();
            const tokenAVault = readPubkey();
            const tokenBVault = readPubkey();
            const lpTokenAMint = readPubkey();
            const lpTokenBMint = readPubkey();
            
            const ratioANumerator = readU64();
            const ratioBDenominator = readU64();
            const totalTokenALiquidity = readU64();
            const totalTokenBLiquidity = readU64();
            
            // Bump seeds
            const poolAuthorityBumpSeed = readU8();
            const tokenAVaultBumpSeed = readU8();
            const tokenBVaultBumpSeed = readU8();
            const lpTokenAMintBumpSeed = readU8();
            const lpTokenBMintBumpSeed = readU8();
            
            // Pool flags (bitwise operations)
            const flags = readU8();
            
            // Configurable contract fees
            const contractLiquidityFee = readU64();
            const swapContractFee = readU64();
            
            // Token fee tracking
            const collectedFeesTokenA = readU64();
            const collectedFeesTokenB = readU64();
            const totalFeesWithdrawnTokenA = readU64();
            const totalFeesWithdrawnTokenB = readU64();
            
            // SOL fee tracking
            const collectedLiquidityFees = readU64();
            const collectedSwapContractFees = readU64();
            const totalSolFeesCollected = readU64();
            
            // Consolidation management
            const lastConsolidationTimestamp = readI64();
            const totalConsolidations = readU64();
            const totalFeesConsolidated = readU64();
            
            // Decode flags
            const flagsDecoded = {
                one_to_many_ratio: (flags & 1) !== 0,
                liquidity_paused: (flags & 2) !== 0,
                swaps_paused: (flags & 4) !== 0,
                withdrawal_protection: (flags & 8) !== 0,
                single_lp_token_mode: (flags & 16) !== 0,
                swap_owner_only: (flags & 32) !== 0
            };
            
            return {
                address: address,
                owner,
                tokenAMint,
                tokenBMint,
                tokenAVault,
                tokenBVault,
                lpTokenAMint,
                lpTokenBMint,
                ratioANumerator,
                ratioBDenominator,
                tokenALiquidity: totalTokenALiquidity,
                tokenBLiquidity: totalTokenBLiquidity,
                
                // Bump seeds
                poolAuthorityBumpSeed,
                tokenAVaultBumpSeed,
                tokenBVaultBumpSeed,
                lpTokenAMintBumpSeed,
                lpTokenBMintBumpSeed,
                
                // Flags
                flags,
                flagsDecoded,
                
                // Fee configuration
                contractLiquidityFee,
                swapContractFee,
                
                // Token fee tracking
                collectedFeesTokenA,
                collectedFeesTokenB,
                totalFeesWithdrawnTokenA,
                totalFeesWithdrawnTokenB,
                
                // SOL fee tracking
                collectedLiquidityFees,
                collectedSwapContractFees,
                totalSolFeesCollected,
                
                // Consolidation data
                lastConsolidationTimestamp,
                totalConsolidations,
                totalFeesConsolidated,
                
                // Metadata
                dataSource: 'rpc',
                lastUpdated: Date.now()
            };
        } catch (error) {
            console.error(`❌ Error parsing pool state for ${address}:`, error);
            throw new Error(`Failed to parse pool state: ${error.message}`);
        }
    }

    // ==========================
    // Exact state.json builders
    // ==========================

    async derivePDAAddresses() {
        const programId = new solanaWeb3.PublicKey(this.config.programId);
        const [mainTreasuryPda] = await solanaWeb3.PublicKey.findProgramAddress(
            [new TextEncoder().encode('main_treasury')],
            programId
        );
        const [systemStatePda] = await solanaWeb3.PublicKey.findProgramAddress(
            [new TextEncoder().encode('system_state')],
            programId
        );
        return { mainTreasuryPda, systemStatePda };
    }

    parseMainTreasuryState(data) {
        try {
            const bytes = new Uint8Array(data);
            let offset = 0;
            const readU64 = () => {
                const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 8);
                const val = Number(view.getBigUint64(0, true));
                offset += 8;
                return val;
            };
            const readI64 = () => {
                const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 8);
                const val = Number(view.getBigInt64(0, true));
                offset += 8;
                return val;
            };
            return {
                total_balance: readU64(),
                rent_exempt_minimum: readU64(),
                total_withdrawn: readU64(),
                pool_creation_count: readU64(),
                liquidity_operation_count: readU64(),
                regular_swap_count: readU64(),
                treasury_withdrawal_count: readU64(),
                failed_operation_count: readU64(),
                total_pool_creation_fees: readU64(),
                total_liquidity_fees: readU64(),
                total_regular_swap_fees: readU64(),
                total_swap_contract_fees: readU64(),
                last_update_timestamp: readI64(),
                total_consolidations_performed: readU64(),
                last_consolidation_timestamp: readI64()
            };
        } catch (e) {
            console.warn('⚠️ Failed to parse MainTreasuryState:', e?.message);
            return null;
        }
    }

    parseSystemState(data) {
        try {
            const bytes = new Uint8Array(data);
            let offset = 0;
            const readU8 = () => bytes[offset++];
            const readBool = () => (bytes[offset++] !== 0);
            const readI64 = () => {
                const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 8);
                const val = Number(view.getBigInt64(0, true));
                offset += 8;
                return val;
            };
            const readPubkey = () => {
                const slice = bytes.slice(offset, offset + 32);
                offset += 32;
                return new solanaWeb3.PublicKey(slice).toString();
            };

            // v0.16.x+ SystemState structure (83 bytes):
            // is_paused: bool (1)
            // pause_timestamp: i64 (8)
            // pause_reason_code: u8 (1)
            // admin_authority: Pubkey (32)
            // pending_admin_authority: Option<Pubkey> (1 + 32 if Some)
            // admin_change_timestamp: i64 (8)

            const is_paused = readBool();
            const pause_timestamp = readI64();
            const pause_reason_code = readU8();
            const admin_authority = readPubkey();

            let pending_admin_authority = null;
            const hasPending = readU8(); // 0 = None, 1 = Some
            if (hasPending === 1) {
                pending_admin_authority = readPubkey();
            }

            const admin_change_timestamp = readI64();

            return {
                is_paused,
                pause_timestamp,
                pause_reason_code,
                admin_authority,
                pending_admin_authority,
                admin_change_timestamp
            };
        } catch (e) {
            console.warn('⚠️ Failed to parse SystemState:', e?.message);
            return null;
        }
    }

    async loadStateJsonExact() {
        if (!this.connection) throw new Error('RPC connection not initialized');
        const programId = this.config.programId;
        const rpcUrl = (this.connection?._rpcEndpoint) || this.config.rpcUrl || '';
        const result = {
            metadata: {
                generated_at: new Date().toISOString(),
                program_id: programId,
                rpc_url: rpcUrl,
                script_version: '1.0.0',
                solana_environment: 'local/remote-testnet'
            },
            pools: [],
            main_treasury_state: null,
            system_state: null,
            pda_addresses: null
        };

        // Derive PDAs
        const { mainTreasuryPda, systemStatePda } = await this.derivePDAAddresses();
        result.pda_addresses = {
            main_treasury: mainTreasuryPda.toString(),
            system_state: systemStatePda.toString()
        };

        // Load program accounts
        const programAccounts = await this.connection.getProgramAccounts(
            new solanaWeb3.PublicKey(programId),
            { encoding: 'base64' }
        );

        // Parse pools
        const pools = [];
        for (const account of programAccounts) {
            if (account.account.data.length > 300) {
                try {
                    const pool = this.parsePoolState(account.account.data, account.pubkey.toString());
                    // Fetch decimals
                    let decA = 6, decB = 6;
                    try {
                        if (window.TokenDisplayUtils?.getTokenDecimals) {
                            [decA, decB] = await Promise.all([
                                window.TokenDisplayUtils.getTokenDecimals(pool.tokenAMint, this.connection),
                                window.TokenDisplayUtils.getTokenDecimals(pool.tokenBMint, this.connection)
                            ]);
                        }
                    } catch (_) {}

                    const ratio_a_actual = (pool.ratioANumerator || 0) / Math.pow(10, decA);
                    const ratio_b_actual = (pool.ratioBDenominator || 0) / Math.pow(10, decB);

                    const poolJson = {
                        address: pool.address,
                        owner: pool.owner,
                        token_a_mint: pool.tokenAMint,
                        token_b_mint: pool.tokenBMint,
                        token_a_vault: pool.tokenAVault,
                        token_b_vault: pool.tokenBVault,
                        lp_token_a_mint: pool.lpTokenAMint,
                        lp_token_b_mint: pool.lpTokenBMint,
                        ratio_a_numerator: pool.ratioANumerator,
                        ratio_a_decimal: decA,
                        ratio_a_actual: ratio_a_actual,
                        ratio_b_denominator: pool.ratioBDenominator,
                        ratio_b_decimal: decB,
                        ratio_b_actual: ratio_b_actual,
                        total_token_a_liquidity: pool.tokenALiquidity,
                        total_token_b_liquidity: pool.tokenBLiquidity,
                        pool_authority_bump_seed: pool.poolAuthorityBumpSeed,
                        token_a_vault_bump_seed: pool.tokenAVaultBumpSeed,
                        token_b_vault_bump_seed: pool.tokenBVaultBumpSeed,
                        lp_token_a_mint_bump_seed: pool.lpTokenAMintBumpSeed,
                        lp_token_b_mint_bump_seed: pool.lpTokenBMintBumpSeed,
                        flags: pool.flags,
                        contract_liquidity_fee: pool.contractLiquidityFee,
                        swap_contract_fee: pool.swapContractFee,
                        collected_fees_token_a: pool.collectedFeesTokenA,
                        collected_fees_token_b: pool.collectedFeesTokenB,
                        total_fees_withdrawn_token_a: pool.totalFeesWithdrawnTokenA,
                        total_fees_withdrawn_token_b: pool.totalFeesWithdrawnTokenB,
                        total_sol_fees_collected: pool.totalSolFeesCollected
                    };
                    pools.push(poolJson);
                } catch (e) {
                    console.warn('Failed parsing pool for state.json:', e?.message);
                }
            }
        }
        result.pools = pools;

        // Load treasury state
        try {
            const acc = await this.connection.getAccountInfo(mainTreasuryPda, 'confirmed');
            if (acc?.data) result.main_treasury_state = this.parseMainTreasuryState(acc.data);
        } catch (e) {
            console.warn('Treasury state load failed:', e?.message);
        }

        // Load system state
        try {
            const acc = await this.connection.getAccountInfo(systemStatePda, 'confirmed');
            if (acc?.data) result.system_state = this.parseSystemState(acc.data);
        } catch (e) {
            console.warn('System state load failed:', e?.message);
        }

        return result;
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.cache.clear();
        console.log('🧹 Data service cache cleared');
    }

    /**
     * Get cache stats
     */
    getCacheStats() {
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys())
        };
    }
}

// Create a global instance
window.TradingDataService = new TradingDataService();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TradingDataService;
}

console.log('📊 TradingDataService loaded'); 