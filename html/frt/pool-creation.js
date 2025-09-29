// Pool Creation Dashboard - JavaScript Logic
// Handles Backpack wallet connection, token fetching, and pool creation
// Configuration is loaded from config.js
//
// Dependencies:
// - error-codes.js: Centralized error code mapping (loaded via script tag)

// Global state
let connection = null;
let wallet = null;
let isConnected = false;
let userTokens = [];
let selectedTokenA = null;
let selectedTokenB = null;
let currentRatio = 1;
let errorCountdownTimer = null;
// Compute unit budget for pool creation (tunable for testing)
let poolCreateComputeUnits = 195_000; // Testing threshold - pool creation uses ~90k CUs

// Pagination state
let currentTokenPage = 0;
const tokensPerPage = 4;
let totalTokenPages = 0;

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

// Human-readable number formatter (no scientific notation)
function formatHumanNumber(value) {
    if (value === null || value === undefined || isNaN(value)) return '0';
    const abs = Math.abs(value);
    const isInt = Number.isInteger(value);
    const formatInt = (n) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (abs >= 1_000_000_000_000) return `${formatInt(Math.trunc(value / 1_000_000_000_000))}T`;
    if (abs >= 1_000_000_000) return `${formatInt(Math.trunc(value / 1_000_000_000))}B`;
    if (abs >= 1_000_000) return `${formatInt(Math.trunc(value / 1_000_000))}M`;
    if (abs >= 1_000) return formatInt(value);
    return isInt ? `${value}` : value.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Pool Creation Dashboard initializing...');
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
            showStatus('error', '❌ Failed to load required libraries. Please refresh the page.');
        }
    };
    
    // Start first attempt after a brief delay
    setTimeout(tryInitialize, 1500);
});

/**
 * Initialize the application
 */
async function initializeApp() {
    try {
        // Initialize Solana connection with robust fallback support
        console.log('🔌 Connecting to Solana RPC...');
        
        // Use the robust connection helper from config.js
        if (typeof createRobustConnection === 'function') {
            connection = await createRobustConnection();
        } else {
            // Fallback to original method if helper not available
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
        
        // Check if already connected
        if (window.backpack.isConnected) {
            await handleWalletConnected();
        }
        
        console.log('✅ Pool Creation Dashboard initialized');
        clearStatus();
    } catch (error) {
        console.error('❌ Failed to initialize:', error);
        showStatus('error', 'Failed to initialize application: ' + error.message);
    }
}

// Program initialization is handled automatically during deployment by the program authority
// Users do not need to manually initialize the program

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
        
        // System initialization is handled by deployment authority
        
        // Check balance
        await checkWalletBalance();
        
        // Load user tokens
        await loadUserTokens();
        
        // Program initialization is handled by deployment script (program authority only)
        
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
        selectedTokenA = null;
        selectedTokenB = null;
        
        // Update UI
        document.getElementById('wallet-info').style.display = 'none';
        document.getElementById('wallet-disconnected').style.display = 'flex';
        document.getElementById('connect-wallet-btn').textContent = 'Connect Backpack Wallet';
        document.getElementById('connect-wallet-btn').onclick = connectWallet;
        // Initialize System button removed - system initialization is deployment authority responsibility
        
        // Reset tokens section
        document.getElementById('tokens-loading').style.display = 'block';
        document.getElementById('tokens-container').style.display = 'none';
        // 🛡️ SECURITY FIX: Use safe DOM manipulation for tokens loading
        const tokensLoading = document.getElementById('tokens-loading');
        tokensLoading.innerHTML = ''; // Clear existing content
        const h3 = document.createElement('h3');
        h3.textContent = '🔍 Loading your tokens...';
        const p = document.createElement('p');
        p.textContent = 'Please connect your wallet to see your token balances';
        tokensLoading.appendChild(h3);
        tokensLoading.appendChild(p);
        
        // Reset pool creation section
        resetPoolCreation();
        
        showStatus('info', 'Wallet disconnected');
        
    } catch (error) {
        console.error('❌ Error disconnecting wallet:', error);
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
            showStatus('error', `⚠️ Low SOL balance: ${formatHumanNumber(solBalance)} SOL. You may need more SOL for transactions.`);
        } else {
            console.log(`💰 Wallet balance: ${formatHumanNumber(solBalance)} SOL`);
        }
    } catch (error) {
        console.error('❌ Error checking balance:', error);
    }
}

/**
 * Load user's SPL tokens
 */
// Store raw token accounts for lazy loading
let rawTokenAccounts = [];
let loadedTokensCount = 0;
let isLoadingTokens = false;

async function loadUserTokens() {
    // Prevent concurrent token loading
    if (isLoadingTokens) {
        console.log('⏳ Token loading already in progress, skipping...');
        return;
    }
    
    try {
        isLoadingTokens = true;
        showStatus('info', '🔍 Loading your tokens...');
        
        // Get all token accounts for the user (but don't process them all yet)
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
            wallet.publicKey,
            { programId: window.splToken.TOKEN_PROGRAM_ID }
        );
        
        console.log(`Found ${tokenAccounts.value.length} token accounts`);
        
        // Filter accounts with balances and sort by balance (highest first)
        rawTokenAccounts = tokenAccounts.value
            .filter(account => {
                const balance = parseFloat(account.account.data.parsed.info.tokenAmount.uiAmount) || 0;
                return balance > 0;
            })
            .sort((a, b) => {
                const balanceA = parseFloat(a.account.data.parsed.info.tokenAmount.uiAmount) || 0;
                const balanceB = parseFloat(b.account.data.parsed.info.tokenAmount.uiAmount) || 0;
                return balanceB - balanceA;
            });
        
        console.log(`Found ${rawTokenAccounts.length} tokens with balances`);
        
        // Preserve manually added tokens
        const manuallyAddedTokens = userTokens.filter(token => token.isManuallyAdded);
        
        // Reset state but keep manually added tokens
        userTokens = [...manuallyAddedTokens];
        loadedTokensCount = 0;
        currentTokenPage = 0;
        
        // Load first batch of tokens (only first 4)
        await loadTokenBatch(0, tokensPerPage);
        
        updateTokensDisplay();
        
        if (userTokens.length > 0) {
            showStatus('success', `✅ Loaded first ${userTokens.length} tokens (${rawTokenAccounts.length} total available)`);
        } else {
            showStatus('info', '📭 No tokens with balances found in your wallet');
        }
        
    } catch (error) {
        console.error('❌ Error loading user tokens:', error);
        showStatus('error', 'Failed to load tokens: ' + error.message);
    } finally {
        isLoadingTokens = false;
    }
}

/**
 * Load a batch of tokens with metadata
 */
async function loadTokenBatch(startIndex, count) {
    const endIndex = Math.min(startIndex + count, rawTokenAccounts.length);
    
    for (let i = startIndex; i < endIndex; i++) {
        if (i >= rawTokenAccounts.length) break;
        
        const tokenAccount = rawTokenAccounts[i];
        const accountInfo = tokenAccount.account.data.parsed.info;
        const mintAddress = accountInfo.mint;
        const balance = parseFloat(accountInfo.tokenAmount.uiAmount) || 0;
        
        let tokenInfo = {
            mint: mintAddress,
            balance: balance,
            decimals: accountInfo.tokenAmount.decimals,
            symbol: `${mintAddress.slice(0, 4)}`, // Default symbol fallback
            name: `Token ${mintAddress.slice(0, 8)}...`, // Default name
            tokenAccount: tokenAccount.pubkey.toString()
        };
        
        try {
            // Try to fetch metadata from common sources
            await tryFetchTokenMetadata(tokenInfo);
        } catch (error) {
            console.warn(`Failed to fetch metadata for token ${mintAddress}:`, error);
        }
        
        // Check if token already exists (avoid duplicates)
        const existingIndex = userTokens.findIndex(token => token.mint === mintAddress);
        if (existingIndex >= 0) {
            // If it's a manually added token, preserve the isManuallyAdded flag
            if (userTokens[existingIndex].isManuallyAdded) {
                tokenInfo.isManuallyAdded = true;
            }
            userTokens[existingIndex] = tokenInfo;
        } else {
            userTokens.push(tokenInfo);
        }
    }
    
    loadedTokensCount = Math.max(loadedTokensCount, endIndex);
}

/**
 * Try to fetch token metadata from various sources
 */
async function tryFetchTokenMetadata(tokenInfo) {
    try {
        // Try to fetch metadata from Metaplex Token Metadata Program
        console.log(`🔍 Querying Metaplex metadata for token ${tokenInfo.mint}`);
        const metadataAccount = await queryMetaplexMetadata(tokenInfo.mint);
        
        if (metadataAccount) {
            tokenInfo.symbol = metadataAccount.symbol || tokenInfo.symbol;
            tokenInfo.name = metadataAccount.name || tokenInfo.name;
            console.log(`✅ Found Metaplex metadata: ${tokenInfo.symbol} (${tokenInfo.name})`);
            return;
        }
        
        // Try Jupiter token list as fallback
        console.log(`🔍 Trying Jupiter token list for ${tokenInfo.mint}`);
        const jupiterMetadata = await fetchJupiterTokenMetadata(tokenInfo.mint);
        if (jupiterMetadata) {
            tokenInfo.symbol = jupiterMetadata.symbol || tokenInfo.symbol;
            tokenInfo.name = jupiterMetadata.name || tokenInfo.name;
            console.log(`✅ Found Jupiter metadata: ${tokenInfo.symbol} (${tokenInfo.name})`);
            return;
        }
        
        // Fallback to default values
        console.log(`⚠️ Using default metadata for token ${tokenInfo.mint}`);
        
    } catch (error) {
        console.warn('❌ Error fetching token metadata:', error);
    }
}

/**
 * Fetch token metadata from Jupiter token list
 */
async function fetchJupiterTokenMetadata(mintAddress) {
    try {
        const response = await fetch(`https://token.jup.ag/token/${mintAddress}`);
        if (response.ok) {
            const data = await response.json();
            return {
                name: data.name,
                symbol: data.symbol,
                image: data.logoURI
            };
        }
    } catch (error) {
        console.warn(`Failed to fetch Jupiter metadata for ${mintAddress}:`, error);
    }
    return null;
}

/**
 * Query Metaplex Token Metadata Program for token metadata
 */
