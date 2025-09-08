// Liquidity Management - JavaScript Logic
// Handles adding liquidity to specific pools
// Configuration is loaded from config.js

// Global state
let connection = null;
let wallet = null;
let isConnected = false;
let poolData = null;
let poolAddress = null;
let userTokens = [];
let selectedToken = null;

/**
 * Initialize section visibility based on radio button state
 */
function initializeSectionVisibility() {
    console.log('🔄 Initializing section visibility...');
    
    // Check which radio button is selected (default should be "add")
    const addRadio = document.querySelector('input[name="operation"][value="add"]');
    const removeRadio = document.querySelector('input[name="operation"][value="remove"]');
    const addSection = document.getElementById('add-liquidity-section');
    const removeSection = document.getElementById('remove-liquidity-section');
    
    if (addRadio && addRadio.checked) {
        // Show add section, hide remove section
        if (addSection) addSection.style.display = 'block';
        if (removeSection) removeSection.style.display = 'none';
        console.log('✅ Add liquidity section visible by default');
    } else if (removeRadio && removeRadio.checked) {
        // Show remove section, hide add section
        if (addSection) addSection.style.display = 'none';
        if (removeSection) removeSection.style.display = 'block';
        console.log('✅ Remove liquidity section visible by default');
    } else {
        // Default fallback: show add section
        if (addSection) addSection.style.display = 'block';
        if (removeSection) removeSection.style.display = 'none';
        console.log('✅ Default: Add liquidity section visible');
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Liquidity page initializing...');
    showStatus('info', '🔄 Loading liquidity page...');
    
    // Initialize section visibility based on default radio button state
    initializeSectionVisibility();
    
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
});

/**
 * Initialize the application
 */
async function initializeApp() {
    try {
        // Initialize Solana connection
        // Initialize Solana connection with WebSocket configuration
        console.log('🔌 Connecting to Solana RPC...');
        const connectionConfig = {
            commitment: CONFIG.commitment,
            disableRetryOnRateLimit: CONFIG.disableRetryOnRateLimit || true
        };
        
        if (CONFIG.wsUrl) {
            console.log('📡 Using WebSocket endpoint:', CONFIG.wsUrl);
            connection = new solanaWeb3.Connection(CONFIG.rpcUrl, connectionConfig, CONFIG.wsUrl);
        } else {
            console.log('📡 Using HTTP polling (WebSocket disabled)');
            connectionConfig.wsEndpoint = false; // Explicitly disable WebSocket
            connection = new solanaWeb3.Connection(CONFIG.rpcUrl, connectionConfig);
        }
        
        // Check if SPL Token library is available
        if (!window.splToken || !window.SPL_TOKEN_LOADED) {
            console.error('❌ SPL Token library not loaded properly');
            showStatus('error', 'SPL Token library not loaded. Please refresh the page.');
            return;
        }
        
        console.log('✅ SPL Token library ready');
        
        // Check if Backpack is installed
        if (!window.backpack) {
            showStatus('error', 'Backpack wallet not detected. Please install Backpack wallet extension.');
            return;
        }
        
        // Get pool address from URL params first, then sessionStorage as fallback
        const urlParams = new URLSearchParams(window.location.search);
        poolAddress = urlParams.get('pool') || sessionStorage.getItem('selectedPoolAddress');
        
        if (!poolAddress) {
            showStatus('error', 'No pool selected. Please select a pool from the dashboard or provide a pool ID in the URL (?pool=POOL_ID).');
            return;
        }
        
        console.log('🎯 Loading pool for liquidity:', poolAddress);
        console.log('📋 Pool source:', urlParams.get('pool') ? 'URL parameter' : 'SessionStorage');
        
        // Store pool address in sessionStorage for potential navigation
        sessionStorage.setItem('selectedPoolAddress', poolAddress);
        
        // Load pool information
        await loadPoolInformation();
        
        // Check if already connected
        if (window.backpack.isConnected) {
            await handleWalletConnected();
        }
        
        console.log('✅ Liquidity page initialized');
        clearStatus();
        
    } catch (error) {
        console.error('❌ Failed to initialize:', error);
        showStatus('error', 'Failed to initialize application: ' + error.message);
    }
}

/**
 * Load pool information from the blockchain
 */
async function loadPoolInformation() {
    try {
        console.log('🔍 Loading pool information for:', poolAddress);
        showStatus('info', 'Loading pool information...');
        
        // Initialize centralized data service if not already done
        if (!window.TradingDataService.connection) {
            await window.TradingDataService.initialize(window.TRADING_CONFIG, connection);
        }
        
        // Get pool data using centralized service (RPC only)
        poolData = await window.TradingDataService.getPool(poolAddress, 'rpc');
        
        if (poolData) {
            console.log(`✅ Pool loaded via TradingDataService (source: ${poolData.source || poolData.dataSource || 'unknown'})`);
            
            // 🔍 DEVELOPER DEBUGGING: Log complete pool data to console
            console.group('🔍 POOL DATA FOR DEVELOPERS');
            console.log('📊 Complete Pool State:', poolData);
            console.log('🏊‍♂️ Pool Address:', poolAddress);
            console.log('🪙 Token A Mint:', poolData.tokenAMint || poolData.token_a_mint);
            console.log('🪙 Token B Mint:', poolData.tokenBMint || poolData.token_b_mint);
            console.log('⚖️ Ratio A Numerator:', poolData.ratioANumerator || poolData.ratio_a_numerator);
            console.log('⚖️ Ratio B Denominator:', poolData.ratioBDenominator || poolData.ratio_b_denominator);
            console.log('💧 Token A Liquidity:', poolData.tokenALiquidity || poolData.total_token_a_liquidity);
            console.log('💧 Token B Liquidity:', poolData.tokenBLiquidity || poolData.total_token_b_liquidity);
            console.log('🚩 Pool Flags:', poolData.flags);
            console.log('🔒 Pool Owner:', poolData.owner);
            console.groupEnd();
            
            // Try to get token symbols from sessionStorage
            const tokenSymbols = await getTokenSymbols(poolData.tokenAMint || poolData.token_a_mint, 
                                                       poolData.tokenBMint || poolData.token_b_mint);
            poolData.tokenASymbol = tokenSymbols.tokenA;
            poolData.tokenBSymbol = tokenSymbols.tokenB;
            
            // Update UI with pool information
            console.log('🔄 About to update pool display...');
            await updatePoolDisplay();
            console.log('✅ Pool display updated successfully');
            
            console.log('✅ Pool information loaded successfully');
        } else {
            showStatus('error', 'Pool not found. Please check the pool address.');
            return;
        }
    
    // 🔍 DEBUG: Check the actual ratio values
    console.log('🔍 RATIO DEBUG:', {
        ratioANumerator: poolData.ratioANumerator,
        ratio_a_numerator: poolData.ratio_a_numerator, 
        ratioBDenominator: poolData.ratioBDenominator,
        ratio_b_denominator: poolData.ratio_b_denominator,
        ratioADecimal: poolData.ratioADecimal,
        ratioBDecimal: poolData.ratioBDecimal,
        ratioAActual: poolData.ratioAActual,
        ratioBActual: poolData.ratioBActual,
        tokenASymbol: poolData.tokenASymbol,
        tokenBSymbol: poolData.tokenBSymbol,
        flags: poolData.flags
    });
        
    } catch (error) {
        console.error('❌ Error loading pool information:', error);
        showStatus('error', 'Failed to load pool information: ' + error.message);
    }
}

// parsePoolState function removed - now using centralized TradingDataService.parsePoolState()

/**
 * Try to get token symbols from Metaplex metadata, or use mint prefix as fallback
 */
async function getTokenSymbols(tokenAMint, tokenBMint) {
    try {
        console.log(`🔍 Looking up symbols for tokens: ${tokenAMint} and ${tokenBMint}`);
        
        // Get token A symbol
        const tokenASymbol = await getTokenSymbol(tokenAMint, 'A');
        
        // Get token B symbol  
        const tokenBSymbol = await getTokenSymbol(tokenBMint, 'B');
        
        console.log(`✅ Token symbols found: ${tokenASymbol}/${tokenBSymbol}`);
        
        return {
            tokenA: tokenASymbol,
            tokenB: tokenBSymbol
        };
    } catch (error) {
        console.warn('❌ Error getting token symbols:', error);
        return {
            tokenA: `${tokenAMint.slice(0, 4)}`,
            tokenB: `${tokenBMint.slice(0, 4)}`
        };
    }
}

/**
 * Get token symbol from Metaplex, or default to first 4 chars of mint
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
        const defaultSymbol = `${tokenMint.slice(0, 4)}`;
        console.log(`⚠️ Using default symbol for token ${tokenLabel}: ${defaultSymbol}`);
        return defaultSymbol;
        
    } catch (error) {
        console.warn(`❌ Error getting symbol for token ${tokenLabel}:`, error);
        return `${tokenMint.slice(0, 4)}`;
    }
}

/**
 * Phase 2.1: Update pool display in UI with Phase 1.3 enhancements
 */
