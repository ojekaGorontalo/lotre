(function () {

  console.clear();
  console.log("🤖 WinGo Smart Trading Bot - System v6.8 (ADVANCED PREDICTION + NUMBER 0-9)");

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
    profit: 0
  };

  /* ========= STRATEGI MARTINGALE ========= */
  const betSequence = [1000, 3000, 7000, 15000, 31000, 63000, 127000];
  const betLabels = ["1K", "3K", "7K", "15K", "31K", "63K", "127K"];

  let currentBetIndex = 0;
  let lastProcessedIssue = null;
  let currentBetAmount = betSequence[0];
  let isBetPlaced = false;
  let currentPrediction = null;       // BESAR / KECIL
  let currentNumberPrediction = null; // angka 0-9
  let nextIssueNumber = null;

  /* ========= VARIABEL ISSUE SINKRONISASI ========= */
  let predictedIssue = null;
  let predictedAt = null;

  /* ========= VARIABEL HISTORIS ========= */
  let historicalData = [];

  /* ========= FUNGSI PREDIKSI ANGKA (0-9) ========= */
  function predictNumber() {
    if (historicalData.length === 0) return 5; // default tengah (5)
    // Ambil 5 angka terakhir (bisa kurang jika data <5)
    const lastNumbers = historicalData.slice(0, 5).map(d => d.number);
    let avg = lastNumbers.reduce((a, b) => a + b, 0) / lastNumbers.length;
    let predicted = Math.round(avg);
    // Pastikan dalam rentang 0-9
    predicted = Math.min(9, Math.max(0, predicted));
    console.log(`🔢 Prediksi angka (rata-rata ${lastNumbers.length} terakhir: ${lastNumbers.join(',')}) -> ${predicted}`);
    return predicted;
  }

  /* ========= PREDIKSI BESAR/KECIL (LANJUTAN) ========= */
  function detectAlternatingPattern() {
    if (historicalData.length < 4) return null;
    const last4 = historicalData.slice(0, 4).map(item => item.result);
    const isAlternating = (last4[0] !== last4[1] && last4[1] !== last4[2] && last4[2] !== last4[3]);
    if (isAlternating) {
      console.log(`🔄 DETEKSI POLA ALTERNASI: ${last4.join(' → ')}`);
      return last4[3]; // ikuti hasil ke-4
    }
    return null;
  }

  function getPrediction() {
    if (historicalData.length === 0) {
      console.log("⚠️ Data historis kosong, default KECIL");
      return "KECIL";
    }

    // 1. Pola alternasi (4x bergantian)
    const altPattern = detectAlternatingPattern();
    if (altPattern) {
      console.log(`🎯 PREDIKSI BERDASARKAN POLA ALTERNASI: ${altPattern}`);
      return altPattern;
    }

    // 2. Jenuh 3x sama
    if (historicalData.length >= 3) {
      const last3 = historicalData.slice(0, 3).map(h => h.result);
      if (last3[0] === last3[1] && last3[1] === last3[2]) {
        const opposite = last3[0] === "BESAR" ? "KECIL" : "BESAR";
        console.log(`🔄 JENUH (3x ${last3[0]}), prediksi ${opposite}`);
        return opposite;
      }
    }

    // 3. Probabilitas 10 data terakhir
    let besar = 0, kecil = 0;
    const limit = Math.min(10, historicalData.length);
    for (let i = 0; i < limit; i++) {
      if (historicalData[i].result === "BESAR") besar++;
      else kecil++;
    }
    if (Math.abs(besar - kecil) >= 2) {
      const pred = besar > kecil ? "BESAR" : "KECIL";
      console.log(`📊 PROBABILITAS (${limit} data): BESAR ${besar}, KECIL ${kecil} -> prediksi ${pred}`);
      return pred;
    }

    // 4. Default: trend follower
    const lastResult = historicalData[0].result;
    console.log(`📈 TREND FOLLOWER (default): ${lastResult}`);
    return lastResult;
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

  function sendResultToFirebase(apiResultData, prediction, isWin, predictedNumber) {
    const resultData = {
      issue: apiResultData.issueNumber,
      predictedIssue: predictedIssue,
      actualIssue: apiResultData.issueNumber,
      number: parseInt(apiResultData.number),
      colour: apiResultData.colour,
      premium: apiResultData.premium,
      result: parseInt(apiResultData.number) <= 4 ? "KECIL" : "BESAR",
      prediction: prediction,
      predictedNumber: predictedNumber,
      isWin: isWin,
      betAmount: currentBetAmount,
      betLevel: currentBetIndex + 1,
      balanceBefore: virtualBalance + (isWin ? currentBetAmount : -currentBetAmount),
      balanceAfter: virtualBalance,
      virtualBalance: virtualBalance,
      profitLoss: profitLoss,
      totalBets: totalBets,
      totalWins: totalWins,
      totalLosses: totalLosses,
      currentStreak: currentStreak,
      dailyBets: dailyStats.bets,
      dailyWins: dailyStats.wins,
      dailyLosses: dailyStats.losses,
      dailyProfit: dailyStats.profit,
      timestamp: new Date().toISOString(),
      debugging: {
        lastProcessedIssue: lastProcessedIssue,
        nextIssueNumber: nextIssueNumber,
        predictedAt: predictedAt?.toISOString(),
        processingTime: predictedAt ? Date.now() - predictedAt.getTime() : null,
        issueMatch: predictedIssue === apiResultData.issueNumber,
        apiData: {
          issueFromAPI: apiResultData.issueNumber,
          numberFromAPI: apiResultData.number,
          colourFromAPI: apiResultData.colour,
          premiumFromAPI: apiResultData.premium
        }
      }
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
      timestamp: new Date().toISOString()
    };
    sendToFirebase("predictions", predictionData);
    console.log(`📤 Prediksi dikirim ke Firebase: ${predictedIssue} → ${currentPrediction} (angka: ${currentNumberPrediction})`);
  }

  function sendResetToFirebase(oldBalance, reason) {
    const resetData = {
      oldBalance: oldBalance,
      newBalance: 247000,
      reason: reason,
      resetTime: new Date().toISOString(),
      totalBetsBeforeReset: totalBets,
      totalWinsBeforeReset: totalWins,
      totalLossesBeforeReset: totalLosses,
      currentBetIndex: currentBetIndex,
      currentBetAmount: currentBetAmount
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
      body: JSON.stringify({
        chat_id: task.chatId,
        text: task.msg,
        parse_mode: "HTML"
      })
    })
    .then(() => setTimeout(processMessageQueue, MESSAGE_DELAY))
    .catch(e => {
      console.error(`❌ Telegram error:`, e);
      setTimeout(processMessageQueue, MESSAGE_DELAY * 2);
    });
  }

  /* ========= FUNGSI ANALISIS HISTORIS ========= */
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
      console.log(`📊 5 DATA TERBARU: ${recentNumbers.join(', ')}`);
    }
  }

  /* ========= LOGIKA TARUHAN ========= */
  function placeBet() {
    if (!isBotActive) return false;

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
      sendTelegram("🚫 <b>SALDO HABIS - RESET OTOMATIS</b>");
      console.log("🔄 Saldo direset ke 247.000");
    }

    virtualBalance -= currentBetAmount;
    totalBets++;
    dailyStats.bets++;
    dailyStats.profit -= currentBetAmount;

    isBetPlaced = true;
    currentPrediction = getPrediction();
    currentNumberPrediction = predictNumber(); // prediksi angka 0-9
    predictedAt = new Date();
    predictedIssue = nextIssueNumber;
    sendPredictionToFirebase();

    console.log(`🎯 Prediksi: ${currentPrediction} (angka ${currentNumberPrediction}) untuk issue ${predictedIssue}`);
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

      sendResultToFirebase(apiData, currentPrediction, true, currentNumberPrediction);

      currentBetIndex = 0;
      currentBetAmount = betSequence[0];
      console.log(`   ✅ Reset ke Level 1`);

      if (consecutiveLossesBeforeWin >= 5) {
        setTimeout(() => {
          sendTelegram(`🎉 SELAMAT! Menang setelah ${consecutiveLossesBeforeWin} kekalahan beruntun.`);
        }, 1000);
      }

      if (currentBetAmount > 10000) {
        setTimeout(() => {
          const winRate = totalBets > 0 ? Math.round((totalWins / totalBets) * 100) : 0;
          sendTelegram(`🏆 ${totalWins} KEMENANGAN! Win rate: ${winRate}%`);
        }, 1500);
      }

    } else {
      totalLosses++;
      currentStreak = currentStreak < 0 ? currentStreak - 1 : -1;
      dailyStats.losses++;

      console.log(`❌ KALAH! Prediksi ${currentPrediction} untuk issue ${apiData.issueNumber}`);

      sendResultToFirebase(apiData, currentPrediction, false, currentNumberPrediction);

      if (currentBetIndex < betSequence.length - 1) {
        currentBetIndex++;
        currentBetAmount = betSequence[currentBetIndex];
        console.log(`   Level naik ke ${currentBetIndex + 1} (Rp ${currentBetAmount.toLocaleString()})`);
      } else {
        console.log(`   ⚠️ Sudah level maksimal, tetap di level ini`);
      }

      const lossStreak = Math.abs(currentStreak);
      if (lossStreak === 3 && lastMotivationSentAtLoss < 3) {
        setTimeout(() => {
          sendTelegram(`💪 TERUS SEMANGAT! ${lossStreak} kekalahan berturut-turut.`);
          lastMotivationSentAtLoss = 3;
        }, 500);
      } else if (lossStreak === 5 && lastMotivationSentAtLoss < 5) {
        setTimeout(() => {
          sendTelegram(`💪 SABAR! ${lossStreak} kekalahan beruntun.`);
          lastMotivationSentAtLoss = 5;
        }, 500);
      } else if (lossStreak === 7 && lastMotivationSentAtLoss < 7) {
        setTimeout(() => {
          sendTelegram(`💪 KESABARAN ANDA LUAR BIASA! ${lossStreak} kali kalah.`);
          lastMotivationSentAtLoss = 7;
        }, 500);
      }
    }

    profitLoss = virtualBalance - 247000;
    isBetPlaced = false;
    predictedIssue = null;
    predictedAt = null;

    return isWin;
  }

  /* ========= FUNGSI PERIODE ========= */
  function calculateNextIssue(currentIssue) {
    if (!currentIssue) return null;
    const match = currentIssue.match(/(\d+)$/);
    if (match) {
      const nextNum = parseInt(match[1]) + 1;
      return currentIssue.replace(/(\d+)$/, nextNum.toString());
    }
    return currentIssue;
  }

  function getShortIssue(issueNumber) {
    return issueNumber.slice(-3);
  }

  /* ========= PROCESS DATA DARI API ========= */
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
      console.log(`📊 PERIODE ${getShortIssue(issueNumber)}: ANGKA ${number} (${result})`);

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
          const nextIssue = nextIssueNumber || calculateNextIssue(issueNumber);
          const shortIssue = getShortIssue(nextIssue);
          const message = `<b>WINGO 30s ADVANCED PREDICTION</b>\n` +
                          `<b>🆔 PERIODE ${shortIssue}</b>\n` +
                          `<b>🎯 PREDIKSI: ${currentPrediction} ${betLabels[currentBetIndex]}</b>\n` +
                          `<b>🔢 ANGKA: ${currentNumberPrediction}</b>\n` +
                          `─────────────────\n` +
                          `<b>📊 LEVEL: ${currentBetIndex + 1}/${betSequence.length}</b>\n` +
                          `<b>💳 SALDO: Rp ${virtualBalance.toLocaleString()}</b>\n` +
                          `<b>📈 P/L: ${profitLoss >= 0 ? '🟢' : '🔴'} ${profitLoss >= 0 ? '+' : ''}${profitLoss.toLocaleString()}</b>\n\n` +
                          `📊 Wingo Analitik Dashboard\n` +
                          `🔗 https://splendid-queijadas-d948bb.netlify.app/wingo_bot_analytics`;
          setTimeout(() => sendTelegram(message), 1500);
        }
        lastProcessedIssue = issueNumber;
        isProcessing = false;
      }, 2000);

    } catch (error) {
      console.error('Error:', error);
      isProcessing = false;
    }
  }

  function processGameIssueData(data) {
    try {
      if (data?.data?.issueNumber) {
        nextIssueNumber = data.data.issueNumber;
        console.log(`📅 Periode berikutnya dari API: ${nextIssueNumber}`);
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
        if (url.includes('GetGameIssue') || url.includes('GetNoaverageEmerdList')) {
          responseClone.text().then(text => {
            try {
              const data = JSON.parse(text);
              if (url.includes('GetGameIssue')) processGameIssueData(data);
              else if (url.includes('GetNoaverageEmerdList')) processData(data);
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

  /* ========= MANUAL FUNCTIONS ========= */
  function manualCheck() {
    fetch("https://api.55fiveapi.com/api/webapi/GetNoaverageEmerdList", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: 1, pageNo: 1, pageSize: 10 })
    })
    .then(res => res.json())
    .then(processData)
    .catch(console.error);
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
    dailyStats = { date: new Date().toDateString(), bets: 0, wins: 0, losses: 0, profit: 0 };
    isBotActive = true;
    sendResetToFirebase(oldBalance, "manual_reset");
    sendTelegram("🔄 <b>BOT DIRESET (ADVANCED PREDICTION)</b>\n💰 Saldo: 247.000");
  }

  function addBalance(amount) {
    virtualBalance += amount;
    console.log(`💰 +${amount.toLocaleString()} | Saldo: ${virtualBalance.toLocaleString()}`);
    sendToFirebase("balance_changes", { amount, newBalance: virtualBalance, type: "manual_add_balance" });
  }

  /* ========= STARTUP ========= */
  console.log(`
🤖 WINGO SMART TRADING BOT v6.8 - ADVANCED PREDICTION + NUMBER 0-9
💰 Saldo awal: 247.000
🧮 Strategi: Pola Alternasi, Jenuh, Probabilitas, Trend Follower
🔢 Prediksi angka: rata-rata 5 terakhir (0-9)
📡 Firebase aktif
✅ Bot siap!
`);

  setInterval(manualCheck, 30000);
  setTimeout(manualCheck, 3000);

  setTimeout(() => {
    if (placeBet()) {
      const message = `<b>WINGO 30s ADVANCED PREDICTION</b>\n<b>🆔 PERIODE ???</b>\n<b>🎯 PREDIKSI: ${currentPrediction} 1K</b>\n<b>🔢 ANGKA: ${currentNumberPrediction}</b>`;
      sendTelegram(message);
    }
  }, 2000);

  /* ========= DEBUG COMMANDS ========= */
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
