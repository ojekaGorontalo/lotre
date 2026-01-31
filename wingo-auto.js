/* ========= AUTO-BET INTEGRATION v3 - WINGO OPTIMIZED (EXACT SELECTORS) ========= */
(function() {
    console.log("🤖 AUTO-BET INTEGRATION v3 - WinGo Exact Selectors");
    
    let isAutoBetActive = false;
    let autoBetInterval = null;
    let lastAutoBetPrediction = null;
    let lastAutoBetAmount = 0;
    
    // EXACT SELECTORS BERDASARKAN INFO ANDA
    const WINGO_SELECTORS = {
        // Tombol BESAR - EXACT berdasarkan informasi Anda
        BET_BIG: [
            '.Betting__C-foot-b',            // ✅ EXACT CLASS dari screenshot
            '.bet-big',                       // ✅ Alternatif 1
            '.big-btn',                       // ✅ Alternatif 2
            'button[data-type="big"]',        // ✅ Alternatif 3
            '[class*="besar"]',               // ✅ Class mengandung "besar"
            '[class*="big"]'                  // ✅ Class mengandung "big"
        ],
        
        // Tombol KECIL - EXACT berdasarkan informasi Anda  
        BET_SMALL: [
            '.Betting__C-foot-s',             // ✅ EXACT CLASS dari screenshot
            '.bet-small',                     // ✅ Alternatif 1
            '.small-btn',                     // ✅ Alternatif 2
            'button[data-type="small"]',      // ✅ Alternatif 3
            '[class*="kecil"]',               // ✅ Class mengandung "kecil"
            '[class*="small"]'                // ✅ Class mengandung "small"
        ],
        
        // Area betting
        BET_AREA: [
            '.Betting__C-foot',              // ✅ Area utama
            '.betting-area',
            '.bet-controls',
            'div[class*="betting"]'
        ],
        
        // Input jumlah
        AMOUNT_INPUT: [
            'input[type="number"]',
            '.amount-input',
            '.bet-amount',
            '.input-amount',
            'input.bet-value'
        ],
        
        // Tombol konfirmasi (TANPA :contains)
        CONFIRM_BUTTONS: [
            '.confirm-btn',
            '.submit-btn',
            '.bet-confirm',
            '.btn-confirm',
            '.ok-button'
        ]
    };
    
    // ========= FUNGSI UTAMA =========
    window.startAutoBet = function() {
        if (isAutoBetActive) {
            console.log("⚠️ Auto-bet sudah aktif");
            return;
        }
        
        if (!window.wingoBetData) {
            console.log("❌ Bot belum diinisialisasi");
            return;
        }
        
        isAutoBetActive = true;
        console.log("✅ Auto-bet diaktifkan dengan selector EXACT WinGo");
        
        // Cek lebih cepat untuk responsif
        autoBetInterval = setInterval(() => {
            performAutoBet();
        }, 1000);
        
        setTimeout(performAutoBet, 500);
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
        
        // Validasi bot
        if (!window.wingoBetData || !window.wingoBetData.prediction) {
            return;
        }
        
        // Bot sedang placing bet
        if (window.wingoBetData.status?.isBetPlaced) {
            return;
        }
        
        const currentPrediction = window.wingoBetData.prediction;
        const currentAmount = window.wingoBetData.amount;
        
        if (!currentPrediction || !currentAmount) {
            return;
        }
        
        // Cek apakah prediksi berubah
        const isNewBet = currentPrediction !== lastAutoBetPrediction || 
                        currentAmount !== lastAutoBetAmount;
        
        if (!isNewBet) {
            return;
        }
        
        console.log(`\n🎯 PREDIKSI BARU: ${currentPrediction} (Rp ${currentAmount.toLocaleString()})`);
        
        // Cek saldo
        if (!checkBalance()) {
            window.stopAutoBet();
            return;
        }
        
        // 1. Atur jumlah bet
        if (!await setBetAmount(currentAmount)) {
            console.log("💰 Menggunakan amount default (skip set amount)");
        }
        
        // 2. Tunggu sebentar
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // 3. Cari dan klik tombol dengan selector EXACT
        const targetButton = findExactBetButton(currentPrediction);
        
        if (targetButton && !targetButton.disabled) {
            console.log(`✅ Klik ${currentPrediction} - Selector: "${getButtonSelector(targetButton)}"`);
            
            // Simpan untuk next check
            lastAutoBetPrediction = currentPrediction;
            lastAutoBetAmount = currentAmount;
            
            // Klik
            const clicked = simulateEnhancedClick(targetButton);
            
            if (clicked) {
                // Highlight konfirmasi
                setTimeout(() => {
                    highlightConfirmButtonsEnhanced();
                    showEnhancedNotification(currentPrediction, currentAmount, targetButton);
                }, 600);
            }
        } else {
            console.log(`❌ Tombol ${currentPrediction} tidak ditemukan`);
            console.log("🔍 Mencoba fallback...");
            
            // Fallback: cari dengan teks
            const fallbackButton = findButtonByText(currentPrediction);
            if (fallbackButton) {
                console.log(`🔄 Fallback: Tombol ditemukan via teks`);
                simulateEnhancedClick(fallbackButton);
            }
        }
    }
    
    // ========= FUNGSI HELPER EXACT =========
    function findExactBetButton(prediction) {
        const selectors = prediction === 'BESAR' ? WINGO_SELECTORS.BET_BIG : WINGO_SELECTORS.BET_SMALL;
        
        console.log(`🔍 Mencari tombol ${prediction} dengan selectors:`);
        
        for (const selector of selectors) {
            try {
                const button = document.querySelector(selector);
                if (button && isElementVisible(button)) {
                    console.log(`   ✅ Ditemukan: ${selector}`);
                    return button;
                }
            } catch (e) {
                console.log(`   ❌ Error: ${selector} - ${e.message}`);
            }
        }
        
        return null;
    }
    
    function findButtonByText(prediction) {
        const searchText = prediction === 'BESAR' ? 'BESAR' : 'KECIL';
        const allButtons = document.querySelectorAll('button, [role="button"], .btn, div[onclick]');
        
        for (const button of allButtons) {
            const text = (button.textContent || button.innerText || '').toUpperCase();
            if (text.includes(searchText)) {
                console.log(`🔍 Ditemukan via teks: "${text}"`);
                return button;
            }
        }
        
        return null;
    }
    
    function getButtonSelector(element) {
        if (element.className) {
            return '.' + element.className.split(' ')[0];
        }
        if (element.id) {
            return '#' + element.id;
        }
        return element.tagName;
    }
    
    function isElementVisible(element) {
        return !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
    }
    
    async function setBetAmount(amount) {
        // Coba semua selector amount
        for (const selector of WINGO_SELECTORS.AMOUNT_INPUT) {
            const input = document.querySelector(selector);
            if (input) {
                input.value = amount;
                
                // Trigger events
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                input.dispatchEvent(new Event('blur', { bubbles: true }));
                
                console.log(`💰 Amount set: Rp ${amount.toLocaleString()}`);
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
            console.log(`❌ Saldo tidak cukup: ${balance.toLocaleString()} < ${betAmount.toLocaleString()}`);
            return false;
        }
        
        console.log(`✅ Saldo cukup: ${balance.toLocaleString()} > ${betAmount.toLocaleString()}`);
        return true;
    }
    
    function simulateEnhancedClick(element) {
        if (!element) return false;
        
        try {
            console.log("🖱️ Simulating enhanced click...");
            
            // Method 1: Native click
            element.click();
            
            // Method 2: Mouse events
            const mouseDown = new MouseEvent('mousedown', {
                view: window,
                bubbles: true,
                cancelable: true
            });
            element.dispatchEvent(mouseDown);
            
            const mouseUp = new MouseEvent('mouseup', {
                view: window,
                bubbles: true,
                cancelable: true
            });
            element.dispatchEvent(mouseUp);
            
            const clickEvent = new MouseEvent('click', {
                view: window,
                bubbles: true,
                cancelable: true
            });
            element.dispatchEvent(clickEvent);
            
            // Method 3: Focus jika input
            if (element.tagName === 'INPUT') {
                element.focus();
            }
            
            console.log("✅ Click simulation successful");
            return true;
            
        } catch (error) {
            console.error("❌ Click error:", error);
            return false;
        }
    }
    
    function highlightConfirmButtonsEnhanced() {
        console.log("🔦 Highlighting confirm buttons...");
        
        let foundButtons = [];
        
        // 1. Cari dengan selector valid
        WINGO_SELECTORS.CONFIRM_BUTTONS.forEach(selector => {
            const buttons = document.querySelectorAll(selector);
            buttons.forEach(btn => {
                if (isElementVisible(btn)) {
                    applyEnhancedHighlight(btn);
                    foundButtons.push(btn);
                }
            });
        });
        
        // 2. Cari berdasarkan teks (VALID - tanpa :contains)
        const confirmKeywords = ['konfirmasi', 'confirm', 'ok', 'submit', 'bet', 'place'];
        const allClickables = document.querySelectorAll('button, .btn, [role="button"], div[onclick]');
        
        allClickables.forEach(element => {
            const text = (element.textContent || element.innerText || '').toLowerCase();
            const isConfirm = confirmKeywords.some(keyword => text.includes(keyword));
            
            if (isConfirm && isElementVisible(element)) {
                applyEnhancedHighlight(element);
                foundButtons.push(element);
            }
        });
        
        if (foundButtons.length > 0) {
            console.log(`🎯 ${foundButtons.length} tombol konfirmasi disorot!`);
            console.log("👉 KLIK TOMBOL YANG DISOROT HIJAU UNTUK KONFIRMASI BET!");
            
            // Buat notifikasi lebih mencolok
            showAlertNotification(foundButtons.length);
        } else {
            console.log("⚠️ Tidak ditemukan tombol konfirmasi");
        }
    }
    
    function applyEnhancedHighlight(element) {
        // Simpan style asli
        if (!element.dataset.originalStyle) {
            element.dataset.originalStyle = element.style.cssText;
        }
        
        // Terapkan highlight
        element.style.cssText = `
            border: 5px solid #00FF00 !important;
            box-shadow: 0 0 50px #00FF00, 0 0 30px #00FF00 inset !important;
            background: linear-gradient(45deg, #002200, #00CC00) !important;
            color: #FFFFFF !important;
            font-weight: bold !important;
            font-size: 18px !important;
            animation: autoBetPulse 0.8s infinite !important;
            position: relative !important;
            z-index: 99999 !important;
            transform: scale(1.1) !important;
            text-transform: uppercase !important;
        `;
        
        // Tambah tooltip
        element.title = "KLIK UNTUK KONFIRMASI BET! - AUTO-BET SYSTEM";
    }
    
    function showEnhancedNotification(prediction, amount, button) {
        // Hapus notifikasi lama
        const oldNotif = document.getElementById('wingo-auto-notif');
        if (oldNotif) oldNotif.remove();
        
        // Buat notifikasi baru
        const notif = document.createElement('div');
        notif.id = 'wingo-auto-notif';
        notif.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(0, 0, 0, 0.95);
            color: #00FF00;
            padding: 20px;
            border: 3px solid #00FF00;
            border-radius: 15px;
            z-index: 999999;
            font-family: 'Courier New', monospace;
            font-size: 16px;
            box-shadow: 0 0 40px #00FF00;
            max-width: 400px;
            backdrop-filter: blur(10px);
        `;
        
        const time = new Date().toLocaleTimeString();
        notif.innerHTML = `
            <div style="display: flex; align-items: center; margin-bottom: 10px;">
                <div style="font-size: 24px; margin-right: 10px;">🤖</div>
                <div style="font-weight: bold; font-size: 18px;">WINGO AUTO-BET v3</div>
            </div>
            <div style="margin-bottom: 5px;">🎯 <b>PREDIKSI:</b> <span style="color: #FFFF00; font-size: 20px;">${prediction}</span></div>
            <div style="margin-bottom: 5px;">💰 <b>AMOUNT:</b> Rp ${amount.toLocaleString()}</div>
            <div style="margin-bottom: 10px;">⏰ <b>TIME:</b> ${time}</div>
            <div style="background: #003300; padding: 10px; border-radius: 5px; margin-top: 10px; font-size: 14px;">
                <div>🔸 Tombol <b>${prediction}</b> sudah diklik</div>
                <div>🔸 Cari tombol hijau berkedip untuk konfirmasi</div>
                <div>🔸 Auto-bet akan lanjut ke prediksi berikutnya</div>
            </div>
            <div style="margin-top: 15px; font-size: 12px; color: #88FF88;">
                Status: <span id="auto-bet-status" style="color: #00FF00;">ACTIVE</span>
            </div>
        `;
        
        document.body.appendChild(notif);
        
        // Auto-remove setelah 15 detik
        setTimeout(() => {
            if (notif && notif.parentNode) {
                notif.style.opacity = '0';
                notif.style.transition = 'opacity 1s';
                setTimeout(() => notif.parentNode.removeChild(notif), 1000);
            }
        }, 15000);
    }
    
    function showAlertNotification(buttonCount) {
        // Alert sound (jika diizinkan browser)
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.value = 800;
            oscillator.type = 'sine';
            gainNode.gain.value = 0.1;
            
            oscillator.start();
            setTimeout(() => oscillator.stop(), 300);
        } catch (e) {
            // Silent fail jika audio tidak diizinkan
        }
        
        // Visual alert
        if (!document.getElementById('auto-bet-alert')) {
            const alert = document.createElement('div');
            alert.id = 'auto-bet-alert';
            alert.style.cssText = `
                position: fixed;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%);
                background: #FF0000;
                color: white;
                padding: 15px 30px;
                border-radius: 10px;
                z-index: 999999;
                font-weight: bold;
                font-size: 18px;
                animation: alertPulse 1s infinite;
                text-align: center;
                box-shadow: 0 0 30px #FF0000;
            `;
            alert.textContent = `⚠️ KLIK ${buttonCount} TOMBOL HIJAU UNTUK KONFIRMASI!`;
            
            // Style untuk animasi
            const style = document.createElement('style');
            style.textContent = `
                @keyframes alertPulse {
                    0% { opacity: 1; transform: translateX(-50%) scale(1); }
                    50% { opacity: 0.8; transform: translateX(-50%) scale(1.05); }
                    100% { opacity: 1; transform: translateX(-50%) scale(1); }
                }
                @keyframes autoBetPulse {
                    0% { box-shadow: 0 0 20px #00FF00; }
                    50% { box-shadow: 0 0 60px #00FF00; }
                    100% { box-shadow: 0 0 20px #00FF00; }
                }
            `;
            document.head.appendChild(style);
            
            document.body.appendChild(alert);
            
            // Hapus setelah 10 detik
            setTimeout(() => {
                if (alert.parentNode) {
                    alert.parentNode.removeChild(alert);
                }
            }, 10000);
        }
    }
    
    function removeHighlights() {
        // Reset semua tombol yang di-highlight
        document.querySelectorAll('[data-original-style]').forEach(element => {
            element.style.cssText = element.dataset.originalStyle;
            delete element.dataset.originalStyle;
        });
        
        // Hapus notifikasi
        ['wingo-auto-notif', 'auto-bet-alert'].forEach(id => {
            const element = document.getElementById(id);
            if (element && element.parentNode) {
                element.parentNode.removeChild(element);
            }
        });
    }
    
    // ========= DEBUG & TEST =========
    window.testAutoBet = function(prediction = 'BESAR') {
        console.log(`🧪 Testing auto-bet: ${prediction}`);
        
        const button = findExactBetButton(prediction);
        if (button) {
            console.log(`✅ Tombol ditemukan: ${getButtonSelector(button)}`);
            simulateEnhancedClick(button);
            setTimeout(() => highlightConfirmButtonsEnhanced(), 800);
            console.log(`✅ Test ${prediction} berhasil`);
        } else {
            console.log(`❌ Tombol ${prediction} tidak ditemukan dengan selector`);
            
            // Coba cari dengan teks
            const fallback = findButtonByText(prediction);
            if (fallback) {
                console.log(`🔄 Ditemukan via teks`);
                simulateEnhancedClick(fallback);
            } else {
                console.log("🔍 Scan semua tombol di halaman:");
                document.querySelectorAll('button').forEach((btn, i) => {
                    const text = (btn.textContent || '').trim();
                    if (text) {
                        console.log(`${i+1}. "${text}" - Class: ${btn.className}`);
                    }
                });
            }
        }
    };
    
    window.scanBettingElements = function() {
        console.log("🔍 SCANNING BETTING ELEMENTS:");
        
        console.log("\n🎯 TOMBOL BESAR:");
        WINGO_SELECTORS.BET_BIG.forEach((selector, i) => {
            const element = document.querySelector(selector);
            console.log(`${i+1}. ${selector}: ${element ? '✅ DITEMUKAN' : '❌ TIDAK ADA'}`);
        });
        
        console.log("\n🎯 TOMBOL KECIL:");
        WINGO_SELECTORS.BET_SMALL.forEach((selector, i) => {
            const element = document.querySelector(selector);
            console.log(`${i+1}. ${selector}: ${element ? '✅ DITEMUKAN' : '❌ TIDAK ADA'}`);
        });
        
        console.log("\n💰 INPUT AMOUNT:");
        WINGO_SELECTORS.AMOUNT_INPUT.forEach((selector, i) => {
            const element = document.querySelector(selector);
            if (element) {
                console.log(`${i+1}. ${selector}: ✅ VALUE = ${element.value}`);
            } else {
                console.log(`${i+1}. ${selector}: ❌ TIDAK ADA`);
            }
        });
        
        console.log("\n📋 SEMUA TOMBOL DENGAN TEKS:");
        document.querySelectorAll('button, .btn').forEach((btn, i) => {
            const text = (btn.textContent || '').trim();
            if (text && text.length < 50) {
                console.log(`${i+1}. "${text}" - Class: ${btn.className || 'none'}`);
            }
        });
    };
    
    // ========= INTEGRASI DENGAN BOT =========
    if (window.wingoBot) {
        window.wingoBot.autoBet = {
            start: window.startAutoBet,
            stop: window.stopAutoBet,
            test: window.testAutoBet,
            scan: window.scanBettingElements,
            find: findExactBetButton
        };
    }
    
    // ========= AUTO-INIT DETECTION =========
    setTimeout(() => {
        if (window.wingoBetData) {
            console.log("🤖 WINGO AUTO-BET v3 READY!");
            console.log("🎯 Selectors configured for exact WinGo elements");
            console.log("🚀 Gunakan: startAutoBet() untuk memulai");
            
            // Test satu tombol untuk verifikasi
            setTimeout(() => {
                const testButton = findExactBetButton('BESAR');
                if (testButton) {
                    console.log(`✅ Verifikasi: Tombol BESAR ditemukan (${getButtonSelector(testButton)})`);
                }
            }, 1000);
        }
    }, 3000);
    
    console.log("✅ WinGo Auto-Bet v3 Loaded with EXACT Selectors!");
    console.log("🛠️ Commands:");
    console.log("   startAutoBet()       - Start auto-betting");
    console.log("   stopAutoBet()        - Stop auto-betting");
    console.log("   testAutoBet('BESAR') - Test click BESAR button");
    console.log("   testAutoBet('KECIL') - Test click KECIL button");
    console.log("   scanBettingElements()- Scan for betting elements");
})();
