// Fixed Ratio Trading Dashboard - JavaScript Logic
// Connects to Solana validator and displays real-time pool information
// Configuration is loaded from config.js

// Global state
let connection = null;
let pools = [];
let lastUpdate = null;
let contractVersion = null;
// Phase 2.2: Treasury and System State variables
let mainTreasuryState = null;
let systemState = null;

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Fixed Ratio Trading Dashboard initializing...');
    await initializeDashboard();
});

// loadInitialStateFromJSON function removed - now using centralized TradingDataService

/**
 * Initialize the dashboard connection and start monitoring
 */
async function initializeDashboard() {
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
        
        // Validate security settings
        validateSecurityConfig();
        
        // Check if returning from liquidity page
        const poolToUpdate = sessionStorage.getItem('poolToUpdate');
        if (poolToUpdate) {
            console.log('🔄 Returning from liquidity page, will update pool:', poolToUpdate);
            sessionStorage.removeItem('poolToUpdate'); // Clear the flag
        }
        
        // Initialize Solana connection FIRST
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
            connectionConfig.wsEndpoint = false; // Explicitly disable WebSocket
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
        
        // Now initialize centralized data service WITH the connection
        await window.TradingDataService.initialize(window.CONFIG, connection);
        console.log('✅ TradingDataService initialized with RPC connection');
        
        // Load initial state using centralized service (RPC only)
        const initialState = await window.TradingDataService.loadAllData('rpc');
        if (initialState.pools.length > 0) {
            pools = initialState.pools;
            console.log(`📁 Pre-loaded ${pools.length} pools via TradingDataService`);
            
            // Fetch token symbols for all pools
            console.log('🔍 Fetching token symbols for pools...');
            await enrichPoolsWithTokenSymbols(pools);
            console.log('✅ Token symbols loaded for all pools');
        }
        
        // Store treasury and system state data
        if (initialState.mainTreasuryState) {
            mainTreasuryState = initialState.mainTreasuryState;
            console.log('🏛️ Loaded treasury state via TradingDataService');
        }
        if (initialState.systemState) {
            systemState = initialState.systemState;
            console.log('⚙️ Loaded system state via TradingDataService');
        }
        
        // Update treasury and system state displays
        updateTreasuryStateDisplay();
        updateSystemStateDisplay();
        
        // Show cache clear helper if we detect stale data issues
        checkForStaleDataIssues();
        
        // Check if program is deployed
        const programAccount = await connection.getAccountInfo(new solanaWeb3.PublicKey(CONFIG.programId));
        if (!programAccount) {
            console.warn('⚠️ Fixed Ratio Trading program not found - continuing with demo mode');
            showError('Fixed Ratio Trading program not deployed. Run `cargo build-sbf && solana program deploy` to deploy the program, or continue in demo mode.');
        }
        
        // Fetch contract version (non-blocking)
        try {
            await fetchContractVersion();
        } catch (versionError) {
            console.warn('⚠️ Could not fetch contract version:', versionError);
        }
        
        // Update title with version (or keep original if failed)
        updateTitle();
        
        // Load initial data (non-blocking for missing program)
        try {
            await refreshData();
            
            // If returning from liquidity page, update the specific pool
            if (poolToUpdate) {
                setTimeout(async () => {
                    console.log('🔄 Auto-updating pool after liquidity addition...');
                    await updatePoolLiquidity(poolToUpdate);
                    showStatus('success', '✅ Pool liquidity updated after adding liquidity!');
                    setTimeout(clearStatus, 3000);
                }, 1000);
            }
        } catch (dataError) {
            console.warn('⚠️ Could not load pool data:', dataError);
            if (!programAccount) {
                // Show demo message instead of error for missing program
                document.getElementById('pools-container').innerHTML = `
                    <div class="loading">
                        <h3>🚧 Demo Mode</h3>
                        <p>Fixed Ratio Trading program not deployed on this testnet.</p>
                        <p>Deploy the program to see real pools, or check the deployment guide.</p>
                    </div>
                `;
            }
        }
        
        // Phase 2.3: Add dashboard state summary
    if (mainTreasuryState || systemState) {
        console.log('🏛️ Enhanced dashboard initialized with:', 
            mainTreasuryState ? 'Treasury State ✅' : 'Treasury State ❌',
            systemState ? 'System State ✅' : 'System State ❌');
    }
    
    console.log('✅ Dashboard initialized successfully');
    } catch (error) {
        console.error('❌ Failed to initialize dashboard:', error);
        showError('Unexpected initialization error: ' + error.message);
    }
}

/**
 * Test the RPC connection
 */
async function testConnection() {
    try {
        const blockHeight = await connection.getBlockHeight();
        document.getElementById('rpc-status').textContent = 'Connected';
        document.getElementById('rpc-status').className = 'status-value online';
        document.getElementById('block-height').textContent = blockHeight.toLocaleString();
        
        // Check if program exists (but don't fail connection test if it doesn't)
        try {
            const programAccount = await connection.getAccountInfo(new solanaWeb3.PublicKey(CONFIG.programId));
            if (programAccount) {
                document.getElementById('program-status').textContent = 'Deployed';
                document.getElementById('program-status').className = 'status-value online';
            } else {
                document.getElementById('program-status').textContent = 'Not Found';
                document.getElementById('program-status').className = 'status-value offline';
            }
        } catch (programError) {
            console.warn('⚠️ Error checking program account:', programError);
            document.getElementById('program-status').textContent = 'Error';
            document.getElementById('program-status').className = 'status-value offline';
        }
    } catch (error) {
        document.getElementById('rpc-status').textContent = 'Offline';
        document.getElementById('rpc-status').className = 'status-value offline';
        throw error;
    }
}

/**
 * Fetch contract version from the smart contract with enhanced user feedback
 */
