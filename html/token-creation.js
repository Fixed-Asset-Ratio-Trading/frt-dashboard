// Token Creation Dashboard - JavaScript Logic
// Handles Backpack wallet connection and SPL token creation
// Configuration is loaded from config.js

// Global state
let connection = null;
let wallet = null;
let isConnected = false;
let selectedNetwork = 'localnet';
let uploadedImageFile = null;
let uploadedImageDataUrl = null;
let isGeneratingVanity = false;

// Network configurations
const NETWORK_CONFIGS = {
    localnet: {
        name: 'LocalNet',
        rpcUrl: 'http://192.168.2.88:8899',
        wsUrl: 'ws://192.168.2.88:8900',
        displayName: '🏠 LocalNet'
    },
    testnet: {
        name: 'TestNet',
        rpcUrl: 'https://api.testnet.solana.com',
        wsUrl: 'wss://api.testnet.solana.com',
        displayName: '🧪 TestNet'
    },
    devnet: {
        name: 'DevNet',
        rpcUrl: 'https://api.devnet.solana.com',
        wsUrl: 'wss://api.devnet.solana.com',
        displayName: '⚡ DevNet'
    },
    mainnet: {
        name: 'MainNet',
        rpcUrl: 'https://api.mainnet-beta.solana.com',
        wsUrl: 'wss://api.mainnet-beta.solana.com',
        displayName: '🚀 MainNet'
    }
};

// Metaplex Token Metadata Program ID - loaded from config
let TOKEN_METADATA_PROGRAM_ID = null;

// Token image mappings
const TOKEN_IMAGES = {
    'TS': 'TS Token image.png',
    'MST': 'MTS Token image.png', 
    'MTS': 'MTS Token image.png',
    'LTS': 'LTS Token image.png'
};

/**
 * Get the image URI for a token symbol
 */
function getTokenImageURI(symbol) {
    const imageFileName = TOKEN_IMAGES[symbol.toUpperCase()];
    if (imageFileName) {
        // For local testing with dashboard server
        return `images/${imageFileName}`;
        
        // For production, replace with full URLs like:
        // return `https://your-domain.com/images/${imageFileName}`;
        // or IPFS URLs like:
        // return `https://gateway.pinata.cloud/ipfs/YOUR_HASH/${imageFileName}`;
    }
    return null;
}

/**
 * Browser-compatible helper to concatenate Uint8Arrays (replaces Buffer.concat)
 */
function concatUint8Arrays(arrays) {
    const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const arr of arrays) {
        result.set(arr, offset);
        offset += arr.length;
    }
    return result;
}

/**
 * Get metadata account address for a mint
 */
async function getMetadataAccount(mint) {
    if (!TOKEN_METADATA_PROGRAM_ID) {
        throw new Error('Token Metadata Program ID not loaded from config');
    }
    
    const [metadataAccount] = await solanaWeb3.PublicKey.findProgramAddress(
        [
            new TextEncoder().encode('metadata'),
            TOKEN_METADATA_PROGRAM_ID.toBuffer(),
            mint.toBuffer(),
        ],
        TOKEN_METADATA_PROGRAM_ID
    );
    return metadataAccount;
}

/**
 * Create token metadata instruction
 */
function createMetadataInstruction(
    metadataAccount,
    mint,
    mintAuthority,
    payer,
    updateAuthority,
    tokenName,
    symbol,
    uri
) {
    if (!TOKEN_METADATA_PROGRAM_ID) {
        throw new Error('Token Metadata Program ID not loaded from config');
    }
    
    const keys = [
        { pubkey: metadataAccount, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: mintAuthority, isSigner: true, isWritable: false },
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: updateAuthority, isSigner: false, isWritable: false },
        { pubkey: solanaWeb3.SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: solanaWeb3.SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ];

    // Metadata Data structure
    const data = {
        name: tokenName,
        symbol: symbol,
        uri: uri || '',
        sellerFeeBasisPoints: 0,
        creators: null
    };

    // Build instruction data - basic format
    const encoder = new TextEncoder();
    
    // Simple fixed-size format that matches standard Metaplex expectations
    const nameBuffer = new Uint8Array(32);
    const symbolBuffer = new Uint8Array(10);  
    const uriBuffer = new Uint8Array(200);
    
    const nameBytes = encoder.encode(data.name);
    const symbolBytes = encoder.encode(data.symbol);
    const uriBytes = encoder.encode(data.uri || '');
    
    nameBuffer.set(nameBytes.slice(0, 32));
    symbolBuffer.set(symbolBytes.slice(0, 10));
    uriBuffer.set(uriBytes.slice(0, 200));
    
    // Prefer official V3 builder if available (avoids deprecated discriminator 0x4b errors)
    if (window.MPL && window.MPL.createCreateMetadataAccountV3Instruction) {
        return window.MPL.createCreateMetadataAccountV3Instruction({
            metadata: metadataAccount,
            mint: mint,
            mintAuthority: mintAuthority,
            payer: payer,
            updateAuthority: updateAuthority,
        }, {
            createMetadataAccountArgsV3: {
                data: {
                    name: data.name,
                    symbol: data.symbol,
                    uri: data.uri,
                    sellerFeeBasisPoints: 0,
                    creators: null,
                    collection: null,
                    uses: null,
                },
                isMutable: true,
                collectionDetails: null,
            },
        }, TOKEN_METADATA_PROGRAM_ID);
    }
    // If MPL is unavailable, skip metadata creation in browser (prevents deprecated instruction errors)
    return null;
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Token Creation Dashboard initializing...');
    showStatus('info', '🔄 Loading libraries and initializing...');
    
    // Simple retry mechanism with clearer feedback
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
            showStatus('error', '❌ Failed to load required libraries. Please refresh the page and check your internet connection.');
        }
    };
    
    // Start first attempt after a brief delay
    setTimeout(tryInitialize, 1500);
});

