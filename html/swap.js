/**
 * Enhanced Swap Page JavaScript
 * Implements complete swap functionality with wallet integration and real transactions
 * 
 * Dependencies:
 * - error-codes.js: Centralized error code mapping (loaded via script tag)
 */

// Global variables
let poolAddress = null;
let poolData = null;
let connection = null;
let wallet = null;
let isConnected = false;
let userTokens = [];
let swapDirection = 'AtoB'; // 'AtoB' or 'BtoA'
let tokenPairRatio = null; // 🎯 CENTRALIZED: TokenPairRatio instance for all calculations
let poolStatusCheckInterval = null; // For periodic pool status monitoring
// No slippage tolerance needed for fixed ratio trading

/**
 * Initialize the swap page with library loading retry mechanism
 */
async function initializeSwapPage() {
    console.log('🔄 Initializing Enhanced Swap Page...');
    
    // Simple retry mechanism for library loading
    let attempts = 0;
    const maxAttempts = 8;
    
    const tryInitialize = async () => {
        attempts++;
        console.log(`📋 Initialization attempt ${attempts}/${maxAttempts}`);
        
        // Check if libraries are loaded
        if (window.solanaWeb3 && window.SPL_TOKEN_LOADED === true) {
            console.log('✅ All libraries loaded successfully!');
            await initializeApp();
            return;
        }
        
        // If libraries aren't loaded yet, try again
        if (attempts < maxAttempts) {
            console.log(`⏳ Libraries still loading... retrying in 1 second`);
            setTimeout(tryInitialize, 1000);
        } else {
            console.error('❌ Failed to load libraries after', maxAttempts, 'attempts');
            showStatus('error', '❌ Failed to load required libraries. Please refresh the page.');
        }
    };
    
    // Check for SPL Token library
    setTimeout(() => {
        let splTokenLib = null;
        const possibleNames = ['splToken', 'SPLToken', 'SplToken'];
        
        for (const name of possibleNames) {
            if (window[name]) {
                splTokenLib = window[name];
                console.log(`✅ Found SPL Token library as window.${name}`);
                break;
            }
        }
        
        if (!splTokenLib && window.solanaWeb3) {
            for (const name of possibleNames) {
                if (window.solanaWeb3[name]) {
                    splTokenLib = window.solanaWeb3[name];
                    console.log(`✅ Found SPL Token library as solanaWeb3.${name}`);
                    break;
                }
            }
        }
        
        if (splTokenLib) {
            window.splToken = splTokenLib;
            window.SPL_TOKEN_LOADED = true;
            console.log('✅ SPL Token library ready!');
        } else {
            console.error('❌ SPL Token library not found');
            window.SPL_TOKEN_LOADED = false;
        }
        
        // Start first attempt after a brief delay
        setTimeout(tryInitialize, 1500);
    }, 100);
}

/**
 * Initialize the application after libraries are loaded
 */
async function initializeApp() {
    try {
        // Wait for configuration to be loaded
        let configAttempts = 0;
        while (!window.TRADING_CONFIG && configAttempts < 30) {
            await new Promise(resolve => setTimeout(resolve, 100));
            configAttempts++;
        }
        
        if (!window.TRADING_CONFIG) {
            throw new Error('Configuration failed to load after 3 seconds');
        }
        
        // Set up CONFIG alias for backward compatibility
        window.CONFIG = window.TRADING_CONFIG;
        
        // Determine poolAddress early
        const urlParams = new URLSearchParams(window.location.search);
        poolAddress = urlParams.get('pool') || sessionStorage.getItem('selectedPoolAddress');
        if (!poolAddress) {
            throw new Error('Pool address not specified');
        }
        console.log('🎯 Loading pool for swap:', poolAddress);

        // Fast-path: if we have fresh local cache, avoid any slow connections before first paint
        let fastRender = false;
        try {
            if (!window.PoolCacheManager?.connection) {
                await window.PoolCacheManager.initialize(window.TRADING_CONFIG, null);
            }
            const local = await window.PoolCacheManager.fetchFromLocalStorage(poolAddress);
            const fresh = local && (Date.now() - new Date(local.generated_at).getTime() < 5 * 60 * 1000);
            fastRender = !!fresh;
            if (fastRender) {
                console.log('⚡ Fast-render mode enabled (fresh local cache)');
            }
        } catch (_) {}

        // Initialize Solana connection (defer WS if fast-render)
        console.log('🔌 Connecting to Solana RPC...');
        const connectionConfig = {
            commitment: CONFIG.commitment,
            disableRetryOnRateLimit: CONFIG.disableRetryOnRateLimit || true
        };
        if (fastRender) {
            console.log('📡 Using HTTP polling (WS deferred until idle)');
            connectionConfig.wsEndpoint = false;
            connection = new solanaWeb3.Connection(CONFIG.rpcUrl, connectionConfig);
        } else {
            if (CONFIG.wsUrl) {
                console.log('📡 Using WebSocket endpoint:', CONFIG.wsUrl);
                connection = new solanaWeb3.Connection(CONFIG.rpcUrl, connectionConfig, CONFIG.wsUrl);
            } else {
                console.log('📡 Using HTTP polling (WebSocket disabled)');
                connectionConfig.wsEndpoint = false;
                connection = new solanaWeb3.Connection(CONFIG.rpcUrl, connectionConfig);
            }
        }
        
        console.log('✅ SPL Token library ready');
        
        // Check if Backpack is installed (but don't block interface if not)
        if (!window.backpack) {
            console.log('⚠️ Backpack wallet not detected - interface will work without wallet connection');
            // Don't return here - continue with pool loading
        }
        
        // poolAddress was resolved earlier; validate only
        if (!poolAddress) {
            showStatus('error', 'No pool selected. Please select a pool from the dashboard or provide a pool ID in the URL (?pool=POOL_ID).');
            return;
        }
        
        // Store pool address in sessionStorage for potential navigation
        sessionStorage.setItem('selectedPoolAddress', poolAddress);
        
        await loadPoolData();
        
        // Defer wallet connect and WS upgrade until idle to avoid blocking render
        showWalletConnection();
        const runAfterIdle = (fn) => {
            if ('requestIdleCallback' in window) { window.requestIdleCallback(() => fn(), { timeout: 2000 }); }
            else { setTimeout(fn, 0); }
        };
        runAfterIdle(async () => {
            try {
                // Upgrade to WS after paint if we deferred it
                if (fastRender && CONFIG.wsUrl) {
                    try {
                        console.log('📡 Upgrading to WebSocket connection (idle)');
                        const newConn = new solanaWeb3.Connection(CONFIG.rpcUrl, {
                            commitment: CONFIG.commitment,
                            disableRetryOnRateLimit: CONFIG.disableRetryOnRateLimit || true
                        }, CONFIG.wsUrl);
                        connection = newConn;
                        if (window.TradingDataService) {
                            window.TradingDataService.connection = newConn;
                        }
                    } catch (e) {
                        console.warn('⚠️ WS upgrade failed (will continue with HTTP):', e?.message);
                    }
                }
                // Connect wallet only after page is rendered
                if (window.backpack && window.backpack.isConnected) {
                    await handleWalletConnected();
                }
            } catch (_) {}
        });
        
    } catch (error) {
        console.error('❌ Error initializing swap page:', error);
        showStatus('error', `Failed to initialize: ${error.message}`);
    }
}

/**
 * Load pool data using three-tier caching strategy
 */
async function loadPoolData() {
    try {
        showStatus('info', 'Loading pool information...');
        
        // Initialize pool cache manager if not already done
        if (!window.PoolCacheManager.connection) {
            await window.PoolCacheManager.initialize(window.TRADING_CONFIG, connection);
        }
        
        // Get pool data using three-tier caching (server cache + RPC + localStorage)
        const cacheResult = await window.PoolCacheManager.getPoolData(poolAddress);
        
        // Render immediately if localStorage or server cache provided data
        if (cacheResult && (cacheResult.source === 'localStorage' || cacheResult.source.startsWith('server-cache'))) {
            try {
                const base64Data = cacheResult.data.value.data[0];
                const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
                poolData = window.TradingDataService.parsePoolState(binaryData, poolAddress);
                
                // Fetch decimals async but do not block initial render
                (async () => {
                    try {
                        const [decA, decB] = await Promise.all([
                            window.TokenDisplayUtils.getTokenDecimals(poolData.tokenAMint, connection),
                            window.TokenDisplayUtils.getTokenDecimals(poolData.tokenBMint, connection)
                        ]);
                        poolData.ratioADecimal = decA;
                        poolData.ratioBDecimal = decB;
                        poolData.ratioAActual = (poolData.ratioANumerator || 0) / Math.pow(10, decA);
                        poolData.ratioBActual = (poolData.ratioBDenominator || 0) / Math.pow(10, decB);
                        // Re-enrich UI quietly
                        try { await enrichPoolData(); } catch (_) {}
                    } catch (_) {}
                })();
                
                // Proceed to render UI immediately
                console.log('⚡ Rendering immediately from cache:', cacheResult.source);
            } catch (e) {
                console.warn('⚠️ Failed fast render from cache, falling back:', e.message);
            }
        }
        
        if (cacheResult && cacheResult.data) {
            // Parse the raw RPC data using existing TradingDataService parser
            if (!window.TradingDataService.connection) {
                await window.TradingDataService.initialize(window.TRADING_CONFIG, connection);
            }
            
            try {
                // Convert cached RPC response to parsed pool data
                // The cached data is base64 encoded, so we need to decode it first
                const base64Data = cacheResult.data.value.data[0];
                const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
                
                poolData = window.TradingDataService.parsePoolState(
                    binaryData, 
                    poolAddress
                );
                
                // Enrich with token decimals if available from TradingDataService
                if (window.TokenDisplayUtils?.getTokenDecimals) {
                    try {
                        const [decA, decB] = await Promise.all([
                            window.TokenDisplayUtils.getTokenDecimals(poolData.tokenAMint, connection),
                            window.TokenDisplayUtils.getTokenDecimals(poolData.tokenBMint, connection)
                        ]);
                        poolData.ratioADecimal = decA;
                        poolData.ratioBDecimal = decB;
                        poolData.ratioAActual = (poolData.ratioANumerator || 0) / Math.pow(10, decA);
                        poolData.ratioBActual = (poolData.ratioBDenominator || 0) / Math.pow(10, decB);
                    } catch (e) {
                        console.warn('⚠️ Failed to fetch token decimals for cached pool:', e?.message);
                    }
                }
                
                // Add cache metadata
                poolData.cacheSource = cacheResult.source;
                poolData.cacheResponseTime = cacheResult.response_time;
                poolData.generatedAt = cacheResult.generated_at;
            } catch (parseError) {
                console.error('❌ Failed to parse cached pool data:', parseError);
                console.log('Cache result structure:', cacheResult);
                throw new Error(`Failed to parse cached pool data: ${parseError.message}`);
            }
            
            console.log(`✅ Pool loaded via PoolCacheManager (source: ${cacheResult.source}, ${Math.round(cacheResult.response_time)}ms)`);
            
            // Update cache status indicator
            updateCacheStatusDisplay(cacheResult);
            
            // 🔍 DEVELOPER DEBUGGING: Log complete pool data to console
            console.group('🔍 POOL DATA FOR DEVELOPERS');
            console.log('📊 Complete Pool State:', poolData);
            console.log('🏊‍♂️ Pool Address:', poolAddress);
            console.log('🗄️ Cache Source:', cacheResult.source);
            console.log('⚡ Response Time:', Math.round(cacheResult.response_time) + 'ms');
            console.log('🪙 Token A Mint:', poolData.tokenAMint || poolData.token_a_mint);
            console.log('🪙 Token B Mint:', poolData.tokenBMint || poolData.token_b_mint);
            console.log('⚖️ Ratio A Numerator:', poolData.ratioANumerator || poolData.ratio_a_numerator);
            console.log('⚖️ Ratio B Denominator:', poolData.ratioBDenominator || poolData.ratio_b_denominator);
            console.log('💧 Token A Liquidity:', poolData.tokenALiquidity || poolData.total_token_a_liquidity);
            console.log('💧 Token B Liquidity:', poolData.tokenBLiquidity || poolData.total_token_b_liquidity);
            console.log('🚩 Pool Flags:', poolData.flags);
            console.log('🔒 Pool Owner:', poolData.owner);
            console.groupEnd();
            
            await enrichPoolData();
            updatePoolDisplay();
            initializeSwapInterface();
            clearStatus();
        } else {
            showStatus('error', 'Pool not found. Please check the pool address.');
        }
        
    } catch (error) {
        console.error('❌ Error loading pool data:', error);
        showStatus('error', `Failed to load pool: ${error.message}`);
    }
}