async function fetchContractVersion() {
    try {
        console.log('🔍 Fetching contract version from smart contract...');
        
        // Update UI to show loading state
        updateVersionStatus('loading', 'Fetching from contract...', 'Loading...');
        
        if (!connection || !CONFIG.programId) {
            console.error('❌ RPC connection or program ID not available');
            const errorMsg = !connection ? 'RPC connection not available' : 'Program ID not configured';
            updateVersionStatus('error', 'Connection Error', errorMsg);
            contractVersion = null;
            updateTitle();
            return;
        }
        
        // Create GetVersion instruction (1-byte discriminator for unit enum!)
        const instructionData = new Uint8Array([14]); // GetVersion = discriminator 14 (1 byte only!)
        
        const instruction = new solanaWeb3.TransactionInstruction({
            keys: [], // GetVersion requires no accounts
            programId: new solanaWeb3.PublicKey(CONFIG.programId),
            data: instructionData,
        });
        
        // Create transaction with proper structure
        const transaction = new solanaWeb3.Transaction().add(instruction);
        
        // Get recent blockhash for proper transaction structure
        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        
        // Call GetVersion on smart contract using the working approach
        let result = null;
        let lastError = null;
        
        console.log('📡 Calling GetVersion instruction on smart contract...');
        console.log('🔍 Debug info:');
        console.log('  Program ID:', CONFIG.programId);
        console.log('  Instruction data:', Array.from(instructionData));
        console.log('  Recent blockhash:', blockhash);
        
        updateVersionStatus('loading', 'Calling smart contract...', 'Loading...');
        
        try {
            // Use an ephemeral, randomly generated keypair for simulation only
            // No SOL is required since we are not submitting the transaction on-chain
            const keypair = solanaWeb3.Keypair.generate();
            console.log('🔑 Using ephemeral keypair for simulation:', keypair.publicKey.toString());
            
            // Create signed transaction for simulation
            const signedTransaction = new solanaWeb3.Transaction().add(instruction);
            signedTransaction.recentBlockhash = blockhash;
            signedTransaction.feePayer = keypair.publicKey;
            signedTransaction.sign(keypair);
            
            // Try simulation without signature verification to avoid requiring an existing payer
            // If RPC supports it, this prevents AccountNotFound for the ephemeral fee payer
            const simOptions = { sigVerify: false, replaceRecentBlockhash: true, commitment: CONFIG.commitment || 'confirmed' };
            try {
                result = await connection.simulateTransaction(signedTransaction, simOptions);
            } catch (simErr) {
                console.log('ℹ️ simulateTransaction with options failed, retrying default:', simErr?.message || simErr);
                result = await connection.simulateTransaction(signedTransaction);
            }

            // If the fee payer account doesn't exist, request a tiny airdrop and retry once
            const isAccountNotFound = (res) => {
                try {
                    if (!res) return false;
                    if (res.value && res.value.err) {
                        const errStr = JSON.stringify(res.value.err);
                        return errStr && errStr.includes('AccountNotFound');
                    }
                } catch (_) { /* ignore */ }
                return false;
            };
            if (isAccountNotFound(result)) {
                console.log('💧 Fee payer account not found. Requesting small airdrop for ephemeral keypair and retrying simulation...');
                try {
                    const airdropSig = await connection.requestAirdrop(keypair.publicKey, 1_000_000); // 0.001 SOL
                    if (airdropSig) {
                        await connection.confirmTransaction({ signature: airdropSig, ...(await connection.getLatestBlockhash()) }, CONFIG.commitment || 'confirmed');
                    }
                    // Retry simulation after airdrop
                    try {
                        result = await connection.simulateTransaction(signedTransaction, simOptions);
                    } catch (_) {
                        result = await connection.simulateTransaction(signedTransaction);
                    }
                } catch (airdropErr) {
                    console.log('⚠️ Airdrop attempt failed or unavailable on this cluster:', airdropErr?.message || airdropErr);
                }
            }
            
            console.log('📋 Smart contract simulation result:');
            console.log('  Error:', result?.value?.err);
            console.log('  Logs available:', !!result?.value?.logs);
            if (result?.value?.logs) {
                console.log('  Logs:', result.value.logs);
            }
            
        } catch (error) {
            console.log('⚠️ Smart contract call failed:', error.message);
            lastError = error;
        }
        
        // Parse version from logs if we got a result
        if (result && !result.value.err && result.value.logs) {
            console.log('📋 Contract version logs:', result.value.logs);
            
            // Look for "Contract Version: X.X.X" in logs
            const versionLog = result.value.logs.find(log => log.includes('Contract Version:'));
            if (versionLog) {
                const versionMatch = versionLog.match(/Contract Version:\s*([0-9\.]+)/);
                if (versionMatch) {
                    contractVersion = versionMatch[1];
                    updateVersionStatus('success', `v${contractVersion}`, 'Successfully fetched');
                    updateTitle();
                    console.log(`✅ Contract version fetched from blockchain: ${contractVersion}`);
                    
                    // Show success notification
                    showStatus('success', `✅ Contract version v${contractVersion} fetched successfully!`);
                    return;
                }
            }
        }
        
        // If we reach here, contract call failed to return version
        console.error('❌ Failed to extract version from contract response');
        let errorDetail = 'Unknown error';
        
        if (result && result.value.err) {
            console.error('   Simulation error:', result.value.err);
            errorDetail = `RPC Simulation Error: ${JSON.stringify(result.value.err)}`;
            updateVersionStatus('error', 'Simulation Failed', 'RPC simulation error');
        } else if (lastError) {
            console.error('   Last error:', lastError.message);
            errorDetail = `Network Error: ${lastError.message}`;
            updateVersionStatus('error', 'Network Failed', 'Connection issue');
        } else {
            errorDetail = 'Contract did not return version information';
            updateVersionStatus('error', 'No Version Found', 'Contract logs missing version');
        }
        
        // Show error notification to user
        showStatus('error', `❌ Version fetch failed: ${errorDetail}`);
        
        contractVersion = null;
        updateTitle();
        
    } catch (error) {
        console.error('❌ Error fetching contract version:', error);
        updateVersionStatus('error', 'Fetch Failed', `Exception: ${error.message}`);
        showStatus('error', `❌ Version fetch error: ${error.message}`);
        contractVersion = null;
        updateTitle();
    }
}

/**
 * Update version status UI elements
 */
function updateVersionStatus(type, version, status) {
    const versionElement = document.getElementById('contract-version');
    const statusElement = document.getElementById('version-status');
    const actionsElement = document.getElementById('version-actions');
    
    if (versionElement) {
        versionElement.textContent = version;
        versionElement.className = `status-value ${type}`;
    }
    
    if (statusElement) {
        statusElement.textContent = status;
        statusElement.className = `status-value ${type}`;
    }
    
    if (actionsElement) {
        // Show retry button only if there's an error
        if (type === 'error') {
            actionsElement.style.display = 'block';
        } else {
            actionsElement.style.display = 'none';
        }
    }
}

/**
 * Retry version fetch (called from retry button)
 */
async function retryVersionFetch() {
    console.log('🔄 Retrying version fetch...');
    const retryBtn = document.getElementById('retry-version');
    
    if (retryBtn) {
        retryBtn.disabled = true;
        retryBtn.textContent = '⏳ Retrying...';
    }
    
    try {
        await fetchContractVersion();
    } finally {
        if (retryBtn) {
            retryBtn.disabled = false;
            retryBtn.textContent = '🔄 Retry';
        }
    }
}

// Make retryVersionFetch available globally for HTML onclick
window.retryVersionFetch = retryVersionFetch;

/**
 * Update the page title with contract version
 */
function updateTitle() {
    const titleElement = document.querySelector('.header h1');
    if (titleElement) {
        // Always show plain page title without emoji or version
        titleElement.textContent = 'Dashboard';
    }
}

/**
 * Refresh all dashboard data
 */