async function queryMetaplexMetadata(tokenMintAddress) {
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
        
        console.log(`🔍 Checking metadata account: ${metadataAccount.toString()}`);
        
        // Try to fetch the metadata account
        const accountInfo = await connection.getAccountInfo(metadataAccount);
        
        if (!accountInfo) {
            console.log(`⚠️ No metadata account found for token ${tokenMintAddress}`);
            return null;
        }
        
        // Parse metadata (simplified - in production you'd use @metaplex-foundation/mpl-token-metadata)
        const data = accountInfo.data;
        
        // Basic parsing of metadata structure
        // This is a simplified version - the actual Metaplex metadata has a complex structure
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
        console.warn(`❌ Error querying Metaplex metadata for ${tokenMintAddress}:`, error);
        return null;
    }
}

/**
 * Update tokens display with pagination
 */
function updateTokensDisplay() {
    const tokensContainer = document.getElementById('tokens-container');
    const tokensLoading = document.getElementById('tokens-loading');
    
    if (userTokens.length === 0) {
        tokensLoading.style.display = 'block';
        tokensContainer.style.display = 'none';
        // 🛡️ SECURITY FIX: Use safe DOM manipulation for no tokens message
        tokensLoading.innerHTML = ''; // Clear existing content
        const h3 = document.createElement('h3');
        h3.textContent = '📭 No tokens found';
        tokensLoading.appendChild(h3);
        
        const p1 = document.createElement('p');
        p1.textContent = 'You don\'t have any SPL tokens in your wallet.';
        tokensLoading.appendChild(p1);
        
        const p2 = document.createElement('p');
        const link = document.createElement('a');
        link.href = 'token-creation.html';
        link.textContent = 'Create some tokens';
        p2.appendChild(document.createTextNode(''));
        p2.appendChild(link);
        p2.appendChild(document.createTextNode(' first to start creating pools!'));
        tokensLoading.appendChild(p2);
        return;
    }
    
    tokensLoading.style.display = 'none';
    tokensContainer.style.display = 'block';
    
    // Calculate pagination based on total available tokens, not just loaded ones
    const totalAvailableTokens = rawTokenAccounts.length || userTokens.length;
    totalTokenPages = Math.ceil(totalAvailableTokens / tokensPerPage);
    const startIndex = currentTokenPage * tokensPerPage;
    const endIndex = Math.min(startIndex + tokensPerPage, userTokens.length);
    const tokensToShow = userTokens.slice(startIndex, endIndex);
    
    // Clear container and add pagination controls
    tokensContainer.innerHTML = '';
    
    // Add pagination info and controls
    const paginationHeader = document.createElement('div');
    paginationHeader.className = 'pagination-header';
    // 🛡️ SECURITY FIX: Use safe DOM manipulation for pagination header
    paginationHeader.innerHTML = ''; // Clear existing content
    
    const infoDiv = document.createElement('div');
    infoDiv.className = 'pagination-info';
    const infoSpan = document.createElement('span');
    infoSpan.textContent = `Showing ${startIndex + 1}-${Math.min(startIndex + tokensToShow.length, totalAvailableTokens)} of ${totalAvailableTokens} tokens`;
    infoDiv.appendChild(infoSpan);
    paginationHeader.appendChild(infoDiv);
    
    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'pagination-controls';
    
    const prevBtn = document.createElement('button');
    prevBtn.className = 'pagination-btn';
    prevBtn.onclick = previousTokenPage;
    prevBtn.disabled = currentTokenPage === 0;
    prevBtn.textContent = '← Previous';
    controlsDiv.appendChild(prevBtn);
    
    const pageInfo = document.createElement('span');
    pageInfo.className = 'page-info';
    pageInfo.textContent = `Page ${currentTokenPage + 1} of ${totalTokenPages}`;
    controlsDiv.appendChild(pageInfo);
    
    const nextBtn = document.createElement('button');
    nextBtn.className = 'pagination-btn';
    nextBtn.onclick = nextTokenPage;
    nextBtn.disabled = currentTokenPage >= totalTokenPages - 1;
    nextBtn.textContent = 'Next →';
    controlsDiv.appendChild(nextBtn);
    
    paginationHeader.appendChild(controlsDiv);
    tokensContainer.appendChild(paginationHeader);
    
    // Add tokens grid
    const tokensGrid = document.createElement('div');
    tokensGrid.className = 'tokens-grid';
    
    // ============================================================================
    // TOKEN CARDS CREATION SECTION
    // ============================================================================
    // This section creates the visual token cards displayed in the tokens grid
    // Each card shows: Symbol, Balance, Name, Mint Address, and Debug Button
    // Layout: SYMBOL                                            BALANCE
    //         Token Name
    //         mint...address                           [🔍 Debug Token]
    // ============================================================================
    
    tokensToShow.forEach((token, index) => {
        // ========== TOKEN CARD CONTAINER ==========
        const tokenCard = document.createElement('div');
        tokenCard.className = 'token-card';
        tokenCard.onclick = () => selectToken(token);
        
        // Check if token is selected
        const isSelectedA = selectedTokenA && selectedTokenA.mint === token.mint;
        const isSelectedB = selectedTokenB && selectedTokenB.mint === token.mint;
        
        if (isSelectedA || isSelectedB) {
            tokenCard.classList.add('selected');
        }
        
        // 🛡️ SECURITY FIX: Use safe DOM manipulation for token cards
        tokenCard.innerHTML = ''; // Clear existing content
        
        // ========== TOKEN IMAGE ==========
        const imageDiv = document.createElement('div');
        imageDiv.className = 'token-image';
        imageDiv.innerHTML = createTokenImageHTML(token.mint, token.symbol); // Safe - controlled content
        tokenCard.appendChild(imageDiv);
        
        // ========== TOKEN HEADER (Symbol + Balance) ==========
        const headerDiv = document.createElement('div');
        headerDiv.className = 'token-header';
        
        // Token Symbol (left side)
        const symbolDiv = document.createElement('div');
        symbolDiv.className = 'token-symbol';
        symbolDiv.textContent = token.symbol;
        headerDiv.appendChild(symbolDiv);
        
        // Token Balance (right side)
        const balanceDiv = document.createElement('div');
        balanceDiv.className = 'token-balance';
        balanceDiv.textContent = formatHumanNumber(token.balance);
        headerDiv.appendChild(balanceDiv);
        
        tokenCard.appendChild(headerDiv);
        
        // ========== TOKEN NAME ==========
        const nameDiv = document.createElement('div');
        nameDiv.className = 'token-name';
        nameDiv.textContent = token.name;
        tokenCard.appendChild(nameDiv);
        
        // ========== TOKEN MINT ADDRESS ==========
        const mintDiv = document.createElement('div');
        mintDiv.className = 'token-mint';
        mintDiv.title = token.mint;
        mintDiv.textContent = `${token.mint.slice(0, 8)}...${token.mint.slice(-8)}`;
        tokenCard.appendChild(mintDiv);
        
        // ========== DEBUG BUTTON ROW ==========
        // Creates a row with spacer on left and debug button on right
        // This aligns the debug button to the right, opposite the mint address
        const debugDiv = document.createElement('div');
        debugDiv.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-top: 8px;';
        
        const spacer = document.createElement('div'); // Empty spacer for left alignment
        debugDiv.appendChild(spacer);
        
        // Debug Token Button (opens token listing debugger in new tab)
        const debugBtn = document.createElement('button');
        debugBtn.className = 'debug-btn';
        debugBtn.innerHTML = '<div style="line-height: 1.2;">🔍<br>Debug<br>Token</div>';
        debugBtn.title = 'Debug why this token might not be listing on exchanges';
        debugBtn.style.cssText = `
            background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
            color: white;
            border: none;
            padding: 8px 10px;
            border-radius: 8px;
            font-size: 10px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            height: 45px;
            width: 50px;
            display: flex;
            align-items: center;
            justify-content: center;
            text-align: center;
        `;
        // Button hover effects
        debugBtn.onmouseover = () => {
            debugBtn.style.transform = 'translateY(-1px)';
            debugBtn.style.boxShadow = '0 4px 8px rgba(245, 158, 11, 0.3)';
        };
        debugBtn.onmouseout = () => {
            debugBtn.style.transform = 'translateY(0)';
            debugBtn.style.boxShadow = 'none';
        };
        // Button click handler - opens debugger with this token's mint
        debugBtn.onclick = (e) => {
            e.stopPropagation(); // Prevent token selection when clicking debug button
            window.open(`token-listing-debugger.html?mint=${token.mint}`, '_blank');
        };
        debugDiv.appendChild(debugBtn);
        
        tokenCard.appendChild(debugDiv);
        // ========== END DEBUG BUTTON ROW ==========
        
        // ========== SELECTION BADGE ==========
        // Shows 'A' or 'B' badge if token is selected for pool creation
        if (isSelectedA || isSelectedB) {
            const badgeDiv = document.createElement('div');
            badgeDiv.className = 'selected-badge';
            badgeDiv.textContent = isSelectedA ? 'A' : 'B';
            tokenCard.appendChild(badgeDiv);
        }
        
        // Add completed token card to the grid
        tokensGrid.appendChild(tokenCard);
    });
    
    // ============================================================================
    // END TOKEN CARDS CREATION SECTION
    // ============================================================================
    
    tokensContainer.appendChild(tokensGrid);
}

/**
 * Navigate to previous token page
 */
function previousTokenPage() {
    if (currentTokenPage > 0) {
        currentTokenPage--;
        updateTokensDisplay();
    }
}

/**
 * Navigate to next token page
 */
async function nextTokenPage() {
    if (currentTokenPage < Math.ceil(rawTokenAccounts.length / tokensPerPage) - 1) {
        currentTokenPage++;
        
        // Check if we need to load more tokens
        const requiredTokens = (currentTokenPage + 1) * tokensPerPage;
        if (requiredTokens > userTokens.length && loadedTokensCount < rawTokenAccounts.length) {
            showStatus('info', 'Loading more tokens...');
            
            // Load next batch
            const startIndex = loadedTokensCount;
            const tokensToLoad = Math.min(tokensPerPage, rawTokenAccounts.length - startIndex);
            
            await loadTokenBatch(startIndex, tokensToLoad);
            
            showStatus('success', `Loaded ${tokensToLoad} more tokens`);
        }
        
        updateTokensDisplay();
    }
}

/**
 * Get token image URL with multiple fallback sources
 */