/**
 * Enrich pool data with token symbols
 */
async function enrichPoolData() {
    if (!poolData) return;
    
    try {
        // Try cached extras first for performance
        const cachedExtras = window.PoolCacheManager?.getLocalExtras?.(poolData.address || poolAddress) || null;
        if (cachedExtras?.tokenASymbol && cachedExtras?.tokenBSymbol) {
            poolData.tokenASymbol = cachedExtras.tokenASymbol;
            poolData.tokenBSymbol = cachedExtras.tokenBSymbol;
        } else {
            const symbols = await getTokenSymbols(
                poolData.tokenAMint || poolData.token_a_mint, 
                poolData.tokenBMint || poolData.token_b_mint
            );
            poolData.tokenASymbol = symbols.tokenA;
            poolData.tokenBSymbol = symbols.tokenB;
            // Persist symbols for future instant renders
            window.PoolCacheManager?.setLocalExtras?.(poolData.address || poolAddress, {
                ...(cachedExtras || {}),
                tokenASymbol: poolData.tokenASymbol,
                tokenBSymbol: poolData.tokenBSymbol
            });
        }
        
        console.log(`✅ Token symbols resolved: ${poolData.tokenASymbol}/${poolData.tokenBSymbol}`);
    } catch (error) {
        console.warn('Warning: Could not load token symbols:', error);
        poolData.tokenASymbol = `${(poolData.tokenAMint || poolData.token_a_mint)?.slice(0, 4) || 'A'}`;
        poolData.tokenBSymbol = `${(poolData.tokenBMint || poolData.token_b_mint)?.slice(0, 4) || 'B'}`;
    }
    
    // 🎯 CENTRALIZED: Create TokenPairRatio instance for all calculations
    try {
        // If decimals are not present, try cached extras, else compute async
        if (typeof poolData.ratioADecimal !== 'number' || typeof poolData.ratioBDecimal !== 'number') {
            if (cachedExtras?.ratioADecimal != null && cachedExtras?.ratioBDecimal != null) {
                poolData.ratioADecimal = cachedExtras.ratioADecimal;
                poolData.ratioBDecimal = cachedExtras.ratioBDecimal;
                poolData.ratioAActual = (poolData.ratioANumerator || 0) / Math.pow(10, poolData.ratioADecimal);
                poolData.ratioBActual = (poolData.ratioBDenominator || 0) / Math.pow(10, poolData.ratioBDecimal);
            } else if (window.TokenDisplayUtils?.getTokenDecimals) {
                // Fetch decimal info in the background, then persist and patch UI
                (async () => {
                    try {
                        const [decA, decB] = await Promise.all([
                            window.TokenDisplayUtils.getTokenDecimals(poolData.tokenAMint || poolData.token_a_mint, connection),
                            window.TokenDisplayUtils.getTokenDecimals(poolData.tokenBMint || poolData.token_b_mint, connection)
                        ]);
                        poolData.ratioADecimal = decA;
                        poolData.ratioBDecimal = decB;
                        poolData.ratioAActual = (poolData.ratioANumerator || 0) / Math.pow(10, decA);
                        poolData.ratioBActual = (poolData.ratioBDenominator || 0) / Math.pow(10, decB);
                        window.PoolCacheManager?.setLocalExtras?.(poolData.address || poolAddress, {
                            ...(cachedExtras || {}),
                            ratioADecimal: decA,
                            ratioBDecimal: decB
                        });
                        try { updatePoolDisplay(); } catch (_) {}
                    } catch (_) {}
                })();
            }
        }

        tokenPairRatio = TokenPairRatio.fromPoolData(poolData);
        console.log(`🎯 TokenPairRatio created: ${tokenPairRatio.ExchangeDisplay()}`);
        console.log(`🔍 TokenPairRatio ready:`, tokenPairRatio.getDebugInfo());
    } catch (error) {
        console.error('❌ Failed to create TokenPairRatio:', error);
        throw error; // Critical error - cannot proceed without ratio calculations
    }
    
    // ✅ CENTRALIZED: Pool data is ready for display - no additional enrichment needed
    console.log('✅ SWAP: Pool data ready for centralized display functions');
}

/**
 * Get token symbols from Metaplex, or defaults
 */
async function getTokenSymbols(tokenAMint, tokenBMint) {
    try {
        console.log(`🔍 Looking up symbols for tokens: ${tokenAMint} and ${tokenBMint}`);
        
        const tokenASymbol = await getTokenSymbol(tokenAMint, 'A');
        const tokenBSymbol = await getTokenSymbol(tokenBMint, 'B');
        
        console.log(`✅ Token symbols found: ${tokenASymbol}/${tokenBSymbol}`);
        
        return {
            tokenA: tokenASymbol,
            tokenB: tokenBSymbol
        };
    } catch (error) {
        console.warn('❌ Error getting token symbols:', error);
        return {
            tokenA: `${tokenAMint?.slice(0, 4) || 'A'}`,
            tokenB: `${tokenBMint?.slice(0, 4) || 'B'}`
        };
    }
}

/**
 * Get token symbol from Metaplex, or default
 */
async function getTokenSymbol(tokenMint, tokenLabel) {
    try {
        // Try Metaplex metadata (if available)
        if (window.TokenDisplayUtils?.queryTokenMetadata) {
            console.log(`🔍 Querying Metaplex metadata for token ${tokenLabel}: ${tokenMint}`);
            const metadataAccount = await window.TokenDisplayUtils.queryTokenMetadata(tokenMint, connection);
            
            if (metadataAccount?.symbol) {
                console.log(`✅ Found token ${tokenLabel} symbol in Metaplex: ${metadataAccount.symbol}`);
                return metadataAccount.symbol;
            }
        }
        
        // Fallback to default
        const defaultSymbol = `${tokenMint?.slice(0, 4) || tokenLabel}`;
        console.log(`⚠️ Using default symbol for token ${tokenLabel}: ${defaultSymbol}`);
        return defaultSymbol;
        
    } catch (error) {
        console.warn(`❌ Error getting symbol for token ${tokenLabel}:`, error);
        return `${tokenMint?.slice(0, 4) || tokenLabel}`;
    }
}

/**
 * Create token image HTML using PHP cache (same pattern as pool-creation.js)
 */
