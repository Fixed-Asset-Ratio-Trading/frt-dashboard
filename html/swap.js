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
// Removed: poolStatusCheckInterval - no more periodic monitoring
// No slippage tolerance needed for fixed ratio trading

/**
 * Initialize the swap page with library loading retry mechanism
 */
async function initializeSwapPage() {
    console.log('🚀 Starting immediate server-only initialization...');
    
    // Get pool address from URL
    const urlParams = new URLSearchParams(window.location.search);
    const poolAddress = urlParams.get('pool');
    
    if (!poolAddress) {
        showStatus('error', '❌ No pool address specified in URL');
            return;
        }
        
    console.log('🎯 Loading pool for swap:', poolAddress);
    
    // Load pool data directly from server and render immediately - NO library checks needed
    loadPoolDataFromServerOnly(poolAddress);
}

/**
 * Lazy load SPL Token library when needed for transactions
 */
async function ensureSPLTokenLibrary() {
    // Return early if already loaded
    if (window.SPL_TOKEN_LOADED && window.splToken) {
        return true;
    }
    
    console.log('🔄 Loading SPL Token library for transaction...');
    
    try {
        let splTokenLib = null;
        const possibleNames = ['splToken', 'SPLToken', 'SplToken'];
        
        // Check window level
        for (const name of possibleNames) {
            if (window[name]) {
                splTokenLib = window[name];
                console.log(`✅ Found SPL Token library as window.${name}`);
                break;
            }
        }
        
        // Check solanaWeb3 level
        if (!splTokenLib && window.solanaWeb3) {
            for (const name of possibleNames) {
                if (window.solanaWeb3[name]) {
                    splTokenLib = window.solanaWeb3[name];
                    console.log(`✅ Found SPL Token library as solanaWeb3.${name}`);
                    break;
                }
            }
        }
        
        // Lazy-load if still not found
        if (!splTokenLib) {
            try {
                await loadScriptDeferred('libs/spl-token.min.js');
                // Re-check after loading
                for (const name of possibleNames) {
                    if (window[name]) {
                        splTokenLib = window[name];
                        console.log(`✅ Loaded SPL Token library as window.${name}`);
                        break;
                    }
                }
                if (!splTokenLib && window.solanaWeb3) {
                    for (const name of possibleNames) {
                        if (window.solanaWeb3[name]) {
                            splTokenLib = window.solanaWeb3[name];
                            console.log(`✅ Loaded SPL Token library as solanaWeb3.${name}`);
                            break;
                        }
                    }
                }
            } catch (e) {
                console.warn('⚠️ Failed to lazy-load libs/spl-token.min.js:', e?.message);
            }
        }
        
        if (splTokenLib) {
            window.splToken = splTokenLib;
            window.SPL_TOKEN_LOADED = true;
            console.log('✅ SPL Token library loaded and ready for transactions!');
            return true;
        } else {
            console.error('❌ SPL Token library not found - cannot perform transactions');
            window.SPL_TOKEN_LOADED = false;
            return false;
        }
    } catch (error) {
        console.error('❌ Error loading SPL Token library:', error);
        window.SPL_TOKEN_LOADED = false;
        return false;
    }
}

/**
 * Simple flags interpretation from server data (no dependencies)
 * Based on API docs: pool_state.swaps_paused() and pool_state.liquidity_paused() methods
 */
function interpretPoolFlags(poolData) {
    const flags = {
        swapsPaused: false,
        liquidityPaused: false,
        oneToManyRatio: false,
        exactExchangeRequired: false
    };
    
    // Check if pool has flags field from server
    if (poolData && poolData.flags !== undefined) {
        const flagValue = parseInt(poolData.flags) || 0;
        
        // Interpret flags using bitwise operations based on contract documentation
        // Bit 0 (value 1): Simple ratio flag
        // Bit 1 (value 2): Liquidity paused
        // Bit 2 (value 4): Swaps paused  
        // Bit 5 (value 32): Swap for owners only
        // Bit 6 (value 64): Exact exchange required (no dust allowed)
        
        flags.swapsPaused = (flagValue & 4) !== 0;
        flags.liquidityPaused = (flagValue & 2) !== 0;
        flags.swapForOwnersOnly = (flagValue & 32) !== 0;
        flags.exactExchangeRequired = (flagValue & 64) !== 0;
        
        console.log(`🚩 Pool flags value: ${flagValue}`);
        if (flags.exactExchangeRequired) {
            console.log('⚠️ EXACT EXCHANGE REQUIRED: This pool requires amounts that divide exactly (no dust)');
        }
    }
    
    return flags;
}

/**
 * Load pool data from server only and render immediately (like test page)
 */
async function loadPoolDataFromServerOnly(poolAddress, forceRefresh = false) {
    try {
        console.log('📡 Fetching pool data from server:', poolAddress);
        showStatus('info', 'Loading pool information from server...');
        
        // Add refresh parameter if requested
        const refreshParam = forceRefresh ? '&refresh=1' : '';
        const response = await fetch(`./pool-data.php?poolAddress=${poolAddress}${refreshParam}`);
        
        if (!response.ok) {
            throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
        }
        
        const serverData = await response.json();
        console.log('✅ Server response received:', serverData);
        
        if (serverData.parsed_pool_data) {
            poolData = serverData.parsed_pool_data;
            console.log('✅ Pool data loaded from server:', poolData);
            
            // Render the page immediately with server data
            console.log('🎨 Starting updatePoolDisplay...');
            const displayStart = performance.now();
            updatePoolDisplay();
            console.log(`🎨 updatePoolDisplay took ${(performance.now() - displayStart).toFixed(1)}ms`);
            
            console.log('🔄 Starting initializeSwapInterface...');
            const interfaceStart = performance.now();
            initializeSwapInterface();
            console.log(`🔄 initializeSwapInterface took ${(performance.now() - interfaceStart).toFixed(1)}ms`);
            clearStatus();
            
            console.log('✅ Page rendered with server data - deferring other operations');
            
            // Defer non-critical operations until after render
            setTimeout(() => {
                initializeNonCriticalOperations();
    }, 100);
            
        } else {
            throw new Error('No parsed pool data in server response');
        }
        
    } catch (error) {
        console.error('❌ Failed to load pool data from server:', error);
        showStatus('error', `❌ Failed to load pool data: ${error.message}`);
    }
}

/**
 * Initialize non-critical operations after page render (RPC, wallet, etc.)
 */
async function initializeNonCriticalOperations() {
    console.log('🔄 Starting non-critical operations after page render...');
    
    // Add a small delay to ensure DOM updates are complete
    setTimeout(async () => {
        try {
            // Check for wallet persistence (non-blocking)
            await checkWalletPersistence();
        } catch (error) {
            console.warn('⚠️ Wallet persistence check failed:', error.message);
        }
    }, 50);
    
    console.log('✅ Non-critical operations deferred - page is ready for user interaction');
}