/**
 * Initialize Metaplex Token Metadata Program ID from config
 */
async function initializeMetaplexConfig() {
    try {
        // Wait for config to be loaded
        let attempts = 0;
        while (!window.TRADING_CONFIG && attempts < 50) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        
        if (window.TRADING_CONFIG && window.TRADING_CONFIG.metaplex && window.TRADING_CONFIG.metaplex.tokenMetadataProgramId) {
            TOKEN_METADATA_PROGRAM_ID = new solanaWeb3.PublicKey(window.TRADING_CONFIG.metaplex.tokenMetadataProgramId);
            console.log('✅ Loaded Token Metadata Program ID from config:', TOKEN_METADATA_PROGRAM_ID.toString());
        } else {
            console.warn('⚠️ No Metaplex config found, metadata creation will be disabled');
            TOKEN_METADATA_PROGRAM_ID = null;
        }
    } catch (error) {
        console.error('❌ Error loading Metaplex config:', error);
        TOKEN_METADATA_PROGRAM_ID = null;
    }
}

/**
 * Initialize the application
 */
async function initializeApp() {
    try {
        // Initialize Metaplex Token Metadata Program ID from config
        await initializeMetaplexConfig();
        
        // Initialize Solana connection based on selected network
        await initializeNetworkConnection();
        
        // Check if SPL Token library is available
        if (!window.splToken || !window.SPL_TOKEN_LOADED) {
            console.error('❌ SPL Token library not loaded properly');
            showStatus('error', 'SPL Token library not loaded. Please refresh the page.');
            return;
        }
        
        console.log('✅ SPL Token library ready:', Object.keys(window.splToken).slice(0, 10) + '...');
        
        // Check if Backpack is installed
        if (!window.backpack) {
            showStatus('error', 'Backpack wallet not detected. Please install Backpack wallet extension.');
            return;
        }
        
        // Check if already connected
        if (window.backpack.isConnected) {
            await handleWalletConnected();
        }
        
        // Setup form event listeners
        setupFormListeners();
        
        // Initialize UI components
        initializeUI();
        
        console.log('✅ Token Creation Dashboard initialized');
        
        // Expose functions for inline HTML onclick handlers
        if (typeof window !== 'undefined') {
            window.selectNetwork = selectNetwork;
            window.generateVanityToken = generateVanityToken;
            window.handleImageUpload = handleImageUpload;
            window.removeImage = removeImage;
        }
    } catch (error) {
        console.error('❌ Failed to initialize:', error);
        showStatus('error', 'Failed to initialize application: ' + error.message);
    }
}

/**
 * Initialize network connection based on selected network
 */
async function initializeNetworkConnection() {
    const networkConfig = NETWORK_CONFIGS[selectedNetwork];
    console.log('🔌 Connecting to', networkConfig.displayName, ':', networkConfig.rpcUrl);
    
    const connectionConfig = {
        commitment: 'confirmed',
        disableRetryOnRateLimit: true
    };
    
    if (networkConfig.wsUrl && selectedNetwork !== 'localnet') {
        console.log('📡 Using WebSocket endpoint:', networkConfig.wsUrl);
        connection = new solanaWeb3.Connection(networkConfig.rpcUrl, connectionConfig, networkConfig.wsUrl);
    } else {
        console.log('📡 Using HTTP polling (WebSocket disabled)');
        connectionConfig.wsEndpoint = false;
        connection = new solanaWeb3.Connection(networkConfig.rpcUrl, connectionConfig);
    }
}

/**
 * Initialize UI components
 */
function initializeUI() {
    // Set default network
    updateNetworkDisplay();
    
    // Update fee estimates
    updateFeeEstimates();
    
    // Initialize advanced options
    setupAdvancedOptionsListeners();
}

/**
 * Setup form event listeners
 */
function setupFormListeners() {
    const form = document.getElementById('token-form');
    const inputs = form.querySelectorAll('input[required]');
    
    // Form submission
    form.addEventListener('submit', handleTokenCreation);
    
    // Real-time validation
    inputs.forEach(input => {
        input.addEventListener('input', updateCreateButtonState);
    });
    
    // Advanced options listeners
    const advancedCheckboxes = document.querySelectorAll('.checkbox-item input[type="checkbox"]');
    advancedCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', updateFeeEstimates);
    });
    
    // Initial button state
    updateCreateButtonState();
}

/**
 * Setup advanced options listeners
 */
