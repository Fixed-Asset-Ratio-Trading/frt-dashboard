// Fixed Ratio Trading Pools Page - JavaScript Logic
// Handles pool display and navigation to liquidity/swap pages

// Global state
let connection = null;
let pools = [];
let lastUpdate = null;

// Initialize pools page when page loads
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🏊‍♂️ Fixed Ratio Trading Pools page initializing...');
    await initializePoolsPage();
});

/**
 * Initialize the pools page connection and start monitoring
 */
async function initializePoolsPage() {
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
        
        console.log('✅ Configuration ready:', window.CONFIG.rpcUrl);
        
        // Initialize Solana connection
        console.log('🔌 Connecting to Solana RPC...');
        const connectionConfig = {
            commitment: 'confirmed',
            disableRetryOnRateLimit: CONFIG.disableRetryOnRateLimit || true
        };
        
        if (CONFIG.wsUrl) {
            console.log('📡 Using WebSocket endpoint:', CONFIG.wsUrl);
            connection = new solanaWeb3.Connection(CONFIG.rpcUrl, connectionConfig, CONFIG.wsUrl);
        } else {
            console.log('📡 Using HTTP polling (WebSocket disabled)');
            connectionConfig.wsEndpoint = false;
            connection = new solanaWeb3.Connection(CONFIG.rpcUrl, connectionConfig);
        }
        
        // Test RPC connection
        try {
            await testConnection();
            console.log('✅ RPC connection successful');
        } catch (rpcError) {
            console.error('❌ Failed to connect to RPC:', rpcError);
            showError(`RPC connection failed: ${rpcError.message}. Make sure the Solana validator is running on ${CONFIG.rpcUrl}`);
            return;
        }
        
        // Initialize centralized data service
        await window.TradingDataService.initialize(window.CONFIG, connection);
        console.log('✅ TradingDataService initialized with RPC connection');
        
        // Load initial pools data
        await loadPoolsData();
        
        // Start periodic updates
        startPeriodicUpdates();
        
        console.log('✅ Pools page initialization complete');
        
    } catch (error) {
        console.error('❌ Failed to initialize pools page:', error);
        showError(`Initialization failed: ${error.message}`);
    }
}

/**
 * Test the Solana RPC connection
 */
async function testConnection() {
    try {
        const blockHeight = await connection.getBlockHeight();
        console.log('📊 Current block height:', blockHeight);
        return true;
    } catch (error) {
        throw new Error(`RPC test failed: ${error.message}`);
    }
}

/**
 * Load pools data from the blockchain
 */
async function loadPoolsData() {
    try {
        console.log('🔍 Loading pools data...');
        
        // Load all data using centralized service
        const data = await window.TradingDataService.loadAllData('rpc');
        
        if (data.pools && data.pools.length > 0) {
            // Normalize field names from snake_case to camelCase for compatibility
            pools = data.pools.map(pool => {
                console.log('🐛 Original pool fields:', Object.keys(pool));
                return {
                    ...pool,
                    // Add camelCase aliases for snake_case fields (only if they exist)
                    tokenAMint: pool.token_a_mint || pool.tokenAMint,
                    tokenBMint: pool.token_b_mint || pool.tokenBMint,
                    tokenAVault: pool.token_a_vault || pool.tokenAVault,
                    tokenBVault: pool.token_b_vault || pool.tokenBVault,
                    lpTokenAMint: pool.lp_token_a_mint || pool.lpTokenAMint,
                    lpTokenBMint: pool.lp_token_b_mint || pool.lpTokenBMint,
                    ratioANumerator: pool.ratio_a_numerator || pool.ratioANumerator,
                    ratioBDenominator: pool.ratio_b_denominator || pool.ratioBDenominator,
                    ratioADecimal: pool.ratio_a_decimal || pool.ratioADecimal,
                    ratioBDecimal: pool.ratio_b_decimal || pool.ratioBDecimal,
                    ratioAActual: pool.ratio_a_actual || pool.ratioAActual,
                    ratioBActual: pool.ratio_b_actual || pool.ratioBActual,
                    totalTokenALiquidity: pool.total_token_a_liquidity || pool.totalTokenALiquidity,
                    totalTokenBLiquidity: pool.total_token_b_liquidity || pool.totalTokenBLiquidity,
                    collectedFeesTokenA: pool.collected_fees_token_a || pool.collectedFeesTokenA,
                    collectedFeesTokenB: pool.collected_fees_token_b || pool.collectedFeesTokenB,
                    totalSolFeesCollected: pool.total_sol_fees_collected || pool.totalSolFeesCollected
                };
            });
            console.log(`📁 Loaded ${pools.length} pools`);
            
            // Fetch token symbols for all pools
            console.log('🔍 Fetching token symbols for pools...');
            await enrichPoolsWithTokenSymbols(pools);
            console.log('✅ Token symbols loaded for all pools');
        } else {
            pools = [];
            console.log('📭 No pools found');
        }
        
        // Debug: Log pool data structure
        console.log('🐛 Pool data structure:', pools.length > 0 ? pools[0] : 'No pools');
        console.log('🐛 Raw pool data from service:', data.pools.length > 0 ? data.pools[0] : 'No pools');
        
        // Update display
        renderPools();
        updateLastUpdated();
        
    } catch (error) {
        console.error('❌ Failed to load pools data:', error);
        showError(`Failed to load pools: ${error.message}`);
    }
}