function getTokenImage(mintAddress) {
    // Try multiple sources for token images
    const imageSources = [
        // Jupiter token list (most comprehensive)
        `https://static.jup.ag/jup-token-list/${mintAddress}.png`,
        // Solana token registry
        `https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/${mintAddress}/logo.png`,
        // CoinGecko proxy (for popular tokens)
        `https://assets.coingecko.com/coins/images/solana-${mintAddress.toLowerCase()}/small/logo.png`,
        // Fallback to a generic token icon
        `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='40' fill='%23667eea'/><text x='50' y='60' text-anchor='middle' fill='white' font-size='30'>?</text></svg>`
    ];
    
    // Return the first source, the img tag will handle fallbacks with onerror
    return imageSources[0];
}

/**
 * Create image element with multiple fallback sources
 */
function createTokenImageElement(mintAddress, symbol, className = '') {
    const imageSources = [
        `https://static.jup.ag/jup-token-list/${mintAddress}.png`,
        `https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/${mintAddress}/logo.png`,
        `https://assets.coingecko.com/coins/images/solana-${mintAddress.toLowerCase()}/small/logo.png`
    ];
    
    let fallbackIndex = 0;
    const fallbackSvg = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='40' fill='%23667eea'/><text x='50' y='60' text-anchor='middle' fill='white' font-size='30'>${symbol.charAt(0)}</text></svg>`;
    
    const onError = `
        this.onerror = null;
        if (${fallbackIndex} < ${imageSources.length - 1}) {
            this.src = '${imageSources[++fallbackIndex]}';
            this.onerror = arguments.callee;
        } else {
            this.src = '${fallbackSvg}';
        }
    `;
    
    return `<img src="${imageSources[0]}" alt="${symbol}" class="${className}" onerror="${onError}">`;
}

/**
 * Create token image HTML using PHP cache
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
 * Handle image loading errors with fallback sources
 */
function handleImageError(imgElement, mintAddress, symbol) {
    const coingeckoUrl = `https://assets.coingecko.com/coins/images/solana-${mintAddress.toLowerCase()}/small/logo.png`;
    const solanaUrl = `https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/${mintAddress}/logo.png`;
    const fallbackSvg = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='40' fill='%23667eea'/><text x='50' y='60' text-anchor='middle' fill='white' font-size='30'>${symbol.charAt(0)}</text></svg>`;
    
    if (imgElement.src === solanaUrl) {
        imgElement.src = coingeckoUrl;
    } else if (imgElement.src === coingeckoUrl) {
        imgElement.src = fallbackSvg;
    }
    // If it's already the fallback SVG, do nothing
}

/**
 * Add token manually by mint address
 */
async function addTokenManually(mintAddress) {
    try {
        if (!mintAddress || mintAddress.trim().length === 0) {
            showStatus('error', 'Please enter a valid token mint address');
            return;
        }
        
        mintAddress = mintAddress.trim();
        
        // Validate it's a valid public key
        try {
            new solanaWeb3.PublicKey(mintAddress);
        } catch (error) {
            showStatus('error', 'Invalid token mint address format');
            return;
        }
        
        // Check if token is already in the list
        const existingToken = userTokens.find(token => token.mint === mintAddress);
        if (existingToken) {
            // If token exists, just select it for the pool
            selectTokenForPool(existingToken);
            showStatus('info', `Token ${existingToken.symbol} is already in your list and selected for pool`);
            
            // Clear the input
            const manualTokenInput = document.getElementById('manual-token-input');
            if (manualTokenInput) {
                manualTokenInput.value = '';
            }
            return;
        }
        
        showStatus('info', 'Loading token information...');
        
        // Get token account info
        const mintInfo = await connection.getParsedAccountInfo(new solanaWeb3.PublicKey(mintAddress));
        if (!mintInfo.value || !mintInfo.value.data.parsed) {
            showStatus('error', 'Token mint not found or invalid');
            return;
        }
        
        const mintData = mintInfo.value.data.parsed.info;
        
        // Try to get metadata
        let tokenName = 'Unknown Token';
        let tokenSymbol = 'UNK';
        
        try {
            const metadata = await queryMetaplexMetadata(mintAddress);
            if (metadata) {
                tokenName = metadata.name || tokenName;
                tokenSymbol = metadata.symbol || tokenSymbol;
            }
        } catch (error) {
            console.warn('Could not fetch token metadata:', error);
        }
        
        // Check if user has this token (balance will be 0 if they don't)
        let balance = 0;
        try {
            const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
                wallet.publicKey,
                { mint: new solanaWeb3.PublicKey(mintAddress) }
            );
            
            if (tokenAccounts.value.length > 0) {
                const accountInfo = tokenAccounts.value[0].account.data.parsed.info;
                balance = parseFloat(accountInfo.tokenAmount.uiAmount) || 0;
            }
        } catch (error) {
            console.warn('Could not fetch token balance:', error);
        }
        
        // Add token to list
        const newToken = {
            mint: mintAddress,
            name: tokenName,
            symbol: tokenSymbol,
            balance: balance,
            decimals: mintData.decimals,
            isManuallyAdded: true
        };
        
        userTokens.unshift(newToken); // Add to beginning of list
        updateTokensDisplay();
        
        // Automatically select the token for pool configuration
        selectTokenForPool(newToken);
        
        showStatus('success', `Added ${tokenSymbol} to token list and selected for pool${balance > 0 ? ` (Balance: ${formatHumanNumber(balance)})` : ' (No balance)'}`);
        
        // Clear the input
        const manualTokenInput = document.getElementById('manual-token-input');
        if (manualTokenInput) {
            manualTokenInput.value = '';
        }
        
    } catch (error) {
        console.error('Error adding token manually:', error);
        showStatus('error', 'Failed to add token: ' + error.message);
    }
}

/**
 * Select a token for the pool (from token grid)
 */
function selectToken(token) {
    selectTokenForPool(token);
}

/**
 * Select a token for pool configuration (shared logic)
 */
function selectTokenForPool(token) {
    // If no tokens selected, this becomes Token A
    if (!selectedTokenA && !selectedTokenB) {
        selectedTokenA = token;
        showStatus('success', `Selected ${token.symbol} as Token A`);
    }
    // If only Token A is selected, this becomes Token B (unless it's the same token)
    else if (selectedTokenA && !selectedTokenB) {
        if (selectedTokenA.mint === token.mint) {
            showStatus('error', 'Cannot select the same token for both positions');
            return;
        }
        selectedTokenB = token;
        showStatus('success', `Selected ${token.symbol} as Token B`);
    }
    // If both are selected, replace Token B first, then Token A
    else {
        if (selectedTokenA.mint === token.mint) {
            showStatus('info', `${token.symbol} is already selected as Token A`);
            return;
        }
        if (selectedTokenB && selectedTokenB.mint === token.mint) {
            showStatus('info', `${token.symbol} is already selected as Token B`);
            return;
        }
        selectedTokenB = token;
        showStatus('success', `Replaced Token B with ${token.symbol}`);
    }
    
    updateTokensDisplay();
    updatePoolCreationDisplay();
}

/**
 * Clear token selection (B first, then A)
 */
function clearTokenSelection() {
    if (selectedTokenB) {
        selectedTokenB = null;
        showStatus('info', 'Cleared Token B selection');
    } else if (selectedTokenA) {
        selectedTokenA = null;
        showStatus('info', 'Cleared Token A selection');
    } else {
        showStatus('info', 'No tokens selected to clear');
        return;
    }
    
    updateTokensDisplay();
    updatePoolCreationDisplay();
}

/**
 * Clear specific token selection
 */
function clearTokenA() {
    if (selectedTokenA) {
        selectedTokenA = null;
        showStatus('info', 'Cleared Token A selection');
        updateTokensDisplay();
        updatePoolCreationDisplay();
    }
}

function clearTokenB() {
    if (selectedTokenB) {
        selectedTokenB = null;
        showStatus('info', 'Cleared Token B selection');
        updateTokensDisplay();
        updatePoolCreationDisplay();
    }
}

/**
 * Update pool creation display based on selected tokens
 */
function updatePoolCreationDisplay() {
    const tokenASelection = document.getElementById('token-a-selection');
    const tokenBSelection = document.getElementById('token-b-selection');
    const swapButton = document.getElementById('swap-tokens-btn');
    const ratioSection = document.getElementById('ratio-section');
    
    // Update Token A display
    if (selectedTokenA) {
        tokenASelection.className = 'token-selection active';
        // 🛡️ SECURITY FIX: Use safe DOM manipulation for token A selection
        tokenASelection.innerHTML = ''; // Clear existing content
        
        const imageDiv = document.createElement('div');
        imageDiv.className = 'selected-token-image';
        imageDiv.innerHTML = createTokenImageHTML(selectedTokenA.mint, selectedTokenA.symbol); // Safe - controlled content
        tokenASelection.appendChild(imageDiv);
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'selected-token-content';
        
        const symbolDiv = document.createElement('div');
        symbolDiv.className = 'selected-token-symbol';
        symbolDiv.textContent = selectedTokenA.symbol;
        contentDiv.appendChild(symbolDiv);
        
        const nameDiv = document.createElement('div');
        nameDiv.className = 'selected-token-name';
        nameDiv.textContent = selectedTokenA.name;
        contentDiv.appendChild(nameDiv);
        
        const balanceDiv = document.createElement('div');
        balanceDiv.className = 'selected-token-balance';
        balanceDiv.textContent = `Balance: ${formatHumanNumber(selectedTokenA.balance)}`;
        contentDiv.appendChild(balanceDiv);
        
        tokenASelection.appendChild(contentDiv);
        
        const clearBtn = document.createElement('button');
        clearBtn.className = 'clear-token-btn';
        clearBtn.onclick = clearTokenA;
        clearBtn.title = 'Clear Token A';
        clearBtn.textContent = '×';
        tokenASelection.appendChild(clearBtn);
    } else {
        tokenASelection.className = 'token-selection empty';
        // 🛡️ SECURITY FIX: Avoid innerHTML for empty selection A
        tokenASelection.textContent = '';
        const emptyA = document.createElement('div');
        emptyA.className = 'empty-selection';
        emptyA.textContent = 'Select Token A';
        tokenASelection.appendChild(emptyA);
    }
    
    // Update Token B display
    if (selectedTokenB) {
        tokenBSelection.className = 'token-selection active';
        // 🛡️ SECURITY FIX: Use safe DOM manipulation for token B selection
        tokenBSelection.innerHTML = '';
        const imageDivB = document.createElement('div');
        imageDivB.className = 'selected-token-image';
        imageDivB.innerHTML = createTokenImageHTML(selectedTokenB.mint, selectedTokenB.symbol); // Controlled HTML
        tokenBSelection.appendChild(imageDivB);

        const contentDivB = document.createElement('div');
        contentDivB.className = 'selected-token-content';
        const symbolDivB = document.createElement('div');
        symbolDivB.className = 'selected-token-symbol';
        symbolDivB.textContent = selectedTokenB.symbol;
        const nameDivB = document.createElement('div');
        nameDivB.className = 'selected-token-name';
        nameDivB.textContent = selectedTokenB.name;
        const balanceDivB = document.createElement('div');
        balanceDivB.className = 'selected-token-balance';
        balanceDivB.textContent = `Balance: ${formatHumanNumber(selectedTokenB.balance)}`;
        contentDivB.appendChild(symbolDivB);
        contentDivB.appendChild(nameDivB);
        contentDivB.appendChild(balanceDivB);
        tokenBSelection.appendChild(contentDivB);

        const clearBtnB = document.createElement('button');
        clearBtnB.className = 'clear-token-btn';
        clearBtnB.onclick = clearTokenB;
        clearBtnB.title = 'Clear Token B';
        clearBtnB.textContent = '×';
        tokenBSelection.appendChild(clearBtnB);
    } else {
        tokenBSelection.className = 'token-selection empty';
        // 🛡️ SECURITY FIX: Avoid innerHTML for empty selection B
        tokenBSelection.textContent = '';
        const emptyB = document.createElement('div');
        emptyB.className = 'empty-selection';
        emptyB.textContent = 'Select Token B';
        tokenBSelection.appendChild(emptyB);
    }
    
    // Enable swap button if both tokens are selected
    swapButton.disabled = !selectedTokenA || !selectedTokenB;
    
    // Show ratio section if both tokens are selected
    if (selectedTokenA && selectedTokenB) {
        ratioSection.style.display = 'block';
        document.getElementById('pool-flags-section').style.display = 'block';
        updateRatioDisplay();
        updatePoolFlags();
        updatePoolSummary();
        updateCreateButtonState();
    } else {
        ratioSection.style.display = 'none';
        document.getElementById('pool-flags-section').style.display = 'none';
        document.getElementById('pool-summary-section').style.display = 'none';
    }
}

/**
 * Swap Token A and Token B
 */
function swapTokens() {
    if (!selectedTokenA || !selectedTokenB) return;
    
    const temp = selectedTokenA;
    selectedTokenA = selectedTokenB;
    selectedTokenB = temp;
    
    showStatus('info', `Swapped tokens: ${selectedTokenA.symbol} ⇄ ${selectedTokenB.symbol}`);
    
    updateTokensDisplay();
    updatePoolCreationDisplay();
}

/**
 * ✅ BASIS POINTS REFACTOR: Update ratio display with real-time validation
 */
function updateRatioDisplay() {
    if (!selectedTokenA || !selectedTokenB) return;
    
    const ratioInput = document.getElementById('ratio-input');
    const inputValue = ratioInput.value;
    
    // Validate input for whole numbers only
    const isValid = validateRatioInput(inputValue);
    
    if (isValid) {
        currentRatio = parseFloat(inputValue) || 1;
        
        // Respect user's selection order: first selected token (Token A) should appear first
        // Display as: 1 Token A = currentRatio Token B
        document.getElementById('ratio-token-a').textContent = selectedTokenA.symbol;
        document.getElementById('ratio-token-b').textContent = selectedTokenB.symbol;
        document.getElementById('ratio-value').textContent = window.TokenDisplayUtils.formatExchangeRate(currentRatio);
        document.getElementById('ratio-input-label').textContent = selectedTokenB.symbol;
        
        // Update pool summary
        updatePoolSummary();
    }
    
    // Update pool flags (auto-detect one-to-many)
    updatePoolFlags();
    
    // Always update button state based on validation
    updateCreateButtonState();
}

/**
 * Validate ratio input - only allow whole numbers
 */
function validateRatioInput(value) {
    const ratioInput = document.getElementById('ratio-input');
    let errorDiv = document.getElementById('ratio-error');
    
    // Remove existing error message
    if (errorDiv) {
        errorDiv.remove();
    }
    
    // Check if value is empty
    if (!value || value.trim() === '') {
        ratioInput.classList.remove('invalid');
        return false;
    }
    
    const numValue = parseFloat(value);
    
    // Check if it's a valid number and a whole number
    const isWholeNumber = Number.isInteger(numValue) && numValue >= 1;
    
    if (!isWholeNumber) {
        // Add invalid styling
        ratioInput.classList.add('invalid');
        
        // Create error message
        errorDiv = document.createElement('div');
        errorDiv.id = 'ratio-error';
        errorDiv.className = 'validation-error';
        errorDiv.textContent = 'Please enter a whole number (1, 2, 160, etc.)';
        
        // Insert error message after the input
        const ratioSection = document.querySelector('.ratio-input-section');
        if (ratioSection) {
            ratioSection.appendChild(errorDiv);
        }
        
        return false;
    } else {
        // Remove invalid styling
        ratioInput.classList.remove('invalid');
        return true;
    }
}


/**
 * Update pool flags display and validation
 */
function updatePoolFlags() {
    if (!selectedTokenA || !selectedTokenB) return;
    
    const activeFlags = getSelectedFlags();
    const activeFlagsDisplay = document.getElementById('active-flags-display');
    const activeFlagsList = document.getElementById('active-flags-list');
    
    // Show active flags if any are selected
    if (activeFlags.length > 0) {
        activeFlagsDisplay.style.display = 'block';
        // 🛡️ SECURITY: Build flags via DOM
        activeFlagsList.textContent = '';
        activeFlags.forEach(flag => {
            const span = document.createElement('span');
            span.style.background = flag.color;
            span.style.color = 'white';
            span.style.padding = '3px 8px';
            span.style.borderRadius = '4px';
            span.style.fontSize = '12px';
            span.style.fontWeight = '600';
            span.textContent = `${flag.icon} ${flag.name}`;
            activeFlagsList.appendChild(span);
            const spacer = document.createTextNode(' ');
            activeFlagsList.appendChild(spacer);
        });
    } else {
        activeFlagsDisplay.style.display = 'none';
    }
    
    console.log('🚩 Pool flags updated:', {
        activeFlags: activeFlags.map(f => f.name),
        flagsByte: calculateFlagsByte()
    });
}

/**
 * Get selected pool flags
 */
function getSelectedFlags() {
    const flags = [];
    
    if (document.getElementById('flag-owner-only-swaps').checked) {
        flags.push({ name: 'Owner-Only Swaps', icon: '🔒', color: '#7c3aed' });
    }
    if (document.getElementById('flag-exact-exchange').checked) {
        flags.push({ name: 'Exact Exchange Required', icon: '🎯', color: '#dc2626' });
    }
    
    return flags;
}

/**
 * Calculate flags byte value from selected checkboxes
 * Only bits 5 and 6 are allowed during pool initialization
 */
function calculateFlagsByte() {
    let flags = 0;
    
    // Bit 5 (32): Owner-only swaps (settable at creation)
    if (document.getElementById('flag-owner-only-swaps').checked) {
        flags |= 32;
    }
    
    // Bit 6 (64): Exact exchange required (settable at creation)
    if (document.getElementById('flag-exact-exchange').checked) {
        flags |= 64;
    }
    
    // Note: Other flags (bits 0-4) are managed by the system or admin authority:
    // - Bit 0 (1): One-to-many ratio (automatically set by contract based on ratio analysis)
    // - Bit 1 (2): Liquidity paused (set by admin after creation)
    // - Bit 2 (4): Swaps paused (set by admin after creation)
    // - Bit 3 (8): Withdrawal protection (set by admin after creation)
    // - Bit 4 (16): Single LP token mode (reserved for future use)
    
    return flags;
}

/**
 * Update pool summary display
 */
function updatePoolSummary() {
    if (!selectedTokenA || !selectedTokenB) return;
    
    const summarySection = document.getElementById('pool-summary-section');
    const summaryPair = document.getElementById('summary-pair');
    const summaryRate = document.getElementById('summary-rate');
    const summaryFlags = document.getElementById('summary-flags');
    const summaryFlagsList = document.getElementById('summary-flags-list');
    
    // Respect user's selection order: first selected token appears first
    const displayPair = `${selectedTokenA.symbol} / ${selectedTokenB.symbol}`;
    const rateText = `1 ${selectedTokenA.symbol} = ${window.TokenDisplayUtils.formatExchangeRate(currentRatio)} ${selectedTokenB.symbol}`;
    
    summaryPair.textContent = displayPair;
    summaryRate.textContent = rateText;
    
    // Show active flags in summary
    const activeFlags = getSelectedFlags();
    if (activeFlags.length > 0) {
        summaryFlags.style.display = 'block';
        // 🛡️ SECURITY: Build summary flags via DOM
        summaryFlagsList.textContent = '';
        activeFlags.forEach(flag => {
            const span = document.createElement('span');
            span.style.background = flag.color;
            span.style.color = 'white';
            span.style.padding = '2px 6px';
            span.style.borderRadius = '4px';
            span.style.fontSize = '11px';
            span.style.fontWeight = '600';
            span.textContent = `${flag.icon} ${flag.name}`;
            summaryFlagsList.appendChild(span);
            const spacer = document.createTextNode(' ');
            summaryFlagsList.appendChild(spacer);
        });
    } else {
        summaryFlags.style.display = 'none';
    }
    
    summarySection.style.display = 'block';
}

/**
 * Update create pool button state
 */
function updateCreateButtonState() {
    const createBtn = document.getElementById('create-pool-btn');
    const ratioInput = document.getElementById('ratio-input');
    
    // Check if ratio input is valid (whole number)
    const isRatioValid = validateRatioInput(ratioInput.value);
    
    const canCreate = isConnected && 
                     selectedTokenA && 
                     selectedTokenB &&
                     currentRatio > 0 &&
                     isRatioValid;
    
    createBtn.disabled = !canCreate;
    
    // Update button text based on validation state
    if (!isRatioValid && selectedTokenA && selectedTokenB) {
        createBtn.textContent = '❌ Invalid Ratio - Use Whole Numbers';
    } else if (canCreate) {
        createBtn.textContent = '🏊‍♂️ Create Pool';
    } else {
        createBtn.textContent = '🏊‍♂️ Create Pool';
    }
}

/**
 * Show token selection help
 */
function showTokenHelp(position) {
    if (!isConnected) {
        showStatus('info', 'Please connect your wallet first to see your tokens');
        return;
    }
    
    if (userTokens.length === 0) {
        showStatus('info', 'No tokens found in your wallet. Create some tokens first!');
        return;
    }
    
    showStatus('info', `Click on a token card above to select it as Token ${position}`);
}

/**
 * Reset pool creation state
 */
function resetPoolCreation() {
    selectedTokenA = null;
    selectedTokenB = null;
    currentRatio = 1;
    
    document.getElementById('ratio-input').value = '1';
    
    // Reset valid flag checkboxes (only bits 5 and 6 are settable at creation)
    document.getElementById('flag-owner-only-swaps').checked = false;
    document.getElementById('flag-exact-exchange').checked = false;
    
    updatePoolCreationDisplay();
}

// System initialization removed - this should be handled by deployment authority only

// System initialization check removed - system should be initialized during deployment

/**
 * Create the pool
 */
async function createPool() {
    // Hide any existing errors
    hidePoolError();
    
    if (!isConnected || !selectedTokenA || !selectedTokenB) {
        showPoolError('Please connect wallet and select two tokens');
        return;
    }
    
    // Note: System should be initialized during deployment by program authority
    
    if (currentRatio <= 0) {
        showPoolError('Please enter a valid exchange ratio');
        return;
    }
    
    // Check for duplicate pools
    if (await checkDuplicatePool(selectedTokenA, selectedTokenB, currentRatio)) {
        showPoolError(`Pool already exists: ${selectedTokenA.symbol}/${selectedTokenB.symbol} with ratio 1:${currentRatio}. Each token pair with the same ratio can only have one pool.`);
        return;
    }
    
    const createBtn = document.getElementById('create-pool-btn');
    const originalText = createBtn.textContent;
    
    try {
        createBtn.disabled = true;
        createBtn.textContent = '🔄 Creating Pool...';
        
        showStatus('info', `Creating pool: ${selectedTokenA.symbol}/${selectedTokenB.symbol} with ratio 1:${currentRatio}...`);
        
        // Call the smart contract to create the pool
        const poolData = await createPoolTransaction(selectedTokenA, selectedTokenB, currentRatio);
        
        // Redirect to pool success page with pool details
        const params = new URLSearchParams({
            poolAddress: poolData.poolId,
            tokenASymbol: selectedTokenA.symbol,
            tokenBSymbol: selectedTokenB.symbol,
            tokenAName: selectedTokenA.name,
            tokenBName: selectedTokenB.name,
            tokenAMint: selectedTokenA.mint,
            tokenBMint: selectedTokenB.mint,
            ratio: currentRatio,
            creator: wallet.publicKey.toString(),
            createdAt: new Date().toISOString()
        });
        
        window.location.href = `pool-success.html?${params.toString()}`;
        
    } catch (error) {
        console.error('❌ Error creating pool:', error);

        // Prefer CU-specific, developer-friendly messaging
        const userMsg = buildUserFacingErrorMessage(error, poolCreateComputeUnits);
        showPoolError(userMsg);
    } finally {
        createBtn.disabled = false;
        createBtn.textContent = originalText;
        updateCreateButtonState();
    }
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
 * Create pool transaction
 */
async function createPoolTransaction(tokenA, tokenB, ratio) {
    const maxRetries = 3;
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`🏊‍♂️ Creating real pool transaction (attempt ${attempt}/${maxRetries})...`);
            
            // Check if program is deployed
            const programId = new solanaWeb3.PublicKey(CONFIG.programId);
        const programAccount = await connection.getAccountInfo(programId);
        
        if (!programAccount) {
            throw new Error('Program not deployed: Fixed Ratio Trading program not found on this network. Please deploy the program first.');
        }
        
        // Use original token order - let smart contract do normalization internally
        const primaryTokenMint = new solanaWeb3.PublicKey(tokenA.mint); // User-selected Token A
        const baseTokenMint = new solanaWeb3.PublicKey(tokenB.mint);     // User-selected Token B
        const ratioPrimaryPerBase = ratio; // User-defined ratio
        
        console.log('Pool configuration (original order):', {
            primaryToken: primaryTokenMint.toString(),
            baseToken: baseTokenMint.toString(),
            ratio: ratioPrimaryPerBase
        });
        
        console.log('🔍 TOKEN SYMBOL MAPPING:', {
            'tokenA.symbol': tokenA.symbol,
            'tokenA.mint': tokenA.mint,
            'tokenB.symbol': tokenB.symbol, 
            'tokenB.mint': tokenB.mint
        });
        
        // Determine normalized token order for PDA derivation (same logic as smart contract)
        // CRITICAL FIX: Use byte-level comparison like Rust Pubkey comparison, not string comparison
        console.log('🔍 TOKEN ORDERING DEBUG:');
        console.log(`   primaryTokenMint: ${primaryTokenMint.toString()}`);
        console.log(`   baseTokenMint: ${baseTokenMint.toString()}`);
        
        // Convert to byte arrays for proper comparison (same as Rust Pubkey::cmp)
        const primaryTokenBytes = primaryTokenMint.toBytes();
        const baseTokenBytes = baseTokenMint.toBytes();
        
        // Byte-level lexicographic comparison (same as Rust Pubkey < Pubkey)
        let primaryIsLessThanBase = false;
        for (let i = 0; i < 32; i++) {
            if (primaryTokenBytes[i] < baseTokenBytes[i]) {
                primaryIsLessThanBase = true;
                break;
            } else if (primaryTokenBytes[i] > baseTokenBytes[i]) {
                primaryIsLessThanBase = false;
                break;
            }
        }
        
        console.log(`   primaryTokenMint < baseTokenMint (byte comparison): ${primaryIsLessThanBase}`);
        console.log(`   primaryTokenMint < baseTokenMint (string comparison): ${primaryTokenMint.toString() < baseTokenMint.toString()}`);
        
        const tokenAMint = primaryIsLessThanBase ? primaryTokenMint : baseTokenMint;
        const tokenBMint = primaryIsLessThanBase ? baseTokenMint : primaryTokenMint;
            
        console.log(`   Normalized tokenAMint: ${tokenAMint.toString()}`);
        console.log(`   Normalized tokenBMint: ${tokenBMint.toString()}`);
        console.log(`   Tokens were swapped: ${tokenAMint.toString() !== primaryTokenMint.toString()}`);
        
        // 🔧 FIX: Adjust ratio to preserve user intent when tokens are swapped
        const tokensWereSwapped = tokenAMint.toString() !== primaryTokenMint.toString();
        
        // ✅ BASIS POINTS REFACTOR: Fetch token decimals and convert to basis points
        console.log('🔧 BASIS POINTS REFACTOR: Fetching token decimals...');
        
        // Fetch decimals for normalized tokens (A and B after lexicographic ordering)
        const normalizedTokenADecimals = await getTokenDecimals(tokenAMint.toString(), connection);
        const normalizedTokenBDecimals = await getTokenDecimals(tokenBMint.toString(), connection);
        
        // Get original token decimals (as selected by user)
        const primaryTokenDecimals = await getTokenDecimals(primaryTokenMint.toString(), connection);
        const baseTokenDecimals = await getTokenDecimals(baseTokenMint.toString(), connection);
        
        console.log(`📊 Original token decimals: ${tokenA.symbol}=${primaryTokenDecimals}, ${tokenB.symbol}=${baseTokenDecimals}`);
        console.log(`📊 Normalized token decimals: TokenA=${normalizedTokenADecimals}, TokenB=${normalizedTokenBDecimals}`);
        
        // 🔧 BASIS POINTS CONVERSION: Convert user ratio to basis points
        // User specified: "1 primary = X base" 
        // We need to convert this to basis points for both sides
        
        let finalRatioABasisPoints, finalRatioBBasisPoints;
        
        if (tokensWereSwapped) {
            // Tokens were swapped: user wanted "1 primary = X base" but now primary is TokenB
            // So we need: "1 TokenB = X TokenA" which means "X TokenA = 1 TokenB"
            // 
            // CRITICAL FIX: Use correct decimals for each normalized token
            // - tokenADisplay represents user's base token (now normalized as TokenA)
            // - tokenBDisplay represents user's primary token (now normalized as TokenB)
            const tokenADisplay = ratioPrimaryPerBase;  // X units of user's base token (now TokenA)
            const tokenBDisplay = 1.0;                  // 1 unit of user's primary token (now TokenB)
            
            // 🔧 FIX: Use the NORMALIZED token decimals for conversion
            // After swapping: TokenA = base token, TokenB = primary token
            finalRatioABasisPoints = displayToBasisPoints(tokenADisplay, normalizedTokenADecimals);   // TokenA decimals (base)
            finalRatioBBasisPoints = displayToBasisPoints(tokenBDisplay, normalizedTokenBDecimals);   // TokenB decimals (primary)
            
            console.log('🔄 Tokens were swapped during normalization - converting to basis points');
            console.log(`   User intent: 1 ${tokenA.symbol} = ${ratioPrimaryPerBase} ${tokenB.symbol}`);
            console.log(`   After swap: ${tokenADisplay} ${tokenB.symbol} = ${tokenBDisplay} ${tokenA.symbol}`);
            console.log(`   Using decimals: TokenA=${normalizedTokenADecimals}, TokenB=${normalizedTokenBDecimals}`);
            console.log(`   Basis points: ${finalRatioABasisPoints} : ${finalRatioBBasisPoints}`);
        } else {
            // Tokens kept original order: user wanted "1 primary = X base"
            // primary is TokenA, base is TokenB: "1 TokenA = X TokenB"
            const tokenADisplay = 1.0;                  // 1 unit of primary token (TokenA)
            const tokenBDisplay = ratioPrimaryPerBase;   // X units of base token (TokenB)
            
            // ✅ FIX: Use the NORMALIZED token decimals for conversion
            // No swapping: TokenA = primary token, TokenB = base token
            finalRatioABasisPoints = displayToBasisPoints(tokenADisplay, normalizedTokenADecimals);   // TokenA decimals (primary)
            finalRatioBBasisPoints = displayToBasisPoints(tokenBDisplay, normalizedTokenBDecimals);   // TokenB decimals (base)
            
            console.log('✅ Tokens kept original order - converting to basis points');
            console.log(`   Final: ${tokenADisplay} ${tokenA.symbol} = ${tokenBDisplay} ${tokenB.symbol}`);
            console.log(`   Using decimals: TokenA=${normalizedTokenADecimals}, TokenB=${normalizedTokenBDecimals}`);
            console.log(`   Basis points: ${finalRatioABasisPoints} : ${finalRatioBBasisPoints}`);
        }
        
        // 🎯 ONE-TO-MANY VALIDATION: Check if this ratio qualifies for the flag
        const originalRatioA = tokensWereSwapped ? ratioPrimaryPerBase : 1.0;
        const originalRatioB = tokensWereSwapped ? 1.0 : ratioPrimaryPerBase;
        const originalDecimalsA = tokensWereSwapped ? baseTokenDecimals : primaryTokenDecimals;  
        const originalDecimalsB = tokensWereSwapped ? primaryTokenDecimals : baseTokenDecimals;
        
        const willSetOneToManyFlag = validateOneToManyRatio(
            originalRatioA, originalRatioB, 
            originalDecimalsA, originalDecimalsB
        );
        
        if (willSetOneToManyFlag) {
            console.log('🎯 ONE-TO-MANY FLAG: This pool will have the ONE_TO_MANY_RATIO flag set');
            showStatus('info', '🎯 This pool will have the ONE-TO-MANY ratio flag set (enforces 1:many patterns)');
        } else {
            console.log('ℹ️ Standard pool: No special flags will be set');
        }
        
        console.log('Normalized token order (for PDA derivation):', {
            tokenA: tokenAMint.toString(),
            tokenB: tokenBMint.toString(),
            tokensWereSwapped,
            ratioABasisPoints: finalRatioABasisPoints,
            ratioBBasisPoints: finalRatioBBasisPoints
        });
        
        console.log('🔍 FINAL RATIO VERIFICATION (BASIS POINTS):');
        console.log(`   ratio_a_numerator: ${finalRatioABasisPoints} basis points`);
        console.log(`   ratio_b_denominator: ${finalRatioBBasisPoints} basis points`);
        console.log(`   Expected result: 1 ${tokenA.symbol} = ${ratioPrimaryPerBase} ${tokenB.symbol}`);
        console.log(`   Basis points represent: ${finalRatioABasisPoints / Math.pow(10, tokensWereSwapped ? baseTokenDecimals : primaryTokenDecimals)} : ${finalRatioBBasisPoints / Math.pow(10, tokensWereSwapped ? primaryTokenDecimals : baseTokenDecimals)}`);
        
        // ✅ BASIS POINTS REFACTOR: Create pool state PDA using basis points ratios
        console.log('🔍 PDA DERIVATION DEBUG:');
        console.log(`   POOL_STATE_SEED_PREFIX: "pool_state"`);
        console.log(`   tokenAMint: ${tokenAMint.toString()}`);
        console.log(`   tokenBMint: ${tokenBMint.toString()}`);
        console.log(`   finalRatioABasisPoints: ${finalRatioABasisPoints} (0x${finalRatioABasisPoints.toString(16)})`);
        console.log(`   finalRatioBBasisPoints: ${finalRatioBBasisPoints} (0x${finalRatioBBasisPoints.toString(16)})`);
        
        // Show the exact byte arrays being used as seeds
        const seedPrefix = new TextEncoder().encode('pool_state');
        const tokenABuffer = tokenAMint.toBuffer();
        const tokenBBuffer = tokenBMint.toBuffer();
        const ratioABytes = new Uint8Array(new BigUint64Array([BigInt(finalRatioABasisPoints)]).buffer);
        const ratioBBytes = new Uint8Array(new BigUint64Array([BigInt(finalRatioBBasisPoints)]).buffer);
        
        console.log('🔍 PDA SEED BYTES:');
        console.log(`   seedPrefix: [${Array.from(seedPrefix).join(', ')}]`);
        console.log(`   tokenABuffer: [${Array.from(tokenABuffer).slice(0, 8).join(', ')}...] (${tokenABuffer.length} bytes)`);
        console.log(`   tokenBBuffer: [${Array.from(tokenBBuffer).slice(0, 8).join(', ')}...] (${tokenBBuffer.length} bytes)`);
        console.log(`   ratioABytes: [${Array.from(ratioABytes).join(', ')}] (little-endian u64)`);
        console.log(`   ratioBBytes: [${Array.from(ratioBBytes).join(', ')}] (little-endian u64)`);
        
        const poolStatePDA = await solanaWeb3.PublicKey.findProgramAddress(
            [
                seedPrefix,
                tokenABuffer,
                tokenBBuffer,
                ratioABytes,
                ratioBBytes
            ],
            programId
        );
        
        console.log('🔍 CLIENT COMPUTED PDA:', poolStatePDA[0].toString());
        
        // ✅ SMART CONTRACT SIMULATION: Predict what the contract will compute
        console.log('🤖 SMART CONTRACT PDA SIMULATION:');
        console.log('   The contract will receive:');
        console.log(`     token_a_mint: ${tokenAMint.toString()}`);
        console.log(`     token_b_mint: ${tokenBMint.toString()}`);
        console.log(`     ratio_a_numerator: ${finalRatioABasisPoints} (from instruction data)`);
        console.log(`     ratio_b_denominator: ${finalRatioBBasisPoints} (from instruction data)`);
        console.log('   The contract will derive PDA using:');
        console.log(`     POOL_STATE_SEED_PREFIX: "pool_state"`);
        console.log(`     token_a_mint_key.as_ref(): ${tokenAMint.toString()}`);
        console.log(`     token_b_mint_key.as_ref(): ${tokenBMint.toString()}`);
        console.log(`     ratio_a_numerator.to_le_bytes(): [${Array.from(ratioABytes).join(', ')}]`);
        console.log(`     ratio_b_denominator.to_le_bytes(): [${Array.from(ratioBBytes).join(', ')}]`);
        console.log('   Expected contract result should match client PDA above.');
        
        // ✅ SECURITY FIX: Derive LP token mint PDAs (controlled by smart contract)
        // This prevents users from creating fake LP tokens to drain pools
        const lpTokenAMintPDA = await solanaWeb3.PublicKey.findProgramAddress(
            [
                new TextEncoder().encode('lp_token_a_mint'),
                poolStatePDA[0].toBuffer()
            ],
            programId
        );
        
        const lpTokenBMintPDA = await solanaWeb3.PublicKey.findProgramAddress(
            [
                new TextEncoder().encode('lp_token_b_mint'),
                poolStatePDA[0].toBuffer()
            ],
            programId
        );
        
        console.log('🔒 SECURE LP token mints (PDAs controlled by smart contract):', {
            lpTokenA: lpTokenAMintPDA[0].toString(),
            lpTokenB: lpTokenBMintPDA[0].toString()
        });
        
        // Create token vault PDAs
        const tokenAVaultPDA = await solanaWeb3.PublicKey.findProgramAddress(
            [
                new TextEncoder().encode('token_a_vault'),
                poolStatePDA[0].toBuffer()
            ],
            programId
        );
        
        const tokenBVaultPDA = await solanaWeb3.PublicKey.findProgramAddress(
            [
                new TextEncoder().encode('token_b_vault'),
                poolStatePDA[0].toBuffer()
            ],
            programId
        );
        
        console.log('Token vault PDAs:', {
            tokenAVault: tokenAVaultPDA[0].toString(),
            tokenBVault: tokenBVaultPDA[0].toString()
        });
        
        // Get main treasury PDA
        const mainTreasuryPDA = await solanaWeb3.PublicKey.findProgramAddress(
            [new TextEncoder().encode('main_treasury')],
            programId
        );
        
        console.log('Main treasury PDA:', mainTreasuryPDA[0].toString());
        
        // Verify main treasury account exists (critical for pool creation)
        console.log('🔍 Verifying main treasury account exists...');
        try {
            const mainTreasuryInfo = await connection.getAccountInfo(mainTreasuryPDA[0]);
            if (!mainTreasuryInfo) {
                throw new Error('Main treasury account not found. The program must be initialized first using InitializeProgram (discriminator 0) before pools can be created.');
            }
            console.log('✅ Main treasury account verified');
        } catch (error) {
            console.log('❌ Main treasury verification failed:', error.message);
            throw error;
        }
        
        // ✅ InitializePool instruction data: discriminator + ratios + flags (u8)
        // Discriminator: InitializePool=1 (single byte)
        const discriminator = new Uint8Array([1]);
        const ratioAInstructionBytes = new Uint8Array(new BigUint64Array([BigInt(finalRatioABasisPoints)]).buffer);
        const ratioBInstructionBytes = new Uint8Array(new BigUint64Array([BigInt(finalRatioBBasisPoints)]).buffer);
        const flags = calculateFlagsByte();
        const flagsByte = new Uint8Array([flags]);
        
        // Exact 18-byte format: [1-byte discriminator] + [8-byte ratio A] + [8-byte ratio B] + [1-byte flags]
        const instructionData = concatUint8Arrays([
            discriminator,
            ratioAInstructionBytes,
            ratioBInstructionBytes,
            flagsByte
        ]);
        
        console.log('🔍 BASIS POINTS INSTRUCTION DATA for InitializePool:');
        console.log('  Discriminator: [1] (single byte)');
        console.log('  ratio_a_numerator:', finalRatioABasisPoints, 'basis points');
        console.log('  ratio_b_denominator:', finalRatioBBasisPoints, 'basis points');
        console.log('  flags (u8):', flags, `(0b${flags.toString(2).padStart(8, '0')})`);
        console.log('  Total data length:', instructionData.length, 'bytes (expected 18)');
        console.log('  Data:', Array.from(instructionData));
        
        console.log('🔍 INSTRUCTION DATA BYTES BREAKDOWN:');
        console.log(`   discriminator: [${Array.from(discriminator).join(', ')}]`);
        console.log(`   ratioAInstructionBytes: [${Array.from(ratioAInstructionBytes).join(', ')}] (should match PDA ratioABytes)`);
        console.log(`   ratioBInstructionBytes: [${Array.from(ratioBInstructionBytes).join(', ')}] (should match PDA ratioBBytes)`);
        console.log(`   flagsByte: [${Array.from(flagsByte).join(', ')}]`);
        
        // Verify that instruction bytes match PDA bytes
        const pdaRatioAMatch = Array.from(ratioAInstructionBytes).join(',') === Array.from(ratioABytes).join(',');
        const pdaRatioBMatch = Array.from(ratioBInstructionBytes).join(',') === Array.from(ratioBBytes).join(',');
        console.log(`🔍 PDA/INSTRUCTION BYTES MATCH CHECK:`);
        console.log(`   ratio_a_numerator match: ${pdaRatioAMatch ? '✅' : '❌'}`);
        console.log(`   ratio_b_denominator match: ${pdaRatioBMatch ? '✅' : '❌'}`);
        
        // Check if accounts already exist
        const existingPoolAccount = await connection.getAccountInfo(poolStatePDA[0]);
        const existingTokenAVault = await connection.getAccountInfo(tokenAVaultPDA[0]);
        const existingTokenBVault = await connection.getAccountInfo(tokenBVaultPDA[0]);
        
        if (existingPoolAccount) {
            console.log('WARNING: Pool state account already exists:', poolStatePDA[0].toString());
        }
        if (existingTokenAVault) {
            console.log('WARNING: Token A vault already exists:', tokenAVaultPDA[0].toString());
        }
        if (existingTokenBVault) {
            console.log('WARNING: Token B vault already exists:', tokenBVaultPDA[0].toString());
        }
        
        // Get System State PDA (required for pause validation)
        const systemStatePDA = await solanaWeb3.PublicKey.findProgramAddress(
            [new TextEncoder().encode('system_state')],
            programId
        );
        
        console.log('System State PDA:', systemStatePDA[0].toString());
        
        // Verify system state account exists (critical for pool creation)
        console.log('🔍 Verifying system state account exists...');
        try {
            const systemStateInfo = await connection.getAccountInfo(systemStatePDA[0]);
            if (!systemStateInfo) {
                throw new Error('System state account not found. The program must be initialized first using InitializeProgram (discriminator 0) before pools can be created.');
            }
            console.log('✅ System state account verified');
        } catch (error) {
            console.log('❌ System state verification failed:', error.message);
            throw error;
        }
        
        // ✅ CORRECTED: Account structure matches API documentation exactly
        // 13 accounts total, matching the exact order from A_FIXED_RATIO_TRADING_API.md
        const accountKeys = [
            { pubkey: wallet.publicKey, isSigner: true, isWritable: true },            // 0: User Authority Signer (writable for fee transfer)
            { pubkey: solanaWeb3.SystemProgram.programId, isSigner: false, isWritable: false }, // 1: System Program
            { pubkey: systemStatePDA[0], isSigner: false, isWritable: false },        // 2: System State PDA
            { pubkey: poolStatePDA[0], isSigner: false, isWritable: true },           // 3: Pool State PDA (writable)
            { pubkey: new solanaWeb3.PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'), isSigner: false, isWritable: false },   // 4: SPL Token Program
            { pubkey: mainTreasuryPDA[0], isSigner: false, isWritable: true },        // 5: Main Treasury PDA (writable)
            { pubkey: solanaWeb3.SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },      // 6: Rent Sysvar
            { pubkey: tokenAMint, isSigner: false, isWritable: false },         // 7: Token A Mint Account (readable)
            { pubkey: tokenBMint, isSigner: false, isWritable: false },            // 8: Token B Mint Account (readable)
            { pubkey: tokenAVaultPDA[0], isSigner: false, isWritable: true },         // 9: Token A Vault PDA (writable)
            { pubkey: tokenBVaultPDA[0], isSigner: false, isWritable: true },         // 10: Token B Vault PDA (writable)
            { pubkey: lpTokenAMintPDA[0], isSigner: false, isWritable: true },        // 11: LP Token A Mint PDA (writable)
            { pubkey: lpTokenBMintPDA[0], isSigner: false, isWritable: true }         // 12: LP Token B Mint PDA (writable)
        ];
        
        // Validate all account keys have proper structure
        accountKeys.forEach((account, index) => {
            if (!account.pubkey) {
                throw new Error(`Account ${index} missing pubkey`);
            }
            if (typeof account.isSigner !== 'boolean') {
                throw new Error(`Account ${index} missing isSigner`);
            }
            if (typeof account.isWritable !== 'boolean') {
                throw new Error(`Account ${index} missing isWritable`);
            }
        });
        
        // Debug: Log all account keys for verification
        console.log('🔍 Account keys for InitializePool instruction:');
        accountKeys.forEach((account, index) => {
            console.log(`  ${index}: ${account.pubkey.toString()} (signer: ${account.isSigner}, writable: ${account.isWritable})`);
        });
        
        // Verify that token mint accounts exist and have correct data structure
        console.log('🔍 Verifying token mint accounts exist...');
        try {
            const tokenAInfo = await connection.getAccountInfo(primaryTokenMint);
            const tokenBInfo = await connection.getAccountInfo(baseTokenMint);
            
            if (!tokenAInfo) {
                throw new Error(`Token A mint account not found: ${primaryTokenMint.toString()}`);
            }
            if (!tokenBInfo) {
                throw new Error(`Token B mint account not found: ${baseTokenMint.toString()}`);
            }
            
            console.log('✅ Token mint accounts verified');
            console.log('🔍 Token A mint data length:', tokenAInfo.data.length, 'bytes');
            console.log('🔍 Token B mint data length:', tokenBInfo.data.length, 'bytes');
        } catch (error) {
            console.log('❌ Token mint verification failed:', error.message);
            throw error;
        }
        
        // Verify all account data structures before creating instruction
        console.log('🔍 Verifying all account data structures...');
        try {
            for (let i = 0; i < accountKeys.length; i++) {
                const account = accountKeys[i];
                const accountInfo = await connection.getAccountInfo(account.pubkey);
                
                if (accountInfo) {
                    console.log(`  Account ${i} (${account.pubkey.toString()}): ${accountInfo.data.length} bytes, owner: ${accountInfo.owner.toString()}`);
                } else {
                    console.log(`  Account ${i} (${account.pubkey.toString()}): Not found (will be created)`);
                }
            }
            console.log('✅ Account data verification complete');
        } catch (error) {
            console.log('❌ Account data verification failed:', error.message);
            throw error;
        }
        
        const createPoolInstruction = new solanaWeb3.TransactionInstruction({
            keys: accountKeys,
            programId: programId,
            data: instructionData
        });
        
        // Create compute budget instruction for pool creation
        console.log(`🎯 Setting compute budget: ${poolCreateComputeUnits.toLocaleString()} CUs`);
        
        // Verify ComputeBudgetProgram is available
        if (!solanaWeb3.ComputeBudgetProgram) {
            console.error('❌ ComputeBudgetProgram not available in solanaWeb3!');
            throw new Error('ComputeBudgetProgram not available');
        }
        
        const computeBudgetInstruction = solanaWeb3.ComputeBudgetProgram.setComputeUnitLimit({
            units: poolCreateComputeUnits
        });
        
        // Debug the compute budget instruction
        console.log('🔍 Compute Budget Instruction:', {
            programId: computeBudgetInstruction.programId.toString(),
            data: Array.from(computeBudgetInstruction.data),
            dataHex: computeBudgetInstruction.data.toString('hex'),
            keys: computeBudgetInstruction.keys.length
        });
        
        // Create transaction with compute budget and pool creation instruction
        const transaction = new solanaWeb3.Transaction()
            .add(computeBudgetInstruction)
            .add(createPoolInstruction);
        
        console.log(`✅ Added compute budget instruction: ${poolCreateComputeUnits.toLocaleString()} CUs`);
        console.log('📋 Transaction has', transaction.instructions.length, 'instructions');
        
        // ✅ SECURITY FIX: No longer need to sign with LP token mint keypairs
        // LP token mints are now PDAs controlled by the smart contract
        console.log('🔒 SECURITY: LP token mints are now PDAs controlled by the smart contract');
        console.log('   This prevents users from creating fake LP tokens to drain pools');

        // Get fresh blockhash right before simulating/sending
        console.log('🔄 Getting fresh blockhash...');
        const startTime = Date.now();
        const { blockhash: freshBlockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
        const blockhashTime = Date.now();
        console.log(`📅 Fresh blockhash: ${freshBlockhash.slice(0, 8)}... (valid until block ${lastValidBlockHeight})`);
        console.log(`⏰ Blockhash fetch time: ${blockhashTime - startTime}ms`);

        transaction.recentBlockhash = freshBlockhash;
        transaction.feePayer = wallet.publicKey;

        // Pre-simulate to surface CU and logic errors before wallet signing
        let simulation;
        try {
            console.log('🧪 Simulating pool creation transaction...');
            console.log('🔍 Transaction details:', {
                numInstructions: transaction.instructions.length,
                computeUnits: poolCreateComputeUnits,
                feePayer: transaction.feePayer?.toString()
            });
            
            simulation = await connection.simulateTransaction(transaction);
            console.log('📊 Simulation result:', simulation);
            console.log('📊 Simulation logs exist?', !!simulation.value.logs);
            console.log('📊 Number of logs:', simulation.value.logs?.length || 0);
            
            if (simulation.value.err) {
                console.log('❌ Simulation failed:', simulation.value.err);
                console.log('📋 Simulation logs:', simulation.value.logs);
                
                // Log first few and last few logs to see CU errors
                if (simulation.value.logs && simulation.value.logs.length > 0) {
                    console.log('📋 First 5 logs:', simulation.value.logs.slice(0, 5));
                    console.log('📋 Last 5 logs:', simulation.value.logs.slice(-5));
                }
                
                // Pass logs from the right location
                const cuHint = getComputeUnitErrorMessage(simulation.value.err, simulation.value.logs, poolCreateComputeUnits);
                const baseMsg = `Simulation failed: ${JSON.stringify(simulation.value.err)}`;
                throw new Error(cuHint ? `${baseMsg}. ${cuHint}` : baseMsg);
            }
            
            console.log('✅ Simulation successful - proceeding with transaction');
            console.log('📊 Units consumed:', simulation.value.unitsConsumed);
        } catch (simError) {
            console.error('❌ Simulation error:', simError);
            // Handle the error like liquidity.js does
            const cuHint = getComputeUnitErrorMessage(simError?.message || JSON.stringify(simError), simulation?.value?.logs, poolCreateComputeUnits);
            if (cuHint) {
                throw new Error(`${simError.message || 'Simulation failed'}. ${cuHint}`);
            }
            throw simError;
        }
        
        console.log('📝 Requesting wallet signature...');

        // Request signature from wallet, then send
        const signedTx = await wallet.signTransaction(transaction);
        const signature = await connection.sendRawTransaction(signedTx.serialize());
        const sentTime = Date.now();
        console.log('✅ Pool creation transaction sent:', signature);
        console.log(`⚡ Total time from blockhash to send: ${sentTime - blockhashTime}ms`);
        
        // Wait for confirmation with retry logic for blockhash expiration
        console.log('⏳ Waiting for transaction confirmation...');
        let confirmation;
        try {
            confirmation = await connection.confirmTransaction({
                signature: signature,
                blockhash: freshBlockhash,
                lastValidBlockHeight: lastValidBlockHeight
            }, 'confirmed');
        } catch (confirmError) {
            console.log('⚠️ Confirmation with blockhash failed:', confirmError.message);
            console.log(`🕐 Time elapsed since blockhash: ${Date.now() - blockhashTime}ms`);
            console.log('🔄 Trying confirmation without blockhash...');
            
            try {
                confirmation = await connection.confirmTransaction(signature, 'confirmed');
            } catch (retryError) {
                console.log('❌ Confirmation retry also failed:', retryError.message);
                throw retryError;
            }
        }
        
        if (confirmation.value.err) {
            throw new Error(`Pool creation failed: ${JSON.stringify(confirmation.value.err)}`);
        }
        
        console.log('✅ Pool created successfully!');
        console.log('Pool details:', {
            poolId: poolStatePDA[0].toString(),
            tokenA: tokenAMint.toString(),
            tokenB: tokenBMint.toString(),
            ratio: ratioPrimaryPerBase,
            lpTokenAMint: lpTokenAMintPDA[0].toString(),
            lpTokenBMint: lpTokenBMintPDA[0].toString()
        });
        
        return {
            success: true,
            poolId: poolStatePDA[0].toString(),
            signature: signature,
            lpTokenAMint: lpTokenAMintPDA[0].toString(),
            lpTokenBMint: lpTokenBMintPDA[0].toString(),
            tokenAVault: tokenAVaultPDA[0].toString(),
            tokenBVault: tokenBVaultPDA[0].toString()
        };
        
        } catch (error) {
            console.error(`❌ Pool creation error (attempt ${attempt}/${maxRetries}):`, error);
            lastError = error;
            
            // Do NOT retry if the user rejected the wallet signature
            const errMsg = (error && error.message ? error.message : String(error)).toLowerCase();
            const errCode = (error && (error.code || error.errorCode)) || null;
            if (
                errCode === 4001 || // EIP-1193 style user rejection code used by some wallets
                errMsg.includes('user rejected') ||
                errMsg.includes('request rejected') ||
                errMsg.includes('denied') ||
                errMsg.includes('declined') ||
                errMsg.includes('cancelled') ||
                errMsg.includes('canceled') ||
                errMsg.includes('rejected the request') ||
                errMsg.includes('rejected request') ||
                errMsg.includes('signature rejected')
            ) {
                console.log('🛑 User rejected wallet action. Aborting without retry.');
                throw error;
            }
            
            // Check if it's a blockhash error and we should retry
            if (error.message && error.message.includes('Blockhash not found') && attempt < maxRetries) {
                console.log(`🔄 Blockhash expired, retrying in 2 seconds... (attempt ${attempt}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                continue;
            }
            
            // For other errors or final attempt, throw the error
            if (attempt === maxRetries) {
                throw lastError;
            }
        }
    }
    
    // This should never be reached, but just in case
    throw lastError || new Error('Pool creation failed after all retries');
}