function setupAdvancedOptionsListeners() {
    // Disable metadata by default (requires hosted URI)
    document.getElementById('enable-metadata').checked = false;
    
    // Link metadata and immutable options
    const metadataCheckbox = document.getElementById('enable-metadata');
    const immutableCheckbox = document.getElementById('enable-immutable');
    
    metadataCheckbox.addEventListener('change', function() {
        if (!this.checked) {
            immutableCheckbox.checked = false;
            immutableCheckbox.disabled = true;
        } else {
            immutableCheckbox.disabled = false;
        }
        updateFeeEstimates();
    });
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
        
        // Check if this is the expected wallet
        if (publicKey === CONFIG.expectedWallet) {
            showStatus('success', `✅ Connected with Backpack deployment wallet: ${publicKey.slice(0, 20)}...`);
            document.getElementById('wallet-avatar').textContent = '🎯';
        } else {
            showStatus('info', `ℹ️ Connected with Backpack wallet: ${publicKey.slice(0, 20)}... (Note: This is not the deployment wallet)`);
        }
        
        // Check balance
        await checkWalletBalance();
        
        // Update form state
        updateCreateButtonState();
        
        // Also validate metadata form if it exists
        if (window.validateMetadataForm) {
            window.validateMetadataForm();
        }
        

        
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
        
        // Update UI
        document.getElementById('wallet-info').style.display = 'none';
        document.getElementById('wallet-disconnected').style.display = 'flex';
        document.getElementById('connect-wallet-btn').textContent = 'Connect Backpack Wallet';
        document.getElementById('connect-wallet-btn').onclick = connectWallet;
        
        // Update form state
        updateCreateButtonState();
        
        // Also validate metadata form if it exists
        if (window.validateMetadataForm) {
            window.validateMetadataForm();
        }
        
        showStatus('info', 'Wallet disconnected');
        
    } catch (error) {
        console.error('❌ Error disconnecting wallet:', error);
    }
}

/**
 * Select network for token deployment
 */
function selectNetwork(network) {
    if (selectedNetwork === network) return;
    
    selectedNetwork = network;
    updateNetworkDisplay();
    
    // Reinitialize connection with new network
    if (connection) {
        initializeNetworkConnection().then(() => {
            showStatus('info', `Switched to ${NETWORK_CONFIGS[network].displayName}`);
            updateFeeEstimates();
        }).catch(error => {
            console.error('Failed to switch network:', error);
            showStatus('error', 'Failed to switch network: ' + error.message);
        });
    }
}

/**
 * Update network display
 */
function updateNetworkDisplay() {
    document.querySelectorAll('.network-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-network="${selectedNetwork}"]`).classList.add('active');
}

/**
 * Update fee estimates based on selected options
 */
function updateFeeEstimates() {
    const enableMetadata = document.getElementById('enable-metadata')?.checked || false;
    
    let creationFee = 0.006; // Base token creation
    let metadataFee = enableMetadata ? 0.012 : 0;
    
    // Adjust for network
    if (selectedNetwork === 'mainnet') {
        creationFee *= 2; // Higher fees on mainnet
        metadataFee *= 2;
    }
    
    const totalFee = creationFee + metadataFee;
    
    document.getElementById('creation-fee').textContent = `~${creationFee.toFixed(3)} SOL`;
    document.getElementById('metadata-fee').textContent = `~${metadataFee.toFixed(3)} SOL`;
    document.getElementById('total-fee').textContent = `~${totalFee.toFixed(3)} SOL`;
}

/**
 * Handle image upload
 */
function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Validate file type
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
        showStatus('error', 'Please select a valid image file (PNG, JPG, GIF, WebP)');
        return;
    }
    
    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
        showStatus('error', 'Image file must be less than 5MB');
        return;
    }
    
    uploadedImageFile = file;
    
    // Create preview
    const reader = new FileReader();
    reader.onload = function(e) {
        uploadedImageDataUrl = e.target.result;
        const imgEl = document.getElementById('image-preview');
        imgEl.src = e.target.result;
        imgEl.style.display = 'block';
        document.getElementById('upload-placeholder').style.display = 'none';
        document.getElementById('image-preview-container').style.display = 'block';
        document.querySelector('.image-upload-section').classList.add('has-image');
        
        showStatus('success', `Image "${file.name}" loaded successfully`);
    };
    reader.readAsDataURL(file);
}

/**
 * Remove uploaded image
 */
function removeImage(event) {
    event.stopPropagation();
    
    uploadedImageFile = null;
    uploadedImageDataUrl = null;
    
    document.getElementById('token-image').value = '';
    document.getElementById('upload-placeholder').style.display = 'block';
    document.getElementById('image-preview-container').style.display = 'none';
    document.querySelector('.image-upload-section').classList.remove('has-image');
    
    showStatus('info', 'Image removed');
}

/**
 * Generate vanity token with custom prefix
 */
async function generateVanityToken() {
    if (isGeneratingVanity) {
        showStatus('error', 'Vanity generation already in progress');
        return;
    }
    
    const prefix = document.getElementById('vanity-prefix').value.trim();
    if (!prefix) {
        showStatus('error', 'Please enter a prefix for vanity generation');
        return;
    }
    
    if (prefix.length > 6) {
        showStatus('error', 'Prefix must be 6 characters or less');
        return;
    }
    
    // Validate prefix (only alphanumeric)
    // Base58 charset used by Solana: 123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz
    if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(prefix)) {
        showStatus('error', 'Prefix must be valid base58 (no 0,O,I,l)');
        return;
    }
    
    if (!isConnected) {
        showStatus('error', 'Please connect your wallet first');
        return;
    }
    
    isGeneratingVanity = true;
    const vanityBtn = document.querySelector('.vanity-btn');
    const originalText = vanityBtn.textContent;
    
    try {
        vanityBtn.textContent = '🔄 Generating...';
        vanityBtn.disabled = true;
        
        showStatus('info', `🎯 Generating vanity token with prefix "${prefix}"... This may take a while.`);
        
        // Generate vanity keypair
        const vanityResult = await generateVanityKeypair(prefix);
        
        // Auto-fill basic token data for vanity token
        document.getElementById('token-name').value = `${prefix} Token`;
        document.getElementById('token-symbol').value = prefix.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase();
        document.getElementById('token-decimals').value = '9';
        document.getElementById('token-supply').value = '1000000';
        document.getElementById('token-description').value = `Premium vanity token with address starting with ${prefix}`;
        
        showStatus('success', `🎉 Vanity token generated! Address: ${vanityResult.publicKey.toString()}`);
        
        // Auto-create the vanity token
        await createVanityToken(vanityResult);
        
    } catch (error) {
        console.error('❌ Error generating vanity token:', error);
        showStatus('error', 'Failed to generate vanity token: ' + error.message);
    } finally {
        isGeneratingVanity = false;
        vanityBtn.textContent = originalText;
        vanityBtn.disabled = false;
    }
}

