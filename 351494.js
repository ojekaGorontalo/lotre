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
    // 1. KONFIGURASI DAN STATE (dengan integrasi BotSettings)
    // ============================================================
    const CONFIG = {
        autoConfirm: true,
        minBetTime: 8,
        maxBetTime: 25,
        betCooldown: 10000,
    };

    // Baca pengaturan dari window.BotSettings
    if (window.BotSettings) {
        if (window.BotSettings.minBetTime !== undefined) CONFIG.minBetTime = window.BotSettings.minBetTime;
        if (window.BotSettings.maxBetTime !== undefined) CONFIG.maxBetTime = window.BotSettings.maxBetTime;
        if (window.BotSettings.betCooldown !== undefined) CONFIG.betCooldown = window.BotSettings.betCooldown;
        if (window.BotSettings.autoConfirm !== undefined) CONFIG.autoConfirm = window.BotSettings.autoConfirm;
    }

    // Urutan Martingale (default, akan diambil dari BotSettings)
    let betSequence = [1000, 3000, 7000, 15000, 31000, 63000, 127000, 247000];
    if (window.BotSettings && window.BotSettings.betLevels && window.BotSettings.betLevels.length > 0) {
        betSequence = window.BotSettings.betLevels.slice();
    }

    // ===== STATE BOT =====
    let isRunning = false;
    let isProcessing = false;
    let lastBetTime = 0;
    let lastIssueProcessed = null;

    let currentPrediction = null;
    let currentBetAmount = betSequence[0] || 1000;
    let currentBetIndex = 0;
    let isBetPlaced = false;

    let historicalData = [];
    let currentStreak = 0;          // positif = win streak, negatif = loss streak
    let sessionStartTime = 0;

    // ===== TRACKING PROFIT / LOSS =====
    let totalProfit = 0;            // keuntungan/kerugian bersih sejak start/reset

    // ===== 3-MODE STATE =====
    let strategyMode = 1;           // 1=PERTAMBAHAN, 2=REVERSE, 3=ZIGZAG
    let zigzagUseReverse = false;

    // ===== PARAMETER STOP (diambil dari BotSettings) =====
    let targetProfit = 0;
    let stopLoss = 0;
    let maxWinStreak = 0;
    let maxLossStreak = 0;
    let sessionTimeout = 0;         // dalam detik

    // Baca parameter stop dari window.BotSettings
    if (window.BotSettings) {
        targetProfit = window.BotSettings.targetProfit || 0;
        stopLoss = window.BotSettings.stopLoss || 0;
        maxWinStreak = window.BotSettings.maxWinStreak || 0;
        maxLossStreak = window.BotSettings.maxLossStreak || 0;
        sessionTimeout = window.BotSettings.sessionTimeout || 0;
    }

    // ============================================================
    // 2. FUNGSI PREDIKSI 3-MODE (tidak berubah)
    // ============================================================
    function analyzeLast4(dataList) {
        if (!dataList || dataList.length < 4) {
            throw new Error("Data kurang dari 4");
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
        return pred;
    }

    function getPrediction() {
        const last4 = historicalData.slice(0, 4);
        if (last4.length < 4) {
            if (historicalData.length > 0) {
                const fallback = historicalData[0].result;
                console.log(`⚠️ Data <4, pakai fallback: ${fallback}`);
                return fallback;
            }
            return "KECIL";
        }

        let analysisResult;
        try {
            analysisResult = analyzeLast4(last4);
        } catch (e) {
            console.warn('⚠️ Gagal analisis:', e.message);
            return "KECIL";
        }

        const pred = getPredictionFromMode(analysisResult);
        const modeName = strategyMode === 1 ? "PERTAMBAHAN" : (strategyMode === 2 ? "REVERSE" : "ZIGZAG");
        const metode = (strategyMode === 3) ? (zigzagUseReverse ? "REVERSE" : "PERTAMBAHAN") : modeName;
        console.log(`🎯 Mode ${strategyMode} (${metode}) → Prediksi: ${pred} dari 4 angka ${analysisResult.last4.join(', ')}`);
        return pred;
    }

    function updateModeOnLoss() {
        if (strategyMode === 1) {
            strategyMode = 2;
            console.log(`➡️ Pindah ke Mode 2 (REVERSE)`);
            showToast('🔄 Beralih ke Mode REVERSE', 'info');
        } else if (strategyMode === 2) {
            strategyMode = 3;
            zigzagUseReverse = false;
            console.log(`➡️ Pindah ke Mode 3 (ZIGZAG) - mulai PERTAMBAHAN`);
            showToast('🔄 Beralih ke Mode ZIGZAG (PERTAMBAHAN)', 'info');
        } else if (strategyMode === 3) {
            zigzagUseReverse = !zigzagUseReverse;
            const metode = zigzagUseReverse ? "REVERSE" : "PERTAMBAHAN";
            console.log(`🔄 Mode 3 tetap, metode berubah menjadi ${metode}`);
            showToast(`🔄 ZIGZAG → ${metode}`, 'info');
        }
    }

    // ============================================================
    // 3. HOOK API (sama)
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
    // 4. PROSES DATA HASIL PERIODE
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
        if (historicalData.length >= 4) {
            const last4 = historicalData.slice(0,4).map(d => d.number).join(', ');
            console.log(`   Angka 4 terakhir: ${last4}`);
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
    // 5. PROSES MENANG / KALAH (dengan update profit & streak)
    // ============================================================
    function processWin() {
        console.log(`✅ MENANG!`);
        // Update profit: menang dapat 2x modal, profit bersih = currentBetAmount
        totalProfit += currentBetAmount;
        // Update streak
        currentStreak = currentStreak > 0 ? currentStreak + 1 : 1;

        // Reset level
        currentBetIndex = 0;
        currentBetAmount = betSequence[0] || 1000;

        console.log(`✅ MENANG! Profit +${currentBetAmount.toLocaleString()}, total profit: ${totalProfit.toLocaleString()}`);
        showToast(`✅ Menang! Profit +${currentBetAmount/1000}K`, 'success');

        // Cek kondisi stop setelah menang
        if (checkStopConditions()) {
            stopBotWithReason();
        }
    }

    function processLoss() {
        console.log(`❌ KALAH!`);
        // Update profit: kalah rugi sebesar currentBetAmount
        totalProfit -= currentBetAmount;
        // Update streak
        currentStreak = currentStreak < 0 ? currentStreak - 1 : -1;

        // Update mode
        updateModeOnLoss();

        // Naik level
        if (currentBetIndex < betSequence.length - 1) {
            currentBetIndex++;
            currentBetAmount = betSequence[currentBetIndex];
        } else {
            console.warn(`⚠️ Sudah di level maksimal (${betSequence.length} level). Tidak bisa naik lagi.`);
        }
        console.log(`❌ KALAH! Rugi -${currentBetAmount.toLocaleString()}, total profit: ${totalProfit.toLocaleString()}`);
        showToast(`❌ Kalah! Level ${currentBetIndex+1} (${currentBetAmount/1000}K)`, 'error');

        // Cek kondisi stop setelah kalah
        if (checkStopConditions()) {
            stopBotWithReason();
        }
    }

    // ============================================================
    // 6. CEK KONDISI STOP (target profit, stop loss, streak, timeout)
    // ============================================================
    function checkStopConditions() {
        let reason = '';

        // Target Profit (jika targetProfit > 0)
        if (targetProfit > 0 && totalProfit >= targetProfit) {
            reason = `🎯 Target Profit tercapai: Rp ${totalProfit.toLocaleString()} (≥ Rp ${targetProfit.toLocaleString()})`;
            return reason;
        }

        // Stop Loss (jika stopLoss > 0)
        if (stopLoss > 0 && totalProfit <= -stopLoss) {
            reason = `🛑 Stop Loss tercapai: Rp ${totalProfit.toLocaleString()} (≤ -Rp ${stopLoss.toLocaleString()})`;
            return reason;
        }

        // Max Win Streak (jika maxWinStreak > 0)
        if (maxWinStreak > 0 && currentStreak >= maxWinStreak) {
            reason = `🔥 Max Win Streak tercapai: ${currentStreak} kemenangan berturut-turut`;
            return reason;
        }

        // Max Loss Streak (jika maxLossStreak > 0)
        if (maxLossStreak > 0 && currentStreak <= -maxLossStreak) {
            reason = `❌ Max Loss Streak tercapai: ${Math.abs(currentStreak)} kekalahan berturut-turut`;
            return reason;
        }

        // Session Timeout (jika sessionTimeout > 0)
        if (sessionTimeout > 0 && sessionStartTime > 0) {
            const elapsed = (Date.now() - sessionStartTime) / 1000;
            if (elapsed >= sessionTimeout) {
                reason = `⏱️ Session Timeout: ${Math.floor(elapsed)} detik (batas ${sessionTimeout} detik)`;
                return reason;
            }
        }

        return null; // tidak ada kondisi yang terpenuhi
    }

    function stopBotWithReason() {
        const reason = checkStopConditions();
        if (reason) {
            console.log(`⏹️ Bot berhenti otomatis: ${reason}`);
            showToast(`⏹️ ${reason}`, 'error');
            stopBot(); // stop bot, tidak akan restart otomatis
        }
    }

    // ============================================================
    // 7. FUNGSI TARUHAN (sama)
    // ============================================================
    function placeBet() {
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
    // 8. EKSEKUSI TARUHAN (checkAndBet) - tambahkan cek stop di awal
    // ============================================================
    async function checkAndBet() {
        if (!isRunning) {
            console.log('⏹️ Bot sudah di-stop, skip eksekusi');
            return;
        }
        if (isProcessing) return;

        // Cek kondisi stop sebelum melakukan apapun
        if (checkStopConditions()) {
            stopBotWithReason();
            return;
        }

        const now = Date.now();
        if (now - lastBetTime < CONFIG.betCooldown) return;

        const timer = getTimerInfo();
        if (!timer) {
            console.warn(`⚠️ Timer tidak terdeteksi`);
            showToast('⚠️ Timer tidak terdeteksi', 'error');
            return;
        }
        if (timer.seconds < CONFIG.minBetTime || timer.seconds > CONFIG.maxBetTime) return;
        if (historicalData.length < 4) {
            console.log(`⏳ Data historis: ${historicalData.length}/4, menunggu...`);
            showToast(`⏳ Data historis ${historicalData.length}/4`, 'info');
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
    // 9. FUNGSI UTILITY (Timer, Click, Popup) - SAMA
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

    async function startBot() {
        if (isRunning) {
            console.log(`⚠️ Bot sudah berjalan`);
            showToast('⚠️ Bot sudah berjalan', 'info');
            return;
        }

        // Reset state
        isRunning = true;
        currentBetIndex = 0;
        currentBetAmount = betSequence[0] || 1000;
        strategyMode = 1;
        zigzagUseReverse = false;
        totalProfit = 0;
        currentStreak = 0;
        sessionStartTime = Date.now();

        // Baca ulang parameter stop dari window.BotSettings (jika ada perubahan dari UI)
        if (window.BotSettings) {
            targetProfit = window.BotSettings.targetProfit || 0;
            stopLoss = window.BotSettings.stopLoss || 0;
            maxWinStreak = window.BotSettings.maxWinStreak || 0;
            maxLossStreak = window.BotSettings.maxLossStreak || 0;
            sessionTimeout = window.BotSettings.sessionTimeout || 0;
        }

        monitorInterval = setInterval(checkAndBet, 2000);
        setTimeout(checkAndBet, 1000);
        console.log(`✅ Bot dimulai!`);
        console.log(`📊 Data saat ini: ${historicalData.length} periode`);
        if (nextIssue) console.log(`📌 Periode berikutnya: ${nextIssue.slice(-3)}`);
        console.log(`💵 Urutan Martingale: ${betSequence.map(b => b/1000+'K').join(' → ')}`);
        console.log(`🧠 Metode: 3-Mode Strategy (PERTAMBAHAN → REVERSE → ZIGZAG)`);
        console.log(`🎯 Target Profit: ${targetProfit > 0 ? 'Rp '+targetProfit.toLocaleString() : 'Nonaktif'}`);
        console.log(`🛑 Stop Loss: ${stopLoss > 0 ? 'Rp '+stopLoss.toLocaleString() : 'Nonaktif'}`);
        console.log(`🔥 Max Win Streak: ${maxWinStreak > 0 ? maxWinStreak : 'Nonaktif'}`);
        console.log(`❌ Max Loss Streak: ${maxLossStreak > 0 ? maxLossStreak : 'Nonaktif'}`);
        console.log(`⏱️ Session Timeout: ${sessionTimeout > 0 ? sessionTimeout+' detik' : 'Nonaktif'}`);
        showToast('✅ Bot started! Level 1 (1K) Mode PERTAMBAHAN', 'success');
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
        const metode = (strategyMode === 3) ? (zigzagUseReverse ? "REVERSE" : "PERTAMBAHAN") : modeName;
        const info = {
            isRunning,
            nextIssue: nextIssue ? nextIssue.slice(-3) : null,
            historicalCount: historicalData.length,
            currentStreak,
            betLevel: currentBetIndex + 1,
            lastPrediction: currentPrediction,
            strategyMode,
            zigzagUseReverse,
            currentBetAmount,
            totalProfit,
            sessionElapsed: sessionStartTime > 0 ? Math.floor((Date.now() - sessionStartTime)/1000) : 0
        };
        const statusMsg = `🟢 Running: ${info.isRunning}\n📊 Level: ${info.betLevel} (${currentBetAmount/1000}K)\n🔥 Streak: ${info.currentStreak}\n💰 Profit: ${info.totalProfit > 0 ? '+' : ''}${info.totalProfit.toLocaleString()}\n🎯 Prediksi: ${info.lastPrediction || '-'}\n🧠 Mode: ${modeName}${strategyMode === 3 ? ` (${metode})` : ''}\n📈 Data: ${info.historicalCount}/4\n⏱️ Waktu: ${info.sessionElapsed} detik`;
        showToast(statusMsg, 'info');
        return info;
    }

    function resetBot() {
        // Hentikan bot jika berjalan
        if (isRunning) stopBot();

        // Reset semua state
        currentBetIndex = 0;
        currentBetAmount = betSequence[0] || 1000;
        currentStreak = 0;
        historicalData = [];
        lastIssueProcessed = null;
        isBetPlaced = false;
        strategyMode = 1;
        zigzagUseReverse = false;
        totalProfit = 0;
        sessionStartTime = 0;

        console.log(`🔄 Bot direset. Mode 1 (PERTAMBAHAN), Level 1 (1K).`);
        showToast('🔄 Bot reset! Level 1, Mode PERTAMBAHAN', 'success');
    }

    // ============================================================
    // 11. FUNGSI UPDATE KONFIGURASI DARI UI
    // ============================================================
    window.updateBotConfig = function(settings) {
        if (!settings) return;
        let changed = false;

        if (settings.minBetTime !== undefined && settings.minBetTime !== CONFIG.minBetTime) {
            CONFIG.minBetTime = settings.minBetTime;
            changed = true;
        }
        if (settings.maxBetTime !== undefined && settings.maxBetTime !== CONFIG.maxBetTime) {
            CONFIG.maxBetTime = settings.maxBetTime;
            changed = true;
        }
        if (settings.betCooldown !== undefined && settings.betCooldown !== CONFIG.betCooldown) {
            CONFIG.betCooldown = settings.betCooldown;
            changed = true;
        }
        if (settings.autoConfirm !== undefined && settings.autoConfirm !== CONFIG.autoConfirm) {
            CONFIG.autoConfirm = settings.autoConfirm;
            changed = true;
        }

        // Parameter stop
        if (settings.targetProfit !== undefined) {
            targetProfit = settings.targetProfit;
            changed = true;
        }
        if (settings.stopLoss !== undefined) {
            stopLoss = settings.stopLoss;
            changed = true;
        }
        if (settings.maxWinStreak !== undefined) {
            maxWinStreak = settings.maxWinStreak;
            changed = true;
        }
        if (settings.maxLossStreak !== undefined) {
            maxLossStreak = settings.maxLossStreak;
            changed = true;
        }
        if (settings.sessionTimeout !== undefined) {
            sessionTimeout = settings.sessionTimeout;
            changed = true;
        }

        // Perbarui urutan Martingale
        if (settings.betLevels && Array.isArray(settings.betLevels) && settings.betLevels.length > 0) {
            const currentSeq = betSequence.join(',');
            const newSeq = settings.betLevels.join(',');
            if (currentSeq !== newSeq) {
                betSequence = settings.betLevels.slice();
                currentBetIndex = 0;
                currentBetAmount = betSequence[0] || 1000;
                console.log(`📊 Urutan Martingale diperbarui: ${betSequence.map(b => b/1000+'K').join(' → ')}`);
                showToast(`📊 Level taruhan diperbarui (${betSequence.length} level)`, 'info');
                changed = true;
            }
        }

        if (changed) {
            console.log('✅ Konfigurasi bot diperbarui dari UI:', CONFIG);
            showToast('✅ Konfigurasi bot diperbarui', 'success');
        }
    };

    // ============================================================
    // 12. INIT & HOOK API
    // ============================================================
    hookApi();

    window.wingoAuto = {
        start: startBot,
        stop: stopBot,
        status: status,
        reset: resetBot
    };

    console.log(`✅ WINGO AUTO-BOT v6.5 (3-Mode + Auto Stop Conditions) siap!`);
    console.log(`📌 Perintah: wingoAuto.start() / stop() / status() / reset()`);
    console.log(`🧠 Metode: 3-Mode (PERTAMBAHAN → REVERSE → ZIGZAG)`);
    console.log(`💵 Urutan Martingale: ${betSequence.map(b => b/1000+'K').join(' → ')}`);
    console.log(`⏱️ Rentang taruhan: ${CONFIG.minBetTime}-${CONFIG.maxBetTime} detik`);
    showToast('✅ Bot siap!', 'success');

    // ============================================================
    // 13. VERIFIKASI UID & AUTO START
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

    setTimeout(function() {
        if (typeof startBot === 'function') {
            startBot();
        } else {
            console.warn('⚠️ startBot tidak tersedia, coba jalankan manual.');
            showToast('⚠️ Gagal auto start, jalankan wingoAuto.start()', 'error');
        }
    }, 3000);

})();
