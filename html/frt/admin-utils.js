/**
 * Admin Utilities for Fixed Ratio Trading Dashboard
 * Provides functions for all administrative operations
 * 
 * Dependencies:
 * - error-codes.js: Centralized error code mapping (loaded via script tag)
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
            new TextEncoder().encode("pool_state"),
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
        
        console.log('🔍 Wallet provider:', walletProvider);
        console.log('🔍 Transaction fee payer:', transaction.feePayer.toString());
        console.log('🔍 Transaction instructions:', transaction.instructions.length);

        // Ensure the connected wallet matches the configured admin wallet
        try {
            const providerPk = walletProvider.publicKey?.toString?.();
            if (!providerPk) {
                throw new Error('Wallet not connected in provider');
            }
            const requiredAdmin = adminWallet?.toString?.();
            if (requiredAdmin && providerPk !== requiredAdmin) {
                throw new Error(`This wallet is not the Admin Authority. Connected: ${providerPk}. Required Admin: ${requiredAdmin}. Please switch to the admin wallet and try again.`);
            }
        } catch (precheckErr) {
            // Surface a clear, user-facing error
            throw precheckErr;
        }
        
        // Try to sign with the specific wallet method
        let signedTransaction;
        try {
            // Force refresh the page to clear any caching issues
            console.log('🔍 About to sign transaction with wallet provider:', walletProvider);
            console.log('🔍 Transaction fee payer:', transaction.feePayer.toString());
            console.log('🔍 Transaction signers:', transaction.signatures.map(sig => sig.publicKey?.toString()));
            
            // Use the wallet's signTransaction method
            signedTransaction = await walletProvider.signTransaction(transaction);
            
            console.log('✅ Transaction signed successfully');
        } catch (signError) {
            console.error('❌ Signing error:', signError);
            console.error('❌ Signing error details:', {
                message: signError.message,
                stack: signError.stack,
                name: signError.name
            });
            // Map common wallet mismatch error to a clear admin message
            if (/not required to sign this transaction/i.test(signError.message || '')) {
                const providerPk = (getWalletProvider()?.publicKey || {}).toString?.() || 'Unknown';
                const requiredAdmin = adminWallet?.toString?.() || 'Unknown';
                throw new Error(`This wallet is not the Admin Authority. Connected: ${providerPk}. Required Admin: ${requiredAdmin}. Please switch to the admin wallet and try again.`);
            }
            throw new Error(`Transaction signing failed: ${signError.message}`);
        }
        
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

        // Attempt to fetch and print program logs for debugging
        try {
            let tx = await adminConnection.getTransaction(signature, {
                commitment: 'confirmed',
                maxSupportedTransactionVersion: 0
            });
            if (!tx || !tx.meta) {
                tx = await adminConnection.getTransaction(signature, {
                    commitment: 'finalized',
                    maxSupportedTransactionVersion: 0
                });
            }
            if (tx) {
                const logs = tx.meta?.logMessages || [];
                const err = tx.meta?.err || null;
                console.groupCollapsed(`🪵 Program logs for ${signature}`);
                if (err) console.warn('Transaction error meta:', err);
                if (logs && logs.length) {
                    logs.forEach((line) => console.log(line));
                } else {
                    console.log('(no logMessages in getTransaction response)');
                    // Fallback: try block-level fetch and match by signature
                    try {
                        if (typeof tx.slot === 'number') {
                            const block = await adminConnection.getBlock(tx.slot, {
                                maxSupportedTransactionVersion: 0,
                                commitment: 'finalized'
                            });
                            const found = block?.transactions?.find(t => (t.transaction.signatures || []).includes(signature));
                            const blockLogs = found?.meta?.logMessages || [];
                            if (blockLogs.length) {
                                console.groupCollapsed('🪵 Block logs fallback');
                                blockLogs.forEach((line) => console.log(line));
                                console.groupEnd();
                            }
                        }
                    } catch (_) {}
                }
                // Optional: show pre/post SOL balances
                const pre = tx.meta?.preBalances || [];
                const post = tx.meta?.postBalances || [];
                const keys = (tx.transaction?.message?.getAccountKeys?.().staticAccountKeys)
                    || tx.transaction?.message?.accountKeys
                    || [];
                if (pre.length && post.length && keys.length) {
                    console.groupCollapsed('💰 SOL balance changes (lamports)');
                    for (let i = 0; i < Math.min(pre.length, post.length, keys.length); i++) {
                        const delta = (post[i] - pre[i]);
                        if (delta !== 0) {
                            console.log(`${keys[i].toString?.() || keys[i]}: ${pre[i]} → ${post[i]} (Δ ${delta})`);
                        }
                    }
                    console.groupEnd();
                }
                console.groupEnd();
            }
        } catch (logErr) {
            console.warn('⚠️ Unable to fetch transaction logs:', logErr?.message || logErr);
        }

        return signature;
    } catch (error) {
        console.error('❌ Transaction failed:', error);
        throw error;
    }
}

/**
 * Fetch and print logs for a given transaction signature
 */