async function updatePoolDisplay() {
    console.log('🔄 updatePoolDisplay() called with poolData:', poolData ? 'exists' : 'null');
    if (!poolData) return;
    
    const poolLoading = document.getElementById('pool-loading');
    const poolDetails = document.getElementById('pool-details');
    
    // Hide loading, show details
    poolLoading.style.display = 'none';
    poolDetails.style.display = 'grid';
    
    // ✅ CENTRALIZED: Use centralized display functions for consistency
    console.log('🔧 LIQUIDITY: Using centralized display functions...');
    
    const displayInfo = window.TokenDisplayUtils?.getCentralizedDisplayInfo(poolData);
    
    if (!displayInfo) {
        console.error('❌ Failed to get centralized display info');
        showStatus('error', 'Failed to load pool information. Please refresh the page.');
        return;
    }
    
    // Get token decimals for liquidity formatting
    const tokenDecimals = {
        tokenADecimals: displayInfo.tokenADecimals,
        tokenBDecimals: displayInfo.tokenBDecimals
    };
    
    // Build the full display object with proper liquidity formatting
    const getFormattedLiquidity = (rawAmount, isTokenA) => {
        if (tokenDecimals) {
            const decimals = isTokenA ? tokenDecimals.tokenADecimals : tokenDecimals.tokenBDecimals;
            return window.TokenDisplayUtils.formatLiquidityAmount(rawAmount, decimals);
        }
        return window.TokenDisplayUtils.formatLargeNumber(rawAmount);
    };
    
    const flags = window.TokenDisplayUtils.interpretPoolFlags(poolData);
    
    const display = {
        baseToken: displayInfo.tokenASymbol,
        quoteToken: displayInfo.tokenBSymbol,
        displayPair: displayInfo.pairName,
        rateText: displayInfo.ratioText,
        exchangeRate: displayInfo.exchangeRate,
        baseLiquidity: getFormattedLiquidity(poolData.tokenALiquidity || poolData.total_token_a_liquidity || 0, true),
        quoteLiquidity: getFormattedLiquidity(poolData.tokenBLiquidity || poolData.total_token_b_liquidity || 0, false),
        isReversed: false, // Always show TokenA/TokenB order
        isOneToManyRatio: flags.oneToManyRatio
    };
    
    console.log('🔧 LIQUIDITY CORRECTED:', display);
    
    // 🔍 DEBUG: Check mint addresses for lexicographic ordering
    console.log('🔍 MINT ADDRESS DEBUG:', {
        tokenAMint: poolData.tokenAMint || poolData.token_a_mint,
        tokenBMint: poolData.tokenBMint || poolData.token_b_mint,
        tokenASymbol: poolData.tokenASymbol,
        tokenBSymbol: poolData.tokenBSymbol,
        lexicographicOrder: (poolData.tokenAMint || poolData.token_a_mint) < (poolData.tokenBMint || poolData.token_b_mint) ? 'TokenA < TokenB' : 'TokenB < TokenA'
    });
    
    // Generate pool flags section
    const flagsSection = generatePoolFlagsDisplay(flags, poolData);
    
    poolDetails.innerHTML = `
        <div class="pool-metric">
            <div class="metric-label">Pool Pair</div>
            <div class="metric-value">${display.displayPair} ${display.isOneToManyRatio ? '<span style="background: #3b82f6; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; margin-left: 8px;">🎯 1:Many</span>' : ''}</div>
        </div>
        
        <div class="pool-metric">
            <div class="metric-label">Exchange Rate</div>
            <div class="metric-value">${display.rateText}</div>
        </div>
        
        <div class="pool-metric">
            <div class="metric-label">${display.baseToken} Liquidity</div>
            <div class="metric-value">${display.baseLiquidity}</div>
        </div>
        
        <div class="pool-metric">
            <div class="metric-label">${display.quoteToken} Liquidity</div>
            <div class="metric-value">${display.quoteLiquidity}</div>
        </div>
        
        <div class="pool-metric">
            <div class="metric-label">Pool Status</div>
            <div class="metric-value">${flags.liquidityPaused ? '⏸️ Liquidity Paused' : flags.swapsPaused ? '🚫 Swaps Paused' : '✅ Active'}</div>
        </div>
        
        <div class="pool-metric">
            <div class="metric-label">Pool Address</div>
            <div class="metric-value address-container">
                <span class="address-text">${window.CopyUtils?.formatAddressForDisplay(poolAddress) || poolAddress.slice(0, 8) + '...'}</span>
                ${window.CopyUtils ? window.CopyUtils.createCopyButton(poolAddress, '📋').outerHTML : ''}
            </div>
        </div>
        
        ${flagsSection}
    `;
    
    // Phase 2.1: Add expandable Pool State display section
    addExpandablePoolStateDisplay();
}

/**
 * Connect to Backpack wallet
 */
async function connectWallet() {
    try {
        if (!window.backpack) {
            showStatus('error', 'Backpack wallet not installed. Please install the Backpack browser extension.');
            return;
        }
        
        showStatus('info', 'Connecting to Backpack wallet...');
        
        const response = await window.backpack.connect();
        await handleWalletConnected();
        
        console.log('✅ Wallet connected:', response.publicKey.toString());
    } catch (error) {
        console.error('❌ Failed to connect wallet:', error);
        showStatus('error', 'Failed to connect wallet: ' + error.message);
    }
}

/**
 * Handle successful wallet connection
 */
async function handleWalletConnected() {
    try {
        wallet = window.backpack;
        isConnected = true;
        
        const publicKey = wallet.publicKey.toString();
        
        // Update UI
        document.getElementById('wallet-info').style.display = 'flex';
        document.getElementById('wallet-disconnected').style.display = 'none';
        document.getElementById('wallet-address').textContent = publicKey;
        document.getElementById('connect-wallet-btn').textContent = 'Disconnect';
        document.getElementById('connect-wallet-btn').onclick = disconnectWallet;
        
        showStatus('success', `✅ Connected with Backpack wallet: ${publicKey.slice(0, 20)}...`);
        
        // Load user tokens for the pool
        await loadUserTokensForPool();
        
    } catch (error) {
        console.error('❌ Error handling wallet connection:', error);
        showStatus('error', 'Error handling wallet connection: ' + error.message);
    }
}

/**
 * Disconnect wallet
 */
async function disconnectWallet() {
    try {
        if (window.backpack) {
            await window.backpack.disconnect();
        }
        
        // Reset state
        wallet = null;
        isConnected = false;
        userTokens = [];
        selectedToken = null;
        
        // Update UI
        document.getElementById('wallet-info').style.display = 'none';
        document.getElementById('wallet-disconnected').style.display = 'flex';
        document.getElementById('connect-wallet-btn').textContent = 'Connect Backpack Wallet';
        document.getElementById('connect-wallet-btn').onclick = connectWallet;
        
        // Reset token selection
        resetTokenSelection();
        
        showStatus('info', 'Wallet disconnected');
        
    } catch (error) {
        console.error('❌ Error disconnecting wallet:', error);
    }
}

/**
 * Load user's tokens that match the pool tokens
 */