/**
 * Initialize the application after libraries are loaded (LEGACY - not used in server-only mode)
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

        // Simplified: Only use server-side data, no local cache checks

        // Initialize Solana connection for transactions only (no pool data fetching)
        console.log(`[${new Date().toISOString()}] 🔌 Connecting to Solana RPC for transactions only...`);
        const connectionConfig = {
            commitment: CONFIG.commitment,
            disableRetryOnRateLimit: CONFIG.disableRetryOnRateLimit || true,
            wsEndpoint: false // Disable WebSocket, use HTTP only
        };
                connection = new solanaWeb3.Connection(CONFIG.rpcUrl, connectionConfig);
        
        console.log('✅ Solana connection established (SPL Token library will load when needed)');
        
        // If wallet was already connected, retry balance and token loading now that connection is ready
        if (isConnected && wallet) {
            console.log('🔄 Connection established, retrying wallet operations...');
            setTimeout(async () => {
                try {
                    await checkWalletBalance();
                    await loadUserTokensForPool();
                } catch (error) {
                    console.warn('⚠️ Error retrying wallet operations:', error);
                }
            }, 100);
        }
        
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
                // Wallet connection will be handled at the very end of pool data processing
            } catch (_) {}
        });
        
    } catch (error) {
        console.error('❌ Error initializing swap page:', error);
        showStatus('error', `Failed to initialize: ${error.message}`);
    }
}

/**
 * Load pool data from server only (no caching, no RPC)
 */
async function loadPoolData() {
    try {
        showStatus('info', 'Loading pool information from server...');
        
        // Fetch pool data directly from server
        console.log('📡 Fetching pool data from server:', poolAddress);
        const response = await fetch(`./pool-data.php?poolAddress=${poolAddress}`);
        
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }
        
        const serverData = await response.json();
        
        if (!serverData || !serverData.parsed_pool_data) {
            throw new Error('Invalid server response: missing parsed pool data');
        }
        
        // Use the parsed pool data directly from server
        poolData = serverData.parsed_pool_data;
        
        console.log('✅ Pool data loaded from server:', poolData.address);
        
        // Map server field names to expected client field names for compatibility
        poolData.tokenAMint = poolData.token_a_mint;
        poolData.tokenBMint = poolData.token_b_mint;
        poolData.ratioANumerator = poolData.ratio_a_numerator;
        poolData.ratioBDenominator = poolData.ratio_b_denominator;
        poolData.totalTokenALiquidity = poolData.total_token_a_liquidity;
        poolData.totalTokenBLiquidity = poolData.total_token_b_liquidity;
        poolData.ratioADecimal = poolData.ratio_a_decimal;
        poolData.ratioBDecimal = poolData.ratio_b_decimal;
        poolData.ratioAActual = poolData.ratio_a_actual;
        poolData.ratioBActual = poolData.ratio_b_actual;
        poolData.tokenASymbol = poolData.token_a_ticker;
        poolData.tokenBSymbol = poolData.token_b_ticker;
        
        // Add server metadata
        poolData.cacheSource = 'server-only';
        poolData.cacheResponseTime = 0; // Server handles timing
        poolData.generatedAt = serverData.generated_at;
            
            // 🔍 DEVELOPER DEBUGGING: Log complete pool data to console
            console.group('🔍 POOL DATA FOR DEVELOPERS');
            console.log('📊 Complete Pool State:', poolData);
            console.log('🏊‍♂️ Pool Address:', poolAddress);
        console.log('🗄️ Data Source: server-only');
        console.log('🪙 Token A Mint:', poolData.tokenAMint);
        console.log('🪙 Token B Mint:', poolData.tokenBMint);
        console.log('⚖️ Ratio A Numerator:', poolData.ratioANumerator);
        console.log('⚖️ Ratio B Denominator:', poolData.ratioBDenominator);
        console.log('💧 Token A Liquidity:', poolData.totalTokenALiquidity);
        console.log('💧 Token B Liquidity:', poolData.totalTokenBLiquidity);
            console.log('🚩 Pool Flags:', poolData.flags);
            console.log('🔒 Pool Owner:', poolData.owner);
            console.groupEnd();
            
        // Enrich pool data with symbols and display information
            await enrichPoolData();
        
        // Update pool display
            updatePoolDisplay();
            initializeSwapInterface();
            clearStatus();
        
        // Now that all pool data is processed and interface is ready, check for wallet connection
        setTimeout(async () => {
            try {
                console.log('🔄 Pool data processing complete, checking wallet persistence...');
                await checkWalletPersistence();
            } catch (error) {
                console.warn('⚠️ Wallet persistence check failed:', error);
            }
        }, 100); // Small delay to ensure UI updates are complete
        
    } catch (error) {
        console.error('❌ Error loading pool data from server:', error);
        showStatus('error', `Failed to load pool from server: ${error.message}`);
    }
}

/**
 * Enrich pool data with token symbols (simplified - server provides all data)
 */