async function fetchTransactionLogs(signature) {
    try {
        let tx = await adminConnection.getTransaction(signature, {
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0
        });
        if (!tx) {
            tx = await adminConnection.getTransaction(signature, {
                commitment: 'finalized',
                maxSupportedTransactionVersion: 0
            });
        }
        if (!tx) {
            console.warn('No transaction found for signature:', signature);
            return null;
        }
        let logs = tx.meta?.logMessages || [];
        console.groupCollapsed(`🪵 Program logs for ${signature}`);
        if (logs.length) {
            logs.forEach((line) => console.log(line));
        } else {
            console.log('(no logMessages in getTransaction response)');
            // Fallback: block-level logs
            try {
                if (typeof tx.slot === 'number') {
                    const block = await adminConnection.getBlock(tx.slot, {
                        maxSupportedTransactionVersion: 0,
                        commitment: 'finalized'
                    });
                    const found = block?.transactions?.find(t => (t.transaction.signatures || []).includes(signature));
                    logs = found?.meta?.logMessages || [];
                    if (logs.length) logs.forEach((line) => console.log(line));
                }
            } catch (e) {
                console.warn('Block fallback failed:', e?.message || e);
            }
        }
        console.groupEnd();
        return logs;
    } catch (e) {
        console.error('❌ Failed to fetch transaction logs:', e);
        throw e;
    }
}

/**
 * Subscribe to real-time program logs (enable once per session)
 */
let _programLogsSubscriptionId = null;
async function enableProgramLogs() {
    try {
        if (_programLogsSubscriptionId !== null) {
            console.log('🪵 Program logs already enabled');
            return _programLogsSubscriptionId;
        }
        const programId = new solanaWeb3.PublicKey(window.CONFIG.programId);
        _programLogsSubscriptionId = adminConnection.onLogs(programId, (log) => {
            console.groupCollapsed(`🪵 [onLogs] ${log.signature || ''}`);
            (log.logs || []).forEach((l) => console.log(l));
            console.groupEnd();
        }, 'confirmed');
        console.log('✅ Program logs subscription enabled:', _programLogsSubscriptionId);
        return _programLogsSubscriptionId;
    } catch (e) {
        console.error('❌ Failed to enable program logs subscription:', e);
        return null;
    }
}

async function disableProgramLogs() {
    try {
        if (_programLogsSubscriptionId !== null) {
            await adminConnection.removeOnLogsListener(_programLogsSubscriptionId);
            console.log('🪵 Program logs subscription removed');
            _programLogsSubscriptionId = null;
        }
    } catch (e) {
        console.error('❌ Failed to disable program logs subscription:', e);
    }
}

/**
 * Simulate a single-pool consolidation to get logs without executing
 */
async function simulateConsolidatePoolFees(poolId) {
    const systemStatePDA = getSystemStatePDA();
    const mainTreasuryPDA = getMainTreasuryPDA();
    const programDataAccount = await getProgramDataAccount();
    const poolStatePDA = new solanaWeb3.PublicKey(poolId);

    const instructionData = new Uint8Array(2);
    instructionData[0] = 17;
    instructionData[1] = 1;

    const ix = new solanaWeb3.TransactionInstruction({
        keys: [
            { pubkey: adminWallet || solanaWeb3.Keypair.generate().publicKey, isSigner: true, isWritable: false },
            { pubkey: systemStatePDA, isSigner: false, isWritable: false },
            { pubkey: mainTreasuryPDA, isSigner: false, isWritable: true },
            { pubkey: programDataAccount, isSigner: false, isWritable: false },
            { pubkey: poolStatePDA, isSigner: false, isWritable: true },
        ],
        programId: new solanaWeb3.PublicKey(window.CONFIG.programId),
        data: instructionData,
    });

    const tx = new solanaWeb3.Transaction().add(ix);
    const { blockhash } = await adminConnection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = adminWallet || solanaWeb3.Keypair.generate().publicKey;

    const sim = await adminConnection.simulateTransaction(tx, undefined, { sigVerify: false, replaceRecentBlockhash: true });
    const logs = sim.value?.logs || [];
    console.groupCollapsed('🧪 Simulated Consolidation Logs');
    logs.forEach((l) => console.log(l));
    console.groupEnd();
    return logs;
}

/**
 * Simulate treasury withdrawal to test instruction format
 */
async function simulateTreasuryWithdrawFees(amount = null) {
    const mainTreasuryPDA = getMainTreasuryPDA();
    const systemStatePDA = getSystemStatePDA();
    const programDataAccount = await getProgramDataAccount();

    let amountLamports = 0n;
    if (amount !== null) {
        const lamports = Math.round(Number(amount) * 1_000_000_000);
        if (!Number.isFinite(lamports) || lamports < 0) {
            throw new Error('Invalid withdrawal amount');
        }
        amountLamports = BigInt(lamports);
    }

    // Build instruction data using proper Borsh serialization for PoolInstruction::WithdrawTreasuryFees
    // The API docs specify this must be Borsh-serialized enum variant, not raw bytes
    // Use cached discriminator if detected; fallback to 15
    // Format: [discriminator: u8, amount: u64] = 9 bytes total
    const instructionData = new Uint8Array(9);
    let withdrawDiscSim = 15;
    try {
        const cached = localStorage.getItem('FRT_WITHDRAW_DISC');
        if (cached) {
            const n = Number.parseInt(cached, 10);
            if (Number.isFinite(n) && n >= 0 && n < 256) withdrawDiscSim = n;
        }
    } catch (_) {}
    instructionData[0] = withdrawDiscSim;
    // Amount as u64 little-endian (8 bytes)
    const amountView = new DataView(instructionData.buffer, 1, 8);
    amountView.setBigUint64(0, amountLamports, true);

    let rentSysvar = solanaWeb3.SYSVAR_RENT_PUBKEY;
    if (!rentSysvar) {
        rentSysvar = new solanaWeb3.PublicKey('SysvarRent111111111111111111111111111111111');
    }

    const destinationAccount = adminWallet || solanaWeb3.Keypair.generate().publicKey;

    const ix = new solanaWeb3.TransactionInstruction({
        keys: [
            { pubkey: adminWallet || solanaWeb3.Keypair.generate().publicKey, isSigner: true, isWritable: false },
            { pubkey: mainTreasuryPDA, isSigner: false, isWritable: true },
            { pubkey: rentSysvar, isSigner: false, isWritable: false },
            { pubkey: destinationAccount, isSigner: false, isWritable: true },
            { pubkey: systemStatePDA, isSigner: false, isWritable: false },
            { pubkey: programDataAccount, isSigner: false, isWritable: false },
        ],
        programId: new solanaWeb3.PublicKey(window.CONFIG.programId),
        data: instructionData,
    });

    const tx = new solanaWeb3.Transaction().add(ix);
    const { blockhash } = await adminConnection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = adminWallet || solanaWeb3.Keypair.generate().publicKey;

    const sim = await adminConnection.simulateTransaction(tx, undefined, { sigVerify: false, replaceRecentBlockhash: true });
    const logs = sim.value?.logs || [];
    console.groupCollapsed('🧪 Simulated Treasury Withdrawal Logs');
    logs.forEach((l) => console.log(l));
    if (sim.value?.err) console.warn('Simulation error:', sim.value.err);
    console.groupEnd();
    return { logs, error: sim.value?.err };
}

