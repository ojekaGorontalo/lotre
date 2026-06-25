// prediksiAI.js - Manual Analysis Version (No AI, No Firebase Key)

(function () {
  console.clear();
  console.log("🤖 WinGo Smart Trading Bot - v12.0 (Manual Analysis)");

  /* ========= TELEGRAM ========= */
  const BOT_TOKEN = "8380843917:AAEpz0TiAlug533lGenKM8sDgTFH-0V5wAw";
  const TELEGRAM_GROUPS = {
    primary: "-1003291560910",
    secondary: ["-1001570553211"],
  };
  let enableMultipleGroups = false;
  const ENABLE_TELEGRAM = false; // ← SET false UNTUK MATIKAN, true UNTUK NYALAKAN
  let messageQueue = [];
  let isSendingMessage = false;
  const MESSAGE_DELAY = 800;

  /* ========= FIREBASE DATABASE ========= */
  const FIREBASE_URL = "https://wingo-bot-analytics-default-rtdb.firebaseio.com/";

  /* ========= SALDO VIRTUAL ========= */
  let virtualBalance = 2916000;
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
    profit: 0,
  };

  /* ========= STRATEGI MARTINGALE ========= */
  const betSequence = [1000, 3000, 8000, 24000, 72000, 216000, 648000, 1944000];
  const betLabels = ["1K", "3K", "8K", "24K", "72K", "216K", "648K", "1.944K"];
  let currentBetIndex = 0;
  let lastProcessedIssue = null;
  let currentBetAmount = betSequence[0];
  let isBetPlaced = false;
  let currentPrediction = null;
  let currentNumberPrediction = null;
  let nextIssueNumber = null;
  let predictedIssue = null;
  let predictedAt = null;
  let historicalData = [];
  let skipNextBet = false;
  let skipReason = "";
  let currentGameData = null;
  let countdownInterval = null;

  /* ========= VARIABEL ADAPTIF ZIGZAG ========= */
  let lossMode = false;
  let zigzagPrediction = null;
  let consecutiveLosses = 0;

  /* ========= KONFIGURASI PEMBERSIHAN DATA ========= */
  const MAX_DATA_LIMIT = 100;

  /* ========= FUNGSI ANALISIS MANUAL (BARU) ========= */
  function getManualPrediction() {
    // Ambil 4 hasil terbaru dari historicalData
    const recent = historicalData.slice(0, 4);
    if (recent.length === 0) {
      // Jika belum ada data, prediksi default (misal BESAR)
      console.log("⚠️ Belum ada data historis, prediksi default: BESAR (angka 7)");
      return { prediction: "BESAR", number: 7 };
    }

    // Hitung total angka
    const numbers = recent.map(item => item.number);
    const total = numbers.reduce((a, b) => a + b, 0);
    const digit = total % 10;
    const analisa = digit <= 4 ? "KECIL" : "BESAR";

    // Log analisa
    console.log(`📊 4 Data: ${numbers.join(", ")}`);
    console.log(`🧮 Total: ${total}`);
    console.log(`🔢 Digit Akhir: ${digit}`);
    console.log(`📈 Analisa: ${analisa}`);

    let prediksi;
    let angka;

    if (!lossMode) {
      // Mode normal: prediksi = kebalikan analisa
      prediksi = analisa === "KECIL" ? "BESAR" : "KECIL";
      angka = prediksi === "KECIL" ? 2 : 7;
      console.log(`🎯 Prediksi (normal): ${prediksi} (angka ${angka})`);
    } else {
      // Mode zigzag: gunakan zigzagPrediction
      prediksi = zigzagPrediction;
      angka = prediksi === "KECIL" ? 2 : 7;
      console.log(`⚠️ LOSS MODE AKTIF`);
      console.log(`🔄 ZIGZAG PREDIKSI: ${prediksi} (angka ${angka})`);
    }

    return { prediction: prediksi, number: angka };
  }

  /* ========= FIREBASE FUNCTIONS (tidak berubah) ========= */
  async function sendToFirebase(path, data) {
    try {
      const dataWithTimestamp = { ...data, timestamp: Date.now(), date: new Date().toISOString() };
      await fetch(`${FIREBASE_URL}${path}.json`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dataWithTimestamp),
      });
      console.log(`✅ Data terkirim ke Firebase: ${path}`);
      return true;
    } catch (error) {
      console.error(`❌ Error mengirim ke Firebase:`, error);
      return false;
    }
  }

  async function cleanupFirebaseCollection(path, limit = MAX_DATA_LIMIT) {
    try {
      const url = `${FIREBASE_URL}${path}.json`;
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`⚠️ Gagal mengambil data dari ${path} untuk pembersihan: ${response.status}`);
        return;
      }
      const data = await response.json();
      if (!data) return;
      const keys = Object.keys(data);
      if (keys.length <= limit) {
        console.log(`📦 ${path}: data saat ini ${keys.length} ≤ ${limit}, tidak perlu pembersihan.`);
        return;
      }
      const entries = keys.map(key => [key, data[key]]);
      entries.sort((a, b) => {
        const tsA = a[1]?.timestamp || 0;
        const tsB = b[1]?.timestamp || 0;
        return tsB - tsA;
      });
      const toKeep = entries.slice(0, limit).map(entry => entry[0]);
      const toDelete = entries.slice(limit).map(entry => entry[0]);
      const deletePromises = toDelete.map(key =>
        fetch(`${FIREBASE_URL}${path}/${key}.json`, { method: 'DELETE' })
      );
      await Promise.all(deletePromises);
      console.log(`🧹 Pembersihan ${path}: menyisakan ${toKeep.length} data, dihapus ${toDelete.length} data lama.`);
    } catch (error) {
      console.error(`❌ Gagal membersihkan ${path}:`, error);
    }
  }

  async function cleanupAllCollections() {
    const collections = ['results', 'predictions', 'game_issues', 'resets', 'balance_changes'];
    for (const col of collections) {
      await cleanupFirebaseCollection(col);
    }
  }

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
      totalBets: totalBets,
      totalWins: totalWins,
      totalLosses: totalLosses,
      currentStreak: currentStreak,
      gameType: gameType,
    };
    sendToFirebase("results", resultData);
  }

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
      gameType: 30,
    };
    sendToFirebase("predictions", predictionData);
    console.log(`📤 Prediksi manual dikirim ke Firebase: ${predictedIssue} → ${currentPrediction} (angka: ${currentNumberPrediction})`);
  }

  function sendGameIssueToFirebase(gameData) {
    if (!gameData || !gameData.issueNumber) return;
    const data = {
      issueNumber: gameData.issueNumber,
      startTime: gameData.startTime,
      endTime: gameData.endTime,
      serviceTime: gameData.serviceTime,
      intervalM: gameData.intervalM,
      typeId: gameData.typeId,
      serverNow: gameData.serviceNowTime,
    };
    sendToFirebase("game_issues", data);
  }

  let lastCountdownSent = 0;
  async function sendCountdownToFirebase(remainingSeconds, issueNumber, endTime) {
    const now = Date.now();
    if (now - lastCountdownSent < 1000) return;
    lastCountdownSent = now;
    const countdownData = { issueNumber, endTime, remainingSeconds: Math.max(0, remainingSeconds) };
    try {
      await fetch(`${FIREBASE_URL}countdown/live.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(countdownData),
      });
      console.log(`⏳ Countdown dikirim ke Firebase: ${remainingSeconds} detik tersisa`);
    } catch (e) { console.error("Gagal kirim countdown:", e); }
  }

  function sendResetToFirebase(oldBalance, reason) {
    sendToFirebase("resets", { oldBalance, newBalance: 2916000, reason, resetTime: new Date().toISOString() });
  }

  function sendTelegram(msg) {
    if (!ENABLE_TELEGRAM) return;
    sendToGroup(msg, TELEGRAM_GROUPS.primary);
    if (enableMultipleGroups && TELEGRAM_GROUPS.secondary.length) {
      TELEGRAM_GROUPS.secondary.forEach((chatId) => sendToGroup(msg, chatId));
    }
  }
  function sendToGroup(msg, chatId) {
    messageQueue.push({ msg, chatId });
    if (!isSendingMessage) processMessageQueue();
  }
  function processMessageQueue() {
    if (messageQueue.length === 0) { isSendingMessage = false; return; }
    isSendingMessage = true;
    const task = messageQueue.shift();
    fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: task.chatId, text: task.msg, parse_mode: "HTML" }),
    })
      .then(() => setTimeout(processMessageQueue, MESSAGE_DELAY))
      .catch((e) => { console.error(`❌ Telegram error:`, e); setTimeout(processMessageQueue, MESSAGE_DELAY * 2); });
  }

  /* ========= COUNTDOWN TIMER ========= */
  function startCountdown(endTimeStr, issueNumber) {
    if (countdownInterval) clearInterval(countdownInterval);
    const endTime = new Date(endTimeStr.replace(" ", "T")).getTime();
    function update() {
      const now = Date.now();
      const remainingMs = endTime - now;
      if (remainingMs <= 0) {
        if (countdownInterval) clearInterval(countdownInterval);
        countdownInterval = null;
        sendCountdownToFirebase(0, issueNumber, endTimeStr);
        return;
      }
      const remainingSeconds = Math.floor(remainingMs / 1000);
      sendCountdownToFirebase(remainingSeconds, issueNumber, endTimeStr);
    }
    update();
    countdownInterval = setInterval(update, 1000);
  }

  /* ========= ANALISIS HISTORIS ========= */
  function analyzeTrendData(listData) {
    if (!listData || listData.length < 5) return;
    const results = listData.map((item) => ({
      issue: item.issueNumber,
      number: parseInt(item.number),
      result: parseInt(item.number) <= 4 ? "KECIL" : "BESAR",
      colour: item.colour,
    }));
    historicalData = [...results, ...historicalData].slice(0, 20);
    if (historicalData.length >= 5) {
      const recentNumbers = historicalData.slice(0, 5).map(d => d.number);
      console.log(`📊 5 DATA TERBARU: ${recentNumbers.join(", ")}`);
    }
  }

  /* ========= LOGIKA TARUHAN ========= */
  async function placeBet() {
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
      virtualBalance = 2916000;
      currentBetIndex = 0;
      currentBetAmount = betSequence[0];
      totalBets = totalWins = totalLosses = currentStreak = profitLoss = 0;
      predictedIssue = predictedAt = null;
      historicalData = [];
      lastMotivationSentAtLoss = lastDonationMessageAtWin = 0;
      sendTelegram("🚫 <b>SALDO HABIS - RESET OTOMATIS</b>");
      console.log("🔄 Saldo direset ke 2.916.000");
      return false;
    }

    virtualBalance -= currentBetAmount;
    totalBets++;
    dailyStats.bets++;
    dailyStats.profit -= currentBetAmount;
    isBetPlaced = true;

    const manualPred = getManualPrediction();
    currentPrediction = manualPred.prediction;
    currentNumberPrediction = manualPred.number;

    predictedAt = new Date();
    predictedIssue = nextIssueNumber;

    sendPredictionToFirebase();

    console.log(`🎯 [TARUHAN 30s] Prediksi Manual: ${currentPrediction} (angka ${currentNumberPrediction}) untuk issue ${predictedIssue} | Taruhan: Rp ${currentBetAmount.toLocaleString()}`);
    return true;
  }

  function processResult(result, apiData) {
    if (!isBetPlaced || !isBotActive) return false;
    const isWin = currentPrediction === result;

    if (isWin) {
      const consecutiveLossesBeforeWin = currentStreak < 0 ? Math.abs(currentStreak) : 0;
      virtualBalance += currentBetAmount * 2;
      totalWins++;
      currentStreak = currentStreak > 0 ? currentStreak + 1 : 1;
      lastMotivationSentAtLoss = 0;
      dailyStats.wins++;
      dailyStats.profit += currentBetAmount * 2;
      console.log(`✅ MENANG! Prediksi Manual ${currentPrediction} untuk issue ${apiData.issueNumber}`);

      // Reset loss mode
      consecutiveLosses = 0;
      lossMode = false;
      zigzagPrediction = null;

      sendResultToFirebase(apiData, currentPrediction, true, currentNumberPrediction, 30);
      currentBetIndex = 0;
      currentBetAmount = betSequence[0];
      console.log(` ✅ Reset ke Level 1`);
      if (consecutiveLossesBeforeWin >= 5) {
        setTimeout(() => sendTelegram(`🎉 Menang setelah ${consecutiveLossesBeforeWin} kekalahan.`), 1000);
      }
    } else {
      totalLosses++;
      currentStreak = currentStreak < 0 ? currentStreak - 1 : -1;
      dailyStats.losses++;
      console.log(`❌ KALAH! Prediksi Manual ${currentPrediction} untuk issue ${apiData.issueNumber}`);

      // Update loss mode (zigzag adaptif)
      consecutiveLosses++;
      if (!lossMode) {
        lossMode = true;
        zigzagPrediction = currentPrediction === "KECIL" ? "BESAR" : "KECIL";
      } else {
        zigzagPrediction = zigzagPrediction === "KECIL" ? "BESAR" : "KECIL";
      }
      console.log(`🔄 Loss mode aktif, zigzagPrediction = ${zigzagPrediction}`);

      sendResultToFirebase(apiData, currentPrediction, false, currentNumberPrediction, 30);
      if (currentBetIndex < betSequence.length - 1) {
        currentBetIndex++;
        currentBetAmount = betSequence[currentBetIndex];
        console.log(` 🔺 Level naik ke ${currentBetIndex + 1} (Rp ${currentBetAmount.toLocaleString()})`);
      } else {
        console.log(` ⚠️ Sudah level maksimal`);
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

    profitLoss = virtualBalance - 2916000;
    isBetPlaced = false;
    predictedIssue = null;
    predictedAt = null;
    return isWin;
  }

  /* ========= PROCESS DATA API ========= */
  let isProcessing = false;
  function processData(data) {
    if (isProcessing) return;
    try {
      isProcessing = true;
      const list = data?.data?.list;
      if (!list || !list.length) { isProcessing = false; return; }
      const item = list[0];
      if (!item.issueNumber || !item.number) { isProcessing = false; return; }
      const issueNumber = item.issueNumber;
      const number = parseInt(item.number, 10);
      const result = number <= 4 ? "KECIL" : "BESAR";
      if (lastProcessedIssue === issueNumber) { isProcessing = false; return; }
      console.log(`\n══════════════════════════════════════════════════`);
      console.log(`📊 PERIODE ${issueNumber.slice(-3)}: ANGKA ${number} (${result})`);
      const isGame30s = currentGameData && currentGameData.intervalM === 0.5;
      if (isGame30s) {
        analyzeTrendData(list);
        if (isBetPlaced) {
          const apiData = { issueNumber: item.issueNumber, number: item.number, colour: item.colour, premium: item.premium };
          const isWin = processResult(result, apiData);
          console.log(` ${isWin ? "✅ MENANG" : "❌ KALAH"} | Saldo: ${virtualBalance.toLocaleString()}`);
        }
        setTimeout(async () => {
          if (await placeBet()) {
            const nextIssue = nextIssueNumber || issueNumber.slice(0, -3) + (parseInt(issueNumber.slice(-3)) + 1).toString().padStart(3, "0");
            const shortIssue = nextIssue.slice(-3);
            const message = `<b>WINGO 30s PREDIKSI v12.0 (Manual)</b>\n<b>🆔 PERIODE ${shortIssue}</b>\n<b>🎯 PREDIKSI: ${currentPrediction} ${betLabels[currentBetIndex]}</b>\n<b>🔢 ANGKA: ${currentNumberPrediction}</b>\n─────────────────\n<b>📊 LEVEL: ${currentBetIndex + 1}/${betSequence.length}</b>\n<b>💳 SALDO: Rp ${virtualBalance.toLocaleString()}</b>\n<b>📈 P/L: ${profitLoss >= 0 ? "🟢" : "🔴"} ${profitLoss >= 0 ? "+" : ""}${profitLoss.toLocaleString()}</b>`;
            setTimeout(() => sendTelegram(message), 1500);
          }
          lastProcessedIssue = issueNumber;
          isProcessing = false;
        }, 2000);
      } else {
        console.log(`📝 Mencatat hasil permainan lain (interval ${currentGameData?.intervalM} menit) ke Firebase`);
        const apiData = { issueNumber: item.issueNumber, number: item.number, colour: item.colour, premium: item.premium };
        sendResultToFirebase(apiData, null, false, null, currentGameData?.typeId || 0);
        lastProcessedIssue = issueNumber;
        isProcessing = false;
      }
    } catch (error) { console.error("Error:", error); isProcessing = false; }
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
          typeId: data.data.typeId || (data.data.intervalM === 0.5 ? 30 : data.data.intervalM === 1 ? 1 : data.data.intervalM === 3 ? 2 : 3),
          serviceNowTime: data.serviceNowTime,
        };
        currentGameData = gameData;
        nextIssueNumber = gameData.issueNumber;
        console.log(`📅 Game Issue: ${gameData.issueNumber} | interval: ${gameData.intervalM} menit | endTime: ${gameData.endTime}`);
        sendGameIssueToFirebase(gameData);
        startCountdown(gameData.endTime, gameData.issueNumber);
      }
    } catch (error) { console.error("Error processing game issue:", error); }
  }

  /* ========= HOOK API ========= */
  const originalFetch = window.fetch;
  window.fetch = function (...args) {
    return originalFetch.apply(this, arguments).then((response) => {
      const responseClone = response.clone();
      const url = args[0] || "";
      if (typeof url === "string") {
        if (url.includes("GetGameIssue")) {
          responseClone.text().then(text => { try { const data = JSON.parse(text); processGameIssueData(data); } catch(e) {} }).catch(() => {});
        } else if (url.includes("GetNoaverageEmerdList")) {
          responseClone.text().then(text => { try { const data = JSON.parse(text); processData(data); } catch(e) {} }).catch(() => {});
        }
      }
      return response;
    });
  };
  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (...args) {
    const url = args[1] || "";
    this.addEventListener("load", function () {
      if (typeof url === "string") {
        if (url.includes("GetNoaverageEmerdList")) { try { const data = JSON.parse(this.responseText); processData(data); } catch(e) {} }
        else if (url.includes("GetGameIssue")) { try { const data = JSON.parse(this.responseText); processGameIssueData(data); } catch(e) {} }
      }
    });
    return originalOpen.apply(this, args);
  };

  function manualCheck() {
    fetch("https://api.55fiveapi.com/api/webapi/GetNoaverageEmerdList", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ typeId: 30, pageNo: 1, pageSize: 10 }),
    }).then(res => res.json()).then(processData).catch(console.error);
  }

  function addBalance(amount) {
    virtualBalance += amount;
    console.log(`💰 +${amount.toLocaleString()} | Saldo: ${virtualBalance.toLocaleString()}`);
    sendToFirebase("balance_changes", { amount, newBalance: virtualBalance, type: "manual_add_balance" });
  }

  function resetBot() {
    const oldBalance = virtualBalance;
    virtualBalance = 2916000;
    currentBetIndex = 0;
    totalBets = totalWins = totalLosses = currentStreak = profitLoss = 0;
    currentBetAmount = betSequence[0];
    isBetPlaced = false;
    nextIssueNumber = null;
    historicalData = [];
    lastMotivationSentAtLoss = lastDonationMessageAtWin = 0;
    predictedIssue = predictedAt = null;
    messageQueue = []; isSendingMessage = false;
    skipNextBet = false; skipReason = "";
    dailyStats = { date: new Date().toDateString(), bets: 0, wins: 0, losses: 0, profit: 0 };
    isBotActive = true;
    // Reset loss mode
    lossMode = false;
    zigzagPrediction = null;
    consecutiveLosses = 0;
    sendResetToFirebase(oldBalance, "manual_reset");
    sendTelegram("🔄 <b>BOT DIRESET (v12.0 Manual)</b>\n💰 Saldo: 2.916.000");
  }

  /* ========= STARTUP ========= */
  (function start() {
    console.log(`
 🤖 WINGO SMART TRADING BOT v12.0 - MANUAL ANALYSIS
 💰 Saldo awal: 2.916.000 (khusus 30 detik)
 📊 Algoritma: jumlah 4 angka terakhir → digit terakhir → analisa KECIL/BESAR
 🔄 Prediksi = kebalikan analisa (normal), zigzag otomatis saat kalah beruntun
 📡 Firebase aktif (menyimpan semua data + countdown)
 ✅ Bot siap!`);

    setInterval(manualCheck, 30000);
    setTimeout(manualCheck, 3000);

    setTimeout(async () => {
      if (await placeBet()) {
        const message = `<b>WINGO 30s PREDIKSI v12.0 (Manual)</b>\n<b>🆔 PERIODE ???</b>\n<b>🎯 PREDIKSI: ${currentPrediction} 1K</b>\n<b>🔢 ANGKA: ${currentNumberPrediction}</b>`;
        sendTelegram(message);
      }
    }, 2000);

    setInterval(cleanupAllCollections, 300000);
    setTimeout(cleanupAllCollections, 10000);
  })();

  window.wingoBot = {
    check: manualCheck,
    reset: resetBot,
    add: addBalance,
    activate: () => { isBotActive = true; sendTelegram("✅ BOT DIAKTIFKAN"); },
    deactivate: () => { isBotActive = false; sendTelegram("⏸️ BOT DINONAKTIFKAN"); },
    stats: () => {
      const winRate = totalBets > 0 ? Math.round((totalWins / totalBets) * 100) : 0;
      console.log(`💰 Saldo: ${virtualBalance.toLocaleString()}\n📈 P/L: ${profitLoss}\n🎯 Bet: ${totalBets} (W:${totalWins}/L:${totalLosses})\n📊 Win Rate: ${winRate}%\n🔥 Streak: ${currentStreak}\n📊 Level: ${currentBetIndex + 1} (Rp ${currentBetAmount.toLocaleString()})`);
    },
    cleanup: cleanupAllCollections,
  };
  window.wingoBetData = {
    get prediction() { return currentPrediction; },
    get numberPrediction() { return currentNumberPrediction; },
    get amount() { return currentBetAmount; },
    get balance() { return virtualBalance; },
  };
  console.log("✅ Bot ready! Gunakan window.wingoBot untuk kontrol.");
})();