/**
 * Generate vanity keypair with specific prefix
 */
async function generateVanityKeypair(prefix) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        const maxAttempts = 1000000; // Prevent infinite loops
        let attempts = 0;
        
        const generate = () => {
            try {
                const keypair = solanaWeb3.Keypair.generate();
                const address = keypair.publicKey.toString();
                attempts++;
                
                if (address.startsWith(prefix)) {
                    const elapsed = (Date.now() - startTime) / 1000;
                    console.log(`✅ Found vanity address after ${attempts} attempts in ${elapsed.toFixed(2)}s`);
                    resolve(keypair);
                    return;
                }
                
                if (attempts >= maxAttempts) {
                    reject(new Error(`Could not generate vanity address with prefix "${prefix}" after ${maxAttempts} attempts`));
                    return;
                }
                
                // Update progress every 10000 attempts
                if (attempts % 10000 === 0) {
                    const elapsed = (Date.now() - startTime) / 1000;
                    showStatus('info', `🎯 Generating vanity address... ${attempts} attempts in ${elapsed.toFixed(1)}s`);
                }
                
                // Use setTimeout to prevent blocking the UI
                setTimeout(generate, 0);
                
            } catch (error) {
                reject(error);
            }
        };
        
        generate();
    });
}

/**
 * Create vanity token with pre-generated keypair
 */
async function createVanityToken(vanityKeypair) {
    try {
        showStatus('info', 'Creating vanity token...');
        
        // Get form data
        const formData = getFormData();
        
        // Create token with vanity keypair
        const tokenInfo = await createSPLTokenWithKeypair(formData, vanityKeypair);
        
        showStatus('success', `🎉 Vanity token "${formData.name}" created successfully! 
        💰 ${formData.supply.toLocaleString()} ${formData.symbol} tokens minted
        🎯 Vanity Address: ${tokenInfo.mint}
        🌟 This premium address starts with your chosen prefix!`);
        
        // Clear vanity input
        document.getElementById('vanity-prefix').value = '';
        
    } catch (error) {
        console.error('❌ Error creating vanity token:', error);
        throw error;
    }
}

/**
 * Check wallet balance
 */
async function checkWalletBalance() {
    try {
        const balance = await connection.getBalance(wallet.publicKey);
        const solBalance = balance / solanaWeb3.LAMPORTS_PER_SOL;
        
        if (solBalance < 0.1) {
            showStatus('error', `⚠️ Low SOL balance: ${solBalance.toFixed(4)} SOL. You may need more SOL for transactions.`);
        } else {
            console.log(`💰 Wallet balance: ${solBalance.toFixed(4)} SOL`);
        }
    } catch (error) {
        console.error('❌ Error checking balance:', error);
    }
}

/**
 * Update create button state based on form validation and wallet connection
 */
function updateCreateButtonState() {
    const form = document.getElementById('token-form');
    const createBtn = document.getElementById('create-btn');
    const sampleBtn = document.getElementById('create-sample-btn');
    const microSampleBtn = document.getElementById('create-micro-sample-btn');
    const largeSampleBtn = document.getElementById('create-large-sample-btn');
    const requiredInputs = form.querySelectorAll('input[required]');
    
    let allValid = isConnected;
    
    requiredInputs.forEach(input => {
        if (!input.value.trim()) {
            allValid = false;
        }
    });
    
    createBtn.disabled = !allValid;
    
    // Sample buttons only need wallet connection
    if (sampleBtn) {
        sampleBtn.disabled = !isConnected;
    }
    
    if (microSampleBtn) {
        microSampleBtn.disabled = !isConnected;
    }
    
    if (largeSampleBtn) {
        largeSampleBtn.disabled = !isConnected;
    }
}

/**
 * Create sample token for quick testing
 */
async function createSampleToken() {
    if (!isConnected || !wallet) {
        showStatus('error', 'Please connect your wallet first');
        return;
    }
    
    const sampleBtn = document.getElementById('create-sample-btn');
    const originalText = sampleBtn.textContent;
    
    try {
        sampleBtn.disabled = true;
        sampleBtn.textContent = '🔄 Creating Sample Token...';
        
        // Sample token data
        const sampleData = {
            name: 'Token Sample',
            symbol: 'TS',
            decimals: 4,
            supply: 10000,
            description: 'Sample token for testing purposes'
        };
        
        showStatus('info', `Creating sample token "${sampleData.name}" (${sampleData.symbol})...`);
        
        // Create token
        const tokenInfo = await createSPLToken(sampleData);
        
        // Store created token
        // Persisting token info to localStorage is removed. Metadata is stored on-chain via Metaplex.
        
        showStatus('success', `🎉 Sample token "${sampleData.name}" created successfully! 
        💰 ${sampleData.supply.toLocaleString()} ${sampleData.symbol} tokens minted to your wallet
        🔑 Mint Address: ${tokenInfo.mint}
        🖼️ Token includes custom image metadata for wallet display`);
        
    } catch (error) {
        console.error('❌ Error creating sample token:', error);
        showStatus('error', 'Failed to create sample token: ' + error.message);
    } finally {
        sampleBtn.disabled = false;
        sampleBtn.textContent = originalText;
    }
}

