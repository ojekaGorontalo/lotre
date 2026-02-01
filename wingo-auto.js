/* ========= AUTO-BET WINGO v5.3 - INPUT FIX FOR 1000 ========= */
(function() {
    console.log("🤖 AUTO-BET WINGO v5.3 - Input Fix for 1000");
    
    let isAutoBetActive = false;
    let autoBetInterval = null;
    let lastProcessedAmount = 0;
    let bettingWindowOpen = false;
    let lastBetTime = 0;
    
    // ========== FUNGSI BARU: waitForElement ==========
    function waitForElement(selector, callback, container = document, timeout = 5000) {
        const startTime = Date.now();
        const checkInterval = 100;
        
        const checkElement = () => {
            const element = container.querySelector(selector);
            if (element) {
                callback(element);
            } else if (Date.now() - startTime >= timeout) {
                console.error(`Element ${selector} not found within ${timeout}ms`);
                callback(null);
            } else {
                setTimeout(checkElement, checkInterval);
            }
        };
        
        checkElement();
    }

    // Fungsi untuk memulai auto-bet
    window.startAutoBet = function() {
        if (isAutoBetActive) {
            console.log("⚠️ Auto-bet sudah aktif");
            return;
        }
        
        isAutoBetActive = true;
        console.log("✅ Auto-bet diaktifkan");
        
        autoBetInterval = setInterval(() => {
            if (isAutoBetActive) {
                checkAndPlaceBet();
            }
        }, 5000);
        
        setTimeout(checkAndPlaceBet, 1000);
    };
    
    // Fungsi untuk menghentikan auto-bet
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
    };
    
    // Cek timer status
    function checkTimerStatus() {
        const timerElement = document.querySelector('[class*="timer"], [class*="countdown"], [class*="time"]');
        if (!timerElement) {
            console.log("⏳ Timer tidak ditemukan");
            return null;
        }
        
        const timerText = timerElement.textContent.trim();
        console.log(`⏱️ Timer: ${timerText}`);
        
        let seconds = 0;
        if (timerText.includes(':')) {
            const parts = timerText.split(':');
            const minutes = parseInt(parts[0]) || 0;
            const secs = parseInt(parts[1]) || 0;
            seconds = (minutes * 60) + secs;
        } else {
            seconds = parseInt(timerText) || 0;
        }
        
        return {
            text: timerText,
            seconds: seconds,
            isBettingOpen: seconds <= 30 && seconds > 0
        };
    }
    
    // Cek jika betting window open
    function isBettingWindowOpen() {
        const indicators = [
            checkTimerStatus(),
            () => {
                const statusElements = document.querySelectorAll('div, span');
                for (let el of statusElements) {
                    const text = el.textContent?.toUpperCase() || '';
                    if (text.includes('BETTING OPEN') || text.includes('TARUHAN DIBUKA')) {
                        return true;
                    }
                    if (text.includes('BETTING CLOSED') || text.includes('TARUHAN DITUTUP')) {
                        return false;
                    }
                }
                return null;
            },
            () => {
                const btn = document.querySelector('.Betting__C-foot-b');
                if (!btn) return null;
                const style = window.getComputedStyle(btn);
                return style.opacity !== '0.5' && 
                       style.pointerEvents !== 'none' &&
                       !btn.disabled;
            }
        ];
        
        let openCount = 0;
        let closedCount = 0;
        
        for (let indicator of indicators) {
            const result = typeof indicator === 'function' ? indicator() : indicator;
            if (result === true || (result && result.isBettingOpen === true)) {
                openCount++;
            } else if (result === false || (result && result.isBettingOpen === false)) {
                closedCount++;
            }
        }
        
        bettingWindowOpen = openCount > closedCount;
        console.log(`📊 Betting Window: ${bettingWindowOpen ? '✅ TERBUKA' : '❌ TERTUTUP'} (${openCount}:${closedCount})`);
        
        return bettingWindowOpen;
    }
    
    // Fungsi utama
    function checkAndPlaceBet() {
        if (!isAutoBetActive) return;
        
        console.log(`\n🔄 Auto-bet check at ${new Date().toLocaleTimeString()}`);
        
        if (!isBettingWindowOpen()) {
            console.log("⏳ Menunggu betting window terbuka...");
            const timerInfo = checkTimerStatus();
            if (timerInfo && timerInfo.seconds > 0 && timerInfo.seconds <= 60) {
                const retryDelay = Math.min(timerInfo.seconds * 1000, 10000);
                console.log(`⏰ Akan coba lagi dalam ${Math.round(retryDelay/1000)} detik`);
                setTimeout(checkAndPlaceBet, retryDelay);
            }
            return;
        }
        
        const now = Date.now();
        if (now - lastBetTime < 10000) {
            console.log("⏳ Cooldown, tunggu 10 detik antar bet");
            return;
        }
        
        const betInfo = getBotPrediction();
        if (!betInfo) {
            console.log("⏳ Menunggu prediksi dari bot...");
            return;
        }
        
        if (betInfo.amount === lastProcessedAmount) {
            console.log("⏳ Amount sama, tunggu prediksi baru...");
            return;
        }
        
        console.log(`🎯 Mencoba bet: ${betInfo.prediction} - Rp ${betInfo.amount.toLocaleString()}`);
        
        if (!clickBetButton(betInfo.prediction)) {
            console.log("⏳ Tombol betting belum bisa diklik...");
            return;
        }
        
        lastProcessedAmount = betInfo.amount;
        lastBetTime = now;
        
        setTimeout(() => {
            processBottomSheet(betInfo.amount);
        }, 2000);
    }
    
    // Dapatkan prediksi dari bot
    function getBotPrediction() {
        if (!window.wingoBetData) {
            console.log("❌ wingoBetData tidak tersedia");
            return null;
        }
        
        const betInfo = window.wingoBetData.getBetInfo();
        if (!betInfo.prediction || !betInfo.amount) {
            console.log("❌ Belum ada prediksi/amount");
            return null;
        }
        
        console.log(`📊 Prediksi: ${betInfo.prediction}, Amount: Rp ${betInfo.amount.toLocaleString()}`);
        return betInfo;
    }
    
    // Klik tombol betting (BESAR/KECIL)
    function clickBetButton(prediction) {
        const buttonClass = prediction === "BESAR" ? ".Betting__C-foot-b" : ".Betting__C-foot-s";
        const button = document.querySelector(buttonClass);
        
        if (!button) {
            console.log(`❌ Tombol ${prediction} tidak ditemukan (${buttonClass})`);
            return false;
        }
        
        const computedStyle = window.getComputedStyle(button);
        const isActive = 
            !button.disabled &&
            !button.classList.contains('disabled') &&
            computedStyle.opacity !== '0.5' &&
            computedStyle.pointerEvents !== 'none' &&
            computedStyle.cursor !== 'not-allowed' &&
            computedStyle.display !== 'none';
        
        if (!isActive) {
            console.log(`⏳ Tombol ${prediction} tidak aktif:`, {
                disabled: button.disabled,
                hasDisabledClass: button.classList.contains('disabled'),
                opacity: computedStyle.opacity,
                pointerEvents: computedStyle.pointerEvents,
                cursor: computedStyle.cursor
            });
            return false;
        }
        
        console.log(`✅ Tombol ${prediction} AKTIF, mengklik...`);
        
        const originalStyle = button.style.cssText;
        const originalHTML = button.innerHTML;
        
        const highlightColor = prediction === "BESAR" ? "#00FF00" : "#FF0000";
        button.style.cssText = `
            ${originalStyle}
            border: 4px solid ${highlightColor} !important;
            box-shadow: 0 0 30px ${highlightColor} !important;
            background-color: ${prediction === "BESAR" ? 'rgba(0, 255, 0, 0.3)' : 'rgba(255, 0, 0, 0.3)'} !important;
            transform: scale(1.1) !important;
            transition: all 0.3s !important;
            font-weight: bold !important;
            color: white !important;
        `;
        
        button.innerHTML = `⏳ KLIK ${prediction}...`;
        
        console.log("🖱️ Method 1: Direct click()");
        button.click();
        
        console.log("🖱️ Method 2: Mouse events");
        ['mousedown', 'mouseup', 'click'].forEach(eventType => {
            const event = new MouseEvent(eventType, {
                view: window,
                bubbles: true,
                cancelable: true,
                clientX: button.getBoundingClientRect().left + 10,
                clientY: button.getBoundingClientRect().top + 10
            });
            button.dispatchEvent(event);
        });
        
        console.log("📱 Method 3: Touch events");
        ['touchstart', 'touchend'].forEach(eventType => {
            const event = new Event(eventType, {
                bubbles: true,
                cancelable: true
            });
            button.dispatchEvent(event);
        });
        
        if (button.__vue__ || button.__vueParent) {
            console.log("⚡ Method 4: Vue component detected");
            const vueInstance = button.__vue__ || button.__vueParent;
            if (vueInstance.handleClick) {
                vueInstance.handleClick();
            } else if (vueInstance.$emit) {
                vueInstance.$emit('click');
            }
        }
        
        setTimeout(() => {
            button.style.cssText = originalStyle;
            button.innerHTML = originalHTML;
            console.log(`✅ Klik tombol ${prediction} selesai`);
        }, 1500);
        
        return true;
    }
    
    // Proses bottom sheet
    function processBottomSheet(amount) {
        const maxWaitTime = 5000;
        const startTime = Date.now();
        
        const waitForBottomSheet = () => {
            const bottomSheet = document.querySelector('.van-popup.van-popup--bottom');
            
            if (bottomSheet && bottomSheet.style.display !== 'none') {
                console.log("✅ Bottom sheet ditemukan");
                configureBettingAmount(bottomSheet, amount);
                return;
            }
            
            const altBottomSheet = document.querySelector('[class*="popup"], [class*="sheet"], [class*="modal"]');
            if (altBottomSheet && altBottomSheet.style.display !== 'none') {
                console.log("✅ Bottom sheet (alternatif) ditemukan");
                configureBettingAmount(altBottomSheet, amount);
                return;
            }
            
            if (Date.now() - startTime < maxWaitTime) {
                setTimeout(waitForBottomSheet, 200);
            } else {
                console.log("❌ Bottom sheet tidak muncul setelah 5 detik");
                lastProcessedAmount = 0;
            }
        };
        
        waitForBottomSheet();
    }
    
    // ========== FUNGSI BARU/PERBAIKAN ==========
    
    // Konfigurasi jumlah taruhan - DIPERBAIKI untuk 1000
    function configureBettingAmount(bottomSheet, amount) {
        console.log(`💰 Mengatur jumlah taruhan: Rp ${amount.toLocaleString()}`);
        
        // Tunggu sebentar untuk memastikan DOM siap
        setTimeout(() => {
            // Gunakan waitForElement untuk mencari input
            waitForElement('input[type="tel"]', (input) => {
                if (!input) {
                    console.log("❌ Input tidak ditemukan, gunakan metode nominal");
                    selectNominalAmount(bottomSheet, amount);
                    return;
                }
                
                console.log("🔄 Mengisi input amount...");
                
                // Clear input terlebih dahulu
                input.value = '';
                triggerInputEvent(input, '');
                
                // Hitung multiplier (base amount biasanya 1000)
                const baseAmount = 1000;
                const multiplier = Math.round(amount / baseAmount);
                
                console.log(`🔢 Multiplier: ${multiplier}x (${amount} / ${baseAmount})`);
                
                if (multiplier >= 1 && multiplier <= 100) {
                    // Set nilai dengan berbagai metode untuk memastikan
                    setInputValueWithAllMethods(input, multiplier.toString());
                    
                    // Verifikasi nilai terisi
                    setTimeout(() => {
                        console.log(`📋 Input value setelah diisi: "${input.value}"`);
                        
                        if (input.value !== multiplier.toString()) {
                            console.log("⚠️ Nilai tidak terisi, mencoba metode manual...");
                            manualInputFallback(bottomSheet, amount);
                        } else {
                            console.log("✅ Nilai berhasil diisi ke input");
                            proceedWithBetting(bottomSheet);
                        }
                    }, 500);
                } else {
                    console.log(`⚠️ Multiplier ${multiplier} di luar range, gunakan nominal`);
                    selectNominalAmount(bottomSheet, amount);
                }
            }, bottomSheet, 3000);
        }, 300);
    }
    
    // Set input value dengan semua metode yang mungkin
    function setInputValueWithAllMethods(input, value) {
        console.log(`🔄 Mengisi "${value}" dengan berbagai metode...`);
        
        // Method 1: Langsung set value property
        input.value = value;
        
        // Method 2: Set attribute
        input.setAttribute('value', value);
        
        // Method 3: Dispatch input event
        triggerInputEvent(input, value);
        
        // Method 4: Dispatch change event
        triggerChangeEvent(input, value);
        
        // Method 5: Focus, set, blur
        input.focus();
        input.value = value;
        input.blur();
        
        // Method 6: Untuk Vue/React
        if (input.__vue__) {
            console.log("⚡ Menggunakan Vue setter");
            const vueInstance = input.__vue__;
            if (vueInstance.$emit) {
                vueInstance.$emit('input', value);
            }
        }
        
        // Method 7: Simulasi keyboard input
        simulateTyping(input, value);
        
        // Method 8: Khusus untuk nilai 1 (taruhan 1000)
        if (value === '1') {
            console.log("🎯 Mengisi nilai 1 dengan metode khusus");
            
            // Metode tambahan untuk nilai 1
            setTimeout(() => {
                input.focus();
                input.value = '1';
                triggerInputEvent(input, '1');
                triggerChangeEvent(input, '1');
                
                // Coba klik tombol plus jika ada (untuk memastikan)
                const plusButton = input.closest('.van-popup')?.querySelector('[class*="plus"], button:contains("+")');
                if (plusButton) {
                    console.log("➕ Mengklik tombol plus untuk memastikan");
                    plusButton.click();
                }
            }, 100);
        }
    }
    
    // Trigger input event
    function triggerInputEvent(element, value) {
        const inputEvent = new Event('input', {
            bubbles: true,
            cancelable: true,
        });
        element.value = value;
        element.dispatchEvent(inputEvent);
    }
    
    // Trigger change event
    function triggerChangeEvent(element, value) {
        const changeEvent = new Event('change', {
            bubbles: true,
            cancelable: true,
        });
        element.value = value;
        element.dispatchEvent(changeEvent);
    }
    
    // Simulasi typing
    function simulateTyping(input, text) {
        console.log(`⌨️ Simulasi mengetik: "${text}"`);
        
        // Focus ke input
        input.focus();
        
        // Dispatch keydown dan keyup untuk setiap karakter
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            
            // Keydown
            const keydownEvent = new KeyboardEvent('keydown', {
                key: char,
                code: `Digit${char}`,
                keyCode: char.charCodeAt(0),
                bubbles: true
            });
            input.dispatchEvent(keydownEvent);
            
            // Keypress
            const keypressEvent = new KeyboardEvent('keypress', {
                key: char,
                charCode: char.charCodeAt(0),
                bubbles: true
            });
            input.dispatchEvent(keypressEvent);
            
            // Update value per karakter
            input.value = text.substring(0, i + 1);
            
            // Input event
            const inputEvent = new InputEvent('input', {
                data: char,
                bubbles: true
            });
            input.dispatchEvent(inputEvent);
            
            // Keyup
            const keyupEvent = new KeyboardEvent('keyup', {
                key: char,
                code: `Digit${char}`,
                keyCode: char.charCodeAt(0),
                bubbles: true
            });
            input.dispatchEvent(keyupEvent);
        }
    }
    
    // Fallback manual input
    function manualInputFallback(bottomSheet, amount) {
        console.log("🔧 Mencoba fallback manual...");
        
        // Khusus untuk amount 1000
        if (amount === 1000) {
            console.log("🎯 Khusus untuk amount 1000");
            const input = bottomSheet.querySelector('input[type="tel"]');
            if (input) {
                // Coba isi dengan metode yang lebih agresif
                input.focus();
                input.value = '1';
                
                // Trigger berbagai event
                ['input', 'change', 'blur'].forEach(eventType => {
                    const event = new Event(eventType, { bubbles: true });
                    input.dispatchEvent(event);
                });
                
                // Coba klik di luar input
                setTimeout(() => {
                    bottomSheet.click();
                }, 100);
                
                setTimeout(() => {
                    console.log(`📋 Input value setelah fallback: "${input.value}"`);
                    if (input.value === '1') {
                        console.log("✅ Berhasil mengisi 1 via fallback");
                        proceedWithBetting(bottomSheet);
                        return;
                    }
                }, 300);
            }
        }
        
        // Coba klik tombol plus/minus jika ada
        const plusButtons = bottomSheet.querySelectorAll('[class*="plus"], button:contains("+")');
        const minusButtons = bottomSheet.querySelectorAll('[class*="minus"], button:contains("-")');
        
        if (plusButtons.length > 0) {
            console.log("➕ Menggunakan tombol plus...");
            const baseAmount = 1000;
            const targetClicks = Math.round(amount / baseAmount);
            
            // Klik tombol plus sebanyak yang diperlukan
            for (let i = 0; i < targetClicks; i++) {
                setTimeout(() => {
                    plusButtons[0].click();
                    console.log(`➕ Klik plus ke-${i + 1}`);
                }, i * 100);
            }
            
            setTimeout(() => proceedWithBetting(bottomSheet), targetClicks * 100 + 500);
            return;
        }
        
        // Jika tidak ada tombol plus/minus, coba nominal
        selectNominalAmount(bottomSheet, amount);
    }
    
    // Pilih nominal amount dari opsi yang tersedia
    function selectNominalAmount(bottomSheet, amount) {
        console.log(`🎯 Mencari nominal: Rp ${amount.toLocaleString()}`);
        
        // Tunggu sebentar untuk DOM
        setTimeout(() => {
            const amountOptions = bottomSheet.querySelectorAll('[class*="amount"], [class*="nominal"], [class*="line-item"], button');
            let found = false;
            
            amountOptions.forEach(option => {
                const text = option.textContent.trim();
                const numericValue = parseInt(text.replace(/[^\d]/g, ''));
                
                if (!isNaN(numericValue) && numericValue === amount) {
                    console.log(`✅ Nominal ditemukan: ${text}`);
                    
                    // Highlight
                    option.style.cssText = `
                        border: 2px solid #00FF00 !important;
                        background-color: rgba(0, 255, 0, 0.2) !important;
                    `;
                    
                    // Klik jika belum aktif
                    if (!option.classList.contains('active') && !option.classList.contains('bgcolor')) {
                        setTimeout(() => {
                            option.click();
                            console.log(`🖱️ Mengklik nominal ${text}`);
                        }, 100);
                    }
                    
                    found = true;
                }
            });
            
            if (!found) {
                console.log(`❌ Nominal ${amount} tidak ditemukan`);
                useMultiplierFallback(bottomSheet, amount);
            } else {
                setTimeout(() => proceedWithBetting(bottomSheet), 1000);
            }
        }, 300);
    }
    
    // Fallback menggunakan multiplier
    function useMultiplierFallback(bottomSheet, amount) {
        const baseAmount = 1000;
        const targetMultiplier = Math.round(amount / baseAmount);
        
        console.log(`🎯 Mencari multiplier untuk: ${targetMultiplier}x`);
        
        const availableMultipliers = [
            { text: 'X1', value: 1 },
            { text: 'X5', value: 5 },
            { text: 'X10', value: 10 },
            { text: 'X20', value: 20 },
            { text: 'X50', value: 50 },
            { text: 'X100', value: 100 }
        ];
        
        let bestMatch = null;
        let minDifference = Infinity;
        
        availableMultipliers.forEach(mult => {
            const total = baseAmount * mult.value;
            const difference = Math.abs(total - amount);
            
            if (difference < minDifference && total >= amount) {
                minDifference = difference;
                bestMatch = mult;
            }
        });
        
        if (bestMatch) {
            console.log(`📊 Menggunakan multiplier ${bestMatch.text} (Rp ${(baseAmount * bestMatch.value).toLocaleString()})`);
            
            const multipliers = bottomSheet.querySelectorAll('[class*="multiplier"], [class*="line-item"], button');
            multipliers.forEach(mult => {
                if (mult.textContent.trim().includes(bestMatch.text)) {
                    mult.style.cssText = `
                        border: 2px solid #FF9900 !important;
                        background-color: rgba(255, 153, 0, 0.2) !important;
                    `;
                    
                    if (!mult.classList.contains('active')) {
                        setTimeout(() => {
                            mult.click();
                            console.log(`🖱️ Mengklik multiplier ${bestMatch.text}`);
                        }, 100);
                    }
                }
            });
            
            setTimeout(() => proceedWithBetting(bottomSheet), 1000);
        } else {
            console.log("❌ Tidak ada multiplier yang cocok, menggunakan default 1000");
            
            // Coba set ke 1000
            const input = bottomSheet.querySelector('input[type="tel"]');
            if (input) {
                input.value = '1';
                triggerInputEvent(input, '1');
            }
            
            setTimeout(() => proceedWithBetting(bottomSheet), 1000);
        }
    }
    
    // Lanjutkan dengan proses betting
    function proceedWithBetting(bottomSheet) {
        console.log("➡️ Melanjutkan ke langkah berikutnya...");
        
        // 1. Cek dan klik checkbox setuju
        setTimeout(() => {
            checkAgreeCheckbox(bottomSheet);
        }, 500);
        
        // 2. Klik tombol konfirmasi
        setTimeout(() => {
            clickConfirmButton(bottomSheet);
        }, 1000);
    }
    
    // Aktifkan checkbox setuju
    function checkAgreeCheckbox(bottomSheet) {
        const agreeSelectors = [
            '.Betting__Popup-agree',
            '[class*="agree"]',
            '[class*="checkbox"]',
            'input[type="checkbox"]'
        ];
        
        let agreeCheckbox = null;
        for (let selector of agreeSelectors) {
            agreeCheckbox = bottomSheet.querySelector(selector);
            if (agreeCheckbox) break;
        }
        
        if (!agreeCheckbox) {
            console.log("❌ Checkbox setuju tidak ditemukan");
            return;
        }
        
        // Cek status
        const isChecked = agreeCheckbox.checked || 
                         agreeCheckbox.classList.contains('active') || 
                         agreeCheckbox.getAttribute('aria-checked') === 'true';
        
        if (!isChecked) {
            console.log("✅ Mengaktifkan checkbox setuju");
            
            // Coba berbagai metode klik
            agreeCheckbox.click();
            
            // Untuk checkbox input
            if (agreeCheckbox.type === 'checkbox') {
                agreeCheckbox.checked = true;
                triggerChangeEvent(agreeCheckbox, true);
            }
            
            // Highlight
            agreeCheckbox.style.cssText = `
                color: #00FF00 !important;
                font-weight: bold !important;
                border: 1px solid #00FF00 !important;
            `;
        } else {
            console.log("✅ Checkbox setuju sudah aktif");
        }
    }
    
    // Klik tombol konfirmasi
    function clickConfirmButton(bottomSheet) {
        const confirmSelectors = [
            '.Betting__Popup-foot-s',
            '[class*="confirm"]',
            '[class*="submit"]',
            'button:contains("Confirm")',
            'button:contains("Konfirmasi")',
            'button:contains("Bet")',
            'button:contains("TARUH")'
        ];
        
        let confirmButton = null;
        for (let selector of confirmSelectors) {
            if (selector.includes('contains')) {
                // Handle text contains
                const buttons = bottomSheet.querySelectorAll('button');
                for (let btn of buttons) {
                    if (btn.textContent.includes('Confirm') || 
                        btn.textContent.includes('Konfirmasi') ||
                        btn.textContent.includes('Bet') ||
                        btn.textContent.includes('TARUH')) {
                        confirmButton = btn;
                        break;
                    }
                }
            } else {
                confirmButton = bottomSheet.querySelector(selector);
            }
            if (confirmButton) break;
        }
        
        if (!confirmButton) {
            console.log("❌ Tombol konfirmasi tidak ditemukan");
            
            // Coba cari tombol dengan warna hijau/biru
            const coloredButtons = bottomSheet.querySelectorAll('button');
            coloredButtons.forEach(btn => {
                const style = window.getComputedStyle(btn);
                if (style.backgroundColor.includes('rgb(0, 128') || 
                    style.backgroundColor.includes('rgb(0, 150') ||
                    style.backgroundColor.includes('rgb(76, 175')) {
                    confirmButton = btn;
                }
            });
            
            if (!confirmButton) {
                console.log("⚠️ Gagal menemukan tombol konfirmasi");
                return;
            }
        }
        
        const buttonText = confirmButton.textContent || '';
        console.log(`✅ Tombol konfirmasi ditemukan: ${buttonText.trim()}`);
        
        // Highlight kuat
        confirmButton.style.cssText = `
            border: 4px solid #FF0000 !important;
            box-shadow: 0 0 40px #FF0000 !important;
            background: linear-gradient(45deg, #FF0000, #FF5555) !important;
            color: white !important;
            font-weight: bold !important;
            font-size: 18px !important;
            transform: scale(1.1) !important;
            transition: all 0.3s !important;
            z-index: 999999 !important;
            position: relative !important;
        `;
        
        // Tambahkan animasi pulse
        confirmButton.style.animation = 'pulse 1s infinite';
        
        if (!document.querySelector('#pulse-animation')) {
            const style = document.createElement('style');
            style.id = 'pulse-animation';
            style.textContent = `
                @keyframes pulse {
                    0% { transform: scale(1); box-shadow: 0 0 40px #FF0000; }
                    50% { transform: scale(1.05); box-shadow: 0 0 60px #FF0000; }
                    100% { transform: scale(1); box-shadow: 0 0 40px #FF0000; }
                }
            `;
            document.head.appendChild(style);
        }
        
        console.log("🎯 Mengklik tombol konfirmasi dalam 2 detik...");
        
        setTimeout(() => {
            console.log("🖱️ Mengklik tombol konfirmasi...");
            confirmButton.click();
            
            // Coba berbagai event
            ['mousedown', 'mouseup', 'click'].forEach(eventType => {
                const event = new MouseEvent(eventType, {
                    bubbles: true,
                    cancelable: true
                });
                confirmButton.dispatchEvent(event);
            });
            
            console.log("✅ Bet dikonfirmasi!");
            
            // Reset untuk bet berikutnya
            setTimeout(() => {
                lastProcessedAmount = 0;
                console.log("🔄 Reset untuk bet berikutnya...");
            }, 3000);
        }, 2000);
    }
    
    // Fungsi untuk manual trigger
    window.triggerBetWithTimer = function(prediction, amount) {
        console.log("🎮 Manual trigger with timer check");
        
        const timerInfo = checkTimerStatus();
        if (timerInfo && timerInfo.seconds > 30) {
            console.log(`⏰ Timer masih ${timerInfo.text}, tunggu sampai < 30 detik`);
            return;
        }
        
        if (!prediction || !amount) {
            const betInfo = getBotPrediction();
            if (betInfo) {
                prediction = betInfo.prediction;
                amount = betInfo.amount;
            } else {
                prediction = 'BESAR';
                amount = 1000;
            }
        }
        
        console.log(`🎯 Manual bet: ${prediction} - Rp ${amount.toLocaleString()}`);
        
        if (clickBetButton(prediction)) {
            setTimeout(() => {
                const bottomSheet = document.querySelector('.van-popup.van-popup--bottom') || 
                                   document.querySelector('[class*="popup"]');
                if (bottomSheet) {
                    configureBettingAmount(bottomSheet, amount);
                } else {
                    console.log("❌ Bottom sheet tidak muncul");
                }
            }, 2000);
        }
    };
    
    // Debug function
    window.debugWingoBet = function() {
        console.log("\n🔧 DEBUG WINGO BET v5.3:");
        console.log("Status:", isAutoBetActive ? "🟢 AKTIF" : "🔴 NONAKTIF");
        console.log("Betting Window:", bettingWindowOpen ? "✅ TERBUKA" : "❌ TERTUTUP");
        console.log("Last Bet Time:", lastBetTime ? new Date(lastBetTime).toLocaleTimeString() : "Belum");
        console.log("Last Processed Amount:", lastProcessedAmount);
        
        const timerInfo = checkTimerStatus();
        if (timerInfo) {
            console.log(`⏱️ Timer: ${timerInfo.text} (${timerInfo.seconds} detik)`);
            console.log(`Betting Open? ${timerInfo.isBettingOpen ? '✅' : '❌'}`);
        }
        
        console.log("\n🔍 ELEMEN DI HALAMAN:");
        console.log("Tombol BESAR:", document.querySelector('.Betting__C-foot-b') ? "✅" : "❌");
        console.log("Tombol KECIL:", document.querySelector('.Betting__C-foot-s') ? "✅" : "❌");
        console.log("Bottom Sheet:", document.querySelector('.van-popup.van-popup--bottom') ? "✅" : "❌");
        
        const btn = document.querySelector('.Betting__C-foot-b');
        if (btn) {
            const style = window.getComputedStyle(btn);
            console.log("\n📊 STATUS TOMBOL BESAR:");
            console.log("Disabled attr:", btn.disabled);
            console.log("Disabled class:", btn.classList.contains('disabled'));
            console.log("Opacity:", style.opacity);
            console.log("Pointer events:", style.pointerEvents);
            console.log("Cursor:", style.cursor);
            console.log("Vue instance:", btn.__vue__ || btn.__vueParent || "Tidak ada");
        }
        
        if (window.wingoBetData) {
            console.log("\n🤖 BOT DATA:");
            console.log(window.wingoBetData.getBetInfo());
        }
    };
    
    // Test input function - khusus untuk testing amount 1000
    window.testInput1000 = function() {
        console.log("🧪 Testing input 1000 (multiplier 1)...");
        
        // Coba klik tombol BESAR manual
        const btn = document.querySelector('.Betting__C-foot-b');
        if (btn) {
            btn.click();
            
            setTimeout(() => {
                const bottomSheet = document.querySelector('.van-popup.van-popup--bottom');
                if (bottomSheet) {
                    console.log("✅ Bottom sheet muncul");
                    
                    // Cari input
                    const input = bottomSheet.querySelector('input[type="tel"]');
                    if (input) {
                        console.log("✅ Input ditemukan, type:", input.type);
                        console.log("Current value:", input.value);
                        
                        // Coba isi dengan metode khusus untuk 1
                        input.focus();
                        input.value = '1';
                        
                        // Trigger berbagai event
                        ['input', 'change', 'blur'].forEach(eventType => {
                            const event = new Event(eventType, { bubbles: true });
                            input.dispatchEvent(event);
                        });
                        
                        console.log("Set value to 1");
                        console.log("New value:", input.value);
                        
                        // Coba klik di luar
                        setTimeout(() => {
                            bottomSheet.click();
                        }, 200);
                    } else {
                        console.log("❌ Input tidak ditemukan");
                    }
                } else {
                    console.log("❌ Bottom sheet tidak muncul");
                }
            }, 1500);
        }
    };
    
    // Auto-start detection
    setTimeout(() => {
        console.log("🌐 Website Wingo terdeteksi");
        
        setInterval(() => {
            if (isAutoBetActive) {
                const timerInfo = checkTimerStatus();
                if (timerInfo && timerInfo.seconds <= 5) {
                    console.log("🚨 Timer hampir habis, bersiap untuk round berikutnya...");
                    lastProcessedAmount = 0;
                }
            }
        }, 10000);
        
        if (window.wingoBetData && window.wingoBetData.prediction) {
            console.log("🤖 Bot data tersedia, ketik 'startAutoBet()' untuk mulai");
        }
    }, 3000);
    
    console.log("✅ Auto-bet Wingo v5.3 loaded!");
    console.log("\n🛠️ PERINTAH:");
    console.log("   startAutoBet()        - Mulai auto-bet");
    console.log("   stopAutoBet()         - Hentikan auto-bet");
    console.log("   triggerBetWithTimer() - Manual trigger dengan cek timer");
    console.log("   debugWingoBet()       - Debug status detail");
    console.log("   testInput1000()       - Test input filling untuk 1000");
    console.log("\n⚡ Perbaikan v5.3:");
    console.log("   • Fix khusus untuk amount 1000 (multiplier 1)");
    console.log("   • waitForElement untuk input yang lebih reliable");
    console.log("   • Metode khusus untuk nilai '1'");
    console.log("   • Fallback yang lebih agresif untuk amount 1000");
})();
