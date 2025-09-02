/**
 * Admin Utilities for Fixed Ratio Trading Dashboard
 * Provides functions for all administrative operations
 */

// Global admin state
let adminConnection = null;
let adminWallet = null;

/**
 * Initialize admin utilities
 */
async function initializeAdminUtils() {
    try {
        // Wait for configuration
        let configAttempts = 0;
        while (!window.TRADING_CONFIG && configAttempts < 30) {
            await new Promise(resolve => setTimeout(resolve, 100));
            configAttempts++;
        }
        
        if (!window.TRADING_CONFIG) {
            throw new Error('Configuration failed to load');
        }
        
        window.CONFIG = window.TRADING_CONFIG;
        
        // Initialize connection
        adminConnection = new solanaWeb3.Connection(window.CONFIG.rpcUrl, {
            commitment: 'confirmed',
            disableRetryOnRateLimit: true
        });
        
        // Check for existing wallet connection
        const isConnected = sessionStorage.getItem('adminWalletConnected') === 'true';
        const walletAddress = sessionStorage.getItem('adminWalletAddress');
        const walletProvider = sessionStorage.getItem('adminWalletProvider');
        
        if (isConnected && walletAddress) {
            try {
                adminWallet = new solanaWeb3.PublicKey(walletAddress);
                console.log(`✅ Admin wallet restored from session (${walletProvider || 'Unknown'}):`, adminWallet.toString());
            } catch (error) {
                console.warn('⚠️ Invalid wallet address in session storage');
                sessionStorage.removeItem('adminWalletConnected');
                sessionStorage.removeItem('adminWalletAddress');
                sessionStorage.removeItem('adminWalletProvider');
            }
        }
        
        console.log('✅ Admin utilities initialized');
    } catch (error) {
        console.error('❌ Failed to initialize admin utilities:', error);
        throw error;
    }
}

/**
 * Get available wallet provider
 */
function getWalletProvider() {
    // Check for Phantom
    if (window.solana && window.solana.isPhantom) {
        return window.solana;
    }
    
    // Check for Backpack
    if (window.backpack) {
        return window.backpack;
    }
    
    // Check for Solflare
    if (window.solflare) {
        return window.solflare;
    }
    
    // Check for Sollet
    if (window.sollet) {
        return window.sollet;
    }
    
    // Check for Slope
    if (window.Slope) {
        return window.Slope;
    }
    
    // Check for generic solana provider
    if (window.solana) {
        return window.solana;
    }
    
    return null;
}

/**
 * Validate Solana address format
 */
