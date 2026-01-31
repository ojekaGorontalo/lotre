/* ========= AUTO-BET WINGO v5 - OPTIMIZED ========= */
(function() {
    console.log("🤖 AUTO-BET WINGO v5 - Optimized");
    
    let isAutoBetActive = false;
    let autoBetInterval = null;
    let lastProcessedAmount = 0;
    
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
        }, 3000);
        
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
    
    // Fungsi utama
    function checkAndPlaceBet() {
        if (!isAutoBetActive) return;
        
        console.log(`\n🔄 Auto-bet check at ${new Date().toLocaleTimeString()}`);
        
        // 1. Dapatkan prediksi dari bot
        const betInfo = getBotPrediction();
        if (!betInfo) {
            console.log("⏳ Menunggu prediksi dari bot...");
            return;
        }
        
        // 2. Cegah duplikasi processing untuk amount yang sama
        if (betInfo.amount === lastProcessedAmount) {
            console.log("⏳ Amount sama, tunggu prediksi baru...");
            return;
        }
        
        // 3. Klik tombol betting
        if (!clickBetButton(betInfo.prediction)) {
            console.log("⏳ Tombol betting belum tersedia...");
            return;
        }
        
        lastProcessedAmount = betInfo.amount;
        
        // 4. Tunggu bottom sheet muncul dan proses
        setTimeout(() => {
            processBottomSheet(betInfo.amount);
        }, 1500);
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
        
        // Cek jika tombol disabled
        if (button.disabled || button.classList.contains('disabled')) {
            console.log(`⏳ Tombol ${prediction} disabled`);
            return false;
        }
        
        console.log(`✅ Tombol ${prediction} ditemukan, mengklik...`);
        
        // Simpan style asli
        const originalStyle = button.style.cssText;
        
        // Highlight tombol
        button.style.cssText = `
            ${originalStyle}
            border: 3px solid #00FF00 !important;
            box-shadow: 0 0 20px #00FF00 !important;
            background-color: rgba(0, 255, 0, 0.3) !important;
        `;
        
        // Klik tombol
        button.click();
        
        // Restore style setelah 1 detik
        setTimeout(() => {
            button.style.cssText = originalStyle;
        }, 1000);
        
        return true;
    }
    
    // Proses bottom sheet
    function processBottomSheet(amount) {
        // Tunggu bottom sheet muncul
        const maxWaitTime = 3000;
        const startTime = Date.now();
        
        const waitForBottomSheet = () => {
            const bottomSheet = document.querySelector('.van-popup.van-popup--bottom');
            
            if (bottomSheet && bottomSheet.style.display !== 'none') {
                console.log("✅ Bottom sheet ditemukan");
                configureBettingAmount(bottomSheet, amount);
                return;
            }
            
            if (Date.now() - startTime < maxWaitTime) {
                setTimeout(waitForBottomSheet, 100);
            } else {
                console.log("❌ Bottom sheet tidak muncul setelah 3 detik");
            }
        };
        
        waitForBottomSheet();
    }
    
    // Konfigurasi jumlah taruhan
    function configureBettingAmount(bottomSheet, amount) {
        console.log(`💰 Mengatur jumlah taruhan: Rp ${amount.toLocaleString()}`);
        
        // Strategi 1: Coba gunakan input jika tersedia
        const input = bottomSheet.querySelector('input[type="tel"]');
        if (input) {
            console.log("✅ Input ditemukan, menggunakan metode input");
            
            // Base amount biasanya 1000, hitung multiplier
            const baseAmount = 1000;
            const multiplier = amount / baseAmount;
            
            if (Number.isInteger(multiplier) && multiplier >= 1 && multiplier <= 100) {
                console.log(`🔢 Mengisi input dengan: ${multiplier}`);
                input.value = multiplier;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
                console.log(`⚠️ Multiplier ${multiplier} tidak valid, fallback ke metode nominal`);
                selectNominalAmount(bottomSheet, amount);
            }
        } else {
            console.log("❌ Input tidak ditemukan, menggunakan metode nominal");
            selectNominalAmount(bottomSheet, amount);
        }
        
        // Pastikan checkbox setuju aktif
        setTimeout(() => {
            checkAgreeCheckbox(bottomSheet);
        }, 500);
        
        // Klik tombol konfirmasi
        setTimeout(() => {
            clickConfirmButton(bottomSheet);
        }, 1000);
    }
    
    // Pilih nominal amount dari opsi yang tersedia
    function selectNominalAmount(bottomSheet, amount) {
        const multipliers = bottomSheet.querySelectorAll('[class*="line-item"]');
        let found = false;
        
        // Cari nominal yang tepat
        multipliers.forEach(mult => {
            const text = mult.textContent.trim();
            const numericValue = parseInt(text.replace(/[^\d]/g, ''));
            
            if (!isNaN(numericValue) && numericValue === amount) {
                console.log(`✅ Nominal ditemukan: ${text}`);
                
                // Klik jika belum aktif
                if (!mult.classList.contains('bgcolor')) {
                    mult.click();
                    console.log(`🖱️ Mengklik nominal ${text}`);
                }
                found = true;
            }
        });
        
        if (!found) {
            console.log(`❌ Nominal ${amount} tidak ditemukan, menggunakan pendekatan terdekat`);
            
            // Fallback: coba gunakan kombinasi multiplier
            useMultiplierFallback(bottomSheet, amount);
        }
    }
    
    // Fallback menggunakan multiplier
    function useMultiplierFallback(bottomSheet, amount) {
        const baseAmount = 1000;
        const targetMultiplier = amount / baseAmount;
        
        console.log(`🎯 Mencari multiplier untuk: ${targetMultiplier}x`);
        
        // Cari multiplier yang tersedia
        const availableMultipliers = [
            { text: 'X1', value: 1 },
            { text: 'X5', value: 5 },
            { text: 'X10', value: 10 },
            { text: 'X20', value: 20 },
            { text: 'X50', value: 50 },
            { text: 'X100', value: 100 }
        ];
        
        // Cari yang paling mendekati
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
            
            // Cari dan klik element multiplier
            const multipliers = bottomSheet.querySelectorAll('[class*="line-item"]');
            multipliers.forEach(mult => {
                if (mult.textContent.trim() === bestMatch.text) {
                    if (!mult.classList.contains('bgcolor')) {
                        mult.click();
                        console.log(`🖱️ Mengklik multiplier ${bestMatch.text}`);
                    }
                }
            });
        } else {
            console.log("❌ Tidak ada multiplier yang cocok");
        }
    }
    
    // Aktifkan checkbox setuju
    function checkAgreeCheckbox(bottomSheet) {
        const agreeCheckbox = bottomSheet.querySelector('.Betting__Popup-agree');
        if (!agreeCheckbox) {
            console.log("❌ Checkbox setuju tidak ditemukan");
            return;
        }
        
        if (!agreeCheckbox.classList.contains('active')) {
            console.log("✅ Mengaktifkan checkbox setuju");
            agreeCheckbox.click();
            
            // Highlight
            agreeCheckbox.style.cssText = `
                color: #00FF00 !important;
                font-weight: bold !important;
            `;
        } else {
            console.log("✅ Checkbox setuju sudah aktif");
        }
    }
    
    // Klik tombol konfirmasi
    function clickConfirmButton(bottomSheet) {
        const confirmButton = bottomSheet.querySelector('.Betting__Popup-foot-s');
        if (!confirmButton) {
            console.log("❌ Tombol konfirmasi tidak ditemukan");
            return;
        }
        
        // Verifikasi amount di tombol
        const buttonText = confirmButton.textContent || '';
        console.log(`✅ Tombol konfirmasi: ${buttonText.trim()}`);
        
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
        `;
        
        // Tambahkan animasi
        confirmButton.style.animation = 'pulse 1s infinite';
        
        // Buat animasi pulse jika belum ada
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
        
        // Auto-click setelah 2 detik
        setTimeout(() => {
            confirmButton.click();
            console.log("✅ Bet dikonfirmasi!");
            
            // Reset lastProcessedAmount setelah konfirmasi
            setTimeout(() => {
                lastProcessedAmount = 0;
            }, 2000);
        }, 2000);
    }
    
    // Fungsi untuk manual trigger
    window.triggerBet = function(prediction, amount) {
        console.log(`🎮 Manual trigger: ${prediction} - Rp ${amount}`);
        
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
        
        clickBetButton(prediction);
        
        setTimeout(() => {
            const bottomSheet = document.querySelector('.van-popup.van-popup--bottom');
            if (bottomSheet) {
                configureBettingAmount(bottomSheet, amount);
            }
        }, 1500);
    };
    
    // Debug function
    window.debugWingoBet = function() {
        console.log("\n🔧 DEBUG WINGO BET v5:");
        console.log("Status:", isAutoBetActive ? "🟢 AKTIF" : "🔴 NONAKTIF");
        console.log("Last Processed Amount:", lastProcessedAmount);
        
        // Cek ketersediaan elemen
        console.log("\n🔍 ELEMEN DI HALAMAN:");
        console.log("Tombol BESAR:", document.querySelector('.Betting__C-foot-b') ? "✅" : "❌");
        console.log("Tombol KECIL:", document.querySelector('.Betting__C-foot-s') ? "✅" : "❌");
        console.log("Bottom Sheet:", document.querySelector('.van-popup.van-popup--bottom') ? "✅" : "❌");
        
        // Cek bot data
        if (window.wingoBetData) {
            console.log("\n🤖 BOT DATA:");
            console.log(window.wingoBetData.getBetInfo());
        }
    };
    
    // Auto-start detection
    setTimeout(() => {
        console.log("🌐 Website Wingo terdeteksi");
        
        // Jika sudah ada bot data, beri opsi auto-start
        if (window.wingoBetData && window.wingoBetData.prediction) {
            console.log("🤖 Bot data tersedia, ketik 'startAutoBet()' untuk mulai");
        }
    }, 3000);
    
    console.log("✅ Auto-bet Wingo v5 loaded!");
    console.log("\n🛠️ PERINTAH:");
    console.log("   startAutoBet()      - Mulai auto-bet");
    console.log("   stopAutoBet()       - Hentikan auto-bet");
    console.log("   triggerBet()        - Manual trigger bet");
    console.log("   debugWingoBet()     - Debug status");
    console.log("\n⚡ Fitur:");
    console.log("   • Deteksi bottom sheet otomatis");
    console.log("   • Support input dan nominal amount");
    console.log("   • Auto-click konfirmasi");
    console.log("   • Highlight visual untuk debugging");
})();
