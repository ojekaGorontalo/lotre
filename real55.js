(function () {

  console.clear();

  console.log("🤖 WinGo Smart Trading Bot - New System v6.2 (Zigzag Reverse)");



  /* ========= TELEGRAM ========= */

  const BOT_TOKEN = "8380843917:AAEpz0TiAlug533lGenKM8sDgTFH-0V5wAw";

  

  const TELEGRAM_GROUPS = {

    primary: "-1003291560910",

    secondary: [ "-1001570553211" ]

  };

  

  let enableMultipleGroups = false;

  let messageQueue = [];

  let isSendingMessage = false;

  const MESSAGE_DELAY = 800;



  /* ========= FIREBASE ========= */

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

  let losingStreak = 0;

  

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



  /* ========= MARTINGALE ========= */

  const betSequence = [1000, 3000, 7000, 15000, 31000, 63000, 127000];

  const betLabels = ["1K","3K","7K","15K","31K","63K","127K"];

  

  let currentBetIndex = 0;

  let lastProcessedIssue = null;

  let currentBetAmount = betSequence[0];

  let isBetPlaced = false;

  let currentPrediction = null;

  let nextIssueNumber = null;

  

  let predictedIssue = null;

  let predictedAt = null;

  let historicalData = [];



  /* ========= REVERSE MODE ZIGZAG ========= */

  let currentReverseMode = false;        // false = normal, true = reverse (dibalik)

  let consecutiveReverseTriggers = 0;    // tetap dihitung untuk statistik

  let reverseModeWins = 0;

  let reverseModeLosses = 0;



  /* ========= FIREBASE FUNCTIONS ========= */

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



  function sendResultToFirebase(apiResultData, prediction, isWin) {

    const resultData = {

      issue: apiResultData.issueNumber,

      predictedIssue, actualIssue: apiResultData.issueNumber,

      number: parseInt(apiResultData.number),

      colour: apiResultData.colour,

      premium: apiResultData.premium,

      result: parseInt(apiResultData.number) <= 4 ? "KECIL" : "BESAR",

      prediction, isWin,

      betAmount: currentBetAmount,

      betLevel: currentBetIndex + 1,

      balanceBefore: virtualBalance + (isWin ? currentBetAmount : -currentBetAmount),

      balanceAfter: virtualBalance,

      virtualBalance, profitLoss,

      totalBets, totalWins, totalLosses,

      currentStreak, losingStreak,

      dailyBets: dailyStats.bets,

      dailyWins: dailyStats.wins,

      dailyLosses: dailyStats.losses,

      dailyProfit: dailyStats.profit,

      timestamp: new Date().toISOString(),

      reverseMode: currentReverseMode,

      reverseTriggers: consecutiveReverseTriggers,

      reverseModeWins, reverseModeLosses,

      debugging: {

        lastProcessedIssue, nextIssueNumber,

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

    console.log(`📤 Mengirim ke Firebase: Issue ${apiResultData.issueNumber}, Angka ${apiResultData.number}`);

    sendToFirebase("results", resultData);

  }



  function sendResetToFirebase(oldBalance, reason) {

    const resetData = {

      oldBalance, newBalance: 247000, reason,

      resetTime: new Date().toISOString(),

      totalBetsBeforeReset: totalBets,

      totalWinsBeforeReset: totalWins,

      totalLossesBeforeReset: totalLosses,

      currentBetIndex, currentBetAmount

    };

    sendToFirebase("resets", resetData);

    console.log(`📊 Data reset dikirim ke Firebase: ${reason}`);

  }



  /* ========= TELEGRAM ========= */

  function sendTelegram(msg) {

    sendToGroup(msg, TELEGRAM_GROUPS.primary);

    if (enableMultipleGroups && TELEGRAM_GROUPS.secondary.length > 0) {

      TELEGRAM_GROUPS.secondary.forEach(chatId => sendToGroup(msg, chatId));

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

      body: JSON.stringify({ chat_id: task.chatId, text: task.msg, parse_mode: "HTML" })

    })

    .then(() => {

      console.log(`✅ Pesan terkirim ke grup ${task.chatId}`);

      setTimeout(processMessageQueue, MESSAGE_DELAY);

    })

    .catch(e => {

      console.error(`❌ Telegram error untuk grup ${task.chatId}:`, e);

      setTimeout(processMessageQueue, MESSAGE_DELAY * 2);

    });

  }



  /* ========= PESAN STARTUP ========= */

  function sendStartupMotivationMessage() {

    const startupMessage = `🤖 <b>WINGO SMART TRADING BOT v6.2 - ZIGZAG REVERSE</b>\n\n` +

      `🧮 <b>RUMUS ANALISIS:</b>\n` +

      `1. Ambil angka pertama dari data terbaru\n` +

      `2. Ambil digit terakhir dari issue ke-5\n` +

      `3. Jumlahkan → digit terakhir 0-4 = KECIL, 5-9 = BESAR\n\n` +

      `🔄 <b>SISTEM REVERSE ZIGZAG:</b>\n` +

      `• Prediksi pertama: mode NORMAL\n` +

      `• Prediksi kedua: mode REVERSE (dibalik)\n` +

      `• Prediksi ketiga: mode NORMAL lagi, dan seterusnya bergantian\n` +

      `• Tidak dipengaruhi menang/kalah\n\n` +

      `💰 <b>MARTINGALE 7 LEVEL:</b>\n` +

      `1. Rp 1.000\n2. Rp 3.000\n3. Rp 7.000\n4. Rp 15.000\n5. Rp 31.000\n6. Rp 63.000\n7. Rp 127.000\n\n` +

      `📊 Saldo awal: 247.000 (cukup semua level)\n` +

      `🔄 Auto-reset saat saldo habis\n\n` +

      `⚠️ <b>HATI-HATI:</b> Trading punya risiko tinggi!`;

    sendTelegram(startupMessage);

  }



  /* ========= ANALISIS PREDIKSI ========= */

  function calculateNewPrediction() {

    if (historicalData.length < 5) {

      console.log("⚠️ Data kurang dari 5, pakai default");

      return "KECIL";

    }

    try {

      const firstNumber = parseInt(historicalData[0].number);

      const fifthIssue = historicalData[4].issue;

      const lastDigit = parseInt(fifthIssue.slice(-1));

      const sum = firstNumber + lastDigit;

      const lastDigitSum = sum % 10;

      let basePrediction = (lastDigitSum <= 4) ? "KECIL" : "BESAR";

      

      if (currentReverseMode) {

        return basePrediction === "KECIL" ? "BESAR" : "KECIL";

      }

      return basePrediction;

    } catch (error) {

      console.error("❌ Error dalam perhitungan:", error);

      return "KECIL";

    }

  }



  function getPrediction() {

    const prediction = calculateNewPrediction();

    console.log(`🎯 FINAL PREDIKSI: ${prediction} (Reverse: ${currentReverseMode})`);

    return prediction;

  }



  function analyzeTrendData(listData) {

    if (!listData || listData.length < 5) return;

    const results = listData.map(item => ({

      issue: item.issueNumber,

      number: parseInt(item.number),

      result: parseInt(item.number) <= 4 ? "KECIL" : "BESAR",

      colour: item.colour

    }));

    historicalData = [...results, ...historicalData].slice(0, 20);

  }



  /* ========= UPDATE REVERSE (HANYA UNTUK STATISTIK) ========= */

  function updateReverseStats(isWin) {

    // Fungsi ini hanya mencatat statistik, tidak mengubah mode

    if (currentReverseMode) {

      if (isWin) reverseModeWins++;

      else reverseModeLosses++;

    }

    // Mode tidak berubah karena zigzag dikendalikan di placeBet

  }



  /* ========= FUNGSI PESAN LAINNYA ========= */

  function createMotivationMessage(lossCount) {

    switch(lossCount) {

      case 3: return `💪 <b>TERUS SEMANGAT!</b>\n\n📉 Kalah ${losingStreak}x, tetap tenang!`;

      case 5: return `🔥 <b>PERTAHANKAN!</b>\n\n📊 ${losingStreak} kekalahan, sabar ya.`;

      case 7: return `🚀 <b>HAMPIR SAMPAI!</b>\n\n📉 ${losingStreak} kekalahan, peluang reversal tinggi.`;

      default: return "";

    }

  }



  function createWinAfterLossMessage(consecutiveLosses) {

    return `🎉 <b>SELAMAT! KEBERHASILAN SETELAH ${consecutiveLosses} KALAH</b>\n\n` +

           `💰 Saldo sekarang: Rp ${virtualBalance.toLocaleString()}\n` +

           `🔄 Kembali ke Level 1\n\n` +

           `🔥 Teruskan!`;

  }



  function createDonationMessage() {

    const winRate = totalBets > 0 ? Math.round((totalWins/totalBets)*100) : 0;

    return `🏆 <b>CAPAIAN ${totalWins} KEMENANGAN!</b>\n\n` +

           `✅ Win Rate: ${winRate}%\n` +

           `🔄 Reverse Triggers: ${consecutiveReverseTriggers}x\n` +

           `❤️ DANA: 082311640444`;

  }



  function createOutOfBalanceMessage() {

    const winRate = totalBets > 0 ? Math.round((totalWins/totalBets)*100) : 0;

    return `🚫 <b>SALDO HABIS - RESET OTOMATIS</b>\n\n` +

           `🔄 Saldo direset ke Rp 247.000\n\n` +

           `📊 Statistik sebelum reset: ${totalBets} bet, ${totalWins}W/${totalLosses}L (${winRate}%)`;

  }



  function createPredictionMessage(nextIssueShort) {

    const betLabel = betLabels[currentBetIndex];

    let message = `<b>WINGO 30s SALDO AWAL 247.000</b>\n`;

    message += `<b>🆔 PERIODE ${nextIssueShort}</b>\n`;

    message += `<b>🎯 PREDIKSI B/K: ${currentPrediction} ${betLabel}</b>\n`.repeat(3);

    message += `━━━━━━━━━━━━━━━━━\n`;

    message += `<b>📊 LEVEL: ${currentBetIndex + 1}/${betSequence.length}</b>\n`;

    message += `<b>🔄 REVERSE: ${currentReverseMode ? 'AKTIF' : 'NONAKTIF'}</b>\n`;

    message += `<b>💳 SALDO: Rp ${virtualBalance.toLocaleString()}</b>\n`;

    message += `<b>📈 P/L: ${profitLoss >= 0 ? '🟢' : '🔴'} ${profitLoss >= 0 ? '+' : ''}${profitLoss.toLocaleString()}</b>\n\n`;

    if (currentReverseMode) {

      message += `🔄 <b>REVERSE STATS: ${reverseModeWins}W / ${reverseModeLosses}L</b>\n`;

    }

    message += `📊 Wingo Analitik Dashboard\n`;

    message += `🔗 https://splendid-queijadas-d948bb.netlify.app/wingo_bot_analytics`;

    return message;

  }



  /* ========= LOGIKA TARUHAN ========= */

  function placeBet() {

    if (!isBotActive) return false;

    

    // Cek saldo dan reset jika perlu

    if (virtualBalance < currentBetAmount) {

      console.log("❌ Saldo tidak cukup, reset...");

      const oldBalance = virtualBalance;

      sendResetToFirebase(oldBalance, "saldo_habis");

      

      virtualBalance = 247000;

      currentBetIndex = 0;

      currentBetAmount = betSequence[0];

      totalBets = totalWins = totalLosses = 0;

      currentStreak = losingStreak = profitLoss = 0;

      currentReverseMode = false;

      consecutiveReverseTriggers = reverseModeWins = reverseModeLosses = 0;

      predictedIssue = predictedAt = null;

      historicalData = [];

      lastMotivationSentAtLoss = lastDonationMessageAtWin = 0;

      

      sendTelegram(createOutOfBalanceMessage());

      console.log(`🔄 Saldo direset ke 247.000`);

    }

    

    // Kurangi saldo

    virtualBalance -= currentBetAmount;

    totalBets++;

    dailyStats.bets++;

    dailyStats.profit -= currentBetAmount;

    

    // Buat prediksi menggunakan mode saat ini

    isBetPlaced = true;

    currentPrediction = getPrediction();

    predictedAt = new Date();

    

    // Toggle reverse mode untuk prediksi berikutnya (zigzag)

    currentReverseMode = !currentReverseMode;

    

    console.log(`🎯 Prediksi dibuat: ${currentPrediction} (Reverse untuk prediksi ini: ${!currentReverseMode})`);

    // Catatan: karena kita toggle setelah, maka prediksi ini menggunakan nilai sebelum toggle

    return true;

  }



  function processResult(result, apiData) {

    if (!isBetPlaced || !isBotActive) return false;

    

    const isWin = currentPrediction === result;

    

    console.log(`🔍 HASIL: ${apiData.issueNumber} → ${result} (${isWin ? 'WIN' : 'LOSS'})`);

    

    if (isWin) {

      const consecutiveLossesBeforeWin = losingStreak;

      

      virtualBalance += (currentBetAmount * 2);

      totalWins++;

      currentStreak = currentStreak > 0 ? currentStreak + 1 : 1;

      lastMotivationSentAtLoss = 0;

      dailyStats.wins++;

      dailyStats.profit += (currentBetAmount * 2);

      

      console.log(`✅ MENANG!`);

      

      sendResultToFirebase(apiData, currentPrediction, true);

      

      // Catat statistik reverse (tanpa mengubah mode)

      updateReverseStats(true);

      

      // Reset level ke 1 setelah menang

      currentBetIndex = 0;

      currentBetAmount = betSequence[0];

      

      if (consecutiveLossesBeforeWin >= 5) {

        setTimeout(() => sendTelegram(createWinAfterLossMessage(consecutiveLossesBeforeWin)), 1000);

      }

      

      if (currentBetAmount > 10000) {

        setTimeout(() => sendTelegram(createDonationMessage()), 1500);

      }

      

      if (totalWins % 10 === 0 && totalWins !== lastDonationMessageAtWin) {

        setTimeout(() => { sendTelegram(createDonationMessage()); lastDonationMessageAtWin = totalWins; }, 2000);

      }

      

    } else {

      totalLosses++;

      currentStreak = currentStreak < 0 ? currentStreak - 1 : -1;

      dailyStats.losses++;

      

      console.log(`❌ KALAH! Level sebelum: ${currentBetIndex+1}`);

      

      sendResultToFirebase(apiData, currentPrediction, false);

      

      // Catat statistik reverse

      updateReverseStats(false);

      

      // Naikkan level

      if (currentBetIndex < betSequence.length - 1) {

        currentBetIndex++;

        currentBetAmount = betSequence[currentBetIndex];

      } else {

        console.log(`⚠️ Sudah level maksimal`);

      }

      

      // Motivasi

      if (losingStreak === 3 && lastMotivationSentAtLoss < 3) {

        setTimeout(() => { sendTelegram(createMotivationMessage(3)); lastMotivationSentAtLoss = 3; }, 500);

      } else if (losingStreak === 5 && lastMotivationSentAtLoss < 5) {

        setTimeout(() => { sendTelegram(createMotivationMessage(5)); lastMotivationSentAtLoss = 5; }, 500);

      } else if (losingStreak === 7 && lastMotivationSentAtLoss < 7) {

        setTimeout(() => { sendTelegram(createMotivationMessage(7)); lastMotivationSentAtLoss = 7; }, 500);

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

    try {

      const match = currentIssue.match(/(\d+)$/);

      if (match) {

        const lastNum = parseInt(match[1]);

        return currentIssue.replace(/(\d+)$/, (lastNum+1).toString());

      }

      return currentIssue;

    } catch { return currentIssue; }

  }



  function getShortIssue(issueNumber) {

    return issueNumber.slice(-3);

  }



  function setupDailyTimer() {

    setInterval(() => {

      const now = new Date();

      if (now.getHours() === 23 && now.getMinutes() === 59) console.log("📊 Laporan harian akan dikirim");

    }, 60000);

  }



  /* ========= PROCESS DATA ========= */

  let isProcessing = false;



  function processData(data) {

    if (isProcessing) return;

    try {

      isProcessing = true;

      const list = data?.data?.list;

      if (!list || list.length === 0) { isProcessing = false; return; }

      

      const item = list[0];

      if (!item.issueNumber || !item.number) { isProcessing = false; return; }

      

      const issueNumber = item.issueNumber;

      const number = parseInt(item.number, 10);

      const result = number <= 4 ? "KECIL" : "BESAR";

      

      if (lastProcessedIssue === issueNumber) { isProcessing = false; return; }

      

      console.log(`\n════════════════════════════════════════`);

      console.log(`📊 PERIODE ${getShortIssue(issueNumber)}: ANGKA ${number} (${result})`);

      

      if (predictedIssue) {

        console.log(`🔍 Prediksi ${getShortIssue(predictedIssue)} vs Hasil ${getShortIssue(issueNumber)}`);

      }

      

      analyzeTrendData(list);

      

      if (isBetPlaced) {

        const apiData = { issueNumber: item.issueNumber, number: item.number, colour: item.colour, premium: item.premium };

        const isWin = processResult(result, apiData);

        console.log(`   ${isWin ? '✅' : '❌'} | Saldo: ${virtualBalance.toLocaleString()}`);

      }

      

      setTimeout(() => {

        if (placeBet()) {

          const nextIssueForBet = nextIssueNumber || calculateNextIssue(issueNumber);

          const nextIssueShort = getShortIssue(nextIssueForBet);

          setTimeout(() => sendTelegram(createPredictionMessage(nextIssueShort)), 1500);

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

    } catch (error) { console.error('Error processing game issue:', error); }

  }



  /* ========= HOOK API ========= */

  const originalFetch = window.fetch;

  window.fetch = function(...args) {

    return originalFetch.apply(this, arguments).then(response => {

      const responseClone = response.clone();

      const url = args[0] || '';

      if (typeof url === 'string' && (url.includes('GetGameIssue') || url.includes('GetNoaverageEmerdList'))) {

        responseClone.text().then(text => {

          try {

            const data = JSON.parse(text);

            if (url.includes('GetGameIssue')) processGameIssueData(data);

            else if (url.includes('GetNoaverageEmerdList')) processData(data);

          } catch(e) { console.warn('⚠️ Gagal parse JSON'); }

        }).catch(() => {});

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

          try { processData(JSON.parse(this.responseText)); } catch(e) { console.error('XHR error:', e); }

        } else if (url.includes('GetGameIssue')) {

          try { processGameIssueData(JSON.parse(this.responseText)); } catch(e) { console.error('XHR game issue error:', e); }

        }

      }

    });

    return originalOpen.apply(this, args);

  };



  /* ========= MANUAL CHECK ========= */

  function manualCheck() {

    fetch("https://api.62clubgameapi.com/api/webapi/GetNoaverageEmerdList", {

      method: "POST",

      headers: { 

        "Content-Type": "application/json;charset=UTF-8",

        "Accept": "application/json, text/plain, */*",

        "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOiIxNzcxMDk0NjU0IiwibmJmIjoiMTc3MTA5NDY1NCIsImV4cCI6IjE3NzEwOTY0NTQiLCJodHRwOi8vc2NoZW1hcy5taWNyb3NvZnQuY29tL3dzLzIwMDgvMDYvaWRlbnRpdHkvY2xhaW1zL2V4cGlyYXRpb24iOiIyLzE1LzIwMjYgMjoxNDoxNCBBTSIsImh0dHA6Ly9zY2hlbWFzLm1pY3Jvc29mdC5jb20vd3MvMjAwOC8wNi9pZGVudGl0eS9jbGFpbXMvcm9sZSI6IkFjY2Vzc19Ub2tlbiIsIlVzZXJJZCI6IjEwMjEwNiIsIlVzZXJOYW1lIjoiNjI4MzE0Mjg4OTE0OSIsIlVzZXJQaG90byI6IjEiLCJOaWNrTmFtZSI6Ik1lbWJlck5OR09QTjc1IiwiQW1vdW50IjoiMC4wMCIsIkludGVncmFsIjoiMCIsIkxvZ2luTWFyayI6Ikg1IiwiTG9naW5UaW1lIjoiMi8xNS8yMDI2IDE6NDQ6MTQgQU0iLCJMb2dpbklQQWRkcmVzcyI6IjExMC4xMzkuMjM5Ljc0IiwiRGJOdW1iZXIiOiIwIiwiSXN2YWxpZGF0b3IiOiIwIiwiS2V5Q29kZSI6IjQiLCJUb2tlblR5cGUiOiJBY2Nlc3NfVG9rZW4iLCJQaG9uZVR5cGUiOiIxIiwiVXNlclR5cGUiOiIwIiwiVXNlck5hbWUyIjoiIiwiaXNzIjoiand0SXNzdWVyIiwiYXVkIjoibG90dGVyeVRpY2tldCJ9.7JxUDbr4pzkmFWtbI4pBFt3Rkl4LY2of4MGUYucxB1g",

        "Ar-Origin": "https://www.62club.biz"

      },

      body: JSON.stringify({ 

        pageSize: 10, pageNo: 1, typeId: 30, language: 1,

        random: "0ec539e669de42808bbb6bb901b80754",

        signature: "24209569632DE04C1342F70427D38270",

        timestamp: 1771095359

      })

    })

    .then(res => res.json())

    .then(processData)

    .catch(console.error);

  }



  /* ========= RESET & DEBUG ========= */

  function resetBot() {

    const oldBalance = virtualBalance;

    virtualBalance = 247000;

    currentBetIndex = 0;

    currentBetAmount = betSequence[0];

    totalBets = totalWins = totalLosses = 0;

    currentStreak = losingStreak = profitLoss = 0;

    isBetPlaced = false;

    nextIssueNumber = null;

    historicalData = [];

    lastMotivationSentAtLoss = lastDonationMessageAtWin = 0;

    predictedIssue = predictedAt = null;

    currentReverseMode = false;

    consecutiveReverseTriggers = reverseModeWins = reverseModeLosses = 0;

    messageQueue = [];

    isSendingMessage = false;

    dailyStats = { date: new Date().toDateString(), bets:0, wins:0, losses:0, profit:0 };

    isBotActive = true;

    sendResetToFirebase(oldBalance, "manual_reset");

    console.log("🔄 Bot direset ke saldo 247.000");

    sendTelegram(`🔄 <b>BOT DIRESET</b>\n💰 Saldo: Rp 247.000\n🎯 Mulai Level 1`);

  }



  function addBalance(amount) {

    virtualBalance += amount;

    console.log(`💰 +${amount.toLocaleString()} | Saldo: ${virtualBalance.toLocaleString()}`);

    sendToFirebase("balance_changes", { amount, newBalance: virtualBalance, timestamp: new Date().toISOString(), type: "manual_add_balance" });

  }



  /* ========= STARTUP ========= */

  console.log(`

🤖 WINGO v6.2 - ZIGZAG REVERSE

💰 Saldo awal: 247.000 (7 level)

🧮 Rumus: angka pertama + digit terakhir issue ke-5

🔄 Reverse: bergantian setiap prediksi (zikzak)

✅ Bot siap!

`);



  setupDailyTimer();

  sendStartupMotivationMessage();

  

  setTimeout(() => {

    if (placeBet()) {

      sendTelegram(createPredictionMessage("000"));

    }

  }, 2000);



  setInterval(manualCheck, 30000);

  setTimeout(manualCheck, 3000);



  /* ========= DEBUG ========= */

  window.wingoBot = { check: manualCheck, reset: resetBot, add: addBalance, activate: () => { isBotActive = true; console.log("✅ Bot diaktifkan"); }, deactivate: () => { isBotActive = false; console.log("⏸️ Bot dinonaktifkan"); }, stats: () => console.log({ virtualBalance, profitLoss, totalBets, totalWins, totalLosses, currentStreak, losingStreak, currentBetIndex: currentBetIndex+1, currentBetAmount, currentReverseMode, reverseStats: `${reverseModeWins}W/${reverseModeLosses}L` }) };

  window.wingoBetData = {

    get prediction() { return currentPrediction; },

    get amount() { return currentBetAmount; },

    get level() { return currentBetIndex + 1; },

    get balance() { return virtualBalance; },

    get stats() { return { totalBets, totalWins, totalLosses, winRate: totalBets>0?Math.round(totalWins/totalBets*100):0, profit: profitLoss, streak: currentStreak, losingStreak, reverseMode: currentReverseMode, reverseTriggers: consecutiveReverseTriggers, reverseModeWins, reverseModeLosses }; },

    getBetInfo() { return { prediction: this.prediction, amount: this.amount, level: this.level, reverseMode: currentReverseMode, reverseStats: `${reverseModeWins}W/${reverseModeLosses}L` }; },

    get status() { return { isActive: isBotActive, isBetPlaced, nextIssue: nextIssueNumber, predictedIssue }; }

  };

  console.log("✅ Auto-bet data exposed!");

})();