async function enrichPoolData() {
    if (!poolData) return;
    
    // Server already provides token symbols and decimals, just verify they exist
    if (!poolData.tokenASymbol || !poolData.tokenBSymbol) {
        console.warn('Warning: Server did not provide token symbols, using fallbacks');
        poolData.tokenASymbol = poolData.tokenASymbol || `${(poolData.tokenAMint)?.slice(0, 4) || 'A'}`;
        poolData.tokenBSymbol = poolData.tokenBSymbol || `${(poolData.tokenBMint)?.slice(0, 4) || 'B'}`;
        }
        
        console.log(`✅ Token symbols resolved: ${poolData.tokenASymbol}/${poolData.tokenBSymbol}`);
    
    // 🎯 CENTRALIZED: Create TokenPairRatio instance for all calculations
    try {
        // Server provides all necessary decimal and ratio data
        if (typeof poolData.ratioADecimal !== 'number' || typeof poolData.ratioBDecimal !== 'number') {
            console.warn('Warning: Server did not provide token decimals, using defaults');
            poolData.ratioADecimal = poolData.ratioADecimal || 6;
            poolData.ratioBDecimal = poolData.ratioBDecimal || 6;
                poolData.ratioAActual = (poolData.ratioANumerator || 0) / Math.pow(10, poolData.ratioADecimal);
                poolData.ratioBActual = (poolData.ratioBDenominator || 0) / Math.pow(10, poolData.ratioBDecimal);
        }

        // Create simple ratio calculation object (no dependencies)
        // Store token symbols in poolData for consistent access
        poolData.tokenASymbol = poolData.token_a_ticker || poolData.tokenASymbol || 'tSAT';
        poolData.tokenBSymbol = poolData.token_b_ticker || poolData.tokenBSymbol || 'tBTC';
        
        tokenPairRatio = {
            ratioA: poolData.ratio_a_actual || poolData.ratioAActual || 1,
            ratioB: poolData.ratio_b_actual || poolData.ratioBActual || 1,
            tokenASymbol: poolData.tokenASymbol,
            tokenBSymbol: poolData.tokenBSymbol,
            tokenADecimals: poolData.ratio_a_decimal || poolData.ratioADecimal || 6,
            tokenBDecimals: poolData.ratio_b_decimal || poolData.ratioBDecimal || 6,
            
            // Simple swap calculation methods
            SwapAToB: function(amountA) {
                return (amountA * this.ratioB) / this.ratioA;
            },
            SwapBToA: function(amountB) {
                return (amountB * this.ratioA) / this.ratioB;
            },
            
            // Convert display amounts to basis points
            ADisplayToBasisPoints: function(displayAmount) {
                return Math.floor(displayAmount * Math.pow(10, this.tokenADecimals));
            },
            
            BDisplayToBasisPoints: function(displayAmount) {
                return Math.floor(displayAmount * Math.pow(10, this.tokenBDecimals));
            },
            
            ExchangeDisplay: function() {
                const rate = this.ratioB / this.ratioA;
                return `1 ${this.tokenASymbol} = ${rate.toFixed(8)} ${this.tokenBSymbol}`;
            },
            getDebugInfo: function() {
                return {
                    ratioA: this.ratioA,
                    ratioB: this.ratioB,
                    tokenASymbol: this.tokenASymbol,
                    tokenBSymbol: this.tokenBSymbol,
                    exchangeRate: this.ratioB / this.ratioA
                };
            }
        };
        
        console.log(`🎯 Simple TokenPairRatio created: ${tokenPairRatio.ExchangeDisplay()}`);
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
    // Coerce input to number when possible
    if (typeof amount === 'string') {
        amount = parseFloat(amount);
    } else if (typeof amount === 'bigint') {
        amount = Number(amount);
    }
    
    if (!Number.isFinite(amount)) {
        return '0' + (decimals > 0 ? '.' + '0'.repeat(Math.min(decimals, 9)) : '');
    }
    
    if (amount === 0) {
        if (decimals === 0) return '0';
        return '0.' + '0'.repeat(decimals);
    }
    
    const formatted = Number(amount).toFixed(decimals);
    if (decimals > 0) {
        return formatted.replace(/\.?0+$/, '');
    }
    return formatted;
}

/**
 * Show wallet connection UI and update wallet button
 */
function showWalletConnection() {
    // Update the main wallet connect button
    updateWalletButton();
    console.log('🔄 Wallet connection status updated');
}

/**
 * Update the wallet connect/disconnect button in the swap interface
 */
function updateWalletButton() {
    const walletBtn = document.getElementById('wallet-connect-btn');
    const walletBtnText = document.getElementById('wallet-btn-text');
    
    if (walletBtn && walletBtnText) {
        if (isConnected && wallet) {
            walletBtn.className = 'wallet-btn connected';
            walletBtnText.textContent = `🔓 ${wallet.publicKey.toString().slice(0, 4)}...${wallet.publicKey.toString().slice(-4)}`;
        } else {
            walletBtn.className = 'wallet-btn disconnected';
            walletBtnText.textContent = '🔗 Connect Wallet';
        }
    }
}

/**
 * Check if wallet was previously connected and auto-reconnect
 */
async function checkWalletPersistence() {
    try {
        // Check if wallet was previously connected
        const wasConnected = localStorage.getItem('wallet_connected') === 'true';
        
        if (wasConnected && window.backpack) {
            console.log('🔄 Attempting to restore previous wallet connection...');
            
            try {
                // Try to connect to Backpack (this will work if user previously authorized)
                await window.backpack.connect();
                console.log('✅ Wallet connection restored successfully');
                await handleWalletConnected();
            } catch (connectError) {
                // Connection failed - user likely disconnected or rejected
                console.log('⚠️ Could not restore wallet connection:', connectError.message);
                localStorage.removeItem('wallet_connected');
                
                // Update UI to show disconnected state
                updateWalletButton();
            }
        } else {
            console.log('🔄 No previous wallet connection found');
        }
    } catch (error) {
        console.warn('⚠️ Error checking wallet persistence:', error);
        // Clear state if there's an error
        localStorage.removeItem('wallet_connected');
        updateWalletButton();
    }
}

/**
 * Toggle wallet connection (connect if disconnected, disconnect if connected)
 */
async function toggleWalletConnection() {
    if (isConnected && wallet) {
        await disconnectWallet();
    } else {
        await connectWallet();
    }
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
        
        // Save connection state to localStorage
        localStorage.setItem('wallet_connected', 'true');
        
    } catch (error) {
        console.error('❌ Error connecting wallet:', error);
        showStatus('error', 'Failed to connect wallet: ' + error.message);
    }
}

/**
 * Disconnect wallet
 */
async function disconnectWallet() {
    try {
        console.log('🔗 Disconnecting wallet...');
        showStatus('info', 'Disconnecting wallet...');
        
        if (window.backpack && window.backpack.disconnect) {
            await window.backpack.disconnect();
        }
        
        // Reset wallet state
        wallet = null;
        isConnected = false;
        userTokens = [];
        
        // Clear connection state from localStorage
        localStorage.removeItem('wallet_connected');
        
        // Update wallet button to show disconnected state
        updateWalletButton();
        
        // Reset swap interface to show connect button
        const swapBtn = document.getElementById('swap-btn');
        if (swapBtn) {
            swapBtn.disabled = true;
            swapBtn.textContent = '🔗 Connect Wallet to Swap';
        }
        
        // Clear token balances
        const fromBalance = document.getElementById('from-token-balance');
        const toBalance = document.getElementById('to-token-balance');
        if (fromBalance) fromBalance.textContent = '0.000000';
        if (toBalance) toBalance.textContent = '0.000000';
        
        showStatus('success', 'Wallet disconnected');
        
    } catch (error) {
        console.error('❌ Error disconnecting wallet:', error);
        showStatus('error', 'Failed to disconnect wallet: ' + error.message);
    }
}

/**
 * Initialize Solana RPC connection when needed for wallet operations
 */
