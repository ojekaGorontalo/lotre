// ====================================================
// WINGO AUTO-BOT v4.2 - PAUSE SETELAH 3x LOSS, RESUME SETELAH 3x WIN
// DIMODIFIKASI: Metode prediksi 4 angka + 3 mode strategi
// VERIFIKASI UID TETAP (1999645) + MODAL UI TOAST
// ====================================================

(function() {
    'use strict';

    // ============================================================
    // 0. FUNGSI MODAL / TOAST (UI NOTIFICATION)
    // ============================================================
    function showToast(message, type) {
        // Hapus toast lama jika ada
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

        // Hilangkan setelah 4 detik
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(-50%) translateY(10px)';
            setTimeout(() => toast.remove(), 400);
        }, 4000);
    }

    // ============================================================
    // 1. VERIFIKASI UID (TANPA FIREBASE)
    // ============================================================
    var validUID = '1999645';
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
    
    let currentPrediction = null;
    let currentBetAmount = 2000;
    let currentBetIndex = 0;
    let isBetPlaced = false;
    
    let historicalData = [];
    let currentStreak = 0;
    let nextIssue = null;
    let lastProcessedIssue = null;
    
    const betSequence = [2000, 4000, 8000, 16000, 32000];
    const betLabels = ["2K", "4K", "8K", "16K", "32K"];
    
    let isPaused = false;
    let pauseWinStreak = 0;
    
    let strategyMode = 1;
    let zigzagUseReverse = false;

    // ============================================================
    // 3. HOOK API
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
        showToast('✅ API Hook terpasang', 'success');
    }

    // ============================================================
    // 4. FUNGSI ANALISIS DATA
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

    // ============================================================
    // 5. PREDIKSI DENGAN 4 ANGKA + 3 MODE
    // ============================================================
    function getPrediction() {
        if (historicalData.length < 4) {
            if (historicalData.length > 0) {
                const fallback = historicalData[0].result;
                console.log(`⚠️ Data <4, pakai fallback: ${fallback}`);
                return fallback;
            }
            return "KECIL";
        }

        const last4 = historicalData.slice(0, 4).map(d => d.number);
        const total = last4.reduce((a, b) => a + b, 0);
        const digitAkhir = total % 10;
        const hasilPertambahan = digitAkhir <= 4 ? "KECIL" : "BESAR";
        const hasilReverse = hasilPertambahan === "KECIL" ? "BESAR" : "KECIL";

        let pred = "";
        if (strategyMode === 1) {
            pred = hasilPertambahan;
        } else if (strategyMode === 2) {
            pred = hasilReverse;
        } else if (strategyMode === 3) {
            pred = zigzagUseReverse ? hasilReverse : hasilPertambahan;
        }

        const predictedNumber = pred === "KECIL" ? 2 : 7;
        console.log(`🎯 Prediksi: ${pred} (angka ${predictedNumber}) dari 4 angka ${last4.join(', ')} | Mode: ${strategyMode}${strategyMode===3 ? (zigzagUseReverse ? ' (R)' : ' (P)') : ''}`);
        return pred;
    }

    // ============================================================
    // 6. FUNGSI AUTO-CLICK, POPUP, DLL
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
    // 7. LOGIKA TARUHAN
    // ============================================================
    function placeBet() {
        if (isPaused) {
            console.log(`⏸️ Bot sedang pause, tidak melakukan taruhan.`);
            showToast('⏸️ Bot Pause (3x loss), menunggu 3x win...', 'info');
            return false;
        }
        currentPrediction = getPrediction();
        currentBetAmount = betSequence[currentBetIndex];
        isBetPlaced = true;
        console.log(`🎯 Taruhan ditempatkan: ${currentPrediction} (Level ${currentBetIndex+1}, Rp ${currentBetAmount.toLocaleString()})`);
        showToast(`🎯 Taruhan ${currentPrediction} (Level ${currentBetIndex+1})`, 'info');
        return true;
    }

    function processWin() {
        console.log(`✅ MENANG! Mode tetap: ${strategyMode}`);
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
                console.log(`🟢 RESUME BOT! Sudah 3x win berturut-turut, mulai lagi dari 2K.`);
                showToast('🟢 RESUME! 3x win, lanjut dari 2K', 'success');
            }
            return;
        }
        
        currentBetIndex = 0;
        currentBetAmount = betSequence[0];
        console.log(`✅ MENANG! Reset level ke 1. Streak: ${currentStreak}`);
        showToast(`✅ Menang! Reset level 1. Streak ${currentStreak}`, 'success');
    }

    function processLoss() {
        currentStreak = currentStreak < 0 ? currentStreak - 1 : -1;
        
        if (strategyMode === 1) {
            strategyMode = 2;
            console.log(`➡️ KALAH! Pindah ke Mode 2 (REVERSE)`);
            showToast('➡️ Kalah, pindah Mode 2 (REVERSE)', 'info');
        } else if (strategyMode === 2) {
            strategyMode = 3;
            zigzagUseReverse = false;
            console.log(`➡️ KALAH! Pindah ke Mode 3 (ZIGZAG) - mulai dengan PERTAMBAHAN`);
            showToast('➡️ Kalah, pindah Mode 3 (ZIGZAG) - PERTAMBAHAN', 'info');
        } else if (strategyMode === 3) {
            zigzagUseReverse = !zigzagUseReverse;
            console.log(`🔄 KALAH! Mode 3 tetap, metode berubah menjadi ${zigzagUseReverse ? "REVERSE" : "PERTAMBAHAN"}`);
            showToast(`🔄 Kalah, ZIGZAG ${zigzagUseReverse ? "REVERSE" : "PERTAMBAHAN"}`, 'info');
        }
        
        if (isPaused) {
            pauseWinStreak = 0;
            console.log(`❌ KALAH (dalam pause) - reset hitungan win untuk resume.`);
            showToast('❌ Kalah (pause) - hitungan win direset', 'error');
            return;
        }
        
        if (currentBetIndex < betSequence.length - 1) {
            currentBetIndex++;
            currentBetAmount = betSequence[currentBetIndex];
        }
        console.log(`❌ KALAH! Naik level ke ${currentBetIndex+1} (Rp ${currentBetAmount.toLocaleString()})`);
        showToast(`❌ Kalah! Level ${currentBetIndex+1} (${currentBetAmount/1000}K)`, 'error');
        
        if (currentStreak === -3) {
            isPaused = true;
            pauseWinStreak = 0;
            console.log(`⏸️ PAUSE! 3x loss berturut-turut. Menunggu 3x win untuk resume.`);
            showToast('⏸️ PAUSE! 3x loss berturut-turut', 'error');
        }
    }

    // ============================================================
    // 8. PROSES DATA DARI API
    // ============================================================
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
        }
        lastProcessedIssue = issueNumber;
    }

    // ============================================================
    // 9. CEK TIMER DAN EKSEKUSI
    // ============================================================
    async function checkAndBet() {
        if (isProcessing) return;
        if (isPaused) {
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
            showToast('⚠️ Timer tidak terdeteksi', 'error');
            return;
        }
        if (timer.seconds < CONFIG.minBetTime || timer.seconds > CONFIG.maxBetTime) {
            // console.log(`⏳ Timer ${timer.seconds}s di luar jendela (${CONFIG.minBetTime}-${CONFIG.maxBetTime})`);
            return;
        }
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
        isPaused = false;
        pauseWinStreak = 0;
        currentBetIndex = 0;
        currentBetAmount = betSequence[0];
        strategyMode = 1;
        zigzagUseReverse = false;
        monitorInterval = setInterval(checkAndBet, 2000);
        setTimeout(checkAndBet, 1000);
        console.log(`✅ Bot dimulai!`);
        console.log(`📊 Data saat ini: ${historicalData.length} periode`);
        if (nextIssue) console.log(`📌 Periode berikutnya: ${nextIssue.slice(-3)}`);
        console.log(`💵 Urutan taruhan: ${betSequence.map(b => b/1000+'K').join(' → ')}`);
        console.log(`⏸️ Akan pause jika 3x loss, resume setelah 3x win.`);
        console.log(`⚙️ Strategi: Mode 1 (PERTAMBAHAN) - akan berubah otomatis saat kalah.`);
        showToast('✅ Bot started! Level 1 (2K), Mode 1', 'success');
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
            lastIssueProcessed,
            strategyMode,
            zigzagUseReverse
        };
        
        // Tampilkan modal UI
        const modeName = strategyMode === 1 ? 'PERTAMBAHAN' : strategyMode === 2 ? 'REVERSE' : 'ZIGZAG';
        const statusMsg = `🟢 Running: ${info.isRunning}\n⏸️ Paused: ${info.isPaused}\n📊 Level: ${info.betLevel} (${betSequence[currentBetIndex]/1000}K)\n🔥 Streak: ${info.currentStreak}\n🎯 Prediksi: ${info.lastPrediction || '-'}\n🧠 Mode: ${modeName}\n📈 Data: ${info.historicalCount}/5`;
        
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
        strategyMode = 1;
        zigzagUseReverse = false;
        console.log(`🔄 Bot direset. Mode kembali ke 1 (PERTAMBAHAN).`);
        showToast('🔄 Bot reset! Level 1, Mode 1 (PERTAMBAHAN)', 'success');
    }

    // ============================================================
    // 11. INIT DAN EKSPOS OBJEK
    // ============================================================
    hookApi();

    window.wingoAuto = {
        start: startBot,
        stop: stopBot,
        status: status,
        reset: resetBot
    };

    console.log(`✅ WINGO AUTO-BOT v4.2 (UID tetap + Modal) siap!`);
    console.log(`📌 Perintah: wingoAuto.start() / stop() / status() / reset()`);
    console.log(`⚙️ Mode strategi: 1=PERTAMBAHAN, 2=REVERSE, 3=ZIGZAG (otomatis berubah saat kalah)`);
    showToast('✅ Bot siap! Ketik wingoAuto.start()', 'success');

    // ============================================================
    // 12. LANGSUNG JALANKAN BOT SETELAH VERIFIKASI SUKSES
    // ============================================================
    window.wingoAuto.start();

})();