function createTokenImageHTML(mintAddress, symbol) {
    const safeSymbol = (symbol || 'T').toString().replace(/["'<>]/g, '');
    // Use our PHP cache endpoint for reliable image serving
    const cacheUrl = `/token-image.php?mint=${encodeURIComponent(mintAddress)}`;
    const fallbackSvg = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='40' fill='%23667eea'/><text x='50' y='60' text-anchor='middle' fill='white' font-size='30'>${safeSymbol.charAt(0)}</text></svg>`;
    
    // Simple fallback to generated SVG if PHP cache fails
    const onErrorHandler = `this.src='${fallbackSvg}'; this.onerror=null;`;
    
    return `<img src="${cacheUrl}" alt="${safeSymbol}" onerror="${onErrorHandler}">`;
}

/**
 * Format number with appropriate decimal places, removing trailing zeros
 */
function formatTokenAmount(amount, decimals) {
    if (amount === 0) {
        // For zero amounts, show the appropriate number of decimal places
        if (decimals === 0) return '0';
        return '0.' + '0'.repeat(decimals);
    }
    
    // Format with full decimal places first
    const formatted = amount.toFixed(decimals);
    
    // Remove trailing zeros, but keep at least one decimal place if there were decimals
    if (decimals > 0) {
        return formatted.replace(/\.?0+$/, '');
    }
    
    return formatted;
}

/**
 * Show wallet connection UI (deprecated - interface now works without wallet)
 * Kept for compatibility but no longer blocks the interface
 */
function showWalletConnection() {
    // No longer needed - interface works without wallet connection
    // The swap interface will show "Connect Wallet to Swap" button instead
    console.log('🔄 Wallet not connected - interface will show connect button when user tries to swap');
}

/**
 * Connect wallet
 */
async function connectWallet() {
    try {
        console.log('🔗 Connecting to Backpack wallet...');
        showStatus('info', 'Connecting to wallet...');
        
        await window.backpack.connect();
        await handleWalletConnected();
        
    } catch (error) {
        console.error('❌ Error connecting wallet:', error);
        showStatus('error', 'Failed to connect wallet: ' + error.message);
    }
}

/**
 * Handle wallet connected state
 */
async function handleWalletConnected() {
    try {
        wallet = window.backpack;
        isConnected = true;
        
        console.log('✅ Wallet connected:', wallet.publicKey.toString());
        
        // Defer token/balance calls to avoid blocking
        const runAfterIdle = (fn) => {
            if ('requestIdleCallback' in window) { window.requestIdleCallback(() => fn(), { timeout: 2000 }); }
            else { setTimeout(fn, 50); }
        };
        runAfterIdle(async () => {
            try { await checkWalletBalance(); } catch (e) { console.warn('⚠️ Balance fetch deferred error:', e?.message); }
            try { await loadUserTokensForPool(); } catch (e) { console.warn('⚠️ Token fetch deferred error:', e?.message); }
        });
        
        // Update swap interface with real balances (preserving any existing amounts)
        const existingFromAmount = document.getElementById('from-amount').value;
        const existingToAmount = document.getElementById('to-amount').value;
        
        // Initialize swap interface with wallet connection
        initializeSwapInterface();
        
        // Restore any existing amounts and recalculate
        if (existingFromAmount) {
            document.getElementById('from-amount').value = existingFromAmount;
            calculateSwapOutputEnhanced();
        } else if (existingToAmount) {
            document.getElementById('to-amount').value = existingToAmount;
            calculateSwapInputFromOutput();
        }
        
        // Start periodic pool status monitoring
        startPoolStatusMonitoring();
        
        showStatus('success', `Wallet connected: ${wallet.publicKey.toString().slice(0, 8)}...`);
        
    } catch (error) {
        console.error('❌ Error handling wallet connection:', error);
        showStatus('error', 'Failed to set up wallet: ' + error.message);
    }
}

/**
 * Check wallet balance
 */
async function checkWalletBalance() {
    try {
        const balance = await connection.getBalance(wallet.publicKey);
        const solBalance = balance / solanaWeb3.LAMPORTS_PER_SOL;
        
        console.log(`💰 Wallet SOL balance: ${solBalance.toFixed(4)} SOL`);
        
        if (solBalance < 0.01) {
            showStatus('error', `⚠️ Low SOL balance: ${solBalance.toFixed(4)} SOL. You need SOL for transaction fees.`);
        }
    } catch (error) {
        console.error('❌ Error checking balance:', error);
    }
}

/**
 * Load user's tokens that match the pool tokens
 */
async function loadUserTokensForPool() {
    try {
        if (!poolData || !isConnected) return;
        
        showStatus('info', '🔍 Loading your pool tokens...');
        
        // Get all token accounts for the user (with caching/backoff)
        const cacheKey = `wallet_tokens_${wallet.publicKey.toString()}_${(window.CONFIG?.rpcUrl || '').slice(-6)}`;
        const cached = sessionStorage.getItem(cacheKey);
        let tokenAccounts;
        if (cached) {
            try {
                const data = JSON.parse(cached);
                if (Date.now() - (data.timestamp || 0) < 2 * 60 * 1000) {
                    console.log('💾 Using cached wallet token accounts');
                    tokenAccounts = data.tokenAccounts;
                }
            } catch (_) {}
        }
        if (!tokenAccounts) {
            try {
                tokenAccounts = await connection.getParsedTokenAccountsByOwner(
                    wallet.publicKey,
                    { programId: window.splToken.TOKEN_PROGRAM_ID }
                );
            } catch (e) {
                console.warn('⚠️ Primary RPC token fetch failed:', e?.message);
                await new Promise(r => setTimeout(r, 300));
                const fallbacks = (window.TRADING_CONFIG?.fallbackRpcUrls || []);
                for (const rpc of fallbacks) {
                    try {
                        const altConn = new solanaWeb3.Connection(rpc, { commitment: 'confirmed', disableRetryOnRateLimit: true });
                        tokenAccounts = await altConn.getParsedTokenAccountsByOwner(
                            wallet.publicKey,
                            { programId: window.splToken.TOKEN_PROGRAM_ID }
                        );
                        console.log('✅ Token accounts fetched via fallback RPC');
                        break;
                    } catch (e2) {
                        console.warn('⚠️ Fallback RPC failed:', e2?.message);
                    }
                }
                if (!tokenAccounts) throw e;
            }
            try { sessionStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), tokenAccounts })); } catch (_) {}
        }
        
        console.log(`Found ${tokenAccounts.value.length} token accounts`);
        
        userTokens = [];
        const tokenAMint = poolData.tokenAMint || poolData.token_a_mint;
        const tokenBMint = poolData.tokenBMint || poolData.token_b_mint;
        
        for (const tokenAccount of tokenAccounts.value) {
            const accountInfo = tokenAccount.account.data.parsed.info;
            const mintAddress = accountInfo.mint;
            
            // Only include tokens that are part of this pool
            if (mintAddress === tokenAMint || mintAddress === tokenBMint) {
                const balance = parseInt(accountInfo.tokenAmount.amount) || 0;
                
                // Determine which token this is
                const isTokenA = mintAddress === tokenAMint;
                const symbol = isTokenA ? poolData.tokenASymbol : poolData.tokenBSymbol;
                
                // Validate that we have the decimals from the blockchain
                if (accountInfo.tokenAmount.decimals === undefined || accountInfo.tokenAmount.decimals === null) {
                    console.error(`❌ Token decimals not found for ${mintAddress}`);
                    showStatus('error', `Cannot determine decimals for token ${symbol}. This is required for safe transactions.`);
                    return;
                }
                
                userTokens.push({
                    mint: mintAddress,
                    symbol: symbol,
                    balance: balance,
                    decimals: accountInfo.tokenAmount.decimals,
                    tokenAccount: tokenAccount.pubkey.toString(),
                    isTokenA: isTokenA
                });
            }
        }
        
        console.log(`✅ Found ${userTokens.length} pool tokens in wallet:`, userTokens);
        
        // Update swap interface with real balances
        updateSwapInterfaceWithRealBalances();
        
        if (userTokens.length === 0) {
            showStatus('info', '📭 You don\'t have any tokens from this pool in your wallet.');
        } else {
            clearStatus();
        }
        
    } catch (error) {
        console.error('❌ Error loading user tokens:', error);
        showStatus('error', 'Failed to load your tokens: ' + error.message);
    }
}

/**
 * Update pool display
 */
function updatePoolDisplay() {
    if (!poolData) return;
    
    const poolLoading = document.getElementById('pool-loading');
    const poolDetails = document.getElementById('pool-details');
    
    // Hide loading, show details
    poolLoading.style.display = 'none';
    poolDetails.style.display = 'grid';
    
    // Show refresh button
    const refreshBtn = document.getElementById('refresh-pool-btn');
    if (refreshBtn) {
        refreshBtn.style.display = 'inline-flex';
    }
    
    // ✅ CENTRALIZED: Use centralized display functions for consistency
    const displayInfo = window.TokenDisplayUtils?.getCentralizedDisplayInfo(poolData);
    
    if (!displayInfo) {
        throw new Error('Failed to get centralized display info');
    }
    
    // Build the full display object 
    const flags = window.TokenDisplayUtils.interpretPoolFlags(poolData);
    
    const display = {
        baseToken: displayInfo.tokenASymbol,
        quoteToken: displayInfo.tokenBSymbol,
        displayPair: displayInfo.pairName,
        rateText: displayInfo.ratioText,
        exchangeRate: displayInfo.exchangeRate,
        baseLiquidity: window.TokenDisplayUtils.getTokenLiquidityFormatted(poolData, 'A'),
        quoteLiquidity: window.TokenDisplayUtils.getTokenLiquidityFormatted(poolData, 'B'),
        isReversed: false, // Always show TokenA/TokenB order
        isOneToManyRatio: flags.oneToManyRatio
    };
    
    console.log('🔧 SWAP CORRECTED:', display);
    

    
    // Add pause warning banner if pool is paused
    let pauseWarningHtml = '';
    if (flags.swapsPaused || flags.liquidityPaused) {
        const pauseType = flags.swapsPaused ? 'Swaps' : 'Liquidity Operations';
        const pauseIcon = flags.swapsPaused ? '🚫' : '⏸️';
        pauseWarningHtml = `
            <div style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: white; padding: 15px; border-radius: 8px; margin-bottom: 20px; text-align: center; border: 2px solid #fca5a5;">
                <div style="font-size: 18px; font-weight: bold; margin-bottom: 5px;">${pauseIcon} Pool ${pauseType} Paused</div>
                <div style="font-size: 14px; opacity: 0.9;">
                    ${flags.swapsPaused ? 'Token swaps are currently disabled by the pool owner.' : 'Pool liquidity operations are paused, which may affect trading.'}
                    <br>Please contact the pool owner or try again later.
                </div>
            </div>
        `;
    }
    
    // Get specific pool flags for display
    const specificFlags = window.TokenDisplayUtils.getSpecificPoolFlags(poolData);
    const flagsHtml = specificFlags.length > 0 
        ? `<div style="margin-top: 8px; font-size: 12px;">${specificFlags.map(flag => 
            `<span style="background: #dc2626; color: white; padding: 2px 6px; border-radius: 4px; margin-right: 4px; font-size: 10px;">${flag.name}</span>`
          ).join('')}</div>`
        : '';

    // 🛡️ SECURITY FIX: Use safe DOM manipulation instead of innerHTML
    poolDetails.innerHTML = ''; // Clear existing content
    
    // Add pause warning if needed
    if (pauseWarningHtml) {
        const warningDiv = document.createElement('div');
        warningDiv.innerHTML = pauseWarningHtml; // This is safe as it's controlled content
        poolDetails.appendChild(warningDiv);
    }
    
    // Pool Status metric
    const statusMetric = document.createElement('div');
    statusMetric.className = 'pool-metric';
    const statusLabel = document.createElement('div');
    statusLabel.className = 'metric-label';
    statusLabel.textContent = 'Pool Status';
    const statusValue = document.createElement('div');
    statusValue.className = 'metric-value';
    statusValue.style.color = flags.liquidityPaused || flags.swapsPaused ? '#dc2626' : '#10b981';
    if (flags.liquidityPaused || flags.swapsPaused) {
        statusValue.style.fontWeight = 'bold';
    }
    statusValue.textContent = flags.liquidityPaused ? '⏸️ Liquidity Paused' : flags.swapsPaused ? '🚫 Swaps Paused' : '✅ Active';
    statusMetric.appendChild(statusLabel);
    statusMetric.appendChild(statusValue);
    poolDetails.appendChild(statusMetric);
    
    // Pool Pair metric
    const pairMetric = document.createElement('div');
    pairMetric.className = 'pool-metric';
    const pairLabel = document.createElement('div');
    pairLabel.className = 'metric-label';
    pairLabel.textContent = 'Pool Pair';
    const pairValue = document.createElement('div');
    pairValue.className = 'metric-value';
    pairValue.textContent = display.displayPair;
    if (flagsHtml) {
        const flagsDiv = document.createElement('div');
        flagsDiv.innerHTML = flagsHtml; // This is safe as it's controlled content
        pairValue.appendChild(flagsDiv);
    }
    pairMetric.appendChild(pairLabel);
    pairMetric.appendChild(pairValue);
    poolDetails.appendChild(pairMetric);
    
    // Exchange Rate metric
    const rateMetric = document.createElement('div');
    rateMetric.className = 'pool-metric';
    const rateLabel = document.createElement('div');
    rateLabel.className = 'metric-label';
    rateLabel.textContent = 'Exchange Rate';
    const rateValue = document.createElement('div');
    rateValue.className = 'metric-value';
    rateValue.textContent = display.rateText.replace(/[\d,]+/g, match => window.TokenDisplayUtils.formatExchangeRateNumber(parseFloat(match.replace(/,/g, ''))));
    rateMetric.appendChild(rateLabel);
    rateMetric.appendChild(rateValue);
    poolDetails.appendChild(rateMetric);
    
    // Base Token Liquidity metric
    const baseMetric = document.createElement('div');
    baseMetric.className = 'pool-metric';
    const baseLabel = document.createElement('div');
    baseLabel.className = 'metric-label';
    baseLabel.textContent = `${display.baseToken} Liquidity`;
    const baseValue = document.createElement('div');
    baseValue.className = 'metric-value';
    baseValue.textContent = window.TokenDisplayUtils.formatLiquidityNumber(display.baseLiquidity);
    baseMetric.appendChild(baseLabel);
    baseMetric.appendChild(baseValue);
    poolDetails.appendChild(baseMetric);
    
    // Quote Token Liquidity metric
    const quoteMetric = document.createElement('div');
    quoteMetric.className = 'pool-metric';
    const quoteLabel = document.createElement('div');
    quoteLabel.className = 'metric-label';
    quoteLabel.textContent = `${display.quoteToken} Liquidity`;
    const quoteValue = document.createElement('div');
    quoteValue.className = 'metric-value';
    quoteValue.textContent = window.TokenDisplayUtils.formatLiquidityNumber(display.quoteLiquidity);
    quoteMetric.appendChild(quoteLabel);
    quoteMetric.appendChild(quoteValue);
    poolDetails.appendChild(quoteMetric);
    
    // Pool Address metric
    const addressMetric = document.createElement('div');
    addressMetric.className = 'pool-metric';
    const addressLabel = document.createElement('div');
    addressLabel.className = 'metric-label';
    addressLabel.textContent = 'Pool Address';
    const addressValue = document.createElement('div');
    addressValue.className = 'metric-value';
    addressValue.style.fontSize = '12px';
    addressValue.style.fontFamily = 'monospace';
    addressValue.style.display = 'flex';
    addressValue.style.alignItems = 'center';
    addressValue.style.gap = '8px';
    addressValue.style.justifyContent = 'center';
    
    const addressSpan = document.createElement('span');
    addressSpan.textContent = `${poolAddress.slice(0, 8)}...${poolAddress.slice(-8)}`;
    addressValue.appendChild(addressSpan);
    
    const copyBtn = document.createElement('button');
    copyBtn.id = 'copy-pool-address';
    copyBtn.textContent = '📋 Copy';
    copyBtn.style.background = '#3b82f6';
    copyBtn.style.color = 'white';
    copyBtn.style.border = 'none';
    copyBtn.style.padding = '4px 8px';
    copyBtn.style.borderRadius = '4px';
    copyBtn.style.fontSize = '10px';
    copyBtn.style.cursor = 'pointer';
    copyBtn.onclick = () => window.TokenDisplayUtils.copyToClipboard(poolAddress, 'copy-pool-address');
    addressValue.appendChild(copyBtn);
    
    addressMetric.appendChild(addressLabel);
    addressMetric.appendChild(addressValue);
    poolDetails.appendChild(addressMetric);
    
    // Debug section removed as requested
}

/**
 * Initialize swap interface
 */
function initializeSwapInterface() {
    if (!poolData) return;
    
    const swapLoading = document.getElementById('swap-loading');
    const swapForm = document.getElementById('swap-form');
    
    // Hide loading, show form regardless of wallet connection
    swapLoading.style.display = 'none';
    swapForm.style.display = 'grid';
    
    if (!isConnected) {
        // Show interface without wallet - users can see tokens and calculate swaps
        initializeSwapInterfaceWithoutWallet();
    } else {
        // Show interface with real wallet balances
        updateSwapInterfaceWithRealBalances();
    }
    
    updateExchangeRate();
}

/**
 * Initialize swap interface without wallet connection
 * Shows pool tokens, allows calculations, but requires wallet for execution
 */
function initializeSwapInterfaceWithoutWallet() {
    if (!poolData) return;
    
    console.log('🔄 Initializing swap interface without wallet connection');
    
    // Update token symbols and icons
    updateTokenDisplayWithoutWallet();
    
    // Reset amounts
    document.getElementById('from-amount').value = '';
    document.getElementById('to-amount').value = '';
    
    // Hide preview initially
    document.getElementById('transaction-preview').style.display = 'none';
    
    // Set up swap button for wallet connection requirement
    const swapBtn = document.getElementById('swap-btn');
    swapBtn.disabled = true;
    swapBtn.textContent = '🔗 Connect Wallet to Swap';
    swapBtn.style.background = '#3b82f6'; // Blue color to indicate action needed
    
    // Add click handler to connect wallet when button is clicked
    swapBtn.onclick = () => {
        if (!isConnected) {
            connectWallet();
        } else {
            executeSwap();
        }
    };
    
    console.log('✅ Swap interface ready without wallet - users can calculate swaps');
}

/**
 * Update token display without wallet connection
 */
function updateTokenDisplayWithoutWallet() {
    if (!poolData) return;
    
    // Update token symbols and icons based on current swap direction
    if (swapDirection === 'AtoB') {
        document.getElementById('from-token-symbol').textContent = poolData.tokenASymbol;
        document.getElementById('to-token-symbol').textContent = poolData.tokenBSymbol;
        
        // Update token icons with images
        const tokenAMint = poolData.tokenAMint || poolData.token_a_mint;
        const tokenBMint = poolData.tokenBMint || poolData.token_b_mint;
        document.getElementById('from-token-icon').innerHTML = createTokenImageHTML(tokenAMint, poolData.tokenASymbol);
        document.getElementById('to-token-icon').innerHTML = createTokenImageHTML(tokenBMint, poolData.tokenBSymbol);
        
        // Show "Connect wallet to see balance" message
        document.getElementById('from-token-balance').textContent = 'Connect wallet to see balance';
        document.getElementById('to-token-balance').textContent = 'Connect wallet to see balance';
    } else {
        document.getElementById('from-token-symbol').textContent = poolData.tokenBSymbol;
        document.getElementById('to-token-symbol').textContent = poolData.tokenASymbol;
        
        // Update token icons with images
        const tokenAMint = poolData.tokenAMint || poolData.token_a_mint;
        const tokenBMint = poolData.tokenBMint || poolData.token_b_mint;
        document.getElementById('from-token-icon').innerHTML = createTokenImageHTML(tokenBMint, poolData.tokenBSymbol);
        document.getElementById('to-token-icon').innerHTML = createTokenImageHTML(tokenAMint, poolData.tokenASymbol);
        
        // Show "Connect wallet to see balance" message
        document.getElementById('from-token-balance').textContent = 'Connect wallet to see balance';
        document.getElementById('to-token-balance').textContent = 'Connect wallet to see balance';
    }
}

/**
 * Update swap interface with real user balances
 */
function updateSwapInterfaceWithRealBalances() {
    if (!poolData || !isConnected) return;
    
    // Update token symbols and icons
    if (swapDirection === 'AtoB') {
        document.getElementById('from-token-symbol').textContent = poolData.tokenASymbol;
        document.getElementById('to-token-symbol').textContent = poolData.tokenBSymbol;
        
        // Update token icons with images
        const tokenAMint = poolData.tokenAMint || poolData.token_a_mint;
        const tokenBMint = poolData.tokenBMint || poolData.token_b_mint;
        document.getElementById('from-token-icon').innerHTML = createTokenImageHTML(tokenAMint, poolData.tokenASymbol);
        document.getElementById('to-token-icon').innerHTML = createTokenImageHTML(tokenBMint, poolData.tokenBSymbol);
        
        // Set real balances - convert from basis points to display units
        const tokenA = userTokens.find(t => t.isTokenA);
        const tokenB = userTokens.find(t => !t.isTokenA);
        
        const tokenADisplayBalance = tokenA ? window.TokenDisplayUtils.basisPointsToDisplay(tokenA.balance, tokenA.decimals) : 0;
        const tokenBDisplayBalance = tokenB ? window.TokenDisplayUtils.basisPointsToDisplay(tokenB.balance, tokenB.decimals) : 0;
        
        document.getElementById('from-token-balance').textContent = formatTokenAmount(tokenADisplayBalance, tokenA?.decimals || 6);
        document.getElementById('to-token-balance').textContent = formatTokenAmount(tokenBDisplayBalance, tokenB?.decimals || 6);
    } else {
        document.getElementById('from-token-symbol').textContent = poolData.tokenBSymbol;
        document.getElementById('to-token-symbol').textContent = poolData.tokenASymbol;
        
        // Update token icons with images
        const tokenAMint = poolData.tokenAMint || poolData.token_a_mint;
        const tokenBMint = poolData.tokenBMint || poolData.token_b_mint;
        document.getElementById('from-token-icon').innerHTML = createTokenImageHTML(tokenBMint, poolData.tokenBSymbol);
        document.getElementById('to-token-icon').innerHTML = createTokenImageHTML(tokenAMint, poolData.tokenASymbol);
        
        // Set real balances - convert from basis points to display units
        const tokenA = userTokens.find(t => t.isTokenA);
        const tokenB = userTokens.find(t => !t.isTokenA);
        
        const tokenADisplayBalance = tokenA ? window.TokenDisplayUtils.basisPointsToDisplay(tokenA.balance, tokenA.decimals) : 0;
        const tokenBDisplayBalance = tokenB ? window.TokenDisplayUtils.basisPointsToDisplay(tokenB.balance, tokenB.decimals) : 0;
        
        document.getElementById('from-token-balance').textContent = formatTokenAmount(tokenBDisplayBalance, tokenB?.decimals || 6);
        document.getElementById('to-token-balance').textContent = formatTokenAmount(tokenADisplayBalance, tokenA?.decimals || 6);
    }
    
    // Reset amounts
    document.getElementById('from-amount').value = '';
    document.getElementById('to-amount').value = '';
    
    // Hide preview and disable button
    document.getElementById('transaction-preview').style.display = 'none';
    
    // Check if pool is paused and disable swap button accordingly
    const flags = window.TokenDisplayUtils.interpretPoolFlags(poolData);
    const swapBtn = document.getElementById('swap-btn');
    
    if (flags.swapsPaused) {
        swapBtn.disabled = true;
        swapBtn.textContent = '🚫 Swaps Paused by Pool Owner';
        swapBtn.style.background = '#6b7280'; // Gray background for disabled state
        showStatus('error', '🚫 Pool swaps are currently paused by the pool owner. Please contact the pool owner or try again later.');
    } else if (flags.liquidityPaused) {
        swapBtn.disabled = true;
        swapBtn.textContent = '⏸️ Pool Operations Paused';
        swapBtn.style.background = '#6b7280';
        showStatus('error', '⏸️ Pool liquidity operations are paused, which may affect swaps. Please contact the pool owner or try again later.');
    } else {
        swapBtn.disabled = true;
        swapBtn.textContent = '🔄 Enter Amount to Swap';
        swapBtn.style.background = ''; // Reset to default
    }
}

/**
 * Toggle swap direction
 */
function toggleSwapDirection() {
    swapDirection = swapDirection === 'AtoB' ? 'BtoA' : 'AtoB';
    
    // Update interface based on wallet connection status
    if (isConnected) {
        updateSwapInterfaceWithRealBalances();
    } else {
        updateTokenDisplayWithoutWallet();
    }
    
    updateExchangeRate();
    calculateSwapOutputEnhanced();
}

/**
 * Update exchange rate display (removed from UI)
 */
function updateExchangeRate() {
    // Exchange rate display removed from UI - function kept for compatibility
    if (!poolData) return;
    
    // Use actual display values, not raw basis points
    const ratioAActual = poolData.ratioAActual || poolData.ratio_a_actual || 1;
    const ratioBActual = poolData.ratioBActual || poolData.ratio_b_actual || 1;
    
    if (swapDirection === 'AtoB') {
        // A→B: How many B tokens for 1 A token
        const rate = ratioBActual / ratioAActual;
        console.log(`Exchange rate: 1 ${poolData.tokenASymbol} = ${window.TokenDisplayUtils.formatExchangeRateStandard(rate)} ${poolData.tokenBSymbol}`);
    } else {
        // B→A: How many A tokens for 1 B token  
        const rate = ratioAActual / ratioBActual;
        console.log(`Exchange rate: 1 ${poolData.tokenBSymbol} = ${window.TokenDisplayUtils.formatExchangeRateStandard(rate)} ${poolData.tokenASymbol}`);
    }
}

/**
 * Set maximum amount from wallet balance
 */
function setMaxAmount() {
    if (!poolData || !isConnected) {
        // Show message to connect wallet if not connected
        if (!isConnected) {
            showStatus('info', '🔗 Please connect your wallet to use the MAX button');
        }
        return;
    }
    
    const fromToken = swapDirection === 'AtoB' 
        ? userTokens.find(t => t.isTokenA)
        : userTokens.find(t => !t.isTokenA);
    
    if (fromToken && fromToken.balance > 0) {
        // ✅ INTEGER MATH: Use basis points for precise calculation, then convert to display
        const balanceBasisPoints = fromToken.balance;
        
        // ✅ SMART BUFFER: Only subtract buffer if it would result in a cleaner display
        // For example: 1000000000 basis points (1.0) should stay 1.0, not become 0.999999999
        let maxBasisPoints = balanceBasisPoints;
        
        if (fromToken.decimals > 0) {
            // Check if subtracting 1 basis point would result in a "messy" display
            const displayWithBuffer = window.TokenDisplayUtils.basisPointsToDisplay(balanceBasisPoints - 1, fromToken.decimals);
            const displayWithoutBuffer = window.TokenDisplayUtils.basisPointsToDisplay(balanceBasisPoints, fromToken.decimals);
            
            // If the difference is significant (more than 0.1%), use the buffer
            // If it's a clean number like 1.0, keep it as is
            const difference = Math.abs(displayWithoutBuffer - displayWithBuffer);
            const threshold = displayWithoutBuffer * 0.001; // 0.1% threshold
            
            if (difference > threshold) {
                maxBasisPoints = balanceBasisPoints - 1;
                console.log(`🔧 MAX AMOUNT: Applied buffer (${difference.toFixed(9)} > ${threshold.toFixed(9)})`);
            } else {
                console.log(`🔧 MAX AMOUNT: Kept exact amount (${difference.toFixed(9)} <= ${threshold.toFixed(9)})`);
            }
        }
        
        // Convert back to display units using integer math
        const maxAmount = window.TokenDisplayUtils.basisPointsToDisplay(maxBasisPoints, fromToken.decimals);
        
        console.log(`🔧 MAX AMOUNT CALCULATION:`);
        console.log(`  Original balance: ${balanceBasisPoints} basis points`);
        console.log(`  Final amount: ${maxBasisPoints} basis points`);
        console.log(`  Display amount: ${maxAmount}`);
        console.log(`  Fixed display: ${maxAmount.toFixed(fromToken.decimals)}`);
        
        document.getElementById('from-amount').value = formatTokenAmount(maxAmount, fromToken.decimals);
        calculateSwapOutputEnhanced();
    }
}

/**
 * ✅ BASIS POINTS REFACTOR: Calculate swap output with proper basis points arithmetic
 * 
 * This function now correctly handles the conversion between display units and basis points,
 * ensuring mathematical accuracy and matching the smart contract's calculation logic.
 */
function calculateSwapOutputEnhanced() {
    if (!poolData || !tokenPairRatio) {
        console.warn('⚠️ Missing pool data or TokenPairRatio instance');
        return;
    }
    
    // Check if pool is paused before doing any calculations
    const flags = window.TokenDisplayUtils.interpretPoolFlags(poolData);
    const swapBtn = document.getElementById('swap-btn');
    
    if (flags.swapsPaused) {
        const toAmountInput = document.getElementById('to-amount');
        const preview = document.getElementById('transaction-preview');
        toAmountInput.value = '';
        preview.style.display = 'none';
        swapBtn.disabled = true;
        swapBtn.textContent = '🚫 Swaps Paused by Pool Owner';
        swapBtn.style.background = '#6b7280';
        return;
    }
    
    if (flags.liquidityPaused) {
        const toAmountInput = document.getElementById('to-amount');
        const preview = document.getElementById('transaction-preview');
        toAmountInput.value = '';
        preview.style.display = 'none';
        swapBtn.disabled = true;
        swapBtn.textContent = '⏸️ Pool Operations Paused';
        swapBtn.style.background = '#6b7280';
        return;
    }
    
    const fromAmount = parseFloat(document.getElementById('from-amount').value) || 0;
    const toAmountInput = document.getElementById('to-amount');
    const preview = document.getElementById('transaction-preview');
    
    if (fromAmount <= 0) {
        toAmountInput.value = '';
        preview.style.display = 'none';
        swapBtn.disabled = true;
        swapBtn.textContent = '🔄 Enter Amount to Swap';
        swapBtn.style.background = ''; // Reset to default
        return;
    }
    
    // Check if user has sufficient balance (only when wallet is connected)
    if (isConnected) {
        const fromToken = swapDirection === 'AtoB' 
            ? userTokens.find(t => t.isTokenA)
            : userTokens.find(t => !t.isTokenA);
        
        if (!fromToken) {
            swapBtn.disabled = true;
            swapBtn.textContent = '❌ Token Not Found';
            preview.style.display = 'none';
            return;
        }
        
        // Convert user input to basis points for comparison with stored balance
        const fromAmountBasisPoints = swapDirection === 'AtoB' 
            ? tokenPairRatio.ADisplayToBasisPoints(fromAmount)
            : tokenPairRatio.BDisplayToBasisPoints(fromAmount);
        
        if (fromAmountBasisPoints > fromToken.balance) {
            swapBtn.disabled = true;
            swapBtn.textContent = '❌ Insufficient Balance';
            preview.style.display = 'none';
            return;
        }
    }
    
    try {
        // 🎯 CENTRALIZED: Use TokenPairRatio class for all calculations
        console.log('🔄 SWAP CALCULATION (TokenPairRatio):');
        console.log(`  Exchange rate: ${tokenPairRatio.ExchangeDisplay()}`);
        console.log(`  Input: ${fromAmount} (display units)`);
        console.log(`  Direction: ${swapDirection}`);
        
        // Calculate output using centralized TokenPairRatio class
        const outputAmount = swapDirection === 'AtoB' 
            ? tokenPairRatio.SwapAToB(fromAmount)
            : tokenPairRatio.SwapBToA(fromAmount);
        
        console.log(`  Output: ${outputAmount} (display units)`);
        console.log(`🔍 TokenPairRatio debug:`, tokenPairRatio.getDebugInfo());
        
        // Get the output token decimals (use pool data if wallet not connected)
        let outputDecimals = 6; // Default fallback
        
        if (isConnected) {
            const toToken = swapDirection === 'AtoB' 
                ? userTokens.find(t => !t.isTokenA)
                : userTokens.find(t => t.isTokenA);
            outputDecimals = toToken?.decimals || 6;
        } else {
            // Use pool token decimals when wallet not connected
            if (swapDirection === 'AtoB') {
                outputDecimals = poolData.ratioBDecimal || 6;
            } else {
                outputDecimals = poolData.ratioADecimal || 6;
            }
        }
        
        toAmountInput.value = formatTokenAmount(outputAmount, outputDecimals);
        
        // Update transaction preview
        updateTransactionPreview(fromAmount, outputAmount);
        
        // Show preview
        preview.style.display = 'block';
        
        // Set button state based on wallet connection
        if (!isConnected) {
            swapBtn.disabled = true;
            swapBtn.textContent = '🔗 Connect Wallet to Swap';
            swapBtn.style.background = '#3b82f6'; // Blue color to indicate action needed
            swapBtn.onclick = () => connectWallet();
        } else {
            swapBtn.disabled = false;
            swapBtn.textContent = '🔄 Execute Swap';
            swapBtn.style.background = ''; // Reset to default
            swapBtn.onclick = () => executeSwap();
        }
        
    } catch (error) {
        console.error('❌ Error calculating swap output:', error);
        swapBtn.disabled = true;
        swapBtn.textContent = '❌ Calculation Error';
        preview.style.display = 'none';
        showStatus('error', 'Error calculating swap: ' + error.message);
    }
}

/**
 * Update transaction preview
 */
function updateTransactionPreview(fromAmount, toAmount) {
    if (!poolData) return;
    
    const fromSymbol = swapDirection === 'AtoB' ? poolData.tokenASymbol : poolData.tokenBSymbol;
    const toSymbol = swapDirection === 'AtoB' ? poolData.tokenBSymbol : poolData.tokenASymbol;
    
    // Get token decimals for proper formatting (use pool data if wallet not connected)
    let fromDecimals = 6;
    let toDecimals = 6;
    
    if (isConnected) {
        const fromToken = swapDirection === 'AtoB' 
            ? userTokens.find(t => t.isTokenA)
            : userTokens.find(t => !t.isTokenA);
        const toToken = swapDirection === 'AtoB' 
            ? userTokens.find(t => !t.isTokenA)
            : userTokens.find(t => t.isTokenA);
        
        fromDecimals = fromToken?.decimals || 6;
        toDecimals = toToken?.decimals || 6;
    } else {
        // Use pool token decimals when wallet not connected
        if (swapDirection === 'AtoB') {
            fromDecimals = poolData.ratioADecimal || 6;
            toDecimals = poolData.ratioBDecimal || 6;
        } else {
            fromDecimals = poolData.ratioBDecimal || 6;
            toDecimals = poolData.ratioADecimal || 6;
        }
    }
    
    document.getElementById('preview-from-amount').textContent = `${formatTokenAmount(fromAmount, fromDecimals)} ${fromSymbol}`;
    document.getElementById('preview-to-amount').textContent = `${formatTokenAmount(toAmount, toDecimals)} ${toSymbol}`;
            // No minimum received needed - fixed ratio guarantees exact amount
    
    // Exchange rate
    const rate = toAmount / fromAmount;
    document.getElementById('preview-rate').textContent = `1 ${fromSymbol} = ${formatTokenAmount(rate, toDecimals)} ${toSymbol}`;
    
    // Calculate total estimated fee (network + contract)
    const networkFee = 0.000005; // Base network fee estimate
    const maxCU = 200000; // Estimated max compute units for swap
    const cuPriceLamports = 1; // Estimated compute unit price in lamports
    const priorityFee = (maxCU * cuPriceLamports) / 1000000000; // Convert to SOL
    
    // Get contract fee from pool data (in lamports)
    const contractFeeLamports = poolData.swap_contract_fee || poolData.swapContractFee || 0;
    const contractFee = contractFeeLamports / 1000000000; // Convert lamports to SOL
    
    const totalFee = networkFee + priorityFee + contractFee;
    
    document.getElementById('preview-fee').textContent = `~${formatTokenAmount(totalFee, 9)} SOL`;
}

/**
 * Simulate swap transaction to catch pool pause errors before execution
 */
async function simulateSwapTransaction(fromAmount) {
    console.log('🔍 Starting transaction simulation...');
    
    try {
        // Get user token accounts
        const fromToken = swapDirection === 'AtoB' 
            ? userTokens.find(t => t.isTokenA)
            : userTokens.find(t => !t.isTokenA);
        
        const toToken = swapDirection === 'AtoB' 
            ? userTokens.find(t => !t.isTokenA)
            : userTokens.find(t => t.isTokenA);
        
        if (!fromToken) {
            throw new Error('Source token account not found');
        }
        
        // Check if user has destination token account, or create ATA address
        let toTokenAccountPubkey;
        if (toToken) {
            toTokenAccountPubkey = new solanaWeb3.PublicKey(toToken.tokenAccount);
        } else {
            // Create associated token account address for destination token
            const toTokenMint = swapDirection === 'AtoB' 
                ? new solanaWeb3.PublicKey(poolData.tokenBMint || poolData.token_b_mint)
                : new solanaWeb3.PublicKey(poolData.tokenAMint || poolData.token_a_mint);
            
            toTokenAccountPubkey = await window.splToken.Token.getAssociatedTokenAddress(
                window.splToken.ASSOCIATED_TOKEN_PROGRAM_ID,
                window.splToken.TOKEN_PROGRAM_ID,
                toTokenMint,
                wallet.publicKey
            );
        }
        
        // Build the same transaction we would send
        const simulationTransaction = await buildSwapTransaction(
            fromAmount,
            fromToken,
            toTokenAccountPubkey
        );
        
        // For simulation, we need to set the recent blockhash but don't need to sign
        const { blockhash } = await connection.getLatestBlockhash('finalized');
        simulationTransaction.recentBlockhash = blockhash;
        simulationTransaction.feePayer = wallet.publicKey;
        
        console.log('🔍 Simulating transaction with recent blockhash...');
        console.log('🔍 Transaction details:', {
            instructionCount: simulationTransaction.instructions.length,
            feePayer: simulationTransaction.feePayer.toString(),
            recentBlockhash: simulationTransaction.recentBlockhash
        });
        
        // Try different simulation approaches for compatibility
        let simulationResult;
        try {
            // First try with modern options
            simulationResult = await connection.simulateTransaction(simulationTransaction, {
                commitment: 'confirmed',
                sigVerify: false,
                replaceRecentBlockhash: false
            });
        } catch (modernError) {
            console.log('🔄 Modern simulation failed, trying legacy approach:', modernError.message);
            
            try {
                // Fallback to basic simulation
                simulationResult = await connection.simulateTransaction(simulationTransaction);
            } catch (legacyError) {
                console.log('🔄 Legacy simulation failed, trying with commitment only:', legacyError.message);
                
                // Last fallback with just commitment
                simulationResult = await connection.simulateTransaction(simulationTransaction, 'confirmed');
            }
        }
        
        console.log('🔍 Simulation result:', simulationResult);
        
        // Check for errors in simulation
        if (simulationResult.value.err) {
            console.error('🚨 Transaction simulation failed:', simulationResult.value.err);
            console.error('🚨 Simulation logs:', simulationResult.value.logs);
            
            // Parse the error and logs to provide user-friendly messages
            const errorMessage = parseSimulationError(simulationResult.value.err, simulationResult.value.logs);
            throw new Error(errorMessage);
        }
        
        console.log('✅ Transaction simulation succeeded - proceeding with actual transaction');
        
    } catch (error) {
        console.error('❌ Transaction simulation failed:', error);
        throw error; // Re-throw to be handled by executeSwap
    }
}

/**
 * Parse simulation error to provide user-friendly messages using centralized error mapping
 */
function parseSimulationError(error, logs) {
    console.log('🔍 Parsing simulation error:', error);
    console.log('🔍 Available logs:', logs);
    
    // Check for pool pause errors in logs first (these are specific log messages)
    if (logs) {
        for (const log of logs) {
            if (log.includes('SWAP BLOCKED: Pool swaps are currently paused')) {
                return '🚫 Pool swaps are currently paused by the pool owner. Please contact the pool owner to resume trading or try again later.';
            }
            if (log.includes('LIQUIDITY BLOCKED: Pool liquidity operations are currently paused')) {
                return '🚫 Pool liquidity operations are currently paused. Swaps may be affected.';
            }
            if (log.includes('Pool owner has paused trading')) {
                return '⏸️ Trading has been paused by the pool owner. Please try again later or contact the pool owner.';
            }
            if (log.includes('Contact pool owner to resume trading')) {
                return '📞 Pool trading is paused. Please contact the pool owner to resume operations.';
            }
        }
    }
    
    // Use centralized error parsing for all error types
    const errorInfo = parseTransactionError(error);
    
    // Add swap-specific context to certain errors
    if (errorInfo.code) {
        // Add suggestions for swap-specific errors
        if (isPauseError(errorInfo.code)) {
            const suggestions = getErrorSuggestions(errorInfo.code);
            return `${formatErrorForUser(errorInfo)} Suggestions: ${suggestions.join(', ')}.`;
        }
        
        if (isBalanceError(errorInfo.code)) {
            return `${formatErrorForUser(errorInfo)} Please check your token balances and ensure you have enough tokens for the swap.`;
        }
        
        // For amount mismatch errors, provide specific swap guidance
        if (errorInfo.code === 1047) {
            return `${formatErrorForUser(errorInfo)} This often happens when there's a small precision difference. Try using the exact output amount displayed in the UI.`;
        }
    }
    
    // Check for insufficient funds in logs (fallback for non-coded errors)
    if (logs && logs.some(log => log.includes('insufficient funds') || log.includes('Insufficient funds'))) {
        return '💰 Insufficient funds in your wallet. Please check your token balance and try again.';
    }
    
    // Check for account creation issues (fallback for non-coded errors)
    if (logs && logs.some(log => log.includes('account not found') || log.includes('Account not found'))) {
        return '🔍 Required account not found. This may be due to a missing token account or pool configuration issue.';
    }
    
    // Return formatted error using centralized system
    return formatErrorForUser(errorInfo) || `❌ Transaction simulation failed: ${error && error.toString ? error.toString() : 'Unknown error'}. Please check the pool status and try again.`;
}

