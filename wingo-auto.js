/* ========= AUTO-BET INTEGRATION v3 - WINGO OPTIMIZED ========= */
(function() {
    console.log("🤖 AUTO-BET INTEGRATION v3 - Optimized for WinGo");
    
    let isAutoBetActive = false;
    let autoBetInterval = null;
    let lastAutoBetPrediction = null;
    let lastAutoBetAmount = 0;
    
    // Selector khusus untuk WinGo
    const WINGO_SELECTORS = {
        BET_AREA: [
            '.Betting__C-foot',
            '.betting-panel',
            '.game-betting',
            '.bet-controls',
            'div[class*="betting"]',
            'div[class*="Betting"]'
        ],
        BET_BIG: [
            '.Betting__C-foot-b',
            '.bet-big-btn',
            'button.big',
            'button:contains("BESAR")',
            '[data-type="big"]',
            '.btn-big'
        ],
        BET_SMALL: [
            '.Betting__C-foot-s',
            '.bet-small-btn',
            'button.small',
            'button:contains("KECIL")',
            '[data-type="small"]',
            '.btn-small'
        ],
        AMOUNT_INPUT: [
            'input[type="number"]',
            '.amount-input',
            '.bet-value',
            '.input-money',
            'input.bet-amount'
        ],
        CONFIRM_BUTTONS: [
            '.confirm-btn',
            '.bet-confirm',
            'button:contains("Konfirmasi")',
            'button:contains("Confirm")',
            'button:contains("OK")',
            '.submit-bet'
        ]
    };
    
    // ========= FUNGSI UTAMA =========
    window.startAutoBet = function() {
        if (isAutoBetActive) {
            console.log("⚠️ Auto-bet sudah aktif");
            return;
        }
        
        if (!window.wingoBetData) {
            console.log("❌ Bot belum diinisialisasi, jalankan real55.js terlebih dahulu");
            return;
        }
        
        isAutoBetActive = true;
        console.log("✅ Auto-bet diaktifkan - WinGo Optimized");
        
        // Cek setiap 1.5 detik (lebih responsif)
        autoBetInterval = setInterval(() => {
            performAutoBet();
        }, 1500);
        
        // Initial check
        setTimeout(performAutoBet, 800);
    };
    
    window.stopAutoBet = function() {
        if (!isAutoBetActive) {
            console.log("⚠️ Auto-bet sudah tidak aktif");
            return;
        }
        
        isAutoBetActive = false;
        if (autoBetInterval) {
            clearInterval(autoBetInterval);
            autoBetInterval = null;
        }
        
        console.log("⏹️ Auto-bet dihentikan");
        removeHighlights();
    };
    
    async function performAutoBet() {
        if (!isAutoBetActive) return;
        
        // 1. Validasi koneksi bot
        if (!window.wingoBetData) {
            console.log("⏳ Menunggu bot...");
            return;
        }
        
        // 2. Cek apakah bot sedang menempatkan bet
        if (window.wingoBetData.status?.isBetPlaced) {
            return;
        }
        
        // 3. Ambil data prediksi
        const currentPrediction = window.wingoBetData.prediction;
        const currentAmount = window.wingoBetData.amount;
        
        if (!currentPrediction || !currentAmount) {
            return;
        }
        
        // 4. Cek apakah ada perubahan
        const isNewBet = currentPrediction !== lastAutoBetPrediction || 
                        currentAmount !== lastAutoBetAmount;
        
        if (!isNewBet) {
            return;
        }
        
        console.log(`\n🎯 PREDIKSI BARU: ${currentPrediction} (Rp ${currentAmount.toLocaleString()})`);
        
        // 5. Cek saldo
        if (!checkBalance()) {
            window.stopAutoBet();
            return;
        }
        
        // 6. Atur jumlah bet
        if (!await setBetAmount(currentAmount)) {
            console.log("⚠️ Gagal mengatur jumlah bet");
            return;
        }
        
        // 7. Tunggu UI update
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // 8. Klik tombol bet
        const targetButton = findBetButton(currentPrediction);
        if (targetButton && !targetButton.disabled) {
            console.log(`✅ Klik ${currentPrediction}`);
            simulateClick(targetButton);
            
            // Update last bet
            lastAutoBetPrediction = currentPrediction;
            lastAutoBetAmount = currentAmount;
            
            // 9. Highlight konfirmasi
            setTimeout(() => {
                highlightConfirmButtons();
                showNotification(currentPrediction, currentAmount);
            }, 800);
        } else {
            console.log(`❌ Tombol ${currentPrediction} tidak ditemukan atau disabled`);
        }
    }
    
    // ========= FUNGSI HELPER =========
    function findBetButton(prediction) {
        const selectors = prediction === 'BESAR' ? WINGO_SELECTORS.BET_BIG : WINGO_SELECTORS.BET_SMALL;
        
        // Cari berdasarkan selector
        for (const selector of selectors) {
            try {
                const button = document.querySelector(selector);
                if (button && button.offsetParent !== null) {
                    console.log(`🔍 Tombol ditemukan: ${selector}`);
                    return button;
                }
            } catch (e) {}
        }
        
        // Fallback: Cari berdasarkan teks
        const allButtons = document.querySelectorAll('button, [role="button"], .btn');
        for (const button of allButtons) {
            const text = (button.textContent || button.innerText || '').toUpperCase();
            if (prediction === 'BESAR' && text.includes('BESAR')) {
                return button;
            }
            if (prediction === 'KECIL' && text.includes('KECIL')) {
                return button;
            }
        }
        
        return null;
    }
    
    async function setBetAmount(amount) {
        for (const selector of WINGO_SELECTORS.AMOUNT_INPUT) {
            const input = document.querySelector(selector);
            if (input) {
                input.value = amount;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                
                console.log(`💰 Bet amount set: Rp ${amount.toLocaleString()}`);
                return true;
            }
        }
        return false;
    }
    
    function checkBalance() {
        if (!window.wingoBetData) return false;
        
        const balance = window.wingoBetData.balance || 0;
        const betAmount = window.wingoBetData.amount || 0;
        
        if (balance < betAmount) {
            console.log(`❌ SALDO TIDAK CUKUP: ${balance.toLocaleString()} < ${betAmount.toLocaleString()}`);
            return false;
        }
        return true;
    }
    
    function simulateClick(element) {
        if (!element) return;
        
        try {
            // Method 1: Native click
            element.click();
            
            // Method 2: Mouse events
            const events = ['mousedown', 'mouseup', 'click'];
            events.forEach(eventType => {
                element.dispatchEvent(new MouseEvent(eventType, {
                    view: window,
                    bubbles: true,
                    cancelable: true
                }));
            });
            
            // Method 3: Touch events (untuk mobile)
            element.dispatchEvent(new TouchEvent('touchend', {
                bubbles: true,
                cancelable: true
            }));
            
            return true;
        } catch (error) {
            console.error("❌ Click error:", error);
            return false;
        }
    }
    
    function highlightConfirmButtons() {
        for (const selector of WINGO_SELECTORS.CONFIRM_BUTTONS) {
            const buttons = document.querySelectorAll(selector);
            buttons.forEach(btn => {
                if (btn.offsetParent !== null) {
                    btn.style.cssText = `
                        border: 4px solid #00FF00 !important;
                        box-shadow: 0 0 30px #00FF00 !important;
                        background: linear-gradient(45deg, #003300, #00AA00) !important;
                        color: white !important;
                        font-weight: bold !important;
                        font-size: 16px !important;
                        animation: pulse 1s infinite !important;
                        position: relative !important;
                        z-index: 9999 !important;
                        transform: scale(1.05) !important;
                    `;
                    
                    // Add tooltip
                    btn.setAttribute('title', 'KLIK UNTUK KONFIRMASI BET!');
                    
                    console.log("🎯 TOMBOL KONFIRMASI DISOROT!");
                }
            });
        }
        
        // Add pulse animation
        if (!document.getElementById('auto-bet-pulse')) {
            const style = document.createElement('style');
            style.id = 'auto-bet-pulse';
            style.textContent = `
                @keyframes pulse {
                    0% { box-shadow: 0 0 10px #00FF00; }
                    50% { box-shadow: 0 0 40px #00FF00; }
                    100% { box-shadow: 0 0 10px #00FF00; }
                }
            `;
            document.head.appendChild(style);
        }
    }
    
    function showNotification(prediction, amount) {
        // Create notification div
        let notif = document.getElementById('auto-bet-notification');
        if (!notif) {
            notif = document.createElement('div');
            notif.id = 'auto-bet-notification';
            notif.style.cssText = `
                position: fixed;
                top: 10px;
                right: 10px;
                background: #1a1a1a;
                color: #00FF00;
                padding: 15px;
                border: 3px solid #00FF00;
                border-radius: 10px;
                z-index: 10000;
                font-family: monospace;
                font-size: 14px;
                box-shadow: 0 0 20px #00FF00;
                max-width: 300px;
            `;
            document.body.appendChild(notif);
        }
        
        const time = new Date().toLocaleTimeString();
        notif.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 5px;">🤖 AUTO-BET ACTIVE</div>
            <div>Prediction: <b>${prediction}</b></div>
            <div>Amount: <b>Rp ${amount.toLocaleString()}</b></div>
            <div>Time: ${time}</div>
            <div style="font-size: 12px; color: #aaa; margin-top: 5px;">
                Click highlighted button to confirm!
            </div>
        `;
        
        // Auto remove after 10 seconds
        setTimeout(() => {
            if (notif && notif.parentNode) {
                notif.parentNode.removeChild(notif);
            }
        }, 10000);
    }
    
    function removeHighlights() {
        // Remove button highlights
        document.querySelectorAll('button, .btn').forEach(btn => {
            btn.style.cssText = '';
        });
        
        // Remove notification
        const notif = document.getElementById('auto-bet-notification');
        if (notif && notif.parentNode) {
            notif.parentNode.removeChild(notif);
        }
    }
    
    // ========= DEBUG & TEST FUNCTIONS =========
    window.testAutoBet = function(prediction = 'BESAR') {
        console.log(`🧪 Testing auto-bet: ${prediction}`);
        
        const button = findBetButton(prediction);
        if (button) {
            simulateClick(button);
            highlightConfirmButtons();
            console.log(`✅ Test ${prediction} successful`);
        } else {
            console.log(`❌ Tombol ${prediction} tidak ditemukan`);
            console.log("🔍 Available buttons on page:");
            document.querySelectorAll('button').forEach((btn, i) => {
                console.log(`${i+1}. ${btn.className} - "${btn.textContent}"`);
            });
        }
    };
    
    window.scanBettingElements = function() {
        console.log("🔍 Scanning betting elements...");
        
        WINGO_SELECTORS.BET_AREA.forEach(selector => {
            const element = document.querySelector(selector);
            if (element) {
                console.log(`✅ Found: ${selector}`);
                console.log(`   Children: ${element.children.length}`);
            }
        });
        
        console.log("\n🔍 All buttons on page:");
        document.querySelectorAll('button').forEach((btn, i) => {
            console.log(`${i+1}. Class: ${btn.className}, Text: "${btn.textContent.trim()}"`);
        });
    };
    
    // ========= INTEGRASI DENGAN BOT =========
    if (window.wingoBot) {
        window.wingoBot.autoBet = {
            start: window.startAutoBet,
            stop: window.stopAutoBet,
            test: window.testAutoBet,
            scan: window.scanBettingElements
        };
    }
    
    // ========= AUTO-START DETECTION =========
    // Coba mulai auto-bet jika bot sudah ready
    setTimeout(() => {
        if (window.wingoBetData && window.wingoBetData.prediction) {
            console.log("🤖 Bot detected, auto-bet ready to start");
            console.log("📊 Use: startAutoBet() to begin");
        } else {
            console.log("⏳ Waiting for bot initialization...");
        }
    }, 5000);
    
    console.log("✅ WinGo Auto-Bet v3 Loaded!");
    console.log("🛠️ Commands:");
    console.log("   startAutoBet()       - Start auto-betting");
    console.log("   stopAutoBet()        - Stop auto-betting");
    console.log("   testAutoBet('BESAR') - Test click BESAR button");
    console.log("   testAutoBet('KECIL') - Test click KECIL button");
    console.log("   scanBettingElements()- Scan for betting elements");
})();
