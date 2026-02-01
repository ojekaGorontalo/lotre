/* ========= WINGO HELPER v6.4 - TIMER FIX ========= */
(function() {
    'use strict';
    
    console.log("⚡ WINGO HELPER v6.4 LOADED - 551br.com");
    
    // Configuration
    const CFG = {
        debug: true,
        autoConfirm: true,
        betAmount: 1000,
        checkInterval: 2000,
        minBetTime: 8,      // Minimal 8 detik
        maxBetTime: 25      // Maksimal 25 detik
    };
    
    let isRunning = false;
    let isProcessing = false;
    let lastBetTime = 0;
    let lastBetKey = '';
    
    // ========== ADVANCED TIMER DETECTION ==========
    function getTimerInfo() {
        // Coba semua kemungkinan selector timer di 551br.com
        const timerSelectors = [
            '.timer', 
            '.countdown',
            '.van-count-down',
            '[class*="timer"]',
            '[class*="countdown"]',
            '[class*="time-"]',
            '.Betting__C-head-t',
            '.game-timer',
            'div[style*="timer"]',
            'span[style*="timer"]',
            // Selector khusus untuk 551br.com
            '.time-count',
            '.betting-timer',
            '.round-timer'
        ];
        
        for (let selector of timerSelectors) {
            const element = document.querySelector(selector);
            if (element && element.textContent && element.textContent.trim()) {
                const text = element.textContent.trim();
                console.log(`⏱️ Timer ditemukan (${selector}): ${text}`);
                
                // Parse waktu
                let seconds = 0;
                
                if (text.includes(':')) {
                    const parts = text.split(':');
                    const minutes = parseInt(parts[0]) || 0;
                    const secs = parseInt(parts[1].split('.')[0]) || 0; // Abaikan milidetik
                    seconds = (minutes * 60) + secs;
                } else if (text.includes('.')) {
                    // Format: 15.9 detik
                    seconds = parseFloat(text) || 0;
                } else {
                    seconds = parseInt(text) || 0;
                }
                
                return {
                    element: element,
                    text: text,
                    seconds: Math.floor(seconds),
                    isBettingOpen: seconds >= CFG.minBetTime && seconds <= CFG.maxBetTime
                };
            }
        }
        
        // Jika tidak ditemukan, coba cari di seluruh DOM
        console.log("🔍 Scanning DOM untuk timer...");
        const allElements = document.querySelectorAll('div, span, p');
        for (let el of allElements) {
            const text = el.textContent.trim();
            if (text && (text.includes(':') || /^\d+$/.test(text) || /^\d+\.\d+$/.test(text))) {
                // Cek jika ini kemungkinan timer (format waktu)
                if (text.match(/^\d{1,2}:\d{2}$/) || text.match(/^\d{1,2}\.\d$/)) {
                    console.log(`🎯 Timer ditemukan via scanning: ${text}`);
                    
                    let seconds = 0;
                    if (text.includes(':')) {
                        const parts = text.split(':');
                        seconds = parseInt(parts[0]) * 60 + parseInt(parts[1]);
                    } else {
                        seconds = parseFloat(text);
                    }
                    
                    return {
                        element: el,
                        text: text,
                        seconds: Math.floor(seconds),
                        isBettingOpen: seconds >= CFG.minBetTime && seconds <= CFG.maxBetTime
                    };
                }
            }
        }
        
        console.log("❌ Timer tidak ditemukan");
        return null;
    }
    
    // ========== GET BOT DATA ==========
    function getBotData() {
        if (!window.wingoBetData) {
            console.log("⏳ Menunggu bot data...");
            return null;
        }
        
        try {
            const data = window.wingoBetData.getBetInfo 
                ? window.wingoBetData.getBetInfo()
                : window.wingoBetData;
            
            if (data && data.prediction) {
                return {
                    prediction: data.prediction,
                    amount: data.amount || 1000
                };
            }
        } catch (e) {
            console.log("⚠️ Error get bot data:", e.message);
        }
        
        return null;
    }
    
    // ========== SAFE CLICK ==========
    function safeClick(element) {
        if (!element || !element.click) {
            console.log("❌ Element tidak valid");
            return false;
        }
        
        try {
            console.log("🖱️ Clicking element...");
            
            // Simpan style asli
            const originalStyle = element.style.cssText;
            
            // Tambahkan highlight sementara (debug)
            element.style.boxShadow = '0 0 10px yellow';
            element.style.border = '2px solid yellow';
            
            element.click();
            
            // Kembalikan style
            setTimeout(() => {
                element.style.cssText = originalStyle;
            }, 500);
            
            return true;
        } catch (error) {
            console.log("❌ Click error:", error.message);
            return false;
        }
    }
    
    // ========== WAIT FUNCTION ==========
    function wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    // ========== FIND ELEMENT ==========
    function findElement(selectors, container = document) {
        for (let selector of selectors) {
            const element = container.querySelector(selector);
            if (element) {
                console.log(`✅ Found: ${selector}`);
                return element;
            }
        }
        return null;
    }
    
    // ========== MAIN BET PROCESS ==========
    async function processBet() {
        if (isProcessing) {
            console.log("⚠️ Sedang memproses...");
            return;
        }
        
        // Cek cooldown (minimal 10 detik antar bet)
        const now = Date.now();
        if (now - lastBetTime < 10000) {
            console.log("⏳ Cooldown 10 detik...");
            return;
        }
        
        isProcessing = true;
        
        try {
            // 1. Get bot data
            const botData = getBotData();
            if (!botData) {
                console.log("⏳ Tidak ada data bot");
                return;
            }
            
            // 2. Check timer
            const timer = getTimerInfo();
            if (!timer) {
                console.log("⏳ Timer tidak ditemukan");
                return;
            }
            
            console.log(`⏱️ Timer: ${timer.text} (${timer.seconds}s)`);
            
            // 3. Cek jika waktu betting
            if (!timer.isBettingOpen) {
                console.log(`⏳ Belum waktu betting (${timer.seconds}s)`);
                return;
            }
            
            // 4. Generate unique key
            const betKey = `${botData.prediction}-${botData.amount}-${timer.seconds}`;
            if (lastBetKey === betKey) {
                console.log("⏳ Bet sudah diproses");
                return;
            }
            
            lastBetKey = betKey;
            
            console.log(`🎯 BOT: ${botData.prediction} - Rp ${botData.amount.toLocaleString()}`);
            
            // 5. Find and click bet button
            const betButtonSelectors = botData.prediction === 'BESAR' 
                ? ['.Betting__C-foot-b', '[class*="besar"]', 'button:contains("BESAR")']
                : ['.Betting__C-foot-s', '[class*="kecil"]', 'button:contains("KECIL")'];
            
            const betButton = findElement(betButtonSelectors);
            if (!betButton) {
                console.log(`❌ Tombol ${botData.prediction} tidak ditemukan`);
                return;
            }
            
            // Cek jika button aktif
            const style = window.getComputedStyle(betButton);
            if (style.opacity === '0.5' || style.pointerEvents === 'none') {
                console.log(`⚠️ Tombol ${botData.prediction} tidak aktif`);
                return;
            }
            
            console.log(`🖱️ Klik tombol ${botData.prediction}...`);
            safeClick(betButton);
            
            // 6. Wait for popup
            await wait(1500);
            
            // 7. Process popup
            await processPopup(botData.amount);
            
            // Update last bet time
            lastBetTime = Date.now();
            console.log("✅ Bet selesai!");
            
        } catch (error) {
            console.log("❌ Error:", error.message);
        } finally {
            isProcessing = false;
        }
    }
    
    // ========== PROCESS POPUP ==========
    async function processPopup(amount) {
        console.log("🔍 Mencari popup...");
        
        // Wait for popup
        for (let i = 0; i < 15; i++) {
            const popupSelectors = [
                '.van-popup.van-popup--bottom',
                '.van-popup',
                '.bet-popup',
                '[class*="popup"]',
                '[class*="modal"]'
            ];
            
            const popup = findElement(popupSelectors);
            if (popup && popup.style.display !== 'none') {
                console.log("✅ Popup ditemukan");
                await fillAmount(popup, amount);
                return;
            }
            await wait(200);
        }
        
        console.log("❌ Popup tidak muncul");
    }
    
    // ========== FILL AMOUNT ==========
    async function fillAmount(popup, amount) {
        console.log(`💰 Mengisi amount: ${amount}`);
        
        // Coba input field dulu
        const input = popup.querySelector('input[type="tel"], input[type="number"]');
        if (input) {
            console.log("✅ Input ditemukan");
            
            // Clear dan isi
            input.value = '';
            await wait(300);
            
            // Hitung multiplier
            const multiplier = amount / 1000;
            input.value = multiplier.toString();
            
            // Trigger event
            input.dispatchEvent(new Event('input', { bubbles: true }));
            console.log(`✅ Amount diisi: ${multiplier}`);
            
            await wait(1000);
            
            // Confirm bet
            if (CFG.autoConfirm) {
                await confirmBet(popup);
            }
            
            return;
        }
        
        // Coba quick amount buttons
        console.log("🔍 Mencari tombol quick amount...");
        const buttons = popup.querySelectorAll('button, div, span');
        
        for (let btn of buttons) {
            const text = btn.textContent || '';
            const num = parseInt(text.replace(/[^\d]/g, ''));
            
            if (num === amount) {
                console.log(`✅ Quick amount: ${num}`);
                safeClick(btn);
                await wait(1000);
                
                if (CFG.autoConfirm) {
                    await confirmBet(popup);
                }
                return;
            }
        }
        
        // Untuk amount 1000, coba X1
        if (amount === 1000) {
            for (let btn of buttons) {
                const text = btn.textContent || '';
                if (text.includes('X1') || text.includes('x1')) {
                    console.log("✅ X1 button ditemukan");
                    safeClick(btn);
                    await wait(1000);
                    
                    if (CFG.autoConfirm) {
                        await confirmBet(popup);
                    }
                    return;
                }
            }
        }
        
        console.log("❌ Tidak bisa mengisi amount");
    }
    
    // ========== CONFIRM BET ==========
    async function confirmBet(popup) {
        console.log("🔍 Mencari tombol konfirmasi...");
        
        const confirmSelectors = [
            '.Betting__Popup-foot-s',
            '.van-button--primary',
            '[class*="confirm"]',
            '[class*="submit"]',
            'button:contains("Confirm")',
            'button:contains("Konfirmasi")',
            'button:contains("TARUH")',
            'button:contains("BET")'
        ];
        
        // Cari di popup dulu
        for (let selector of confirmSelectors) {
            let button = null;
            
            if (selector.includes('contains')) {
                // Cari berdasarkan text
                const text = selector.match(/contains\("([^"]+)"\)/)[1];
                const buttons = popup.querySelectorAll('button');
                
                for (let btn of buttons) {
                    if (btn.textContent.includes(text)) {
                        button = btn;
                        break;
                    }
                }
            } else {
                button = popup.querySelector(selector);
            }
            
            if (button) {
                console.log(`✅ Confirm button: ${button.textContent?.trim()}`);
                await wait(800);
                safeClick(button);
                console.log("✅ Bet dikonfirmasi!");
                return;
            }
        }
        
        console.log("❌ Tombol konfirmasi tidak ditemukan");
    }
    
    // ========== MONITOR SYSTEM ==========
    let monitorInterval = null;
    
    function startMonitor() {
        if (isRunning) {
            console.log("⚠️ Sudah berjalan");
            return;
        }
        
        isRunning = true;
        console.log("🚀 Starting auto-bet monitor...");
        
        // Periksa timer dulu
        const timer = getTimerInfo();
        if (timer) {
            console.log(`⏱️ Timer awal: ${timer.text}`);
        }
        
        monitorInterval = setInterval(async () => {
            if (!isRunning) {
                clearInterval(monitorInterval);
                return;
            }
            
            await processBet();
        }, CFG.checkInterval);
        
        // First check
        setTimeout(processBet, 1000);
    }
    
    function stopMonitor() {
        isRunning = false;
        if (monitorInterval) {
            clearInterval(monitorInterval);
            monitorInterval = null;
        }
        console.log("⏹️ Monitor dihentikan");
    }
    
    // ========== DEBUG FUNCTIONS ==========
    function debugPage() {
        console.log("🔍 DEBUG PAGE - 551br.com");
        console.log("========================");
        
        // Cek semua elemen penting
        console.log("1. Tombol BESAR:", document.querySelector('.Betting__C-foot-b') ? "✅" : "❌");
        console.log("2. Tombol KECIL:", document.querySelector('.Betting__C-foot-s') ? "✅" : "❌");
        
        // Cek timer dengan semua selector
        const timerSelectors = [
            '.timer', '.countdown', '.van-count-down',
            '[class*="timer"]', '[class*="countdown"]',
            '.Betting__C-head-t', '.game-timer'
        ];
        
        console.log("3. Timer check:");
        timerSelectors.forEach(selector => {
            const el = document.querySelector(selector);
            if (el) {
                console.log(`   ${selector}: "${el.textContent?.trim()}"`);
            }
        });
        
        // Cek bot data
        console.log("4. Bot Data:", getBotData());
        
        // Cek apakah ada popup
        console.log("5. Popup:", document.querySelector('.van-popup') ? "✅" : "❌");
    }
    
    // ========== PUBLIC API ==========
    window.wHelper = {
        start: function() {
            startMonitor();
            console.log("✅ Auto-bet DIMULAI");
            console.log("📊 Commands: wHelper.stop(), wHelper.debug(), wHelper.status()");
        },
        
        stop: function() {
            stopMonitor();
            console.log("⏹️ Auto-bet DIHENTIKAN");
        },
        
        debug: function() {
            debugPage();
        },
        
        status: function() {
            const timer = getTimerInfo();
            const botData = getBotData();
            
            return {
                running: isRunning,
                processing: isProcessing,
                timer: timer ? `${timer.text} (${timer.seconds}s)` : 'Not found',
                bettingOpen: timer ? timer.isBettingOpen : false,
                botData: botData,
                lastBet: lastBetTime ? new Date(lastBetTime).toLocaleTimeString() : 'Never'
            };
        },
        
        test: function() {
            console.log("🧪 Testing system...");
            
            // Test klik tombol BESAR
            const testBtn = document.querySelector('.Betting__C-foot-b');
            if (testBtn) {
                console.log("✅ Test button found");
                safeClick(testBtn);
                
                setTimeout(async () => {
                    await processPopup(1000);
                }, 1500);
            } else {
                console.log("❌ Test button not found");
            }
        },
        
        manualBet: function(prediction, amount = 1000) {
            console.log(`🎮 Manual bet: ${prediction} - ${amount}`);
            
            const timer = getTimerInfo();
            if (!timer || !timer.isBettingOpen) {
                console.log("❌ Not betting time");
                return;
            }
            
            const btn = prediction === 'BESAR' 
                ? document.querySelector('.Betting__C-foot-b')
                : document.querySelector('.Betting__C-foot-s');
            
            if (btn) {
                safeClick(btn);
                
                setTimeout(async () => {
                    await processPopup(amount);
                }, 1500);
            }
        }
    };
    
    // ========== AUTO INIT ==========
    setTimeout(() => {
        console.log("🌐 WINGO HELPER v6.4 READY");
        console.log("🔧 Commands untuk 551br.com:");
        console.log("   wHelper.start()    - Mulai auto-bet");
        console.log("   wHelper.stop()     - Hentikan auto-bet");
        console.log("   wHelper.debug()    - Debug halaman");
        console.log("   wHelper.status()   - Status sistem");
        console.log("   wHelper.test()     - Test sistem");
        
        // Auto-debug
        setTimeout(() => {
            const timer = getTimerInfo();
            if (!timer) {
                console.log("⚠️ WARNING: Timer tidak terdeteksi!");
                console.log("🔍 Running debug...");
                debugPage();
            }
        }, 3000);
    }, 2000);
    
})();