/**
 * Execute swap transaction
 */
async function executeSwap() {
    if (!poolData || !isConnected) return;
    
    try {
    const fromAmount = parseFloat(document.getElementById('from-amount').value);
    const toAmount = parseFloat(document.getElementById('to-amount').value);
    
    if (!fromAmount || !toAmount) {
        showStatus('error', 'Please enter valid amounts');
        return;
    }
    
        // Disable swap button during transaction
        const swapBtn = document.getElementById('swap-btn');
        swapBtn.disabled = true;
        swapBtn.textContent = '⏳ Processing Swap...';
        
        console.log('🔄 Starting swap transaction...');
        console.log(`📊 Swapping ${fromAmount} ${swapDirection === 'AtoB' ? poolData.tokenASymbol : poolData.tokenBSymbol} for ${toAmount} ${swapDirection === 'AtoB' ? poolData.tokenBSymbol : poolData.tokenASymbol}`);
        
        showStatus('info', '🔍 Simulating transaction...');
        
        // 🚨 NEW: Simulate transaction first to catch pool pause errors
        await simulateSwapTransaction(fromAmount);
        
        showStatus('info', '🔄 Building swap transaction...');
        
        // Get user token accounts
        const fromToken = swapDirection === 'AtoB' 
            ? userTokens.find(t => t.isTokenA)
            : userTokens.find(t => !t.isTokenA);
        
        const toToken = swapDirection === 'AtoB' 
            ? userTokens.find(t => !t.isTokenA)
            : userTokens.find(t => t.isTokenA);
        
        if (!fromToken) {
            throw new Error('Source token account not found');
        }
        
        // Check if user has destination token account
        let toTokenAccountPubkey;
        if (toToken) {
            toTokenAccountPubkey = new solanaWeb3.PublicKey(toToken.tokenAccount);
        } else {
            // Create associated token account for destination token
            const toTokenMint = swapDirection === 'AtoB' 
                ? new solanaWeb3.PublicKey(poolData.tokenBMint || poolData.token_b_mint)
                : new solanaWeb3.PublicKey(poolData.tokenAMint || poolData.token_a_mint);
            
            toTokenAccountPubkey = await window.splToken.Token.getAssociatedTokenAddress(
                window.splToken.ASSOCIATED_TOKEN_PROGRAM_ID,
                window.splToken.TOKEN_PROGRAM_ID,
                toTokenMint,
                wallet.publicKey
            );
            
            console.log('📍 Creating associated token account for destination:', toTokenAccountPubkey.toString());
        }
        
        // Build swap transaction
        const transaction = await buildSwapTransaction(
            fromAmount,
            fromToken,
            toTokenAccountPubkey
        );
        
        showStatus('info', '📝 Requesting wallet signature...');
        
        // Ensure the wallet fills a fresh recent blockhash to avoid mismatches
        try { delete transaction.recentBlockhash; } catch (_) {}
        try { delete transaction.lastValidBlockHeight; } catch (_) {}
        try { transaction.feePayer = wallet.publicKey; } catch (_) {}
        console.log('🧼 Preparing transaction for wallet: cleared recentBlockhash so wallet fetches a fresh one');

        // Sign and send transaction (wallet will simulate with its own fresh blockhash)
        const signatureResult = await wallet.signAndSendTransaction(transaction);
        console.log('✅ Swap transaction sent:', signatureResult);
        
        // Extract signature string from result
        const signature = signatureResult.signature || signatureResult;
        
        showStatus('info', '⏳ Confirming transaction...');
        
        // Wait for confirmation
        const confirmation = await connection.confirmTransaction(signature, 'confirmed');
        
        if (confirmation.value.err) {
            throw new Error(`Swap failed: ${JSON.stringify(confirmation.value.err)}`);
        }
        
        console.log('✅ Swap completed successfully!');
        showStatus('success', `🎉 Swap completed! Transaction: ${signature.slice(0, 8)}...`);
        
        // Refresh user tokens after successful swap
        await loadUserTokensForPool();
        
        // Reset form
        document.getElementById('from-amount').value = '';
        document.getElementById('to-amount').value = '';
        document.getElementById('transaction-preview').style.display = 'none';
        
    } catch (error) {
        console.error('❌ Swap failed:', error);
        // Surface wallet/cluster logs if available
        try {
            if (typeof error.getLogs === 'function') {
                const logs = await error.getLogs();
                console.error('🧾 Transaction logs from wallet error:', logs);
            } else if (error.logs) {
                console.error('🧾 Transaction logs:', error.logs);
            }
        } catch (logErr) {
            console.warn('⚠️ Failed to retrieve logs from error:', logErr?.message);
        }
        const msg = error?.message || 'Unknown error';
        showStatus('error', `Swap failed: ${msg}. Check console for logs.`);
    } finally {
        // Re-enable swap button
        const swapBtn = document.getElementById('swap-btn');
        swapBtn.disabled = false;
        swapBtn.textContent = '🔄 Execute Swap';
    }
}