async function refreshData() {
    console.log('🔄 Refreshing dashboard data...');
    
    const refreshBtn = document.querySelector('.refresh-btn');
    if (refreshBtn) {
        refreshBtn.disabled = true;
        refreshBtn.textContent = '🔄 Refreshing...';
    }
    
    try {
        // Clear any existing errors
        clearError();
        
        // Update connection status
        await testConnection();
        
        // Check if program exists before scanning on-chain pools
        const programAccount = await connection.getAccountInfo(new solanaWeb3.PublicKey(CONFIG.programId));
        if (!programAccount) {
            console.warn('⚠️ Program not detected via getAccountInfo - scanning locally created pools only');
        } else {
            console.log('✅ Program detected - scanning all pools');
        }
        
        // Always scan for pools (including locally created ones)
        await scanForPools();
        
        // Update summary statistics
        updateSummaryStats();
        
        // Render pools
        renderPools();
        
        // Phase 2.3: Refresh treasury and system state data via centralized service (RPC only)
        try {
            const refreshedState = await window.TradingDataService.loadAllData('rpc');
            if (refreshedState.mainTreasuryState !== undefined) {
                mainTreasuryState = refreshedState.mainTreasuryState;
                updateTreasuryStateDisplay();
                console.log('🏛️ Treasury state refreshed via TradingDataService');
            }
            if (refreshedState.systemState !== undefined) {
                systemState = refreshedState.systemState;
                updateSystemStateDisplay();
                console.log('⚙️ System state refreshed via TradingDataService');
            }
        } catch (stateError) {
            console.warn('⚠️ Could not refresh treasury/system state:', stateError);
        }
        
        // Update timestamp
        lastUpdate = new Date();
        document.getElementById('last-updated').textContent = lastUpdate.toLocaleTimeString();
        
        console.log(`✅ Dashboard refreshed - Found ${pools.length} pools`);
    } catch (error) {
        console.error('❌ Error refreshing dashboard:', error);
        showError('Error refreshing data: ' + error.message);
    } finally {
        if (refreshBtn) {
            refreshBtn.disabled = false;
            refreshBtn.textContent = '🔄 Refresh';
        }
    }
}

/**
 * Scan for Fixed Ratio Trading pools (prioritize RPC data over sessionStorage)
 */
async function scanForPools() {
    try {
        console.log('🔍 Scanning for pools...');
        
        let onChainPools = [];
        let localPools = [];
        
        // Try to get on-chain pools first (prioritize RPC data)
        try {
            const programAccounts = await connection.getProgramAccounts(
                new solanaWeb3.PublicKey(CONFIG.programId),
                { encoding: 'base64' } // Required for proper data retrieval
            );
            
            console.log(`Found ${programAccounts.length} program accounts`);
            
            // Debug: Show all found accounts
            programAccounts.forEach((account, index) => {
                console.log(`Account ${index + 1}:`, {
                    address: account.pubkey.toString(),
                    dataLength: account.account.data.length,
                    owner: account.account.owner.toString(),
                    executable: account.account.executable,
                    lamports: account.account.lamports
                });
            });
            
            const poolPromises = programAccounts.map(async (account) => {
                try {
                    // Filter out accounts that are too small to be pools
                    // Pool states should be 300+ bytes, Treasury ~120 bytes, SystemState ~83 bytes
                    if (account.account.data.length < 300) {
                        console.log(`⏭️ Skipping account ${account.pubkey.toString()} (${account.account.data.length} bytes) - too small for pool state`);
                        return null;
                    }
                    
                    console.log(`🔍 Attempting to parse account ${account.pubkey.toString()} with ${account.account.data.length} bytes`);
                    const poolData = window.TradingDataService.parsePoolState(account.account.data, account.pubkey.toString());
                    return poolData;
                } catch (error) {
                    console.warn(`Failed to parse pool at ${account.pubkey.toString()}:`, error);
                    return null;
                }
            });
            
            const poolResults = await Promise.all(poolPromises);
            onChainPools = poolResults.filter(pool => pool !== null);
            
            console.log(`✅ Successfully parsed ${onChainPools.length} on-chain pools`);
            // Enrich with token decimals so centralized display has required fields
            if (onChainPools.length > 0 && window.TokenDisplayUtils?.getTokenDecimals) {
                await Promise.all(onChainPools.map(async (pool) => {
                    try {
                        const [decA, decB] = await Promise.all([
                            window.TokenDisplayUtils.getTokenDecimals(pool.tokenAMint, connection),
                            window.TokenDisplayUtils.getTokenDecimals(pool.tokenBMint, connection)
                        ]);
                        pool.ratioADecimal = decA;
                        pool.ratioBDecimal = decB;
                        pool.ratioAActual = (pool.ratioANumerator || pool.ratio_a_numerator || 0) / Math.pow(10, decA);
                        pool.ratioBActual = (pool.ratioBDenominator || pool.ratio_b_denominator || 0) / Math.pow(10, decB);
                    } catch (e) {
                        console.warn('⚠️ Failed to enrich pool with decimals:', pool.address, e?.message);
                    }
                }));
            }
        } catch (error) {
            console.warn('⚠️ Error scanning on-chain pools (this is normal if program not deployed):', error);
        }
        
        // Use sessionStorage data as fallback if no on-chain pools found
        if (onChainPools.length === 0) {
            try {
                const storedPoolsRaw = sessionStorage.getItem('createdPools') || '[]';
                console.log('📦 No on-chain pools found, checking sessionStorage...');
                
                const storedPools = JSON.parse(storedPoolsRaw);
                console.log('📦 Found stored pools:', storedPools.length);
                
                // Convert sessionStorage pools that don't conflict with existing data
                const sessionPools = storedPools.map(pool => {
                    const converted = {
                        address: pool.address,
                        isInitialized: pool.isInitialized,
                        isPaused: pool.isPaused,
                        swapsPaused: pool.swapsPaused,
                        tokenAMint: pool.tokenAMint,
                        tokenBMint: pool.tokenBMint,
                        tokenALiquidity: pool.totalTokenALiquidity || 0,
                        tokenBLiquidity: pool.totalTokenBLiquidity || 0,
                        ratioANumerator: pool.ratio,
                        ratioBDenominator: 1,
                        swapFeeBasisPoints: pool.swapFeeBasisPoints || 0,
                        collectedFeesTokenA: pool.collectedFeesTokenA || 0,
                        collectedFeesTokenB: pool.collectedFeesTokenB || 0,
                        collectedSolFees: pool.collectedSolFees || 0,
                        owner: pool.creator,
                        tokenASymbol: pool.tokenASymbol,
                        tokenBSymbol: pool.tokenBSymbol,
                        dataSource: 'sessionStorage' // Mark data source
                    };
                    return converted;
                });
                
                // If we have pre-loaded pools from JSON, merge with session pools
                if (pools.length > 0) {
                    const existingAddresses = new Set(pools.map(p => p.address));
                    const newSessionPools = sessionPools.filter(p => !existingAddresses.has(p.address));
                    localPools = [...pools, ...newSessionPools];
                    console.log(`📦 Merged ${pools.length} JSON pools with ${newSessionPools.length} new session pools`);
                } else {
                    localPools = sessionPools;
                    console.log(`📦 Using ${localPools.length} sessionStorage pools as fallback`);
                }
            } catch (error) {
                console.warn('⚠️ Error loading local pools:', error);
                localPools = pools; // Keep JSON-loaded pools if sessionStorage fails
            }
        } else {
            console.log('🎯 Using on-chain data only (ignoring other sources)');
        }
        
        // Use on-chain pools only; no state.json merge
        if (onChainPools.length > 0) {
            pools = onChainPools;
            console.log(`✅ Loaded ${pools.length} pools from RPC`);
        } else {
            // Fallback to sessionStorage only if no on-chain data
            pools = localPools;
            console.log(`📦 Loaded ${pools.length} pools from sessionStorage (fallback)`);
        }
        
        // Enrich pools with token symbols (for pools without symbols from sessionStorage)
        if (pools.length > 0) {
            console.log('🔍 Enriching pools with token symbols...');
            await enrichPoolsWithTokenSymbols(pools.filter(pool => !pool.tokenASymbol || !pool.tokenBSymbol));
            console.log('✅ Token symbols enriched for all pools');
        }
        
    } catch (error) {
        console.error('❌ Error scanning for pools:', error);
        throw error;
    }
}

