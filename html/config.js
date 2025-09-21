// Centralized Configuration for Fixed Ratio Trading Dashboard
// This file loads configuration from the centralized config.json file

// Load configuration from centralized config file
async function loadConfig() {
    try {
        const response = await fetch('./config.json');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const sharedConfig = await response.json();
        
        // Map shared config to dashboard format for backward compatibility
        window.TRADING_CONFIG = {
            // Solana connection settings
            rpcUrl: sharedConfig.solana.rpcUrl,
            wsUrl: sharedConfig.solana.wsUrl,
            fallbackRpcUrls: sharedConfig.solana.fallbackRpcUrls || [],
            commitment: sharedConfig.solana.commitment,
            disableRetryOnRateLimit: sharedConfig.solana.disableRetryOnRateLimit,
            
            // Program settings
            programId: sharedConfig.program.programId,
            poolStateSeedPrefix: sharedConfig.program.poolStateSeedPrefix,
            
            // Metaplex settings
            metaplex: sharedConfig.metaplex,
            
            // Dashboard settings
            refreshInterval: sharedConfig.dashboard.refreshInterval,
            stateFile: sharedConfig.dashboard.stateFile,
            
            // Wallet settings
            expectedWallet: sharedConfig.wallets.expectedBackpackWallet,
            
            // Version info
            version: sharedConfig.version,
            lastUpdated: sharedConfig.lastUpdated,
            
            // Security settings - dashboard restricted to user operations only
            securityMode: 'user-operations-only',
            ownerOperationsDisabled: true,
            upgradeAuthorityRequired: true
        };
        
        console.log('✅ Configuration loaded:', sharedConfig.solana.rpcUrl);
        return true;
    } catch (error) {
        console.error('❌ Failed to load configuration:', error);
        
        // Fallback to hardcoded Chainstack mainnet values with multiple endpoints
        window.TRADING_CONFIG = {
            rpcUrl: 'https://solana-mainnet.core.chainstack.com/36d9fd2485573cf7fc3ec854be754602',
            wsUrl: 'wss://solana-mainnet.core.chainstack.com/36d9fd2485573cf7fc3ec854be754602',
            // Fallback RPC endpoints for better connectivity
            fallbackRpcUrls: [
                'https://api.mainnet-beta.solana.com',
                'https://solana-api.projectserum.com',
                'https://rpc.ankr.com/solana',
                'https://solana.blockdaemon.com'
            ],
            programId: 'quXSYkeZ8ByTCtYY1J1uxQmE36UZ3LmNGgE3CYMFixD',
            commitment: 'confirmed',
            disableRetryOnRateLimit: true,
            refreshInterval: 10000,
            poolStateSeedPrefix: 'pool_state',
            metaplex: {
                tokenMetadataProgramId: 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',
                candyMachineProgramId: 'cndy3Z4yapfJBmL3ShUp5exZKqR3z33thTzeNMm2gRZ',
                auctionHouseProgramId: 'hausS13jsjafwWwGqZTUQRmWyvyxn9EQpqMwV1PBBmk',
                deploymentType: 'mainnet'
            },
            expectedWallet: '5GGZiMwU56rYL1L52q7Jz7ELkSN4iYyQqdv418hxPh6t',
            version: '1.0.0',
            lastUpdated: '2025-09-14',
            
            // Security settings - dashboard restricted to user operations only
            securityMode: 'user-operations-only',
            ownerOperationsDisabled: true,
            upgradeAuthorityRequired: true
        };
        
        console.warn('⚠️ Using fallback configuration');
        return false;
    }
}

// Initialize configuration asynchronously
async function initializeConfig() {
    await loadConfig();
    
    // Legacy alias for backward compatibility
    window.CONFIG = window.TRADING_CONFIG;
    
    if (window.TRADING_CONFIG && window.TRADING_CONFIG.rpcUrl) {
        console.log('✅ Trading configuration loaded:', window.TRADING_CONFIG.rpcUrl);
    }

    // Notify listeners that configuration is ready
    try {
        const event = new CustomEvent('config-ready', { detail: window.CONFIG });
        window.dispatchEvent(event);
    } catch (e) {
        // Fallback for environments without CustomEvent
        const evt = document.createEvent('Event');
        evt.initEvent('config-ready', true, true);
        window.dispatchEvent(evt);
    }
}

// Connection helper function with fallback support
async function createRobustConnection() {
    const config = window.TRADING_CONFIG || window.CONFIG;
    if (!config) {
        throw new Error('Configuration not loaded');
    }
    
    const connectionConfig = {
        commitment: config.commitment || 'confirmed',
        disableRetryOnRateLimit: config.disableRetryOnRateLimit || true
    };
    
    // List of RPC endpoints to try (primary + fallbacks)
    const rpcEndpoints = [
        config.rpcUrl,
        ...(config.fallbackRpcUrls || [])
    ].filter(Boolean);
    
    console.log(`🔄 Attempting to connect to ${rpcEndpoints.length} RPC endpoints...`);
    
    for (let i = 0; i < rpcEndpoints.length; i++) {
        const rpcUrl = rpcEndpoints[i];
        try {
            console.log(`🔌 Trying RPC endpoint ${i + 1}/${rpcEndpoints.length}: ${rpcUrl}`);
            
            // Create connection without WebSocket first to test basic connectivity
            const testConnection = new solanaWeb3.Connection(rpcUrl, {
                ...connectionConfig,
                wsEndpoint: false // Disable WebSocket for initial test
            });
            
            // Test the connection with a simple call
            const version = await testConnection.getVersion();
            console.log(`✅ RPC endpoint ${i + 1} working, Solana version:`, version['solana-core']);
            
            // If primary endpoint and WebSocket is configured, try with WebSocket
            if (i === 0 && config.wsUrl) {
                try {
                    console.log('📡 Attempting WebSocket connection:', config.wsUrl);
                    const wsConnection = new solanaWeb3.Connection(rpcUrl, connectionConfig, config.wsUrl);
                    // Test WebSocket connection
                    await wsConnection.getVersion();
                    console.log('✅ WebSocket connection successful');
                    return wsConnection;
                } catch (wsError) {
                    console.warn('⚠️ WebSocket failed, falling back to HTTP polling:', wsError.message);
                    return testConnection;
                }
            }
            
            // Return HTTP-only connection for fallback endpoints
            return testConnection;
            
        } catch (error) {
            console.warn(`❌ RPC endpoint ${i + 1} failed:`, error.message);
            if (i === rpcEndpoints.length - 1) {
                throw new Error(`All RPC endpoints failed. Last error: ${error.message}`);
            }
        }
    }
}

// Start configuration loading
initializeConfig(); 