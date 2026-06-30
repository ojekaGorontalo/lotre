// ============================================================
// WINGO AUTO-BOT v5.0 - HARCODE PREDIKSI (Tanpa Firebase)
// Metode: Dual Core (SUM / TREND) + Pause 3x Loss / Resume 3x Win
// TANPA CEK REKENING & DEPOSIT
// ============================================================

(function() {
    'use strict';

    // ============================================================
    // 0. TOAST NOTIFICATION
    // ============================================================
    function showToast(message, type) {
        const oldToast = document.getElementById('wingoToast');
        if (oldToast) oldToast.remove();

        const toast = document.createElement('div');
        toast.id = 'wingoToast';
        let bgColor = '#1e293b';
        if (type === 'success') bgColor = '#22c55e';
        else if (type === 'error') bgColor = '#ef4444';
        else if (type === 'info') bgColor = '#3b82f6';

        toast.style.cssText = `
            position: fixed;
            bottom: 80px;
            left: 50%;
            transform: translateX(-50%);
            background: ${bgColor};
            color: white;
            padding: 14px 24px;
            border-radius: 14px;
            font-size: 15px;
            font-weight: 600;
            box-shadow: 0 8px 30px rgba(0,0,0,0.5);
            z-index: 99999;
            max-width: 90%;
            text-align: center;
            transition: opacity 0.3s ease, transform 0.3s ease;
            font-family: 'Inter', -apple-system, sans-serif;
            border: 1px solid rgba(255,255,255,0.15);
            pointer-events: none;
            white-space: pre-line;
            line-height: 1.5;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(-50%) translateY(10px)';
            setTimeout(() => toast.remove(), 400);
        }, 4000);
    }

    // ============================================================
    // 1. VERIFIKASI UID (tetap 351494)
    // ============================================================
    var validUID = '351494';
    var userId = prompt('🔐 Masukkan UID Anda untuk mengakses bot:', '');
    if (userId === null || userId.trim() === '') {
        console.warn('⛔ Verifikasi dibatalkan.');
        showToast('⛔ Verifikasi dibatalkan.', 'error');
        return;
    }
    userId = userId.trim();
    if (userId !== validUID) {
        alert('❌ UID tidak valid!');
        showToast('❌ UID tidak valid!', 'error');
        return;
    }
    console.log('✅ Verifikasi sukses! Selamat datang, User.');
    showToast('✅ Verifikasi sukses!', 'success');

    // ============================================================
    // 2. KONFIGURASI DAN STATE
    // ============================================================
    const CONFIG = {
        autoConfirm: true,
        minBetTime: 8,
        maxBetTime: 25,
        betCooldown: 10000,
    };

    let isRunning = false;
    let isProcessing = false;
    let lastBetTime = 0;
    let lastIssueProcessed = null;

    // State taruhan
    let currentPrediction = null;
    let currentBetAmount = 1000;
    let currentBetIndex = 0;
    let isBetPlaced = false;

    // Data historis
    let historicalData = [];
    let currentStreak = 0;
    let nextIssue = null;
    let lastProcessedIssue = null;

    // Urutan Martingale
    const betSequence = [1000, 3000, 7000, 15000, 31000, 63000, 127000, 247000];
    const betLabels = ["1K", "3K", "7K", "15K", "31K", "63K", "127K", "247K"];

    // ===== STATE METODE DUAL CORE (seperti di wingo_bot_analitycs.html) =====
    let dualCoreMode = 'sum';   // 'sum' atau 'trend'
    let dualCoreLossCount = 0;  // hitung kalah berturut-turut untuk toggle mode

    // ============================================================
    // 3. FUNGSI PREDIKSI DUAL CORE (Hardcode)
    // ============================================================
    function getSumPrediction(numbers) {
        if (!numbers || numbers.length < 4) return null;
        const sum = numbers.reduce((a, b) => a + b, 0);
        const lastDigit = sum % 10;
        const pred = lastDigit <= 4 ? 'KECIL' : 'BESAR';
        return { prediction: pred, predictedNumber: pred === 'KECIL' ? 2 : 7 };
    }

    function getPrediction() {
        // Ambil 4 angka terakhir dari historicalData
        const last4 = historicalData.slice(0, 4).map(d => d.number);
        if (last4.length < 4) {
            // Fallback jika data kurang
            if (historicalData.length > 0) {
                const fallback = historicalData[0].result;
                console.log(`⚠️ Data <4, pakai fallback: ${fallback}`);
                return fallback;
            }
            return "KECIL";
        }

        const sumPred = getSumPrediction(last4);
        if (!sumPred) return "KECIL";

        let pred = "";
        if (dualCoreMode === 'sum') {
            pred = sumPred.prediction;
        } else { // trend
            // Ikuti hasil terakhir
            const lastResult = historicalData[0]?.result || sumPred.prediction;
            pred = lastResult;
        }

        console.log(`🎯 Prediksi Dual Core (${dualCoreMode.toUpperCase()}): ${pred} dari 4 angka ${last4.join(', ')}`);
        return pred;
    }

    // Update state metode Dual Core (dipanggil saat kalah/menang)
    function updateDualCoreState(isWin) {
        if (isWin) {
            dualCoreLossCount = 0; // reset jika menang
            console.log(`✅ Menang, reset loss count. Mode tetap ${dualCoreMode.toUpperCase()}`);
        } else {
            dualCoreLossCount++;
            if (dualCoreLossCount >= 2) {
                // toggle mode
                dualCoreMode = dualCoreMode === 'sum' ? 'trend' : 'sum';
                dualCoreLossCount = 0;
                console.log(`🔄 Kalah 2x, beralih ke mode ${dualCoreMode.toUpperCase()}`);
                showToast(`🔄 Beralih ke mode ${dualCoreMode.toUpperCase()}`, 'info');
            } else {
                console.log(`❌ Kalah (${dualCoreLossCount}/2), mode tetap ${dualCoreMode.toUpperCase()}`);
            }
        }
    }

    // ============================================================
    // 4. HOOK API UNTUK MENDAPATKAN DATA HISTORIS & PERIODE
    // ============================================================
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

    // ============================================================
    // 5. PROSES DATA HASIL PERIODE
    // ============================================================
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
            const isWin = (currentPrediction === result);
            if (isWin) {
                processWin();
            } else {
                processLoss();
            }
            // Update state Dual Core
            updateDualCoreState(isWin);
            isBetPlaced = false;
        }
        lastProcessedIssue = issueNumber;
    }

    // ============================================================
    // 6. LOGIKA MENANG / KALAH (dengan pause)
    // ============================================================
    let isPaused = false;
    let pauseWinStreak = 0;

    function processWin() {
        console.log(`✅ MENANG!`);
        currentStreak = currentStreak > 0 ? currentStreak + 1 : 1;

        if (isPaused) {
            pauseWinStreak++;
            console.log(`✅ MENANG (dalam pause) - ${pauseWinStreak}/3 win untuk resume`);
            showToast(`✅ Menang! ${pauseWinStreak}/3 untuk resume`, 'success');
            if (pauseWinStreak >= 3) {
                isPaused = false;
                pauseWinStreak = 0;
                currentBetIndex = 0;
                currentBetAmount = betSequence[0];
                console.log(`🟢 RESUME BOT! Sudah 3x win berturut-turut, mulai lagi dari 1K.`);
                showToast('🟢 RESUME! 3x win, lanjut dari 1K', 'success');
            }
            return;
        }

        // Reset level ke 1
        currentBetIndex = 0;
        currentBetAmount = betSequence[0];
        console.log(`✅ MENANG! Reset level ke 1 (Rp ${currentBetAmount.toLocaleString()}). Streak: ${currentStreak}`);
        showToast(`✅ Menang! Reset level 1. Streak ${currentStreak}`, 'success');
    }

    function processLoss() {
        console.log(`❌ KALAH!`);
        currentStreak = currentStreak < 0 ? currentStreak - 1 : -1;

        if (isPaused) {
            pauseWinStreak = 0;
            console.log(`❌ KALAH (dalam pause) - reset hitungan win untuk resume.`);
            showToast('❌ Kalah (pause) - hitungan win direset', 'error');
            return;
        }

        // Naikkan level Martingale
        if (currentBetIndex < betSequence.length - 1) {
            currentBetIndex++;
            currentBetAmount = betSequence[currentBetIndex];
        } else {
            console.warn(`⚠️ Sudah di level maksimal (${betSequence.length} level). Tidak bisa naik lagi.`);
        }
        console.log(`❌ KALAH! Naik level ke ${currentBetIndex+1} (Rp ${currentBetAmount.toLocaleString()})`);
        showToast(`❌ Kalah! Level ${currentBetIndex+1} (${currentBetAmount/1000}K)`, 'error');

        // PAUSE jika 3x loss berturut-turut
        if (currentStreak === -3) {
            isPaused = true;
            pauseWinStreak = 0;
            console.log(`⏸️ PAUSE! 3x loss berturut-turut. Menunggu 3x win untuk resume.`);
            showToast('⏸️ PAUSE! 3x loss berturut-turut', 'error');
        }
    }

    // ============================================================
    // 7. FUNGSI TARUHAN
    // ============================================================
    function placeBet() {
        if (isPaused) {
            console.log(`⏸️ Bot sedang pause, tidak melakukan taruhan.`);
            showToast('⏸️ Bot Pause (3x loss), menunggu 3x win...', 'info');
            return false;
        }

        const pred = getPrediction();
        if (!pred) {
            console.warn('⚠️ Tidak ada prediksi, skip taruhan');
            showToast('⚠️ Tidak ada prediksi', 'error');
            return false;
        }

        currentPrediction = pred;
        isBetPlaced = true;
        console.log(`🎯 Taruhan ditempatkan: ${currentPrediction} (Level ${currentBetIndex+1}, Rp ${currentBetAmount.toLocaleString()})`);
        showToast(`🎯 Taruhan ${currentPrediction} (Level ${currentBetIndex+1})`, 'info');
        return true;
    }

    // ============================================================
    // 8. EKSEKUSI TARUHAN (checkAndBet)
    // ============================================================
    async function checkAndBet() {
        // Cek status running
        if (!isRunning) {
            console.log('⏹️ Bot sudah di-stop, skip eksekusi');
            return;
        }
        if (isProcessing) return;

        const now = Date.now();
        if (now - lastBetTime < CONFIG.betCooldown) return;

        const timer = getTimerInfo();
        if (!timer) {
            console.warn(`⚠️ Timer tidak terdeteksi`);
            showToast('⚠️ Timer tidak terdeteksi', 'error');
            return;
        }
        if (timer.seconds < CONFIG.minBetTime || timer.seconds > CONFIG.maxBetTime) return;
        if (historicalData.length < 5) {
            console.log(`⏳ Data historis: ${historicalData.length}/5, menunggu...`);
            showToast(`⏳ Data historis ${historicalData.length}/5`, 'info');
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
                showToast(`⚠️ Tombol ${currentPrediction} tidak ditemukan`, 'error');
                return;
            }
            const style = window.getComputedStyle(betButton);
            if (style.opacity === '0.5' || style.pointerEvents === 'none') {
                console.warn(`⚠️ Tombol ${currentPrediction} tidak aktif (disabled)`);
                showToast(`⚠️ Tombol ${currentPrediction} disabled`, 'error');
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
            showToast(`❌ Error: ${error.message}`, 'error');
        } finally {
            isProcessing = false;
        }
    }

    // ============================================================
    // 9. FUNGSI UTILITY (Timer, Click, Popup)
    // ============================================================
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
        showToast('⚠️ Popup taruhan tidak muncul', 'error');
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
        for (let btn of buttons) {
            const txt = btn.textContent || '';
            if (txt.includes('x2') || txt.includes('X2')) {
                console.log(`🖱️ Klik tombol X2`);
                safeClick(btn);
                await wait(1000);
                if (CONFIG.autoConfirm) await confirmBet(popup);
                return;
            }
        }
        console.warn(`⚠️ Tidak bisa mengisi nominal ${amount}`);
        showToast(`⚠️ Gagal isi nominal ${amount/1000}K`, 'error');
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
        showToast('⚠️ Tombol konfirmasi tidak ditemukan', 'error');
    }

    // ============================================================
    // 10. MONITOR DAN KONTROL (tanpa verifikasi)
    // ============================================================
    let monitorInterval = null;

    async function startBot() {
        if (isRunning) {
            console.log(`⚠️ Bot sudah berjalan`);
            showToast('⚠️ Bot sudah berjalan', 'info');
            return;
        }

        // Verifikasi rekening & deposit TIDAK ADA LAGI

        isRunning = true;
        isPaused = false;
        pauseWinStreak = 0;
        currentBetIndex = 0;
        currentBetAmount = betSequence[0];
        dualCoreMode = 'sum';
        dualCoreLossCount = 0;

        monitorInterval = setInterval(checkAndBet, 2000);
        setTimeout(checkAndBet, 1000);
        console.log(`✅ Bot dimulai! (Hardcode Dual Core)`);
        console.log(`📊 Data saat ini: ${historicalData.length} periode`);
        if (nextIssue) console.log(`📌 Periode berikutnya: ${nextIssue.slice(-3)}`);
        console.log(`💵 Urutan Martingale: ${betSequence.map(b => b/1000+'K').join(' → ')}`);
        console.log(`🧠 Metode: Dual Core (SUM/TREND), berganti setelah 2x kalah.`);
        console.log(`⏸️ Pause jika 3x loss, resume setelah 3x win.`);
        showToast('✅ Bot started! Level 1 (1K) - Hardcode Dual Core', 'success');
    }

    function stopBot() {
        isRunning = false;
        if (monitorInterval) {
            clearInterval(monitorInterval);
            monitorInterval = null;
        }
        console.log(`⏹️ Bot dihentikan.`);
        showToast('⏹️ Bot stopped!', 'error');
    }

    function status() {
        const info = {
            isRunning,
            isPaused,
            pauseWinStreak,
            nextIssue: nextIssue ? nextIssue.slice(-3) : null,
            historicalCount: historicalData.length,
            currentStreak,
            betLevel: currentBetIndex + 1,
            lastPrediction: currentPrediction,
            dualCoreMode,
            dualCoreLossCount,
            currentBetAmount
        };
        const statusMsg = `🟢 Running: ${info.isRunning}\n⏸️ Paused: ${info.isPaused}\n📊 Level: ${info.betLevel} (${currentBetAmount/1000}K)\n🔥 Streak: ${info.currentStreak}\n🎯 Prediksi: ${info.lastPrediction || '-'}\n🧠 Mode: ${info.dualCoreMode.toUpperCase()}\n📈 Data: ${info.historicalCount}/5`;
        showToast(statusMsg, 'info');
        return info;
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
        dualCoreMode = 'sum';
        dualCoreLossCount = 0;
        console.log(`🔄 Bot direset. Mode SUM, Level 1 (1K).`);
        showToast('🔄 Bot reset! Level 1, Mode SUM', 'success');
    }

    // ============================================================
    // 11. INIT
    // ============================================================
    hookApi();

    window.wingoAuto = {
        start: startBot,
        stop: stopBot,
        status: status,
        reset: resetBot
    };

    console.log(`✅ WINGO AUTO-BOT v5.0 (Hardcode Dual Core - Tanpa Verifikasi) siap!`);
    console.log(`📌 Perintah: wingoAuto.start() / stop() / status() / reset()`);
    console.log(`🧠 Metode: Dual Core (SUM/TREND) - berganti setelah 2x kalah.`);
    console.log(`💵 Urutan Martingale: 1K → 3K → 7K → 15K → 31K → 63K → 127K → 247K`);
    console.log(`⏸️ Pause setelah 3x loss, resume setelah 3x win.`);
    showToast('✅ Bot siap! Hardcode Dual Core', 'success');

    // ============================================================
    // 12. OTOMATIS START (jika diinginkan, komentar jika tidak)
    // ============================================================
    // window.wingoAuto.start(); // uncomment jika ingin auto-start

})();
