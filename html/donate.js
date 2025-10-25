/**
 * Fixed Ratio Trading - Donation Handler
 * Implements process_treasury_donate_sol functionality
 */

let connection;
let wallet;

// Initialize donation system
async function initializeDonation() {
    try {
        // Wait for config to load
        while (!window.TRADING_CONFIG) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Initialize Solana connection
        connection = new solanaWeb3.Connection(
            window.TRADING_CONFIG.rpcUrl,
            { commitment: window.TRADING_CONFIG.commitment }
        );

        // Check for wallet
        await checkWallet();
        
        console.log('✅ Donation system initialized');
    } catch (error) {
        console.error('❌ Failed to initialize donation system:', error);
        showStatus('Failed to initialize donation system. Please refresh the page.', 'error');
    }
}

// Check wallet connection
async function checkWallet() {
    try {
        if (window.solana && window.solana.isPhantom) {
            wallet = window.solana;
            console.log('✅ Phantom wallet detected');
        } else if (window.backpack) {
            wallet = window.backpack;
            console.log('✅ Backpack wallet detected');
        } else {
            throw new Error('No supported wallet found. Please install Phantom or Backpack wallet.');
        }
    } catch (error) {
        console.error('❌ Wallet check failed:', error);
        throw error;
    }
}

// Connect to wallet
async function connectWallet() {
    try {
        if (!wallet) {
            throw new Error('No wallet detected');
        }

        const response = await wallet.connect();
        console.log('✅ Wallet connected:', response.publicKey.toString());
        return response.publicKey;
    } catch (error) {
        console.error('❌ Wallet connection failed:', error);
        throw new Error('Failed to connect wallet: ' + error.message);
    }
}

// Process donation using process_treasury_donate_sol
async function processDonation(amount, message) {
    try {
        showStatus('Connecting to wallet...', 'info');
        
        // Connect wallet
        const walletPublicKey = await connectWallet();
        
        showStatus('Preparing donation transaction...', 'info');
        
        // Convert SOL to lamports
        const lamports = Math.floor(amount * solanaWeb3.LAMPORTS_PER_SOL);
        
        // Validate minimum donation
        const MIN_DONATION_LAMPORTS = 0.1 * solanaWeb3.LAMPORTS_PER_SOL;
        if (lamports < MIN_DONATION_LAMPORTS) {
            throw new Error('Minimum donation is 0.1 SOL');
        }

        // Implement proper process_treasury_donate_sol instruction
        const programId = new solanaWeb3.PublicKey(window.TRADING_CONFIG.programId);
        
        // Derive PDAs using browser-compatible method (TextEncoder works in browser)
        const [systemStatePda] = solanaWeb3.PublicKey.findProgramAddressSync(
            [new TextEncoder().encode('system_state')],
            programId
        );
        
        const [mainTreasuryPda] = solanaWeb3.PublicKey.findProgramAddressSync(
            [new TextEncoder().encode('main_treasury')],
            programId
        );
        
        // Check if treasury system is initialized (critical prerequisite)
        showStatus('Checking treasury system initialization...', 'info');
        
        try {
            const systemStateAccount = await connection.getAccountInfo(systemStatePda);
            const mainTreasuryAccount = await connection.getAccountInfo(mainTreasuryPda);
            
            if (!systemStateAccount || !mainTreasuryAccount) {
                throw new Error('Treasury system not initialized. The program must be initialized first using InitializeProgram (discriminator 0) before donations can be made.');
            }
            
            console.log('✅ Treasury system is initialized');
        } catch (error) {
            console.error('❌ Treasury initialization check failed:', error);
            throw new Error('Treasury system initialization check failed: ' + error.message);
        }
        
        showStatus('Creating donation instruction...', 'info');
        
        // Create instruction data for DonateSol - using exact API documentation format
        const messageBytes = new TextEncoder().encode(message);
        const messageLength = new Uint8Array(new Uint32Array([messageBytes.length]).buffer);
        
        const instructionData = new Uint8Array([
            23,                                    // DonateSol discriminator
            ...new Uint8Array(new BigUint64Array([BigInt(lamports)]).buffer), // amount (u64 little-endian)
            ...messageLength,                      // message length (u32 little-endian)
            ...messageBytes                        // message UTF-8 bytes
        ]);
        
        // Create instruction with exact account structure from updated API documentation
        const instruction = new solanaWeb3.TransactionInstruction({
            keys: [
                { pubkey: walletPublicKey, isSigner: true, isWritable: true },        // [0] Donor Account
                { pubkey: mainTreasuryPda, isSigner: false, isWritable: true },       // [1] Main Treasury PDA
                { pubkey: systemStatePda, isSigner: false, isWritable: false },      // [2] System State PDA
                { pubkey: solanaWeb3.SystemProgram.programId, isSigner: false, isWritable: false } // [3] System Program
            ],
            programId: programId,
            data: instructionData
        });
        
        console.log('💝 Donation Details:', {
            amount: amount + ' SOL',
            message: message,
            systemStatePda: systemStatePda.toString(),
            mainTreasuryPda: mainTreasuryPda.toString(),
            instructionDataLength: instructionData.length
        });

        // Create transaction
        const transaction = new solanaWeb3.Transaction();
        
        // Get recent blockhash
        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = walletPublicKey;
        
        // Set compute budget to 500,000 CUs to cover all donation cases
        const computeUnits = 500000;
        
        console.log(`💻 Using ${computeUnits} compute units for ${amount} SOL donation`);
        
        // Add compute budget instruction
        const computeBudgetInstruction = solanaWeb3.ComputeBudgetProgram.setComputeUnitLimit({
            units: computeUnits
        });
        transaction.add(computeBudgetInstruction);
        
        // Add donation instruction
        transaction.add(instruction);

        // Simulate transaction before signing for debugging
        showStatus('Simulating transaction for debugging...', 'info');
        
        try {
            const simulationResult = await connection.simulateTransaction(transaction);
            if (simulationResult.value.err) {
                console.error('❌ Transaction simulation failed:', simulationResult.value.err);
                console.error('❌ Simulation logs:', simulationResult.value.logs);
                throw new Error('Transaction simulation failed: ' + JSON.stringify(simulationResult.value.err));
            }
            console.log('✅ Transaction simulation successful');
            console.log('📋 Simulation logs:', simulationResult.value.logs);
        } catch (simError) {
            console.error('❌ Simulation error:', simError);
            throw simError;
        }

        showStatus('Please approve the transaction in your wallet...', 'info');

        // Sign transaction
        const signedTransaction = await wallet.signTransaction(transaction);
        
        showStatus('Sending donation transaction...', 'info');
        
        const signature = await connection.sendRawTransaction(signedTransaction.serialize());
        
        showStatus('Confirming transaction...', 'info');
        
        // Confirm transaction with detailed error handling
        const confirmation = await connection.confirmTransaction(signature, 'confirmed');
        
        if (confirmation.value.err) {
            console.error('❌ Transaction confirmation error:', confirmation.value.err);
            throw new Error('Transaction failed: ' + JSON.stringify(confirmation.value.err));
        }

        showStatus(`✅ Donation successful! Thank you for supporting Fixed Ratio Trading development!\n\nTransaction: ${signature}\n\nAmount: ${amount} SOL\nMessage: "${message}"`, 'success');
        
        // Reset form
        document.getElementById('donationForm').reset();
        document.getElementById('donationMessage').value = 'This donation is to speed up development good job so far!';
        updateCharCounter();
        
        console.log('✅ Donation completed:', {
            signature,
            amount: amount + ' SOL',
            message,
            treasury: mainTreasuryPda.toString()
        });

    } catch (error) {
        console.error('❌ Donation failed:', error);
        showStatus('Donation failed: ' + error.message, 'error');
    }
}

