// ============================================================
//  WINGO BOT v13 - FULL (Mode A + Reverse setelah 6 kalah)
//  Berjalan di console browser (https://551br.com)
// ============================================================

(function () {
  console.clear();
  console.log("🤖 Wingo Bot v13 - Full Mode (A + Reverse)");

  // ===================== KONFIGURASI =====================
  const BOT_TOKEN = "8380843917:AAEpz0TiAlug533lGenKM8sDgTFH-0V5wAw";
  const TELEGRAM_GROUPS = {
    primary: "-1003291560910",
    secondary: ["-1001570553211"],
  };
  let enableMultipleGroups = false;

  const FIREBASE_URL = "https://wingo-bot-analytics-default-rtdb.firebaseio.com/";

  // ===================== SALDO & STATS =====================
  let virtualBalance = 247000;
  let totalBets = 0;
  let totalWins = 0;
  let totalLosses = 0;
  let currentStreak = 0;          // positif = menang, negatif = kalah
  let profitLoss = 0;
  let dailyStats = {
    date: new Date().toDateString(),
    bets: 0,
    wins: 0,
    losses: 0,
    profit: 0,
  };

  // ===================== MARTINGALE =====================
  const betSequence = [1000, 3000, 7000, 15000, 31000, 63000, 127000];
  const betLabels = ["1K", "3K", "7K", "15K", "31K", "63K", "127K"];
  let currentBetIndex = 0;
  let currentBetAmount = betSequence[0];

  // ===================== STATUS BOT =====================
  let isBotActive = true;
  let isBetPlaced = false;
  let lastProcessedIssue = null;
  let nextIssueNumber = null;
  let currentPrediction = null;      // "KECIL" / "BESAR"
  let currentNumberPrediction = null;
  let predictedIssue = null;
  let predictedAt = null;
  let historicalData = [];
  let currentGameData = null;
  let countdownInterval = null;
  let skipNextBet = false;
  let skipReason = "";

  // ===================== VARIABLE UNTUK REVERSE =====================
  let useReverse = false;           // TRUE = gunakan prediksi terbalik
  let reverseTriggered = false;     // Flag bahwa reverse sudah dipakai untuk satu kali taruhan

  // ===================== TELEGRAM =====================
  let messageQueue = [];
  let isSendingMessage = false;
  const MESSAGE_DELAY = 800;

  function sendTelegram(msg) {
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
      .catch((e) => { console.error("Telegram error:", e); setTimeout(processMessageQueue, MESSAGE_DELAY * 2); });
  }

  // ===================== FIREBASE =====================
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

  async function cleanupFirebaseCollection(path, limit = 100) {
    try {
      const url = `${FIREBASE_URL}${path}.json`;
      const response = await fetch(url);
      if (!response.ok) return;
      const data = await response.json();
      if (!data) return;
      const keys = Object.keys(data);
      if (keys.length <= limit) return;
      const entries = keys.map(key => [key, data[key]]);
      entries.sort((a, b) => (b[1]?.timestamp || 0) - (a[1]?.timestamp || 0));
      const toDelete = entries.slice(limit).map(entry => entry[0]);
      await Promise.all(toDelete.map(key => fetch(`${FIREBASE_URL}${path}/${key}.json`, { method: 'DELETE' })));
      console.log(`🧹 Pembersihan ${path}: dihapus ${toDelete.length} data lama.`);
    } catch (e) { console.error(`Gagal bersihkan ${path}:`, e); }
  }

  async function cleanupAllCollections() {
    const cols = ['results', 'predictions', 'game_issues', 'resets', 'balance_changes'];
    for (const col of cols) await cleanupFirebaseCollection(col);
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
      totalBets, totalWins, totalLosses, currentStreak,
      gameType,
    };
    sendToFirebase("results", resultData);
  }

  function sendPredictionToFirebase() {
    if (!predictedIssue) return;
    const predictionData = {
      issue: predictedIssue,
      prediction: currentPrediction,
      predictedNumber: currentNumberPrediction,
      betAmount: currentBetAmount,
      betLevel: currentBetIndex + 1,
      balanceAfterBet: virtualBalance,
      totalBets, totalWins, totalLosses, currentStreak, profitLoss,
      predictedAt: predictedAt.toISOString(),
      gameType: 30,
      reverseMode: useReverse,
    };
    sendToFirebase("predictions", predictionData);
  }

  function sendResetToFirebase(oldBalance, reason) {
    sendToFirebase("resets", { oldBalance, newBalance: 247000, reason, resetTime: new Date().toISOString() });
  }

  // ===================== ANALISIS MANUAL (Mode A) =====================
  function getManualPrediction() {
    const data = historicalData.slice(0, 10);
    if (data.length < 5) {
      // Data kurang → prediksi berdasarkan rata-rata sederhana
      const lastNumbers = data.map(d => d.number);
      const avg = lastNumbers.reduce((a, b) => a + b, 0) / lastNumbers.length;
      const pred = avg <= 4 ? "KECIL" : "BESAR";
      const num = pred === "KECIL" ? Math.floor(avg) : Math.ceil(avg);
      return { prediction: pred, number: Math.min(9, Math.max(0, num)) };
    }

    // 1. Hitung frekuensi angka
    const freq = Array(10).fill(0);
    data.forEach(d => freq[d.number]++);

    // 2. Hitung dominasi Kecil vs Besar
    let kecil = 0,
      besar = 0;
    data.forEach(d => {
      if (d.number <= 4) kecil++;
      else besar++;
    });

    // 3. Hot number & Cold number
    let maxFreq = -1,
      minFreq = Infinity;
    let hotNumbers = [],
      coldNumbers = [];
    freq.forEach((count, num) => {
      if (count > maxFreq) { maxFreq = count;
        hotNumbers = [num]; } else if (count === maxFreq) hotNumbers.push(num);
      if (count < minFreq) { minFreq = count;
        coldNumbers = [num]; } else if (count === minFreq) coldNumbers.push(num);
    });

    // 4. Tentukan prediksi dasar (Mode A)
    let basePrediction;
    if (kecil > besar) basePrediction = "KECIL";
    else if (besar > kecil) basePrediction = "BESAR";
    else {
      // Seri → ikuti hasil terakhir (rotasi)
      const lastResult = data[0].result;
      basePrediction = lastResult === "KECIL" ? "BESAR" : "KECIL";
    }

    // 5. Pilih angka dari hot number yang sesuai dengan range prediksi
    const range = basePrediction === "KECIL" ? [0, 1, 2, 3, 4] : [5, 6, 7, 8, 9];
    let candidates = hotNumbers.filter(n => range.includes(n));
    let predictedNumber;
    if (candidates.length > 0) {
      predictedNumber = candidates[0];
    } else {
      candidates = coldNumbers.filter(n => range.includes(n));
      if (candidates.length > 0) predictedNumber = candidates[0];
      else predictedNumber = basePrediction === "KECIL" ? 2 : 7;
    }

    // Koreksi jika angka tidak sesuai range
    if (basePrediction === "KECIL" && predictedNumber > 4) predictedNumber = 2;
    if (basePrediction === "BESAR" && predictedNumber < 5) predictedNumber = 7;

    console.log(`📊 Mode A: Kecil=${kecil}, Besar=${besar}, hot=[${hotNumbers.join(',')}], cold=[${coldNumbers.join(',')}]`);
    console.log(`🔮 Prediksi dasar: ${basePrediction} (angka ${predictedNumber})`);

    return { prediction: basePrediction, number: predictedNumber };
  }

  // ===================== PREDIKSI DENGAN REVERSE =====================
  function getReversePrediction(normalPred) {
    // Balik kategori
    const reversedPred = normalPred.prediction === "KECIL" ? "BESAR" : "KECIL";
    // Pilih angka di range yang baru (gunakan angka tengah atau cold number)
    const newRange = reversedPred === "KECIL" ? [0, 1, 2, 3, 4] : [5, 6, 7, 8, 9];
    // Ambil angka yang jarang muncul di range tersebut dari historicalData
    const data = historicalData.slice(0, 10);
    const freq = Array(10).fill(0);
    data.forEach(d => freq[d.number]++);
    let minFreq = Infinity,
      coldInRange = [];
    freq.forEach((count, num) => {
      if (newRange.includes(num) && count < minFreq) {
        minFreq = count;
        coldInRange = [num];
      } else if (newRange.includes(num) && count === minFreq) {
        coldInRange.push(num);
      }
    });
    let revNumber = coldInRange.length > 0 ? coldInRange[0] : (reversedPred === "KECIL" ? 2 : 7);
    // Koreksi
    if (reversedPred === "KECIL" && revNumber > 4) revNumber = 2;
    if (reversedPred === "BESAR" && revNumber < 5) revNumber = 7;

    console.log(`🔄 Reverse aktif: ${normalPred.prediction} → ${reversedPred} (angka ${revNumber})`);
    return { prediction: reversedPred, number: revNumber };
  }

  // ===================== FUNGSI UTAMA UNTUK MENDAPATKAN PREDIKSI =====================
  function getPrediction() {
    // Dapatkan prediksi normal (Mode A)
    const normal = getManualPrediction();
    // Jika useReverse = true dan reverse belum dipakai untuk taruhan ini, maka balik
    if (useReverse && !reverseTriggered) {
      return getReversePrediction(normal);
    } else {
      return normal;
    }
  }

  // ===================== PLACE BET =====================
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
      virtualBalance = 247000;
      currentBetIndex = 0;
      currentBetAmount = betSequence[0];
      totalBets = totalWins = totalLosses = currentStreak = profitLoss = 0;
      predictedIssue = predictedAt = null;
      historicalData = [];
      useReverse = false;
      reverseTriggered = false;
      sendTelegram("🚫 <b>SALDO HABIS - RESET OTOMATIS</b>");
      console.log("🔄 Saldo direset ke 247.000");
      return false;
    }

    // Kurangi saldo
    virtualBalance -= currentBetAmount;
    totalBets++;
    dailyStats.bets++;
    dailyStats.profit -= currentBetAmount;
    isBetPlaced = true;

    // Dapatkan prediksi (dengan mempertimbangkan reverse)
    const pred = getPrediction();
    currentPrediction = pred.prediction;
    currentNumberPrediction = pred.number;

    // Jika reverse aktif, tandai bahwa reverse sudah digunakan untuk taruhan ini
    if (useReverse) {
      reverseTriggered = true;
    }

    predictedAt = new Date();
    predictedIssue = nextIssueNumber;

    // Kirim prediksi ke Firebase
    sendPredictionToFirebase();

    console.log(`🎯 [TARUHAN] Prediksi: ${currentPrediction} (angka ${currentNumberPrediction}) | Taruhan: Rp ${currentBetAmount.toLocaleString()} | Reverse: ${useReverse}`);
    return true;
  }

  // ===================== PROSES HASIL =====================
  function processResult(result, apiData) {
    if (!isBetPlaced || !isBotActive) return false;
    const isWin = (currentPrediction === result);

    if (isWin) {
      // MENANG
      const consecutiveLossesBeforeWin = currentStreak < 0 ? Math.abs(currentStreak) : 0;
      virtualBalance += currentBetAmount * 2;
      totalWins++;
      currentStreak = currentStreak > 0 ? currentStreak + 1 : 1;
      dailyStats.wins++;
      dailyStats.profit += currentBetAmount * 2;
      console.log(`✅ MENANG! Prediksi: ${currentPrediction} untuk issue ${apiData.issueNumber}`);
      sendResultToFirebase(apiData, currentPrediction, true, currentNumberPrediction, 30);

      // ========== CEK APAKAH INI KEMENANGAN DI LEVEL 7 SETELAH 6 KALAH? ==========
      // Kondisi: sebelumnya streak = -6 (berarti 6 kalah) dan sekarang menang di level 7 (index 6)
      // Dan kita belum pernah mengaktifkan reverse dari kejadian ini (pakai flag)
      if (currentBetIndex === 6 && consecutiveLossesBeforeWin === 6 && !useReverse) {
        // Ini adalah kemenangan di level 7 setelah 6x kalah berturut-turut!
        console.log("🎯 KEMENANGAN DI LEVEL 7 SETELAH 6 KALAH! Aktifkan reverse untuk level 1 berikutnya.");
        // Set reverse = true, dan reverseTriggered = false agar dipakai di taruhan berikutnya
        useReverse = true;
        reverseTriggered = false;
        sendTelegram("🔄 <b>REVERSE AKTIF</b>\nKemenangan di level 7 setelah 6 kalah.\nTaruhan berikutnya (Level 1) akan menggunakan prediksi terbalik.");
      }

      // Reset level (aturan Martingale)
      currentBetIndex = 0;
      currentBetAmount = betSequence[0];
      console.log(` ✅ Reset ke Level 1`);

      // Kirim notifikasi jika menang setelah banyak kalah
      if (consecutiveLossesBeforeWin >= 5) {
        setTimeout(() => sendTelegram(`🎉 Menang setelah ${consecutiveLossesBeforeWin} kekalahan.`), 1000);
      }

      // Setelah menang, jika reverse sudah digunakan untuk satu kali taruhan, kita nonaktifkan reverse
      // (karena reverse hanya untuk 1 taruhan di level 1)
      if (useReverse && reverseTriggered) {
        useReverse = false;
        reverseTriggered = false;
        console.log("✅ Reverse dinonaktifkan (sudah digunakan 1 kali taruhan). Kembali ke Mode A.");
        sendTelegram("↩️ <b>Reverse DINONAKTIFKAN</b>\nKembali ke Mode A (analisis normal).");
      }

    } else {
      // KALAH
      totalLosses++;
      currentStreak = currentStreak < 0 ? currentStreak - 1 : -1;
      dailyStats.losses++;
      console.log(`❌ KALAH! Prediksi: ${currentPrediction} untuk issue ${apiData.issueNumber}`);
      sendResultToFirebase(apiData, currentPrediction, false, currentNumberPrediction, 30);

      // Naikkan level Martingale
      if (currentBetIndex < betSequence.length - 1) {
        currentBetIndex++;
        currentBetAmount = betSequence[currentBetIndex];
        console.log(` 🔺 Level naik ke ${currentBetIndex + 1} (Rp ${currentBetAmount.toLocaleString()})`);
      } else {
        console.log(` ⚠️ Sudah level maksimal (level 7)`);
      }

      // Kirim motivasi jika streak kalah panjang
      const lossStreak = Math.abs(currentStreak);
      if (lossStreak === 3 || lossStreak === 5 || lossStreak === 7) {
        setTimeout(() => sendTelegram(`💪 ${lossStreak} kekalahan berturut-turut.`), 500);
      }
    }

    // Update profit/loss
    profitLoss = virtualBalance - 247000;
    isBetPlaced = false;
    predictedIssue = null;
    predictedAt = null;

    // Reset reverseTriggered jika tidak aktif (untuk jaga-jaga)
    if (!useReverse) reverseTriggered = false;

    return isWin;
  }

  // ===================== ANALISIS DATA HISTORIS =====================
  function analyzeTrendData(listData) {
    if (!listData || listData.length < 5) return;
    const results = listData.map((item) => ({
      issue: item.issueNumber,
      number: parseInt(item.number),
      result: parseInt(item.number) <= 4 ? "KECIL" : "BESAR",
      colour: item.colour,
    }));
    historicalData = [...results, ...historicalData].slice(0, 20);
  }

  // ===================== PROCESS DATA API =====================
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
            const reverseLabel = useReverse ? " [REVERSE]" : "";
            const message = `<b>WINGO 30s PREDIKSI v13${reverseLabel}</b>\n<b>🆔 PERIODE ${shortIssue}</b>\n<b>🎯 PREDIKSI: ${currentPrediction} ${betLabels[currentBetIndex]}</b>\n<b>🔢 ANGKA: ${currentNumberPrediction}</b>\n─────────────────\n<b>📊 LEVEL: ${currentBetIndex + 1}/${betSequence.length}</b>\n<b>💳 SALDO: Rp ${virtualBalance.toLocaleString()}</b>\n<b>📈 P/L: ${profitLoss >= 0 ? "🟢" : "🔴"} ${profitLoss >= 0 ? "+" : ""}${profitLoss.toLocaleString()}</b>`;
            setTimeout(() => sendTelegram(message), 1500);
          }
          lastProcessedIssue = issueNumber;
          isProcessing = false;
        }, 2000);
      } else {
        console.log(`📝 Mencatat hasil permainan lain (interval ${currentGameData?.intervalM} menit)`);
        const apiData = { issueNumber: item.issueNumber, number: item.number, colour: item.colour, premium: item.premium };
        sendResultToFirebase(apiData, null, false, null, currentGameData?.typeId || 0);
        lastProcessedIssue = issueNumber;
        isProcessing = false;
      }
    } catch (error) { console.error("Error:", error);
      isProcessing = false; }
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
        console.log(`📅 Game Issue: ${gameData.issueNumber} | interval: ${gameData.intervalM} menit`);
        sendToFirebase("game_issues", gameData);
        startCountdown(gameData.endTime, gameData.issueNumber);
      }
    } catch (error) { console.error("Error processing game issue:", error); }
  }

  // ===================== COUNTDOWN =====================
  let lastCountdownSent = 0;

  function startCountdown(endTimeStr, issueNumber) {
    if (countdownInterval) clearInterval(countdownInterval);
    const endTime = new Date(endTimeStr.replace(" ", "T")).getTime();
    function update() {
      const now = Date.now();
      const remainingMs = endTime - now;
      if (remainingMs <= 0) {
        if (countdownInterval) clearInterval(countdownInterval);
        countdownInterval = null;
        return;
      }
      const remainingSeconds = Math.floor(remainingMs / 1000);
      if (Date.now() - lastCountdownSent > 1000) {
        lastCountdownSent = Date.now();
        fetch(`${FIREBASE_URL}countdown/live.json`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ issueNumber, endTime: endTimeStr, remainingSeconds }),
        }).catch(() => {});
      }
    }
    update();
    countdownInterval = setInterval(update, 1000);
  }

  // ===================== HOOK API =====================
  const originalFetch = window.fetch;
  window.fetch = function (...args) {
    return originalFetch.apply(this, arguments).then((response) => {
      const responseClone = response.clone();
      const url = args[0] || "";
      if (typeof url === "string") {
        if (url.includes("GetGameIssue")) {
          responseClone.text().then(text => { try { const data = JSON.parse(text);
              processGameIssueData(data); } catch (e) {} }).catch(() => {});
        } else if (url.includes("GetNoaverageEmerdList")) {
          responseClone.text().then(text => { try { const data = JSON.parse(text);
              processData(data); } catch (e) {} }).catch(() => {});
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
        if (url.includes("GetNoaverageEmerdList")) { try { const data = JSON.parse(this.responseText);
            processData(data); } catch (e) {} } else if (url.includes("GetGameIssue")) { try { const data = JSON.parse(this.responseText);
            processGameIssueData(data); } catch (e) {} }
      }
    });
    return originalOpen.apply(this, args);
  };

  // ===================== MANUAL CHECK =====================
  function manualCheck() {
    fetch("https://api.55fiveapi.com/api/webapi/GetNoaverageEmerdList", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ typeId: 30, pageNo: 1, pageSize: 10 }),
    }).then(res => res.json()).then(processData).catch(console.error);
  }

  // ===================== KONTROL BOT =====================
  function addBalance(amount) {
    virtualBalance += amount;
    console.log(`💰 +${amount.toLocaleString()} | Saldo: ${virtualBalance.toLocaleString()}`);
    sendToFirebase("balance_changes", { amount, newBalance: virtualBalance, type: "manual_add" });
  }

  function resetBot() {
    const oldBalance = virtualBalance;
    virtualBalance = 247000;
    currentBetIndex = 0;
    currentBetAmount = betSequence[0];
    totalBets = totalWins = totalLosses = currentStreak = profitLoss = 0;
    isBetPlaced = false;
    nextIssueNumber = null;
    historicalData = [];
    predictedIssue = predictedAt = null;
    useReverse = false;
    reverseTriggered = false;
    skipNextBet = false;
    skipReason = "";
    dailyStats = { date: new Date().toDateString(), bets: 0, wins: 0, losses: 0, profit: 0 };
    isBotActive = true;
    sendResetToFirebase(oldBalance, "manual_reset");
    sendTelegram("🔄 <b>BOT DIRESET v13</b>\n💰 Saldo: 247.000");
  }

  // ===================== STARTUP =====================
  (function start() {
    console.log(`
   🤖 WINGO BOT v13 - FULL (Mode A + Reverse)
   💰 Saldo awal: 247.000 (khusus 30 detik)
   📊 Analisis manual dengan hot/cold number
   🔄 Reverse aktif setelah 6 kalah + menang di level 7
   📡 Firebase + Telegram aktif
   ✅ Bot siap!`);
    setInterval(manualCheck, 30000);
    setTimeout(manualCheck, 3000);
    setTimeout(async () => {
      if (await placeBet()) {
        const msg = `<b>WINGO 30s PREDIKSI v13</b>\n<b>🆔 PERIODE ???</b>\n<b>🎯 PREDIKSI: ${currentPrediction} 1K</b>\n<b>🔢 ANGKA: ${currentNumberPrediction}</b>`;
        sendTelegram(msg);
      }
    }, 2000);

    setInterval(cleanupAllCollections, 300000);
    setTimeout(cleanupAllCollections, 10000);
  })();

  // ===================== EKSPOSE KE WINDOW =====================
  window.wingoBot = {
    check: manualCheck,
    reset: resetBot,
    add: addBalance,
    activate: () => { isBotActive = true;
      sendTelegram("✅ BOT DIAKTIFKAN"); },
    deactivate: () => { isBotActive = false;
      sendTelegram("⏸️ BOT DINONAKTIFKAN"); },
    stats: () => {
      const winRate = totalBets > 0 ? Math.round((totalWins / totalBets) * 100) : 0;
      console.log(`💰 Saldo: ${virtualBalance.toLocaleString()}
  📈 P/L: ${profitLoss}
  🎯 Bet: ${totalBets} (W:${totalWins}/L:${totalLosses})
  📊 Win Rate: ${winRate}%
  🔥 Streak: ${currentStreak}
  📊 Level: ${currentBetIndex + 1} (Rp ${currentBetAmount.toLocaleString()})
  🔄 Reverse: ${useReverse ? "AKTIF" : "MATI"}`);
    },
    cleanup: cleanupAllCollections,
  };

  window.wingoBetData = {
    get prediction() { return currentPrediction; },
    get numberPrediction() { return currentNumberPrediction; },
    get amount() { return currentBetAmount; },
    get balance() { return virtualBalance; },
    get reverse() { return useReverse; },
  };

  console.log("✅ Bot ready! Gunakan window.wingoBot untuk kontrol.");
})();