/**
 * Detect likely compute unit exhaustion from simulation error/logs (pool creation)
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
        // ignore
    }
    return '';
}

/**
 * Build a user-facing error message with specific CU guidance when applicable (pool creation)
 * Uses centralized error mapping for known error codes
 */
function buildUserFacingErrorMessage(error, currentComputeUnits) {
    const raw = error?.message || String(error || '');
    const lower = raw.toLowerCase();

    // First, try to parse with centralized error mapping
    const errorInfo = parseTransactionError(error);
    
    // If we got a recognized error code, use it with pool creation-specific context
    if (errorInfo.code && errorInfo.code !== -1) {
        if (isPauseError(errorInfo.code)) {
            const suggestions = getErrorSuggestions(errorInfo.code);
            return `${formatErrorForUser(errorInfo)} Pool creation may be restricted. Suggestions: ${suggestions.join(', ')}.`;
        }
        
        if (isBalanceError(errorInfo.code)) {
            return `${formatErrorForUser(errorInfo)} Ensure you have sufficient SOL for the 1.15 SOL pool creation fee plus transaction costs.`;
        }
        
        // For pool configuration errors, provide specific guidance
        if (errorInfo.code >= 1000 && errorInfo.code <= 1009) {
            return `${formatErrorForUser(errorInfo)} Check your token selection and ratio configuration.`;
        }
        
        // Return the centralized error message for other recognized codes
        return formatErrorForUser(errorInfo);
    }

    // Fallback to original logic for non-coded errors

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

    // Balance/SOL errors
    if (
        lower.includes('insufficient funds') ||
        lower.includes('insufficient sol') ||
        lower.includes('insufficient lamports')
    ) {
        return 'Insufficient SOL for transaction fees';
    }

    // Program deploy issues
    if (lower.includes('program not deployed')) {
        return 'Fixed Ratio Trading program is not deployed on this network. Please deploy the program or switch networks.';
    }

    return `Transaction failed: ${raw}`;
}