/**
 * Get withdrawal status (blocked reason and seconds remaining) via simulation logs
 */
async function getWithdrawalStatus(amount = 0.0) {
    try {
        const sim = await simulateTreasuryWithdrawFees(amount);
        const analysis = analyzeTreasuryWithdrawalLogs(sim.logs);
        return analysis;
    } catch (e) {
        // If simulation fails, return unknown (do not block UI)
        return { blocked: false };
    }
}

/**
 * Analyze treasury withdrawal simulation logs for penalty / rate limits
 */
function analyzeTreasuryWithdrawalLogs(logs) {
    try {
        const text = (logs || []).join('\n');
        const result = { blocked: false };
        if (!text) return result;
        // Detect restart penalty
        if (/restart penalty active/i.test(text) || /SYSTEM RESTART PENALTY ACTIVE/i.test(text)) {
            result.blocked = true;
            result.reason = 'restart_penalty';
            // Support both 'Remaining penalty time: X' and 'Remaining penalty time: X seconds'
            let m = text.match(/Remaining penalty time:\s*(\d+)/i);
            if (!m) m = text.match(/Remaining penalty time:\s*(\d+)\s*seconds/i);
            if (m) result.secondsRemaining = Number(m[1]);
            return result;
        }
        // Detect rate limit window
        if (/rate limit/i.test(text) || /Next withdrawal allowed in/i.test(text)) {
            result.blocked = true;
            result.reason = 'rate_limit';
            // Match 'Next withdrawal allowed in X seconds' (no colon) and optional colon variant
            let m = text.match(/Next withdrawal allowed in\s*(\d+)\s*seconds/i);
            if (!m) m = text.match(/Next withdrawal allowed in:\s*(\d+)/i);
            if (m) result.secondsRemaining = Number(m[1]);
            const h = text.match(/current hourly limit[:\s]+([0-9_]+)/i);
            if (h) {
                const n = Number(h[1].replace(/_/g, ''));
                if (Number.isFinite(n)) result.currentHourlyLimitLamports = n;
            }
            return result;
        }
        return result;
    } catch (_) {
        return { blocked: false };
    }
}

/**
 * Brute-force detect the correct PoolInstruction enum variant index for WithdrawTreasuryFees
 * Tries indices 0..40 via simulation and returns the first that doesn't fail with InvalidInstructionData
 * Caches the discovered index in localStorage under key 'FRT_WITHDRAW_DISC'
 */
async function bruteForceDetectWithdrawDiscriminator(amount = 0.0) {
    try {
        const testAmount = amount;
        let found = null;
        for (let idx = 0; idx <= 40; idx++) {
            try {
                const mainTreasuryPDA = getMainTreasuryPDA();
                const systemStatePDA = getSystemStatePDA();
                const programDataAccount = await getProgramDataAccount();

                let amountLamports = 0n;
                if (testAmount !== null) {
                    const lamports = Math.round(Number(testAmount) * 1_000_000_000);
                    if (!Number.isFinite(lamports) || lamports < 0) {
                        throw new Error('Invalid withdrawal amount');
                    }
                    amountLamports = BigInt(lamports);
                }

                const instructionData = new Uint8Array(9);
                instructionData[0] = idx; // candidate enum variant index
                const amountView = new DataView(instructionData.buffer, 1, 8);
                amountView.setBigUint64(0, amountLamports, true);

                let rentSysvar = solanaWeb3.SYSVAR_RENT_PUBKEY;
                if (!rentSysvar) {
                    rentSysvar = new solanaWeb3.PublicKey('SysvarRent111111111111111111111111111111111');
                }

                const destinationAccount = adminWallet || solanaWeb3.Keypair.generate().publicKey;

                const ix = new solanaWeb3.TransactionInstruction({
                    keys: [
                        { pubkey: adminWallet || solanaWeb3.Keypair.generate().publicKey, isSigner: true, isWritable: false },
                        { pubkey: mainTreasuryPDA, isSigner: false, isWritable: true },
                        { pubkey: rentSysvar, isSigner: false, isWritable: false },
                        { pubkey: destinationAccount, isSigner: false, isWritable: true },
                        { pubkey: systemStatePDA, isSigner: false, isWritable: false },
                        { pubkey: programDataAccount, isSigner: false, isWritable: false },
                    ],
                    programId: new solanaWeb3.PublicKey(window.CONFIG.programId),
                    data: instructionData,
                });

                const tx = new solanaWeb3.Transaction().add(ix);
                const { blockhash } = await adminConnection.getLatestBlockhash();
                tx.recentBlockhash = blockhash;
                tx.feePayer = adminWallet || solanaWeb3.Keypair.generate().publicKey;

                const sim = await adminConnection.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true });
                const err = sim.value?.err || null;
                const logs = sim.value?.logs || [];

                // Heuristic: if deserialization worked, program logs will include program-specific lines
                const invalidData = !!err && (JSON.stringify(err).includes('InvalidInstructionData') || JSON.stringify(err).includes('invalid instruction data'));
                if (!invalidData) {
                    found = { index: idx, logs, err };
                    break;
                }
            } catch (_) {
                // Continue trying next index
            }
        }

        if (found) {
            try { localStorage.setItem('FRT_WITHDRAW_DISC', String(found.index)); } catch (_) {}
            console.log(`✅ Detected WithdrawTreasuryFees discriminator index: ${found.index}`);
            return found.index;
        }
        console.warn('⚠️ Unable to detect WithdrawTreasuryFees discriminator index');
        return null;
    } catch (e) {
        console.error('❌ Detection failed:', e);
        return null;
    }
}

