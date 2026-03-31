(function () {
    console.clear();
    console.log("🤖 WinGo Smart Trading Bot - System v7.1 (ALL GAMES + COUNTDOWN + FIREBASE)");

    /* ========= TELEGRAM ========= */
    const BOT_TOKEN = "8380843917:AAEpz0TiAlug533lGenKM8sDgTFH-0V5wAw";
    const TELEGRAM_GROUPS = {
        primary: "-1003291560910",
        secondary: ["-1001570553211"]
    };
    let enableMultipleGroups = false;
    let messageQueue = [];
    let isSendingMessage = false;
    const MESSAGE_DELAY = 800;

    /* ========= FIREBASE DATABASE ========= */
    const FIREBASE_URL = "https://wingo-bot-analytics-default-rtdb.firebaseio.com/";

    /* ========= SAFETY LIMITS ========= */
    const SAFETY_LIMITS = {
        maxConsecutiveLosses: 8,
        maxDailyLoss: 1000000,
        minBalance: 1,
        profitTarget: 1000000,
        maxBetLevel: 7
    };

    /* ========= SALDO VIRTUAL (KHUSUS 30 DETIK) ========= */
    let virtualBalance = 247000;
    let totalBets = 0;
    let totalWins = 0;
    let totalLosses = 0;
    let currentStreak = 0;
    let profitLoss = 0;
    let lastMotivationSentAtLoss = 0;
    let lastDonationMessageAtWin = 0;
    let isBotActive = true;
    let dailyStats = {
        date: new Date().toDateString(),
        bets: 0,
        wins: 0,
        losses: 0,
        profit: 0
    };

    /* ========= STRATEGI MARTINGALE ========= */
    const betSequence = [1000, 3000, 7000, 15000, 31000, 63000, 127000];
    const betLabels = ["1K", "3K", "7K", "15K", "31K", "63K", "127K"];
    let currentBetIndex = 0;
    let lastProcessedIssue = null;
    let currentBetAmount = betSequence[0];
    let isBetPlaced = false;
    let currentPrediction = null;
    let currentNumberPrediction = null;
    let nextIssueNumber = null;

    /* ========= VARIABEL SINKRONISASI ========= */
    let predictedIssue = null;
    let predictedAt = null;

    /* ========= HISTORIS (KHUSUS 30 DETIK) ========= */
    let historicalData = [];

    /* ========= SKIP BET SAAT ZIG-ZAK PANJANG & LEVEL TINGGI ========= */
    let skipNextBet = false;
    let skipReason = "";

    /* ========= DATA PERMAINAN UNTUK COUNTDOWN ========= */
    let currentGameData = null;
    let countdownInterval = null;

    /* ========= MODE PREDIKSI (BARU) ========= */
    let predictionMode = "trend_follower"; // "trend_follower" atau "zigzag"

    /* ========= FUNGSI PREDIKSI ANGKA (0-9) ========= */
    function predictNumber() {
        if (historicalData.length === 0) return 5;
        const lastNumbers = historicalData.slice(0, 5).map(d => d.number);
        let avg = lastNumbers.reduce((a, b) => a + b, 0) / lastNumbers.length;
        let predicted = Math.round(avg);
        predicted = Math.min(9, Math.max(0, predicted));
        console.log(`🔢 Prediksi angka (rata-rata ${lastNumbers.length} terakhir: ${lastNumbers.join(',')}) -> ${predicted}`);
        return predicted;
    }

    /* ========= DETEKSI POLA ALTERNASI (ZIG-ZAK) 4x ========= */
    function detectAlternatingPattern() {
        if (historicalData.length < 4) return null;
        const last4 = historicalData.slice(0, 4).map(item => item.result);
        const isAlternating = (last4[0] !== last4[1] && last4[1] !== last4[2] && last4[2] !== last4[3]);
        if (isAlternating) {
            console.log(`🔄 DETEKSI POLA ALTERNASI 4x: ${last4.join(' → ')}`);
            return last4[3];
        }
        return null;
    }

    /* ========= DETEKSI ZIG-ZAK KUAT (5 PERIODE BERGANTIAN SEMPURNA) ========= */
    function isStrongAlternating(periods = 5) {
        if (historicalData.length < periods) return false;
        const lastPeriods = historicalData.slice(0, periods).map(d => d.result);
        for (let i = 1; i < periods; i++) {
            if (lastPeriods[i] === lastPeriods[i-1]) return false;
        }
        console.log(`⚡ ZIG-ZAK KUAT terdeteksi (${periods} periode bergantian): ${lastPeriods.join(' → ')}`);
        return true;
    }

    /* ========= PREDIKSI UTAMA (DENGAN MODE BARU) ========= */
    function getPrediction() {
        if (historicalData.length === 0) {
            console.log("⚠️ Data kosong, default KECIL");
            return "KECIL";
        }

        if (predictionMode === "zigzag") {
            // Mode zig-zag: prediksi kebalikan dari hasil terakhir
            const lastResult = historicalData[0].result;
            const opposite = lastResult === "BESAR" ? "KECIL" : "BESAR";
            console.log(`🎯 MODE ZIGZAG: prediksi kebalikan dari ${lastResult} -> ${opposite}`);
            return opposite;
        } else {
            // Mode trend follower: ikuti hasil terakhir (trend)
            const lastResult = historicalData[0].result;
            console.log(`📈 TREND FOLLOWER: mengikuti ${lastResult}`);
            return lastResult;
        }
    }

    /* ========= FUNGSI FIREBASE ========= */
    async function sendToFirebase(path, data) {
        try {
            const timestamp = Date.now();
            const dataWithTimestamp = { ...data, timestamp, date: new Date().toISOString() };
            await fetch(`${FIREBASE_URL}${path}.json`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dataWithTimestamp)
            });
            console.log(`✅ Data terkirim ke Firebase: ${path}`);
            return true;
        } catch (error) {
            console.error(`❌ Error mengirim ke Firebase:`, error);
            return false;
        }
    }

    // Kirim data hasil (untuk semua permainan)
    function sendResultToFirebase(apiResultData, prediction, isWin, predictedNumber, gameType = 30) {
        const resultData = {
            issue: apiResultData.issueNumber,
            number: parseInt(apiResultData.number),
            colour: apiResultData.colour,
            premium: apiResultData.premium,
            result: parseInt(apiResultData.number) <= 4 ? "KECIL" : "BESAR",
            prediction: prediction,
            predictedNumber: predictedNumber,
            isWin: isWin,
            betAmount: currentBetAmount,
            betLevel: currentBetIndex + 1,
            balanceAfter: virtualBalance,
            profitLoss: profitLoss,
            gameType: gameType,
            timestamp: new Date().toISOString()
        };
        sendToFirebase("results", resultData);
    }

    // Kirim prediksi (khusus 30 detik)
    function sendPredictionToFirebase() {
        if (!predictedIssue) {
            console.warn("⚠️ predictedIssue tidak tersedia, prediksi tidak dikirim ke Firebase");
            return;
        }
        const predictionData = {
            issue: predictedIssue,
            prediction: currentPrediction,
            predictedNumber: currentNumberPrediction,
            betAmount: currentBetAmount,
            betLevel: currentBetIndex + 1,
            balanceAfterBet: virtualBalance,
            totalBets: totalBets,
            totalWins: totalWins,
            totalLosses: totalLosses,
            currentStreak: currentStreak,
            profitLoss: profitLoss,
            predictedAt: predictedAt.toISOString(),
            gameType: 30
        };
        sendToFirebase("predictions", predictionData);
        console.log(`📤 Prediksi dikirim ke Firebase: ${predictedIssue} → ${currentPrediction} (angka: ${currentNumberPrediction})`);
    }

    // Kirim data periode game (dari GetGameIssue) ke Firebase
    function sendGameIssueToFirebase(gameData) {
        if (!gameData || !gameData.issueNumber) return;
        const data = {
            issueNumber: gameData.issueNumber,
            startTime: gameData.startTime,
            endTime: gameData.endTime,
            serviceTime: gameData.serviceTime,
            intervalM: gameData.intervalM,
            typeId: gameData.typeId,
            serverNow: gameData.serviceNowTime
        };
        sendToFirebase("game_issues", data);
        console.log(`📅 Data game issue dikirim ke Firebase: ${gameData.issueNumber} (${gameData.intervalM} menit)`);
    }

    // Kirim countdown real-time ke Firebase (path: countdown/live)
    let lastCountdownSent = 0;
    async function sendCountdownToFirebase(remainingSeconds, issueNumber, endTime) {
        // Kirim maksimal setiap 1 detik, hindari spam
        const now = Date.now();
        if (now - lastCountdownSent < 1000) return;
        lastCountdownSent = now;
        const countdownData = {
            issueNumber: issueNumber,
            endTime: endTime,
            remainingSeconds: Math.max(0, remainingSeconds),
            timestamp: now
        };
        // Gunakan PUT agar selalu update data terbaru (tidak menumpuk)
        try {
            await fetch(`${FIREBASE_URL}countdown/live.json`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(countdownData)
            });
            console.log(`⏳ Countdown dikirim ke Firebase: ${remainingSeconds} detik tersisa`);
        } catch (e) {
            console.error("Gagal kirim countdown:", e);
        }
    }

    function resetBot() {
        const oldBalance = virtualBalance;
        virtualBalance = 247000;
        currentBetIndex = 0;
        totalBets = 0;
        totalWins = 0;
        totalLosses = 0;
        currentStreak = 0;
        profitLoss = 0;
        currentBetAmount = betSequence[0];
        isBetPlaced = false;
        nextIssueNumber = null;
        historicalData = [];
        lastMotivationSentAtLoss = 0;
        lastDonationMessageAtWin = 0;
        predictedIssue = null;
        predictedAt = null;
        messageQueue = [];
        isSendingMessage = false;
        skipNextBet = false;
        skipReason = "";
        predictionMode = "trend_follower"; // reset mode
        dailyStats = {
            date: new Date().toDateString(),
            bets: 0,
            wins: 0,
            losses: 0,
            profit: 0
        };
        isBotActive = true;
        sendResetToFirebase(oldBalance, "manual_reset");
        sendTelegram("🔄 <b>BOT DIRESET (v7.1 ALL GAMES)</b>\n💰 Saldo: 247.000");
    }

    function sendResetToFirebase(oldBalance, reason) {
        const resetData = {
            oldBalance: oldBalance,
            newBalance: 247000,
            reason: reason,
            resetTime: new Date().toISOString()
        };
        sendToFirebase("resets", resetData);
    }

    /* ========= TELEGRAM ========= */
    function sendTelegram(msg) {
        sendToGroup(msg, TELEGRAM_GROUPS.primary);
        if (enableMultipleGroups && TELEGRAM_GROUPS.secondary.length) {
            TELEGRAM_GROUPS.secondary.forEach(chatId => sendToGroup(msg, chatId));
        }
    }

    function sendToGroup(msg, chatId) {
        messageQueue.push({ msg, chatId });
        if (!isSendingMessage) processMessageQueue();
    }

    function processMessageQueue() {
        if (messageQueue.length === 0) {
            isSendingMessage = false;
            return;
        }
        isSendingMessage = true;
        const task = messageQueue.shift();
        fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: task.chatId, text: task.msg, parse_mode: "HTML" })
        })
        .then(() => setTimeout(processMessageQueue, MESSAGE_DELAY))
        .catch(e => {
            console.error(`❌ Telegram error:`, e);
            setTimeout(processMessageQueue, MESSAGE_DELAY * 2);
        });
    }

    /* ========= COUNTDOWN TIMER (SERVER TIME) ========= */
    function startCountdown(endTimeStr, issueNumber) {
        if (countdownInterval) clearInterval(countdownInterval);
        const endTime = new Date(endTimeStr.replace(' ', 'T')).getTime();
        function update() {
            const now = Date.now();
            const remainingMs = endTime - now;
            if (remainingMs <= 0) {
                if (countdownInterval) clearInterval(countdownInterval);
                countdownInterval = null;
                console.log(`⏰ Periode ${issueNumber} telah berakhir.`);
                sendCountdownToFirebase(0, issueNumber, endTimeStr);
                return;
            }
            const remainingSeconds = Math.floor(remainingMs / 1000);
            console.log(`⏳ [${issueNumber}] Sisa waktu: ${remainingSeconds} detik`);
            sendCountdownToFirebase(remainingSeconds, issueNumber, endTimeStr);
        }
        update();
        countdownInterval = setInterval(update, 1000);
    }

    /* ========= ANALISIS HISTORIS (KHUSUS 30 DETIK) ========= */
    function analyzeTrendData(listData) {
        if (!listData || listData.length < 5) return;
        const results = listData.map(item => ({
            issue: item.issueNumber,
            number: parseInt(item.number),
            result: parseInt(item.number) <= 4 ? "KECIL" : "BESAR",
            colour: item.colour
        }));
        historicalData = [...results, ...historicalData].slice(0, 20);
        if (historicalData.length >= 5) {
            const recentNumbers = historicalData.slice(0, 5).map(d => d.number);
            console.log(`📊 5 DATA TERBARU (30s): ${recentNumbers.join(', ')}`);
        }
    }

    /* ========= LOGIKA TARUHAN (KHUSUS 30 DETIK) ========= */
    function placeBet() {
        if (!isBotActive) return false;
        if (skipNextBet) {
            console.log(`⏸️ SKIP BET: ${skipReason}`);
            skipNextBet = false;
            skipReason = "";
            return false;
        }
        if (virtualBalance < currentBetAmount) {
            console.log("❌ Saldo tidak cukup, reset...");
            sendResetToFirebase(virtualBalance, "saldo_habis");
            virtualBalance = 247000;
            currentBetIndex = 0;
            currentBetAmount = betSequence[0];
            totalBets = 0;
            totalWins = 0;
            totalLosses = 0;
            currentStreak = 0;
            profitLoss = 0;
            predictedIssue = null;
            predictedAt = null;
            historicalData = [];
            lastMotivationSentAtLoss = 0;
            lastDonationMessageAtWin = 0;
            predictionMode = "trend_follower";
            sendTelegram("🚫 <b>SALDO HABIS - RESET OTOMATIS</b>");
            console.log("🔄 Saldo direset ke 247.000");
            return false;
        }
        if (isStrongAlternating(4) && currentBetIndex >= 3) {
            console.log(`⚠️ ZIG-ZAK PANJANG & LEVEL ${currentBetIndex+1} -> SKIP 1 PERIODE`);
            skipNextBet = true;
            skipReason = "Zig-zak panjang & level tinggi";
            return false;
        }
        virtualBalance -= currentBetAmount;
        totalBets++;
        dailyStats.bets++;
        dailyStats.profit -= currentBetAmount;
        isBetPlaced = true;
        currentPrediction = getPrediction();
        currentNumberPrediction = predictNumber();
        predictedAt = new Date();
        predictedIssue = nextIssueNumber;
        sendPredictionToFirebase();
        console.log(`🎯 [TARUHAN 30s] Prediksi: ${currentPrediction} (angka ${currentNumberPrediction}) untuk issue ${predictedIssue} | Taruhan: Rp ${currentBetAmount.toLocaleString()}`);
        return true;
    }

    function processResult(result, apiData) {
        if (!isBetPlaced || !isBotActive) return false;
        const isWin = currentPrediction === result;
        if (isWin) {
            const consecutiveLossesBeforeWin = currentStreak < 0 ? Math.abs(currentStreak) : 0;
            virtualBalance += (currentBetAmount * 2);
            totalWins++;
            currentStreak = currentStreak > 0 ? currentStreak + 1 : 1;
            lastMotivationSentAtLoss = 0;
            dailyStats.wins++;
            dailyStats.profit += (currentBetAmount * 2);
            console.log(`✅ MENANG! Prediksi ${currentPrediction} untuk issue ${apiData.issueNumber}`);
            sendResultToFirebase(apiData, currentPrediction, true, currentNumberPrediction, 30);
            currentBetIndex = 0;
            currentBetAmount = betSequence[0];
            console.log(`   ✅ Reset ke Level 1`);
            if (consecutiveLossesBeforeWin >= 5) {
                setTimeout(() => sendTelegram(`🎉 Menang setelah ${consecutiveLossesBeforeWin} kekalahan.`), 1000);
            }
        } else {
            totalLosses++;
            currentStreak = currentStreak < 0 ? currentStreak - 1 : -1;
            dailyStats.losses++;
            console.log(`❌ KALAH! Prediksi ${currentPrediction} untuk issue ${apiData.issueNumber}`);
            sendResultToFirebase(apiData, currentPrediction, false, currentNumberPrediction, 30);
            if (currentBetIndex < betSequence.length - 1) {
                currentBetIndex++;
                currentBetAmount = betSequence[currentBetIndex];
                console.log(`   🔺 Level naik ke ${currentBetIndex + 1} (Rp ${currentBetAmount.toLocaleString()})`);
            } else {
                console.log(`   ⚠️ Sudah level maksimal`);
            }
            const lossStreak = Math.abs(currentStreak);
            if (lossStreak === 3 && lastMotivationSentAtLoss < 3) {
                setTimeout(() => sendTelegram(`💪 ${lossStreak} kekalahan berturut-turut.`), 500);
                lastMotivationSentAtLoss = 3;
            } else if (lossStreak === 5 && lastMotivationSentAtLoss < 5) {
                setTimeout(() => sendTelegram(`💪 ${lossStreak} kekalahan beruntun.`), 500);
                lastMotivationSentAtLoss = 5;
            } else if (lossStreak === 7 && lastMotivationSentAtLoss < 7) {
                setTimeout(() => sendTelegram(`💪 ${lossStreak} kali kalah.`), 500);
                lastMotivationSentAtLoss = 7;
            }
        }
        profitLoss = virtualBalance - 247000;
        isBetPlaced = false;
        predictedIssue = null;
        predictedAt = null;

        // ===== UPDATE MODE PREDIKSI BERDASARKAN STREAK =====
        if (predictionMode === "trend_follower" && currentStreak <= -4) {
            predictionMode = "zigzag";
            console.log("🔄 MODE BERUBAH: trend_follower -> zigzag (kalah 4x berturut-turut)");
            sendTelegram(`🔄 MODE BERUBAH: trend_follower → zigzag (kalah 4x beruntun)`);
        } else if (predictionMode === "zigzag" && isWin) {
            predictionMode = "trend_follower";
            console.log("🔄 MODE BERUBAH: zigzag -> trend_follower (menang)");
            sendTelegram(`🔄 MODE BERUBAH: zigzag → trend_follower (menang)`);
        }

        return isWin;
    }

    /* ========= PROCESS DATA DARI API ========= */
    let isProcessing = false;
    function processData(data) {
        if (isProcessing) return;
        try {
            isProcessing = true;
            const list = data?.data?.list;
            if (!list || !list.length) {
                isProcessing = false;
                return;
            }
            const item = list[0];
            if (!item.issueNumber || !item.number) {
                isProcessing = false;
                return;
            }
            const issueNumber = item.issueNumber;
            const number = parseInt(item.number, 10);
            const result = number <= 4 ? "KECIL" : "BESAR";
            if (lastProcessedIssue === issueNumber) {
                isProcessing = false;
                return;
            }
            console.log(`\n══════════════════════════════════════════════════`);
            console.log(`📊 PERIODE ${issueNumber.slice(-3)}: ANGKA ${number} (${result})`);
            // Deteksi jenis permainan dari issue number? Tidak ada info. Kita asumsikan dari konteks.
            // Namun kita tetap catat hasil untuk semua permainan ke Firebase (tanpa prediksi jika bukan 30s)
            // Untuk sementara, kita hanya proses taruhan jika ini adalah permainan 30 detik.
            // Cara sederhana: cek apakah ada data game saat ini dengan intervalM 0.5 (30 detik)
            const isGame30s = (currentGameData && currentGameData.intervalM === 0.5);
            if (isGame30s) {
                analyzeTrendData(list);
                if (isBetPlaced) {
                    const apiData = {
                        issueNumber: item.issueNumber,
                        number: item.number,
                        colour: item.colour,
                        premium: item.premium
                    };
                    const isWin = processResult(result, apiData);
                    console.log(`   ${isWin ? '✅ MENANG' : '❌ KALAH'} | Saldo: ${virtualBalance.toLocaleString()}`);
                }
                setTimeout(() => {
                    if (placeBet()) {
                        const nextIssue = nextIssueNumber || issueNumber.slice(0, -3) + (parseInt(issueNumber.slice(-3)) + 1).toString().padStart(3,'0');
                        const shortIssue = nextIssue.slice(-3);
                        const message = `<b>WINGO 30s PREDIKSI v7.1</b>\n<b>🆔 PERIODE ${shortIssue}</b>\n<b>🎯 PREDIKSI: ${currentPrediction} ${betLabels[currentBetIndex]}</b>\n<b>🔢 ANGKA: ${currentNumberPrediction}</b>\n─────────────────\n<b>📊 LEVEL: ${currentBetIndex+1}/${betSequence.length}</b>\n<b>💳 SALDO: Rp ${virtualBalance.toLocaleString()}</b>\n<b>📈 P/L: ${profitLoss>=0?'🟢':'🔴'} ${profitLoss>=0?'+':''}${profitLoss.toLocaleString()}</b>`;
                        setTimeout(() => sendTelegram(message), 1500);
                    }
                    lastProcessedIssue = issueNumber;
                    isProcessing = false;
                }, 2000);
            } else {
                // Permainan lain (1m,3m,5m) - hanya catat hasil ke Firebase tanpa taruhan
                console.log(`📝 Mencatat hasil permainan lain (interval ${currentGameData?.intervalM} menit) ke Firebase`);
                const apiData = {
                    issueNumber: item.issueNumber,
                    number: item.number,
                    colour: item.colour,
                    premium: item.premium
                };
                // Kirim hasil tanpa prediksi
                sendResultToFirebase(apiData, null, false, null, currentGameData?.typeId || 0);
                lastProcessedIssue = issueNumber;
                isProcessing = false;
            }
        } catch (error) {
            console.error('Error:', error);
            isProcessing = false;
        }
    }

    function processGameIssueData(data) {
        try {
            if (data?.data?.issueNumber) {
                const gameData = {
                    issueNumber: data.data.issueNumber,
                    startTime: data.data.startTime,
                    endTime: data.data.endTime,
                    serviceTime: data.data.serviceTime,
                    intervalM: data.data.intervalM,
                    typeId: data.data.typeId || (data.data.intervalM === 0.5 ? 30 : (data.data.intervalM === 1 ? 1 : (data.data.intervalM === 3 ? 2 : 3))),
                    serviceNowTime: data.serviceNowTime
                };
                currentGameData = gameData;
                nextIssueNumber = gameData.issueNumber;
                console.log(`📅 Game Issue: ${gameData.issueNumber} | interval: ${gameData.intervalM} menit | endTime: ${gameData.endTime}`);
                // Kirim data game ke Firebase
                sendGameIssueToFirebase(gameData);
                // Mulai countdown untuk permainan apapun (akan ditampilkan di wingo.html)
                startCountdown(gameData.endTime, gameData.issueNumber);
            }
        } catch (error) {
            console.error('Error processing game issue:', error);
        }
    }

    /* ========= HOOK API ========= */
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
        return originalFetch.apply(this, arguments).then(response => {
            const responseClone = response.clone();
            const url = args[0] || '';
            if (typeof url === 'string') {
                if (url.includes('GetGameIssue')) {
                    responseClone.text().then(text => {
                        try {
                            const data = JSON.parse(text);
                            processGameIssueData(data);
                        } catch(e) {}
                    }).catch(() => {});
                } else if (url.includes('GetNoaverageEmerdList')) {
                    responseClone.text().then(text => {
                        try {
                            const data = JSON.parse(text);
                            processData(data);
                        } catch(e) {}
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
                    } catch(e) {}
                } else if (url.includes('GetGameIssue')) {
                    try {
                        const data = JSON.parse(this.responseText);
                        processGameIssueData(data);
                    } catch(e) {}
                }
            }
        });
        return originalOpen.apply(this, args);
    };

    function manualCheck() {
        fetch("https://api.55fiveapi.com/api/webapi/GetNoaverageEmerdList", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ typeId: 30, pageNo: 1, pageSize: 10 })
        })
        .then(res => res.json())
        .then(processData)
        .catch(console.error);
    }

    function addBalance(amount) {
        virtualBalance += amount;
        console.log(`💰 +${amount.toLocaleString()} | Saldo: ${virtualBalance.toLocaleString()}`);
        sendToFirebase("balance_changes", { amount, newBalance: virtualBalance, type: "manual_add_balance" });
    }

    /* ========= STARTUP ========= */
    console.log(`
    🤖 WINGO SMART TRADING BOT v7.1 - ALL GAMES + COUNTDOWN
    💰 Saldo awal: 247.000 (khusus 30 detik)
    🧮 Strategi: Zig-zak adaptive + Martingale
    📡 Firebase aktif (menyimpan semua game + countdown real-time)
    ✅ Bot siap!
    `);
    setInterval(manualCheck, 30000);
    setTimeout(manualCheck, 3000);
    setTimeout(() => {
        if (placeBet()) {
            const message = `<b>WINGO 30s PREDIKSI v7.1</b>\n<b>🆔 PERIODE ???</b>\n<b>🎯 PREDIKSI: ${currentPrediction} 1K</b>\n<b>🔢 ANGKA: ${currentNumberPrediction}</b>`;
            sendTelegram(message);
        }
    }, 2000);

    window.wingoBot = {
        check: manualCheck,
        reset: resetBot,
        add: addBalance,
        activate: () => { isBotActive = true; sendTelegram("✅ BOT DIAKTIFKAN"); },
        deactivate: () => { isBotActive = false; sendTelegram("⏸️ BOT DINONAKTIFKAN"); },
        stats: () => {
            const winRate = totalBets > 0 ? Math.round((totalWins/totalBets)*100) : 0;
            console.log(`💰 Saldo: ${virtualBalance.toLocaleString()}\n📈 P/L: ${profitLoss}\n🎯 Bet: ${totalBets} (W:${totalWins}/L:${totalLosses})\n📊 Win Rate: ${winRate}%\n🔥 Streak: ${currentStreak}\n📊 Level: ${currentBetIndex+1} (Rp ${currentBetAmount.toLocaleString()})`);
        }
    };
    window.wingoBetData = {
        get prediction() { return currentPrediction; },
        get numberPrediction() { return currentNumberPrediction; },
        get amount() { return currentBetAmount; },
        get balance() { return virtualBalance; }
    };
    console.log("✅ Bot ready! Gunakan window.wingoBot untuk kontrol.");
})();