/**
 * Build swap transaction
 */
async function buildSwapTransaction(fromAmount, fromToken, toTokenAccountPubkey) {
    console.log('🔧 Building swap transaction...');
    
    // Convert amount to basis points (using TokenDisplayUtils for consistency)
    const amountInBaseUnits = window.TokenDisplayUtils.displayToBasisPoints(fromAmount, fromToken.decimals);
    console.log(`💰 Amount in basis points: ${amountInBaseUnits} (${fromAmount} display units with ${fromToken.decimals} decimals)`);
    
    // Get program ID
    const programId = new solanaWeb3.PublicKey(CONFIG.programId);
    
    // Get system state PDA
    const systemStatePDA = await solanaWeb3.PublicKey.findProgramAddress(
        [new TextEncoder().encode('system_state')],
        programId
    );
    
    // Get pool state PDA (which is our poolAddress)
    const poolStatePDA = new solanaWeb3.PublicKey(poolAddress);
    
    // Get token vault PDAs
    const tokenAVaultPDA = await solanaWeb3.PublicKey.findProgramAddress(
        [new TextEncoder().encode('token_a_vault'), poolStatePDA.toBuffer()],
        programId
    );
    
    const tokenBVaultPDA = await solanaWeb3.PublicKey.findProgramAddress(
        [new TextEncoder().encode('token_b_vault'), poolStatePDA.toBuffer()],
        programId
    );
    
    console.log('🔍 Transaction accounts:');
    console.log('  System State PDA:', systemStatePDA[0].toString());
    console.log('  Pool State PDA:', poolStatePDA.toString());
    console.log('  Token A Vault PDA:', tokenAVaultPDA[0].toString());
    console.log('  Token B Vault PDA:', tokenBVaultPDA[0].toString());
    console.log('  User Input Token Account:', fromToken.tokenAccount);
    console.log('  User Output Token Account:', toTokenAccountPubkey.toString());
    
    // Create instruction data for Swap with pool_id: { input_token_mint, amount_in, expected_amount_out, pool_id }
    const inputTokenMint = new solanaWeb3.PublicKey(fromToken.mint);
    
    
    // Calculate expected output amount for the new contract requirement
    let expectedOutputAmount;
    try {
        // Get pool ratios in basis points
        const ratioABasisPoints = poolData.ratioANumerator || poolData.ratio_a_numerator;
        const ratioBBasisPoints = poolData.ratioBDenominator || poolData.ratio_b_denominator;
        
        // Get token decimals
        let inputDecimals, outputDecimals, numerator, denominator;
        let tokenADecimals, tokenBDecimals;
        
        if (poolData.ratioADecimal !== undefined && poolData.ratioBDecimal !== undefined) {
            tokenADecimals = poolData.ratioADecimal;
            tokenBDecimals = poolData.ratioBDecimal;
        } else if (poolData.tokenDecimals && 
                   poolData.tokenDecimals.tokenADecimals !== undefined && 
                   poolData.tokenDecimals.tokenBDecimals !== undefined) {
            tokenADecimals = poolData.tokenDecimals.tokenADecimals;
            tokenBDecimals = poolData.tokenDecimals.tokenBDecimals;
        } else {
            throw new Error('Token decimal information missing');
        }
        
        if (swapDirection === 'AtoB') {
            // Swapping from Token A to Token B
            inputDecimals = tokenADecimals;
            outputDecimals = tokenBDecimals;
            numerator = ratioBBasisPoints;
            denominator = ratioABasisPoints;
        } else {
            // Swapping from Token B to Token A
            inputDecimals = tokenBDecimals;
            outputDecimals = tokenADecimals;
            numerator = ratioABasisPoints;
            denominator = ratioBBasisPoints;
        }
        
        console.log('🔍 RATIO ASSIGNMENT DEBUG:');
        console.log(`  Swap direction: ${swapDirection}`);
        console.log(`  Token A decimals: ${tokenADecimals}, Token B decimals: ${tokenBDecimals}`);
        console.log(`  Ratio A (basis points): ${ratioABasisPoints}`);
        console.log(`  Ratio B (basis points): ${ratioBBasisPoints}`);
        console.log(`  Numerator: ${numerator}, Denominator: ${denominator}`);
        
        // Calculate expected output using the centralized TokenPairRatio class
        const fromAmountDisplay = window.TokenDisplayUtils.basisPointsToDisplay(amountInBaseUnits, inputDecimals);
        const expectedOutputDisplay = swapDirection === 'AtoB' 
            ? tokenPairRatio.SwapAToB(fromAmountDisplay)
            : tokenPairRatio.SwapBToA(fromAmountDisplay);
        
        // Convert expected output to basis points
        expectedOutputAmount = swapDirection === 'AtoB'
            ? tokenPairRatio.BDisplayToBasisPoints(expectedOutputDisplay)
            : tokenPairRatio.ADisplayToBasisPoints(expectedOutputDisplay);
        
        console.log('🔍 Expected output calculation:');
        console.log(`  Input: ${fromAmountDisplay} (${amountInBaseUnits} basis points)`);
        console.log(`  Expected output: ${expectedOutputDisplay} (${expectedOutputAmount} basis points)`);
        console.log(`  Ratio: ${numerator} : ${denominator}`);
        console.log(`  🚨 DEBUG: Expected output in display units: ${expectedOutputDisplay}`);
        console.log(`  🚨 DEBUG: Expected output in basis points: ${expectedOutputAmount}`);
        console.log(`  🚨 DEBUG: If this is wrong, you'll get the wrong amount!`);
        console.log(`  🚨 DEBUG: Pool ratio interpretation: ${ratioABasisPoints} : ${ratioBBasisPoints}`);
        console.log(`  🚨 DEBUG: This means ${ratioABasisPoints/1000} Token A = ${ratioBBasisPoints/1000} Token B`);
        
    } catch (error) {
        console.error('❌ Error calculating expected output:', error);
        throw new Error(`Failed to calculate expected output: ${error.message}`);
    }
    
    // 🚨 CRITICAL DEBUG: Log the exact value being sent to contract
    console.log('🚨🚨🚨 CRITICAL DEBUG: FINAL EXPECTED OUTPUT VALUE BEING SENT TO CONTRACT 🚨🚨🚨');
    console.log('  📊 expectedOutputAmount variable:', expectedOutputAmount);
    console.log('  📊 Type:', typeof expectedOutputAmount);
    console.log('  📊 As BigInt:', BigInt(expectedOutputAmount));
    console.log('  📊 As Uint8Array:', new Uint8Array(new BigUint64Array([BigInt(expectedOutputAmount)]).buffer));
    console.log('  📊 Buffer bytes:', Array.from(new Uint8Array(new BigUint64Array([BigInt(expectedOutputAmount)]).buffer)));
    console.log('  🚨 This is the EXACT value the contract will receive as expected_amount_out!');
    console.log('  🚨 If this shows 100000000 instead of 10000, we found the bug location!');
    
    // Create instruction data for Swap with pool_id: 1 + 32 + 8 + 8 + 32 = 81 bytes
    const instructionData = new Uint8Array(81);
    instructionData[0] = 4; // Swap discriminator
    
    // input_token_mint (32 bytes)
    inputTokenMint.toBytes().forEach((byte, index) => {
        instructionData[1 + index] = byte;
    });
    
    // amount_in (8 bytes, u64 little-endian)
    new DataView(instructionData.buffer).setBigUint64(1 + 32, BigInt(amountInBaseUnits), true);
    
    // expected_amount_out (8 bytes, u64 little-endian)
    new DataView(instructionData.buffer).setBigUint64(1 + 32 + 8, BigInt(expectedOutputAmount), true);
    
    // pool_id (32 bytes)
    poolStatePDA.toBytes().forEach((byte, index) => {
        instructionData[49 + index] = byte;
    });
    
    console.log('🔍 Swap instruction data:');
    console.log('  Discriminator: [4] (single byte)');
    console.log('  Input token mint:', inputTokenMint.toString());
    console.log('  Amount in base units:', amountInBaseUnits);
    console.log('  Expected output in base units:', expectedOutputAmount);
    console.log('  Pool ID:', poolStatePDA.toString());
    console.log('  🚨 DEBUG: This expected output will be sent to the contract!');
    console.log('  🚨 DEBUG: If this is 10000, you will receive 10000 TS tokens!');
    console.log('  Total data length:', instructionData.length, 'bytes (should be 81)');
    
    // 🚨 VERIFY: Check the actual bytes in the instruction data
    console.log('🚨🚨🚨 FINAL VERIFICATION: ACTUAL BYTES BEING SENT 🚨🚨🚨');
    console.log('  📊 Full instruction data bytes:', Array.from(instructionData));
    console.log('  📊 Expected amount out bytes (at offset 41):', Array.from(instructionData.slice(41, 49)));
    console.log('  📊 Expected amount out as little-endian u64:', new DataView(instructionData.buffer).getBigUint64(41, true));
    console.log('  📊 Pool ID bytes (at offset 49):', Array.from(instructionData.slice(49, 81)));
    console.log('  🚨 The contract will receive this exact value as expected_amount_out!');
    
    // Build account keys array (11 accounts for decimal-aware swap)
    const outputTokenMint = swapDirection === 'AtoB'
        ? new solanaWeb3.PublicKey(poolData.tokenBMint || poolData.token_b_mint)
        : new solanaWeb3.PublicKey(poolData.tokenAMint || poolData.token_a_mint);
    
    const accountKeys = [
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true },                    // 0: User Authority
        { pubkey: solanaWeb3.SystemProgram.programId, isSigner: false, isWritable: false }, // 1: System Program
        { pubkey: systemStatePDA[0], isSigner: false, isWritable: false },                 // 2: System State PDA
        { pubkey: poolStatePDA, isSigner: false, isWritable: true },                       // 3: Pool State PDA
        { pubkey: window.splToken.TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },  // 4: SPL Token Program
        { pubkey: tokenAVaultPDA[0], isSigner: false, isWritable: true },                  // 5: Token A Vault
        { pubkey: tokenBVaultPDA[0], isSigner: false, isWritable: true },                  // 6: Token B Vault
        { pubkey: new solanaWeb3.PublicKey(fromToken.tokenAccount), isSigner: false, isWritable: true }, // 7: User Input Token Account
        { pubkey: toTokenAccountPubkey, isSigner: false, isWritable: true },               // 8: User Output Token Account
        { pubkey: inputTokenMint, isSigner: false, isWritable: false },                    // 9: Input Token Mint (for decimals)
        { pubkey: outputTokenMint, isSigner: false, isWritable: false }                    // 10: Output Token Mint (for decimals)
    ];
    
    console.log('🔍 Account keys for swap:');
    accountKeys.forEach((account, index) => {
        console.log(`  ${index}: ${account.pubkey.toString()} (signer: ${account.isSigner}, writable: ${account.isWritable})`);
    });
    
    // Create instructions array
    const instructions = [];
    
    // Check if we need to create the destination token account
    const toTokenAccountInfo = await connection.getAccountInfo(toTokenAccountPubkey);
    if (!toTokenAccountInfo) {
        console.log('📍 Adding instruction to create destination token account');
        
        const createATAInstruction = window.splToken.Token.createAssociatedTokenAccountInstruction(
            window.splToken.ASSOCIATED_TOKEN_PROGRAM_ID,
            window.splToken.TOKEN_PROGRAM_ID,
            swapDirection === 'AtoB' 
                ? new solanaWeb3.PublicKey(poolData.tokenBMint || poolData.token_b_mint)
                : new solanaWeb3.PublicKey(poolData.tokenAMint || poolData.token_a_mint),
            toTokenAccountPubkey,
            wallet.publicKey,
            wallet.publicKey
        );
        
        instructions.push(createATAInstruction);
    }
    
    // Create compute budget instruction (security upgrades need ~400K CUs)
    const computeBudgetInstruction = solanaWeb3.ComputeBudgetProgram.setComputeUnitLimit({
        units: 250_000 // Reduced from 450k to test error conditions
    });
    
    instructions.push(computeBudgetInstruction);
    
    // Create swap instruction
    const swapInstruction = new solanaWeb3.TransactionInstruction({
        keys: accountKeys,
        programId: programId,
        data: instructionData
    });
    
    instructions.push(swapInstruction);
    
    // Create transaction
    const transaction = new solanaWeb3.Transaction().add(...instructions);
    
    // Get fresh blockhash
    const { blockhash } = await connection.getLatestBlockhash('finalized');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = wallet.publicKey;
    
    console.log('✅ Swap transaction built successfully');
    
    return transaction;
}