// parsePoolState function removed - now using centralized TradingDataService.parsePoolState()

/**
 * Enrich pools with token symbols by fetching them from localStorage/Metaplex
 */
async function enrichPoolsWithTokenSymbols(pools) {
    if (!pools || pools.length === 0) return;
    
    try {
        // Process pools in parallel for better performance
        await Promise.all(pools.map(async (pool) => {
            if (pool.tokenAMint && pool.tokenBMint) {
                const tokenSymbols = await getTokenSymbols(pool.tokenAMint, pool.tokenBMint);
                pool.tokenASymbol = tokenSymbols.tokenA;
                pool.tokenBSymbol = tokenSymbols.tokenB;
                console.log(`✅ Pool ${pool.address.slice(0, 8)}: ${tokenSymbols.tokenA}/${tokenSymbols.tokenB}`);
            }
        }));
    } catch (error) {
        console.warn('❌ Error enriching pools with token symbols:', error);
    }
}

/**
 * Try to get token symbols from Metaplex metadata, or use defaults
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
 * Get token symbol from Metaplex, or default
 */
async function getTokenSymbol(tokenMint, tokenLabel) {
    try {
        // Try Metaplex metadata
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
 * Query Metaplex Token Metadata Program for token metadata
 */
async function queryTokenMetadata(tokenMintAddress) {
    try {
        // Get Token Metadata Program ID from config
        const TOKEN_METADATA_PROGRAM_ID = window.TRADING_CONFIG?.metaplex?.tokenMetadataProgramId 
            ? new solanaWeb3.PublicKey(window.TRADING_CONFIG.metaplex.tokenMetadataProgramId)
            : null;
        
        if (!TOKEN_METADATA_PROGRAM_ID) {
            console.warn('⚠️ No Metaplex config found, skipping metadata query');
            return null;
        }
        const tokenMint = new solanaWeb3.PublicKey(tokenMintAddress);
        
        // Derive metadata account PDA
        const seeds = [
            new TextEncoder().encode('metadata'),
            TOKEN_METADATA_PROGRAM_ID.toBuffer(),
            tokenMint.toBuffer()
        ];
        
        const [metadataAccount] = solanaWeb3.PublicKey.findProgramAddressSync(
            seeds,
            TOKEN_METADATA_PROGRAM_ID
        );
        
        // Try to fetch the metadata account
        const accountInfo = await connection.getAccountInfo(metadataAccount);
        
        if (!accountInfo) {
            return null;
        }
        
        // Basic parsing of metadata structure
        const data = accountInfo.data;
        let offset = 1; // Skip key byte
        offset += 32; // Skip update authority
        offset += 32; // Skip mint
        
        // Read name length and name
        const nameLength = data.readUInt32LE(offset);
        offset += 4;
        const name = data.slice(offset, offset + nameLength).toString('utf8').replace(/\0/g, '');
        offset += nameLength;
        
        // Read symbol length and symbol  
        const symbolLength = data.readUInt32LE(offset);
        offset += 4;
        const symbol = data.slice(offset, offset + symbolLength).toString('utf8').replace(/\0/g, '');
        
        return {
            name: name.trim(),
            symbol: symbol.trim()
        };
        
    } catch (error) {
        console.warn(`❌ Error querying token metadata for ${tokenMintAddress}:`, error);
        return null;
    }
}

/**
 * Update summary statistics
 * Phase 2.3: Enhanced with treasury state integration
 */
function updateSummaryStats() {
    const totalPools = pools.length;
    const activePools = pools.filter(pool => !pool.isPaused && !pool.swapsPaused).length;
    const pausedPools = pools.filter(pool => pool.isPaused || pool.swapsPaused).length;
    
    // Update DOM elements
    document.getElementById('total-pools').textContent = totalPools;
    document.getElementById('active-pools').textContent = activePools;
    document.getElementById('paused-pools').textContent = pausedPools;
    const feesEl = document.getElementById('total-fees');
    const poolFeesEl = document.getElementById('pool-fees-sol');
    // Contract fees from treasury (lamports → SOL)
    if (feesEl) {
        if (mainTreasuryState) {
            const lamports = 
                (mainTreasuryState.total_pool_creation_fees||0) +
                (mainTreasuryState.total_liquidity_fees||0) +
                (mainTreasuryState.total_regular_swap_fees||0) +
                (mainTreasuryState.total_swap_contract_fees||0);
            feesEl.textContent = `${(lamports/1_000_000_000).toFixed(4)} SOL`;
        } else {
            feesEl.textContent = '--';
        }
    }
    // Aggregate pool-side SOL fees if available on pools
    if (poolFeesEl) {
        try {
            const sumLamports = pools.reduce((sum, p) => sum + (p.collectedLiquidityFees||0) + (p.collectedSwapContractFees||0) + (p.totalSolFeesCollected||0), 0);
            poolFeesEl.textContent = `${(sumLamports/1_000_000_000).toFixed(4)} SOL`;
        } catch (_) {
            poolFeesEl.textContent = '-- SOL';
        }
    }
    
    // Phase 2.3: Add system status indicator
    updateSystemStatusIndicator();
}

/**
 * Render individual pool cards
 */
function renderPools() {
    const container = document.getElementById('pools-container');

    // Build listbox instead of grid
    if (pools.length === 0) {
        connection.getAccountInfo(new solanaWeb3.PublicKey(CONFIG.programId))
            .then(programAccount => {
                if (!programAccount) {
                    container.innerHTML = `
                        <div class="loading">
                            <h3>🚧 Program Not Deployed</h3>
                            <p>The Fixed Ratio Trading program is not deployed on this testnet.</p>
                        </div>
                    `;
                } else {
                    container.innerHTML = `
                        <div class="loading">
                            <h3>📭 No pools found</h3>
                            <p>No Fixed Ratio Trading pools detected on this network.</p>
                        </div>
                    `;
                }
            })
            .catch(() => {
                container.innerHTML = `
                    <div class="loading">
                        <h3>📭 No pools found</h3>
                        <p>No Fixed Ratio Trading pools detected on this network.</p>
                    </div>
                `;
            });
        // Disable action bar when no pools
        setSelectedPool(null);
        return;
    }

    const list = document.createElement('div');
    list.className = 'pool-listbox';

    pools.forEach(pool => {
        const displayInfo = window.TokenDisplayUtils?.getCentralizedDisplayInfo(pool);
        const pairName = displayInfo ? displayInfo.pairName : `${pool.tokenASymbol}/${pool.tokenBSymbol}`;
        const ratioText = displayInfo ? displayInfo.ratioDisplay : '1:1';

        const item = document.createElement('div');
        item.className = 'pool-item';
        item.onclick = () => setSelectedPool(pool.address);
        item.dataset.address = pool.address;
        item.innerHTML = `
            <div class="pair">${pairName}</div>
            <div class="ratio">ratio ${ratioText}</div>
        `;
        list.appendChild(item);
    });

    container.innerHTML = '';
    container.appendChild(list);
    // Preserve selection if any
    if (window._selectedPoolAddress) highlightSelectedItem(window._selectedPoolAddress);
}

/**
 * Create a simplified pool card element (one line per pool)
 * Shows: Token Names, Ratio, and Action Buttons only
 */
function createPoolCard(pool) {
    const card = document.createElement('div');
    card.className = 'pool-card-simple';
    
    // ✅ CENTRALIZED: Use centralized functions for consistent display
    const displayInfo = window.TokenDisplayUtils?.getCentralizedDisplayInfo(pool);
    
    let poolName, ratioText;
    
    if (displayInfo) {
        poolName = displayInfo.pairName;
        ratioText = displayInfo.ratioDisplay;
        
        console.log('✅ CENTRALIZED DISPLAY INFO:', displayInfo);
    } else {
        // Fallback if centralized functions not available
        poolName = `${pool.tokenASymbol}/${pool.tokenBSymbol}`;
        ratioText = "1:1";
        console.warn('⚠️ Centralized display functions not available, using fallback');
    }
    
    // Check if pool is paused
    const flags = window.TokenDisplayUtils.interpretPoolFlags(pool);
    const isPaused = flags.liquidityPaused || flags.swapsPaused;
    const pausedIndicator = isPaused ? ' <span style="color: #ef4444; font-weight: bold;">[PAUSED]</span>' : '';
    
    card.innerHTML = `
        <div class="pool-simple-row">
            <span class="pool-name-ratio">
                <strong>${poolName}</strong> ratio ${ratioText}${pausedIndicator}
            </span>
            <div class="pool-simple-actions">
                <button class="pool-action-btn liquidity-btn" onclick="addLiquidity('${pool.address}')" ${isPaused ? 'disabled' : ''}>
                    Liquidity
                </button>
                <button class="pool-action-btn swap-btn" onclick="swapTokens('${pool.address}')" ${flags.swapsPaused ? 'disabled' : ''}>
                    Swap
                </button>
            </div>
        </div>
    `;
    
    return card;
}

/**
 * Phase 1.3: Generate pool flags section
 * 
 * @param {Object} flags - Interpreted pool flags
 * @param {Object} pool - Pool data
 * @returns {string} HTML for pool flags section
 */
function generatePoolFlagsSection(flags, pool) {
    // Only show flags section if any flags are set or if we have flag data
    const hasFlags = flags.oneToManyRatio || flags.liquidityPaused || flags.swapsPaused || 
                     flags.withdrawalProtection || flags.singleLpTokenMode;
    
    if (!hasFlags && (typeof pool.flags === 'undefined' || pool.flags === 0)) {
        return ''; // No flags to display
    }
    
    const flagItems = [];
    
    // One-to-many ratio configuration
    if (flags.oneToManyRatio) {
        flagItems.push('<span style="background: #3b82f6; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px;">🎯 One-to-Many Ratio</span>');
    }
    
    // Liquidity operations paused
    if (flags.liquidityPaused) {
        flagItems.push('<span style="background: #ef4444; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px;">⏸️ Liquidity Paused</span>');
    }
    
    // Swap operations paused
    if (flags.swapsPaused) {
        flagItems.push('<span style="background: #f59e0b; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px;">🚫 Swaps Paused</span>');
    }
    
    // Withdrawal protection active
    if (flags.withdrawalProtection) {
        flagItems.push('<span style="background: #10b981; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px;">🛡️ Withdrawal Protection</span>');
    }
    
    // Single LP token mode (future feature)
    if (flags.singleLpTokenMode) {
        flagItems.push('<span style="background: #8b5cf6; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px;">🔗 Single LP Mode</span>');
    }
    
    // Show raw flags value for debugging
    const rawFlagsDisplay = typeof pool.flags === 'number' ? 
        `<span style="color: #6b7280; font-size: 10px; margin-left: 8px;">Raw: ${pool.flags} (0b${pool.flags.toString(2).padStart(5, '0')})</span>` : '';
    
    if (flagItems.length === 0 && rawFlagsDisplay) {
        return `
            <div style="margin-top: 10px; padding: 8px; background: #f9fafb; border-radius: 6px; border: 1px solid #e5e7eb;">
                <div style="font-size: 11px; color: #6b7280; margin-bottom: 4px;"><strong>Pool Flags:</strong></div>
                <div>
                    <span style="background: #6b7280; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px;">No Active Flags</span>
                    ${rawFlagsDisplay}
                </div>
            </div>
        `;
    }
    
    if (flagItems.length > 0) {
        return `
            <div style="margin-top: 10px; padding: 8px; background: #f9fafb; border-radius: 6px; border: 1px solid #e5e7eb;">
                <div style="font-size: 11px; color: #6b7280; margin-bottom: 4px;"><strong>Pool Flags:</strong></div>
                <div style="display: flex; flex-wrap: wrap; gap: 4px; align-items: center;">
                    ${flagItems.join(' ')}
                    ${rawFlagsDisplay}
                </div>
            </div>
        `;
    }
    
    return '';
}

/**
 * Show error message
 */
function showError(message) {
    const container = document.getElementById('error-container');
    container.innerHTML = `
        <div class="error">
            <strong>⚠️ Error:</strong> ${message}
        </div>
    `;
}

/**
 * Clear error message
 */
function clearError() {
    document.getElementById('error-container').innerHTML = '';
}

/**
 * Show success message
 */
function showStatus(type, message) {
    const container = document.getElementById('error-container');
    const className = type === 'success' ? 'status-message success' : 
                     type === 'info' ? 'status-message info' : 'error';
    container.innerHTML = `<div class="${className}">${message}</div>`;
}

/**
 * Clear status message  
 */
function clearStatus() {
    document.getElementById('error-container').innerHTML = '';
}

/**
 * Create sample pools for testing (called from UI)
 */
function createSamplePools() {
    alert('Sample pool creation would require implementing pool creation transactions. For now, start the validator and run the test suite to create pools.');
}

/**
 * Format large numbers with appropriate suffixes
 */
function formatNumber(num) {
    if (num >= 1000000000) {
        return (num / 1000000000).toFixed(1) + 'B';
    } else if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
}

/**
 * Force refresh pools with detailed debugging
 */
async function forceRefreshPools() {
    console.log('🐛 FORCE REFRESH: Starting detailed pool debugging...');
    
    // Clear any existing pools
    pools = [];
    
    // Check sessionStorage directly
    const rawData = sessionStorage.getItem('createdPools');
    console.log('🐛 Raw sessionStorage data:', rawData);
    
    if (rawData) {
        try {
            const parsedData = JSON.parse(rawData);
            console.log('🐛 Parsed sessionStorage data:', parsedData);
            console.log('🐛 Number of stored pools:', parsedData.length);
            
            // Show what each pool looks like
            parsedData.forEach((pool, index) => {
                console.log(`🐛 Pool ${index + 1}:`, pool);
            });
            
        } catch (error) {
            console.error('🐛 Error parsing sessionStorage:', error);
        }
    } else {
        console.log('🐛 No sessionStorage data found');
        alert('No pool data found in sessionStorage. Have you created any pools yet?');
        return;
    }
    
    // Force scan for pools
    await scanForPools();
    
    console.log('🐛 After scanning - pools array:', pools);
    console.log('🐛 Number of pools in memory:', pools.length);
    
    // Force update display
    updateSummaryStats();
    renderPools();
    
    // Show alert with results
    alert(`Debug complete!\nFound ${pools.length} pools.\nCheck console for details.`);
}

/**
 * Debug function to test RPC and program accounts
 */
async function debugRPC() {
    console.log('🐛 DEBUG: Testing RPC connection and program accounts...');
    
    try {
        // Test basic RPC
        const blockHeight = await connection.getBlockHeight();
        console.log('✅ RPC Connection working, block height:', blockHeight);
        
        // Test program account
        const programAccount = await connection.getAccountInfo(new solanaWeb3.PublicKey(CONFIG.programId));
        console.log('📦 Program account:', programAccount ? 'EXISTS' : 'NOT FOUND');
        
        if (programAccount) {
            console.log('Program details:', {
                executable: programAccount.executable,
                owner: programAccount.owner.toString(),
                lamports: programAccount.lamports,
                dataLength: programAccount.data.length
            });
        }
        
        // Test getting program accounts
        const programAccounts = await connection.getProgramAccounts(
            new solanaWeb3.PublicKey(CONFIG.programId),
            { encoding: 'base64' }
        );
        
        console.log(`🔍 Found ${programAccounts.length} accounts owned by program:`);
        
        programAccounts.forEach((account, index) => {
            console.log(`  Account ${index + 1}:`, {
                address: account.pubkey.toString(),
                dataLength: account.account.data.length,
                lamports: account.account.lamports,
                rent_exempt: account.account.lamports > 0
            });
            
            // Try to peek at the data
            if (account.account.data.length > 0) {
                const dataArray = new Uint8Array(account.account.data);
                console.log(`    First 20 bytes:`, Array.from(dataArray.slice(0, 20)).map(b => b.toString(16).padStart(2, '0')).join(' '));
                
                // Check if it looks like a pool (check the is_initialized flag)
                if (dataArray.length > 250) {
                    const isInitialized = dataArray[251] !== 0; // Approximate position
                    console.log(`    Appears initialized:`, isInitialized);
                }
            }
        });
        
        return {
            rpcWorking: true,
            programExists: !!programAccount,
            accountCount: programAccounts.length,
            accounts: programAccounts
        };
        
    } catch (error) {
        console.error('❌ Debug RPC failed:', error);
        return { error: error.message };
    }
}

/**
 * Navigate to add liquidity page for a specific pool
 */
function addLiquidity(poolAddress) {
    console.log('🚀 Navigating to add liquidity for pool:', poolAddress);
    
    // Navigate directly to liquidity page with pool parameter
    window.location.href = `liquidity.html?pool=${poolAddress}`;
}

/**
 * Phase 2.1: Navigate to swap page for a specific pool
 */
function swapTokens(poolAddress) {
    console.log('🔄 Navigating to swap tokens for pool:', poolAddress);
    
    // Store the pool address in sessionStorage so the swap page can access it
    sessionStorage.setItem('selectedPoolAddress', poolAddress);
    
    // Navigate to swap page with pool ID in URL for direct access and bookmarking
    window.location.href = `swap.html?pool=${poolAddress}`;
}

// Listbox selection helpers
function setSelectedPool(address) {
    window._selectedPoolAddress = address || null;
    const liqBtn = document.getElementById('pool-liquidity-btn');
    const swapBtn = document.getElementById('pool-swap-btn');
    if (!liqBtn || !swapBtn) return;
    if (address) {
        liqBtn.classList.add('active');
        swapBtn.classList.add('active');
        liqBtn.disabled = false;
        swapBtn.disabled = false;
        liqBtn.style.cursor = 'pointer';
        swapBtn.style.cursor = 'pointer';
        highlightSelectedItem(address);
    } else {
        liqBtn.classList.remove('active');
        swapBtn.classList.remove('active');
        liqBtn.disabled = true;
        swapBtn.disabled = true;
        liqBtn.style.cursor = 'not-allowed';
        swapBtn.style.cursor = 'not-allowed';
        highlightSelectedItem('');
    }
}

function highlightSelectedItem(address) {
    document.querySelectorAll('.pool-item').forEach(el => {
        el.classList.toggle('selected', el.dataset.address === address);
    });
}

function goLiquiditySelected() {
    if (!window._selectedPoolAddress) return;
    addLiquidity(window._selectedPoolAddress);
}

function goSwapSelected() {
    if (!window._selectedPoolAddress) return;
    swapTokens(window._selectedPoolAddress);
}

/**
 * Phase 2.2: Update Treasury State Display
 */
function updateTreasuryStateDisplay() {
    const treasurySection = document.getElementById('treasury-state-section');
    const treasuryContent = document.getElementById('treasury-state-content');
    // If section was removed from DOM, safely exit
    if (!treasurySection || !treasuryContent) return;

    if (!mainTreasuryState) {
        treasurySection.style.display = 'none';
        return;
    }
    
    treasurySection.style.display = 'block';
    treasuryContent.innerHTML = generateTreasuryStateFields();
}

/**
 * Phase 2.2: Generate Treasury State fields display
 */
function generateTreasuryStateFields() {
    if (!mainTreasuryState) return '<div>No treasury state data available</div>';
    
    return `
        <!-- Balance Information -->
        <div class="treasury-state-section">
            <h4 style="color: #ea580c; margin: 0 0 15px 0; border-bottom: 2px solid #fed7aa; padding-bottom: 5px;">💰 Balance Information</h4>
            <div class="state-field"><strong>total_balance:</strong><br><code>${mainTreasuryState.total_balance || 'N/A'} lamports (${((mainTreasuryState.total_balance || 0) / 1000000000).toFixed(4)} SOL)</code></div>
            <div class="state-field"><strong>rent_exempt_minimum:</strong><br><code>${mainTreasuryState.rent_exempt_minimum || 'N/A'} lamports (${((mainTreasuryState.rent_exempt_minimum || 0) / 1000000000).toFixed(4)} SOL)</code></div>
            <div class="state-field"><strong>total_withdrawn:</strong><br><code>${mainTreasuryState.total_withdrawn || 'N/A'} lamports (${((mainTreasuryState.total_withdrawn || 0) / 1000000000).toFixed(4)} SOL)</code></div>
        </div>
        
        <!-- Operation Counters -->
        <div class="treasury-state-section">
            <h4 style="color: #3b82f6; margin: 0 0 15px 0; border-bottom: 2px solid #bfdbfe; padding-bottom: 5px;">📊 Operation Counters</h4>
            <div class="state-field"><strong>pool_creation_count:</strong><br><code>${mainTreasuryState.pool_creation_count || 'N/A'}</code></div>
            <div class="state-field"><strong>liquidity_operation_count:</strong><br><code>${mainTreasuryState.liquidity_operation_count || 'N/A'}</code></div>
            <div class="state-field"><strong>regular_swap_count:</strong><br><code>${mainTreasuryState.regular_swap_count || 'N/A'}</code></div>
            <div class="state-field"><strong>treasury_withdrawal_count:</strong><br><code>${mainTreasuryState.treasury_withdrawal_count || 'N/A'}</code></div>
            <div class="state-field"><strong>failed_operation_count:</strong><br><code>${mainTreasuryState.failed_operation_count || 'N/A'}</code></div>
        </div>
        
        <!-- Fee Totals -->
        <div class="treasury-state-section">
            <h4 style="color: #10b981; margin: 0 0 15px 0; border-bottom: 2px solid #bbf7d0; padding-bottom: 5px;">💸 Fee Totals</h4>
            <div class="state-field"><strong>total_pool_creation_fees:</strong><br><code>${mainTreasuryState.total_pool_creation_fees || 'N/A'} lamports (${((mainTreasuryState.total_pool_creation_fees || 0) / 1000000000).toFixed(4)} SOL)</code></div>
            <div class="state-field"><strong>total_liquidity_fees:</strong><br><code>${mainTreasuryState.total_liquidity_fees || 'N/A'} lamports (${((mainTreasuryState.total_liquidity_fees || 0) / 1000000000).toFixed(4)} SOL)</code></div>
            <div class="state-field"><strong>total_regular_swap_fees:</strong><br><code>${mainTreasuryState.total_regular_swap_fees || 'N/A'} lamports (${((mainTreasuryState.total_regular_swap_fees || 0) / 1000000000).toFixed(4)} SOL)</code></div>
            <div class="state-field"><strong>total_swap_contract_fees:</strong><br><code>${mainTreasuryState.total_swap_contract_fees || 'N/A'} lamports (${((mainTreasuryState.total_swap_contract_fees || 0) / 1000000000).toFixed(4)} SOL)</code></div>
        </div>
        
        <!-- Consolidation Information -->
        <div class="treasury-state-section">
            <h4 style="color: #8b5cf6; margin: 0 0 15px 0; border-bottom: 2px solid #e9d5ff; padding-bottom: 5px;">🔄 Consolidation Information</h4>
            <div class="state-field"><strong>last_update_timestamp:</strong><br><code>${mainTreasuryState.last_update_timestamp || 'N/A'}${mainTreasuryState.last_update_timestamp ? ` (${new Date(mainTreasuryState.last_update_timestamp * 1000).toLocaleString()})` : ''}</code></div>
            <div class="state-field"><strong>total_consolidations_performed:</strong><br><code>${mainTreasuryState.total_consolidations_performed || 'N/A'}</code></div>
            <div class="state-field"><strong>last_consolidation_timestamp:</strong><br><code>${mainTreasuryState.last_consolidation_timestamp || 'N/A'}${mainTreasuryState.last_consolidation_timestamp ? ` (${new Date(mainTreasuryState.last_consolidation_timestamp * 1000).toLocaleString()})` : ''}</code></div>
        </div>
    `;
}

/**
 * Phase 2.2: Update System State Display
 */
function updateSystemStateDisplay() {
    const systemSection = document.getElementById('system-state-section');
    const systemContent = document.getElementById('system-state-content');
    // If section was removed from DOM, safely exit
    if (!systemSection || !systemContent) return;

    if (!systemState) {
        systemSection.style.display = 'none';
        return;
    }
    
    systemSection.style.display = 'block';
    systemContent.innerHTML = generateSystemStateFields();
}

/**
 * Phase 2.2: Generate System State fields display
 */
function generateSystemStateFields() {
    if (!systemState) return '<div>No system state data available</div>';
    
    // Decode pause reason if available
    const pauseReasonDecoded = decodePauseReason(systemState.pause_reason_code);
    
    return `
        <!-- System Status -->
        <div class="system-state-section">
            <h4 style="color: #dc2626; margin: 0 0 15px 0; border-bottom: 2px solid #fecaca; padding-bottom: 5px;">⚙️ System Status</h4>
            <div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 5px; padding: 10px; margin-bottom: 15px; font-size: 12px;">
                <strong>🔐 SECURITY NOTICE:</strong> System information is READ-ONLY in the dashboard.<br>
                System operations (pause/unpause) require owner authority via CLI application.
            </div>
            <div class="state-field"><strong>is_paused:</strong><br><code>${systemState.is_paused}</code></div>
            <div class="state-field"><strong>pause_timestamp:</strong><br><code>${systemState.pause_timestamp || 'N/A'}${systemState.pause_timestamp ? ` (${new Date(systemState.pause_timestamp * 1000).toLocaleString()})` : ''}</code></div>
            <div class="state-field"><strong>pause_reason_code:</strong><br><code>${systemState.pause_reason_code || 'N/A'}</code></div>
            <div class="state-field"><strong>pause_reason_decoded:</strong><br><code>${pauseReasonDecoded}</code></div>
            <div class="state-field"><strong>admin_authority:</strong><br><code>${systemState.admin_authority || 'N/A'}</code></div>
            <div class="state-field"><strong>pending_admin_authority:</strong><br><code>${systemState.pending_admin_authority || 'None'}</code></div>
            <div class="state-field"><strong>admin_change_timestamp:</strong><br><code>${systemState.admin_change_timestamp || 'N/A'}${systemState.admin_change_timestamp ? ` (${new Date(systemState.admin_change_timestamp * 1000).toLocaleString()})` : ''}</code></div>
        </div>
    `;
}

/**
 * Phase 2.2: Decode pause reason code
 */
function decodePauseReason(reasonCode) {
    if (!reasonCode) return 'No pause reason';
    
    const reasons = {
        0: 'No pause (system active)',
        1: 'Emergency pause',
        2: 'Maintenance pause', 
        3: 'Security incident',
        4: 'Upgrade in progress',
        5: 'Configuration change',
        6: 'Manual operator pause',
        7: 'Automated safety pause',
        8: 'Network instability',
        9: 'Resource exhaustion',
        10: 'Unknown/Other'
    };
    
    return reasons[reasonCode] || `Unknown reason code: ${reasonCode}`;
}

/**
 * Phase 2.2: Toggle Treasury State details visibility
 */
function toggleTreasuryStateDetails() {
    const details = document.getElementById('treasury-state-details');
    const indicator = document.getElementById('treasury-expand-indicator');
    if (!details || !indicator) return;
    
    if (details.style.display === 'none') {
        details.style.display = 'block';
        indicator.textContent = '▲';
    } else {
        details.style.display = 'none';
        indicator.textContent = '▼';
    }
}

/**
 * Phase 2.2: Toggle System State details visibility
 */
function toggleSystemStateDetails() {
    const details = document.getElementById('system-state-details');
    const indicator = document.getElementById('system-expand-indicator');
    if (!details || !indicator) return;
    
    if (details.style.display === 'none') {
        details.style.display = 'block';
        indicator.textContent = '▲';
    } else {
        details.style.display = 'none';
        indicator.textContent = '▼';
    }
}

/**
 * Phase 2.3: Update system status indicator in the main dashboard
 */
function updateSystemStatusIndicator() {
    // Add system status to the network status card
    const programStatusElement = document.getElementById('program-status');
    if (programStatusElement && systemState) {
        const statusText = systemState.is_paused ? '🚨 System Paused' : '✅ System Active';
        const statusColor = systemState.is_paused ? '#ef4444' : '#10b981';
        
        // Update program status to include system status
        programStatusElement.innerHTML = `
            <span style="color: ${statusColor};">${statusText}</span>
        `;
        
        // Add treasury balance if available
        if (mainTreasuryState) {
            const treasuryBalance = (mainTreasuryState.total_balance / 1000000000).toFixed(4);
            programStatusElement.innerHTML += `<br><small style="color: #666;">Treasury: ${treasuryBalance} SOL</small>`;
        }
    }
}

/**
 * Update pool liquidity by reading from contract
 */
async function updatePoolLiquidity(poolAddress) {
    try {
        console.log('🔄 Updating liquidity for pool:', poolAddress);
        
        // Find the pool in our current data
        const poolIndex = pools.findIndex(p => p.address === poolAddress);
        if (poolIndex === -1) {
            console.warn('Pool not found in current data');
            return;
        }
        
        // Get fresh data from TradingDataService (bypasses cache for real-time update)
        const updatedPool = await window.TradingDataService.getPool(poolAddress, 'rpc');
        if (!updatedPool) {
            console.error('Pool not found on-chain');
            return;
        }
        
        // Update the pool in our array
        pools[poolIndex] = updatedPool;
        
        // Re-render the pools display
        renderPools();
        updateSummaryStats();
        
        console.log('✅ Pool liquidity updated successfully');
        
    } catch (error) {
        console.error('❌ Error updating pool liquidity:', error);
    }
}

/**
 * Check for stale data issues and show helper if needed
 */
function checkForStaleDataIssues() {
    const treasurySection = document.getElementById('treasury-state-section');
    const systemSection = document.getElementById('system-state-section');
    const cacheHelper = document.getElementById('cache-clear-helper');
    
    // If sections are visible but we have no state data, show cache clear helper
    const treasuryVisible = treasurySection && treasurySection.style.display !== 'none';
    const systemVisible = systemSection && systemSection.style.display !== 'none';
    const hasNoState = !mainTreasuryState && !systemState;
    
    // Also check if sessionStorage has old data that might be interfering
    let hasStaleSessionData = false;
    try {
        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            if (key && (key.includes('treasury') || key.includes('system') || key.includes('state'))) {
                hasStaleSessionData = true;
                break;
            }
        }
    } catch (e) {
        // Ignore sessionStorage errors
    }
    
    if (cacheHelper && ((treasuryVisible || systemVisible) && hasNoState) || hasStaleSessionData) {
        console.log('⚠️ Stale data detected - showing cache clear helper');
        cacheHelper.style.display = 'block';
    }
}

/**
 * Manual cache clearing function for debugging
 */
function clearAllCaches() {
    console.log('🧹 Manually clearing all caches...');
    
    // Clear sessionStorage
    try {
        sessionStorage.clear();
        console.log('✅ SessionStorage cleared');
    } catch (e) {
        console.warn('⚠️ Could not clear sessionStorage:', e.message);
    }
    
    // Clear localStorage
    try {
        localStorage.clear();
        console.log('✅ LocalStorage cleared');
    } catch (e) {
        console.warn('⚠️ Could not clear localStorage:', e.message);
    }
    
    // Force reload page to get fresh data
    console.log('🔄 Reloading page to fetch fresh data...');
    setTimeout(() => {
        window.location.reload(true); // Force reload from server
    }, 1000);
}

/**
 * Force refresh with cache clearing
 */
async function forceRefreshWithCacheClear() {
    console.log('🔄 Force refreshing with cache clear...');
    clearAllCaches();
}

// Export for global access
window.refreshData = refreshData;
window.createSamplePools = createSamplePools;
window.forceRefreshPools = forceRefreshPools;
window.debugRPC = debugRPC;
window.addLiquidity = addLiquidity;
window.updatePoolLiquidity = updatePoolLiquidity;
// Phase 2.2: Treasury and System State toggle functions
window.toggleTreasuryStateDetails = toggleTreasuryStateDetails;
window.toggleSystemStateDetails = toggleSystemStateDetails;
// Cache clearing functions
window.clearAllCaches = clearAllCaches;
window.forceRefreshWithCacheClear = forceRefreshWithCacheClear;

//=============================================================================
// SECURITY FUNCTIONS
//=============================================================================

/**
 * Security: Validate that dashboard is configured for user operations only
 */
function validateSecurityConfig() {
    console.log('🔐 Validating security configuration...');
    
    if (window.CONFIG.securityMode !== 'user-operations-only') {
        console.warn('⚠️ Security mode not set to user-operations-only');
    }
    
    if (!window.CONFIG.ownerOperationsDisabled) {
        console.warn('⚠️ Owner operations not explicitly disabled');
    }
    
    console.log('✅ Dashboard restricted to user operations only:');
    console.log('   - ✅ Pool Creation (user authority)');
    console.log('   - ✅ Liquidity Management (user authority)');
    console.log('   - ✅ Token Swapping (user authority)');
    console.log('   - ✅ Token Creation (testnet only, user authority)');
    console.log('   - ✅ Pool Viewing (read-only)');
    console.log('   - ❌ System Pause/Unpause (owner authority - CLI only)');
    console.log('   - ❌ Fee Management (owner authority - CLI only)');
    console.log('   - ❌ Pool Management (owner authority - CLI only)');
}

/**
 * Security: Block owner operations with clear error message
 */
function blockOwnerOperation(operationName) {
    const message = `🚫 SECURITY RESTRICTION: ${operationName} is not available in the dashboard.\n\n` +
                   `This operation requires owner authority and has been moved to a separate CLI application for security.\n\n` +
                   `Dashboard is restricted to user operations only:\n` +
                   `✅ Pool Creation, Liquidity Management, Token Swapping, Token Creation (testnet)\n\n` +
                   `For owner operations, use the CLI application.`;
    
    alert(message);
    console.error(`🚫 Blocked owner operation: ${operationName}`);
    return false;
}

/**
 * Security: Enhanced error handler for security upgrade compatibility
 */
function handleSecurityError(error, operation) {
    console.error(`Security Error in ${operation}:`, error);
    
    // Check for common security-related error patterns
    const errorMessage = error.message || error.toString();
    
    if (errorMessage.includes('Unauthorized') || 
        errorMessage.includes('InvalidAccountData') || 
        errorMessage.includes('MissingRequiredSignature')) {
        
        const message = `🚫 SECURITY ERROR: ${operation} failed due to security restrictions.\n\n` +
                       `This operation may require owner authority or have been moved to the CLI application.\n\n` +
                       `Dashboard supports user operations only:\n` +
                       `✅ Pool Creation, Liquidity Management, Token Swapping\n\n` +
                       `Error details: ${errorMessage}`;
        
        alert(message);
        return true; // Handled
    }
    
    if (errorMessage.includes('Program upgrade authority') || 
        errorMessage.includes('authority')) {
        
        const message = `🔑 AUTHORITY ERROR: ${operation} requires different authority.\n\n` +
                       `The smart contract now uses program upgrade authority for sensitive operations.\n\n` +
                       `Error details: ${errorMessage}`;
        
        alert(message);
        return true; // Handled
    }
    
    return false; // Not a security error, let normal error handling proceed
}

// Export security functions to global scope
window.validateSecurityConfig = validateSecurityConfig;
window.blockOwnerOperation = blockOwnerOperation;
window.handleSecurityError = handleSecurityError;

console.log('📊 Dashboard JavaScript loaded successfully'); 