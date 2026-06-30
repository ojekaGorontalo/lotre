// ============================================================
// WINGO AUTO-BOT v8.0 - 3-MODE PREDIKSI + MARTINGALE 8 LEVEL
// TANPA PAUSE, TANPA KOMPENSASI, TANPA FIREBASE
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
    let lastProcessedIssue = null;

    // State taruhan
    let currentPrediction = null;
    let currentNumberPrediction = null;
    let currentBetAmount = 1000;
    let currentBetIndex = 0;
    let isBetPlaced = false;

    // Data historis
    let historicalData = [];
    let nextIssue = null;

    // Urutan Martingale (8 level)
    const betSequence = [1000, 3000, 7000, 15000, 31000, 63000, 127000, 247000];
    const betLabels = ["1K", "3K", "7K", "15K", "31K", "63K", "127K", "247K"];

    // ===== STATE 3-MODE STRATEGY =====
    let strategyMode = 1;          // 1 = PERTAMBAHAN, 2 = REVERSE, 3 = ZIGZAG
    let zigzagUseReverse = false;  // untuk mode 3

    // Saldo virtual (hanya untuk log, tidak mempengaruhi keputusan)
    let virtualBalance = 502000;
    let totalBets = 0;
    let totalWins = 0;
    let totalLosses = 0;
    let currentStreak = 0;
    let profitLoss = 0;

    // ============================================================
    // 3. FUNGSI PREDIKSI 3-MODE
    // ============================================================
    function analyzeLast4(dataList) {
        if (!dataList || dataList.length < 4) {
            throw new Error("Data kurang dari 4, tidak bisa melakukan analisis.");
        }
        const last4 = dataList.slice(0, 4).map(item => parseInt(item.number, 10));
        const total = last4.reduce((a, b) => a + b, 0);
        const digitAkhir = total % 10;
        const hasilPertambahan = digitAkhir <= 4 ? "KECIL" : "BESAR";
        const hasilReverse = hasilPertambahan === "KECIL" ? "BESAR" : "KECIL";
        return { last4, total, digitAkhir, hasilPertambahan, hasilReverse };
    }

    function getPredictionFromMode(analysisResult) {
        const { hasilPertambahan, hasilReverse } = analysisResult;
        let pred = "";
        if (strategyMode === 1) {
            pred = hasilPertambahan;
        } else if (strategyMode === 2) {
            pred = hasilReverse;
        } else if (strategyMode === 3) {
            pred = zigzagUseReverse ? hasilReverse : hasilPertambahan;
        }
        const number = pred === "KECIL" ? 2 : 7;
        return { prediction: pred, number };
    }

    function getPrediction() {
        if (historicalData.length < 4) {
            if (historicalData.length > 0) {
                return historicalData[0].result; // fallback
            }
            return "KECIL";
        }

        const last4Data = historicalData.slice(0, 4);
        let analysisResult;
        try {
            analysisResult = analyzeLast4(last4Data);
        } catch (e) {
            console.warn("❌ Error analisis:", e.message);
            return "KECIL";
        }

        const { prediction, number } = getPredictionFromMode(analysisResult);
        currentNumberPrediction = number;
        const modeName = strategyMode === 1 ? "PERTAMBAHAN" : (strategyMode === 2 ? "REVERSE" : "ZIGZAG");
        const metode = (strategyMode === 3) ? (zigzagUseReverse ? "REVERSE" : "PERTAMBAHAN") : modeName;
        console.log(`🎯 Prediksi (Mode ${strategyMode} - ${metode}): ${prediction} (angka ${number})`);
        return prediction;
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
            isBetPlaced = false;
        }
        lastProcessedIssue = issueNumber;
    }

    // ============================================================
    // 6. LOGIKA MENANG / KALAH (TANPA PAUSE, TANPA KOMPENSASI)
    // ============================================================
    function processWin() {
        console.log(`✅ MENANG!`);
        virtualBalance += currentBetAmount * 2;
        totalWins++;
        currentStreak = currentStreak > 0 ? currentStreak + 1 : 1;
        profitLoss = virtualBalance - 502000;

        // Reset level ke 1
        currentBetIndex = 0;
        currentBetAmount = betSequence[0];

        // Mode tetap (tidak berubah saat menang)
        showToast(`✅ Menang! Level 1 (1K)`, 'success');
    }

    function processLoss() {
        console.log(`❌ KALAH!`);
        virtualBalance -= currentBetAmount;
        totalLosses++;
        currentStreak = currentStreak < 0 ? currentStreak - 1 : -1;
        profitLoss = virtualBalance - 502000;

        // ===== UPDATE MODE (3-Mode Strategy) =====
        if (strategyMode === 1) {
            strategyMode = 2;
            console.log(`➡️ Pindah ke Mode 2 (REVERSE)`);
            showToast('➡️ Kalah, pindah Mode 2 (REVERSE)', 'info');
        } else if (strategyMode === 2) {
            strategyMode = 3;
            zigzagUseReverse = false;
            console.log(`➡️ Pindah ke Mode 3 (ZIGZAG) - mulai dengan PERTAMBAHAN`);
            showToast('➡️ Kalah, pindah Mode 3 (ZIGZAG)', 'info');
        } else if (strategyMode === 3) {
            zigzagUseReverse = !zigzagUseReverse;
            console.log(`🔄 Mode 3 ZIGZAG: beralih ke ${zigzagUseReverse ? "REVERSE" : "PERTAMBAHAN"}`);
            showToast(`🔄 ZIGZAG → ${zigzagUseReverse ? "REVERSE" : "PERTAMBAHAN"}`, 'info');
        }

        // ===== NAIKKAN LEVEL MARTINGALE =====
        if (currentBetIndex < betSequence.length - 1) {
            currentBetIndex++;
            currentBetAmount = betSequence[currentBetIndex];
        } else {
            console.warn(`⚠️ Sudah di level maksimal (${betSequence.length} level). Tetap di level ${betSequence.length}.`);
        }
        console.log(`❌ KALAH! Naik level ke ${currentBetIndex+1} (Rp ${currentBetAmount.toLocaleString()})`);
        showToast(`❌ Kalah! Level ${currentBetIndex+1} (${currentBetAmount/1000}K)`, 'error');
    }

    // ============================================================
    // 7. FUNGSI TARUHAN
    // ============================================================
    function placeBet() {
        const pred = getPrediction();
        if (!pred) {
            console.warn('⚠️ Tidak ada prediksi, skip taruhan');
            showToast('⚠️ Tidak ada prediksi', 'error');
            return false;
        }

        currentPrediction = pred;
        virtualBalance -= currentBetAmount;
        totalBets++;
        isBetPlaced = true;

        console.log(`🎯 Taruhan ditempatkan: ${currentPrediction} (Level ${currentBetIndex+1}, Rp ${currentBetAmount.toLocaleString()})`);
        showToast(`🎯 Taruhan ${currentPrediction} (Level ${currentBetIndex+1})`, 'info');
        return true;
    }

    // ============================================================
    // 8. EKSEKUSI TARUHAN (checkAndBet)
    // ============================================================
    async function checkAndBet() {
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
        if (lastProcessedIssue === currentPeriode) {
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
            lastProcessedIssue = currentPeriode;
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
    // 10. MONITOR DAN KONTROL
    // ============================================================
    let monitorInterval = null;

    function startBot() {
        if (isRunning) {
            console.log(`⚠️ Bot sudah berjalan`);
            showToast('⚠️ Bot sudah berjalan', 'info');
            return;
        }

        isRunning = true;
        isBetPlaced = false;
        currentBetIndex = 0;
        currentBetAmount = betSequence[0];
        strategyMode = 1;
        zigzagUseReverse = false;
        currentStreak = 0;

        monitorInterval = setInterval(checkAndBet, 2000);
        setTimeout(checkAndBet, 1000);
        console.log(`✅ Bot dimulai! (3-Mode Strategy - Tanpa Firebase)`);
        console.log(`📊 Data saat ini: ${historicalData.length} periode`);
        if (nextIssue) console.log(`📌 Periode berikutnya: ${nextIssue.slice(-3)}`);
        console.log(`💵 Urutan Martingale: ${betSequence.map(b => b/1000+'K').join(' → ')}`);
        console.log(`🧠 Mode: 1=PERTAMBAHAN, 2=REVERSE, 3=ZIGZAG (berganti saat kalah)`);
        showToast('✅ Bot started! Level 1 (1K) - 3-Mode Strategy', 'success');
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
        const modeName = strategyMode === 1 ? "PERTAMBAHAN" : (strategyMode === 2 ? "REVERSE" : "ZIGZAG");
        const metode = (strategyMode === 3) ? (zigzagUseReverse ? "REVERSE" : "PERTAMBAHAN") : "-";
        const info = {
            isRunning,
            nextIssue: nextIssue ? nextIssue.slice(-3) : null,
            historicalCount: historicalData.length,
            currentStreak,
            betLevel: currentBetIndex + 1,
            currentBetAmount,
            lastPrediction: currentPrediction,
            strategyMode,
            zigzagUseReverse,
            virtualBalance,
            totalBets,
            totalWins,
            totalLosses,
            profitLoss,
        };
        const statusMsg = `🟢 Running: ${info.isRunning}\n📊 Level: ${info.betLevel} (${info.currentBetAmount/1000}K)\n🔥 Streak: ${info.currentStreak}\n🎯 Prediksi: ${info.lastPrediction || '-'}\n🧠 Mode: ${modeName}${strategyMode === 3 ? ` (${metode})` : ''}\n💰 Saldo: Rp ${info.virtualBalance.toLocaleString()}\n📈 P/L: ${info.profitLoss >= 0 ? '+' : ''}${info.profitLoss.toLocaleString()}\n📈 Data: ${info.historicalCount}/5`;
        showToast(statusMsg, 'info');
        return info;
    }

    function resetBot() {
        virtualBalance = 502000;
        currentBetIndex = 0;
        currentBetAmount = betSequence[0];
        totalBets = totalWins = totalLosses = currentStreak = profitLoss = 0;
        historicalData = [];
        lastProcessedIssue = null;
        isBetPlaced = false;
        strategyMode = 1;
        zigzagUseReverse = false;
        console.log(`🔄 Bot direset. Mode PERTAMBAHAN, Level 1 (1K).`);
        showToast('🔄 Bot reset! Level 1, Mode PERTAMBAHAN', 'success');
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

    console.log(`✅ WINGO AUTO-BOT v8.0 (Tanpa Firebase) siap!`);
    console.log(`📌 Perintah: wingoAuto.start() / stop() / status() / reset()`);
    console.log(`🧠 Mode: 1=PERTAMBAHAN, 2=REVERSE, 3=ZIGZAG (berganti saat kalah)`);
    console.log(`💵 Urutan Martingale: 1K → 3K → 7K → 15K → 31K → 63K → 127K → 247K`);
    console.log(`⏹️ Tanpa pause, tanpa kompensasi, tanpa Firebase.`);
    showToast('✅ Bot siap! 3-Mode Strategy (No Firebase)', 'success');

    // ============================================================
    // 12. OTOMATIS START
    // ============================================================
    window.wingoAuto.start();

})();