// Slippage functions removed - not needed for fixed ratio trading

/**
 * Enhanced token selection for "from" token
 */
function selectFromToken() {
    toggleSwapDirection();
}

/**
 * Enhanced token selection for "to" token  
 */
function selectToToken() {
    toggleSwapDirection();
}

/**
 * Calculate required input amount when user edits output amount
 */
function calculateSwapInputFromOutput() {
    if (!poolData || !isConnected) return;
    
    // Check if pool is paused before doing any calculations
    const flags = window.TokenDisplayUtils.interpretPoolFlags(poolData);
    const swapBtn = document.getElementById('swap-btn');
    
    if (flags.swapsPaused) {
        const toAmountInput = document.getElementById('to-amount');
        const fromAmountInput = document.getElementById('from-amount');
        const preview = document.getElementById('transaction-preview');
        fromAmountInput.value = '';
        preview.style.display = 'none';
        swapBtn.disabled = true;
        swapBtn.textContent = '🚫 Swaps Paused by Pool Owner';
        swapBtn.style.background = '#6b7280';
        return;
    }
    
    if (flags.liquidityPaused) {
        const toAmountInput = document.getElementById('to-amount');
        const fromAmountInput = document.getElementById('from-amount');
        const preview = document.getElementById('transaction-preview');
        fromAmountInput.value = '';
        preview.style.display = 'none';
        swapBtn.disabled = true;
        swapBtn.textContent = '⏸️ Pool Operations Paused';
        swapBtn.style.background = '#6b7280';
        return;
    }
    
    const toAmountInput = document.getElementById('to-amount');
    const fromAmountInput = document.getElementById('from-amount');
    const preview = document.getElementById('transaction-preview');
    
    const toAmount = parseFloat(toAmountInput.value) || 0;
    
    if (toAmount <= 0) {
        fromAmountInput.value = '';
        preview.style.display = 'none';
        swapBtn.disabled = true;
        swapBtn.textContent = '🔄 Enter Amount to Swap';
        swapBtn.style.background = ''; // Reset to default
        return;
    }
    
    try {
        // Get pool ratios in basis points
        const ratioABasisPoints = poolData.ratioANumerator || poolData.ratio_a_numerator;
        const ratioBBasisPoints = poolData.ratioBDenominator || poolData.ratio_b_denominator;
        
        // Get token decimals
        let inputDecimals, outputDecimals, numerator, denominator;
        let tokenADecimals, tokenBDecimals;
        
        if (poolData.ratioADecimal !== undefined && poolData.ratioBDecimal !== undefined) {
            tokenADecimals = poolData.ratioADecimal;
            tokenBDecimals = poolData.ratioBDecimal;
        } else if (poolData.tokenDecimals && 
                   poolData.tokenDecimals.tokenADecimals !== undefined && 
                   poolData.tokenDecimals.tokenBDecimals !== undefined) {
            tokenADecimals = poolData.tokenDecimals.tokenADecimals;
            tokenBDecimals = poolData.tokenDecimals.tokenBDecimals;
        } else {
            throw new Error('Token decimal information missing');
        }
        
        if (swapDirection === 'AtoB') {
            // Reverse calculation: given output B, calculate required input A
            inputDecimals = tokenADecimals;
            outputDecimals = tokenBDecimals;
            // For reverse: input = (output * denominator) / numerator
            numerator = ratioBBasisPoints;
            denominator = ratioABasisPoints;
        } else {
            // Reverse calculation: given output A, calculate required input B
            inputDecimals = tokenBDecimals;
            outputDecimals = tokenADecimals;
            // For reverse: input = (output * denominator) / numerator
            numerator = ratioABasisPoints;
            denominator = ratioBBasisPoints;
        }
        
        // Calculate required input amount (reverse calculation)
        const requiredInput = calculateSwapInputReverse(
            toAmount,           // Desired output in display units
            inputDecimals,      // Input token decimals
            outputDecimals,     // Output token decimals
            numerator,          // Ratio numerator (basis points)
            denominator         // Ratio denominator (basis points)
        );
        
        // Get the input token to determine correct decimal places
        const fromToken = swapDirection === 'AtoB' 
            ? userTokens.find(t => t.isTokenA)
            : userTokens.find(t => !t.isTokenA);
        
        const fromTokenDecimals = fromToken?.decimals || 6;
        fromAmountInput.value = formatTokenAmount(requiredInput, fromTokenDecimals);
        
        // Update transaction preview
        updateTransactionPreview(requiredInput, toAmount);
        
        // Check if user has sufficient balance (reuse fromToken defined above)
        if (fromToken) {
            const fromAmountBasisPoints = window.TokenDisplayUtils.displayToBasisPoints(requiredInput, fromToken.decimals);
            
            if (fromAmountBasisPoints > fromToken.balance) {
                swapBtn.disabled = true;
                swapBtn.textContent = '❌ Insufficient Balance';
                preview.style.display = 'none';
                return;
            }
        }
        
        // Enable swap button
        preview.style.display = 'block';
        swapBtn.disabled = false;
        swapBtn.textContent = '🔄 Execute Swap';
        
    } catch (error) {
        console.error('❌ Error calculating required input:', error);
        swapBtn.disabled = true;
        swapBtn.textContent = '❌ Calculation Error';
        preview.style.display = 'none';
        showStatus('error', 'Error calculating required input: ' + error.message);
    }
}