/**
 * Create micro sample token for quick testing
 */
async function createMicroSampleToken() {
    if (!isConnected || !wallet) {
        showStatus('error', 'Please connect your wallet first');
        return;
    }
    
    const microSampleBtn = document.getElementById('create-micro-sample-btn');
    const originalText = microSampleBtn.textContent;
    
    try {
        microSampleBtn.disabled = true;
        microSampleBtn.textContent = '🔄 Creating Micro Sample Token...';
        
        // Micro sample token data
        const microSampleData = {
            name: 'Micro Sample Token',
            symbol: 'MST',
            decimals: 0,
            supply: 100000000,
            description: 'Micro Sample Token is the smalest unit of Sample token and are interchangable as 10000 MST = 1 TS'
        };
        
        showStatus('info', `Creating micro sample token "${microSampleData.name}" (${microSampleData.symbol})...`);
        
        // Create token
        const tokenInfo = await createSPLToken(microSampleData);
        
        // Store created token
        // Persisting token info to localStorage is removed. Metadata is stored on-chain via Metaplex.
        
        showStatus('success', `🎉 Micro sample token "${microSampleData.name}" created successfully! 
        💰 ${microSampleData.supply.toLocaleString()} ${microSampleData.symbol} tokens minted to your wallet
        🔑 Mint Address: ${tokenInfo.mint}
        🔗 Exchange Rate: 10,000 MST = 1 TS
        🖼️ Token includes custom image metadata for wallet display`);
        
    } catch (error) {
        console.error('❌ Error creating micro sample token:', error);
        showStatus('error', 'Failed to create micro sample token: ' + error.message);
    } finally {
        microSampleBtn.disabled = false;
        microSampleBtn.textContent = originalText;
    }
}

/**
 * Create large sample token for quick testing
 */
async function createLargeSampleToken() {
    if (!isConnected || !wallet) {
        showStatus('error', 'Please connect your wallet first');
        return;
    }
    
    const largeSampleBtn = document.getElementById('create-large-sample-btn');
    const originalText = largeSampleBtn.textContent;
    
    try {
        largeSampleBtn.disabled = true;
        largeSampleBtn.textContent = '🔄 Creating Large Sample Token...';
        
        // Large sample token data
        const largeSampleData = {
            name: 'Large Sample Token',
            symbol: 'LTS',
            decimals: 9,
            supply: 1000,
            description: 'Large Sample Token represents the highest denomination of sample tokens and are interchangeable as 1 LTS = 10 TS'
        };
        
        showStatus('info', `Creating large sample token "${largeSampleData.name}" (${largeSampleData.symbol})...`);
        
        // Create token
        const tokenInfo = await createSPLToken(largeSampleData);
        
        // Store created token
        // Persisting token info to localStorage is removed. Metadata is stored on-chain via Metaplex.
        
        showStatus('success', `🎉 Large sample token "${largeSampleData.name}" created successfully! 
        💰 ${largeSampleData.supply.toLocaleString()} ${largeSampleData.symbol} tokens minted to your wallet
        🔑 Mint Address: ${tokenInfo.mint}
        🔗 Exchange Rate: 1 LTS = 10 TS
        🖼️ Token includes custom image metadata for wallet display`);
        
    } catch (error) {
        console.error('❌ Error creating large sample token:', error);
        showStatus('error', 'Failed to create large sample token: ' + error.message);
    } finally {
        largeSampleBtn.disabled = false;
        largeSampleBtn.textContent = originalText;
    }
}

/**
 * Handle token creation form submission
 */
async function handleTokenCreation(event) {
    event.preventDefault();
    
    if (!isConnected || !wallet) {
        showStatus('error', 'Please connect your wallet first');
        return;
    }
    
    const createBtn = document.getElementById('create-btn');
    const originalText = createBtn.textContent;
    
    try {
        createBtn.disabled = true;
        createBtn.textContent = '🔄 Creating Token...';
        
        // Get form data
        const formData = getFormData();
        
        showStatus('info', `Creating token "${formData.name}" (${formData.symbol})...`);
        
        // Create token
        const tokenInfo = await createSPLToken(formData);
        
        // Store created token
        // Persisting token info to localStorage is removed. Metadata is stored on-chain via Metaplex.
        
        // Clear form
        clearForm();
        
        showStatus('success', `🎉 Token "${formData.name}" created successfully! 
        💰 ${formData.supply.toLocaleString()} ${formData.symbol} tokens minted to your wallet
        🔑 Mint Address: ${tokenInfo.mint}
        🖼️ ${tokenInfo.imageURI ? 'Token includes custom image metadata for wallet display' : 'Token created with standard metadata'}`);
        
    } catch (error) {
        console.error('❌ Error creating token:', error);
        showStatus('error', 'Failed to create token: ' + error.message);
    } finally {
        createBtn.disabled = false;
        createBtn.textContent = originalText;
        updateCreateButtonState();
    }
}