/**
 * Top up a pool PDA with lamports to satisfy rent-exempt + pending fee requirements
 * Workaround for consolidation fee consistency failures when available > rent is slightly below pending fees
 */
async function topUpPoolLamports(poolId, lamports) {
    try {
        if (!adminWallet) {
            throw new Error('Wallet not connected');
        }
        if (!validateSolanaAddress(poolId)) {
            throw new Error('Invalid pool ID format');
        }
        if (typeof lamports !== 'number' || lamports <= 0) {
            throw new Error('Lamports must be a positive number');
        }

        const toPubkey = new solanaWeb3.PublicKey(poolId);
        const ix = solanaWeb3.SystemProgram.transfer({
            fromPubkey: adminWallet,
            toPubkey,
            lamports
        });
        const signature = await createAndSendTransaction([ix]);
        console.log('✅ Pool top-up successful:', signature);
        return signature;
    } catch (e) {
        console.error('❌ Pool top-up failed:', e);
        throw e;
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
        
        // Check if trying to change to the same admin (this cancels pending changes)
        if (newAdminAddress === adminWallet.toString()) {
            console.log('🔄 Cancelling pending admin change by setting same admin address');
            // This is allowed - it cancels any pending admin change
        }
        
        console.log('👤 Executing admin change to:', newAdminAddress);
        console.log('🔍 Current admin wallet:', adminWallet.toString());
        console.log('🔍 New admin address:', newAdminAddress);
        
        // Verify that the connected wallet matches the admin wallet
        const walletProvider = getWalletProvider();
        if (walletProvider && walletProvider.publicKey) {
            const connectedAddress = walletProvider.publicKey.toString();
            console.log('🔍 Connected wallet address:', connectedAddress);
            console.log('🔍 Admin wallet address:', adminWallet.toString());
            console.log('🔍 Addresses match:', connectedAddress === adminWallet.toString());
            
            if (connectedAddress !== adminWallet.toString()) {
                throw new Error(`Connected wallet (${connectedAddress}) does not match admin wallet (${adminWallet.toString()})`);
            }
        }
        
        const systemStatePDA = getSystemStatePDA();
        const programDataAccount = await getProgramDataAccount();
        const newAdminPubkey = new solanaWeb3.PublicKey(newAdminAddress);
        
        console.log('🔍 System State PDA:', systemStatePDA.toString());
        console.log('🔍 Program Data Account:', programDataAccount.toString());
        
        // Create instruction data: discriminator (1 byte) + new_admin (32 bytes)
        const instructionData = new Uint8Array(33);
        instructionData[0] = 24; // Discriminator for process_admin_change
        instructionData.set(newAdminPubkey.toBytes(), 1); // New admin address
        
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
        
        // Try a different approach - create transaction manually
        console.log('🔍 Creating transaction manually...');
        
        const { blockhash } = await adminConnection.getLatestBlockhash();
        const transaction = new solanaWeb3.Transaction();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = adminWallet;
        transaction.add(instruction);
        
        console.log('🔍 Transaction created, fee payer:', transaction.feePayer.toString());
        console.log('🔍 Transaction instructions:', transaction.instructions.length);
        
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
 * Validate pool state account
 */
async function validatePoolStateAccount(poolId) {
    try {
        console.log('🔍 DEBUG: validatePoolStateAccount called with:', poolId);
        if (!validateSolanaAddress(poolId)) {
            throw new Error('Invalid pool ID format');
        }
        
        const poolStatePDA = new solanaWeb3.PublicKey(poolId);
        console.log('🔍 Validating pool state account:', poolId);
        
        const poolAccountInfo = await adminConnection.getAccountInfo(poolStatePDA);
        
        if (!poolAccountInfo) {
            throw new Error(`Pool state account does not exist: ${poolId}`);
        }
        
        if (!poolAccountInfo.owner.equals(new solanaWeb3.PublicKey(window.CONFIG.programId))) {
            throw new Error(`Pool state account is not owned by our program. Owner: ${poolAccountInfo.owner.toString()}, Expected: ${window.CONFIG.programId}`);
        }
        
        console.log('✅ Pool state account validation passed');
        console.log('🔍 Account size:', poolAccountInfo.data.length, 'bytes');
        console.log('🔍 Account owner:', poolAccountInfo.owner.toString());
        
        return {
            accountInfo: poolAccountInfo,
            poolStatePDA: poolStatePDA
        };
        
    } catch (error) {
        console.error('❌ Pool state account validation failed:', error);
        throw error;
    }
}

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
        console.log('🔍 DEBUG: Starting pool pause with validation...');
        
        const systemStatePDA = getSystemStatePDA();
        console.log('🔍 DEBUG: System state PDA:', systemStatePDA.toString());
        
        // Validate system state PDA
        console.log('🔍 DEBUG: Validating system state PDA...');
        const systemAccountInfo = await adminConnection.getAccountInfo(systemStatePDA);
        if (!systemAccountInfo) {
            throw new Error(`System state account does not exist: ${systemStatePDA.toString()}`);
        }
        console.log('🔍 DEBUG: System state account exists, size:', systemAccountInfo.data.length, 'bytes');
        
        // Validate that the pool state account exists and is owned by our program
        console.log('🔍 DEBUG: About to validate pool state account...');
        const { poolStatePDA } = await validatePoolStateAccount(poolId);
        console.log('🔍 DEBUG: Pool state PDA validated:', poolStatePDA.toString());
        
        // Create instruction data: discriminator (1 byte) + pause_flags (1 byte) + pool_id (32 bytes)
        // According to API: PausePool { pause_flags: u8, pool_id: Pubkey }
        const pauseFlags = 3; // PAUSE_FLAG_ALL - pause all operations
        const instructionData = new Uint8Array(1 + 1 + 32); // 34 bytes total
        instructionData[0] = 19; // PausePool discriminator
        instructionData[1] = pauseFlags; // pause_flags
        
        // Copy pool_id bytes (32 bytes)
        poolStatePDA.toBytes().forEach((byte, index) => {
            instructionData[2 + index] = byte;
        });
        console.log('🔍 DEBUG: Instruction data:', Array.from(instructionData));
        console.log('🔍 DEBUG: Using discriminator 19 for PausePool with pause_flags:', pauseFlags);
        
        // Use the correct account structure from source code: Pool State PDA is writable
        const programDataAccount = await getProgramDataAccount();
        
        const instruction = new solanaWeb3.TransactionInstruction({
            keys: [
                { pubkey: adminWallet, isSigner: true, isWritable: true },           // [0] Admin Authority Signer
                { pubkey: systemStatePDA, isSigner: false, isWritable: true },      // [1] System State PDA (writable per API)
                { pubkey: poolStatePDA, isSigner: false, isWritable: true },        // [2] Pool State PDA (WRITABLE - updated by program)
                { pubkey: programDataAccount, isSigner: false, isWritable: false }  // [3] Program Data Account
            ],
            programId: new solanaWeb3.PublicKey(window.CONFIG.programId),
            data: instructionData,
        });
        
        console.log('🔍 Pool pause instruction created with accounts:');
        console.log('  - Admin wallet (signer):', adminWallet.toString());
        console.log('  - System state PDA:', systemStatePDA.toString());
        console.log('  - Pool state PDA:', poolStatePDA.toString());
        
        const signature = await createAndSendTransaction([instruction]);
        console.log('✅ Pool pause executed successfully:', signature);
        return signature;
        
    } catch (error) {
        console.error('❌ Pool pause failed:', error);
        
        // Provide more helpful error messages
        if (error.message.includes('Pool state account does not exist')) {
            throw new Error(`Pool not found: ${poolId}. Please verify this is a valid pool state PDA address.`);
        } else if (error.message.includes('not owned by our program')) {
            throw new Error(`Invalid pool account: ${poolId}. This account is not owned by the Fixed Ratio Trading program.`);
        } else if (error.message.includes('Failed to serialize or deserialize account data')) {
            throw new Error(`Account data corruption: ${poolId}. The pool state account data is invalid or corrupted.`);
        } else if (error.message.includes('Unauthorized')) {
            throw new Error('Pool pause requires Admin Authority. Your wallet does not have the required permissions.');
        }
        
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
        
        // Validate that the pool state account exists and is owned by our program
        const { poolStatePDA } = await validatePoolStateAccount(poolId);
        
        // Create instruction data: discriminator (1 byte) + unpause_flags (1 byte) + pool_id (32 bytes)
        // According to API: UnpausePool { unpause_flags: u8, pool_id: Pubkey }
        const unpauseFlags = 3; // PAUSE_FLAG_ALL - unpause all operations
        const instructionData = new Uint8Array(1 + 1 + 32); // 34 bytes total
        instructionData[0] = 20; // UnpausePool discriminator
        instructionData[1] = unpauseFlags; // unpause_flags
        
        // Copy pool_id bytes (32 bytes)
        poolStatePDA.toBytes().forEach((byte, index) => {
            instructionData[2 + index] = byte;
        });
        console.log('🔍 DEBUG: Instruction data:', Array.from(instructionData));
        console.log('🔍 DEBUG: Using discriminator 20 for UnpausePool with unpause_flags:', unpauseFlags);
        
        // Use the correct account structure from source code: Pool State PDA is writable
        const programDataAccount = await getProgramDataAccount();
        
        const instruction = new solanaWeb3.TransactionInstruction({
            keys: [
                { pubkey: adminWallet, isSigner: true, isWritable: true },           // [0] Admin Authority Signer
                { pubkey: systemStatePDA, isSigner: false, isWritable: true },      // [1] System State PDA (writable per API)
                { pubkey: poolStatePDA, isSigner: false, isWritable: true },        // [2] Pool State PDA (WRITABLE - updated by program)
                { pubkey: programDataAccount, isSigner: false, isWritable: false }  // [3] Program Data Account
            ],
            programId: new solanaWeb3.PublicKey(window.CONFIG.programId),
            data: instructionData,
        });
        
        console.log('🔍 Pool unpause instruction created with accounts:');
        console.log('  - Admin wallet (signer):', adminWallet.toString());
        console.log('  - System state PDA:', systemStatePDA.toString());
        console.log('  - Pool state PDA:', poolStatePDA.toString());
        
        const signature = await createAndSendTransaction([instruction]);
        console.log('✅ Pool unpause executed successfully:', signature);
        return signature;
        
    } catch (error) {
        console.error('❌ Pool unpause failed:', error);
        
        // Provide more helpful error messages
        if (error.message.includes('Pool state account does not exist')) {
            throw new Error(`Pool not found: ${poolId}. Please verify this is a valid pool state PDA address.`);
        } else if (error.message.includes('not owned by our program')) {
            throw new Error(`Invalid pool account: ${poolId}. This account is not owned by the Fixed Ratio Trading program.`);
        } else if (error.message.includes('Failed to serialize or deserialize account data')) {
            throw new Error(`Account data corruption: ${poolId}. The pool state account data is invalid or corrupted.`);
        } else if (error.message.includes('Unauthorized')) {
            throw new Error('Pool unpause requires Admin Authority. Your wallet does not have the required permissions.');
        }
        
        throw error;
    }
}