/**
 * Calculate required input amount for a desired output (reverse calculation)
 */
function calculateSwapInputReverse(outputDisplay, inputDecimals, outputDecimals, numeratorBasisPoints, denominatorBasisPoints) {
    try {
        // Validation
        if (typeof outputDisplay !== 'number' || outputDisplay < 0) {
            throw new Error(`Invalid output amount: ${outputDisplay}. Must be a positive number.`);
        }
        if (typeof inputDecimals !== 'number' || inputDecimals < 0 || inputDecimals > 9) {
            throw new Error(`Invalid input decimals: ${inputDecimals}. Must be between 0 and 9.`);
        }
        if (typeof outputDecimals !== 'number' || outputDecimals < 0 || outputDecimals > 9) {
            throw new Error(`Invalid output decimals: ${outputDecimals}. Must be between 0 and 9.`);
        }
        if (typeof numeratorBasisPoints !== 'number' || numeratorBasisPoints <= 0) {
            throw new Error(`Invalid numerator: ${numeratorBasisPoints}. Must be a positive number.`);
        }
        if (typeof denominatorBasisPoints !== 'number' || denominatorBasisPoints <= 0) {
            throw new Error(`Invalid denominator: ${denominatorBasisPoints}. Must be a positive number.`);
        }
        
        // Convert desired output to basis points
        const outputBasisPoints = window.TokenDisplayUtils.displayToBasisPoints(outputDisplay, outputDecimals);
        
        // Reverse calculation: input = (output * denominator) / numerator
        // Use ceiling to ensure we always have enough input
        const inputBasisPoints = Math.ceil((outputBasisPoints * denominatorBasisPoints) / numeratorBasisPoints);
        
        // Convert result back to display units
        const inputDisplay = window.TokenDisplayUtils.basisPointsToDisplay(inputBasisPoints, inputDecimals);
        
        console.log(`🔄 REVERSE SWAP CALCULATION:`, {
            desiredOutput: `${outputDisplay} (${outputBasisPoints} basis points)`,
            requiredInput: `${inputDisplay} (${inputBasisPoints} basis points)`,
            ratio: `${numeratorBasisPoints} : ${denominatorBasisPoints}`
        });
        
        return inputDisplay;
        
    } catch (error) {
        console.error('❌ Error calculating required input:', error);
        throw error;
    }
}

/**
 * Show status message
 */
function showStatus(type, message) {
    const container = document.getElementById('status-container');
    // 🛡️ SECURITY FIX: Use safe DOM manipulation for status messages
    container.innerHTML = ''; // Clear existing content
    const statusDiv = document.createElement('div');
    statusDiv.className = `status-message ${type}`;
    statusDiv.textContent = message; // Use textContent to prevent XSS
    container.appendChild(statusDiv);
}

/**
 * Clear status message
 */
function clearStatus() {
    const container = document.getElementById('status-container');
    container.innerHTML = '';
}

/**
 * Start periodic pool status monitoring to detect pause state changes
 */
function startPoolStatusMonitoring() {
    // Clear any existing interval
    if (poolStatusCheckInterval) {
        clearInterval(poolStatusCheckInterval);
    }
    
    console.log('🔄 Starting pool status monitoring...');
    
    // Check pool status every 5 minutes (pool status doesn't change often)
    poolStatusCheckInterval = setInterval(async () => {
        await checkPoolStatusUpdate();
    }, 300000); // 5 minutes
}

/**
 * Stop pool status monitoring
 */
function stopPoolStatusMonitoring() {
    if (poolStatusCheckInterval) {
        clearInterval(poolStatusCheckInterval);
        poolStatusCheckInterval = null;
        console.log('⏹️ Pool status monitoring stopped');
    }
}

