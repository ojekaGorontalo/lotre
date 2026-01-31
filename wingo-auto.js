// SIMPLE AUTO-BET v2
(function() {
    console.log("🎮 AUTO-BET SIMPLE");
    
    let checkCount = 0;
    const maxChecks = 20; // 20x500ms = 10 detik
    
    function waitForBot() {
        checkCount++;
        
        if (window.wingoBot && window.wingoBot.currentPrediction) {
            console.log("✅ Bot ditemukan!");
            console.log("Prediksi:", window.wingoBot.currentPrediction);
            console.log("Amount:", window.wingoBot.currentBetAmount);
            startBetting();
            return;
        }
        
        if (checkCount < maxChecks) {
            console.log(`⏳ Menunggu bot... (${checkCount}/${maxChecks})`);
            setTimeout(waitForBot, 500);
        } else {
            console.error("❌ Bot tidak ditemukan setelah 10 detik");
            manualBet();
        }
    }
    
    function startBetting() {
        const prediction = window.wingoBot.currentPrediction;
        const amount = window.wingoBot.currentBetAmount;
        
        console.log(`🎯 Akan bet: ${prediction} - ${amount}`);
        
        // Cari tombol
        const betArea = document.querySelector('.Betting__C-foot');
        if (!betArea) {
            console.log("⏳ Menunggu tombol muncul...");
            setTimeout(startBetting, 1000);
            return;
        }
        
        const bigBtn = betArea.querySelector('.Betting__C-foot-b');
        const smallBtn = betArea.querySelector('.Betting__C-foot-s');
        
        const targetBtn = prediction === "BESAR" ? bigBtn : smallBtn;
        
        if (targetBtn) {
            targetBtn.click();
            console.log(`✅ Klik ${prediction}`);
            
            // Tunggu modal
            setTimeout(() => {
                const allButtons = document.querySelectorAll('button');
                allButtons.forEach(btn => {
                    const text = btn.innerText || btn.textContent || '';
                    if (text.includes('Konfirmasi')) {
                        btn.style.cssText = `
                            border: 4px solid #00FF00 !important;
                            box-shadow: 0 0 30px #00FF00 !important;
                            background: #003300 !important;
                            color: white !important;
                            font-weight: bold !important;
                            animation: pulse 1s infinite;
                        `;
                        console.log("🎯 TOMBOL KONFIRMASI DISOROT!");
                        console.log("KLIK SEKARANG!");
                    }
                });
            }, 800);
        }
    }
    
    function manualBet() {
        console.log("🎯 Manual bet mode");
        // Fallback ke BESAR jika bot tidak ada
        const betArea = document.querySelector('.Betting__C-foot');
        if (betArea) {
            const bigBtn = betArea.querySelector('.Betting__C-foot-b');
            if (bigBtn) {
                bigBtn.click();
                console.log("✅ Klik BESAR (manual)");
            }
        }
    }
    
    // Start
    waitForBot();
})();
