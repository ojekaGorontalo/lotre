/* ========= AUTO-BET INTEGRATION v2 ========= */
(function() {
    console.log("🤖 AUTO-BET INTEGRATION v2 - Start...");
    
    let isAutoBetActive = false;
    let autoBetInterval = null;
    let lastAutoBetPrediction = null;
    
    // Fungsi untuk memulai auto-bet
    window.startAutoBet = function() {
        if (isAutoBetActive) {
            console.log("⚠️ Auto-bet sudah aktif");
            return;
        }
        
        isAutoBetActive = true;
        console.log("✅ Auto-bet diaktifkan");
        
        // Cek setiap 2 detik untuk prediksi baru
        autoBetInterval = setInterval(() => {
            performAutoBet();
        }, 2000);
        
        // Lakukan auto-bet pertama
        setTimeout(performAutoBet, 500);
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
        removeHighlights();
    };
    
    // Fungsi utama untuk melakukan auto-bet
    function performAutoBet() {
        if (!isAutoBetActive) return;
        
        // Cek apakah bot memiliki prediksi baru
        if (!window.wingoBetData || !window.wingoBetData.prediction) {
            console.log("⏳ Menunggu prediksi dari bot...");
            return;
        }
        
        const currentPrediction = window.wingoBetData.prediction;
        const currentAmount = window.wingoBetData.amount;
        
        // Cek jika prediksi sama dengan sebelumnya
        if (currentPrediction === lastAutoBetPrediction) {
            return;
        }
        
        console.log(`🎯 Prediksi baru: ${currentPrediction} (Rp ${currentAmount.toLocaleString()})`);
        lastAutoBetPrediction = currentPrediction;
        
        // Cari area betting
        const betArea = findBettingArea();
        if (!betArea) {
            console.log("⏳ Menunggu area betting muncul...");
            return;
        }
        
        // Cari tombol yang sesuai
        const targetButton = findBetButton(betArea, currentPrediction);
        if (!targetButton) {
            console.log(`❌ Tombol ${currentPrediction} tidak ditemukan`);
            return;
        }
        
        // Lakukan klik
        console.log(`✅ Auto-bet: ${currentPrediction}`);
        simulateClick(targetButton);
        
        // Highlight dan konfirmasi
        highlightAndConfirm();
    }
    
    // Fungsi untuk mencari area betting
    function findBettingArea() {
        // Cari dengan berbagai selector yang mungkin
        const selectors = [
            '.Betting__C-foot',
            '.betting-area',
            '.betting-controls',
            '.bet-buttons',
            'div[class*="bet"]',
            'div[class*="Bet"]',
            'section:has(button)'
        ];
        
        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) {
                console.log(`🔍 Area betting ditemukan: ${selector}`);
                return element;
            }
        }
        
        // Jika tidak ditemukan, coba cari dengan teks
        const elements = document.querySelectorAll('button, div, span');
        for (const el of elements) {
            const text = (el.textContent || el.innerText || '').toLowerCase();
            if (text.includes('bet') || text.includes('besar') || text.includes('kecil')) {
                console.log("🔍 Area betting ditemukan berdasarkan teks");
                return el.parentElement || el;
            }
        }
        
        return null;
    }
    
    // Fungsi untuk mencari tombol betting
    function findBetButton(betArea, prediction) {
        const predictionLower = prediction.toLowerCase();
        
        // Cari berdasarkan class
        const classSelectors = {
            'besar': [
                '.Betting__C-foot-b',
                '.bet-big',
                '.bet-large',
                '.btn-big',
                'button[class*="besar"]',
                'button[class*="big"]'
            ],
            'kecil': [
                '.Betting__C-foot-s',
                '.bet-small',
                '.bet-little',
                '.btn-small',
                'button[class*="kecil"]',
                'button[class*="small"]'
            ]
        };
        
        const selectors = classSelectors[predictionLower] || [];
        for (const selector of selectors) {
            const button = betArea.querySelector(selector) || document.querySelector(selector);
            if (button) {
                console.log(`🔍 Tombol ditemukan dengan selector: ${selector}`);
                return button;
            }
        }
        
        // Cari berdasarkan teks
        const allButtons = document.querySelectorAll('button');
        for (const button of allButtons) {
            const text = (button.textContent || button.innerText || '').toLowerCase();
            if (predictionLower === 'besar' && text.includes('besar')) {
                console.log("🔍 Tombol BESAR ditemukan berdasarkan teks");
                return button;
            }
            if (predictionLower === 'kecil' && text.includes('kecil')) {
                console.log("🔍 Tombol KECIL ditemukan berdasarkan teks");
                return button;
            }
        }
        
        return null;
    }
    
    // Fungsi untuk mengklik tombol
    function simulateClick(element) {
        if (!element) return;
        
        try {
            // Coba semua jenis klik
            element.click();
            
            // Trigger event mouse
            const mouseEvents = ['mousedown', 'mouseup', 'click'];
            mouseEvents.forEach(eventType => {
                const event = new MouseEvent(eventType, {
                    view: window,
                    bubbles: true,
                    cancelable: true
                });
                element.dispatchEvent(event);
            });
            
            console.log("✅ Klik berhasil dilakukan");
        } catch (error) {
            console.error("❌ Gagal mengklik:", error);
        }
    }
    
    // Fungsi untuk highlight dan konfirmasi
    function highlightAndConfirm() {
        setTimeout(() => {
            // Highlight semua tombol konfirmasi
            const allButtons = document.querySelectorAll('button, .btn, [role="button"]');
            allButtons.forEach(btn => {
                const text = (btn.textContent || btn.innerText || '').toLowerCase();
                if (text.includes('konfirmasi') || text.includes('confirm') || text.includes('ok') || text.includes('bet')) {
                    // Tambahkan highlight
                    btn.style.cssText = `
                        border: 4px solid #00FF00 !important;
                        box-shadow: 0 0 30px #00FF00 !important;
                        background: linear-gradient(45deg, #003300, #00AA00) !important;
                        color: white !important;
                        font-weight: bold !important;
                        font-size: 16px !important;
                        animation: pulse 1s infinite;
                        position: relative !important;
                        z-index: 9999 !important;
                    `;
                    
                    // Tambahkan animasi pulse
                    if (!document.getElementById('pulse-animation')) {
                        const style = document.createElement('style');
                        style.id = 'pulse-animation';
                        style.textContent = `
                            @keyframes pulse {
                                0% { transform: scale(1); box-shadow: 0 0 30px #00FF00; }
                                50% { transform: scale(1.05); box-shadow: 0 0 50px #00FF00; }
                                100% { transform: scale(1); box-shadow: 0 0 30px #00FF00; }
                            }
                        `;
                        document.head.appendChild(style);
                    }
                    
                    console.log("🎯 TOMBOL KONFIRMASI DISOROT!");
                    console.log("🔔 PERHATIAN: KLIK TOMBOL INI UNTUK MENYELESAIKAN BET!");
                }
            });
        }, 1000);
    }
    
    // Fungsi untuk menghapus highlight
    function removeHighlights() {
        const highlightedButtons = document.querySelectorAll('button, .btn');
        highlightedButtons.forEach(btn => {
            btn.style.cssText = '';
        });
    }
    
    // Mode manual untuk testing
    window.testAutoBet = function(prediction) {
        console.log(`🧪 Test auto-bet: ${prediction || 'BESAR'}`);
        
        const betArea = findBettingArea();
        if (!betArea) {
            console.log("❌ Area betting tidak ditemukan");
            return;
        }
        
        const testPrediction = prediction || 'BESAR';
        const targetButton = findBetButton(betArea, testPrediction);
        
        if (targetButton) {
            simulateClick(targetButton);
            highlightAndConfirm();
        } else {
            console.log(`❌ Tombol ${testPrediction} tidak ditemukan`);
        }
    };
    
    // Tambahkan ke wingoBot untuk kontrol
    if (window.wingoBot) {
        window.wingoBot.autoBet = {
            start: window.startAutoBet,
            stop: window.stopAutoBet,
            test: window.testAutoBet
        };
    }
    
    console.log("✅ Auto-bet integration loaded!");
    console.log("🛠️ Perintah:");
    console.log("   startAutoBet()       - Mulai auto-bet");
    console.log("   stopAutoBet()        - Hentikan auto-bet");
    console.log("   testAutoBet('BESAR') - Test klik BESAR");
    console.log("   testAutoBet('KECIL') - Test klik KECIL");
    
    // Cek jika sudah ada wingoBetData
    setTimeout(() => {
        if (window.wingoBetData) {
            console.log("🤖 Wingobet data detected, ready for auto-bet!");
        }
    }, 3000);
})();