/**
 * Get form data including new fields
 */
function getFormData() {
    return {
        name: document.getElementById('token-name').value.trim(),
        symbol: document.getElementById('token-symbol').value.trim().toUpperCase(),
        decimals: parseInt(document.getElementById('token-decimals').value),
        supply: parseInt(document.getElementById('token-supply').value),
        description: document.getElementById('token-description').value.trim(),
        // Social links
        twitter: document.getElementById('twitter-link').value.trim(),
        discord: document.getElementById('discord-link').value.trim(),
        website: document.getElementById('website-link').value.trim(),
        telegram: document.getElementById('telegram-link').value.trim(),
        // Advanced options
        revokeFreeze: document.getElementById('revoke-freeze').checked,
        revokeMint: document.getElementById('revoke-mint').checked,
        enableMetadata: document.getElementById('enable-metadata').checked,
        enableImmutable: document.getElementById('enable-immutable').checked,
        // Image
        imageFile: uploadedImageFile,
        imageDataUrl: uploadedImageDataUrl
    };
}

/**
 * Upload image to IPFS or use base64 for metadata
 */
async function uploadImageForMetadata(imageFile) {
    if (!imageFile) return null;
    
    try {
        // For now, use base64 data URL (in production, upload to IPFS)
        const reader = new FileReader();
        return new Promise((resolve, reject) => {
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(imageFile);
        });
    } catch (error) {
        console.warn('Failed to process image:', error);
        return null;
    }
}

/**
 * Create enhanced metadata with social links
 */
function createEnhancedMetadata(tokenData, imageUri) {
    const metadata = {
        name: tokenData.name,
        symbol: tokenData.symbol,
        description: tokenData.description,
        image: imageUri || '',
        attributes: [],
        properties: {
            files: [],
            category: 'token'
        }
    };
    
    // Add social links if provided
    const socialLinks = {};
    if (tokenData.twitter) socialLinks.twitter = tokenData.twitter;
    if (tokenData.discord) socialLinks.discord = tokenData.discord;
    if (tokenData.website) socialLinks.website = tokenData.website;
    if (tokenData.telegram) socialLinks.telegram = tokenData.telegram;
    
    if (Object.keys(socialLinks).length > 0) {
        metadata.properties.socialLinks = socialLinks;
    }
    
    // Add network info
    metadata.properties.network = NETWORK_CONFIGS[selectedNetwork].displayName;
    metadata.properties.createdWith = 'Fixed Ratio Trading Token Creator';
    
    return metadata;
}

/**
 * Confirm transaction with extended timeout and progress updates
 */
