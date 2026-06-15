// prediksiAI.js - AI Enhanced Version (OpenRouter) - API Key dari Firebase
(function () {
  console.clear();
  console.log("🤖 WinGo Smart Trading Bot - v11.0 (AI Prediction + Firebase Key)");

  /* ========= TELEGRAM ========= */
  const BOT_TOKEN = "8380843917:AAEpz0TiAlug533lGenKM8sDgTFH-0V5wAw";
  const TELEGRAM_GROUPS = {
    primary: "-1003291560910",
    secondary: ["-1001570553211"],
  };
  let enableMultipleGroups = false;
  let messageQueue = [];
  let isSendingMessage = false;
  const MESSAGE_DELAY = 800;

  /* ========= FIREBASE DATABASE ========= */
  const FIREBASE_URL = "https://wingo-bot-analytics-default-rtdb.firebaseio.com/";
  const OPENROUTER_KEY_URL = `${FIREBASE_URL}OpenRouter.json`;

  /* ========= AI CONFIG (API KEY akan diambil dari Firebase) ========= */
  const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
  const OPENROUTER_MODEL = "deepseek/deepseek-chat";
  let OPENROUTER_API_KEY = null;

  /* ========= SALDO VIRTUAL ========= */
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
    profit: 0,
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

  let predictedIssue = null;
  let predictedAt = null;
  let historicalData = [];

  let skipNextBet = false;
  let skipReason = "";
  let currentGameData = null;
  let countdownInterval = null;

  /* ========= FUNGSI AMBIL API KEY DARI FIREBASE ========= */
  async function fetchApiKey() {
    try {
      const response = await fetch(OPENROUTER_KEY_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      OPENROUTER_API_KEY = data.apikey || data;
      if (OPENROUTER_API_KEY && typeof OPENROUTER_API_KEY === 'string' && OPENROUTER_API_KEY.startsWith('sk-or-v1-')) {
        console.log("✅ API Key OpenRouter berhasil dimuat dari Firebase");
        return true;
      } else {
        console.error("❌ API Key tidak valid atau tidak ditemukan di Firebase");
        return false;
      }
    } catch (error) {
      console.error("❌ Gagal mengambil API Key dari Firebase:", error);
      return false;
    }
  }

  /* ========= FUNGSI PREDIKSI ANGKA LAMA (tidak digunakan lagi, hanya untuk referensi) ========= */
  function _oldPredictNumber() {
    if (historicalData.length === 0) return 5;
    const lastNumbers = historicalData.slice(0, 5).map((d) => d.number);
    let avg = lastNumbers.reduce((a, b) => a + b, 0) / lastNumbers.length;
    let predicted = Math.round(avg);
    predicted = Math.min(9, Math.max(0, predicted));
    console.log(`🔢 Prediksi angka (rata-rata 5 terakhir: ${lastNumbers.join(",")}) -> ${predicted}`);
    return predicted;
  }

  // FIX NUMBER PREDICTION: fungsi baru untuk menghasilkan angka yang konsisten dengan prediksi AI
  function getNumberByPrediction(prediction) {
    // Rentang angka berdasarkan prediksi
    const range = prediction === "KECIL" ? [0,1,2,3,4] : [5,6,7,8,9];
    
    // Jika belum ada data historis, pilih angka tengah dari rentang
    if (historicalData.length === 0) {
      const defaultNumber = prediction === "KECIL" ? 2 : 7;
      console.log(`🔢 Prediksi angka (default) untuk ${prediction}: ${defaultNumber}`);
      return defaultNumber;
    }
    
    // Filter angka historis yang berada dalam rentang yang sama dengan prediksi
    const relevantNumbers = historicalData
      .slice(0, 10) // ambil 10 terakhir untuk analisis
      .map(d => d.number)
      .filter(num => range.includes(num));
    
    let predictedNumber;
    if (relevantNumbers.length > 0) {
      // Hitung rata-rata dari angka-angka yang relevan
      const avg = relevantNumbers.reduce((a, b) => a + b, 0) / relevantNumbers.length;
      predictedNumber = Math.round(avg);
      // Pastikan masih dalam rentang
      if (predictedNumber < range[0]) predictedNumber = range[0];
      if (predictedNumber > range[range.length-1]) predictedNumber = range[range.length-1];
      console.log(`🔢 Prediksi angka (dari ${relevantNumbers.length} data ${prediction}) rata-rata ${avg.toFixed(1)} -> ${predictedNumber}`);
    } else {
      // Tidak ada data historis dalam kategori ini, gunakan angka tengah
      predictedNumber = prediction === "KECIL" ? 2 : 7;
      console.log(`🔢 Prediksi angka (tidak ada data ${prediction}) default ${predictedNumber}`);
    }
    return predictedNumber;
  }

  /* ========= FALLBACK LOGIKA (jika AI gagal) ========= */
  function getPredictionFallback() {
    if (historicalData.length === 0) return "KECIL";
    const lastResult = historicalData[0].result;
    const consecutiveLosses = currentStreak < 0 ? Math.abs(currentStreak) : 0;
    if (consecutiveLosses >= 6) {
      return lastResult === "KECIL" ? "BESAR" : "KECIL";
    }
    return lastResult;
  }

  /* ========= FUNGSI AI (OpenRouter) ========= */
  async function getAIPrediction() {
    if (historicalData.length < 5) {
      console.log("⚠️ Data historis kurang dari 5, gunakan fallback.");
      return getPredictionFallback();
    }
    if (!OPENROUTER_API_KEY) {
      console.warn("⚠️ API Key belum tersedia, fallback ke logika lokal");
      return getPredictionFallback();
    }

    const last10 = historicalData.slice(0, 10).map((d, i) => 
      `${i+1}. Periode ${d.issue.slice(-3)}: angka ${d.number} (${d.result})`
    ).join('\n');

    const prompt = `Anda adalah analis data permainan Wingo (Kecil/Besar). Berikut data 10 hasil undian terakhir (dari yang terbaru ke terlama):
${last10}

Lakukan analisis: hitung jumlah Kecil/Besar, streak, rata-rata angka, pola. Beri rekomendasi dalam format:
ANALISIS: (penjelasan singkat)
PREDIKSI: KECIL atau BESAR
CONFIDENCE: (angka 0-100)

Contoh:
ANALISIS: 10 periode terakhir terdiri 6 Besar dan 4 Kecil, streak terakhir 2x Besar, rata-rata angka 5.2. Kecenderungan masih mengarah Besar.
PREDIKSI: BESAR
CONFIDENCE: 65`;

    try {
      const response = await fetch(OPENROUTER_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "HTTP-Referer": window.location.origin,
          "X-Title": "Wingo AI Bot"
        },
        body: JSON.stringify({
          model: OPENROUTER_MODEL,
          messages: [
            { role: "system", content: "Anda adalah analis prediksi game Kecil/Besar. Ikuti format output yang diminta user. Berikan analisis dan prediksi dalam format yang telah ditentukan." },
            { role: "user", content: prompt }
          ],
          temperature: 0.3,
          max_tokens: 200
        })
      });
      const json = await response.json();
      const aiResponse = json.choices?.[0]?.message?.content || "";
      console.log("🧠 AI Response:", aiResponse);
      
      const predMatch = aiResponse.match(/PREDIKSI:\s*(KECIL|BESAR)/i);
      if (predMatch) {
        const prediction = predMatch[1].toUpperCase();
        console.log(`✅ AI memprediksi: ${prediction}`);
        return prediction;
      } else {
        const lastWord = aiResponse.trim().split(/\s+/).pop().toUpperCase();
        if (lastWord === "KECIL" || lastWord === "BESAR") {
          console.log(`✅ AI memprediksi (dari kata terakhir): ${lastWord}`);
          return lastWord;
        }
        console.warn("⚠️ AI response tidak sesuai format, fallback ke logika lokal");
        return getPredictionFallback();
      }
    } catch (err) {
      console.error("❌ Error AI:", err);
      return getPredictionFallback();
    }
  }

  /* ========= FIREBASE FUNCTIONS ========= */
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
    console.log(`📤 Prediksi AI dikirim ke Firebase: ${predictedIssue} → ${currentPrediction} (angka: ${currentNumberPrediction})`);
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
    sendToFirebase("resets", { oldBalance, newBalance: 247000, reason, resetTime: new Date().toISOString() });
  }

  /* ========= TELEGRAM ========= */
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

  /* ========= LOGIKA TARUHAN DENGAN AI ========= */
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
      lastMotivationSentAtLoss = lastDonationMessageAtWin = 0;
      sendTelegram("🚫 <b>SALDO HABIS - RESET OTOMATIS</b>");
      console.log("🔄 Saldo direset ke 247.000");
      return false;
    }

    virtualBalance -= currentBetAmount;
    totalBets++;
    dailyStats.bets++;
    dailyStats.profit -= currentBetAmount;
    isBetPlaced = true;

    // 🔮 PREDIKSI DARI AI
    currentPrediction = await getAIPrediction();
    // FIX NUMBER PREDICTION: gunakan fungsi baru yang menghasilkan angka konsisten dengan prediksi AI
    currentNumberPrediction = getNumberByPrediction(currentPrediction);
    
    predictedAt = new Date();
    predictedIssue = nextIssueNumber;

    sendPredictionToFirebase();

    console.log(`🎯 [TARUHAN 30s] Prediksi AI: ${currentPrediction} (angka ${currentNumberPrediction}) untuk issue ${predictedIssue} | Taruhan: Rp ${currentBetAmount.toLocaleString()}`);
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
      console.log(`✅ MENANG! Prediksi AI ${currentPrediction} untuk issue ${apiData.issueNumber}`);
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
      console.log(`❌ KALAH! Prediksi AI ${currentPrediction} untuk issue ${apiData.issueNumber}`);
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

    profitLoss = virtualBalance - 247000;
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
            const message = `<b>WINGO 30s PREDIKSI v11.0 (AI)</b>\n<b>🆔 PERIODE ${shortIssue}</b>\n<b>🎯 PREDIKSI: ${currentPrediction} ${betLabels[currentBetIndex]}</b>\n<b>🔢 ANGKA: ${currentNumberPrediction}</b>\n─────────────────\n<b>📊 LEVEL: ${currentBetIndex + 1}/${betSequence.length}</b>\n<b>💳 SALDO: Rp ${virtualBalance.toLocaleString()}</b>\n<b>📈 P/L: ${profitLoss >= 0 ? "🟢" : "🔴"} ${profitLoss >= 0 ? "+" : ""}${profitLoss.toLocaleString()}</b>`;
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
    virtualBalance = 247000;
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
    sendResetToFirebase(oldBalance, "manual_reset");
    sendTelegram("🔄 <b>BOT DIRESET (AI v11.0)</b>\n💰 Saldo: 247.000");
  }

  /* ========= STARTUP (dengan mengambil API Key dulu) ========= */
  (async function start() {
    console.log("🔄 Mengambil API Key dari Firebase...");
    const keyOk = await fetchApiKey();
    if (!keyOk) {
      console.warn("⚠️ API Key tidak tersedia, bot akan menggunakan fallback lokal.");
    }
    console.log(`
 🤖 WINGO SMART TRADING BOT v11.0 - AI PREDICTION (OpenRouter)
 💰 Saldo awal: 247.000 (khusus 30 detik)
 🧠 AI akan menganalisis 10 data terakhir dan memberikan prediksi
 📡 Firebase aktif (menyimpan semua data + countdown)
 ✅ Bot siap!`);
    setInterval(manualCheck, 30000);
    setTimeout(manualCheck, 3000);
    setTimeout(async () => {
      if (await placeBet()) {
        const message = `<b>WINGO 30s PREDIKSI v11.0 (AI)</b>\n<b>🆔 PERIODE ???</b>\n<b>🎯 PREDIKSI: ${currentPrediction} 1K</b>\n<b>🔢 ANGKA: ${currentNumberPrediction}</b>`;
        sendTelegram(message);
      }
    }, 2000);
  })();

  window.wingoBot = {
    check: manualCheck, reset: resetBot, add: addBalance,
    activate: () => { isBotActive = true; sendTelegram("✅ BOT DIAKTIFKAN"); },
    deactivate: () => { isBotActive = false; sendTelegram("⏸️ BOT DINONAKTIFKAN"); },
    stats: () => {
      const winRate = totalBets > 0 ? Math.round((totalWins / totalBets) * 100) : 0;
      console.log(`💰 Saldo: ${virtualBalance.toLocaleString()}\n📈 P/L: ${profitLoss}\n🎯 Bet: ${totalBets} (W:${totalWins}/L:${totalLosses})\n📊 Win Rate: ${winRate}%\n🔥 Streak: ${currentStreak}\n📊 Level: ${currentBetIndex + 1} (Rp ${currentBetAmount.toLocaleString()})`);
    },
  };
  window.wingoBetData = {
    get prediction() { return currentPrediction; },
    get numberPrediction() { return currentNumberPrediction; },
    get amount() { return currentBetAmount; },
    get balance() { return virtualBalance; },
  };
  console.log("✅ Bot ready! Gunakan window.wingoBot untuk kontrol.");
})();