/**
 * Enrich pools with token symbols
 */
async function enrichPoolsWithTokenSymbols(poolsToEnrich) {
    try {
        for (const pool of poolsToEnrich) {
            if (!pool.tokenASymbol || !pool.tokenBSymbol) {
                try {
                    // Try to get token symbols from Metaplex metadata
                    // Handle both camelCase and snake_case field names
                    const tokenAMint = pool.tokenAMint || pool.token_a_mint;
                    const tokenBMint = pool.tokenBMint || pool.token_b_mint;
                    
                    if (!pool.tokenASymbol && tokenAMint) {
                        const tokenAInfo = await window.TokenDisplayUtils.queryTokenMetadata(tokenAMint, connection);
                        pool.tokenASymbol = tokenAInfo?.symbol || `${tokenAMint.slice(0, 4)}`;
                    }
                    
                    if (!pool.tokenBSymbol && tokenBMint) {
                        const tokenBInfo = await window.TokenDisplayUtils.queryTokenMetadata(tokenBMint, connection);
                        pool.tokenBSymbol = tokenBInfo?.symbol || `${tokenBMint.slice(0, 4)}`;
                    }
                    
                    console.log(`✅ Pool ${pool.address.slice(0, 8)}: ${pool.tokenASymbol}/${pool.tokenBSymbol}`);
                } catch (e) {
                    console.warn(`⚠️ Could not fetch token info for pool ${pool.address}:`, e);
                    // Fallback to address prefixes
                    const tokenAMint = pool.tokenAMint || pool.token_a_mint;
                    const tokenBMint = pool.tokenBMint || pool.token_b_mint;
                    if (!pool.tokenASymbol && tokenAMint) pool.tokenASymbol = `${tokenAMint.slice(0, 4)}`;
                    if (!pool.tokenBSymbol && tokenBMint) pool.tokenBSymbol = `${tokenBMint.slice(0, 4)}`;
                }
            }
        }
    } catch (error) {
        console.error('❌ Error enriching pools with token symbols:', error);
    }
}

/**
 * Start periodic updates
 */
function startPeriodicUpdates() {
    // Update every 2 minutes (120 seconds)
    setInterval(async () => {
        try {
            await loadPoolsData();
        } catch (error) {
            console.error('❌ Periodic update failed:', error);
        }
    }, 120000);
}

/**
 * Refresh pools manually
 */
async function refreshPools() {
    try {
        const refreshBtn = document.querySelector('.refresh-btn');
        refreshBtn.disabled = true;
        refreshBtn.textContent = '🔄 Refreshing...';
        
        await loadPoolsData();
        
        refreshBtn.disabled = false;
        refreshBtn.textContent = '🔄 Refresh';
        
        // Show success message
        showStatusMessage('Pools refreshed successfully!', 'success');
        
    } catch (error) {
        console.error('❌ Manual refresh failed:', error);
        showError(`Refresh failed: ${error.message}`);
        
        const refreshBtn = document.querySelector('.refresh-btn');
        refreshBtn.disabled = false;
        refreshBtn.textContent = '🔄 Refresh';
    }
}

