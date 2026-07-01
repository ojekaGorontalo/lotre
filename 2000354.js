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
    // 1. KONFIGURASI DAN STATE
    // ============================================================
    const CONFIG = {
        autoConfirm: true,
        minBetTime: 8,
        maxBetTime: 25,
        betCooldown: 10000,
    };

    if (window.BotSettings) {
        if (window.BotSettings.minBetTime !== undefined) CONFIG.minBetTime = window.BotSettings.minBetTime;
        if (window.BotSettings.maxBetTime !== undefined) CONFIG.maxBetTime = window.BotSettings.maxBetTime;
        if (window.BotSettings.betCooldown !== undefined) CONFIG.betCooldown = window.BotSettings.betCooldown;
        if (window.BotSettings.autoConfirm !== undefined) CONFIG.autoConfirm = window.BotSettings.autoConfirm;
    }

    let betSequence = [1000, 3000, 7000, 15000, 31000, 63000, 127000, 247000];
    if (window.BotSettings && window.BotSettings.betLevels && window.BotSettings.betLevels.length > 0) {
        betSequence = window.BotSettings.betLevels.slice();
    }

    let maxBetLevel = 8;
    if (window.BotSettings && window.BotSettings.maxBetLevel !== undefined) {
        maxBetLevel = window.BotSettings.maxBetLevel;
    }

    let resetLevelAfterLoss = 0;
    if (window.BotSettings && window.BotSettings.resetLevelAfterLoss !== undefined) {
        resetLevelAfterLoss = window.BotSettings.resetLevelAfterLoss;
    }

    let isRunning = false;
    let isProcessing = false;
    let lastBetTime = 0;
    let lastIssueProcessed = null;

    let currentPrediction = null;
    let currentBetAmount = betSequence[0] || 1000;
    let currentBetIndex = 0;
    let isBetPlaced = false;

    let historicalData = [];
    let currentStreak = 0;
    let nextIssue = null;
    let lastProcessedIssue = null;

    // ===== STATE UNTUK MASING-MASING METODE =====
    let stateTigaMode = {
        strategyMode: 1,
        zigzagUseReverse: false
    };

    let stateToggle = {
        currentMode: 'trend',
        lossesInCurrentMode: 0
    };

    let totalProfit = 0;
    let sessionStartTime = 0;
    let winStreak = 0;
    let lossStreak = 0;

    // ============================================================
    // 2. FUNGSI ANALISIS 3-MODE (untuk metode tiga_mode)
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

    // ============================================================
    // 3. DAFTAR RUMUS PREDIKSI (3 METODE)
    // ============================================================
    const PREDICTION_METHODS = {
        'tiga_mode': function(historicalData, state) {
            if (historicalData.length < 4) return 'KECIL';
            const last4 = historicalData.slice(0,4).map(d => parseInt(d.number));
            const total = last4.reduce((a,b) => a+b, 0);
            const digit = total % 10;
            const hasilPertambahan = digit <= 4 ? "KECIL" : "BESAR";
            const hasilReverse = hasilPertambahan === "KECIL" ? "BESAR" : "KECIL";
            if (state.strategyMode === 1) return hasilPertambahan;
            if (state.strategyMode === 2) return hasilReverse;
            if (state.strategyMode === 3) {
                return state.zigzagUseReverse ? hasilReverse : hasilPertambahan;
            }
            return hasilPertambahan;
        },

        'toggle_dua_kalah': function(historicalData, state) {
            if (historicalData.length === 0) return 'KECIL';
            const mode = state.currentMode;
            if (mode === 'sum') {
                if (historicalData.length < 4) return historicalData[0].result || 'KECIL';
                const last = parseInt(historicalData[0].number);
                const fourth = parseInt(historicalData[3].number);
                const sum = last + fourth;
                const digit = sum % 10;
                return digit <= 4 ? 'KECIL' : 'BESAR';
            } else {
                return historicalData[0].result || 'KECIL';
            }
        },

        'zigzag_override': function(historicalData) {
            if (historicalData.length === 0) return 'KECIL';
            if (historicalData.length >= 4) {
                const last4 = historicalData.slice(0,4).map(d => d.result);
                const countBesar = last4.filter(r => r === "BESAR").length;
                const countKecil = last4.filter(r => r === "KECIL").length;
                if (countBesar === 4) return "BESAR";
                if (countKecil === 4) return "KECIL";
            }
            if (historicalData.length < 5) return "KECIL";
            const lastNumber = parseInt(historicalData[0].number);
            const fifthIssue = historicalData[4].issue;
            const lastDigitIssue = parseInt(fifthIssue.slice(-1), 10);
            const sum = lastNumber + lastDigitIssue;
            const digit = sum % 10;
            return digit <= 4 ? "KECIL" : "BESAR";
        }
    };

    function getPrediction() {
        const method = window.BotSettings.predictionMethod || 'tiga_mode';
        const methodFn = PREDICTION_METHODS[method];
        if (!methodFn) {
            console.warn('⚠️ Metode prediksi tidak dikenal, gunakan tiga_mode');
            return PREDICTION_METHODS['tiga_mode'](historicalData, stateTigaMode);
        }
        if (method === 'tiga_mode') {
            return methodFn(historicalData, stateTigaMode);
        } else if (method === 'toggle_dua_kalah') {
            return methodFn(historicalData, stateToggle);
        } else {
            return methodFn(historicalData);
        }
    }

    function updateModeOnLoss() {
        const mode = stateTigaMode.strategyMode;
        if (mode === 1) {
            stateTigaMode.strategyMode = 2;
            console.log(`➡️ Pindah ke Mode 2 (REVERSE)`);
            showToast('🔄 Beralih ke Mode REVERSE', 'info');
        } else if (mode === 2) {
            stateTigaMode.strategyMode = 3;
            stateTigaMode.zigzagUseReverse = false;
            console.log(`➡️ Pindah ke Mode 3 (ZIGZAG) - mulai PERTAMBAHAN`);
            showToast('🔄 Beralih ke Mode ZIGZAG (PERTAMBAHAN)', 'info');
        } else if (mode === 3) {
            stateTigaMode.zigzagUseReverse = !stateTigaMode.zigzagUseReverse;
            const metode = stateTigaMode.zigzagUseReverse ? "REVERSE" : "PERTAMBAHAN";
            console.log(`🔄 Mode 3 tetap, metode berubah menjadi ${metode}`);
            showToast(`🔄 ZIGZAG → ${metode}`, 'info');
        }
    }

    // ============================================================
    // 4. HOOK API
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
    // 5. PROSES DATA
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
    // 6. PROSES MENANG / KALAH
    // ============================================================
    function processWin() {
        console.log(`✅ MENANG!`);
        totalProfit += currentBetAmount;
        winStreak++;
        lossStreak = 0;
        currentStreak = winStreak;

        currentBetIndex = 0;
        currentBetAmount = betSequence[0] || 1000;
        console.log(`✅ MENANG! Reset level ke 1 (Rp ${currentBetAmount.toLocaleString()}). Win streak: ${winStreak}`);
        showToast(`✅ Menang! Reset level 1. Streak ${winStreak}`, 'success');

        const method = window.BotSettings.predictionMethod || 'tiga_mode';
        if (method === 'tiga_mode') {
            stateTigaMode.strategyMode = 1;
            stateTigaMode.zigzagUseReverse = false;
            console.log('✅ Reset mode ke PERTAMBAHAN');
        } else if (method === 'toggle_dua_kalah') {
            stateToggle.currentMode = 'trend';
            stateToggle.lossesInCurrentMode = 0;
            console.log('✅ Reset mode ke Trend');
        }

        checkAndStopIfNeeded();
    }

    function processLoss() {
        console.log(`❌ KALAH!`);
        totalProfit -= currentBetAmount;
        lossStreak++;
        winStreak = 0;
        currentStreak = -lossStreak;

        const method = window.BotSettings.predictionMethod || 'tiga_mode';
        if (method === 'tiga_mode') {
            updateModeOnLoss();
        } else if (method === 'toggle_dua_kalah') {
            stateToggle.lossesInCurrentMode++;
            if (stateToggle.lossesInCurrentMode >= 2) {
                const oldMode = stateToggle.currentMode;
                stateToggle.currentMode = (stateToggle.currentMode === 'trend') ? 'sum' : 'trend';
                stateToggle.lossesInCurrentMode = 0;
                console.log(`🔄 Ganti mode dari ${oldMode} ke ${stateToggle.currentMode}`);
                showToast(`🔄 Mode berubah: ${oldMode.toUpperCase()} → ${stateToggle.currentMode.toUpperCase()}`, 'info');
            }
        }

        if (currentBetIndex < maxBetLevel - 1) {
            if (currentBetIndex < betSequence.length - 1) {
                currentBetIndex++;
                currentBetAmount = betSequence[currentBetIndex];
            } else {
                console.warn(`⚠️ Sudah di level maksimum betSequence (${betSequence.length}), tidak bisa naik lagi.`);
            }
        } else {
            console.warn(`⚠️ Sudah mencapai batas maxBetLevel (${maxBetLevel}), tidak naik level.`);
        }

        if (resetLevelAfterLoss > 0 && lossStreak >= resetLevelAfterLoss) {
            currentBetIndex = 0;
            currentBetAmount = betSequence[0] || 1000;
            console.log(`🔄 Reset level ke 1 karena loss streak ${lossStreak} mencapai batas ${resetLevelAfterLoss}`);
            showToast(`🔄 Reset level ke 1 (loss streak ${lossStreak})`, 'info');
        }

        console.log(`❌ KALAH! Level sekarang ${currentBetIndex+1} (Rp ${currentBetAmount.toLocaleString()}). Loss streak: ${lossStreak}`);
        showToast(`❌ Kalah! Level ${currentBetIndex+1} (${currentBetAmount/1000}K)`, 'error');

        checkAndStopIfNeeded();
    }

    // ============================================================
    // 7. CEK KONDISI STOP
    // ============================================================
    function checkAndStopIfNeeded() {
        if (!isRunning) return;

        let reason = null;
        const settings = window.BotSettings || {};
        const targetProfit = settings.targetProfit || 0;
        const stopLoss = settings.stopLoss || 0;
        const maxWinStreakSetting = settings.maxWinStreak || 0;
        const maxLossStreakSetting = settings.maxLossStreak || 0;
        const sessionTimeoutSetting = settings.sessionTimeout || 0;

        if (targetProfit > 0 && totalProfit >= targetProfit) {
            reason = `🎯 Target profit tercapai: Rp ${totalProfit.toLocaleString()} >= Rp ${targetProfit.toLocaleString()}`;
        } else if (stopLoss > 0 && totalProfit <= -stopLoss) {
            reason = `🛑 Stop loss tercapai: Rp ${(-totalProfit).toLocaleString()} >= Rp ${stopLoss.toLocaleString()}`;
        } else if (maxWinStreakSetting > 0 && winStreak >= maxWinStreakSetting) {
            reason = `🔥 Max win streak tercapai: ${winStreak} >= ${maxWinStreakSetting}`;
        } else if (maxLossStreakSetting > 0 && lossStreak >= maxLossStreakSetting) {
            reason = `❌ Max loss streak tercapai: ${lossStreak} >= ${maxLossStreakSetting}`;
        } else if (sessionTimeoutSetting > 0) {
            const elapsed = (Date.now() - sessionStartTime) / 1000;
            if (elapsed >= sessionTimeoutSetting) {
                reason = `⏱️ Session timeout: ${Math.floor(elapsed)} detik >= ${sessionTimeoutSetting} detik`;
            }
        }

        if (reason) {
            stopBotWithReason(reason);
        }
    }

    function stopBotWithReason(reason) {
        if (!isRunning) return;
        console.log(`⏹️ Bot dihentikan: ${reason}`);
        showToast(`⏹️ Bot stopped: ${reason}`, 'error');
        stopBot();
    }

    // ============================================================
    // 8. FUNGSI TARUHAN
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
    // 9. EKSEKUSI TARUHAN
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
    // 10. FUNGSI UTILITY
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
    // 11. MONITOR DAN KONTROL
    // ============================================================
    let monitorInterval = null;

    async function startBot() {
        if (isRunning) {
            console.log(`⚠️ Bot sudah berjalan`);
            showToast('⚠️ Bot sudah berjalan', 'info');
            return;
        }

        if (window.BotSettings && window.BotSettings.resetLevelAfterLoss !== undefined) {
            resetLevelAfterLoss = window.BotSettings.resetLevelAfterLoss;
        }

        isRunning = true;
        currentBetIndex = 0;
        currentBetAmount = betSequence[0] || 1000;
        stateTigaMode.strategyMode = 1;
        stateTigaMode.zigzagUseReverse = false;
        stateToggle.currentMode = 'trend';
        stateToggle.lossesInCurrentMode = 0;
        totalProfit = 0;
        winStreak = 0;
        lossStreak = 0;
        currentStreak = 0;
        sessionStartTime = Date.now();
        isBetPlaced = false;
        lastIssueProcessed = null;

        monitorInterval = setInterval(checkAndBet, 2000);
        setTimeout(checkAndBet, 1000);
        console.log(`✅ Bot dimulai!`);
        console.log(`📊 Data saat ini: ${historicalData.length} periode`);
        if (nextIssue) console.log(`📌 Periode berikutnya: ${nextIssue.slice(-3)}`);
        console.log(`💵 Urutan Martingale: ${betSequence.map(b => b/1000+'K').join(' → ')}`);
        console.log(`🧠 Metode yang dipilih: ${window.BotSettings.predictionMethod || 'tiga_mode'}`);
        console.log(`🔢 MaxBetLevel: ${maxBetLevel}`);
        console.log(`🔄 Reset Level After Loss: ${resetLevelAfterLoss === 0 ? 'Nonaktif' : resetLevelAfterLoss + 'x'}`);
        showToast('✅ Bot started! Level 1 (1K)', 'success');
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
        const method = window.BotSettings.predictionMethod || 'tiga_mode';
        let modeInfo = '';
        if (method === 'tiga_mode') {
            const modeName = stateTigaMode.strategyMode === 1 ? "PERTAMBAHAN" : (stateTigaMode.strategyMode === 2 ? "REVERSE" : "ZIGZAG");
            const metode = (stateTigaMode.strategyMode === 3) ? (stateTigaMode.zigzagUseReverse ? "REVERSE" : "PERTAMBAHAN") : modeName;
            modeInfo = `🧠 Mode: ${modeName}${stateTigaMode.strategyMode === 3 ? ` (${metode})` : ''}`;
        } else if (method === 'toggle_dua_kalah') {
            modeInfo = `🧠 Mode: ${stateToggle.currentMode.toUpperCase()} (losses: ${stateToggle.lossesInCurrentMode}/2)`;
        } else if (method === 'zigzag_override') {
            modeInfo = `🧠 Mode: Zig-Zag + Trend Override`;
        }
        const info = {
            isRunning,
            nextIssue: nextIssue ? nextIssue.slice(-3) : null,
            historicalCount: historicalData.length,
            currentStreak,
            betLevel: currentBetIndex + 1,
            lastPrediction: currentPrediction,
            method,
            currentBetAmount,
            totalProfit,
            winStreak,
            lossStreak,
            sessionActive: Math.floor((Date.now() - sessionStartTime) / 1000) + 's'
        };
        const statusMsg = `🟢 Running: ${info.isRunning}\n📊 Level: ${info.betLevel} (${currentBetAmount/1000}K)\n🔥 Streak: ${info.currentStreak}\n🎯 Prediksi: ${info.lastPrediction || '-'}\n${modeInfo}\n📈 Data: ${info.historicalCount}/4\n💰 Profit: Rp ${totalProfit.toLocaleString()}`;
        showToast(statusMsg, 'info');
        return info;
    }

    function resetBot() {
        currentBetIndex = 0;
        currentBetAmount = betSequence[0] || 1000;
        currentStreak = 0;
        winStreak = 0;
        lossStreak = 0;
        totalProfit = 0;
        historicalData = [];
        lastIssueProcessed = null;
        isBetPlaced = false;
        stateTigaMode.strategyMode = 1;
        stateTigaMode.zigzagUseReverse = false;
        stateToggle.currentMode = 'trend';
        stateToggle.lossesInCurrentMode = 0;
        sessionStartTime = 0;
        console.log(`🔄 Bot direset.`);
        showToast('🔄 Bot reset! Level 1', 'success');
    }

    // ============================================================
    // 12. UPDATE KONFIGURASI DARI UI
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

        if (settings.betLevels && Array.isArray(settings.betLevels) && settings.betLevels.length > 0) {
            const currentSeq = betSequence.join(',');
            const newSeq = settings.betLevels.join(',');
            if (currentSeq !== newSeq) {
                betSequence = settings.betLevels.slice();
                const maxIdx = Math.min(betSequence.length - 1, maxBetLevel - 1);
                if (currentBetIndex > maxIdx) {
                    currentBetIndex = maxIdx;
                }
                currentBetAmount = betSequence[currentBetIndex] || betSequence[0] || 1000;
                console.log(`📊 Urutan Martingale diperbarui: ${betSequence.map(b => b/1000+'K').join(' → ')}`);
                showToast(`📊 Level taruhan diperbarui (${betSequence.length} level)`, 'info');
                changed = true;
            }
        }

        if (settings.maxBetLevel !== undefined && settings.maxBetLevel !== maxBetLevel) {
            maxBetLevel = settings.maxBetLevel;
            const maxIdx = Math.min(betSequence.length - 1, maxBetLevel - 1);
            if (currentBetIndex > maxIdx) {
                currentBetIndex = maxIdx;
                currentBetAmount = betSequence[currentBetIndex] || betSequence[0] || 1000;
            }
            console.log(`🔢 MaxBetLevel diperbarui: ${maxBetLevel}`);
            changed = true;
        }

        if (settings.resetLevelAfterLoss !== undefined) {
            resetLevelAfterLoss = settings.resetLevelAfterLoss;
            window.BotSettings.resetLevelAfterLoss = settings.resetLevelAfterLoss;
            changed = true;
        }

        if (settings.targetProfit !== undefined) {
            window.BotSettings.targetProfit = settings.targetProfit;
            changed = true;
        }
        if (settings.stopLoss !== undefined) {
            window.BotSettings.stopLoss = settings.stopLoss;
            changed = true;
        }
        if (settings.maxWinStreak !== undefined) {
            window.BotSettings.maxWinStreak = settings.maxWinStreak;
            changed = true;
        }
        if (settings.maxLossStreak !== undefined) {
            window.BotSettings.maxLossStreak = settings.maxLossStreak;
            changed = true;
        }
        if (settings.sessionTimeout !== undefined) {
            window.BotSettings.sessionTimeout = settings.sessionTimeout;
            changed = true;
        }

        if (settings.predictionMethod !== undefined) {
            const oldMethod = window.BotSettings.predictionMethod || 'tiga_mode';
            const newMethod = settings.predictionMethod;
            if (oldMethod !== newMethod) {
                window.BotSettings.predictionMethod = newMethod;
                if (newMethod === 'tiga_mode') {
                    stateTigaMode.strategyMode = 1;
                    stateTigaMode.zigzagUseReverse = false;
                } else if (newMethod === 'toggle_dua_kalah') {
                    stateToggle.currentMode = 'trend';
                    stateToggle.lossesInCurrentMode = 0;
                }
                changed = true;
            }
        }

        if (changed) {
            console.log('✅ Konfigurasi bot diperbarui dari UI:', CONFIG);
            showToast('✅ Konfigurasi bot diperbarui', 'success');
            if (isRunning) {
                checkAndStopIfNeeded();
            }
        }
    };

    // ============================================================
    // 13. INIT & HOOK API
    // ============================================================
    hookApi();

    window.wingoAuto = {
        start: startBot,
        stop: stopBot,
        status: status,
        reset: resetBot
    };

    console.log(`✅ WINGO AUTO-BOT v7.0 (3 Metode Prediksi) siap!`);
    console.log(`📌 Perintah: wingoAuto.start() / stop() / status() / reset()`);
    console.log(`🧠 Metode tersedia: tiga_mode, toggle_dua_kalah, zigzag_override`);
    console.log(`💵 Urutan Martingale: ${betSequence.map(b => b/1000+'K').join(' → ')}`);
    console.log(`⏱️ Rentang taruhan: ${CONFIG.minBetTime}-${CONFIG.maxBetTime} detik`);
    console.log(`🔢 MaxBetLevel: ${maxBetLevel}`);
    console.log(`🔄 Reset Level After Loss: ${resetLevelAfterLoss === 0 ? 'Nonaktif' : resetLevelAfterLoss + 'x'}`);
    showToast('✅ Bot siap!', 'success');

    // ============================================================
    // 14. VERIFIKASI UID & AUTO START
    // ============================================================
    var validUID = '2000354';
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