// Show status message
function showStatus(message, type) {
    const statusContainer = document.getElementById('statusContainer');
    statusContainer.className = `status-container ${type}`;
    statusContainer.innerHTML = message.replace(/\n/g, '<br>');
    statusContainer.style.display = 'block';
    
    // Auto-hide after 10 seconds for success messages
    if (type === 'success') {
        setTimeout(() => {
            statusContainer.style.display = 'none';
        }, 10000);
    }
}

// Update character counter
function updateCharCounter() {
    const textarea = document.getElementById('donationMessage');
    const counter = document.getElementById('charCounter');
    const currentLength = textarea.value.length;
    const maxLength = 200;
    
    counter.textContent = `${currentLength}/${maxLength} characters`;
    
    if (currentLength > 180) {
        counter.className = 'char-counter error';
    } else if (currentLength > 150) {
        counter.className = 'char-counter warning';
    } else {
        counter.className = 'char-counter';
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeDonation();
    
    // Set up form handling
    const form = document.getElementById('donationForm');
    const messageTextarea = document.getElementById('donationMessage');
    
    // Handle form submission
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const amount = parseFloat(document.getElementById('donationAmount').value);
        const message = messageTextarea.value.trim();
        
        // Validation
        if (!amount || amount < 0.1) {
            showStatus('Please enter a donation amount of at least 0.1 SOL', 'error');
            return;
        }
        
        if (message.length > 200) {
            showStatus('Message must be 200 characters or less', 'error');
            return;
        }
        
        // Process donation
        await processDonation(amount, message);
    });
    
    // Handle message textarea
    messageTextarea.addEventListener('input', updateCharCounter);
    
    // Auto-select text when clicking on textarea
    messageTextarea.addEventListener('focus', function() {
        this.select();
    });
    
    // Initialize character counter
    updateCharCounter();
});