async function initializeSolanaConnection() {
    if (connection) {
        return connection; // Already initialized
    }
    
    try {
        console.log('🔌 Initializing Solana RPC connection for wallet operations...');
        
        // Ensure config is loaded (lazy-load if missing)
        if (!window.CONFIG) {
            try {
                await loadScriptDeferred('config.js');
            } catch (e) {
                console.warn('⚠️ Failed to lazy-load config.js:', e?.message);
            }
        }
        
        // Wait briefly for CONFIG to populate
        let attempts = 0;
        while (!window.CONFIG && attempts < 30) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        
        if (!window.CONFIG) {
            throw new Error('Configuration not available');
        }
        
        // Ensure solanaWeb3 is available (lazy-load if missing)
        if (!window.solanaWeb3) {
            try {
                await loadScriptDeferred('libs/solana-web3.min.js');
            } catch (e) {
                console.warn('⚠️ Failed to lazy-load solana-web3.min.js:', e?.message);
            }
        }
        
        if (!window.solanaWeb3) {
            throw new Error('solanaWeb3 not available');
        }
        
        const connectionConfig = {
            commitment: window.CONFIG.commitment || 'confirmed',
            disableRetryOnRateLimit: true,
            wsEndpoint: false // Disable WebSocket, use HTTP only
        };
        
        connection = new solanaWeb3.Connection(window.CONFIG.rpcUrl, connectionConfig);
        console.log('✅ Solana RPC connection initialized for wallet operations');
        
        return connection;
    } catch (error) {
        console.error('❌ Failed to initialize Solana connection:', error);
        throw error;
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
        
        // Initialize Solana connection for wallet operations
        await initializeSolanaConnection();
        
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
        
        // Removed: periodic pool status monitoring - using server-only data
        
        // Update wallet button to show connected state
        updateWalletButton();
        
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
        // Check if connection is available
        if (!connection) {
            console.log('⚠️ Solana connection not ready yet, skipping balance check');
            return;
        }
        
        if (!wallet || !wallet.publicKey) {
            console.log('⚠️ Wallet not available, skipping balance check');
            return;
        }
        
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
        if (!poolData || !isConnected || !connection) {
            if (!connection) {
                console.log('⚠️ Solana connection not ready yet, skipping token loading');
            }
            return;
        }
        
        // Ensure SPL Token library is loaded before using it
        const splTokenReady = await ensureSPLTokenLibrary();
        if (!splTokenReady) {
            console.error('❌ Cannot load user tokens without SPL Token library');
            return;
        }
        
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
    
     // ✅ SIMPLE: Use server data directly without dependencies (like test page)
     const tokenASymbol = poolData.token_a_ticker || poolData.token_a_mint?.slice(0, 4) || 'TOKEN A';
     const tokenBSymbol = poolData.token_b_ticker || poolData.token_b_mint?.slice(0, 4) || 'TOKEN B';
     
     // Calculate exchange rate from server data
     const ratioA = poolData.ratio_a_actual || (poolData.ratio_a_numerator / Math.pow(10, poolData.ratio_a_decimal || 6));
     const ratioB = poolData.ratio_b_actual || (poolData.ratio_b_denominator / Math.pow(10, poolData.ratio_b_decimal || 6));
     const exchangeRate = ratioB / ratioA;
     
     // Format liquidity
     const tokenALiquidity = poolData.total_token_a_liquidity || 0;
     const tokenBLiquidity = poolData.total_token_b_liquidity || 0;
     const tokenADecimal = poolData.ratio_a_decimal || 6;
     const tokenBDecimal = poolData.ratio_b_decimal || 6;
     const tokenALiquidityFormatted = (tokenALiquidity / Math.pow(10, tokenADecimal)).toFixed(6);
     const tokenBLiquidityFormatted = (tokenBLiquidity / Math.pow(10, tokenBDecimal)).toFixed(6);
     
     // Use the simple flags interpretation function
     const flags = interpretPoolFlags(poolData);
    
    const display = {
         baseToken: tokenASymbol,
         quoteToken: tokenBSymbol,
         displayPair: `${tokenASymbol} / ${tokenBSymbol}`,
         rateText: `1 ${tokenASymbol} = ${exchangeRate.toFixed(8)} ${tokenBSymbol}`,
         exchangeRate: exchangeRate,
         baseLiquidity: `${tokenALiquidityFormatted} ${tokenASymbol}`,
         quoteLiquidity: `${tokenBLiquidityFormatted} ${tokenBSymbol}`,
         isReversed: false,
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
    
    // Simple flags display (no dependencies)
    const flagsHtml = '';

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
    rateValue.textContent = display.rateText;
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
    baseValue.textContent = display.baseLiquidity;
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
    quoteValue.textContent = display.quoteLiquidity;
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
    copyBtn.onclick = () => {
        navigator.clipboard.writeText(poolAddress).then(() => {
            copyBtn.textContent = '✅';
            setTimeout(() => copyBtn.textContent = '📋', 2000);
        }).catch(() => {
            copyBtn.textContent = '❌';
            setTimeout(() => copyBtn.textContent = '📋', 2000);
        });
    };
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
    
    // Ensure input fields are enabled for interaction
    document.getElementById('from-amount').disabled = false;
    document.getElementById('to-amount').disabled = false;
    
    // Hide preview initially
    document.getElementById('transaction-preview').style.display = 'none';
    
    // Set up swap button for wallet connection requirement
    const swapBtn = document.getElementById('swap-btn');
    swapBtn.disabled = false; // Enable button so users can click to connect
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
    
    console.log(`[${new Date().toISOString()}] ✅ Swap interface ready without wallet - users can calculate swaps`);
    
    // Measure and report render performance
    if (window.renderStartTime) {
        const renderTime = performance.now() - window.renderStartTime;
        const renderTimeSeconds = (renderTime / 1000).toFixed(3);
        
        if (renderTime > 2000) {
            console.error(`🚨 PERFORMANCE ALERT: Screen render took ${renderTimeSeconds}s (>${2.000}s threshold)`);
            console.warn('⚠️ Consider optimizing initialization sequence for faster rendering');
        } else {
            console.log(`⚡ Screen render performance: ${renderTimeSeconds}s (✅ under 2.000s threshold)`);
        }
        
        // Clear the timing variable
        delete window.renderStartTime;
    }
}

/**
 * Update token display without wallet connection
 */
function updateTokenDisplayWithoutWallet() {
    if (!poolData) return;
    
    // Ensure token symbols are available with fallbacks
    const tokenASymbol = poolData.tokenASymbol || poolData.token_a_ticker || 'Token A';
    const tokenBSymbol = poolData.tokenBSymbol || poolData.token_b_ticker || 'Token B';
    
    // Update token symbols and icons based on current swap direction
    if (swapDirection === 'AtoB') {
        document.getElementById('from-token-symbol').textContent = tokenASymbol;
        document.getElementById('to-token-symbol').textContent = tokenBSymbol;
        
        // Update token icons with images
        const tokenAMint = poolData.tokenAMint || poolData.token_a_mint;
        const tokenBMint = poolData.tokenBMint || poolData.token_b_mint;
        document.getElementById('from-token-icon').innerHTML = createTokenImageHTML(tokenAMint, tokenASymbol);
        document.getElementById('to-token-icon').innerHTML = createTokenImageHTML(tokenBMint, tokenBSymbol);
        
        // Show balance or placeholder message
        document.getElementById('from-token-balance').textContent = '0.000000';
        document.getElementById('to-token-balance').textContent = '0.000000';
    } else {
        document.getElementById('from-token-symbol').textContent = tokenBSymbol;
        document.getElementById('to-token-symbol').textContent = tokenASymbol;
        
        // Update token icons with images
        const tokenAMint = poolData.tokenAMint || poolData.token_a_mint;
        const tokenBMint = poolData.tokenBMint || poolData.token_b_mint;
        document.getElementById('from-token-icon').innerHTML = createTokenImageHTML(tokenBMint, tokenBSymbol);
        document.getElementById('to-token-icon').innerHTML = createTokenImageHTML(tokenAMint, tokenASymbol);
        
        // Show balance or placeholder message
        document.getElementById('from-token-balance').textContent = '0.000000';
        document.getElementById('to-token-balance').textContent = '0.000000';
    }
}

/**
 * Update swap interface with real user balances
 */
function updateSwapInterfaceWithRealBalances() {
    if (!poolData) return;
    
        const tokenA = userTokens.find(t => t.isTokenA);
        const tokenB = userTokens.find(t => !t.isTokenA);
        
    // Display balances based on swap direction
    if (swapDirection === 'AtoB') {
        // From = Token A, To = Token B
        if (tokenA) {
            const displayA = tokenA.balance / Math.pow(10, tokenA.decimals);
            document.getElementById('from-token-balance').textContent = displayA.toFixed(6);
    } else {
            document.getElementById('from-token-balance').textContent = '0.000000';
        }
        if (tokenB) {
            const displayB = tokenB.balance / Math.pow(10, tokenB.decimals);
            document.getElementById('to-token-balance').textContent = displayB.toFixed(6);
    } else {
            document.getElementById('to-token-balance').textContent = '0.000000';
        }
    } else {
        // From = Token B, To = Token A
        if (tokenB) {
            const displayB = tokenB.balance / Math.pow(10, tokenB.decimals);
            document.getElementById('from-token-balance').textContent = displayB.toFixed(6);
        } else {
            document.getElementById('from-token-balance').textContent = '0.000000';
        }
        if (tokenA) {
            const displayA = tokenA.balance / Math.pow(10, tokenA.decimals);
            document.getElementById('to-token-balance').textContent = displayA.toFixed(6);
        } else {
            document.getElementById('to-token-balance').textContent = '0.000000';
        }
    }
}

/**
 * Toggle swap direction
 */
function toggleSwapDirection() {
    swapDirection = swapDirection === 'AtoB' ? 'BtoA' : 'AtoB';
    
    // Add visual feedback
    const swapInterface = document.querySelector('.swap-interface');
    if (swapInterface) {
        swapInterface.style.transform = 'scale(0.98)';
        setTimeout(() => {
            swapInterface.style.transform = 'scale(1)';
        }, 100);
    }
    
    // Update token symbols and icons
    const tokenAMint = poolData.tokenAMint || poolData.token_a_mint;
    const tokenBMint = poolData.tokenBMint || poolData.token_b_mint;
    
    if (swapDirection === 'AtoB') {
        document.getElementById('from-token-symbol').textContent = poolData.tokenASymbol || poolData.token_a_ticker || 'Token A';
        document.getElementById('to-token-symbol').textContent = poolData.tokenBSymbol || poolData.token_b_ticker || 'Token B';
        document.getElementById('from-token-icon').innerHTML = createTokenImageHTML(tokenAMint, poolData.tokenASymbol);
        document.getElementById('to-token-icon').innerHTML = createTokenImageHTML(tokenBMint, poolData.tokenBSymbol);
    } else {
        document.getElementById('from-token-symbol').textContent = poolData.tokenBSymbol || poolData.token_b_ticker || 'Token B';
        document.getElementById('to-token-symbol').textContent = poolData.tokenASymbol || poolData.token_a_ticker || 'Token A';
        document.getElementById('from-token-icon').innerHTML = createTokenImageHTML(tokenBMint, poolData.tokenBSymbol);
        document.getElementById('to-token-icon').innerHTML = createTokenImageHTML(tokenAMint, poolData.tokenASymbol);
    }
    
    // Update balances if wallet connected
    if (isConnected && userTokens.length > 0) {
        updateSwapInterfaceWithRealBalances();
    }
    
    // Update exchange rate display
    updateExchangeRate();
    
    // Recalculate based on existing input
    const fromAmount = parseFloat(document.getElementById('from-amount').value);
    const toAmount = parseFloat(document.getElementById('to-amount').value);
    
    if (Number.isFinite(fromAmount) && fromAmount > 0) {
    calculateSwapOutputEnhanced();
    } else if (Number.isFinite(toAmount) && toAmount > 0) {
        calculateSwapInputFromOutput();
    } else {
        // Clear preview if none
        updateTransactionPreview(0, 0, false);
    }
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
        const aSym = poolData.tokenASymbol || poolData.token_a_ticker || 'TokenA';
        const bSym = poolData.tokenBSymbol || poolData.token_b_ticker || 'TokenB';
        console.log(`Exchange rate: 1 ${aSym} = ${rate.toFixed(8)} ${bSym}`);
    } else {
        // B→A: How many A tokens for 1 B token  
        const rate = ratioAActual / ratioBActual;
        const aSym = poolData.tokenASymbol || poolData.token_a_ticker || 'TokenA';
        const bSym = poolData.tokenBSymbol || poolData.token_b_ticker || 'TokenB';
        console.log(`Exchange rate: 1 ${bSym} = ${rate.toFixed(8)} ${aSym}`);
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
        
        // Simple conversion without dependencies
        const maxAmount = maxBasisPoints / Math.pow(10, fromToken.decimals);
        
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
    if (!poolData) {
        return;
    }
    
    // Use simple ratio from server if tokenPairRatio missing
    const ratioA = poolData.ratio_a_actual || poolData.ratioAActual;
    const ratioB = poolData.ratio_b_actual || poolData.ratioBActual;
    
    if (!tokenPairRatio && (typeof ratioA === 'number') && (typeof ratioB === 'number')) {
        tokenPairRatio = {
            ratioA, ratioB,
            tokenADecimals: poolData.ratio_a_decimal || poolData.ratioADecimal || 6,
            tokenBDecimals: poolData.ratio_b_decimal || poolData.ratioBDecimal || 6,
            SwapAToB: function(amountA) { return (amountA * this.ratioB) / this.ratioA; },
            SwapBToA: function(amountB) { return (amountB * this.ratioA) / this.ratioB; },
            ADisplayToBasisPoints: function(displayAmount) {
                return Math.floor(displayAmount * Math.pow(10, this.tokenADecimals));
            },
            BDisplayToBasisPoints: function(displayAmount) {
                return Math.floor(displayAmount * Math.pow(10, this.tokenBDecimals));
            },
            ExchangeDisplay: function() { const rate = this.ratioB / this.ratioA; return `1 A = ${rate.toFixed(8)} B`; }
        };
    }
    
    const fromAmount = parseFloat(document.getElementById('from-amount').value);
    if (isNaN(fromAmount) || fromAmount <= 0) {
        // Clear output preview if no valid input
        const toAmountInput = document.getElementById('to-amount');
        toAmountInput.value = '';
        document.getElementById('transaction-preview').style.display = 'none';
        return;
    }
    
    const outputAmount = swapDirection === 'AtoB'
        ? tokenPairRatio ? tokenPairRatio.SwapAToB(fromAmount) : (fromAmount * ratioB) / ratioA
        : tokenPairRatio ? tokenPairRatio.SwapBToA(fromAmount) : (fromAmount * ratioA) / ratioB;
    
    // Check for exact exchange requirement (no dust allowed)
    let hasDustIssue = false;
    const flags = interpretPoolFlags(poolData);
    if (flags.exactExchangeRequired && tokenPairRatio) {
        // Convert amounts to basis points to check for exact division
        const fromBasisPoints = swapDirection === 'AtoB'
            ? Math.floor(fromAmount * Math.pow(10, tokenPairRatio.tokenADecimals))
            : Math.floor(fromAmount * Math.pow(10, tokenPairRatio.tokenBDecimals));
        
        const ratioA = poolData.ratio_a_numerator || poolData.ratioANumerator || 10000000000;
        const ratioB = poolData.ratio_b_denominator || poolData.ratioBDenominator || 100000000;
        
        // Check if the swap would have remainder (dust)
        hasDustIssue = swapDirection === 'AtoB'
            ? (fromBasisPoints * ratioB) % ratioA !== 0
            : (fromBasisPoints * ratioA) % ratioB !== 0;
        
        if (hasDustIssue) {
            console.warn(`⚠️ Dust detected: ${fromBasisPoints} basis points would create remainder. Pool requires exact amounts.`);
        }
    }
    
    const toAmountInput = document.getElementById('to-amount');
    // Use proper decimals for output formatting
    const outputDecimals = swapDirection === 'AtoB' 
        ? (poolData.ratio_b_decimal || poolData.ratioBDecimal || 8)
        : (poolData.ratio_a_decimal || poolData.ratioADecimal || 6);
    toAmountInput.value = Number.isFinite(outputAmount) ? outputAmount.toFixed(outputDecimals) : '';
    
    // Check if user has sufficient balance (only if wallet is connected)
    let hasInsufficientBalance = false;
    if (isConnected && userTokens.length > 0) {
        const fromToken = swapDirection === 'AtoB' 
            ? userTokens.find(t => t.isTokenA)
            : userTokens.find(t => !t.isTokenA);
        
        if (fromToken) {
            const userBalance = fromToken.balance / Math.pow(10, fromToken.decimals);
            hasInsufficientBalance = fromAmount > userBalance;
        }
    }
    
    // Show preview with amounts - works even without wallet
    updateTransactionPreview(fromAmount, outputAmount, hasInsufficientBalance);
    
    // Update swap button state based on wallet connection, balance, and dust
    const swapBtn = document.getElementById('swap-btn');
    if (!isConnected) {
        swapBtn.disabled = false;
        swapBtn.textContent = '🔗 Connect Wallet to Swap';
        swapBtn.onclick = () => connectWallet();
    } else if (hasDustIssue) {
        swapBtn.disabled = true;
        swapBtn.textContent = '⚠️ Amount Creates Dust (Not Allowed)';
        showStatus('warning', '⚠️ This pool requires exact amounts only. Try a different amount.');
    } else if (hasInsufficientBalance) {
        swapBtn.disabled = true;
        swapBtn.textContent = '❌ Insufficient Balance';
    } else if (fromAmount > 0) {
        swapBtn.disabled = false;
        swapBtn.textContent = 'Execute Swap';
        swapBtn.onclick = () => executeSwap();
    } else {
        swapBtn.disabled = true;
        swapBtn.textContent = 'Enter Amount';
    }
}

/**
 * Update transaction preview
 */
function updateTransactionPreview(fromAmount, toAmount, hasInsufficientBalance = false) {
    if (!poolData) return;
    
    const fromSymbol = swapDirection === 'AtoB' 
        ? (poolData.tokenASymbol || poolData.token_a_ticker || 'Token A')
        : (poolData.tokenBSymbol || poolData.token_b_ticker || 'Token B');
    const toSymbol = swapDirection === 'AtoB' 
        ? (poolData.tokenBSymbol || poolData.token_b_ticker || 'Token B')
        : (poolData.tokenASymbol || poolData.token_a_ticker || 'Token A');
    
    // Use pool decimals for formatting
    const aDec = poolData.ratio_a_decimal || poolData.ratioADecimal || 6;
    const bDec = poolData.ratio_b_decimal || poolData.ratioBDecimal || 6;
    const fromDecimals = swapDirection === 'AtoB' ? aDec : bDec;
    const toDecimals = swapDirection === 'AtoB' ? bDec : aDec;
    
    const preview = document.getElementById('transaction-preview');
    if (preview) preview.style.display = 'block';
    
    const fromAmt = Number(fromAmount);
    const toAmt = Number(toAmount);
    
    if (!Number.isFinite(fromAmt) || fromAmt <= 0 || !Number.isFinite(toAmt) || toAmt <= 0) {
        // Show interface but with cleared values if invalid
        document.getElementById('preview-from-amount').textContent = `0 ${fromSymbol}`;
        document.getElementById('preview-to-amount').textContent = `0 ${toSymbol}`;
    } else {
        document.getElementById('preview-from-amount').textContent = `${formatTokenAmount(fromAmt, fromDecimals)} ${fromSymbol}`;
        document.getElementById('preview-to-amount').textContent = `${formatTokenAmount(toAmt, toDecimals)} ${toSymbol}`;
        const rate = toAmt / fromAmt;
        document.getElementById('preview-rate').textContent = `1 ${fromSymbol} = ${formatTokenAmount(rate, toDecimals)} ${toSymbol}`;
    }
    
    // Fee estimate with contract fee
    const networkFee = 0.00006; // Actual network fee (60,000 lamports = 12x base)
    const priorityFee = 150000 * 0.000001 / 1000000; // 150k CUs at 1 microlamport per CU
    const contractFee = (poolData.swap_contract_fee || 100000) / 1000000000; // Contract fee in SOL (default 100k lamports)
    const totalFee = networkFee + priorityFee + contractFee;
    document.getElementById('preview-fee').textContent = `~${formatTokenAmount(totalFee, 9)} SOL`;
    
    const warningElement = document.getElementById('preview-warning');
    if (warningElement) {
        warningElement.style.display = hasInsufficientBalance ? 'block' : 'none';
    }
    
    const swapBtn = document.getElementById('swap-btn');
    if (swapBtn) {
        if (hasInsufficientBalance) {
            swapBtn.disabled = true;
            swapBtn.textContent = 'Insufficient Balance';
            swapBtn.style.background = '#6b7280';
        } else {
            swapBtn.disabled = !isConnected;
            swapBtn.textContent = isConnected ? 'Execute Swap' : '🔗 Connect Wallet to Swap';
            swapBtn.style.background = isConnected ? '#10b981' : '#3b82f6';
        }
    }
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
    
    // Ensure SPL Token library is loaded before executing swap
    const splTokenReady = await ensureSPLTokenLibrary();
    if (!splTokenReady) {
        showStatus('error', '❌ Cannot execute swap without SPL Token library');
        return;
    }
    
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
        const fromSymbol = swapDirection === 'AtoB' 
            ? (poolData.tokenASymbol || poolData.token_a_ticker || 'Token A')
            : (poolData.tokenBSymbol || poolData.token_b_ticker || 'Token B');
        const toSymbol = swapDirection === 'AtoB' 
            ? (poolData.tokenBSymbol || poolData.token_b_ticker || 'Token B')
            : (poolData.tokenASymbol || poolData.token_a_ticker || 'Token A');
        
        console.log(`📊 Swapping ${fromAmount} ${fromSymbol} for ${toAmount} ${toSymbol}`);
        
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
        
        showStatus('info', '📝 Requesting wallet signature... (please check your wallet)');
        
        // Keep the blockhash for wallet to use in simulation
        // Comment out the blockhash deletion to prevent "Blockhash not found" errors
        // try { delete transaction.recentBlockhash; } catch (_) {}
        // try { delete transaction.lastValidBlockHeight; } catch (_) {}
        try { transaction.feePayer = wallet.publicKey; } catch (_) {}
        console.log('📝 Transaction ready for wallet with blockhash:', transaction.recentBlockhash);

        // Sign and send transaction with timeout
        let signatureResult;
        try {
            // Add a 30-second timeout for wallet interaction
            const walletTimeout = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Wallet signature timeout - please check your wallet')), 30000)
            );
            
            const walletPromise = wallet.signAndSendTransaction(transaction);
            
            signatureResult = await Promise.race([walletPromise, walletTimeout]);
            console.log('✅ Swap transaction sent:', signatureResult);
        } catch (walletError) {
            console.error('❌ Wallet error:', walletError);
            
            // Check if user rejected
            if (walletError.message?.includes('rejected') || 
                walletError.message?.includes('cancelled') || 
                walletError.message?.includes('denied')) {
                throw new Error('Transaction cancelled by user');
            }
            
            // Check for simulation errors
            if (walletError.message?.includes('simulation') || 
                walletError.message?.includes('Simulation failed')) {
                console.error('Simulation error details:', walletError);
                throw new Error(`Transaction simulation failed: ${walletError.message}`);
            }
            
            // Re-throw other errors
            throw walletError;
        }
        
        // Extract signature string from result
        const signature = signatureResult.signature || signatureResult;
        
        // Show countdown timer for confirmation (90 seconds max)
        let countdown = 90;
        const countdownInterval = setInterval(() => {
            countdown--;
            if (countdown > 0) {
                showStatus('info', `⏳ Confirming transaction... (${countdown}s remaining)`);
            } else {
                clearInterval(countdownInterval);
                showStatus('warning', '⚠️ Transaction confirmation taking longer than expected...');
            }
        }, 1000);
        
        showStatus('info', `⏳ Confirming transaction... (${countdown}s remaining)`);
        
        try {
            // Wait for confirmation with timeout
            const confirmationPromise = connection.confirmTransaction(signature, 'confirmed');
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Transaction confirmation timeout after 90 seconds')), 90000)
            );
            
            const confirmation = await Promise.race([confirmationPromise, timeoutPromise]);
            clearInterval(countdownInterval);
            
            if (confirmation.value?.err) {
                throw new Error(`Swap failed: ${JSON.stringify(confirmation.value.err)}`);
            }
        } catch (error) {
            clearInterval(countdownInterval);
            throw error;
        }
        
        console.log('✅ Swap completed successfully!');
        showStatus('success', `🎉 Swap completed! Transaction: ${signature.slice(0, 8)}...`);
        
        // Refresh user tokens after successful swap
        console.log('🔄 Refreshing token balances after swap...');
        await loadUserTokensForPool();
        
        // Update the interface to show new balances
        updateSwapInterfaceWithRealBalances();
        
        // Reset form
        document.getElementById('from-amount').value = '';
        document.getElementById('to-amount').value = '';
        document.getElementById('transaction-preview').style.display = 'none';
        
        // Schedule pool data refresh 3 seconds after swap completion
        setTimeout(async () => {
            try {
                console.log('🔄 Auto-refreshing pool data 3 seconds after swap completion...');
                const urlParams = new URLSearchParams(window.location.search);
                const poolAddress = urlParams.get('pool');
                if (poolAddress) {
                    await loadPoolDataFromServerOnly(poolAddress, true);
                    console.log('✅ Pool data auto-refreshed after swap');
                }
            } catch (error) {
                console.warn('⚠️ Failed to auto-refresh pool data after swap:', error);
            }
        }, 3000);
        
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
    
    // Convert amount to basis points
    const amountInBaseUnits = Math.floor(fromAmount * Math.pow(10, fromToken.decimals));
    console.log(`💰 Amount in basis points: ${amountInBaseUnits} (${fromAmount} display units with ${fromToken.decimals} decimals)`);
    
    // Get program ID
    const programIdString = window.CONFIG?.programId || window.TRADING_CONFIG?.programId || 'quXSYkeZ8ByTCtYY1J1uxQmE36UZ3LmNGgE3CYMFixD';
    console.log('🔑 Using program ID:', programIdString);
    const programId = new solanaWeb3.PublicKey(programIdString);
    
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
        
        if ((poolData.ratio_a_decimal !== undefined && poolData.ratio_b_decimal !== undefined) ||
            (poolData.ratioADecimal !== undefined && poolData.ratioBDecimal !== undefined)) {
            tokenADecimals = poolData.ratio_a_decimal || poolData.ratioADecimal;
            tokenBDecimals = poolData.ratio_b_decimal || poolData.ratioBDecimal;
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
        
        // Calculate expected output
        const fromAmountDisplay = amountInBaseUnits / Math.pow(10, inputDecimals);
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
    if (!poolData) return;
    
    const ratioA = poolData.ratio_a_actual || poolData.ratioAActual;
    const ratioB = poolData.ratio_b_actual || poolData.ratioBActual;
    if (!tokenPairRatio && (typeof ratioA === 'number') && (typeof ratioB === 'number')) {
        tokenPairRatio = {
            ratioA, ratioB,
            tokenADecimals: poolData.ratio_a_decimal || poolData.ratioADecimal || 6,
            tokenBDecimals: poolData.ratio_b_decimal || poolData.ratioBDecimal || 6,
            SwapAToB: function(amountA) { return (amountA * this.ratioB) / this.ratioA; },
            SwapBToA: function(amountB) { return (amountB * this.ratioA) / this.ratioB; },
            ADisplayToBasisPoints: function(displayAmount) {
                return Math.floor(displayAmount * Math.pow(10, this.tokenADecimals));
            },
            BDisplayToBasisPoints: function(displayAmount) {
                return Math.floor(displayAmount * Math.pow(10, this.tokenBDecimals));
            }
        };
    }
    
    const desiredOut = parseFloat(document.getElementById('to-amount').value);
    if (isNaN(desiredOut) || desiredOut <= 0) {
        document.getElementById('from-amount').value = '';
        document.getElementById('transaction-preview').style.display = 'none';
        return;
    }
    
    const inputAmount = swapDirection === 'AtoB'
        ? (desiredOut * (tokenPairRatio ? tokenPairRatio.ratioA : ratioA)) / (tokenPairRatio ? tokenPairRatio.ratioB : ratioB)
        : (desiredOut * (tokenPairRatio ? tokenPairRatio.ratioB : ratioB)) / (tokenPairRatio ? tokenPairRatio.ratioA : ratioA);
    
    const fromAmountInput = document.getElementById('from-amount');
    // Use proper decimals for input formatting
    const inputDecimals = swapDirection === 'AtoB'
        ? (poolData.ratio_a_decimal || poolData.ratioADecimal || 6)
        : (poolData.ratio_b_decimal || poolData.ratioBDecimal || 8);
    fromAmountInput.value = Number.isFinite(inputAmount) ? inputAmount.toFixed(inputDecimals) : '';
    
    // Check if user has sufficient balance (only if wallet is connected)
    let hasInsufficientBalance = false;
    if (isConnected && userTokens.length > 0) {
        const fromToken = swapDirection === 'AtoB' 
            ? userTokens.find(t => t.isTokenA)
            : userTokens.find(t => !t.isTokenA);
        
        if (fromToken) {
            const userBalance = fromToken.balance / Math.pow(10, fromToken.decimals);
            hasInsufficientBalance = inputAmount > userBalance;
        }
    }
    
    // Show preview with amounts - works even without wallet
    updateTransactionPreview(inputAmount, desiredOut, hasInsufficientBalance);
    
    // Check for exact exchange requirement (no dust allowed)
    let hasDustIssue = false;
    const flags = interpretPoolFlags(poolData);
    if (flags.exactExchangeRequired && tokenPairRatio) {
        const fromBasisPoints = swapDirection === 'AtoB'
            ? Math.floor(inputAmount * Math.pow(10, tokenPairRatio.tokenADecimals))
            : Math.floor(inputAmount * Math.pow(10, tokenPairRatio.tokenBDecimals));
        
        const ratioA = poolData.ratio_a_numerator || poolData.ratioANumerator || 10000000000;
        const ratioB = poolData.ratio_b_denominator || poolData.ratioBDenominator || 100000000;
        
        hasDustIssue = swapDirection === 'AtoB'
            ? (fromBasisPoints * ratioB) % ratioA !== 0
            : (fromBasisPoints * ratioA) % ratioB !== 0;
    }
    
    // Update swap button state based on wallet connection, balance, and dust
    const swapBtn = document.getElementById('swap-btn');
    if (!isConnected) {
        swapBtn.disabled = false;
        swapBtn.textContent = '🔗 Connect Wallet to Swap';
        swapBtn.onclick = () => connectWallet();
    } else if (hasDustIssue) {
        swapBtn.disabled = true;
        swapBtn.textContent = '⚠️ Amount Creates Dust (Not Allowed)';
        showStatus('warning', '⚠️ This pool requires exact amounts only. Try a different amount.');
    } else if (hasInsufficientBalance) {
        swapBtn.disabled = true;
        swapBtn.textContent = '❌ Insufficient Balance';
    } else if (inputAmount > 0) {
        swapBtn.disabled = false;
        swapBtn.textContent = 'Execute Swap';
        swapBtn.onclick = () => executeSwap();
    } else {
        swapBtn.disabled = true;
        swapBtn.textContent = 'Enter Amount';
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

// Removed: Pool status monitoring functions - using server-only data

// Removed: checkPoolStatusUpdate function - using server-only data

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
    
    const flags = interpretPoolFlags(poolData);
    
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
    
    const flags = interpretPoolFlags(poolData);
    
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
        
        console.log('🔄 Manually refreshing pool status and balances...');
        showStatus('info', '🔄 Refreshing pool data and balances...');
        
        // Get pool address
        const urlParams = new URLSearchParams(window.location.search);
        const poolAddress = urlParams.get('pool');
        
        if (poolAddress) {
            // Reload pool data from server with refresh parameter
            await loadPoolDataFromServerOnly(poolAddress, true);
        }
        
        // Refresh wallet balances if connected
        if (isConnected) {
            await checkWalletBalance();
            await loadUserTokensForPool();
        }
        
        showStatus('success', '✅ Pool status and balances refreshed');
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
// Render-first bootstrap: instant localStorage UI, then background init
let SOLANA_RPC_ALLOWED_AT = 0;

// Removed: instantRenderFromCacheOnly function - using server-only data

// Removed: Instant calculation functions - using server-only data with proper initialization

function loadScriptDeferred(src) {
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = (e) => reject(e);
        document.body.appendChild(s);
    });
}

// Removed: deferredLoadHeavyLibraries function - not needed for server-only rendering
// Removed: fetchFromServerCacheOnly and triggerSolanaRefresh functions - using server-only data

async function setupBasicUI() {
    console.log(`[${new Date().toISOString()}] ⚡ Setting up basic UI (server-only mode)`);
    
    try {
        const urlParams = new URLSearchParams(window.location.search);
        poolAddress = urlParams.get('pool') || sessionStorage.getItem('selectedPoolAddress');
        if (poolAddress) { 
            sessionStorage.setItem('selectedPoolAddress', poolAddress); 
        }

        // Show loading state
        const fromTokenSymbol = document.getElementById('from-token-symbol');
        const toTokenSymbol = document.getElementById('to-token-symbol');
        if (fromTokenSymbol) fromTokenSymbol.textContent = 'Loading...';
        if (toTokenSymbol) toTokenSymbol.textContent = 'Loading...';
        
        const previewRate = document.getElementById('preview-rate');
        if (previewRate) previewRate.textContent = 'Loading exchange rate...';
        
        const cacheSource = document.getElementById('cache-source');
        if (cacheSource) cacheSource.textContent = '📡 Loading from server...';
        
        // Initialize wallet button state
        updateWalletButton();
        
        console.log(`⚡ Basic UI setup completed`);
        
    } catch (error) {
        console.warn('⚠️ Error during basic UI setup:', error);
    }
}

function bootstrapRenderFirst() {
    // Start timing for render performance measurement
    window.renderStartTime = performance.now();
    console.log(`[${new Date().toISOString()}] 🚀 Bootstrap: Starting immediate server-only render`);
    
    // Setup basic UI and immediately start loading pool data - NO delays, NO library loading
    setupBasicUI();
    initializeSwapPage();
}

document.addEventListener('DOMContentLoaded', bootstrapRenderFirst);

// Removed: All monitoring cleanup logic - using server-only data

console.log('🔄 Enhanced Swap JavaScript loaded successfully'); 