async function loadUserTokensForPool() {
    try {
        if (!poolData || !isConnected) return;
        
        showStatus('info', '🔍 Loading your pool tokens...');
        
        // Get all token accounts for the user
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
            wallet.publicKey,
            { programId: window.splToken.TOKEN_PROGRAM_ID }
        );
        
        console.log(`Found ${tokenAccounts.value.length} token accounts`);
        
        userTokens = [];
        
        for (const tokenAccount of tokenAccounts.value) {
            const accountInfo = tokenAccount.account.data.parsed.info;
            const mintAddress = accountInfo.mint;
            
            // Only include tokens that are part of this pool
            if (mintAddress === poolData.tokenAMint || mintAddress === poolData.tokenBMint) {
                const balance = parseInt(accountInfo.tokenAmount.amount) || 0;
                
                // Determine which token this is
                const isTokenA = mintAddress === poolData.tokenAMint;
                const symbol = isTokenA ? poolData.tokenASymbol : poolData.tokenBSymbol;
                
                // Validate that we have the decimals from the blockchain
                if (accountInfo.tokenAmount.decimals === undefined || accountInfo.tokenAmount.decimals === null) {
                    console.error(`❌ Token decimals not found for ${mintAddress}`);
                    showStatus('error', `Cannot determine decimals for token ${symbol}. This is required for safe transactions.`);
                    return; // Stop loading tokens if we can't get decimals
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
        
        console.log(`✅ Found ${userTokens.length} pool tokens in wallet`);
        
        // Update token selection UI
        updateTokenSelection();
        
        // Always update token selection regardless of balance
        // Status messages will be handled by individual operations based on actual balances
        clearStatus();
        
    } catch (error) {
        console.error('❌ Error loading user tokens:', error);
        showStatus('error', 'Failed to load your tokens: ' + error.message);
    }
}

/**
 * Update token selection UI
 */
function updateTokenSelection() {
    const tokenLoading = document.getElementById('token-loading');
    const tokenChoice = document.getElementById('token-choice');
    
    if (!poolData) {
        tokenLoading.style.display = 'block';
        tokenChoice.style.display = 'none';
        tokenLoading.innerHTML = `
            <h3>📭 Pool data not loaded</h3>
            <p>Please wait for pool information to load.</p>
        `;
        return;
    }
    
    tokenLoading.style.display = 'none';
    tokenChoice.style.display = 'grid';
    tokenChoice.innerHTML = '';
    
    // Always show both pool tokens, regardless of whether user owns them
    const poolTokens = [
        {
            mint: poolData.tokenAMint || poolData.token_a_mint,
            symbol: poolData.tokenASymbol,
            decimals: poolData.ratioADecimal !== undefined ? poolData.ratioADecimal : 
                     poolData.tokenDecimals?.tokenADecimals !== undefined ? poolData.tokenDecimals.tokenADecimals : 6,
            isTokenA: true
        },
        {
            mint: poolData.tokenBMint || poolData.token_b_mint,
            symbol: poolData.tokenBSymbol,
            decimals: poolData.ratioBDecimal !== undefined ? poolData.ratioBDecimal :
                     poolData.tokenDecimals?.tokenBDecimals !== undefined ? poolData.tokenDecimals.tokenBDecimals : 6,
            isTokenA: false
        }
    ];
    
    poolTokens.forEach((poolToken, index) => {
        // Find user's balance for this token (if any)
        const userToken = userTokens.find(t => t.mint === poolToken.mint);
        const balance = userToken ? userToken.balance : 0;
        const tokenAccount = userToken ? userToken.tokenAccount : null;
        
        // Convert balance from basis points to display units
        const displayBalance = balance > 0 ? 
            window.TokenDisplayUtils.basisPointsToDisplay(balance, poolToken.decimals) : 0;
        
        // 🔧 UX IMPROVEMENT: Round very close numbers to whole numbers for better display
        let finalDisplayBalance = displayBalance;
        if (displayBalance > 0 && Math.abs(displayBalance - Math.round(displayBalance)) < 0.00001) {
            finalDisplayBalance = Math.round(displayBalance);
        }
        
        const tokenOption = document.createElement('div');
        tokenOption.className = `token-option ${balance === 0 ? 'zero-balance' : ''}`;
        
        // Create token object for selection
        const tokenForSelection = {
            mint: poolToken.mint,
            symbol: poolToken.symbol,
            balance: balance,
            decimals: poolToken.decimals,
            tokenAccount: tokenAccount,
            isTokenA: poolToken.isTokenA
        };
        
        tokenOption.onclick = () => selectToken(tokenForSelection);
        
        const balanceText = balance === 0 ? '0' : finalDisplayBalance.toLocaleString();
        const balanceColor = balance === 0 ? '#999' : '#333';
        
        tokenOption.innerHTML = `
            <div class="token-symbol">${poolToken.symbol}</div>
            <div class="token-balance" style="color: ${balanceColor};">Balance: ${balanceText}</div>
        `;
        
        tokenChoice.appendChild(tokenOption);
        
        // Auto-select first token (Token A) by default
        if (index === 0) {
            setTimeout(() => selectToken(tokenForSelection), 100);
        }
    });
    
    console.log(`✅ Showing ${poolTokens.length} pool tokens (regardless of user balance)`);
}

/**
 * Select a token to add liquidity for
 */
function selectToken(token) {
    selectedToken = token;
    
    // Update UI selection
    const tokenOptions = document.querySelectorAll('.token-option');
    tokenOptions.forEach(option => option.classList.remove('selected'));
    
    // Find and highlight the selected option
    tokenOptions.forEach(option => {
        if (option.querySelector('.token-symbol').textContent === token.symbol) {
            option.classList.add('selected');
        }
    });
    
    // Update amount section - convert balance from basis points to display units
    const displayBalance = window.TokenDisplayUtils.basisPointsToDisplay(token.balance, token.decimals);
    
    // 🔧 UX IMPROVEMENT: Round very close numbers to whole numbers for better display
    let finalDisplayBalance = displayBalance;
    if (Math.abs(displayBalance - Math.round(displayBalance)) < 0.00001) {
        finalDisplayBalance = Math.round(displayBalance);
    }
    
    document.getElementById('selected-token-name').textContent = token.symbol;
    document.getElementById('available-balance').textContent = finalDisplayBalance.toLocaleString();
    document.getElementById('available-token-symbol').textContent = token.symbol;
    
    // Show amount section and button
    document.getElementById('add-liquidity-section').style.display = 'block';
    document.getElementById('add-liquidity-btn').style.display = 'block';
    
    // Update input step based on token decimals
    const amountInput = document.getElementById('add-liquidity-amount');
    const step = token.decimals === 0 ? '1' : `0.${'0'.repeat(token.decimals - 1)}1`;
    amountInput.step = step;
    console.log(`🔧 Set input step to: ${step} for ${token.symbol} (decimals: ${token.decimals})`);
    
    // Reset amount input
    amountInput.value = '';
    updateAddButton();
    
    showStatus('success', `Selected ${token.symbol} for liquidity addition`);
    
    console.log('🎯 Selected token:', token);
}

/**
 * Reset token selection
 */
function resetTokenSelection() {
    const tokenLoading = document.getElementById('token-loading');
    const tokenChoice = document.getElementById('token-choice');
    
    tokenLoading.style.display = 'block';
    tokenChoice.style.display = 'none';
    tokenLoading.innerHTML = `
        <h3>🔍 Loading pool tokens...</h3>
        <p>Please connect your wallet and load pool information</p>
    `;
    
    // Only hide sections if no token is selected, but maintain radio button state
    const addRadio = document.querySelector('input[name="operation"][value="add"]');
    const removeRadio = document.querySelector('input[name="operation"][value="remove"]');
    
    if (addRadio && addRadio.checked) {
        // Keep add section visible if add radio is selected
        document.getElementById('add-liquidity-section').style.display = 'block';
        document.getElementById('remove-liquidity-section').style.display = 'none';
    } else if (removeRadio && removeRadio.checked) {
        // Keep remove section visible if remove radio is selected
        document.getElementById('add-liquidity-section').style.display = 'none';
        document.getElementById('remove-liquidity-section').style.display = 'block';
    } else {
        // Default to add section visible
        document.getElementById('add-liquidity-section').style.display = 'block';
        document.getElementById('remove-liquidity-section').style.display = 'none';
    }
    
    selectedToken = null;
}

/**
 * Update add liquidity button state
 */
function updateAddButton() {
    const addBtn = document.getElementById('add-liquidity-btn');
    const amountInput = document.getElementById('add-liquidity-amount');
    
    const amount = parseFloat(amountInput.value) || 0;
    console.log('🔍 Button update - amount:', amount, 'selectedToken:', selectedToken?.symbol);
    const hasValidAmount = amount > 0;
    
    // Convert human-readable amount to raw units for comparison
    const decimals = selectedToken?.decimals !== undefined ? selectedToken.decimals : 6;
    const amountInRawUnits = amount * Math.pow(10, decimals);
    if (selectedToken && amount > 0) {
        console.log(`🔍 Button balance check: ${amountInRawUnits} (amount) vs ${selectedToken.balance} (balance)`);
        console.log(`🔍 Button comparison result: ${amountInRawUnits <= selectedToken.balance}`);
    }
    const hasBalance = selectedToken && amountInRawUnits <= selectedToken.balance;
    
    const canAdd = isConnected && selectedToken && hasValidAmount && hasBalance;
    
    addBtn.disabled = !canAdd;
    
    if (!hasValidAmount) {
        addBtn.textContent = '💧 Enter Amount';
    } else if (!hasBalance) {
        addBtn.textContent = '❌ Insufficient Balance';
    } else if (canAdd) {
        addBtn.textContent = `💧 Add ${amount} ${selectedToken.symbol}`;
    } else {
        addBtn.textContent = '💧 Add Liquidity';
    }
}

/**
 * Add liquidity to the pool
 */
async function addLiquidity() {
    console.log('🔍 Add Liquidity function called');
    console.log('🔍 selectedToken:', selectedToken);
    console.log('🔍 isConnected:', isConnected);
    
    if (!selectedToken || !isConnected) {
        showStatus('error', 'Please connect wallet and select a token first');
        return;
    }
    
    const amount = parseFloat(document.getElementById('add-liquidity-amount').value) || 0;
    if (amount <= 0) {
        showStatus('error', 'Please enter a valid amount');
        return;
    }
    
    // Convert human-readable amount to raw units for comparison
    const decimals = selectedToken.decimals !== undefined ? selectedToken.decimals : 6;
    console.log(`🔍 Debug conversion: amount=${amount}, decimals=${selectedToken.decimals}, calculated decimals=${decimals}, Math.pow(10, ${decimals})=${Math.pow(10, decimals)}`);
    const amountInRawUnits = amount * Math.pow(10, decimals);
    console.log(`🔍 Balance comparison: ${amountInRawUnits} (amount) vs ${selectedToken.balance} (balance)`);
    console.log(`🔍 Amount type: ${typeof amountInRawUnits}, Balance type: ${typeof selectedToken.balance}`);
    console.log(`🔍 Comparison result: ${amountInRawUnits > selectedToken.balance}`);
    
    if (amountInRawUnits > selectedToken.balance) {
        showStatus('error', `Insufficient balance. Need: ${amountInRawUnits}, Have: ${selectedToken.balance}`);
        return;
    }
    
    const addBtn = document.getElementById('add-liquidity-btn');
    const originalText = addBtn.textContent;
    // Make computeUnits available to both try/catch blocks
    let computeUnits = 310_000; // default for this flow; can be tweaked
    
    try {
        addBtn.disabled = true;
        addBtn.textContent = '🔄 Adding Liquidity...';
        
        showStatus('info', `Requesting transaction approval from wallet...`);
        console.log(`💧 Initiating add liquidity: ${amount} ${selectedToken.symbol} to pool ${poolAddress}`);
        
        // Check if wallet is still connected
        if (!window.backpack?.isConnected) {
            throw new Error('Wallet not connected. Please connect your Backpack wallet.');
        }
        
        // Prepare transaction parameters
        const decimals = selectedToken.decimals !== undefined ? selectedToken.decimals : 6;
        const amountLamports = Math.floor(amount * Math.pow(10, decimals));
        console.log(`🔍 Amount conversion: ${amount} ${selectedToken.symbol} → ${amountLamports} lamports (decimals: ${selectedToken.decimals})`);
        const poolPubkey = new solanaWeb3.PublicKey(poolAddress);
        const tokenMint = new solanaWeb3.PublicKey(selectedToken.mint);
        const userWallet = new solanaWeb3.PublicKey(window.backpack.publicKey);
        const programId = new solanaWeb3.PublicKey(window.TRADING_CONFIG.programId);
        
        showStatus('info', `Creating liquidity deposit transaction for ${amount} ${selectedToken.symbol}...`);
        
        // Derive required PDAs using correct seed prefixes
        const [systemStatePDA] = await solanaWeb3.PublicKey.findProgramAddress(
            [new TextEncoder().encode('system_state')],
            programId
        );
        
        // Get LP token mint PDAs (derive from pool state)
        const [lpTokenAMint] = await solanaWeb3.PublicKey.findProgramAddress(
            [new TextEncoder().encode('lp_token_a_mint'), poolPubkey.toBytes()],
            programId
        );
        const [lpTokenBMint] = await solanaWeb3.PublicKey.findProgramAddress(
            [new TextEncoder().encode('lp_token_b_mint'), poolPubkey.toBytes()],
            programId
        );
        
        // Determine which token vault and LP mint to use based on selected token
        const isTokenA = selectedToken.mint === poolData.tokenAMint;
        const targetVault = isTokenA ? poolData.tokenAVault : poolData.tokenBVault;
        const targetLPMint = isTokenA ? lpTokenAMint : lpTokenBMint;
        
        // Find user's token account for the selected token
        const userTokenAccount = new solanaWeb3.PublicKey(selectedToken.tokenAccount);
        
        // Find or create user's LP token account 
        const userLPTokenAccount = await findOrCreateAssociatedTokenAccount(userWallet, targetLPMint);
        
        // Check if we need to create the associated token account first
        const lpAccountInfo = await connection.getAccountInfo(userLPTokenAccount);
        
        // Create the transaction with compute budget
        const transaction = new solanaWeb3.Transaction();
        
        // Add compute budget instruction to increase CU limit (security upgrades need ~400k CUs)
        const computeBudgetInstruction = solanaWeb3.ComputeBudgetProgram.setComputeUnitLimit({
            units: computeUnits
        });
        transaction.add(computeBudgetInstruction);
        console.log(`✅ Added compute budget instruction: ${computeUnits.toLocaleString()} CUs`);
        
        // Add create associated token account instruction if needed
        if (!lpAccountInfo) {
            console.log(`📝 Adding instruction to create LP token account: ${userLPTokenAccount.toString()}`);
            const createAtaIx = window.splToken.Token.createAssociatedTokenAccountInstruction(
                window.splToken.ASSOCIATED_TOKEN_PROGRAM_ID,
                window.splToken.TOKEN_PROGRAM_ID,
                targetLPMint,        // mint
                userLPTokenAccount,  // associatedToken
                userWallet,          // owner
                userWallet           // payer
            );
            transaction.add(createAtaIx);
        }
        
        // Serialize instruction data: Deposit { deposit_token_mint, amount }
        const instructionData = new Uint8Array(1 + 32 + 8); // 1 byte discriminator + 32 bytes pubkey + 8 bytes u64
        instructionData[0] = 2; // Deposit instruction discriminator (assuming it's the 3rd instruction)
        tokenMint.toBytes().forEach((byte, index) => {
            instructionData[1 + index] = byte;
        });
        const amountBytes = new ArrayBuffer(8);
        new DataView(amountBytes).setBigUint64(0, BigInt(amountLamports), true); // little-endian
        new Uint8Array(amountBytes).forEach((byte, index) => {
            instructionData[1 + 32 + index] = byte;
        });
        
        const depositInstruction = new solanaWeb3.TransactionInstruction({
            programId: programId,
            keys: [
                { pubkey: userWallet, isSigner: true, isWritable: true },                    // User Authority Signer
                { pubkey: solanaWeb3.SystemProgram.programId, isSigner: false, isWritable: false }, // System Program
                { pubkey: systemStatePDA, isSigner: false, isWritable: false },             // System State PDA
                { pubkey: poolPubkey, isSigner: false, isWritable: true },                  // Pool State PDA
                { pubkey: window.splToken.TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },  // SPL Token Program
                { pubkey: new solanaWeb3.PublicKey(poolData.tokenAVault), isSigner: false, isWritable: true }, // Token A Vault
                { pubkey: new solanaWeb3.PublicKey(poolData.tokenBVault), isSigner: false, isWritable: true }, // Token B Vault
                { pubkey: userTokenAccount, isSigner: false, isWritable: true },            // User Input Token Account
                { pubkey: userLPTokenAccount, isSigner: false, isWritable: true },          // User Output LP Account
                { pubkey: lpTokenAMint, isSigner: false, isWritable: true },                // LP Token A Mint
                { pubkey: lpTokenBMint, isSigner: false, isWritable: true },                // LP Token B Mint
            ],
            data: instructionData
        });
        
        transaction.add(depositInstruction);
        
        // Debug: Log transaction details
        console.log('🔍 Add Liquidity Transaction Debug:');
        console.log('  Amount (raw):', amount);
        console.log('  Amount (lamports):', amountLamports);
        console.log('  Token Mint:', tokenMint.toString());
        console.log('  Target Vault:', targetVault);
        console.log('  Target LP Mint:', targetLPMint.toString());
        console.log('  User Token Account:', userTokenAccount.toString());
        console.log('  User LP Token Account:', userLPTokenAccount.toString());
        
        // Get recent blockhash
        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = userWallet;
        
        showStatus('info', `Testing transaction simulation first...`);
        
        // Simulate transaction to check for errors
        try {
            console.log('🧪 Simulating add liquidity transaction...');
            const simulation = await connection.simulateTransaction(transaction);
            console.log('📊 Simulation result:', simulation);
            
            if (simulation.value.err) {
                console.log('❌ Simulation failed:', simulation.value.err);
                console.log('📋 Simulation logs:', simulation.value.logs);
                throw new Error(`Simulation failed: ${JSON.stringify(simulation.value.err)}`);
            }
            
            console.log('✅ Simulation successful - proceeding with transaction');
        } catch (simError) {
            console.error('❌ Simulation error:', simError);
            const cuHint = getComputeUnitErrorMessage(simError?.message, simError?.logs, computeUnits);
            if (cuHint) {
                throw new Error(`Simulation failed: ${JSON.stringify(simError?.message || simError)}. ${cuHint}`);
            }
            throw new Error(`Simulation failed: ${simError.message}`);
        }
        
        showStatus('info', `Waiting for transaction approval...`);
        
        // Request signature from wallet
        const signedTransaction = await window.backpack.signTransaction(transaction);
        
        showStatus('info', `Broadcasting transaction...`);
        
        // Send transaction
        const signature = await connection.sendRawTransaction(signedTransaction.serialize());
        
        showStatus('info', `Transaction sent! Confirming... (${signature.slice(0, 8)}...)`);
        console.log(`📡 Transaction signature: ${signature}`);
        
        // Wait for confirmation
        const confirmation = await connection.confirmTransaction(signature, 'confirmed');
        
        if (confirmation.value.err) {
            throw new Error(`Transaction failed: ${confirmation.value.err}`);
        }
        
        // Success! Show detailed success message
        showStatus('success', `
            <div style="text-align: left;">
                <div style="font-weight: bold; margin-bottom: 8px;">🎉 Liquidity Added Successfully!</div>
                <div style="font-size: 14px; line-height: 1.4;">
                    • Amount: ${amount} ${selectedToken.symbol}<br>
                    • Pool: ${poolAddress.slice(0, 8)}...${poolAddress.slice(-4)}<br>
                    • Transaction: <a href="https://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=${encodeURIComponent(connection.rpcEndpoint)}" target="_blank" style="color: #059669;">${signature.slice(0, 8)}...${signature.slice(-4)}</a><br>
                    • Status: Confirmed ✅
                </div>
            </div>
        `);
        
        console.log(`✅ Liquidity addition successful! Signature: ${signature}`);
        
        // Refresh pool data to show updated balances
        setTimeout(async () => {
            try {
                showStatus('info', 'Refreshing pool data...');
                await loadPoolInformation();
                await loadUserTokensForPool();
                showStatus('success', 'Pool data refreshed successfully!');
            } catch (refreshError) {
                console.warn('Could not refresh pool data:', refreshError);
                showStatus('warning', 'Transaction successful, but could not refresh data. Please reload the page.');
            }
        }, 2000);
        
    } catch (error) {
        console.error('❌ Error adding liquidity:', error);
        const userMsg = buildUserFacingErrorMessage(error, computeUnits);
        showStatus('error', `❌ ${userMsg}`);
        
    } finally {
        addBtn.disabled = false;
        addBtn.textContent = originalText;
        updateAddButton();
    }
}

/**
 * Show status message
 */
function showStatus(type, message) {
    const container = document.getElementById('status-container');
    container.innerHTML = `<div class="status-message ${type}">${message}</div>`;
}

/**
 * Clear status message
 */
function clearStatus() {
    const container = document.getElementById('status-container');
    container.innerHTML = '';
}

/**
 * Detect likely compute unit exhaustion from simulation error/logs
 */
function getComputeUnitErrorMessage(simulationError, simulationLogs, currentComputeUnits) {
    try {
        const errText = typeof simulationError === 'string' 
            ? simulationError 
            : JSON.stringify(simulationError || {});
        const logs = Array.isArray(simulationLogs) ? simulationLogs.join('\n') : String(simulationLogs || '');

        const patternMatches = [
            'ProgramFailedToComplete',
            'ComputationalBudgetExceeded',
            'exceeded maximum number of instructions',
            'Program failed to complete',
        ].some(p => errText.includes(p) || logs.includes(p));

        if (patternMatches) {
            const cuText = currentComputeUnits ? ` (current: ${currentComputeUnits.toLocaleString()} CUs)` : '';
            return `Likely insufficient compute units${cuText}. Try increasing the compute unit limit and re-run.`;
        }
    } catch (_) {
        // fall through
    }
    return '';
}

/**
 * Build a user-facing error message with specific CU guidance when applicable
 */
function buildUserFacingErrorMessage(error, currentComputeUnits) {
    const raw = error?.message || String(error || '');
    const lower = raw.toLowerCase();

    // Prefer CU-specific messaging first
    if (
        raw.includes('compute unit') ||
        raw.includes('ProgramFailedToComplete') ||
        raw.includes('ComputationalBudgetExceeded') ||
        raw.includes('exceeded maximum number of instructions') ||
        raw.includes('Likely insufficient compute units')
    ) {
        const cuText = currentComputeUnits ? ` (current: ${currentComputeUnits.toLocaleString()} CUs)` : '';
        return `❌ Insufficient compute units${cuText}. Increase the compute unit limit and retry.`;
    }

    // Wallet and user action messages
    if (lower.includes('user rejected')) {
        return 'Transaction cancelled by user';
    }
    if (lower.includes('wallet not connected')) {
        return 'Wallet not connected. Please connect your Backpack wallet.';
    }

    // Balance/SOL errors (be specific to avoid catching CU phrase)
    if (
        lower.includes('insufficient funds') ||
        lower.includes('insufficient sol') ||
        lower.includes('insufficient lamports')
    ) {
        return 'Insufficient SOL for transaction fees';
    }

    return `Transaction failed: ${raw}`;
}

/**
 * Phase 2.1: Generate pool flags display section for liquidity page
 */
function generatePoolFlagsDisplay(flags, pool) {
    const hasFlags = flags.oneToManyRatio || flags.liquidityPaused || flags.swapsPaused || 
                     flags.withdrawalProtection || flags.singleLpTokenMode;
    
    if (!hasFlags && (typeof pool.flags === 'undefined' || pool.flags === 0)) {
        return ''; // No flags to display
    }
    
    const flagItems = [];
    
    if (flags.oneToManyRatio) {
        flagItems.push('<span style="background: #3b82f6; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px;">🎯 One-to-Many Ratio</span>');
    }
    if (flags.liquidityPaused) {
        flagItems.push('<span style="background: #ef4444; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px;">⏸️ Liquidity Paused</span>');
    }
    if (flags.swapsPaused) {
        flagItems.push('<span style="background: #f59e0b; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px;">🚫 Swaps Paused</span>');
    }
    if (flags.withdrawalProtection) {
        flagItems.push('<span style="background: #10b981; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px;">🛡️ Withdrawal Protection</span>');
    }
    if (flags.singleLpTokenMode) {
        flagItems.push('<span style="background: #8b5cf6; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px;">🔗 Single LP Mode</span>');
    }
    
    if (flagItems.length > 0) {
        return `
            <div class="pool-metric" style="grid-column: 1 / -1;">
                <div class="metric-label">Active Pool Flags</div>
                <div class="metric-value" style="display: flex; flex-wrap: wrap; gap: 4px; justify-content: center;">
                    ${flagItems.join(' ')}
                </div>
            </div>
        `;
    }
    
    return '';
}

/**
 * Phase 2.1: Add expandable Pool State display section with ALL PoolState fields
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
    
    expandableSection.innerHTML = `
        <div style="padding: 20px; cursor: pointer; background: #f8f9fa; border-bottom: 1px solid #e5e7eb;" onclick="togglePoolStateDetails()">
            <h3 style="margin: 0; color: #333; display: flex; align-items: center; justify-content: between;">
                🔍 Pool State Details (Expandable Debug Section)
                <span id="expand-indicator" style="margin-left: auto; font-size: 20px;">▼</span>
            </h3>
            <p style="margin: 5px 0 0 0; color: #666; font-size: 14px;">Click to view all PoolState struct fields</p>
        </div>
        <div id="pool-state-details" style="display: none; padding: 25px;">
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px;">
                ${generatePoolStateFields()}
            </div>
        </div>
    `;
    
    poolInfoSection.insertAdjacentElement('afterend', expandableSection);
}

/**
 * Phase 2.1: Generate all PoolState struct fields display
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
        
        <!-- Liquidity Information -->
        <div class="pool-state-section">
            <h4 style="color: #0284c7; margin: 0 0 15px 0; border-bottom: 2px solid #bae6fd; padding-bottom: 5px;">💧 Liquidity Information</h4>
            <div class="state-field"><strong>total_token_a_liquidity:</strong><br><code>${poolData.total_token_a_liquidity || poolData.tokenALiquidity || 'N/A'}</code></div>
            <div class="state-field"><strong>total_token_b_liquidity:</strong><br><code>${poolData.total_token_b_liquidity || poolData.tokenBLiquidity || 'N/A'}</code></div>
        </div>
        
        <!-- Bump Seeds -->
        <div class="pool-state-section">
            <h4 style="color: #7c3aed; margin: 0 0 15px 0; border-bottom: 2px solid #ede9fe; padding-bottom: 5px;">🔑 Bump Seeds</h4>
            <div class="state-field"><strong>pool_authority_bump_seed:</strong><br><code>${poolData.pool_authority_bump_seed || poolData.poolAuthorityBumpSeed || 'N/A'}</code></div>
            <div class="state-field"><strong>token_a_vault_bump_seed:</strong><br><code>${poolData.token_a_vault_bump_seed || poolData.tokenAVaultBumpSeed || 'N/A'}</code></div>
            <div class="state-field"><strong>token_b_vault_bump_seed:</strong><br><code>${poolData.token_b_vault_bump_seed || poolData.tokenBVaultBumpSeed || 'N/A'}</code></div>
            <div class="state-field"><strong>lp_token_a_mint_bump_seed:</strong><br><code>${poolData.lp_token_a_mint_bump_seed || poolData.lpTokenAMintBumpSeed || 'N/A'}</code></div>
            <div class="state-field"><strong>lp_token_b_mint_bump_seed:</strong><br><code>${poolData.lp_token_b_mint_bump_seed || poolData.lpTokenBMintBumpSeed || 'N/A'}</code></div>
        </div>
        
        <!-- Pool Flags -->
        <div class="pool-state-section">
            <h4 style="color: #dc2626; margin: 0 0 15px 0; border-bottom: 2px solid #fecaca; padding-bottom: 5px;">🚩 Pool Flags</h4>
            <div class="state-field"><strong>flags (raw):</strong><br><code>${poolData.flags || 0} (binary: ${(poolData.flags || 0).toString(2).padStart(5, '0')})</code></div>
            <div class="state-field"><strong>Decoded Flags:</strong><br>
                <div style="margin-top: 5px;">
                    ${flags.oneToManyRatio ? '🎯 One-to-Many Ratio<br>' : ''}
                    ${flags.liquidityPaused ? '⏸️ Liquidity Paused<br>' : ''}
                    ${flags.swapsPaused ? '🚫 Swaps Paused<br>' : ''}
                    ${flags.withdrawalProtection ? '🛡️ Withdrawal Protection<br>' : ''}
                    ${flags.singleLpTokenMode ? '🔗 Single LP Mode<br>' : ''}
                    ${!flags.oneToManyRatio && !flags.liquidityPaused && !flags.swapsPaused && !flags.withdrawalProtection && !flags.singleLpTokenMode ? '✅ No Active Flags' : ''}
                </div>
            </div>
        </div>
        
        <!-- Fee Configuration -->
        <div class="pool-state-section">
            <h4 style="color: #ea580c; margin: 0 0 15px 0; border-bottom: 2px solid #fed7aa; padding-bottom: 5px;">💰 Fee Configuration</h4>
            <div class="state-field"><strong>contract_liquidity_fee:</strong><br><code>${poolData.contract_liquidity_fee || poolData.contractLiquidityFee || 'N/A'} lamports</code></div>
            <div class="state-field"><strong>swap_contract_fee:</strong><br><code>${poolData.swap_contract_fee || poolData.swapContractFee || 'N/A'} lamports</code></div>
        </div>
        
        <!-- Token Fee Tracking -->
        <div class="pool-state-section">
            <h4 style="color: #16a34a; margin: 0 0 15px 0; border-bottom: 2px solid #bbf7d0; padding-bottom: 5px;">📊 Token Fee Tracking</h4>
            <div class="state-field"><strong>collected_fees_token_a:</strong><br><code>${poolData.collected_fees_token_a || poolData.collectedFeesTokenA || 'N/A'}</code></div>
            <div class="state-field"><strong>collected_fees_token_b:</strong><br><code>${poolData.collected_fees_token_b || poolData.collectedFeesTokenB || 'N/A'}</code></div>
            <div class="state-field"><strong>total_fees_withdrawn_token_a:</strong><br><code>${poolData.total_fees_withdrawn_token_a || poolData.totalFeesWithdrawnTokenA || 'N/A'}</code></div>
            <div class="state-field"><strong>total_fees_withdrawn_token_b:</strong><br><code>${poolData.total_fees_withdrawn_token_b || poolData.totalFeesWithdrawnTokenB || 'N/A'}</code></div>
        </div>
        
        <!-- SOL Fee Tracking -->
        <div class="pool-state-section">
            <h4 style="color: #9333ea; margin: 0 0 15px 0; border-bottom: 2px solid #e9d5ff; padding-bottom: 5px;">⚡ SOL Fee Tracking</h4>
            <div class="state-field"><strong>collected_liquidity_fees:</strong><br><code>${poolData.collected_liquidity_fees || poolData.collectedLiquidityFees || 'N/A'} lamports</code></div>
            <div class="state-field"><strong>collected_swap_contract_fees:</strong><br><code>${poolData.collected_swap_contract_fees || poolData.collectedSwapContractFees || 'N/A'} lamports</code></div>
            <div class="state-field"><strong>total_sol_fees_collected:</strong><br><code>${poolData.total_sol_fees_collected || poolData.totalSolFeesCollected || 'N/A'} lamports</code></div>
        </div>
        
        <!-- Consolidation Data -->
        <div class="pool-state-section">
            <h4 style="color: #be123c; margin: 0 0 15px 0; border-bottom: 2px solid #fda4af; padding-bottom: 5px;">🔄 Consolidation Data</h4>
            <div class="state-field"><strong>last_consolidation_timestamp:</strong><br><code>${poolData.last_consolidation_timestamp || poolData.lastConsolidationTimestamp || 'N/A'}</code></div>
            <div class="state-field"><strong>total_consolidations:</strong><br><code>${poolData.total_consolidations || poolData.totalConsolidations || 'N/A'}</code></div>
            <div class="state-field"><strong>total_fees_consolidated:</strong><br><code>${poolData.total_fees_consolidated || poolData.totalFeesConsolidated || 'N/A'} lamports</code></div>
        </div>
    `;
}

/**
 * Phase 2.1: Toggle pool state details visibility
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

/**
 * Phase 3.1: Switch between add and remove liquidity operations
 */
function switchOperation(operation) {
    const addSection = document.getElementById('add-liquidity-section');
    const removeSection = document.getElementById('remove-liquidity-section');
    
    if (operation === 'add') {
        addSection.style.display = 'block';
        removeSection.style.display = 'none';
    } else {
        addSection.style.display = 'none';
        removeSection.style.display = 'block';
        
        // Load LP token balances when switching to remove
        loadLPTokenBalances();
    }
    
    console.log(`🔄 Switched to ${operation} liquidity operation`);
}

/**
 * Phase 3.1: Load LP token balances for connected wallet
 */
async function loadLPTokenBalances() {
    if (!poolData || !window.backpack?.publicKey) {
        console.log('No wallet connected or pool data unavailable');
        return;
    }
    
    try {
        console.log('🔍 Loading real LP token balances from blockchain...');
        
        // Get all token accounts for the user
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
            window.backpack.publicKey,
            { programId: window.splToken.TOKEN_PROGRAM_ID }
        );
        
        console.log(`📊 Found ${tokenAccounts.value.length} total token accounts`);
        
        // Initialize LP balances
        let lpTokenABalance = 0;
        let lpTokenBBalance = 0;
        let lpTokenADecimals = 6; // Default
        let lpTokenBDecimals = 6; // Default
        
        // Look for LP token accounts
        for (const tokenAccount of tokenAccounts.value) {
            const accountInfo = tokenAccount.account.data.parsed.info;
            const mintAddress = accountInfo.mint;
            
            // Check if this is LP Token A
            if (mintAddress === poolData.lpTokenAMint) {
                lpTokenABalance = parseFloat(accountInfo.tokenAmount.uiAmount) || 0;
                lpTokenADecimals = accountInfo.tokenAmount.decimals;
                
                // Validate decimals
                if (lpTokenADecimals === undefined || lpTokenADecimals === null) {
                    throw new Error(`LP Token A decimals not found for ${mintAddress}`);
                }
                
                console.log(`✅ Found LP Token A: ${lpTokenABalance} LP ${poolData.tokenASymbol} (decimals: ${lpTokenADecimals})`);
            }
            
            // Check if this is LP Token B
            if (mintAddress === poolData.lpTokenBMint) {
                lpTokenBBalance = parseFloat(accountInfo.tokenAmount.uiAmount) || 0;
                lpTokenBDecimals = accountInfo.tokenAmount.decimals;
                
                // Validate decimals
                if (lpTokenBDecimals === undefined || lpTokenBDecimals === null) {
                    throw new Error(`LP Token B decimals not found for ${mintAddress}`);
                }
                
                console.log(`✅ Found LP Token B: ${lpTokenBBalance} LP ${poolData.tokenBSymbol} (decimals: ${lpTokenBDecimals})`);
            }
        }
        
        // Update simplified LP token display
        const totalLPBalance = lpTokenABalance + lpTokenBBalance;
        const lpTokenSymbol = totalLPBalance > 0 ? 
            (lpTokenABalance > 0 ? `LP ${poolData.tokenASymbol}` : `LP ${poolData.tokenBSymbol}`) : 
            'LP Token';
        
        // Update the simplified remove liquidity interface
        document.getElementById('selected-lp-token-name').textContent = lpTokenSymbol;
        document.getElementById('available-lp-balance').textContent = totalLPBalance.toFixed(6);
        document.getElementById('available-lp-symbol').textContent = lpTokenSymbol;
        
        // Store LP token data for later use
        window.lpTokenData = {
            tokenABalance: lpTokenABalance,
            tokenBBalance: lpTokenBBalance,
            totalBalance: totalLPBalance,
            tokenASymbol: poolData.tokenASymbol,
            tokenBSymbol: poolData.tokenBSymbol
        };
        
        console.log(`✅ LP token balances loaded: LP ${poolData.tokenASymbol}=${lpTokenABalance}, LP ${poolData.tokenBSymbol}=${lpTokenBBalance}`);
        
        // Show message if no LP tokens found
        if (lpTokenABalance <= 0 && lpTokenBBalance <= 0) {
            showStatus('info', '📭 You don\'t have any LP tokens for this pool. Add liquidity first to get LP tokens.');
        }
        
    } catch (error) {
        console.error('❌ Error loading LP token balances:', error);
        showStatus('error', 'Failed to load LP token balances: ' + error.message);
    }
}

// selectLPToken function removed - simplified interface no longer needs LP token selection

/**
 * Phase 3.1: Update remove liquidity button state
 */
function updateRemoveButton() {
    const amount = parseFloat(document.getElementById('remove-liquidity-amount').value) || 0;
    const button = document.getElementById('remove-liquidity-btn');
    
    if (amount > 0 && window.lpTokenData && window.lpTokenData.totalBalance > 0) {
        // Check if amount is within available balance
        if (amount <= window.lpTokenData.totalBalance) {
            button.disabled = false;
            button.textContent = '💧 Remove Liquidity';
        } else {
            button.disabled = true;
            button.textContent = `❌ Insufficient Balance (${window.lpTokenData.totalBalance.toFixed(6)} available)`;
        }
    } else {
        button.disabled = true;
        button.textContent = amount > 0 ? '💧 No LP Tokens Available' : '💧 Enter Amount';
    }
}

/**
 * Phase 3.1: Execute remove liquidity transaction
 */
async function removeLiquidity() {
    if (!poolData || !isConnected || !window.selectedLPToken) {
        showStatus('error', 'Please connect wallet, load pool data, and select an LP token first');
        return;
    }
    
    const amount = parseFloat(document.getElementById('remove-liquidity-amount').value);
    
    if (!amount || amount <= 0) {
        showStatus('error', 'Please enter a valid amount');
        return;
    }
    
    if (amount > window.selectedLPToken.balance) {
        showStatus('error', `Insufficient LP balance. You have ${window.selectedLPToken.balance.toFixed(6)} ${window.selectedLPToken.symbol}`);
        return;
    }
    
    // ✅ CRITICAL VALIDATION: Check if pool has sufficient underlying liquidity
    const underlyingMintForWithdraw = window.selectedLPToken.underlyingMint;
    const tokenAMintForPool = poolData.tokenAMint || poolData.token_a_mint;
    const tokenBMintForPool = poolData.tokenBMint || poolData.token_b_mint;

    const isWithdrawUnderlyingA = underlyingMintForWithdraw === tokenAMintForPool;
    const poolLiquidityBasisPointsForWithdraw = isWithdrawUnderlyingA
        ? (poolData.total_token_a_liquidity || poolData.tokenALiquidity || 0)
        : (poolData.total_token_b_liquidity || poolData.tokenBLiquidity || 0);

    // Convert pool liquidity to display units using underlying token decimals
    let underlyingWithdrawDecimals;
    try {
        underlyingWithdrawDecimals = await window.TokenDisplayUtils.getTokenDecimals(new solanaWeb3.PublicKey(underlyingMintForWithdraw), connection);
    } catch (e) {
        console.warn('⚠️ Failed to fetch underlying token decimals for withdraw, defaulting to 6:', e?.message);
        underlyingWithdrawDecimals = 6;
    }
    const poolLiquidityDisplayForWithdraw = window.TokenDisplayUtils.basisPointsToDisplay(
        poolLiquidityBasisPointsForWithdraw,
        underlyingWithdrawDecimals
    );

    console.log(`🔍 LIQUIDITY VALIDATION: pool liquidity (display) = ${poolLiquidityDisplayForWithdraw}, withdrawal amount (LP display) = ${amount}`);

    if (!poolLiquidityDisplayForWithdraw || poolLiquidityDisplayForWithdraw <= 0) {
        showStatus('error', `❌ Pool has no underlying liquidity! Cannot withdraw when the pool is empty.`);
        console.error(`❌ INSUFFICIENT POOL LIQUIDITY: Pool has ${poolLiquidityDisplayForWithdraw}, cannot withdraw ${amount}`);
        return;
    }

    if (amount > poolLiquidityDisplayForWithdraw) {
        showStatus('error', `❌ Pool has insufficient underlying liquidity! Pool has ${poolLiquidityDisplayForWithdraw.toLocaleString()}, but you're trying to withdraw ${amount.toLocaleString()}.`);
        console.error(`❌ INSUFFICIENT POOL LIQUIDITY: Pool has ${poolLiquidityDisplayForWithdraw}, cannot withdraw ${amount}`);
        return;
    }
    
    const removeBtn = document.getElementById('remove-liquidity-btn');
    const originalText = removeBtn.textContent;
    // Make computeUnitsRemove available to both try/catch blocks
    let computeUnitsRemove = 205_000; // default; adjust for testing as needed
    
    try {
        removeBtn.disabled = true;
        removeBtn.textContent = '🔄 Removing Liquidity...';
        
        // Use the selected LP token data
        const underlyingTokenMint = window.selectedLPToken.underlyingMint;
        const lpTokenMint = window.selectedLPToken.mint;
        const tokenSymbol = window.selectedLPToken.underlyingToken;
        const lpTokenSymbol = window.selectedLPToken.symbol;
        
        // Get the actual LP token decimals from the blockchain
        console.log('🔍 Fetching LP token decimals...');
        const lpTokenDecimals = await window.TokenDisplayUtils.getTokenDecimals(lpTokenMint, connection);
        console.log(`✅ LP token decimals: ${lpTokenDecimals}`);
        
        // Validation was already done above, but double-check
        if (amount > window.selectedLPToken.balance) {
            throw new Error(`Insufficient LP balance. You have ${window.selectedLPToken.balance.toFixed(6)} ${lpTokenSymbol}`);
        }
        
        showStatus('info', `Requesting transaction approval from wallet...`);
        console.log(`🔥 Initiating remove liquidity: ${amount} ${lpTokenSymbol} from pool ${poolAddress}`);
        
        // Check if wallet is still connected
        if (!window.backpack?.isConnected) {
            throw new Error('Wallet not connected. Please connect your Backpack wallet.');
        }
        
        // Prepare transaction parameters
        const lpAmountLamports = Math.floor(amount * Math.pow(10, lpTokenDecimals));
        const poolPubkey = new solanaWeb3.PublicKey(poolAddress);
        const withdrawTokenMint = new solanaWeb3.PublicKey(underlyingTokenMint);
        const userWallet = new solanaWeb3.PublicKey(window.backpack.publicKey);
        const programId = new solanaWeb3.PublicKey(window.TRADING_CONFIG.programId);
        
        showStatus('info', `Creating liquidity withdrawal transaction for ${amount} ${lpTokenSymbol}...`);
        
        // Derive required PDAs
        const [systemStatePDA] = await solanaWeb3.PublicKey.findProgramAddress(
            [new TextEncoder().encode('system_state')],
            programId
        );
        
        // Get LP token mint PDAs
        const [lpTokenAMint] = await solanaWeb3.PublicKey.findProgramAddress(
            [new TextEncoder().encode('lp_token_a_mint'), poolPubkey.toBytes()],
            programId
        );
        
        const [lpTokenBMint] = await solanaWeb3.PublicKey.findProgramAddress(
            [new TextEncoder().encode('lp_token_b_mint'), poolPubkey.toBytes()],
            programId
        );
        
        // Find user's LP token account (the one they're burning from)
        const userLPTokenMint = new solanaWeb3.PublicKey(lpTokenMint);
        const userLPTokenAccount = await window.splToken.Token.getAssociatedTokenAddress(
            window.splToken.ASSOCIATED_TOKEN_PROGRAM_ID,
            window.splToken.TOKEN_PROGRAM_ID,
            userLPTokenMint,
            userWallet
        );
        
        // Debug: Log key information
        console.log('🔍 Transaction Debug Info:');
        console.log('  LP Token Mint:', lpTokenMint);
        console.log('  Underlying Token Mint:', underlyingTokenMint);
        console.log('  User LP Token Account:', userLPTokenAccount.toString());
        console.log('  Amount (raw):', amount);
        console.log('  Amount (lamports):', lpAmountLamports);
        
        // Find user's output token account (where they receive underlying tokens)
        const userOutputTokenAccount = await window.splToken.Token.getAssociatedTokenAddress(
            window.splToken.ASSOCIATED_TOKEN_PROGRAM_ID,
            window.splToken.TOKEN_PROGRAM_ID,
            withdrawTokenMint,
            userWallet
        );
        
        // Check if output token account exists, create if needed
        const outputAccountInfo = await connection.getAccountInfo(userOutputTokenAccount);
        
        // Create transaction with compute budget
        const transaction = new solanaWeb3.Transaction();
        
        // Add compute budget instruction to increase CU limit
        computeUnitsRemove = 290_000; // default; adjust for testing as needed
        const computeBudgetInstruction = solanaWeb3.ComputeBudgetProgram.setComputeUnitLimit({
            units: computeUnitsRemove
        });
        transaction.add(computeBudgetInstruction);
        console.log(`✅ Added compute budget instruction: ${computeUnitsRemove.toLocaleString()} CUs`);
        
        // Add create associated token account instruction if needed
        if (!outputAccountInfo) {
            const createAtaIx = window.splToken.Token.createAssociatedTokenAccountInstruction(
                window.splToken.ASSOCIATED_TOKEN_PROGRAM_ID,
                window.splToken.TOKEN_PROGRAM_ID,
                withdrawTokenMint,
                userOutputTokenAccount,
                userWallet,
                userWallet
            );
            transaction.add(createAtaIx);
            console.log('✅ Added create associated token account instruction for output token');
        }
        
        // Verify the amount is not zero (this could cause ProgramError::InvalidArgument)
        if (lpAmountLamports === 0) {
            throw new Error(`Invalid amount: ${amount} results in 0 lamports. Check decimal precision.`);
        }
        
        console.log('🔍 Instruction Data Debug:');
        console.log('  Discriminator: 3 (Withdraw)');
        console.log('  Withdraw Token Mint bytes:', withdrawTokenMint.toBytes());
        console.log('  LP Amount (lamports):', lpAmountLamports);
        
        // Serialize withdraw instruction data using Borsh format: Withdraw { withdraw_token_mint, lp_amount_to_burn }
        const instructionData = new Uint8Array(1 + 32 + 8);
        instructionData[0] = 3; // Withdraw instruction discriminator
        
        // Serialize withdraw_token_mint (32 bytes)
        const mintBytes = withdrawTokenMint.toBytes();
        for (let i = 0; i < 32; i++) {
            instructionData[1 + i] = mintBytes[i];
        }
        
        // Serialize lp_amount_to_burn (8 bytes, little-endian u64)
        const amountBuffer = new ArrayBuffer(8);
        const amountView = new DataView(amountBuffer);
        amountView.setBigUint64(0, BigInt(lpAmountLamports), true); // little-endian
        const amountBytes = new Uint8Array(amountBuffer);
        for (let i = 0; i < 8; i++) {
            instructionData[1 + 32 + i] = amountBytes[i];
        }
        
        console.log('🔍 Final instruction data:', Array.from(instructionData).map(b => b.toString(16).padStart(2, '0')).join(' '));
        
        // Debug: Log all account addresses
        console.log('🔍 Account Address Debug:');
        console.log('  User Wallet:', userWallet.toString());
        console.log('  System Program:', solanaWeb3.SystemProgram.programId.toString());
        console.log('  System State PDA:', systemStatePDA.toString());
        console.log('  Pool PDA:', poolPubkey.toString());
        console.log('  Token Program:', window.splToken.TOKEN_PROGRAM_ID.toString());
        console.log('  Token A Vault:', poolData.tokenAVault);
        console.log('  Token B Vault:', poolData.tokenBVault);
        console.log('  User LP Token Account:', userLPTokenAccount.toString());
        console.log('  User Output Token Account:', userOutputTokenAccount.toString());
        console.log('  LP Token A Mint:', lpTokenAMint.toString());
        console.log('  LP Token B Mint:', lpTokenBMint.toString());
        
        // Verify key accounts exist
        console.log('🔍 Verifying account existence...');
        try {
            const lpTokenAccountInfo = await connection.getAccountInfo(userLPTokenAccount);
            console.log('  User LP Token Account exists:', !!lpTokenAccountInfo);
            if (lpTokenAccountInfo) {
                console.log('    Account owner:', lpTokenAccountInfo.owner.toString());
                console.log('    Account lamports:', lpTokenAccountInfo.lamports);
            }
        } catch (error) {
            console.log('  ❌ Error checking LP token account:', error.message);
        }
        
        // Create the withdraw instruction
        const withdrawInstruction = new solanaWeb3.TransactionInstruction({
            programId: programId,
            keys: [
                { pubkey: userWallet, isSigner: true, isWritable: true },                           // User Authority Signer
                { pubkey: solanaWeb3.SystemProgram.programId, isSigner: false, isWritable: false }, // System Program
                { pubkey: systemStatePDA, isSigner: false, isWritable: false },                     // System State PDA
                { pubkey: poolPubkey, isSigner: false, isWritable: true },                          // Pool State PDA
                { pubkey: window.splToken.TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },   // SPL Token Program
                { pubkey: new solanaWeb3.PublicKey(poolData.tokenAVault), isSigner: false, isWritable: true }, // Token A Vault
                { pubkey: new solanaWeb3.PublicKey(poolData.tokenBVault), isSigner: false, isWritable: true }, // Token B Vault
                { pubkey: userLPTokenAccount, isSigner: false, isWritable: true },                  // User LP Token Account (input)
                { pubkey: userOutputTokenAccount, isSigner: false, isWritable: true },              // User Output Token Account
                { pubkey: lpTokenAMint, isSigner: false, isWritable: true },                        // LP Token A Mint
                { pubkey: lpTokenBMint, isSigner: false, isWritable: true },                        // LP Token B Mint
            ],
            data: instructionData
        });
        
        transaction.add(withdrawInstruction);
        
        // Get recent blockhash
        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = userWallet;
        
        console.log('💰 Transaction prepared, testing simulation first...');
        
        // Simulate transaction first to get detailed error info
        try {
            console.log('🧪 Simulating transaction...');
            const simulation = await connection.simulateTransaction(transaction);
            console.log('📊 Simulation result:', simulation);
            
            if (simulation.value.err) {
                console.log('❌ Simulation failed:', simulation.value.err);
                console.log('📋 Simulation logs:', simulation.value.logs);
                const cuHint = getComputeUnitErrorMessage(simulation.value.err, simulation.value.logs, computeUnitsRemove);
                const baseMsg = `Transaction simulation failed: ${JSON.stringify(simulation.value.err)}`;
                throw new Error(cuHint ? `${baseMsg}. ${cuHint}` : baseMsg);
            } else {
                console.log('✅ Simulation successful!');
                console.log('📋 Simulation logs:', simulation.value.logs);
            }
        } catch (simError) {
            console.log('❌ Simulation error:', simError);
            throw new Error(`Simulation failed: ${simError.message}`);
        }
        
        console.log('💰 Simulation passed, requesting signature...');
        
        // Sign and send transaction
        const signedTransaction = await window.backpack.signTransaction(transaction);
        const signature = await connection.sendRawTransaction(signedTransaction.serialize());
        
        console.log('📡 Transaction signature:', signature);
        showStatus('info', `⏳ Confirming transaction... Signature: ${signature.slice(0, 8)}...`);
        
        // Wait for confirmation
        await connection.confirmTransaction(signature, 'confirmed');
        
        console.log('✅ Liquidity removal successful! Signature:', signature);
        showStatus('success', `✅ Successfully removed ${amount} ${lpTokenSymbol}! You received ${amount.toFixed(6)} ${tokenSymbol}. Transaction: ${signature.slice(0, 8)}...`);
        
        // Reset form
        document.getElementById('remove-liquidity-amount').value = '';
        updateRemoveButton();
        
        // Reload balances
        setTimeout(async () => {
            await loadUserTokensForPool();
            await loadLPTokenBalances();
        }, 1000);
        
    } catch (error) {
        console.error('❌ Error removing liquidity:', error);
        const userMsg = buildUserFacingErrorMessage(error, computeUnitsRemove);
        showStatus('error', `❌ ${userMsg}`);
    } finally {
        removeBtn.disabled = false;
        removeBtn.textContent = originalText;
    }
}

// Duplicate updateAddButton function removed - using the main one above

/**
 * Set maximum amount for liquidity operations
 */
async function setMaxAmount(operation) {
    try {
        if (operation === 'add') {
            // For adding liquidity, use the selected token's balance
            if (!selectedToken) {
                showStatus('error', 'Please select a token first');
                return;
            }
            
            // Convert raw balance to human-readable format based on decimals
            // Use BigInt for large numbers to avoid precision issues
            const decimals = selectedToken.decimals !== undefined ? selectedToken.decimals : 6;
            const maxAmount = selectedToken.decimals === 0 
                ? selectedToken.balance 
                : Number(BigInt(selectedToken.balance) / BigInt(Math.pow(10, decimals)));
            console.log(`🔍 Max amount calculation: ${selectedToken.balance} / Math.pow(10, ${selectedToken.decimals}) = ${maxAmount}`);
            console.log(`🔍 Max amount type: ${typeof maxAmount}, isFinite: ${isFinite(maxAmount)}`);
            const amountInput = document.getElementById('add-liquidity-amount');
            
            if (amountInput && maxAmount > 0) {
                // Update step attribute based on token decimals
                const step = selectedToken.decimals === 0 ? '1' : `0.${'0'.repeat(selectedToken.decimals - 1)}1`;
                amountInput.step = step;
                console.log(`🔧 Updated input step to: ${step} (decimals: ${selectedToken.decimals})`);
                
                const valueToSet = maxAmount.toString();
                console.log(`🔧 Setting input value to: "${valueToSet}"`);
                
                // Remove any max attribute that might be limiting the value
                amountInput.removeAttribute('max');
                
                // Try different methods to set the value
                amountInput.value = valueToSet;
                amountInput.setAttribute('value', valueToSet);
                
                // Force a change event to ensure the value is registered
                amountInput.dispatchEvent(new Event('change', { bubbles: true }));
                
                // Verify the value was set correctly
                console.log(`🔧 Input value after setting: "${amountInput.value}"`);
                console.log(`🔧 Input getAttribute('value'): "${amountInput.getAttribute('value')}"`);
                
                updateAddButton();
                
                const formattedAmount = maxAmount.toLocaleString();
                console.log(`🔧 Formatted amount: "${formattedAmount}"`);
                showStatus('info', `Set to maximum available: ${formattedAmount} ${selectedToken.symbol}`);
                console.log(`💰 Set max amount for add: ${maxAmount} ${selectedToken.symbol} (raw: ${selectedToken.balance})`);
            } else {
                showStatus('error', 'No balance available');
            }
            
        } else if (operation === 'remove') {
            // For removing liquidity, use the total LP token balance
            if (!window.lpTokenData || window.lpTokenData.totalBalance <= 0) {
                showStatus('error', 'No LP tokens available. Add liquidity first to get LP tokens.');
                return;
            }
            
            // Simplified: Use total LP token balance as max amount
            const maxAmount = window.lpTokenData.totalBalance;
            const amountInput = document.getElementById('remove-liquidity-amount');
            
            if (amountInput && maxAmount > 0) {
                amountInput.value = maxAmount.toString();
                updateRemoveButton();
                showStatus('info', `Set to maximum available: ${maxAmount.toLocaleString()} LP tokens`);
                console.log(`💰 Set max amount for remove: ${maxAmount} LP tokens`);
            } else {
                showStatus('error', 'No LP tokens available for withdrawal');
            }
        }
        
    } catch (error) {
        console.error(`❌ Error setting max amount for ${operation}:`, error);
        showStatus('error', `Failed to set maximum amount: ${error.message}`);
    }
}

/**
 * Find or create an associated token account for a user and mint
 */
async function findOrCreateAssociatedTokenAccount(ownerPubkey, mintPubkey) {
    try {
        // Calculate the associated token account address using the SPL Token library
        const associatedTokenAddress = await window.splToken.Token.getAssociatedTokenAddress(
            window.splToken.ASSOCIATED_TOKEN_PROGRAM_ID,
            window.splToken.TOKEN_PROGRAM_ID,
            mintPubkey,
            ownerPubkey
        );
        
        console.log(`🔍 Checking for associated token account: ${associatedTokenAddress.toString()}`);
        
        // Check if the account already exists
        const accountInfo = await connection.getAccountInfo(associatedTokenAddress);
        
        if (accountInfo) {
            console.log(`✅ Associated token account already exists: ${associatedTokenAddress.toString()}`);
            return associatedTokenAddress;
        } else {
            console.log(`📝 Associated token account does not exist, will be created during transaction`);
            // Return the address - the account will be created automatically by the SPL Token program
            // when the first tokens are minted to it
            return associatedTokenAddress;
        }
        
    } catch (error) {
        console.error('❌ Error with associated token account:', error);
        throw new Error(`Failed to handle associated token account: ${error.message}`);
    }
}

// Export for global access
window.connectWallet = connectWallet;
window.disconnectWallet = disconnectWallet;
window.selectToken = selectToken;
window.updateAddButton = updateAddButton;
window.addLiquidity = addLiquidity;
window.togglePoolStateDetails = togglePoolStateDetails; // Phase 2.1
// Phase 3.1: Export new functions
window.switchOperation = switchOperation;
// selectLPToken export removed - function no longer exists
window.updateRemoveButton = updateRemoveButton;
window.removeLiquidity = removeLiquidity;

console.log('💧 Liquidity JavaScript loaded successfully'); 