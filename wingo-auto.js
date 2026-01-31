// wingo-auto.js - Auto Bet Script for WinGo
(function() {
    console.clear();
    console.log("🤖 WINGO AUTO-BET v2.0");
    console.log("=".repeat(50));
    
    // ========= CONFIG =========
    const CONFIG = {
        autoClickConfirm: false, // false = semi-auto, true = full-auto
        minTimeLeft: 15,         // minimal waktu untuk bet (detik)
        checkInterval: 2000,     // cek setiap 2 detik
        debugMode: true,
        
        // Selectors dari hasil debug
        selectors: {
            bigButton: '.Betting__C-foot-b',
            smallButton: '.Betting__C-foot-s',
            betArea: '.Betting__C'
        }
    };
    
    // ========= STATE =========
    let currentRound = null;
    let isBetting = false;
    let betCount = 0;
    let lastPrediction = null;
    
    // ========= FUNGSI UTAMA =========
    
    // 1. Cek apakah bot prediksi sudah load
    function waitForPredictionBot(maxWait = 10000) {
        return new Promise((resolve) => {
            let attempts = 0;
            const maxAttempts = maxWait / 500;
            
            function check() {
                attempts++;
                
                if (window.wingoBot && window.wingoBot.currentPrediction) {
                    console.log("✅ Bot prediksi ditemukan!");
                    console.log(`   Prediksi: ${window.wingoBot.currentPrediction}`);
                    console.log(`   Amount: ${window.wingoBot.currentBetAmount}`);
                    resolve(true);
                    return;
                }
                
                if (attempts < maxAttempts) {
                    setTimeout(check, 500);
                } else {
                    console.warn("⚠️ Bot prediksi tidak ditemukan, menggunakan default");
                    resolve(false);
                }
            }
            
            check();
        });
    }
    
    // 2. Ambil prediksi dari bot
    function getCurrentPrediction() {
        // Priority 1: dari wingoBot
        if (window.wingoBot && window.wingoBot.currentPrediction) {
            return {
                prediction: window.wingoBot.currentPrediction,
                amount: window.wingoBot.currentBetAmount || 1000,
                source: 'bot'
            };
        }
        
        // Priority 2: dari localStorage (backup)
        const savedPred = localStorage.getItem('wingo_last_prediction');
        if (savedPred) {
            return {
                prediction: savedPred,
                amount: 1000,
                source: 'localStorage'
            };
        }
        
        // Priority 3: default
        return {
            prediction: "BESAR",
            amount: 1000,
            source: 'default'
        };
    }
    
    // 3. Deteksi round dan timer
    function getGameInfo() {
        const betArea = document.querySelector(CONFIG.selectors.betArea);
        if (!betArea) return null;
        
        const allText = betArea.innerText || betArea.textContent || '';
        
        // Cari timer (format: XXs atau XX:XX)
        let timeMatch = allText.match(/(\d{1,2})\s*:\s*(\d{2})|(\d+)\s*s/i);
        let secondsLeft = 0;
        
        if (timeMatch) {
            secondsLeft = timeMatch[3] ? parseInt(timeMatch[3]) : 
                         (parseInt(timeMatch[1]) * 60 + parseInt(timeMatch[2]));
        }
        
        // Cari round number
        let roundMatch = allText.match(/(\d{6,})|Issue\s*(\d+)|Round\s*(\d+)/i);
        let roundNumber = roundMatch ? (roundMatch[1] || roundMatch[2] || roundMatch[3]) : 
                        `R${Date.now() % 10000}`;
        
        const isLocked = secondsLeft < 10;
        
        return {
            round: roundNumber,
            secondsLeft: secondsLeft,
            isLocked: isLocked,
            rawText: allText.substring(0, 150)
        };
    }
    
    // 4. Place bet
    async function placeBet() {
        if (isBetting) {
            console.log("⏳ Sedang proses bet...");
            return false;
        }
        
        isBetting = true;
        
        try {
            // Cek game info
            const gameInfo = getGameInfo();
            if (!gameInfo) {
                console.error("❌ Tidak bisa baca info game");
                return false;
            }
            
            // Cek waktu
            if (gameInfo.isLocked || gameInfo.secondsLeft < CONFIG.minTimeLeft) {
                console.log(`⏰ Waktu ${gameInfo.secondsLeft}s, tunggu round berikutnya`);
                return false;
            }
            
            // Ambil prediksi
            const { prediction, amount, source } = getCurrentPrediction();
            
            console.log(`\n🎯 BET #${++betCount} - Round ${gameInfo.round}`);
            console.log(`   Prediksi: ${prediction} (${source})`);
            console.log(`   Amount: ${amount}`);
            console.log(`   Waktu: ${gameInfo.secondsLeft}s`);
            
            // Pilih tombol
            const selector = prediction === "BESAR" 
                ? CONFIG.selectors.bigButton 
                : CONFIG.selectors.smallButton;
            
            const betButton = document.querySelector(selector);
            
            if (!betButton) {
                console.error(`❌ Tombol ${prediction} tidak ditemukan`);
                return false;
            }
            
            // Klik tombol pilihan
            console.log(`🖱️ Klik ${prediction}...`);
            betButton.click();
            
            // Tunggu modal muncul
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Cari tombol Konfirmasi
            const confirmButton = findConfirmButton();
            
            if (confirmButton) {
                if (CONFIG.autoClickConfirm) {
                    // Full auto - klik otomatis
                    console.log("🤖 Auto-klik Konfirmasi...");
                    confirmButton.click();
                    console.log("✅ Bet ditempatkan!");
                    showNotification(`BET ${prediction} - ${amount} Ditempatkan!`, 'success');
                } else {
                    // Semi-auto - highlight saja
                    console.log("🎯 Tombol Konfirmasi disorot!");
                    highlightConfirmButton(confirmButton);
                    showNotification(`KLIK KONFIRMASI untuk ${prediction} - ${amount}`, 'warning');
                }
                
                // Simpan prediksi terakhir
                lastPrediction = { prediction, amount, round: gameInfo.round };
                localStorage.setItem('wingo_last_prediction', prediction);
                
                return true;
            } else {
                console.error("❌ Tombol Konfirmasi tidak muncul");
                return false;
            }
            
        } catch (error) {
            console.error("❌ Error:", error);
            return false;
        } finally {
            isBetting = false;
        }
    }
    
    // 5. Cari tombol Konfirmasi
    function findConfirmButton() {
        const buttons = document.querySelectorAll('button');
        for (let btn of buttons) {
            const text = btn.innerText || btn.textContent || '';
            if (text.includes('Konfirmasi') || text.includes('Confirm')) {
                return btn;
            }
        }
        return null;
    }
    
    // 6. Highlight tombol Konfirmasi
    function highlightConfirmButton(button) {
        // Simpan style asli
        const originalStyle = button.style.cssText;
        
        // Apply highlight style
        button.style.cssText += `
            border: 4px solid #FF0000 !important;
            box-shadow: 0 0 30px #FF0000 !important;
            background: linear-gradient(45deg, #FF0000, #FF3333) !important;
            color: white !important;
            font-weight: bold !important;
            transform: scale(1.1) !important;
            transition: all 0.3s !important;
            z-index: 9999 !important;
            position: relative !important;
        `;
        
        // Efek berdenyut
        let pulse = true;
        const pulseInterval = setInterval(() => {
            button.style.boxShadow = pulse 
                ? "0 0 40px #FF0000 !important" 
                : "0 0 20px #FF0000 !important";
            pulse = !pulse;
        }, 500);
        
        // Reset setelah 30 detik
        setTimeout(() => {
            clearInterval(pulseInterval);
            button.style.cssText = originalStyle;
        }, 30000);
    }
    
    // 7. Notifikasi
    function showNotification(message, type = 'info') {
        const colors = {
            success: '#4CAF50',
            warning: '#FF9800',
            info: '#2196F3',
            error: '#F44336'
        };
        
        const notification = document.createElement('div');
        notification.innerHTML = `
            <div style="
                position: fixed;
                top: 20px;
                right: 20px;
                background: ${colors[type]};
                color: white;
                padding: 15px 25px;
                border-radius: 10px;
                z-index: 99999;
                box-shadow: 0 10px 25px rgba(0,0,0,0.2);
                font-family: Arial, sans-serif;
                font-weight: bold;
                animation: slideIn 0.5s ease-out;
                border: 2px solid white;
                max-width: 300px;
            ">
                🤖 ${message}
            </div>
            <style>
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            </style>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 5000);
    }
    
    // 8. Monitor round
    function startRoundMonitor() {
        console.log("🔍 Memulai monitor round...");
        
        let lastDetectedRound = null;
        
        return setInterval(() => {
            const gameInfo = getGameInfo();
            
            if (!gameInfo) {
                if (CONFIG.debugMode) console.log("⏳ Menunggu game info...");
                return;
            }
            
            // Deteksi round baru
            if (gameInfo.round !== lastDetectedRound && 
                gameInfo.secondsLeft > CONFIG.minTimeLeft) {
                
                console.log(`\n🔄 Round baru: ${gameInfo.round} (${gameInfo.secondsLeft}s)`);
                lastDetectedRound = gameInfo.round;
                
                // Tunggu 2 detik lalu place bet
                setTimeout(() => {
                    placeBet();
                }, 2000);
            }
            
        }, CONFIG.checkInterval);
    }
    
    // ========= INITIALIZATION =========
    async function init() {
        console.log("🚀 Inisialisasi Auto-Bet...");
        
        // Tunggu bot prediksi
        await waitForPredictionBot();
        
        // Start monitor
        const monitorInterval = startRoundMonitor();
        
        // Place bet untuk round saat ini
        setTimeout(() => {
            const gameInfo = getGameInfo();
            if (gameInfo && gameInfo.secondsLeft > CONFIG.minTimeLeft) {
                console.log("🎯 Memproses bet untuk round saat ini...");
                placeBet();
            }
        }, 3000);
        
        // Expose ke window
        window.wingoAuto = {
            // Control
            betNow: () => placeBet(),
            stop: () => {
                clearInterval(monitorInterval);
                console.log("⏹️ Auto-bet dihentikan");
            },
            start: () => {
                clearInterval(monitorInterval);
                startRoundMonitor();
                console.log("▶️ Auto-bet dimulai");
            },
            
            // Config
            setAutoConfirm: (auto) => {
                CONFIG.autoClickConfirm = auto;
                console.log(`✅ Mode: ${auto ? 'FULL AUTO' : 'SEMI-AUTO'}`);
            },
            setMinTime: (seconds) => {
                CONFIG.minTimeLeft = seconds;
                console.log(`✅ Min time: ${seconds}s`);
            },
            
            // Info
            getStatus: () => ({
                isBetting,
                betCount,
                lastPrediction,
                currentRound,
                config: { ...CONFIG }
            }),
            
            // Debug
            debug: () => {
                console.log("🔍 Debug Info:");
                console.log("Game Info:", getGameInfo());
                console.log("Prediction:", getCurrentPrediction());
                console.log("Selectors:", CONFIG.selectors);
                console.log("Window.wingoBot:", window.wingoBot);
            }
        };
        
        console.log("\n✅ Auto-Bet siap!");
        console.log("📝 Perintah di console:");
        console.log("   wingoAuto.betNow()        - Bet manual");
        console.log("   wingoAuto.setAutoConfirm(true) - Full auto");
        console.log("   wingoAuto.debug()         - Debug info");
        console.log("   wingoAuto.stop()          - Stop auto-bet");
    }
    
    // Jalankan init
    init();
    
})();
