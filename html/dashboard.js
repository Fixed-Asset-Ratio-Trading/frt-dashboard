// Fixed Ratio Trading Dashboard - JavaScript Logic
// Connects to Solana validator and displays real-time pool information
// Configuration is loaded from config.js

// Global state
let connection = null;
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
        // Note: Pools data is now handled by pools.html page
        const initialState = await window.TradingDataService.loadAllData('rpc');
        
        // Store treasury and system state data (pools data ignored)
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
            

        } catch (dataError) {
            console.warn('⚠️ Could not load pool data:', dataError);

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
        
        // Check if program account exists before attempting simulation
        const programAccount = await connection.getAccountInfo(new solanaWeb3.PublicKey(CONFIG.programId));
        if (!programAccount) {
            console.error('🚨 Program Account Not Found:');
            console.error('  Program ID:', CONFIG.programId);
            console.error('  Cluster:', CONFIG.rpcUrl);
            console.error('  Suggestion: Deploy the program using: cargo build-sbf && solana program deploy');
            
            const errorDetail = `Program Account Not Found: ${CONFIG.programId}`;
            updateVersionStatus('error', 'Program Not Deployed', `Program ${CONFIG.programId} not found on cluster`);
            showStatus('error', `❌ Version fetch failed: ${errorDetail}`);
            contractVersion = null;
            updateTitle();
            return;
        }
        
        console.log('✅ Program account found, proceeding with simulation...');
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
            
            // Enhanced error logging for ProgramAccountNotFound
            if (result?.value?.err === 'ProgramAccountNotFound') {
                console.error('🚨 Program Account Not Found Error Details:');
                console.error('  Program ID:', CONFIG.programId);
                console.error('  Cluster:', CONFIG.rpcUrl);
                console.error('  Suggestion: Deploy the program using: cargo build-sbf && solana program deploy');
            } else if (result?.value?.err && typeof result.value.err === 'object' && result.value.err.InstructionError) {
                const instructionError = result.value.err.InstructionError;
                if (Array.isArray(instructionError) && instructionError.length >= 2) {
                    const [instructionIndex, customError] = instructionError;
                    if (customError === 'ProgramAccountNotFound') {
                        console.error('🚨 Program Account Not Found in Instruction Error Details:');
                        console.error('  Program ID:', CONFIG.programId);
                        console.error('  Instruction Index:', instructionIndex);
                        console.error('  Cluster:', CONFIG.rpcUrl);
                        console.error('  Suggestion: Deploy the program using: cargo build-sbf && solana program deploy');
                    }
                }
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
            
            // Enhanced error handling for ProgramAccountNotFound
            if (result.value.err === 'ProgramAccountNotFound') {
                errorDetail = `Program Account Not Found: ${CONFIG.programId}`;
                updateVersionStatus('error', 'Program Not Deployed', `Program ${CONFIG.programId} not found on cluster`);
            } else if (typeof result.value.err === 'object' && result.value.err.InstructionError) {
                const instructionError = result.value.err.InstructionError;
                if (Array.isArray(instructionError) && instructionError.length >= 2) {
                    const [instructionIndex, customError] = instructionError;
                    if (customError === 'ProgramAccountNotFound') {
                        errorDetail = `Program Account Not Found in instruction ${instructionIndex}: ${CONFIG.programId}`;
                        updateVersionStatus('error', 'Program Not Deployed', `Program ${CONFIG.programId} not found in instruction ${instructionIndex}`);
                    } else {
                        errorDetail = `RPC Simulation Error: ${JSON.stringify(result.value.err)}`;
                        updateVersionStatus('error', 'Simulation Failed', 'RPC simulation error');
                    }
                } else {
                    errorDetail = `RPC Simulation Error: ${JSON.stringify(result.value.err)}`;
                    updateVersionStatus('error', 'Simulation Failed', 'RPC simulation error');
                }
            } else {
                errorDetail = `RPC Simulation Error: ${JSON.stringify(result.value.err)}`;
                updateVersionStatus('error', 'Simulation Failed', 'RPC simulation error');
            }
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
        
        // Update summary statistics
        updateSummaryStats();
        
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
        
        console.log(`✅ Dashboard refreshed`);
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



        

        


// parsePoolState function removed - now using centralized TradingDataService.parsePoolState()









/**
 * Update summary statistics
 * Phase 2.3: Enhanced with treasury state integration
 */
function updateSummaryStats() {
    // Pool statistics moved to pools.html page
    
    // Update DOM elements with default values
    document.getElementById('total-pools').textContent = '0';
    document.getElementById('active-pools').textContent = '0';
    document.getElementById('paused-pools').textContent = '0';
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
    // Pool fees moved to pools.html page
    if (poolFeesEl) {
        poolFeesEl.textContent = '-- SOL';
    }
    
    // Phase 2.3: Add system status indicator
    updateSystemStatusIndicator();
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
window.debugRPC = debugRPC;
window.addLiquidity = addLiquidity;
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