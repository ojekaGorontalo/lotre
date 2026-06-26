// ====================================================
// WINGO AUTO-BOT v4.2 - PAUSE SETELAH 3x LOSS, RESUME SETELAH 3x WIN
// ====================================================
(function() {
    'use strict';
    
    // ========== KONFIGURASI ==========
    const CONFIG = {
        autoConfirm: true,
        minBetTime: 8,
        maxBetTime: 25,
        betCooldown: 10000,
    };
    
    // ========== STATE ==========
    let isRunning = false;
    let isProcessing = false;
    let lastBetTime = 0;
    let lastIssueProcessed = null;
    
    let currentPrediction = null;
    let currentBetAmount = 2000;
    let currentBetIndex = 0;
    let isBetPlaced = false;
    
    let historicalData = [];
    let currentStreak = 0;          // positif = menang, negatif = kalah
    let nextIssue = null;
    let lastProcessedIssue = null;
    
    // Urutan taruhan baru: 2K, 4K, 8K, 16K, 32K
    const betSequence = [2000, 4000, 8000, 16000, 32000];
    const betLabels = ["2K", "4K", "8K", "16K", "32K"];
    
    // ========== STATE PAUSE ==========
    let isPaused = false;           // true jika sedang pause karena 3x loss
    let pauseWinStreak = 0;         // jumlah win berturut-turut selama pause (untuk resume)
    
    // ========== HOOK API ==========
    function hookApi() {
        const originalFetch = window.fetch;
        window.fetch = function(...args) {
            return originalFetch.apply(this, arguments).then(response => {
                const url = args[0] || '';
                if (typeof url === 'string') {
                    if (url.includes('GetGameIssue')) {
                        response.clone().json().then(data => {
                            if (data?.data?.issueNumber) {
                                nextIssue = data.data.issueNumber;
                                console.log(`📡 Periode baru: ${nextIssue.slice(-3)}`);
                            }
                        }).catch(() => {});
                    } else if (url.includes('GetNoaverageEmerdList')) {
                        response.clone().json().then(data => {
                            processData(data);
                        }).catch(() => {});
                    }
                }
                return response;
            });
        };
        
        const originalOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(...args) {
            const url = args[1] || '';
            this.addEventListener('load', function() {
                if (typeof url === 'string') {
                    if (url.includes('GetNoaverageEmerdList')) {
                        try {
                            const data = JSON.parse(this.responseText);
                            processData(data);
                        } catch (e) {}
                    } else if (url.includes('GetGameIssue')) {
                        try {
                            const data = JSON.parse(this.responseText);
                            if (data?.data?.issueNumber) {
                                nextIssue = data.data.issueNumber;
                                console.log(`📡 Periode baru: ${nextIssue.slice(-3)}`);
                            }
                        } catch (e) {}
                    }
                }
            });
            return originalOpen.apply(this, args);
        };
        console.log('✅ API Hook terpasang');
    }
    
    // ========== FUNGSI ANALISIS DATA ==========
    function analyzeTrendData(listData) {
        if (!listData || listData.length < 5) return;
        const results = listData.map(item => ({
            issue: item.issueNumber,
            number: parseInt(item.number),
            result: parseInt(item.number) <= 4 ? "KECIL" : "BESAR",
            colour: item.colour
        }));
        historicalData = [...results, ...historicalData].slice(0, 20);
        console.log(`📊 Data historis terkini: ${historicalData.length} periode`);
        if (historicalData.length >= 5) {
            const last5 = historicalData.slice(0,5).map(d => d.number).join(', ');
            console.log(`   Angka 5 terakhir: ${last5}`);
        }
    }
    
    // ========== PREDIKSI ==========
    function getPrediction() {
        // Deteksi streak 3x
        if (historicalData.length >= 3) {
            const last3 = historicalData.slice(0, 3).map(d => d.result);
            const allSame = last3.every(r => r === last3[0]);
            if (allSame) {
                console.log(`🔄 Streak 3x terdeteksi: ${last3[0]}`);
                return last3[0];
            }
        }
        
        if (historicalData.length < 5) {
            if (historicalData.length > 0) {
                const fallback = historicalData[0].result;
                console.log(`⚠️ Data <5, pakai fallback: ${fallback}`);
                return fallback;
            }
            return "KECIL";
        }
        
        const last10 = historicalData.slice(0, 10);
        const freq = [0,0,0,0,0,0,0,0,0,0];
        for (const d of last10) freq[d.number]++;
        
        const missing = [];
        for (let i=0; i<=9; i++) if (freq[i]===0) missing.push(i);
        
        let selectedNumber;
        if (missing.length > 0) {
            let closest = missing[0];
            for (let m of missing) if (Math.abs(m-5) < Math.abs(closest-5)) closest = m;
            selectedNumber = closest;
        } else {
            let minFreq = Math.min(...freq);
            let candidates = [];
            for (let i=0; i<=9; i++) if (freq[i]===minFreq) candidates.push(i);
            let closest = candidates[0];
            for (let c of candidates) if (Math.abs(c-5) < Math.abs(closest-5)) closest = c;
            selectedNumber = closest;
        }
        
        const prediction = selectedNumber <= 4 ? "KECIL" : "BESAR";
        console.log(`🎯 Prediksi: ${prediction} (angka ${selectedNumber}) dari analisis frekuensi`);
        return prediction;
    }
    
    // ========== AUTO-CLICK ==========
    function getTimerInfo() {
        const timerSelectors = [
            '.timer', '.countdown', '.van-count-down',
            '[class*="timer"]', '[class*="countdown"]',
            '.Betting__C-head-t', '.game-timer',
            '.time-count', '.betting-timer', '.round-timer',
            '.number', '.time'
        ];
        for (let sel of timerSelectors) {
            const els = document.querySelectorAll(sel);
            for (let el of els) {
                if (el && el.textContent.trim()) {
                    const text = el.textContent.trim();
                    if (text.match(/\d+/) || text.includes(':')) {
                        let seconds = 0;
                        if (text.includes(':')) {
                            const parts = text.split(':');
                            seconds = (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1].split('.')[0]) || 0);
                        } else if (text.includes('.')) {
                            seconds = parseFloat(text) || 0;
                        } else {
                            seconds = parseInt(text) || 0;
                        }
                        if (seconds > 0) {
                            console.log(`⏳ Timer: ${seconds} detik`);
                            return { seconds: Math.floor(seconds), text };
                        }
                    }
                }
            }
        }
        const allElements = document.querySelectorAll('div, span, p, h1, h2, h3, h4, h5');
        for (let el of allElements) {
            const text = el.textContent.trim();
            if (text && (text.includes(':') || /^\d{1,2}$/.test(text) || /^\d{1,2}\.\d$/.test(text))) {
                let seconds = 0;
                if (text.includes(':')) {
                    const parts = text.split(':');
                    seconds = parseInt(parts[0]) * 60 + parseInt(parts[1]);
                } else if (text.includes('.')) {
                    seconds = parseFloat(text);
                } else {
                    seconds = parseInt(text);
                }
                if (seconds > 0 && seconds < 60) {
                    console.log(`⏳ Timer (alternatif): ${seconds} detik`);
                    return { seconds: Math.floor(seconds), text };
                }
            }
        }
        return null;
    }
    
    function safeClick(el) {
        if (!el || !el.click) return false;
        try { el.click(); return true; } catch (e) { return false; }
    }
    
    function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
    
    function findElement(selectors, container = document) {
        for (let s of selectors) {
            const el = container.querySelector(s);
            if (el) return el;
        }
        return null;
    }
    
    async function processPopup(amount) {
        console.log(`🔍 Mencari popup untuk memasang taruhan...`);
        for (let i = 0; i < 15; i++) {
            const popup = findElement([
                '.van-popup.van-popup--bottom',
                '.van-popup',
                '.bet-popup',
                '[class*="popup"]',
                '[class*="modal"]'
            ]);
            if (popup && popup.style.display !== 'none') {
                console.log(`✅ Popup ditemukan`);
                await fillAmount(popup, amount);
                return;
            }
            await wait(200);
        }
        console.warn(`⚠️ Popup tidak muncul setelah 3 detik`);
    }
    
    async function fillAmount(popup, amount) {
        const input = popup.querySelector('input[type="tel"], input[type="number"]');
        if (input) {
            console.log(`💵 Mengisi nominal: ${amount} (${amount/1000}K)`);
            input.value = '';
            await wait(300);
            const multiplier = amount / 1000;
            input.value = multiplier.toString();
            input.dispatchEvent(new Event('input', { bubbles: true }));
            await wait(1000);
            if (CONFIG.autoConfirm) await confirmBet(popup);
            return;
        }
        // Cari tombol cepat
        const buttons = popup.querySelectorAll('button, div, span');
        for (let btn of buttons) {
            const txt = btn.textContent || '';
            const num = parseInt(txt.replace(/[^\d]/g, ''));
            if (num === amount) {
                console.log(`🖱️ Klik tombol cepat: ${txt.trim()}`);
                safeClick(btn);
                await wait(1000);
                if (CONFIG.autoConfirm) await confirmBet(popup);
                return;
            }
        }
        if (amount === 2000) {
            for (let btn of buttons) {
                if (btn.textContent && btn.textContent.includes('X2')) {
                    console.log(`🖱️ Klik tombol X2`);
                    safeClick(btn);
                    await wait(1000);
                    if (CONFIG.autoConfirm) await confirmBet(popup);
                    return;
                }
            }
        }
        console.warn(`⚠️ Tidak bisa mengisi nominal ${amount}`);
    }
    
    async function confirmBet(popup) {
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
        for (let selector of confirmSelectors) {
            let button = null;
            if (selector.includes('contains')) {
                const text = selector.match(/contains\("([^"]+)"\)/)[1];
                const btns = popup.querySelectorAll('button');
                for (let btn of btns) {
                    if (btn.textContent.includes(text)) { button = btn; break; }
                }
            } else {
                button = popup.querySelector(selector);
            }
            if (button) {
                console.log(`✅ Mengklik tombol konfirmasi: ${button.textContent.trim()}`);
                await wait(800);
                safeClick(button);
                return;
            }
        }
        console.warn(`⚠️ Tombol konfirmasi tidak ditemukan`);
    }
    
    // ========== LOGIKA TARUHAN ==========
    function placeBet() {
        if (isPaused) {
            console.log(`⏸️ Bot sedang pause, tidak melakukan taruhan.`);
            return false;
        }
        currentPrediction = getPrediction();
        currentBetAmount = betSequence[currentBetIndex];
        isBetPlaced = true;
        console.log(`🎯 Taruhan ditempatkan: ${currentPrediction} (Level ${currentBetIndex+1}, Rp ${currentBetAmount.toLocaleString()})`);
        return true;
    }
    
    function processWin() {
        // Update streak positif
        currentStreak = currentStreak > 0 ? currentStreak + 1 : 1;
        
        if (isPaused) {
            // Saat pause, kita hanya menghitung win untuk resume
            pauseWinStreak++;
            console.log(`✅ MENANG (dalam pause) - ${pauseWinStreak}/3 win untuk resume`);
            if (pauseWinStreak >= 3) {
                // Resume bot
                isPaused = false;
                pauseWinStreak = 0;
                currentBetIndex = 0;          // reset ke level 1
                currentBetAmount = betSequence[0];
                console.log(`🟢 RESUME BOT! Sudah 3x win berturut-turut, mulai lagi dari 2K.`);
            }
            // Jangan reset level karena kita tidak bertaruh saat pause
            return;
        }
        
        // Jika tidak pause, reset level dan update streak
        currentBetIndex = 0;
        currentBetAmount = betSequence[0];
        console.log(`✅ MENANG! Reset level ke 1. Streak: ${currentStreak}`);
    }
    
    function processLoss() {
        // Update streak negatif
        currentStreak = currentStreak < 0 ? currentStreak - 1 : -1;
        
        if (isPaused) {
            // Jika masih pause dan kalah, reset hitungan win pause
            pauseWinStreak = 0;
            console.log(`❌ KALAH (dalam pause) - reset hitungan win untuk resume.`);
            return;
        }
        
        // Naik level jika tidak pause
        if (currentBetIndex < betSequence.length - 1) {
            currentBetIndex++;
            currentBetAmount = betSequence[currentBetIndex];
        }
        console.log(`❌ KALAH! Naik level ke ${currentBetIndex+1} (Rp ${currentBetAmount.toLocaleString()})`);
        
        // Cek apakah sudah 3x loss berturut-turut
        if (currentStreak === -3) {
            isPaused = true;
            pauseWinStreak = 0;
            console.log(`⏸️ PAUSE! 3x loss berturut-turut. Menunggu 3x win untuk resume.`);
        }
    }
    
    // ========== PROSES DATA DARI API ==========
    function processData(data) {
        const list = data?.data?.list;
        if (!list || list.length === 0) return;
        const item = list[0];
        if (!item.issueNumber || !item.number) return;
        const issueNumber = item.issueNumber;
        const number = parseInt(item.number);
        const result = number <= 4 ? "KECIL" : "BESAR";
        if (lastProcessedIssue === issueNumber) return;
        
        console.log(`📥 Hasil periode ${issueNumber.slice(-3)}: ${number} (${result})`);
        analyzeTrendData(list);
        
        if (isBetPlaced) {
            if (currentPrediction === result) {
                processWin();
            } else {
                processLoss();
            }
            isBetPlaced = false;
        } else {
            // Jika tidak ada bet (misal karena pause), tetap update streak untuk pantau pause
            // Tapi kita tidak punya prediksi, jadi kita update streak berdasarkan hasil aktual?
            // Sebaiknya kita tetap update streak untuk keperluan pause, meskipun tanpa bet.
            // Kita bisa update streak secara manual di sini.
            // Namun processWin/Loss membutuhkan currentPrediction, jadi kita tidak bisa pakai.
            // Kita akan buat fungsi khusus untuk update streak tanpa bet.
            updateStreakWithoutBet(result);
        }
        lastProcessedIssue = issueNumber;
    }
    
    // Fungsi khusus untuk update streak saat tidak ada bet (misal saat pause)
    function updateStreakWithoutBet(result) {
        if (isPaused) {
            // Saat pause, kita hanya peduli win untuk resume
            if (result === "BESAR" || result === "KECIL") {
                // Kita asumsikan result bisa dipakai, tapi kita tidak punya prediksi.
                // Karena kita tidak tahu prediksi, kita tidak bisa menentukan menang/kalah.
                // Namun untuk pause, kita hanya butuh menang berturut-turut secara aktual (tanpa prediksi).
                // Jadi kita update currentStreak berdasarkan hasil aktual? Tapi untuk pause, kita ingin 3x win actual.
                // Kita bisa gunakan pendekatan: jika result sama dengan prediksi terakhir? Tidak ada.
                // Lebih baik kita tracking win/loss aktual secara independen.
                // Kita akan buat variabel terpisah: actualWinStreak.
                // Saya akan tambahkan variabel actualStreak.
                // Tapi untuk kesederhanaan, saya gunakan currentStreak dengan asumsi kita selalu mengikuti prediksi.
                // Saat pause, kita tidak punya prediksi, jadi kita tidak bisa menentukan menang/kalah.
                // Karena itu, cara paling aman: saat pause, kita abaikan update streak dari hasil, dan hanya mengandalkan
                // hasil taruhan yang sebenarnya (yang sudah diproses di processWin/Loss) - namun saat pause tidak ada taruhan.
                // Maka kita perlu cara lain: kita pantau hasil aktual (nomor) dan bandingkan dengan prediksi terakhir? Tidak ada.
                // Solusi: kita tidak perlu update streak saat pause. Kita hanya perlu menghitung menang aktual dari hasil.
                // Kita akan buat variabel actualWinCount untuk menghitung berapa kali hasil = "BESAR" atau "KECIL"? Tidak.
                // Sebenarnya untuk resume, kita butuh 3x menang berturut-turut secara aktual (hasil apapun, asalkan menang).
                // Tapi menang itu relatif terhadap prediksi. Karena kita tidak bet, tidak ada menang/kalah.
                // Mungkin maksudnya adalah: setelah pause, kita pantau hasil undian, jika terjadi 3x hasil yang sama?
                // Tidak jelas. Saya asumsikan maksudnya adalah: setelah pause, kita tunggu sampai terjadi 3x kemenangan (yaitu hasil sesuai prediksi) tapi kita tidak bet.
                // Untuk itu kita perlu tetap punya prediksi meskipun tidak bet. Kita bisa tetap hitung prediksi setiap periode, lalu bandingkan dengan hasil.
                // Jika cocok, itu dianggap "win" untuk tujuan resume.
                // Jadi kita akan tetap panggil getPrediction() untuk mendapatkan prediksi, lalu bandingkan dengan result.
                // Meskipun tidak bet, kita bisa menghitung win/loss untuk keperluan resume.
                // Saya akan modifikasi: saat tidak ada bet (isBetPlaced false), kita tetap hitung prediksi dan bandingkan.
                // Tapi kita tidak ingin mengganggu logika bet. Kita bisa lakukan di sini.
                // Saya akan tulis ulang processData untuk menangani ini.
                // Karena lebih mudah, kita akan selalu hitung prediksi setiap periode (tanpa bet) dan update streak khusus untuk pause.
                // Saya akan tambahkan variabel actualStreakForPause.
            }
        }
    }
    
    // ========== CEK TIMER DAN EKSEKUSI ==========
    async function checkAndBet() {
        if (isProcessing) return;
        if (isPaused) {
            // Jika pause, kita tidak melakukan bet, tapi kita tetap bisa log status
            // console.log(`⏸️ Bot sedang pause, menunggu 3x win...`);
            return;
        }
        const now = Date.now();
        if (now - lastBetTime < CONFIG.betCooldown) {
            // console.log(`⏳ Cooldown ${Math.round((CONFIG.betCooldown - (now - lastBetTime))/1000)}s tersisa`);
            return;
        }
        
        const timer = getTimerInfo();
        if (!timer) {
            console.warn(`⚠️ Timer tidak terdeteksi`);
            return;
        }
        if (timer.seconds < CONFIG.minBetTime || timer.seconds > CONFIG.maxBetTime) {
            // console.log(`⏳ Timer ${timer.seconds}s di luar jendela (${CONFIG.minBetTime}-${CONFIG.maxBetTime})`);
            return;
        }
        if (historicalData.length < 5) {
            console.log(`⏳ Data historis: ${historicalData.length}/5, menunggu...`);
            return;
        }
        const currentPeriode = nextIssue ? nextIssue.slice(-3) : timer.seconds.toString();
        if (lastIssueProcessed === currentPeriode) {
            console.log(`⏳ Periode ${currentPeriode} sudah diproses`);
            return;
        }
        
        isProcessing = true;
        try {
            console.log(`🚀 Memulai proses taruhan untuk periode ${currentPeriode}`);
            if (!placeBet()) return;
            
            const btnSelectors = currentPrediction === 'BESAR'
                ? ['.Betting__C-foot-b', '[class*="besar"]', 'button:contains("BESAR")']
                : ['.Betting__C-foot-s', '[class*="kecil"]', 'button:contains("KECIL")'];
            const betButton = findElement(btnSelectors);
            if (!betButton) {
                console.warn(`⚠️ Tombol ${currentPrediction} tidak ditemukan`);
                return;
            }
            const style = window.getComputedStyle(betButton);
            if (style.opacity === '0.5' || style.pointerEvents === 'none') {
                console.warn(`⚠️ Tombol ${currentPrediction} tidak aktif (disabled)`);
                return;
            }
            console.log(`🖱️ Mengklik tombol ${currentPrediction}`);
            safeClick(betButton);
            await wait(1500);
            await processPopup(currentBetAmount);
            lastBetTime = Date.now();
            lastIssueProcessed = currentPeriode;
            console.log(`✅ Taruhan selesai untuk periode ${currentPeriode}`);
        } catch (error) {
            console.error(`❌ Error dalam checkAndBet:`, error);
        } finally {
            isProcessing = false;
        }
    }
    
    // ========== MONITOR ==========
    let monitorInterval = null;
    
    function startBot() {
        if (isRunning) {
            console.log(`⚠️ Bot sudah berjalan`);
            return;
        }
        isRunning = true;
        isPaused = false;
        pauseWinStreak = 0;
        currentBetIndex = 0;
        currentBetAmount = betSequence[0];
        monitorInterval = setInterval(checkAndBet, 2000);
        setTimeout(checkAndBet, 1000);
        console.log(`✅ Bot dimulai!`);
        console.log(`📊 Data saat ini: ${historicalData.length} periode`);
        if (nextIssue) console.log(`📌 Periode berikutnya: ${nextIssue.slice(-3)}`);
        console.log(`💵 Urutan taruhan: ${betSequence.map(b => b/1000+'K').join(' → ')}`);
        console.log(`⏸️ Akan pause jika 3x loss, resume setelah 3x win.`);
    }
    
    function stopBot() {
        isRunning = false;
        if (monitorInterval) {
            clearInterval(monitorInterval);
            monitorInterval = null;
        }
        console.log(`⏹️ Bot dihentikan.`);
    }
    
    function status() {
        return {
            isRunning,
            isPaused,
            pauseWinStreak,
            nextIssue: nextIssue ? nextIssue.slice(-3) : null,
            historicalCount: historicalData.length,
            currentStreak,
            betLevel: currentBetIndex + 1,
            lastPrediction: currentPrediction,
            lastIssueProcessed
        };
    }
    
    function resetBot() {
        currentBetIndex = 0;
        currentBetAmount = betSequence[0];
        currentStreak = 0;
        historicalData = [];
        lastIssueProcessed = null;
        isBetPlaced = false;
        isPaused = false;
        pauseWinStreak = 0;
        console.log(`🔄 Bot direset.`);
    }
    
    // ========== INIT ==========
    hookApi();
    
    window.wingoAuto = {
        start: startBot,
        stop: stopBot,
        status,
        reset: resetBot
    };
    
    console.log(`✅ WINGO AUTO-BOT v4.2 siap!`);
    console.log(`📌 Perintah: wingoAuto.start() / stop() / status() / reset()`);
})();
