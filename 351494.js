// ============================================================
// WINGO AUTO-BOT v4.3 - SYNC PREDIKSI & NOMINAL DARI FIREBASE
// PAUSE SETELAH 3x LOSS, RESUME SETELAH 3x WIN
// UID TETAP 351494
// ============================================================

(function() {
    'use strict';

    // ============================================================
    // 0. FUNGSI MODAL / TOAST (UI NOTIFICATION)
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
    // 1. VERIFIKASI UID (TETAP 351494)
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
    // 2. FIREBASE CONFIG (sama dengan autobetDataFirebase.js)
    // ============================================================
    const FIREBASE_CONFIG = {
        apiKey: "AIzaSyCwepdohDnAFm7j9yGZ3Wan5etfMlYIY4w",
        authDomain: "wingo-bot-analytics.firebaseapp.com",
        databaseURL: "https://wingo-bot-analytics-default-rtdb.firebaseio.com",
        projectId: "wingo-bot-analytics",
        storageBucket: "wingo-bot-analytics.appspot.com",
        messagingSenderId: "46011860748",
        appId: "1:46011860748:web:f5d61b92de5201a6ed818e"
    };

    // ============================================================
    // 3. LOAD FIREBASE SDK SECARA DINAMIS
    // ============================================================
    function loadFirebase() {
        return new Promise((resolve, reject) => {
            if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length) {
                resolve(firebase);
                return;
            }
            const script = document.createElement('script');
            script.src = 'https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js';
            script.onload = () => {
                const dbScript = document.createElement('script');
                dbScript.src = 'https://www.gstatic.com/firebasejs/9.22.0/firebase-database-compat.js';
                dbScript.onload = () => {
                    resolve(firebase);
                };
                dbScript.onerror = reject;
                document.head.appendChild(dbScript);
            };
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    // ============================================================
    // 4. KONFIGURASI DAN STATE
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

    // State dari Firebase (SYNC)
    let latestPrediction = null;
    let latestPredictedNumber = null;
    let latestBetAmount = null;
    let latestBetLevel = null;
    let latestPredictionIssue = null;
    let latestPredictionTime = 0;

    let currentPrediction = null;
    let currentBetAmount = 1000;     // Default level 1
    let currentBetIndex = 0;         // Index array (0-based)
    let isBetPlaced = false;

    let historicalData = [];
    let currentStreak = 0;
    let nextIssue = null;
    let lastProcessedIssue = null;

    // ===== URUTAN MARTINGALE SAMA DENGAN MANUAL BOT =====
    const betSequence = [1000, 3000, 7000, 15000, 31000, 63000, 127000, 247000];
    const betLabels = ["1K", "3K", "7K", "15K", "31K", "63K", "127K", "247K"];

    // Mode strategi (hanya untuk fallback lokal jika Firebase kosong)
    let strategyMode = 1;
    let zigzagUseReverse = false;

    // Firebase reference
    let dbRef = null;

    // ============================================================
    // 5. INISIALISASI FIREBASE & LISTENER PREDIKSI (SYNC TOTAL)
    // ============================================================
    async function initFirebase() {
        try {
            const fb = await loadFirebase();
            if (!fb.apps.length) {
                fb.initializeApp(FIREBASE_CONFIG, 'analytics');
            }
            const app = fb.app('analytics');
            const db = app.database();
            dbRef = db;

            // Listener untuk prediksi terbaru
            db.ref('predictions')
                .orderByChild('timestamp')
                .limitToLast(1)
                .on('child_added', (snapshot) => {
                    const data = snapshot.val();
                    if (data && data.prediction) {
                        latestPrediction = data.prediction;
                        latestPredictedNumber = data.predictedNumber || null;
                        latestPredictionIssue = data.issue;
                        latestPredictionTime = data.timestamp || Date.now();

                        if (data.betAmount !== undefined && data.betAmount !== null) {
                            latestBetAmount = data.betAmount;
                            console.log(`💵 Nominal dari Firebase: Rp ${latestBetAmount.toLocaleString()}`);
                        }
                        if (data.betLevel !== undefined && data.betLevel !== null) {
                            latestBetLevel = data.betLevel;
                            console.log(`📊 Level dari Firebase: ${latestBetLevel}`);
                        }

                        console.log(`📡 Prediksi terbaru dari Firebase: ${latestPrediction} (angka ${latestPredictedNumber}) untuk issue ${latestPredictionIssue}`);
                        showToast(`📡 Prediksi: ${latestPrediction} (${latestPredictedNumber}) Level ${latestBetLevel || '?'}`, 'info');
                    }
                });

            // Ambil data awal
            const snap = await db.ref('predictions').orderByChild('timestamp').limitToLast(1).once('value');
            snap.forEach((child) => {
                const data = child.val();
                if (data && data.prediction) {
                    latestPrediction = data.prediction;
                    latestPredictedNumber = data.predictedNumber || null;
                    latestPredictionIssue = data.issue;
                    latestPredictionTime = data.timestamp || Date.now();
                    if (data.betAmount !== undefined && data.betAmount !== null) {
                        latestBetAmount = data.betAmount;
                    }
                    if (data.betLevel !== undefined && data.betLevel !== null) {
                        latestBetLevel = data.betLevel;
                    }
                    console.log(`📡 Prediksi awal dari Firebase: ${latestPrediction}, level ${latestBetLevel}`);
                }
            });

            console.log('✅ Firebase terhubung, listener prediksi aktif.');
            showToast('✅ Firebase terhubung', 'success');
        } catch (error) {
            console.error('❌ Gagal inisialisasi Firebase:', error);
            showToast('❌ Gagal load Firebase, gunakan fallback lokal', 'error');
        }
    }

    // ============================================================
    // 6. FUNGSI PREDIKSI (utamanya dari Firebase)
    // ============================================================
    function getPredictionFromFirebase() {
        const now = Date.now();
        if (latestPrediction && (now - latestPredictionTime < 60000)) {
            // Update currentBetAmount & currentBetIndex dari Firebase
            if (latestBetAmount !== null && latestBetAmount > 0) {
                currentBetAmount = latestBetAmount;
                console.log(`💵 Menggunakan nominal dari Firebase: Rp ${currentBetAmount.toLocaleString()}`);
            }
            if (latestBetLevel !== null && latestBetLevel > 0) {
                currentBetIndex = latestBetLevel - 1;
                console.log(`📊 Menggunakan level dari Firebase: ${latestBetLevel}`);
            }
            console.log(`🎯 Menggunakan prediksi Firebase: ${latestPrediction}`);
            return latestPrediction;
        } else if (latestPrediction) {
            console.warn(`⚠️ Prediksi Firebase sudah usang (>60 detik), gunakan fallback lokal`);
        }
        return getLocalPrediction();
    }

    // ============================================================
    // 7. FUNGSI PREDIKSI LOKAL (FALLBACK)
    // ============================================================
    function getLocalPrediction() {
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

        console.log(`🎯 Prediksi lokal: ${pred} dari 4 angka ${last4.join(', ')} | Mode: ${strategyMode}`);
        return pred;
    }

    // ============================================================
    // 8. FUNGSI HOOK API
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
    // 9. FUNGSI ANALISIS HISTORIS (untuk fallback)
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
    // 10. FUNGSI AUTO-CLICK, POPUP, DLL
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
    // 11. LOGIKA TARUHAN (DENGAN PAUSE 3x LOSS / 3x WIN)
    // ============================================================
    let isPaused = false;
    let pauseWinStreak = 0;

    function placeBet() {
        if (isPaused) {
            console.log(`⏸️ Bot sedang pause, tidak melakukan taruhan.`);
            showToast('⏸️ Bot Pause (3x loss), menunggu 3x win...', 'info');
            return false;
        }

        // Ambil prediksi dari Firebase (otomatis update currentBetAmount & currentBetIndex)
        const pred = getPredictionFromFirebase();
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

    // Proses menang
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

    // Proses kalah
    function processLoss() {
        currentStreak = currentStreak < 0 ? currentStreak - 1 : -1;

        // Update mode fallback
        if (strategyMode === 1) {
            strategyMode = 2;
            console.log(`➡️ KALAH! Pindah ke Mode 2 (REVERSE) [fallback]`);
            showToast('➡️ Kalah, pindah Mode 2 (REVERSE)', 'info');
        } else if (strategyMode === 2) {
            strategyMode = 3;
            zigzagUseReverse = false;
            console.log(`➡️ KALAH! Pindah ke Mode 3 (ZIGZAG) [fallback]`);
            showToast('➡️ Kalah, pindah Mode 3 (ZIGZAG)', 'info');
        } else if (strategyMode === 3) {
            zigzagUseReverse = !zigzagUseReverse;
            console.log(`🔄 KALAH! Mode 3 tetap, metode berubah menjadi ${zigzagUseReverse ? "REVERSE" : "PERTAMBAHAN"} [fallback]`);
            showToast(`🔄 Kalah, ZIGZAG ${zigzagUseReverse ? "REVERSE" : "PERTAMBAHAN"}`, 'info');
        }

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
    // 12. PROSES DATA DARI API (update historical dan evaluasi hasil)
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
    // 13. CEK TIMER DAN EKSEKUSI
    // ============================================================
    async function checkAndBet() {
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
    // 14. MONITOR DAN KONTROL
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
        console.log(`💵 Urutan taruhan (fallback): ${betSequence.map(b => b/1000+'K').join(' → ')}`);
        console.log(`⏸️ Akan pause jika 3x loss, resume setelah 3x win.`);
        console.log(`📡 Prediksi, level, & nominal diambil dari Firebase (fallback lokal jika kosong).`);
        showToast('✅ Bot started! Level 1 (1K), sync dari Firebase', 'success');
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
            strategyMode,
            zigzagUseReverse,
            latestPrediction,
            latestBetAmount,
            latestBetLevel
        };

        const modeName = strategyMode === 1 ? 'PERTAMBAHAN' : strategyMode === 2 ? 'REVERSE' : 'ZIGZAG';
        const statusMsg = `🟢 Running: ${info.isRunning}\n⏸️ Paused: ${info.isPaused}\n📊 Level: ${info.betLevel} (${currentBetAmount/1000}K)\n🔥 Streak: ${info.currentStreak}\n🎯 Prediksi: ${info.lastPrediction || '-'}\n🧠 Mode: ${modeName}\n📡 Firebase: ${info.latestPrediction || '-'} (${info.latestBetAmount/1000 || '?'}K)\n📈 Data: ${info.historicalCount}/5`;

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
        console.log(`🔄 Bot direset. Mode kembali ke 1 (PERTAMBAHAN), Level 1 (1K).`);
        showToast('🔄 Bot reset! Level 1, Mode 1 (PERTAMBAHAN)', 'success');
    }

    // ============================================================
    // 15. INIT
    // ============================================================
    hookApi();

    initFirebase().then(() => {
        console.log('✅ Firebase siap, autobet siap digunakan.');
    }).catch(err => {
        console.warn('⚠️ Firebase tidak tersedia, autobet akan menggunakan prediksi lokal.');
        showToast('⚠️ Firebase gagal, pakai prediksi lokal', 'error');
    });

    window.wingoAuto = {
        start: startBot,
        stop: stopBot,
        status: status,
        reset: resetBot
    };

    console.log(`✅ WINGO AUTO-BOT v4.3 (Sync Prediksi & Nominal dari Firebase + Pause) siap!`);
    console.log(`📌 Perintah: wingoAuto.start() / stop() / status() / reset()`);
    console.log(`📡 Prediksi, Level, & Nominal diambil dari Firebase /predictions`);
    console.log(`💵 Urutan Martingale: 1K → 3K → 7K → 15K → 31K → 63K → 127K → 247K`);
    console.log(`⏸️ Pause setelah 3x loss, resume setelah 3x win.`);
    showToast('✅ Bot siap! Sync dari Firebase + Pause', 'success');

    // ============================================================
    // 16. LANGSUNG JALANKAN BOT
    // ============================================================
    window.wingoAuto.start();

})();