async function confirmTransactionWithProgress(signature, commitment = 'confirmed') {
    const maxRetries = 60; // 60 attempts = up to 2 minutes
    const retryDelay = 2000; // 2 seconds between checks
    let attempts = 0;
    
    while (attempts < maxRetries) {
        try {
            const confirmation = await connection.confirmTransaction(signature, commitment);
            
            if (confirmation.value) {
                console.log('✅ Transaction confirmed after', attempts + 1, 'attempts');
                showStatus('success', `Transaction confirmed! Processing completed.`);
                return confirmation;
            }
        } catch (error) {
            // If it's a timeout error, continue retrying
            if (error.message.includes('was not confirmed') || error.message.includes('timeout')) {
                attempts++;
                const timeElapsed = (attempts * retryDelay) / 1000;
                console.log(`⏳ Still waiting for confirmation... (${timeElapsed}s elapsed)`);
                showStatus('info', `⏳ Transaction processing... ${timeElapsed}s elapsed (will wait up to 2 minutes)`);
                
                // Wait before next attempt
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                continue;
            } else {
                // For other errors, throw immediately
                throw error;
            }
        }
        
        attempts++;
        const timeElapsed = (attempts * retryDelay) / 1000;
        
        // Check transaction status manually
        try {
            const status = await connection.getSignatureStatus(signature);
            if (status && status.value) {
                if (status.value.err) {
                    throw new Error('Transaction failed: ' + JSON.stringify(status.value.err));
                }
                if (status.value.confirmationStatus === commitment || 
                    status.value.confirmationStatus === 'finalized') {
                    console.log('✅ Transaction confirmed via status check');
                    showStatus('success', `Transaction confirmed! Processing completed.`);
                    return { value: status.value };
                }
            }
        } catch (statusError) {
            console.log('ℹ️ Could not check transaction status:', statusError.message);
        }
        
        console.log(`⏳ Still waiting for confirmation... (${timeElapsed}s elapsed)`);
        showStatus('info', `⏳ Transaction processing... ${timeElapsed}s elapsed (will wait up to 2 minutes)`);
        
        // Wait before next attempt
        await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
    
    // If we get here, we've exhausted all retries
    throw new Error(`Transaction was not confirmed after ${(maxRetries * retryDelay) / 1000} seconds. Check signature ${signature} manually using Solana Explorer.`);
}

/**
 * Check network health before token creation
 */
async function checkNetworkHealth() {
    try {
        const start = Date.now();
        await connection.getLatestBlockhash();
        const latency = Date.now() - start;
        
        if (latency > 5000) {
            showStatus('warning', `⚠️ Network latency is high (${latency}ms). Token creation may take longer than usual.`);
        } else {
            console.log(`✅ Network latency: ${latency}ms`);
        }
        
        return latency;
    } catch (error) {
        showStatus('error', '❌ Network connectivity issue detected. Please check your connection.');
        throw new Error('Network health check failed: ' + error.message);
    }
}

/**
 * Create SPL Token with optional custom keypair
 */
async function createSPLTokenWithKeypair(tokenData, customKeypair = null) {
    const mintKeypair = customKeypair || solanaWeb3.Keypair.generate();
    return await createSPLTokenInternal(tokenData, mintKeypair);
}

/**
 * Create SPL Token (public interface)
 */
async function createSPLToken(tokenData) {
    return await createSPLTokenInternal(tokenData);
}

/**
 * Internal SPL Token creation with enhanced features
 */
async function createSPLTokenInternal(tokenData, providedKeypair = null) {
    try {
        console.log('🎨 Creating SPL token with data:', tokenData);
        
        // Check network health first
        await checkNetworkHealth();
        
        // Debug: Check if SPL Token library is available
        if (!window.splToken) {
            throw new Error('SPL Token library not available. Please refresh the page.');
        }
        
        console.log('🔍 SPL Token library ready for token creation');
        
        console.log('🚀 Creating SPL token...');
        
        let mint, associatedTokenAccount;
        
        // Use provided keypair or generate new one
        const mintKeypair = providedKeypair || solanaWeb3.Keypair.generate();
        console.log('🔑 Using mint keypair:', mintKeypair.publicKey.toString());
        
        // Get rent exemption for mint account
        const mintRent = await connection.getMinimumBalanceForRentExemption(window.splToken.MintLayout.span);
        
        // Get metadata account address
        const metadataAccount = await getMetadataAccount(mintKeypair.publicKey);
        console.log('📄 Metadata account:', metadataAccount.toString());
        
        // Process uploaded image or get default image URI
        let imageURI = null;
        if (tokenData.imageFile) {
            console.log('🖼️ Processing uploaded image...');
            imageURI = await uploadImageForMetadata(tokenData.imageFile);
        } else {
            imageURI = getTokenImageURI(tokenData.symbol);
        }
        
        if (imageURI) {
            console.log('🖼️ Token image URI ready:', imageURI.slice(0, 50) + '...');
        }
        
        // Build instructions array
        const instructions = [];
        
        // 1. Create mint account
        instructions.push(
            solanaWeb3.SystemProgram.createAccount({
                fromPubkey: wallet.publicKey,
                newAccountPubkey: mintKeypair.publicKey,
                lamports: mintRent,
                space: window.splToken.MintLayout.span,
                programId: window.splToken.TOKEN_PROGRAM_ID
            })
        );
        
        // 2. Initialize mint instruction
        instructions.push(
            window.splToken.Token.createInitMintInstruction(
                window.splToken.TOKEN_PROGRAM_ID,
                mintKeypair.publicKey,
                tokenData.decimals,
                wallet.publicKey,     // mint authority (you control minting)
                wallet.publicKey      // freeze authority (you control freezing)
            )
        );
        
        // 3. Get associated token address for your wallet
        associatedTokenAccount = await window.splToken.Token.getAssociatedTokenAddress(
            window.splToken.ASSOCIATED_TOKEN_PROGRAM_ID,
            window.splToken.TOKEN_PROGRAM_ID,
            mintKeypair.publicKey,
            wallet.publicKey
        );
        console.log('📍 Token account address:', associatedTokenAccount.toString());
        
        // 4. Create associated token account instruction
        instructions.push(
            window.splToken.Token.createAssociatedTokenAccountInstruction(
                window.splToken.ASSOCIATED_TOKEN_PROGRAM_ID,
                window.splToken.TOKEN_PROGRAM_ID,
                mintKeypair.publicKey,
                associatedTokenAccount,
                wallet.publicKey,     // owner (YOU own this account)
                wallet.publicKey      // payer (you pay for creation)
            )
        );
        
        // 5. Mint tokens to your wallet
        const totalSupplyWithDecimals = tokenData.supply * Math.pow(10, tokenData.decimals);
        console.log(`💰 Minting ${tokenData.supply} ${tokenData.symbol} tokens to your wallet...`);
        
        instructions.push(
            window.splToken.Token.createMintToInstruction(
                window.splToken.TOKEN_PROGRAM_ID,
                mintKeypair.publicKey,
                associatedTokenAccount,   // destination (YOUR token account)
                wallet.publicKey,         // mint authority (you control minting)
                [],                       // multi signers
                totalSupplyWithDecimals  // amount (ALL the supply goes to you)
            )
        );
        
        // 6. Revoke authorities if requested
        if (tokenData.revokeFreeze) {
            instructions.push(
                window.splToken.Token.createSetAuthorityInstruction(
                    window.splToken.TOKEN_PROGRAM_ID,
                    mintKeypair.publicKey,
                    null, // new authority (null = revoke)
                    'FreezeAccount',
                    wallet.publicKey, // current authority
                    []
                )
            );
        }
        
        if (tokenData.revokeMint) {
            instructions.push(
                window.splToken.Token.createSetAuthorityInstruction(
                    window.splToken.TOKEN_PROGRAM_ID,
                    mintKeypair.publicKey,
                    null, // new authority (null = revoke)
                    'MintTokens',
                    wallet.publicKey, // current authority
                    []
                )
            );
        }
        
        // 7. Create and send basic token transaction first (without metadata)
        const transaction = new solanaWeb3.Transaction().add(...instructions);
        
        // Set recent blockhash and fee payer
        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = wallet.publicKey;
        
        // Sign with mint keypair (partial sign)
        transaction.partialSign(mintKeypair);
        
        console.log('📝 Requesting wallet signature...');
        
        // Sign with wallet and send
        const signedTransaction = await wallet.signTransaction(transaction);
        const signature = await connection.sendRawTransaction(signedTransaction.serialize());
        
        console.log('📡 Transaction sent:', signature);
        showStatus('info', `Transaction submitted: ${signature.slice(0, 20)}... - Waiting for confirmation...`);
        
        // Confirm transaction with custom timeout and progress updates
        const confirmation = await confirmTransactionWithProgress(signature, CONFIG.commitment);
        
        if (confirmation.value.err) {
            throw new Error('Transaction failed: ' + JSON.stringify(confirmation.value.err));
        }
        
        console.log('✅ Token created successfully!');
        
        // Set mint for return value
        mint = { publicKey: mintKeypair.publicKey };
        
        console.log('✅ Token created and minted successfully to your wallet!');
        
        // 8. Add metadata if requested
        let metadataAdded = false;
        if (tokenData.enableMetadata) {
            try {
                console.log('📄 Adding enhanced metadata in separate transaction...');
                
                // Wait briefly if MPL is still loading
                if (window.MPL_READY === false) {
                    await new Promise(r => setTimeout(r, 500));
                }
                
                // Create enhanced metadata with social links
                const enhancedMetadata = createEnhancedMetadata(tokenData, imageURI);
                
                const metadataInstruction = createMetadataInstruction(
                    metadataAccount,
                    mintKeypair.publicKey,
                    wallet.publicKey,     // mint authority
                    wallet.publicKey,     // payer
                    wallet.publicKey,     // update authority
                    tokenData.name,
                    tokenData.symbol,
                    JSON.stringify(enhancedMetadata) // Enhanced metadata as URI
                );
                
                if (!metadataInstruction) {
                    throw new Error('Metaplex builder unavailable; skipping metadata');
                }
                
                // Create metadata transaction
                const metadataTransaction = new solanaWeb3.Transaction().add(metadataInstruction);
                const { blockhash: metadataBlockhash } = await connection.getLatestBlockhash();
                metadataTransaction.recentBlockhash = metadataBlockhash;
                metadataTransaction.feePayer = wallet.publicKey;
                
                console.log('📝 Requesting wallet signature for enhanced metadata...');
                const signedMetadataTransaction = await wallet.signTransaction(metadataTransaction);
                const metadataSignature = await connection.sendRawTransaction(signedMetadataTransaction.serialize());
                
                console.log('📡 Enhanced metadata transaction sent:', metadataSignature);
                const metadataConfirmation = await confirmTransactionWithProgress(metadataSignature, 'confirmed');
                
                if (metadataConfirmation.value.err) {
                    throw new Error('Metadata transaction failed: ' + JSON.stringify(metadataConfirmation.value.err));
                }
                
                metadataAdded = true;
                console.log('✅ Enhanced metadata with social links added successfully!');
                
            } catch (metadataError) {
                console.warn('⚠️ Enhanced metadata creation failed, but token was created successfully:', metadataError);
            }
        }
        
        // Return enhanced token info
        const tokenInfo = {
            mint: mint.publicKey.toString(),
            name: tokenData.name,
            symbol: tokenData.symbol,
            decimals: tokenData.decimals,
            supply: tokenData.supply,
            description: tokenData.description,
            owner: wallet.publicKey.toString(),
            associatedTokenAccount: associatedTokenAccount.toString(),
            metadataAccount: metadataAccount.toString(),
            imageURI: imageURI || null,
            metadataCreated: metadataAdded,
            network: selectedNetwork,
            networkName: NETWORK_CONFIGS[selectedNetwork].displayName,
            // Social links
            socialLinks: {
                twitter: tokenData.twitter || null,
                discord: tokenData.discord || null,
                website: tokenData.website || null,
                telegram: tokenData.telegram || null
            },
            // Advanced options applied
            authorities: {
                freezeRevoked: tokenData.revokeFreeze,
                mintRevoked: tokenData.revokeMint,
                metadataImmutable: tokenData.enableImmutable && metadataAdded
            },
            createdAt: new Date().toISOString()
        };
        
        if (metadataAdded) {
            console.log('🎉 Enhanced token with metadata and social links created successfully:', tokenInfo);
        } else {
            console.log('🎉 Token created successfully:', tokenInfo);
        }
        return tokenInfo;
        
    } catch (error) {
        console.error('❌ Error in createSPLToken:', error);
        throw error;
    }
}

/**
 * Clear the form
 */
function clearForm() {
    document.getElementById('token-form').reset();
    document.getElementById('token-decimals').value = '9'; // Reset default
}

/**
 * Show status message
 */
function showStatus(type, message) {
    const container = document.getElementById('status-container');
    
    const statusDiv = document.createElement('div');
    statusDiv.className = `status-message ${type}`;
    statusDiv.textContent = message;
    
    // Clear existing status
    container.innerHTML = '';
    container.appendChild(statusDiv);
    
    // Auto-hide success/info messages after 10 seconds
    if (type === 'success' || type === 'info') {
        setTimeout(() => {
            if (container.contains(statusDiv)) {
                statusDiv.style.opacity = '0';
                setTimeout(() => {
                    if (container.contains(statusDiv)) {
                        container.removeChild(statusDiv);
                    }
                }, 300);
            }
        }, 10000);
    }
} 

/**
 * Load tokens from wallet and populate dropdowns
 */