/**
 * Check for pool status updates and refresh UI if needed
 */
async function checkPoolStatusUpdate() {
    if (!poolAddress || !poolData) return;
    
    try {
        console.log('🔍 Checking pool status for updates...');
        
        // Get fresh pool data (force RPC to get latest)
        const cacheResult = await window.PoolCacheManager.fetchFromSolanaRPC(poolAddress);
        let freshPoolData = null;
        
        if (cacheResult) {
            // The RPC data is base64 encoded, so we need to decode it first
            const base64Data = cacheResult.data.value.data[0];
            const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
            
            freshPoolData = window.TradingDataService.parsePoolState(
                binaryData, 
                poolAddress
            );
        }
        
        if (freshPoolData && freshPoolData.flags !== undefined) {
            const oldFlags = window.TokenDisplayUtils.interpretPoolFlags(poolData);
            const newFlags = window.TokenDisplayUtils.interpretPoolFlags(freshPoolData);
            
            // Check if pause status changed
            const pauseStatusChanged = 
                oldFlags.swapsPaused !== newFlags.swapsPaused || 
                oldFlags.liquidityPaused !== newFlags.liquidityPaused;
            
            if (pauseStatusChanged) {
                console.log('🚨 Pool pause status changed!');
                console.log('  Old flags:', oldFlags);
                console.log('  New flags:', newFlags);
                
                // Update pool data
                poolData = freshPoolData;
                
                // Refresh displays
                updatePoolDisplay();
                updateSwapInterfaceWithRealBalances();
                
                // Show notification about status change
                if (newFlags.swapsPaused && !oldFlags.swapsPaused) {
                    showStatus('error', '🚫 Pool swaps have been paused by the pool owner.');
                } else if (!newFlags.swapsPaused && oldFlags.swapsPaused) {
                    showStatus('success', '✅ Pool swaps have been resumed by the pool owner.');
                }
                
                if (newFlags.liquidityPaused && !oldFlags.liquidityPaused) {
                    showStatus('error', '⏸️ Pool liquidity operations have been paused by the pool owner.');
                } else if (!newFlags.liquidityPaused && oldFlags.liquidityPaused) {
                    showStatus('success', '✅ Pool liquidity operations have been resumed by the pool owner.');
                }
            }
        }
        
    } catch (error) {
        console.warn('⚠️ Error checking pool status update:', error);
        // Don't show error to user - this is background monitoring
    }
}

// Helper functions from liquidity.js for pool display
/**
 * Generate pool flags display section
 */


/**
 * Add expandable Pool State display section
 */
function addExpandablePoolStateDisplay() {
    if (!poolData) return;
    
    // Create expandable section after pool info
    const poolInfoSection = document.querySelector('.pool-info-section');
    
    // Remove existing expandable section if it exists
    const existingSection = document.getElementById('expandable-pool-state');
    if (existingSection) {
        existingSection.remove();
    }
    
    const expandableSection = document.createElement('div');
    expandableSection.id = 'expandable-pool-state';
    expandableSection.style.cssText = `
        background: white;
        margin-top: 20px;
        border-radius: 12px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        border-left: 4px solid #8b5cf6;
        overflow: hidden;
    `;
    
    const flags = window.TokenDisplayUtils.interpretPoolFlags(poolData);
    
    // 🛡️ SECURITY FIX: Use safe DOM manipulation for expandable section
    expandableSection.innerHTML = ''; // Clear existing content
    
    // Create header div
    const headerDiv = document.createElement('div');
    headerDiv.style.padding = '20px';
    headerDiv.style.cursor = 'pointer';
    headerDiv.style.background = '#f8f9fa';
    headerDiv.style.borderBottom = '1px solid #e5e7eb';
    headerDiv.onclick = togglePoolStateDetails;
    
    // Create header h3
    const headerH3 = document.createElement('h3');
    headerH3.style.margin = '0';
    headerH3.style.color = '#333';
    headerH3.style.display = 'flex';
    headerH3.style.alignItems = 'center';
    headerH3.style.justifyContent = 'space-between';
    headerH3.textContent = '🔍 Pool State Details (Developer Debug Section)';
    
    // Create expand indicator
    const expandIndicator = document.createElement('span');
    expandIndicator.id = 'expand-indicator';
    expandIndicator.style.marginLeft = 'auto';
    expandIndicator.style.fontSize = '20px';
    expandIndicator.textContent = '▼';
    headerH3.appendChild(expandIndicator);
    
    // Create description paragraph
    const descP = document.createElement('p');
    descP.style.margin = '5px 0 0 0';
    descP.style.color = '#666';
    descP.style.fontSize = '14px';
    descP.textContent = 'Click to view all PoolState struct fields for debugging';
    
    headerDiv.appendChild(headerH3);
    headerDiv.appendChild(descP);
    
    // Create details div
    const detailsDiv = document.createElement('div');
    detailsDiv.id = 'pool-state-details';
    detailsDiv.style.display = 'none';
    detailsDiv.style.padding = '25px';
    
    const gridDiv = document.createElement('div');
    gridDiv.style.display = 'grid';
    gridDiv.style.gridTemplateColumns = 'repeat(auto-fit, minmax(300px, 1fr))';
    gridDiv.style.gap = '20px';
    
    // Generate pool state fields safely
    const poolStateFields = generatePoolStateFields();
    if (poolStateFields) {
        gridDiv.innerHTML = poolStateFields; // This is safe as it's controlled content
    }
    
    detailsDiv.appendChild(gridDiv);
    expandableSection.appendChild(headerDiv);
    expandableSection.appendChild(detailsDiv);
    
    poolInfoSection.insertAdjacentElement('afterend', expandableSection);
}

/**
 * Generate all PoolState struct fields display
 */
function generatePoolStateFields() {
    if (!poolData) return '';
    
    const flags = window.TokenDisplayUtils.interpretPoolFlags(poolData);
    
    return `
        <!-- Basic Pool Information -->
        <div class="pool-state-section">
            <h4 style="color: #4f46e5; margin: 0 0 15px 0; border-bottom: 2px solid #e0e7ff; padding-bottom: 5px;">📋 Basic Pool Information</h4>
            <div class="state-field"><strong>owner:</strong><br><code>${poolData.owner || 'N/A'}</code></div>
            <div class="state-field"><strong>token_a_mint:</strong><br><code>${poolData.token_a_mint || poolData.tokenAMint || 'N/A'}</code></div>
            <div class="state-field"><strong>token_b_mint:</strong><br><code>${poolData.token_b_mint || poolData.tokenBMint || 'N/A'}</code></div>
            <div class="state-field"><strong>token_a_vault:</strong><br><code>${poolData.token_a_vault || poolData.tokenAVault || 'N/A'}</code></div>
            <div class="state-field"><strong>token_b_vault:</strong><br><code>${poolData.token_b_vault || poolData.tokenBVault || 'N/A'}</code></div>
            <div class="state-field"><strong>lp_token_a_mint:</strong><br><code>${poolData.lp_token_a_mint || poolData.lpTokenAMint || 'N/A'}</code></div>
            <div class="state-field"><strong>lp_token_b_mint:</strong><br><code>${poolData.lp_token_b_mint || poolData.lpTokenBMint || 'N/A'}</code></div>
        </div>
        
        <!-- Ratio Configuration -->
        <div class="pool-state-section">
            <h4 style="color: #059669; margin: 0 0 15px 0; border-bottom: 2px solid #d1fae5; padding-bottom: 5px;">⚖️ Ratio Configuration</h4>
            <div class="state-field"><strong>ratio_a_numerator:</strong><br><code>${poolData.ratio_a_numerator || poolData.ratioANumerator || 'N/A'}</code></div>
            <div class="state-field"><strong>ratio_b_denominator:</strong><br><code>${poolData.ratio_b_denominator || poolData.ratioBDenominator || 'N/A'}</code></div>
        </div>
        
        <!-- Additional debugging information -->
        <div class="pool-state-section">
            <h4 style="color: #dc2626; margin: 0 0 15px 0; border-bottom: 2px solid #fecaca; padding-bottom: 5px;">🚩 Pool Flags & Status</h4>
            <div class="state-field"><strong>flags (raw):</strong><br><code>${poolData.flags || 0}</code></div>
            <div class="state-field"><strong>Swaps Paused:</strong><br><code>${flags.swapsPaused ? 'Yes' : 'No'}</code></div>
            <div class="state-field"><strong>Liquidity Paused:</strong><br><code>${flags.liquidityPaused ? 'Yes' : 'No'}</code></div>
        </div>
    `;
}

/**
 * Toggle pool state details visibility
 */
function togglePoolStateDetails() {
    const details = document.getElementById('pool-state-details');
    const indicator = document.getElementById('expand-indicator');
    
    if (details.style.display === 'none') {
        details.style.display = 'block';
        indicator.textContent = '▲';
    } else {
        details.style.display = 'none';
        indicator.textContent = '▼';
    }
}

// Export functions for global access
window.toggleSwapDirection = toggleSwapDirection;
window.calculateSwapOutputEnhanced = calculateSwapOutputEnhanced;
window.executeSwap = executeSwap;
window.selectFromToken = selectFromToken;
window.selectToToken = selectToToken;
window.setMaxAmount = setMaxAmount;
// Slippage functions removed
window.togglePoolStateDetails = togglePoolStateDetails;
window.connectWallet = connectWallet;
window.refreshPoolStatus = refreshPoolStatus;

/**
 * Manually refresh pool status
 */
async function refreshPoolStatus() {
    try {
        const refreshBtn = document.getElementById('refresh-pool-btn');
        if (refreshBtn) {
            refreshBtn.disabled = true;
            refreshBtn.textContent = '⏳ Refreshing...';
        }
        
        console.log('🔄 Manually refreshing pool status...');
        showStatus('info', '🔄 Refreshing pool status...');
        
        // Force refresh pool data
        await checkPoolStatusUpdate();
        
        showStatus('success', '✅ Pool status refreshed successfully');
        setTimeout(clearStatus, 3000);
        
    } catch (error) {
        console.error('❌ Error refreshing pool status:', error);
        showStatus('error', 'Failed to refresh pool status: ' + error.message);
    } finally {
        const refreshBtn = document.getElementById('refresh-pool-btn');
        if (refreshBtn) {
            refreshBtn.disabled = false;
            refreshBtn.textContent = '🔄 Refresh Status';
        }
    }
}

/**
 * Update cache status display in the UI
 */
function updateCacheStatusDisplay(cacheResult) {
    const cacheStatusDiv = document.getElementById('cache-status');
    const cacheSourceSpan = document.getElementById('cache-source');
    
    if (cacheStatusDiv && cacheSourceSpan) {
        // Show cache status
        cacheStatusDiv.style.display = 'block';
        
        // Create appropriate icon and text based on cache source
        let icon, text, color;
        const responseTime = Math.round(cacheResult.response_time);
        
        switch (cacheResult.source) {
            case 'server-cache-hit':
                icon = '🗄️';
                text = `Server Cache (${responseTime}ms)`;
                color = '#10b981'; // green
                break;
            case 'server-cache-miss':
                icon = '📡';
                text = `Server Fresh (${responseTime}ms)`;
                color = '#f59e0b'; // amber
                break;
            case 'direct-rpc':
                icon = '🔗';
                text = `Direct RPC (${responseTime}ms)`;
                color = '#3b82f6'; // blue
                break;
            case 'localStorage':
                icon = '💾';
                text = `Local Cache (${responseTime}ms)`;
                color = '#8b5cf6'; // purple
                break;
            default:
                icon = '❓';
                text = `${cacheResult.source} (${responseTime}ms)`;
                color = '#6b7280'; // gray
        }
        
        cacheSourceSpan.innerHTML = `${icon} ${text}`;
        cacheSourceSpan.style.color = color;
        
        // Add tooltip with more details
        const age = Date.now() - new Date(cacheResult.generated_at).getTime();
        const ageText = age < 60000 ? `${Math.round(age/1000)}s ago` : `${Math.round(age/60000)}m ago`;
        cacheStatusDiv.title = `Data generated: ${ageText}`;
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', initializeSwapPage);

// Cleanup when page unloads
window.addEventListener('beforeunload', () => {
    stopPoolStatusMonitoring();
});

// Also cleanup when user navigates away
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        console.log('🔄 Page hidden, pausing pool status monitoring');
        stopPoolStatusMonitoring();
    } else {
        console.log('🔄 Page visible, resuming pool status monitoring');
        if (poolData && isConnected) {
            startPoolStatusMonitoring();
        }
    }
});

console.log('🔄 Enhanced Swap JavaScript loaded successfully'); 