/**
 * Create token image HTML using PHP cache (server-side)
 */
function createTokenImageHTML(mintAddress, symbol) {
    const safeSymbol = (symbol || 'T').toString().replace(/["'<>]/g, '');
    const cacheUrl = `token-image.php?mint=${encodeURIComponent(mintAddress)}`;
    const fallbackSvg = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='40' fill='%23667eea'/><text x='50' y='60' text-anchor='middle' fill='white' font-size='30'>${safeSymbol.charAt(0)}</text></svg>`;
    const onErrorHandler = `this.src='${fallbackSvg}'; this.onerror=null;`;
    return `<img class="token-image" src="${cacheUrl}" alt="${safeSymbol}" title="${safeSymbol}" onerror="${onErrorHandler}">`;
}

/**
 * Render the pools list
 */
function renderPools() {
    const container = document.getElementById('pools-container');
    
    console.log('🐛 renderPools called with', pools.length, 'pools');

    if (pools.length === 0) {
        connection.getAccountInfo(new solanaWeb3.PublicKey(CONFIG.programId))
            .then(programAccount => {
                if (!programAccount) {
                    // 🛡️ SECURITY FIX: Use safe DOM manipulation for program not deployed message
                    container.innerHTML = ''; // Clear existing content
                    const loadingDiv = document.createElement('div');
                    loadingDiv.className = 'loading';
                    
                    const h3 = document.createElement('h3');
                    h3.textContent = '🚧 Program Not Deployed';
                    loadingDiv.appendChild(h3);
                    
                    const p = document.createElement('p');
                    p.textContent = 'The Fixed Ratio Trading program is not deployed on this testnet.';
                    loadingDiv.appendChild(p);
                    
                    container.appendChild(loadingDiv);
                } else {
                    // 🛡️ SECURITY FIX: Use safe DOM manipulation for no pools message
                    container.innerHTML = ''; // Clear existing content
                    const loadingDiv = document.createElement('div');
                    loadingDiv.className = 'loading';
                    
                    const h3 = document.createElement('h3');
                    h3.textContent = '📭 No pools found';
                    loadingDiv.appendChild(h3);
                    
                    const p = document.createElement('p');
                    p.textContent = 'No Fixed Ratio Trading pools detected on this network.';
                    loadingDiv.appendChild(p);
                    
                    container.appendChild(loadingDiv);
                }
            })
            .catch(() => {
                // 🛡️ SECURITY FIX: Use safe DOM manipulation for no pools message (catch)
                container.innerHTML = ''; // Clear existing content
                const loadingDiv = document.createElement('div');
                loadingDiv.className = 'loading';
                
                const h3 = document.createElement('h3');
                h3.textContent = '📭 No pools found';
                loadingDiv.appendChild(h3);
                
                const p = document.createElement('p');
                p.textContent = 'No Fixed Ratio Trading pools detected on this network.';
                loadingDiv.appendChild(p);
                
                container.appendChild(loadingDiv);
            });
        
        // Disable action bar when no pools
        setSelectedPool(null);
        return;
    }

    const list = document.createElement('div');
    list.className = 'pool-listbox';

    pools.forEach(pool => {
        console.log('🐛 Processing pool:', pool.address, 'symbols:', pool.tokenASymbol, pool.tokenBSymbol);
        console.log('🐛 Pool tokenAMint:', pool.tokenAMint, 'tokenBMint:', pool.tokenBMint);
        
        let displayInfo = null;
        try {
            // Only call getCentralizedDisplayInfo if we have the required fields
            if (pool.tokenAMint && pool.tokenBMint && pool.ratioADecimal !== undefined && pool.ratioBDecimal !== undefined) {
                displayInfo = window.TokenDisplayUtils?.getCentralizedDisplayInfo(pool);
                console.log('🐛 Display info:', displayInfo);
            } else {
                console.log('🐛 Skipping getCentralizedDisplayInfo - missing required fields');
            }
        } catch (e) {
            console.warn('🐛 Error getting display info:', e);
        }
        
        const pairName = displayInfo ? displayInfo.pairName : `${pool.tokenASymbol || 'Unknown'}/${pool.tokenBSymbol || 'Unknown'}`;
        const ratioText = displayInfo ? displayInfo.ratioDisplay : '1:1';

        const item = document.createElement('div');
        item.className = 'pool-item';
        item.onclick = () => setSelectedPool(pool.address);
        item.dataset.address = pool.address;
        
        // Create address section with copy button
        const addressSection = document.createElement('div');
        addressSection.className = 'address-section';
        
        const addressText = document.createElement('span');
        addressText.className = 'address-text';
        addressText.textContent = window.CopyUtils?.formatAddressForDisplay(pool.address) || pool.address.slice(0, 8) + '...';
        
        const copyButton = window.CopyUtils?.createCopyButton(pool.address, '📋') || document.createElement('button');
        
        addressSection.appendChild(addressText);
        addressSection.appendChild(copyButton);
        
        // Build inline pair with images and ratio, ensuring the token with whole number 1 is first
        const tokenAMint = pool.tokenAMint || pool.token_a_mint;
        const tokenBMint = pool.tokenBMint || pool.token_b_mint;
        const order = window.TokenDisplayUtils?.getDisplayTokenOrder(pool);
        const isReversed = !!order?.isReversed;
        const baseSymbol = order?.baseToken || pool.tokenASymbol || 'Token A';
        const quoteSymbol = order?.quoteToken || pool.tokenBSymbol || 'Token B';
        const baseMint = isReversed ? tokenBMint : tokenAMint;
        const quoteMint = isReversed ? tokenAMint : tokenBMint;
        const ratioDisplay = window.TokenDisplayUtils?.getCentralizedRatioDisplay(pool) || ratioText;

        // 🛡️ SECURITY FIX: Use safe DOM manipulation for pool list item
        item.innerHTML = '';
        const pairInline = document.createElement('div');
        pairInline.className = 'pair-inline';

        const baseSpan = document.createElement('span');
        baseSpan.className = 'token-inline';
        if (baseMint) {
            const imgWrapper = document.createElement('span');
            imgWrapper.innerHTML = createTokenImageHTML(baseMint, baseSymbol); // Controlled HTML
            baseSpan.appendChild(imgWrapper);
        }
        const baseSymbolSpan = document.createElement('span');
        baseSymbolSpan.className = 'pair-symbol';
        baseSymbolSpan.textContent = baseSymbol;
        baseSpan.appendChild(baseSymbolSpan);
        pairInline.appendChild(baseSpan);

        const slash = document.createElement('span');
        slash.className = 'slash';
        slash.textContent = '/';
        pairInline.appendChild(slash);

        const quoteSpan = document.createElement('span');
        quoteSpan.className = 'token-inline';
        if (quoteMint) {
            const imgWrapper2 = document.createElement('span');
            imgWrapper2.innerHTML = createTokenImageHTML(quoteMint, quoteSymbol); // Controlled HTML
            quoteSpan.appendChild(imgWrapper2);
        }
        const quoteSymbolSpan = document.createElement('span');
        quoteSymbolSpan.className = 'pair-symbol';
        quoteSymbolSpan.textContent = quoteSymbol;
        quoteSpan.appendChild(quoteSymbolSpan);
        pairInline.appendChild(quoteSpan);

        const ratioSpan = document.createElement('span');
        ratioSpan.className = 'ratio-inline';
        ratioSpan.textContent = `ratio ${ratioDisplay}`;
        pairInline.appendChild(ratioSpan);

        item.appendChild(pairInline);
        item.appendChild(addressSection);
        list.appendChild(item);
    });

    container.innerHTML = '';
    container.appendChild(list);
    
    // Preserve selection if any
    if (window._selectedPoolAddress) {
        highlightSelectedItem(window._selectedPoolAddress);
    }
}

/**
 * Set the selected pool
 */
function setSelectedPool(poolAddress) {
    window._selectedPoolAddress = poolAddress;
    
    if (poolAddress) {
        highlightSelectedItem(poolAddress);
        enableActionButtons();
    } else {
        highlightSelectedItem('');
        disableActionButtons();
    }
}

/**
 * Highlight the selected pool item
 */
function highlightSelectedItem(address) {
    document.querySelectorAll('.pool-item').forEach(el => {
        el.classList.toggle('selected', el.dataset.address === address);
    });
}

/**
 * Enable action buttons when a pool is selected
 */
function enableActionButtons() {
    const liquidityBtn = document.getElementById('pool-liquidity-btn');
    const swapBtn = document.getElementById('pool-swap-btn');
    
    if (liquidityBtn) liquidityBtn.classList.add('active');
    if (swapBtn) swapBtn.classList.add('active');
}

/**
 * Disable action buttons when no pool is selected
 */
function disableActionButtons() {
    const liquidityBtn = document.getElementById('pool-liquidity-btn');
    const swapBtn = document.getElementById('pool-swap-btn');
    
    if (liquidityBtn) liquidityBtn.classList.remove('active');
    if (swapBtn) swapBtn.classList.remove('active');
}

/**
 * Navigate to liquidity page for selected pool
 */
function goLiquiditySelected() {
    if (!window._selectedPoolAddress) {
        showError('Please select a pool first');
        return;
    }
    
    // Navigate to liquidity page with pool ID in URL for direct access
    window.location.href = `liquidity.html?pool=${window._selectedPoolAddress}`;
}

/**
 * Navigate to swap page for selected pool
 */
function goSwapSelected() {
    if (!window._selectedPoolAddress) {
        showError('Please select a pool first');
        return;
    }
    
    // Navigate to swap page with pool ID in URL for direct access
    window.location.href = `swap.html?pool=${window._selectedPoolAddress}`;
}

/**
 * Update the last updated timestamp
 */
function updateLastUpdated() {
    lastUpdate = new Date();
    const lastUpdatedEl = document.getElementById('last-updated');
    if (lastUpdatedEl) {
        lastUpdatedEl.textContent = lastUpdate.toLocaleString();
    }
}

/**
 * Show an error message
 */
function showError(message) {
    const container = document.getElementById('error-container');
    if (container) {
        // 🛡️ SECURITY FIX: Use safe DOM manipulation for error messages
        container.innerHTML = ''; // Clear existing content
        const errorDiv = document.createElement('div');
        errorDiv.style.background = '#fee2e2';
        errorDiv.style.color = '#991b1b';
        errorDiv.style.padding = '15px';
        errorDiv.style.borderRadius = '6px';
        errorDiv.style.marginBottom = '20px';
        errorDiv.style.border = '1px solid #fecaca';
        
        const strong = document.createElement('strong');
        strong.textContent = 'Error: ';
        const messageText = document.createTextNode(message);
        errorDiv.appendChild(strong);
        errorDiv.appendChild(messageText);
        
        container.appendChild(errorDiv);
    }
    console.error('❌ Error:', message);
}

/**
 * Show a status message
 */
function showStatusMessage(message, type = 'info') {
    const container = document.getElementById('error-container');
    if (container) {
        const bgColor = type === 'success' ? '#dcfce7' : '#dbeafe';
        const textColor = type === 'success' ? '#166534' : '#1e40af';
        const borderColor = type === 'success' ? '#bbf7d0' : '#bfdbfe';
        
        // 🛡️ SECURITY FIX: Use safe DOM manipulation for status messages
        container.innerHTML = ''; // Clear existing content
        const statusDiv = document.createElement('div');
        statusDiv.style.background = bgColor;
        statusDiv.style.color = textColor;
        statusDiv.style.padding = '15px';
        statusDiv.style.borderRadius = '6px';
        statusDiv.style.marginBottom = '20px';
        statusDiv.style.border = `1px solid ${borderColor}`;
        statusDiv.textContent = message; // Use textContent to prevent XSS
        
        container.appendChild(statusDiv);
        
        // Auto-hide after 3 seconds
        setTimeout(() => {
            if (container.contains(statusDiv)) {
                container.removeChild(statusDiv);
            }
        }, 3000);
    }
}