function validateSolanaAddress(address) {
    try {
        if (!address || typeof address !== 'string') {
            return false;
        }
        
        // Basic format validation
        if (address.length < 32 || address.length > 44) {
            return false;
        }
        
        // Try to create PublicKey to validate
        new solanaWeb3.PublicKey(address);
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Get system state PDA
 */
function getSystemStatePDA() {
    const [systemStatePDA] = solanaWeb3.PublicKey.findProgramAddressSync(
        [new TextEncoder().encode("system_state")],
        new solanaWeb3.PublicKey(window.CONFIG.programId)
    );
    return systemStatePDA;
}

/**
 * Get main treasury PDA
 */
function getMainTreasuryPDA() {
    const [mainTreasuryPDA] = solanaWeb3.PublicKey.findProgramAddressSync(
        [new TextEncoder().encode("main_treasury")],
        new solanaWeb3.PublicKey(window.CONFIG.programId)
    );
    return mainTreasuryPDA;
}

/**
 * Get pool state PDA
 */
function getPoolStatePDA(tokenAMint, tokenBMint, ratioA, ratioB) {
    // Normalize token mints (lexicographic order)
    const mints = [new solanaWeb3.PublicKey(tokenAMint), new solanaWeb3.PublicKey(tokenBMint)];
    mints.sort((a, b) => a.toBuffer().compare(b.toBuffer()));
    
    // Convert numbers to little-endian byte arrays
    const ratioABytes = new Uint8Array(8);
    const ratioBBytes = new Uint8Array(8);
    const ratioAView = new DataView(ratioABytes.buffer);
    const ratioBView = new DataView(ratioBBytes.buffer);
    ratioAView.setBigUint64(0, BigInt(ratioA), true); // little-endian
    ratioBView.setBigUint64(0, BigInt(ratioB), true); // little-endian
    
    const [poolStatePDA] = solanaWeb3.PublicKey.findProgramAddressSync(
        [
            new TextEncoder().encode("pool_state_v2"),
            mints[0].toBuffer(),
            mints[1].toBuffer(),
            ratioABytes,
            ratioBBytes
        ],
        new solanaWeb3.PublicKey(window.CONFIG.programId)
    );
    return poolStatePDA;
}

/**
 * Create and send transaction
 */
async function createAndSendTransaction(instructions, signers = []) {
    if (!adminWallet) {
        throw new Error('Wallet not connected');
    }
    
    try {
        // Get recent blockhash
        const { blockhash } = await adminConnection.getLatestBlockhash();
        
        // Create transaction
        const transaction = new solanaWeb3.Transaction();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = adminWallet;
        
        // Add instructions
        instructions.forEach(ix => transaction.add(ix));
        
        // Get wallet provider and sign transaction
        const walletProvider = getWalletProvider();
        if (!walletProvider) {
            throw new Error('No wallet provider available');
        }
        
        const signedTransaction = await walletProvider.signTransaction(transaction);
        
        // Send transaction
        const signature = await adminConnection.sendRawTransaction(signedTransaction.serialize());
        
        // Confirm transaction
        const confirmation = await adminConnection.confirmTransaction({
            signature,
            ...(await adminConnection.getLatestBlockhash())
        }, 'confirmed');
        
        if (confirmation.value.err) {
            throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
        }
        
        return signature;
    } catch (error) {
        console.error('❌ Transaction failed:', error);
        throw error;
    }
}

/**
 * SYSTEM ADMINISTRATION FUNCTIONS
 */

/**
 * Get program data account for admin authority validation
 */
async function getProgramDataAccount() {
    try {
        const programId = new solanaWeb3.PublicKey(window.CONFIG.programId);
        
        // For upgradeable programs, the program data account is derived as:
        // ProgramData = findProgramAddress([program_id], BPFLoaderUpgradeable)
        const BPF_LOADER_UPGRADEABLE = new solanaWeb3.PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
        
        // Use findProgramAddressSync for immediate result
        const [programDataAddress] = solanaWeb3.PublicKey.findProgramAddressSync(
            [programId.toBytes()],
            BPF_LOADER_UPGRADEABLE
        );
        
        console.log('🔍 Derived program data account:', programDataAddress.toString());
        return programDataAddress;
    } catch (error) {
        console.warn('⚠️ Could not derive program data account:', error);
        // Fallback to a hardcoded program data account if derivation fails
        // This might work for some programs
        return new solanaWeb3.PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
    }
}

/**
 * Check if system is initialized
 */
async function checkSystemInitialized() {
    try {
        const systemStatePDA = getSystemStatePDA();
        console.log('🔍 Checking system state account:', systemStatePDA.toString());
        
        const accountInfo = await adminConnection.getAccountInfo(systemStatePDA);
        
        if (!accountInfo) {
            console.log('❌ System state account does not exist');
            return false;
        }
        
        console.log('✅ System state account exists');
        console.log('🔍 Account owner:', accountInfo.owner.toString());
        console.log('🔍 Account size:', accountInfo.data.length);
        console.log('🔍 Account executable:', accountInfo.executable);
        console.log('🔍 Account rent epoch:', accountInfo.rentEpoch);
        
        // Check if the account is owned by our program
        if (!accountInfo.owner.equals(new solanaWeb3.PublicKey(window.CONFIG.programId))) {
            console.log('❌ System state account is not owned by our program');
            return false;
        }
        
        return true;
    } catch (error) {
        console.error('❌ Error checking system initialization:', error);
        return false;
    }
}

/**
 * Check system pause status
 */
async function checkSystemPauseStatus() {
    try {
        const systemStatePDA = getSystemStatePDA();
        const accountInfo = await adminConnection.getAccountInfo(systemStatePDA);
        
        if (!accountInfo || accountInfo.data.length < 1) {
            console.log('❌ System state account not found or too small');
            return { isPaused: false, reason: 'not_initialized' };
        }
        
        // Read the first byte to check pause status
        // According to the API docs, is_paused is the first byte (1 byte)
        const isPaused = accountInfo.data[0] === 1;
        
        console.log('🔍 System pause status:', isPaused ? 'PAUSED' : 'UNPAUSED');
        
        // Read admin authority (32 bytes starting at offset 10)
        let adminAuthority = null;
        let pendingAdminAuthority = null;
        let adminChangeTimestamp = null;
        
        if (accountInfo.data.length >= 42) { // 1 + 8 + 1 + 32 = 42 bytes minimum
            const adminAuthorityBytes = accountInfo.data.slice(10, 42);
            adminAuthority = new solanaWeb3.PublicKey(adminAuthorityBytes).toString();
            console.log('🔍 Admin authority:', adminAuthority);
        }
        
        // Read pending admin authority (33 bytes starting at offset 42)
        if (accountInfo.data.length >= 75) { // 1 + 8 + 1 + 32 + 33 = 75 bytes minimum
            const pendingAdminFlag = accountInfo.data[42]; // 1 byte flag
            if (pendingAdminFlag === 1) { // Some() variant
                const pendingAdminBytes = accountInfo.data.slice(43, 75);
                pendingAdminAuthority = new solanaWeb3.PublicKey(pendingAdminBytes).toString();
                console.log('🔍 Pending admin authority:', pendingAdminAuthority);
            } else {
                console.log('🔍 No pending admin authority');
            }
        }
        
        // Read admin change timestamp (8 bytes starting at offset 75)
        if (accountInfo.data.length >= 83) { // Full 83 bytes
            const adminChangeTimestampBytes = new DataView(accountInfo.data.buffer, 75, 8);
            const adminChangeTimestampValue = adminChangeTimestampBytes.getBigInt64(0, true);
            
            if (adminChangeTimestampValue === 0n) {
                adminChangeTimestamp = 'N/A';
                console.log('🔍 Admin change timestamp: Not set (0)');
            } else {
                adminChangeTimestamp = new Date(Number(adminChangeTimestampValue) * 1000).toLocaleString();
                console.log('🔍 Admin change timestamp:', adminChangeTimestamp);
            }
        }
        
        if (isPaused && accountInfo.data.length >= 10) {
            // Read pause timestamp (8 bytes, little-endian)
            const pauseTimestamp = new DataView(accountInfo.data.buffer, 1, 8).getBigInt64(0, true);
            console.log('🔍 Pause timestamp:', pauseTimestamp.toString());
            
            // Read pause reason code (1 byte)
            const pauseReasonCode = accountInfo.data[9];
            console.log('🔍 Pause reason code:', pauseReasonCode);
            
            // Convert timestamp to readable date
            const pauseDate = new Date(Number(pauseTimestamp) * 1000);
            console.log('🔍 Pause date:', pauseDate.toLocaleString());
            
            // Map reason codes to human-readable text
            const reasonText = {
                1: 'Emergency Security',
                2: 'Scheduled Maintenance', 
                3: 'Contract Upgrade',
                4: 'Regulatory Compliance',
                5: 'Infrastructure Issue',
                6: 'Economic Emergency',
                7: 'Custom Reason'
            };
            
            const reasonDescription = reasonText[pauseReasonCode] || `Unknown (${pauseReasonCode})`;
            console.log('🔍 Pause reason:', reasonDescription);
            
            return { 
                isPaused, 
                reason: reasonDescription,
                timestamp: pauseDate.toLocaleString(),
                reasonCode: pauseReasonCode,
                adminAuthority: adminAuthority,
                pendingAdminAuthority: pendingAdminAuthority,
                adminChangeTimestamp: adminChangeTimestamp
            };
        }
        
        return { 
            isPaused, 
            reason: isPaused ? 'paused' : 'unpaused',
            adminAuthority: adminAuthority,
            pendingAdminAuthority: pendingAdminAuthority,
            adminChangeTimestamp: adminChangeTimestamp
        };
    } catch (error) {
        console.error('❌ Error checking system pause status:', error);
        return { isPaused: false, reason: 'error' };
    }
}

/**
 * Execute system pause
 */
async function executeSystemPause(reasonCode = 1) {
    try {
        if (!adminWallet) {
            throw new Error('Wallet not connected');
        }
        
        console.log('🛑 Executing system pause with reason code:', reasonCode);
        console.log('🔍 Admin wallet:', adminWallet.toString());
        
        // Check if system is initialized first
        const isInitialized = await checkSystemInitialized();
        if (!isInitialized) {
            throw new Error('System not initialized. Please initialize the program first using the CLI application.');
        }
        
        // Check current pause status
        const pauseStatus = await checkSystemPauseStatus();
        if (pauseStatus.isPaused) {
            throw new Error(`System is already paused (reason code: ${pauseStatus.reason}). Use system unpause to resume operations.`);
        }
        
        const systemStatePDA = getSystemStatePDA();
        const programDataAccount = await getProgramDataAccount();
        
        console.log('🔍 System State PDA:', systemStatePDA.toString());
        console.log('🔍 Program Data Account:', programDataAccount.toString());
        console.log('🔍 Program ID:', window.CONFIG.programId);
        
        // Create instruction data: discriminator (1 byte) + reason_code (1 byte)
        const instructionData = new Uint8Array([12, reasonCode]);
        console.log('🔍 Instruction data:', Array.from(instructionData));
        
        const instruction = new solanaWeb3.TransactionInstruction({
            keys: [
                { pubkey: adminWallet, isSigner: true, isWritable: true },
                { pubkey: systemStatePDA, isSigner: false, isWritable: true },
                { pubkey: programDataAccount, isSigner: false, isWritable: false }
            ],
            programId: new solanaWeb3.PublicKey(window.CONFIG.programId),
            data: instructionData,
        });
        
        console.log('🔍 Instruction keys:', instruction.keys.map(k => ({
            pubkey: k.pubkey.toString(),
            isSigner: k.isSigner,
            isWritable: k.isWritable
        })));
        
        const signature = await createAndSendTransaction([instruction]);
        console.log('✅ System pause executed successfully:', signature);
        return signature;
        
    } catch (error) {
        console.error('❌ System pause failed:', error);
        
        // Provide more helpful error messages
        if (error.message.includes('Unauthorized')) {
            throw new Error('System pause requires Admin Authority. Your wallet does not have the required permissions.');
        } else if (error.message.includes('SystemAlreadyPaused')) {
            throw new Error('System is already paused. Use system unpause to resume operations.');
        } else if (error.message.includes('InvalidAccountData')) {
            throw new Error('System state account not found or invalid. The program may not be properly initialized.');
        } else if (error.message.includes('AccountDataTooSmall')) {
            throw new Error('System state account is too small. The program may not be properly initialized.');
        } else if (error.message.includes('Failed to serialize or deserialize account data')) {
            throw new Error('Account data serialization failed. This usually means the system state account does not exist or has invalid data. Please ensure the program is properly initialized.');
        }
        
        throw error;
    }
}

/**
 * Execute system unpause
 */
async function executeSystemUnpause() {
    try {
        if (!adminWallet) {
            throw new Error('Wallet not connected');
        }
        
        console.log('▶️ Executing system unpause');
        
        // Check if system is initialized first
        const isInitialized = await checkSystemInitialized();
        if (!isInitialized) {
            throw new Error('System not initialized. Please initialize the program first using the CLI application.');
        }
        
        const systemStatePDA = getSystemStatePDA();
        const mainTreasuryPDA = getMainTreasuryPDA();
        const programDataAccount = await getProgramDataAccount();
        
        // Create instruction data: discriminator (1 byte)
        const instructionData = new Uint8Array([13]); // Discriminator for process_system_unpause
        
        const instruction = new solanaWeb3.TransactionInstruction({
            keys: [
                { pubkey: adminWallet, isSigner: true, isWritable: true },
                { pubkey: systemStatePDA, isSigner: false, isWritable: true },
                { pubkey: mainTreasuryPDA, isSigner: false, isWritable: true },
                { pubkey: programDataAccount, isSigner: false, isWritable: false }
            ],
            programId: new solanaWeb3.PublicKey(window.CONFIG.programId),
            data: instructionData,
        });
        
        const signature = await createAndSendTransaction([instruction]);
        console.log('✅ System unpause executed successfully:', signature);
        return signature;
        
    } catch (error) {
        console.error('❌ System unpause failed:', error);
        
        // Provide more helpful error messages
        if (error.message.includes('Unauthorized')) {
            throw new Error('System unpause requires Admin Authority. Your wallet does not have the required permissions.');
        } else if (error.message.includes('InvalidAccountData')) {
            throw new Error('System state account not found or invalid. The program may not be properly initialized.');
        } else if (error.message.includes('AccountDataTooSmall')) {
            throw new Error('System state account is too small. The program may not be properly initialized.');
        }
        
        throw error;
    }
}

/**
 * Execute admin change
 */
async function executeAdminChange(newAdminAddress) {
    try {
        if (!adminWallet) {
            throw new Error('Wallet not connected');
        }
        
        if (!validateSolanaAddress(newAdminAddress)) {
            throw new Error('Invalid Solana address format');
        }
        
        console.log('👤 Executing admin change to:', newAdminAddress);
        
        const systemStatePDA = getSystemStatePDA();
        const newAdminPubkey = new solanaWeb3.PublicKey(newAdminAddress);
        
        // Create instruction data: discriminator (1 byte) + new_admin (32 bytes)
        const instructionData = new Uint8Array(33);
        instructionData[0] = 3; // Discriminator for process_admin_change
        instructionData.set(newAdminPubkey.toBytes(), 1); // New admin address
        
        const instruction = new solanaWeb3.TransactionInstruction({
            keys: [
                { pubkey: adminWallet, isSigner: true, isWritable: true },
                { pubkey: systemStatePDA, isSigner: false, isWritable: true }
            ],
            programId: new solanaWeb3.PublicKey(window.CONFIG.programId),
            data: instructionData,
        });
        
        const signature = await createAndSendTransaction([instruction]);
        console.log('✅ Admin change executed successfully:', signature);
        return signature;
        
    } catch (error) {
        console.error('❌ Admin change failed:', error);
        throw error;
    }
}

/**
 * POOL ADMINISTRATION FUNCTIONS
 */

/**
 * Execute pool pause
 */
async function executePoolPause(poolId) {
    try {
        if (!adminWallet) {
            throw new Error('Wallet not connected');
        }
        
        if (!validateSolanaAddress(poolId)) {
            throw new Error('Invalid pool ID format');
        }
        
        console.log('⏸️ Executing pool pause for:', poolId);
        
        const systemStatePDA = getSystemStatePDA();
        const poolStatePDA = new solanaWeb3.PublicKey(poolId);
        
        // Create instruction data: discriminator (1 byte)
        const instructionData = new Uint8Array([4]); // Discriminator for process_pool_pause
        
        const instruction = new solanaWeb3.TransactionInstruction({
            keys: [
                { pubkey: adminWallet, isSigner: true, isWritable: true },
                { pubkey: systemStatePDA, isSigner: false, isWritable: false },
                { pubkey: poolStatePDA, isSigner: false, isWritable: true }
            ],
            programId: new solanaWeb3.PublicKey(window.CONFIG.programId),
            data: instructionData,
        });
        
        const signature = await createAndSendTransaction([instruction]);
        console.log('✅ Pool pause executed successfully:', signature);
        return signature;
        
    } catch (error) {
        console.error('❌ Pool pause failed:', error);
        throw error;
    }
}

/**
 * Execute pool unpause
 */
async function executePoolUnpause(poolId) {
    try {
        if (!adminWallet) {
            throw new Error('Wallet not connected');
        }
        
        if (!validateSolanaAddress(poolId)) {
            throw new Error('Invalid pool ID format');
        }
        
        console.log('▶️ Executing pool unpause for:', poolId);
        
        const systemStatePDA = getSystemStatePDA();
        const poolStatePDA = new solanaWeb3.PublicKey(poolId);
        
        // Create instruction data: discriminator (1 byte)
        const instructionData = new Uint8Array([5]); // Discriminator for process_pool_unpause
        
        const instruction = new solanaWeb3.TransactionInstruction({
            keys: [
                { pubkey: adminWallet, isSigner: true, isWritable: true },
                { pubkey: systemStatePDA, isSigner: false, isWritable: false },
                { pubkey: poolStatePDA, isSigner: false, isWritable: true }
            ],
            programId: new solanaWeb3.PublicKey(window.CONFIG.programId),
            data: instructionData,
        });
        
        const signature = await createAndSendTransaction([instruction]);
        console.log('✅ Pool unpause executed successfully:', signature);
        return signature;
        
    } catch (error) {
        console.error('❌ Pool unpause failed:', error);
        throw error;
    }
}

/**
 * Execute pool fee update
 */
async function executePoolUpdateFees(poolId, newFeeRate) {
    try {
        if (!adminWallet) {
            throw new Error('Wallet not connected');
        }
        
        if (!validateSolanaAddress(poolId)) {
            throw new Error('Invalid pool ID format');
        }
        
        if (typeof newFeeRate !== 'number' || newFeeRate < 0 || newFeeRate > 50) {
            throw new Error('Fee rate must be between 0 and 50 basis points');
        }
        
        console.log('💰 Executing pool fee update for:', poolId, 'to', newFeeRate, 'basis points');
        
        const systemStatePDA = getSystemStatePDA();
        const poolStatePDA = new solanaWeb3.PublicKey(poolId);
        
        // Create instruction data: discriminator (1 byte) + fee_rate (1 byte)
        const instructionData = new Uint8Array([6, newFeeRate]);
        
        const instruction = new solanaWeb3.TransactionInstruction({
            keys: [
                { pubkey: adminWallet, isSigner: true, isWritable: true },
                { pubkey: systemStatePDA, isSigner: false, isWritable: false },
                { pubkey: poolStatePDA, isSigner: false, isWritable: true }
            ],
            programId: new solanaWeb3.PublicKey(window.CONFIG.programId),
            data: instructionData,
        });
        
        const signature = await createAndSendTransaction([instruction]);
        console.log('✅ Pool fee update executed successfully:', signature);
        return signature;
        
    } catch (error) {
        console.error('❌ Pool fee update failed:', error);
        throw error;
    }
}

/**
 * Execute swap set owner only
 */
async function executeSwapSetOwnerOnly(poolId, ownerOnly = true) {
    try {
        if (!adminWallet) {
            throw new Error('Wallet not connected');
        }
        
        if (!validateSolanaAddress(poolId)) {
            throw new Error('Invalid pool ID format');
        }
        
        console.log('🔒 Executing swap set owner only for:', poolId, 'to', ownerOnly);
        
        const systemStatePDA = getSystemStatePDA();
        const poolStatePDA = new solanaWeb3.PublicKey(poolId);
        
        // Create instruction data: discriminator (1 byte) + owner_only (1 byte)
        const instructionData = new Uint8Array([7, ownerOnly ? 1 : 0]);
        
        const instruction = new solanaWeb3.TransactionInstruction({
            keys: [
                { pubkey: adminWallet, isSigner: true, isWritable: true },
                { pubkey: systemStatePDA, isSigner: false, isWritable: false },
                { pubkey: poolStatePDA, isSigner: false, isWritable: true }
            ],
            programId: new solanaWeb3.PublicKey(window.CONFIG.programId),
            data: instructionData,
        });
        
        const signature = await createAndSendTransaction([instruction]);
        console.log('✅ Swap owner only setting executed successfully:', signature);
        return signature;
        
    } catch (error) {
        console.error('❌ Swap owner only setting failed:', error);
        throw error;
    }
}

/**
 * TREASURY ADMINISTRATION FUNCTIONS
 */

/**
 * Get treasury information
 */
async function getTreasuryInfo() {
    try {
        console.log('📊 Getting treasury information...');
        
        const mainTreasuryPDA = getMainTreasuryPDA();
        
        // Create instruction data: discriminator (1 byte)
        const instructionData = new Uint8Array([8]); // Discriminator for process_treasury_get_info
        
        const instruction = new solanaWeb3.TransactionInstruction({
            keys: [
                { pubkey: mainTreasuryPDA, isSigner: false, isWritable: false }
            ],
            programId: new solanaWeb3.PublicKey(window.CONFIG.programId),
            data: instructionData,
        });
        
        // Simulate transaction to get treasury info
        const transaction = new solanaWeb3.Transaction().add(instruction);
        const { blockhash } = await adminConnection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = adminWallet || solanaWeb3.Keypair.generate().publicKey;
        
        const result = await adminConnection.simulateTransaction(transaction);
        
        if (result.value.err) {
            throw new Error(`Treasury info simulation failed: ${JSON.stringify(result.value.err)}`);
        }
        
        // Parse treasury info from logs
        const treasuryInfo = parseTreasuryInfoFromLogs(result.value.logs);
        console.log('✅ Treasury info retrieved successfully');
        return treasuryInfo;
        
    } catch (error) {
        console.error('❌ Failed to get treasury info:', error);
        throw error;
    }
}

/**
 * Parse treasury info from transaction logs
 */
function parseTreasuryInfoFromLogs(logs) {
    const treasuryInfo = {};
    
    logs.forEach(log => {
        if (log.includes('Treasury Info:')) {
            // Parse treasury information from log format
            // This would need to be implemented based on actual log format
            console.log('📋 Treasury log:', log);
        }
    });
    
    return treasuryInfo;
}

/**
 * Execute treasury fee withdrawal
 */
async function executeTreasuryWithdrawFees(amount = null) {
    try {
        if (!adminWallet) {
            throw new Error('Wallet not connected');
        }
        
        console.log('💰 Executing treasury fee withdrawal');
        
        const mainTreasuryPDA = getMainTreasuryPDA();
        
        // Create instruction data: discriminator (1 byte) + amount (8 bytes, optional)
        let instructionData;
        
        if (amount !== null) {
            // Create 9-byte array: 1 byte discriminator + 8 bytes amount
            instructionData = new Uint8Array(9);
            instructionData[0] = 9; // Discriminator for process_treasury_withdraw_fees
            
            // Convert amount to little-endian bytes
            const amountView = new DataView(instructionData.buffer, 1);
            amountView.setBigUint64(0, BigInt(amount), true); // little-endian
        } else {
            // Just discriminator for maximum amount
            instructionData = new Uint8Array([9]);
        }
        
        const instruction = new solanaWeb3.TransactionInstruction({
            keys: [
                { pubkey: adminWallet, isSigner: true, isWritable: true },
                { pubkey: mainTreasuryPDA, isSigner: false, isWritable: true }
            ],
            programId: new solanaWeb3.PublicKey(window.CONFIG.programId),
            data: instructionData,
        });
        
        const signature = await createAndSendTransaction([instruction]);
        console.log('✅ Treasury fee withdrawal executed successfully:', signature);
        return signature;
        
    } catch (error) {
        console.error('❌ Treasury fee withdrawal failed:', error);
        throw error;
    }
}

/**
 * Execute pool fee consolidation
 */
async function executeConsolidatePoolFees(poolId) {
    try {
        if (!adminWallet) {
            throw new Error('Wallet not connected');
        }
        
        if (!validateSolanaAddress(poolId)) {
            throw new Error('Invalid pool ID format');
        }
        
        console.log('🔄 Executing pool fee consolidation for:', poolId);
        
        const mainTreasuryPDA = getMainTreasuryPDA();
        const poolStatePDA = new solanaWeb3.PublicKey(poolId);
        
        // Create instruction data: discriminator (1 byte)
        const instructionData = new Uint8Array([10]); // Discriminator for process_consolidate_pool_fees
        
        const instruction = new solanaWeb3.TransactionInstruction({
            keys: [
                { pubkey: adminWallet, isSigner: true, isWritable: true },
                { pubkey: mainTreasuryPDA, isSigner: false, isWritable: true },
                { pubkey: poolStatePDA, isSigner: false, isWritable: true }
            ],
            programId: new solanaWeb3.PublicKey(window.CONFIG.programId),
            data: instructionData,
        });
        
        const signature = await createAndSendTransaction([instruction]);
        console.log('✅ Pool fee consolidation executed successfully:', signature);
        return signature;
        
    } catch (error) {
        console.error('❌ Pool fee consolidation failed:', error);
        throw error;
    }
}

/**
 * Discover all pools
 */
async function discoverAllPools() {
    try {
        console.log('🔍 Discovering all pools...');
        
        const programId = new solanaWeb3.PublicKey(window.CONFIG.programId);
        const programAccounts = await adminConnection.getProgramAccounts(programId, {
            encoding: 'base64',
            filters: [
                {
                    dataSize: 300 // Approximate size of pool state
                }
            ]
        });
        
        const pools = [];
        programAccounts.forEach((account, index) => {
            // Check if this looks like a pool account
            if (account.account.data.length > 250) {
                pools.push({
                    address: account.pubkey.toString(),
                    dataLength: account.account.data.length
                });
            }
        });
        
        console.log(`✅ Discovered ${pools.length} potential pools`);
        return pools;
        
    } catch (error) {
        console.error('❌ Failed to discover pools:', error);
        throw error;
    }
}

// Export functions for global access
if (typeof window !== 'undefined') {
    window.AdminUtils = {
        initializeAdminUtils,
        getWalletProvider,
        validateSolanaAddress,
        getSystemStatePDA,
        getMainTreasuryPDA,
        getPoolStatePDA,
        createAndSendTransaction,
        // System functions
        executeSystemPause,
        executeSystemUnpause,
        executeAdminChange,
        // Pool functions
        executePoolPause,
        executePoolUnpause,
        executePoolUpdateFees,
        executeSwapSetOwnerOnly,
        // Treasury functions
        getTreasuryInfo,
        executeTreasuryWithdrawFees,
        executeConsolidatePoolFees,
        discoverAllPools,
        // Status functions
        checkSystemPauseStatus,
        checkSystemInitialized
    };
}
