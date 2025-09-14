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
        
        // Fallback to hardcoded mainnet values
        window.TRADING_CONFIG = {
            rpcUrl: 'https://api.mainnet-beta.solana.com',
            wsUrl: 'wss://api.mainnet-beta.solana.com',
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
}

// Start configuration loading
initializeConfig(); 