/**
 * Execute pool fee update
 */
async function executePoolUpdateFees(poolId, updateFlags = 3, liquidityFeeLamports = null, swapFeeLamports = null) {
    try {
        if (!adminWallet) {
            throw new Error('Wallet not connected');
        }
        
        if (!validateSolanaAddress(poolId)) {
            throw new Error('Invalid pool ID format');
        }
        
        // Validate flags and fee values
        if (typeof updateFlags !== 'number' || updateFlags < 1 || updateFlags > 3) {
            throw new Error('Invalid fee update flags. Use 1(liquidity), 2(swap), or 3(both).');
        }
        if ((updateFlags & 1) && (typeof liquidityFeeLamports !== 'number' || liquidityFeeLamports < 0)) {
            throw new Error('Invalid liquidity fee (lamports)');
        }
        if ((updateFlags & 2) && (typeof swapFeeLamports !== 'number' || swapFeeLamports < 0)) {
            throw new Error('Invalid swap fee (lamports)');
        }
        
        console.log('💰 Executing pool fee update for:', poolId, 'flags:', updateFlags, 'liquidityFeeLamports:', liquidityFeeLamports, 'swapFeeLamports:', swapFeeLamports);
        
        const systemStatePDA = getSystemStatePDA();
        const poolStatePDA = new solanaWeb3.PublicKey(poolId);
        
        // Create instruction data per API: discriminator (22) + flags (u8) + liquidity_fee (u64) + swap_fee (u64) + pool_id (32)
        const instructionData = new Uint8Array(1 + 1 + 8 + 8 + 32); // 50 bytes total
        instructionData[0] = 22; // UpdatePoolFees
        instructionData[1] = updateFlags & 0x03; // update_flags
        const view = new DataView(instructionData.buffer);
        // new_liquidity_fee (u64 little-endian) at byte offset 2
        const liquidity = BigInt((updateFlags & 1) ? liquidityFeeLamports : 0);
        view.setBigUint64(2, liquidity, true);
        // new_swap_fee (u64 little-endian) at byte offset 10
        const swap = BigInt((updateFlags & 2) ? swapFeeLamports : 0);
        view.setBigUint64(10, swap, true);
        // pool_id (32 bytes) at byte offset 18
        poolStatePDA.toBytes().forEach((byte, index) => {
            instructionData[18 + index] = byte;
        });
        
        const instruction = new solanaWeb3.TransactionInstruction({
            keys: [
                { pubkey: adminWallet, isSigner: true, isWritable: true },
                { pubkey: systemStatePDA, isSigner: false, isWritable: false },
                { pubkey: poolStatePDA, isSigner: false, isWritable: true },
                { pubkey: await getProgramDataAccount(), isSigner: false, isWritable: false }
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
async function executeSwapSetOwnerOnly(poolId, ownerOnly = true, designatedOwner = null) {
    try {
        if (!adminWallet) {
            throw new Error('Wallet not connected');
        }
        
        if (!validateSolanaAddress(poolId)) {
            throw new Error('Invalid pool ID format');
        }
        
        // If enabling owner-only mode, designated owner is required
        if (ownerOnly && !designatedOwner) {
            throw new Error('Designated owner address is required when enabling owner-only mode');
        }
        
        // If designated owner is provided, validate it
        if (designatedOwner && !validateSolanaAddress(designatedOwner)) {
            throw new Error('Invalid designated owner address format');
        }
        
        console.log('🔒 Executing swap set owner only for:', poolId, 'to', ownerOnly, 'with designated owner:', designatedOwner);

        // Preflight: ensure system is initialized
        const isInitialized = await checkSystemInitialized();
        if (!isInitialized) {
            throw new Error('System not initialized. Please initialize the program first.');
        }
        
        const systemStatePDA = getSystemStatePDA();
        // Validate that the pool state account exists and is owned by our program
        const { poolStatePDA, accountInfo: poolAccountInfo } = await validatePoolStateAccount(poolId);

        // v0.16.x+ tolerates size variations; do not hard-fail on legacy sizes
        
        // Create instruction data per API: discriminator + enable_restriction + designated_owner + pool_id
        // Layout: [21, enable_restriction:u8, designated_owner:Pubkey, pool_id:Pubkey]
        const instructionData = new Uint8Array(1 + 1 + 32 + 32); // 66 bytes total
        instructionData[0] = 21; // SetSwapOwnerOnly
        
        // enable_restriction (1 byte)
        instructionData[1] = ownerOnly ? 1 : 0;
        
        // designated_owner (32 bytes)
        if (designatedOwner) {
            const designatedOwnerBytes = new solanaWeb3.PublicKey(designatedOwner).toBuffer();
            instructionData.set(designatedOwnerBytes, 2);
        } else {
            // For disable, we can use a zero address or the current admin wallet
            const zeroAddress = new solanaWeb3.PublicKey('11111111111111111111111111111111').toBuffer();
            instructionData.set(zeroAddress, 2);
        }
        
        // pool_id (32 bytes) at offset 34
        poolStatePDA.toBytes().forEach((byte, index) => {
            instructionData[34 + index] = byte;
        });
        
        const instruction = new solanaWeb3.TransactionInstruction({
            keys: [
                { pubkey: adminWallet, isSigner: true, isWritable: true },
                { pubkey: systemStatePDA, isSigner: false, isWritable: false },
                { pubkey: poolStatePDA, isSigner: false, isWritable: true },
                { pubkey: await getProgramDataAccount(), isSigner: false, isWritable: false }
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
        
        // Create instruction data: discriminator (1 byte) - GetTreasuryInfo = 16
        const instructionData = new Uint8Array([16]);
        
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
        const systemStatePDA = getSystemStatePDA();
        const programDataAccount = await getProgramDataAccount();

        // Convert SOL amount (UI input) to lamports (u64). 0 = withdraw all available
        let amountLamports = 0n;
        if (amount !== null) {
            const lamports = Math.round(Number(amount) * 1_000_000_000);
            if (!Number.isFinite(lamports) || lamports < 0) {
                throw new Error('Invalid withdrawal amount');
            }
            amountLamports = BigInt(lamports);
        }

        // Build instruction data using proper Borsh serialization for PoolInstruction::WithdrawTreasuryFees
        // The API docs specify this must be Borsh-serialized enum variant, not raw bytes
        // Use cached discriminator if detected; fallback to 15
        // Format: [discriminator: u8, amount: u64] = 9 bytes total
        const instructionData = new Uint8Array(9);
        let withdrawDiscExec = 15;
        try {
            const cached = localStorage.getItem('FRT_WITHDRAW_DISC');
            if (cached) {
                const n = Number.parseInt(cached, 10);
                if (Number.isFinite(n) && n >= 0 && n < 256) withdrawDiscExec = n;
            }
        } catch (_) {}
        instructionData[0] = withdrawDiscExec;
        // Amount as u64 little-endian (8 bytes)
        const amountView = new DataView(instructionData.buffer, 1, 8);
        amountView.setBigUint64(0, amountLamports, true);

        // Resolve Rent Sysvar
        let rentSysvar = solanaWeb3.SYSVAR_RENT_PUBKEY;
        if (!rentSysvar) {
            rentSysvar = new solanaWeb3.PublicKey('SysvarRent111111111111111111111111111111111');
        }

        // Destination = admin wallet by default
        const destinationAccount = adminWallet;

        const instruction = new solanaWeb3.TransactionInstruction({
            keys: [
                // [0] System Authority (Signer, Readonly) - program reads authority, no need to write
                { pubkey: adminWallet, isSigner: true, isWritable: false },
                // [1] Main Treasury PDA (writable)
                { pubkey: mainTreasuryPDA, isSigner: false, isWritable: true },
                // [2] Rent Sysvar (read-only)
                { pubkey: rentSysvar, isSigner: false, isWritable: false },
                // [3] Destination account (writable)
                { pubkey: destinationAccount, isSigner: false, isWritable: true },
                // [4] System State PDA (read-only)
                { pubkey: systemStatePDA, isSigner: false, isWritable: false },
                // [5] Program Data Account (read-only)
                { pubkey: programDataAccount, isSigner: false, isWritable: false },
            ],
            programId: new solanaWeb3.PublicKey(window.CONFIG.programId),
            data: instructionData,
        });

        // Preflight: simulate to avoid sending failing tx during penalty/rate limit
        try {
            const pre = await simulateTreasuryWithdrawFees(amount ?? 0.0);
            const analysis = analyzeTreasuryWithdrawalLogs(pre.logs);
            if (analysis.blocked) {
                const secs = analysis.secondsRemaining ?? null;
                const reason = analysis.reason === 'restart_penalty' ? 'System restart penalty active' : 'Withdrawal rate limit active';
                const msg = secs !== null ? `${reason}. Try again in ~${Math.ceil(secs/60)} minutes.` : reason;
                throw new Error(msg);
            }
        } catch (preErr) {
            // If simulation itself fails due to RPC args etc., continue; otherwise rethrow informative preflight errors
            if (preErr && /penalty|rate limit/i.test(preErr.message || '')) {
                throw preErr;
            }
        }

        try {
            const signature = await createAndSendTransaction([instruction]);
            console.log('✅ Treasury fee withdrawal executed successfully:', signature);
            return signature;
        } catch (sendErr) {
            const msg = (sendErr?.message || String(sendErr)).toLowerCase();
            const isInvalidData = msg.includes('invalid instruction data');
            if (!isInvalidData) {
                throw sendErr;
            }
            console.warn('⚠️ Invalid instruction data on withdraw. Checking logs for rate limits/penalty...');
            try {
                const pre = await simulateTreasuryWithdrawFees(amount ?? 0.0);
                const analysis = analyzeTreasuryWithdrawalLogs(pre.logs);
                if (analysis.blocked) {
                    const secs = analysis.secondsRemaining ?? null;
                    const reason = analysis.reason === 'restart_penalty' ? 'System restart penalty active' : 'Withdrawal rate limit active';
                    const msg = secs !== null ? `${reason}. Try again in ~${Math.ceil(secs/60)} minutes.` : reason;
                    throw new Error(msg);
                }
            } catch (_) {}

            console.warn('⚠️ Falling back to discriminator auto-detect via simulation...');
            const detected = await bruteForceDetectWithdrawDiscriminator(amount ?? 0.0);
            if (typeof detected === 'number') {
                try { localStorage.setItem('FRT_WITHDRAW_DISC', String(detected)); } catch (_) {}
                // Rebuild instruction with detected discriminator
                const retryData = new Uint8Array(9);
                retryData[0] = detected;
                new DataView(retryData.buffer, 1, 8).setBigUint64(0, amountLamports, true);
                const retryIx = new solanaWeb3.TransactionInstruction({
                    keys: [
                        { pubkey: adminWallet, isSigner: true, isWritable: false },
                        { pubkey: mainTreasuryPDA, isSigner: false, isWritable: true },
                        { pubkey: rentSysvar, isSigner: false, isWritable: false },
                        { pubkey: destinationAccount, isSigner: false, isWritable: true },
                        { pubkey: systemStatePDA, isSigner: false, isWritable: false },
                        { pubkey: programDataAccount, isSigner: false, isWritable: false },
                    ],
                    programId: new solanaWeb3.PublicKey(window.CONFIG.programId),
                    data: retryData,
                });
                console.log(`🔁 Retrying withdraw with detected discriminator ${detected}...`);
                const retrySig = await createAndSendTransaction([retryIx]);
                console.log('✅ Treasury fee withdrawal executed successfully (retry):', retrySig);
                return retrySig;
            }
            throw sendErr;
        }
        
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
        
        const systemStatePDA = getSystemStatePDA();
        const mainTreasuryPDA = getMainTreasuryPDA();
        const programDataAccount = await getProgramDataAccount();
        const poolStatePDA = new solanaWeb3.PublicKey(poolId);

        // Instruction data: [17, pool_count:u8] – single pool consolidation
        const instructionData = new Uint8Array(2);
        instructionData[0] = 17; // ConsolidatePoolFees discriminator (per dashboard integration)
        instructionData[1] = 1;  // pool_count = 1

        const instruction = new solanaWeb3.TransactionInstruction({
            keys: [
                // [0] Admin authority signer (read-only signer)
                { pubkey: adminWallet, isSigner: true, isWritable: false },
                // [1] System State PDA (read-only)
                { pubkey: systemStatePDA, isSigner: false, isWritable: false },
                // [2] Main Treasury PDA (writable)
                { pubkey: mainTreasuryPDA, isSigner: false, isWritable: true },
                // [3] Program Data Account (read-only)
                { pubkey: programDataAccount, isSigner: false, isWritable: false },
                // [4] Pool State PDA (writable)
                { pubkey: poolStatePDA, isSigner: false, isWritable: true },
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

/**
 * Get pool information for debugging
 */
async function getPoolDebugInfo(poolId) {
    try {
        console.log('🔍 Getting debug info for pool:', poolId);
        
        const poolStatePDA = new solanaWeb3.PublicKey(poolId);
        const accountInfo = await adminConnection.getAccountInfo(poolStatePDA);
        
        if (!accountInfo) {
            return {
                exists: false,
                error: 'Account does not exist'
            };
        }
        
        return {
            exists: true,
            address: poolId,
            owner: accountInfo.owner.toString(),
            isOwnedByProgram: accountInfo.owner.equals(new solanaWeb3.PublicKey(window.CONFIG.programId)),
            dataLength: accountInfo.data.length,
            executable: accountInfo.executable,
            rentEpoch: accountInfo.rentEpoch,
            lamports: accountInfo.lamports
        };
        
    } catch (error) {
        console.error('❌ Failed to get pool debug info:', error);
        return {
            exists: false,
            error: error.message
        };
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
        validatePoolStateAccount,
        executePoolPause,
        executePoolUnpause,
        executePoolUpdateFees,
        executeSwapSetOwnerOnly,
        // Treasury functions
        getTreasuryInfo,
        executeTreasuryWithdrawFees,
        executeConsolidatePoolFees,
        discoverAllPools,
        getPoolDebugInfo,
        simulateTreasuryWithdrawFees,
        simulateConsolidatePoolFees,
        topUpPoolLamports,
        bruteForceDetectWithdrawDiscriminator,
        getWithdrawalStatus,
        // Status functions
        checkSystemPauseStatus,
        checkSystemInitialized
    };
}
