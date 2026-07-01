(function() {
    'use strict';

    // ============================================================
    // 0. TOAST NOTIFICATION
    // ============================================================
    function showToast(message, type) {
        var oldToast = document.getElementById('wingoToast');
        if (oldToast) oldToast.remove();

        var toast = document.createElement('div');
        toast.id = 'wingoToast';
        var bgColor = '#1e293b';
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

        setTimeout(function() {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(-50%) translateY(10px)';
            setTimeout(function() { toast.remove(); }, 400);
        }, 4000);
    }

    // ============================================================
    // 1. KONFIGURASI (ambil dari window.BotSettings jika ada)
    // ============================================================
    function getConfig() {
        var defaults = {
            autoConfirm: true,
            minBetTime: 8,
            maxBetTime: 25,
            betCooldown: 10000,
            targetProfit: 0,
            stopLoss: 0,
            maxBetLevel: 8,
            maxWinStreak: 0,
            maxLossStreak: 0,
            sessionTimeout: 0
        };
        if (window.BotSettings) {
            return Object.assign({}, defaults, window.BotSettings);
        }
        return defaults;
    }

    var CONFIG = getConfig();

    // Fungsi untuk update CONFIG dari luar (dipanggil oleh wingogamenav.js saat setting disimpan)
    window.updateBotConfig = function(newSettings) {
        CONFIG = Object.assign(CONFIG, newSettings);
        console.log('🔄 CONFIG diperbarui:', CONFIG);
        showToast('⚙️ Setting bot diperbarui', 'info');
    };

    // ============================================================
    // 2. STATE BOT
    // ============================================================
    var isRunning = false;
    var isProcessing = false;
    var lastBetTime = 0;
    var lastIssueProcessed = null;

    var currentPrediction = null;
    var currentBetAmount = 1000;
    var currentBetIndex = 0;
    var isBetPlaced = false;

    var historicalData = [];
    var currentStreak = 0;
    var nextIssue = null;
    var lastProcessedIssue = null;

    // Tracking profit/loss
    var totalProfit = 0;
    var totalLoss = 0;
    var sessionTimer = null;

    var betSequence = [1000, 3000, 7000, 15000, 31000, 63000, 127000, 247000];
    var betLabels = ["1K", "3K", "7K", "15K", "31K", "63K", "127K", "247K"];

    // 3-MODE
    var strategyMode = 1;
    var zigzagUseReverse = false;

    // ============================================================
    // 3. FUNGSI PREDIKSI
    // ============================================================
    function analyzeLast4(dataList) {
        if (!dataList || dataList.length < 4) {
            throw new Error("Data kurang dari 4");
        }
        var last4 = dataList.slice(0, 4).map(function(item) { return parseInt(item.number, 10); });
        var total = last4.reduce(function(a, b) { return a + b; }, 0);
        var digitAkhir = total % 10;
        var hasilPertambahan = digitAkhir <= 4 ? "KECIL" : "BESAR";
        var hasilReverse = hasilPertambahan === "KECIL" ? "BESAR" : "KECIL";
        return { last4: last4, total: total, digitAkhir: digitAkhir, hasilPertambahan: hasilPertambahan, hasilReverse: hasilReverse };
    }

    function getPredictionFromMode(analysisResult) {
        var hasilPertambahan = analysisResult.hasilPertambahan;
        var hasilReverse = analysisResult.hasilReverse;
        var pred = "";
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
        var last4 = historicalData.slice(0, 4);
        if (last4.length < 4) {
            if (historicalData.length > 0) {
                var fallback = historicalData[0].result;
                console.log('⚠️ Data <4, pakai fallback: ' + fallback);
                return fallback;
            }
            return "KECIL";
        }

        var analysisResult;
        try {
            analysisResult = analyzeLast4(last4);
        } catch (e) {
            console.warn('⚠️ Gagal analisis:', e.message);
            return "KECIL";
        }

        var pred = getPredictionFromMode(analysisResult);
        var modeName = strategyMode === 1 ? "PERTAMBAHAN" : (strategyMode === 2 ? "REVERSE" : "ZIGZAG");
        var metode = (strategyMode === 3) ? (zigzagUseReverse ? "REVERSE" : "PERTAMBAHAN") : modeName;
        console.log('🎯 Mode ' + strategyMode + ' (' + metode + ') → Prediksi: ' + pred + ' dari 4 angka ' + analysisResult.last4.join(', '));
        return pred;
    }

    function updateModeOnLoss() {
        if (strategyMode === 1) {
            strategyMode = 2;
            console.log('➡️ Pindah ke Mode 2 (REVERSE)');
            showToast('🔄 Beralih ke Mode REVERSE', 'info');
        } else if (strategyMode === 2) {
            strategyMode = 3;
            zigzagUseReverse = false;
            console.log('➡️ Pindah ke Mode 3 (ZIGZAG) - mulai PERTAMBAHAN');
            showToast('🔄 Beralih ke Mode ZIGZAG (PERTAMBAHAN)', 'info');
        } else if (strategyMode === 3) {
            zigzagUseReverse = !zigzagUseReverse;
            var metode = zigzagUseReverse ? "REVERSE" : "PERTAMBAHAN";
            console.log('🔄 Mode 3 tetap, metode berubah menjadi ' + metode);
            showToast('🔄 ZIGZAG → ' + metode, 'info');
        }
    }

    // ============================================================
    // 4. HOOK API
    // ============================================================
    function hookApi() {
        var originalFetch = window.fetch;
        window.fetch = function() {
            var args = arguments;
            return originalFetch.apply(this, arguments).then(function(response) {
                var url = args[0] || '';
                if (typeof url === 'string') {
                    if (url.includes('GetGameIssue')) {
                        response.clone().json().then(function(data) {
                            if (data && data.data && data.data.issueNumber) {
                                nextIssue = data.data.issueNumber;
                                console.log('📡 Periode baru: ' + nextIssue.slice(-3));
                            }
                        }).catch(function() {});
                    } else if (url.includes('GetNoaverageEmerdList')) {
                        response.clone().json().then(function(data) {
                            processData(data);
                        }).catch(function() {});
                    }
                }
                return response;
            });
        };

        var originalOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function() {
            var args = arguments;
            var url = args[1] || '';
            this.addEventListener('load', function() {
                if (typeof url === 'string') {
                    if (url.includes('GetNoaverageEmerdList')) {
                        try {
                            var data = JSON.parse(this.responseText);
                            processData(data);
                        } catch (e) {}
                    } else if (url.includes('GetGameIssue')) {
                        try {
                            var data = JSON.parse(this.responseText);
                            if (data && data.data && data.data.issueNumber) {
                                nextIssue = data.data.issueNumber;
                                console.log('📡 Periode baru: ' + nextIssue.slice(-3));
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
        var results = listData.map(function(item) {
            return {
                issue: item.issueNumber,
                number: parseInt(item.number),
                result: parseInt(item.number) <= 4 ? "KECIL" : "BESAR",
                colour: item.colour
            };
        });
        historicalData = results.concat(historicalData).slice(0, 20);
        console.log('📊 Data historis terkini: ' + historicalData.length + ' periode');
        if (historicalData.length >= 4) {
            var last4 = historicalData.slice(0,4).map(function(d) { return d.number; }).join(', ');
            console.log('   Angka 4 terakhir: ' + last4);
        }
    }

    function processData(data) {
        var list = data && data.data && data.data.list;
        if (!list || list.length === 0) return;
        var item = list[0];
        if (!item.issueNumber || !item.number) return;
        var issueNumber = item.issueNumber;
        var number = parseInt(item.number);
        var result = number <= 4 ? "KECIL" : "BESAR";
        if (lastProcessedIssue === issueNumber) return;

        console.log('📥 Hasil periode ' + issueNumber.slice(-3) + ': ' + number + ' (' + result + ')');
        analyzeTrendData(list);

        if (isBetPlaced) {
            var isWin = (currentPrediction === result);
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
    // 6. PROSES MENANG / KALAH (dengan stop condition)
    // ============================================================
    function processWin() {
        console.log('✅ MENANG!');
        totalProfit += currentBetAmount;

        // CEK TARGET PROFIT
        if (CONFIG.targetProfit > 0 && totalProfit >= CONFIG.targetProfit) {
            showToast('🎯 Target Profit ' + CONFIG.targetProfit.toLocaleString() + ' tercapai! Bot stop.', 'success');
            stopBot();
            return;
        }

        currentStreak = currentStreak > 0 ? currentStreak + 1 : 1;
        // CEK MAX WIN STREAK
        if (CONFIG.maxWinStreak > 0 && currentStreak >= CONFIG.maxWinStreak) {
            showToast('🔥 Win Streak ' + currentStreak + ' kali! Bot stop.', 'success');
            stopBot();
            return;
        }

        currentBetIndex = 0;
        currentBetAmount = betSequence[0];
        console.log('✅ MENANG! Reset level ke 1 (Rp ' + currentBetAmount.toLocaleString() + '). Streak: ' + currentStreak);
        showToast('✅ Menang! Reset level 1. Streak ' + currentStreak, 'success');
    }

    function processLoss() {
        console.log('❌ KALAH!');
        totalLoss += currentBetAmount;

        // CEK STOP LOSS
        if (CONFIG.stopLoss > 0 && totalLoss >= CONFIG.stopLoss) {
            showToast('🛑 Stop Loss ' + CONFIG.stopLoss.toLocaleString() + ' tercapai! Bot stop.', 'error');
            stopBot();
            return;
        }

        currentStreak = currentStreak < 0 ? currentStreak - 1 : -1;
        // CEK MAX LOSS STREAK
        if (CONFIG.maxLossStreak > 0 && Math.abs(currentStreak) >= CONFIG.maxLossStreak) {
            showToast('❌ Loss Streak ' + Math.abs(currentStreak) + ' kali! Bot stop.', 'error');
            stopBot();
            return;
        }

        updateModeOnLoss();

        // CEK LEVEL MAKSIMAL
        if (currentBetIndex < betSequence.length - 1 && currentBetIndex < CONFIG.maxBetLevel - 1) {
            currentBetIndex++;
            currentBetAmount = betSequence[currentBetIndex];
        } else {
            console.warn('⚠️ Mencapai batas level maksimal (' + CONFIG.maxBetLevel + ')! Reset ke level 1.');
            showToast('⚠️ Batas level ' + CONFIG.maxBetLevel + ', reset ke 1K', 'info');
            currentBetIndex = 0;
            currentBetAmount = betSequence[0];
        }
        console.log('❌ KALAH! Level ke ' + (currentBetIndex+1) + ' (Rp ' + currentBetAmount.toLocaleString() + ')');
        showToast('❌ Kalah! Level ' + (currentBetIndex+1) + ' (' + (currentBetAmount/1000) + 'K)', 'error');
    }

    // ============================================================
    // 7. FUNGSI TARUHAN
    // ============================================================
    function placeBet() {
        var pred = getPrediction();
        if (!pred) {
            console.warn('⚠️ Tidak ada prediksi, skip taruhan');
            showToast('⚠️ Tidak ada prediksi', 'error');
            return false;
        }

        currentPrediction = pred;
        isBetPlaced = true;
        console.log('🎯 Taruhan ditempatkan: ' + currentPrediction + ' (Level ' + (currentBetIndex+1) + ', Rp ' + currentBetAmount.toLocaleString() + ')');
        showToast('🎯 Taruhan ' + currentPrediction + ' (Level ' + (currentBetIndex+1) + ')', 'info');
        return true;
    }

    // ============================================================
    // 8. EKSEKUSI TARUHAN
    // ============================================================
    async function checkAndBet() {
        if (!isRunning) {
            console.log('⏹️ Bot sudah di-stop, skip eksekusi');
            return;
        }
        if (isProcessing) return;

        var now = Date.now();
        if (now - lastBetTime < CONFIG.betCooldown) return;

        var timer = getTimerInfo();
        if (!timer) {
            console.warn('⚠️ Timer tidak terdeteksi');
            showToast('⚠️ Timer tidak terdeteksi', 'error');
            return;
        }
        if (timer.seconds < CONFIG.minBetTime || timer.seconds > CONFIG.maxBetTime) return;
        if (historicalData.length < 4) {
            console.log('⏳ Data historis: ' + historicalData.length + '/4, menunggu...');
            showToast('⏳ Data historis ' + historicalData.length + '/4', 'info');
            return;
        }
        var currentPeriode = nextIssue ? nextIssue.slice(-3) : timer.seconds.toString();
        if (lastIssueProcessed === currentPeriode) {
            console.log('⏳ Periode ' + currentPeriode + ' sudah diproses');
            return;
        }

        isProcessing = true;
        try {
            console.log('🚀 Memulai proses taruhan untuk periode ' + currentPeriode);
            if (!placeBet()) return;

            var btnSelectors = currentPrediction === 'BESAR'
                ? ['.Betting__C-foot-b', '[class*="besar"]', 'button:contains("BESAR")']
                : ['.Betting__C-foot-s', '[class*="kecil"]', 'button:contains("KECIL")'];
            var betButton = findElement(btnSelectors);
            if (!betButton) {
                console.warn('⚠️ Tombol ' + currentPrediction + ' tidak ditemukan');
                showToast('⚠️ Tombol ' + currentPrediction + ' tidak ditemukan', 'error');
                return;
            }
            var style = window.getComputedStyle(betButton);
            if (style.opacity === '0.5' || style.pointerEvents === 'none') {
                console.warn('⚠️ Tombol ' + currentPrediction + ' tidak aktif (disabled)');
                showToast('⚠️ Tombol ' + currentPrediction + ' disabled', 'error');
                return;
            }
            console.log('🖱️ Mengklik tombol ' + currentPrediction);
            safeClick(betButton);
            await wait(1500);
            await processPopup(currentBetAmount);
            lastBetTime = Date.now();
            lastIssueProcessed = currentPeriode;
            console.log('✅ Taruhan selesai untuk periode ' + currentPeriode);
        } catch (error) {
            console.error('❌ Error dalam checkAndBet:', error);
            showToast('❌ Error: ' + error.message, 'error');
        } finally {
            isProcessing = false;
        }
    }

    // ============================================================
    // 9. UTILITY FUNCTIONS
    // ============================================================
    function getTimerInfo() {
        var timerSelectors = [
            '.timer', '.countdown', '.van-count-down',
            '[class*="timer"]', '[class*="countdown"]',
            '.Betting__C-head-t', '.game-timer',
            '.time-count', '.betting-timer', '.round-timer',
            '.number', '.time'
        ];
        for (var i = 0; i < timerSelectors.length; i++) {
            var els = document.querySelectorAll(timerSelectors[i]);
            for (var j = 0; j < els.length; j++) {
                var el = els[j];
                if (el && el.textContent.trim()) {
                    var text = el.textContent.trim();
                    if (text.match(/\d+/) || text.includes(':')) {
                        var seconds = 0;
                        if (text.includes(':')) {
                            var parts = text.split(':');
                            seconds = (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1].split('.')[0]) || 0);
                        } else if (text.includes('.')) {
                            seconds = parseFloat(text) || 0;
                        } else {
                            seconds = parseInt(text) || 0;
                        }
                        if (seconds > 0) {
                            console.log('⏳ Timer: ' + seconds + ' detik');
                            return { seconds: Math.floor(seconds), text: text };
                        }
                    }
                }
            }
        }
        var allElements = document.querySelectorAll('div, span, p, h1, h2, h3, h4, h5');
        for (var k = 0; k < allElements.length; k++) {
            var el = allElements[k];
            var text = el.textContent.trim();
            if (text && (text.includes(':') || /^\d{1,2}$/.test(text) || /^\d{1,2}\.\d$/.test(text))) {
                var seconds = 0;
                if (text.includes(':')) {
                    var parts = text.split(':');
                    seconds = parseInt(parts[0]) * 60 + parseInt(parts[1]);
                } else if (text.includes('.')) {
                    seconds = parseFloat(text);
                } else {
                    seconds = parseInt(text);
                }
                if (seconds > 0 && seconds < 60) {
                    console.log('⏳ Timer (alternatif): ' + seconds + ' detik');
                    return { seconds: Math.floor(seconds), text: text };
                }
            }
        }
        return null;
    }

    function safeClick(el) {
        if (!el || !el.click) return false;
        try { el.click(); return true; } catch (e) { return false; }
    }

    function wait(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

    function findElement(selectors, container) {
        container = container || document;
        for (var i = 0; i < selectors.length; i++) {
            var el = container.querySelector(selectors[i]);
            if (el) return el;
        }
        return null;
    }

    async function processPopup(amount) {
        console.log('🔍 Mencari popup untuk memasang taruhan...');
        for (var i = 0; i < 15; i++) {
            var popup = findElement([
                '.van-popup.van-popup--bottom',
                '.van-popup',
                '.bet-popup',
                '[class*="popup"]',
                '[class*="modal"]'
            ]);
            if (popup && popup.style.display !== 'none') {
                console.log('✅ Popup ditemukan');
                await fillAmount(popup, amount);
                return;
            }
            await wait(200);
        }
        console.warn('⚠️ Popup tidak muncul setelah 3 detik');
        showToast('⚠️ Popup taruhan tidak muncul', 'error');
    }

    async function fillAmount(popup, amount) {
        var input = popup.querySelector('input[type="tel"], input[type="number"]');
        if (input) {
            console.log('💵 Mengisi nominal: ' + amount + ' (' + (amount/1000) + 'K)');
            input.value = '';
            await wait(300);
            var multiplier = amount / 1000;
            input.value = multiplier.toString();
            input.dispatchEvent(new Event('input', { bubbles: true }));
            await wait(1000);
            if (CONFIG.autoConfirm) await confirmBet(popup);
            return;
        }
        var buttons = popup.querySelectorAll('button, div, span');
        for (var i = 0; i < buttons.length; i++) {
            var btn = buttons[i];
            var txt = btn.textContent || '';
            var num = parseInt(txt.replace(/[^\d]/g, ''));
            if (num === amount) {
                console.log('🖱️ Klik tombol cepat: ' + txt.trim());
                safeClick(btn);
                await wait(1000);
                if (CONFIG.autoConfirm) await confirmBet(popup);
                return;
            }
        }
        for (var j = 0; j < buttons.length; j++) {
            var btn = buttons[j];
            var txt = btn.textContent || '';
            if (txt.includes('x2') || txt.includes('X2')) {
                console.log('🖱️ Klik tombol X2');
                safeClick(btn);
                await wait(1000);
                if (CONFIG.autoConfirm) await confirmBet(popup);
                return;
            }
        }
        console.warn('⚠️ Tidak bisa mengisi nominal ' + amount);
        showToast('⚠️ Gagal isi nominal ' + (amount/1000) + 'K', 'error');
    }

    async function confirmBet(popup) {
        var confirmSelectors = [
            '.Betting__Popup-foot-s',
            '.van-button--primary',
            '[class*="confirm"]',
            '[class*="submit"]',
            'button:contains("Confirm")',
            'button:contains("Konfirmasi")',
            'button:contains("TARUH")',
            'button:contains("BET")'
        ];
        for (var i = 0; i < confirmSelectors.length; i++) {
            var selector = confirmSelectors[i];
            var button = null;
            if (selector.includes('contains')) {
                var text = selector.match(/contains\("([^"]+)"\)/)[1];
                var btns = popup.querySelectorAll('button');
                for (var j = 0; j < btns.length; j++) {
                    if (btns[j].textContent.includes(text)) { button = btns[j]; break; }
                }
            } else {
                button = popup.querySelector(selector);
            }
            if (button) {
                console.log('✅ Mengklik tombol konfirmasi: ' + button.textContent.trim());
                await wait(800);
                safeClick(button);
                return;
            }
        }
        console.warn('⚠️ Tombol konfirmasi tidak ditemukan');
        showToast('⚠️ Tombol konfirmasi tidak ditemukan', 'error');
    }

    // ============================================================
    // 10. MONITOR DAN KONTROL
    // ============================================================
    var monitorInterval = null;

    async function startBot() {
        if (isRunning) {
            console.log('⚠️ Bot sudah berjalan');
            showToast('⚠️ Bot sudah berjalan', 'info');
            return;
        }

        // Ambil CONFIG terbaru dari window.BotSettings (jika ada)
        CONFIG = getConfig();

        isRunning = true;
        currentBetIndex = 0;
        currentBetAmount = betSequence[0];
        strategyMode = 1;
        zigzagUseReverse = false;
        totalProfit = 0;
        totalLoss = 0;
        currentStreak = 0;

        // SESSION TIMEOUT
        if (CONFIG.sessionTimeout > 0) {
            if (sessionTimer) clearTimeout(sessionTimer);
            sessionTimer = setTimeout(function() {
                if (isRunning) {
                    showToast('⏱️ Sesi habis (' + (CONFIG.sessionTimeout/60) + ' menit), bot stop.', 'info');
                    stopBot();
                }
            }, CONFIG.sessionTimeout * 1000);
        }

        monitorInterval = setInterval(checkAndBet, 2000);
        setTimeout(checkAndBet, 1000);
        console.log('✅ Bot dimulai!');
        console.log('📊 Data saat ini: ' + historicalData.length + ' periode');
        if (nextIssue) console.log('📌 Periode berikutnya: ' + nextIssue.slice(-3));
        console.log('💵 Urutan Martingale: ' + betSequence.map(function(b) { return b/1000+'K'; }).join(' → '));
        console.log('🧠 Metode: 3-Mode Strategy (PERTAMBAHAN → REVERSE → ZIGZAG)');
        console.log('⚙️ Settings: Target Profit=' + CONFIG.targetProfit + ', Stop Loss=' + CONFIG.stopLoss + ', MaxLevel=' + CONFIG.maxBetLevel);
        showToast('✅ Bot started! Level 1 (1K) Mode PERTAMBAHAN', 'success');
    }

    function stopBot() {
        isRunning = false;
        if (monitorInterval) {
            clearInterval(monitorInterval);
            monitorInterval = null;
        }
        if (sessionTimer) {
            clearTimeout(sessionTimer);
            sessionTimer = null;
        }
        console.log('⏹️ Bot dihentikan.');
        showToast('⏹️ Bot stopped!', 'error');
    }

    function status() {
        var modeName = strategyMode === 1 ? "PERTAMBAHAN" : (strategyMode === 2 ? "REVERSE" : "ZIGZAG");
        var metode = (strategyMode === 3) ? (zigzagUseReverse ? "REVERSE" : "PERTAMBAHAN") : modeName;
        var info = {
            isRunning: isRunning,
            nextIssue: nextIssue ? nextIssue.slice(-3) : null,
            historicalCount: historicalData.length,
            currentStreak: currentStreak,
            betLevel: currentBetIndex + 1,
            lastPrediction: currentPrediction,
            strategyMode: strategyMode,
            zigzagUseReverse: zigzagUseReverse,
            currentBetAmount: currentBetAmount,
            totalProfit: totalProfit,
            totalLoss: totalLoss
        };
        var statusMsg = '🟢 Running: ' + info.isRunning + 
                        '\n📊 Level: ' + info.betLevel + ' (' + (currentBetAmount/1000) + 'K)' +
                        '\n🔥 Streak: ' + info.currentStreak +
                        '\n🎯 Prediksi: ' + (info.lastPrediction || '-') +
                        '\n🧠 Mode: ' + modeName + (strategyMode === 3 ? ' (' + metode + ')' : '') +
                        '\n📈 Data: ' + info.historicalCount + '/4' +
                        '\n💰 Profit: ' + totalProfit.toLocaleString() + ' | Loss: ' + totalLoss.toLocaleString();
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
        strategyMode = 1;
        zigzagUseReverse = false;
        totalProfit = 0;
        totalLoss = 0;
        console.log('🔄 Bot direset. Mode 1 (PERTAMBAHAN), Level 1 (1K).');
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

    console.log('✅ WINGO AUTO-BOT v6.4 (Terintegrasi Setting) siap!');
    console.log('📌 Perintah: wingoAuto.start() / stop() / status() / reset()');
    console.log('📌 Setting dapat diubah via tombol Setting di navbar.');

    showToast('✅ Bot siap!', 'success');

    // ============================================================
    // 12. VERIFIKASI UID & AUTO START
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