/**
 * Generate a mock pool address based on token mints and ratio
 */
function generateMockPoolAddress(tokenAMint, tokenBMint, ratio) {
    // Simple hash-like generation for demo purposes
    const combined = tokenAMint + tokenBMint + ratio.toString();
    const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let result = '';
    for (let i = 0; i < 44; i++) {
        const index = (combined.charCodeAt(i % combined.length) + i) % chars.length;
        result += chars.charAt(index);
    }
    return result;
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
 * Show error with countdown and copy functionality
 */
function showPoolError(errorMessage) {
    // Clear any existing countdown
    if (errorCountdownTimer) {
        clearInterval(errorCountdownTimer);
    }
    
    const errorDisplay = document.getElementById('error-display');
    const errorMessageText = document.getElementById('error-message-text');
    const errorCountdown = document.getElementById('error-countdown');
    
    // Set error message
    errorMessageText.textContent = errorMessage;
    
    // Show error display
    errorDisplay.style.display = 'block';
    
    // Start countdown
    let countdown = 30;
    errorCountdown.textContent = countdown;
    
    errorCountdownTimer = setInterval(() => {
        countdown--;
        errorCountdown.textContent = countdown;
        
        if (countdown <= 0) {
            clearInterval(errorCountdownTimer);
            errorDisplay.style.display = 'none';
            errorCountdownTimer = null;
        }
    }, 1000);
    
    console.error('🚨 Pool creation error:', errorMessage);
}

/**
 * Hide error display
 */
function hidePoolError() {
    if (errorCountdownTimer) {
        clearInterval(errorCountdownTimer);
        errorCountdownTimer = null;
    }
    
    const errorDisplay = document.getElementById('error-display');
    errorDisplay.style.display = 'none';
}

/**
 * Copy error message to clipboard
 */
function copyErrorMessage() {
    const errorMessageText = document.getElementById('error-message-text');
    const message = errorMessageText.textContent;
    
    navigator.clipboard.writeText(message).then(() => {
        const copyBtn = document.getElementById('copy-error-btn');
        const originalText = copyBtn.textContent;
        copyBtn.textContent = '✅ Copied';
        
        setTimeout(() => {
            copyBtn.textContent = originalText;
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy error message:', err);
    });
}

// Make functions available globally for HTML onclick
window.copyErrorMessage = copyErrorMessage;
window.updatePoolFlags = updatePoolFlags;

/**
 * Check if pool already exists (check RPC data by calculating expected pool address)
 */
async function checkDuplicatePool(tokenA, tokenB, ratio) {
    try {
        // Calculate what the pool address would be for this token pair and ratio
        const programId = new solanaWeb3.PublicKey(CONFIG.programId);
        
        // Determine normalized token order (same logic as smart contract)
        const tokenAMint = tokenA.mint < tokenB.mint ? 
            new solanaWeb3.PublicKey(tokenA.mint) : new solanaWeb3.PublicKey(tokenB.mint);
        const tokenBMint = tokenA.mint < tokenB.mint ? 
            new solanaWeb3.PublicKey(tokenB.mint) : new solanaWeb3.PublicKey(tokenA.mint);
        
        const ratioANumerator = Math.floor(ratio);
        const ratioBDenominator = 1;
        
        // Convert strings to bytes using TextEncoder
        const encoder = new TextEncoder();
        
        // Convert ratio numbers to little-endian bytes
        const ratioABytes = new Uint8Array(8);
        const ratioBBytes = new Uint8Array(8);
        new DataView(ratioABytes.buffer).setBigUint64(0, BigInt(ratioANumerator), true);
        new DataView(ratioBBytes.buffer).setBigUint64(0, BigInt(ratioBDenominator), true);
        
        const [poolStatePDA] = await solanaWeb3.PublicKey.findProgramAddress(
            [
                encoder.encode('pool_state'),
                tokenAMint.toBytes(), 
                tokenBMint.toBytes(),
                ratioABytes,
                ratioBBytes
            ],
            programId
        );
        
        // Check if this pool address already exists on-chain
        const poolAccount = await connection.getAccountInfo(poolStatePDA);
        
        if (poolAccount) {
            console.log('🚫 Pool already exists on-chain:', poolStatePDA.toString());
            return true;
        }
        
        console.log('✅ Pool does not exist, safe to create:', poolStatePDA.toString());
        return false;
        
    } catch (error) {
        console.warn('⚠️ Could not check for duplicate pools:', error);
        // Fallback to sessionStorage check if RPC fails
        const existingPools = JSON.parse(sessionStorage.getItem('createdPools') || '[]');
        
        return existingPools.some(pool => {
            const sameAB = pool.tokenAMint === tokenA.mint && 
                          pool.tokenBMint === tokenB.mint && 
                          pool.ratio === ratio;
            
            const sameBA = pool.tokenAMint === tokenB.mint && 
                          pool.tokenBMint === tokenA.mint && 
                          pool.ratio === (1 / ratio);
            
            return sameAB || sameBA;
        });
    }
} 