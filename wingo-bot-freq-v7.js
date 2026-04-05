(function () {

  console.clear();
  console.log("🤖 WinGo Smart Trading Bot - System v7.0 (ANALISIS FREKUENSI 10 PERIODE) - DENGAN DETEKSI STREAK");

  /* ========= KONSTANTA SALDO AWAL ========= */
  const INITIAL_BALANCE = 2916000;  // Saldo awal: 2.916.000 (cukup untuk 8 level)

  /* ========= TELEGRAM ========= */
  const BOT_TOKEN = "8380843917:AAEpz0TiAlug533lGenKM8sDgTFH-0V5wAw";

  // Multi-group configuration
  const TELEGRAM_GROUPS = {
    primary: "-4534430485", // Grup utama (selalu aktif)
    secondary: [
      "-1001570553211",  // Grup backup 1
    ]
  };

  // Kontrol pengiriman ke grup lain
  let enableMultipleGroups = false;

  // Sistem antrian pesan
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
    maxBetLevel: 8
  };

  /* ========= SALDO VIRTUAL ========= */
  let virtualBalance = INITIAL_BALANCE;
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

  /* ========= STRATEGI MARTINGALE (8 LEVEL) ========= */
  const betSequence = [
    1000,
    3000,
    8000,
    24000,
    72000,
    216000,
    648000,
    1944000
  ];

  const betLabels = [
    "1K",
    "3K",
    "8K",
    "24K",
    "72K",
    "216K",
    "648K",
    "1.94M"
  ];

  let currentBetIndex = 0;
  let lastProcessedIssue = null;
  let currentBetAmount = betSequence[0];
  let isBetPlaced = false;
  let currentPrediction = null;
  let nextIssueNumber = null;

  /* ========= VARIABEL ISSUE SINKRONISASI ========= */
  let predictedIssue = null;
  let predictedAt = null;

  /* ========= VARIABEL HISTORIS ========= */
  let historicalData = [];

  /* ========= FIREBASE FUNCTIONS ========= */
  async function sendToFirebase(path, data) {
    try {
      const timestamp = Date.now();
      const dataWithTimestamp = {
        ...data,
        timestamp: timestamp,
        date: new Date().toISOString()
      };

      const response = await fetch(`${FIREBASE_URL}${path}.json`, {
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
      predictedIssue: predictedIssue,
      actualIssue: apiResultData.issueNumber,
      number: parseInt(apiResultData.number),
      colour: apiResultData.colour,
      premium: apiResultData.premium,
      result: parseInt(apiResultData.number) <= 4 ? "KECIL" : "BESAR",
      prediction: prediction,
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

    console.log(`📤 Mengirim ke Firebase: Issue ${apiResultData.issueNumber}, Angka ${apiResultData.number}`);
    console.log(`🔍 VERIFIKASI DATA API:`);
    console.log(`   - Issue: ${apiResultData.issueNumber}`);
    console.log(`   - Angka: ${apiResultData.number} → ${resultData.result}`);
    console.log(`   - Warna: ${apiResultData.colour}`);
    console.log(`   - Premium: ${apiResultData.premium}`);

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
    console.log(`📤 Prediksi dikirim ke Firebase: ${predictedIssue} → ${currentPrediction}`);
  }

  function sendResetToFirebase(oldBalance, reason) {
    const resetData = {
      oldBalance: oldBalance,
      newBalance: INITIAL_BALANCE,
      reason: reason,
      resetTime: new Date().toISOString(),
      totalBetsBeforeReset: totalBets,
      totalWinsBeforeReset: totalWins,
      totalLossesBeforeReset: totalLosses,
      currentBetIndex: currentBetIndex,
      currentBetAmount: currentBetAmount
    };

    sendToFirebase("resets", resetData);
    console.log(`📊 Data reset dikirim ke Firebase: ${reason}`);
  }

  function sendSafetyEventToFirebase(event, details) {
    const safetyData = {
      event: event,
      details: details,
      timestamp: new Date().toISOString(),
      virtualBalance: virtualBalance,
      dailyProfit: dailyStats.profit,
      currentBetLevel: currentBetIndex + 1
    };

    sendToFirebase("safety_events", safetyData);
  }

  /* ========= TELEGRAM FUNCTIONS ========= */
  function sendTelegram(msg) {
    sendToGroup(msg, TELEGRAM_GROUPS.primary);

    if (enableMultipleGroups && TELEGRAM_GROUPS.secondary.length > 0) {
      TELEGRAM_GROUPS.secondary.forEach(chatId => {
        sendToGroup(msg, chatId);
      });
    }
  }

  function sendToGroup(msg, chatId) {
    messageQueue.push({ msg, chatId });
    if (!isSendingMessage) {
      processMessageQueue();
    }
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
    .then(() => {
      console.log(`✅ Pesan terkirim ke grup ${task.chatId}`);
      setTimeout(processMessageQueue, MESSAGE_DELAY);
    })
    .catch(e => {
      console.error(`❌ Telegram error untuk grup ${task.chatId}:`, e);
      setTimeout(processMessageQueue, MESSAGE_DELAY * 2);
    });
  }

  /* ========= PESAN MOTIVASI STARTUP ========= */
  function sendStartupMotivationMessage() {
    const startupMessage = `🤖 <b>WINGO SMART TRADING BOT v7.0 - ANALISIS FREKUENSI 10 PERIODE + DETEKSI STREAK</b>\n\n` +
                          `Sistem prediksi berdasarkan data 10 hasil terakhir:\n\n` +
                          `🧮 <b>METODE:</b>\n` +
                          `• Hitung frekuensi kemunculan angka 0-9 dalam 10 periode terakhir\n` +
                          `• Cari angka yang paling jarang muncul (atau tidak muncul sama sekali)\n` +
                          `• Prediksi KECIL (0-4) atau BESAR (5-9) berdasarkan angka tersebut\n` +
                          `• Jika semua angka muncul, pilih yang memiliki frekuensi terendah\n` +
                          `• Fallback ke hasil terakhir jika data kurang dari 5 periode\n` +
                          `• ✅ DILENGKAPI DETEKSI STREAK: jika 4x hasil sama, ikuti trend!\n\n` +
                          `💰 <b>SISTEM MARTINGALE 8 LEVEL:</b>\n` +
                          `1. Rp 1.000\n` +
                          `2. Rp 3.000\n` +
                          `3. Rp 8.000\n` +
                          `4. Rp 24.000\n` +
                          `5. Rp 72.000\n` +
                          `6. Rp 216.000\n` +
                          `7. Rp 648.000\n` +
                          `8. Rp 1.944.000\n\n` +
                          `📊 Total saldo: Rp ${INITIAL_BALANCE.toLocaleString()} (cukup untuk semua level hingga level 8)\n` +
                          `🔄 Auto-reset saat saldo habis\n\n` +
                          `⚠️ <b>HATI-HATI:</b> Trading punya risiko tinggi!`;

    sendTelegram(startupMessage);
  }

  /* ========= FUNGSI BANTU ========= */
  function getMainColour(colourString) {
    if (!colourString) return '';
    return colourString.split(',')[0];
  }

  /* ========= PREDIKSI BERDASARKAN FREKUENSI 10 PERIODE + DETEKSI STREAK ========= */
  function getPredictionFromFrequency() {
    // ========= DETEKSI STREAK PANJANG (4x SAMA) =========
    if (historicalData.length >= 4) {
      const last4 = historicalData.slice(0, 4).map(d => d.result);
      const allSame = last4.every(r => r === last4[0]);
      if (allSame) {
        console.log(`⚠️ Terdeteksi streak ${last4[0]} sebanyak 4x, ikuti trend!`);
        return last4[0]; // "BESAR" atau "KECIL"
      }
    }

    // ========= FALLBACK JIKA DATA KURANG =========
    // Jika data historis kurang dari 5, fallback ke hasil terakhir (trend sederhana)
    if (historicalData.length < 5) {
      if (historicalData.length > 0) {
        console.log("⚠️ Data historis kurang dari 5 periode, menggunakan hasil terakhir sebagai prediksi");
        return historicalData[0].result;
      }
      console.log("⚠️ Tidak ada data historis, default ke KECIL");
      return "KECIL";
    }

    // ========= ANALISIS FREKUENSI 10 PERIODE TERAKHIR =========
    // Ambil maksimal 10 data terakhir
    const last10 = historicalData.slice(0, 10);
    const freq = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (const d of last10) {
      freq[d.number]++;
    }

    console.log(`📊 Frekuensi angka dalam 10 periode terakhir:`);
    for (let i = 0; i <= 9; i++) {
      console.log(`   Angka ${i}: ${freq[i]}x`);
    }

    // Cari angka yang tidak muncul (freq === 0)
    const missing = [];
    for (let i = 0; i <= 9; i++) {
      if (freq[i] === 0) missing.push(i);
    }

    let selectedNumber = null;
    if (missing.length > 0) {
      // Pilih angka yang paling mendekati 5 (tengah) dari angka yang tidak muncul
      let closest = missing[0];
      for (let m of missing) {
        if (Math.abs(m - 5) < Math.abs(closest - 5)) closest = m;
      }
      selectedNumber = closest;
      console.log(`🔮 Analisis: angka tidak muncul dalam 10 periode: ${missing.join(', ')}. Dipilih angka ${selectedNumber}`);
    } else {
      // Semua angka muncul, cari yang paling jarang (frekuensi terendah)
      let minFreq = Math.min(...freq);
      let candidates = [];
      for (let i = 0; i <= 9; i++) {
        if (freq[i] === minFreq) candidates.push(i);
      }
      // Pilih yang paling mendekati 5
      let closest = candidates[0];
      for (let c of candidates) {
        if (Math.abs(c - 5) < Math.abs(closest - 5)) closest = c;
      }
      selectedNumber = closest;
      console.log(`🔮 Analisis: semua angka muncul, pilih yang paling jarang (${minFreq}x): ${candidates.join(', ')}. Dipilih angka ${selectedNumber}`);
    }

    const prediction = selectedNumber <= 4 ? "KECIL" : "BESAR";
    console.log(`🔮 Hasil prediksi berdasarkan angka ${selectedNumber} → ${prediction}`);
    return prediction;
  }

  /* ========= FUNGSI PREDIKSI UTAMA ========= */
  function getPrediction() {
    return getPredictionFromFrequency();
  }

  function analyzeTrendData(listData) {
    if (!listData || listData.length < 5) return;

    const results = listData.map(item => {
      const num = parseInt(item.number);
      return {
        issue: item.issueNumber,
        number: num,
        result: num <= 4 ? "KECIL" : "BESAR",
        colour: item.colour
      };
    });

    historicalData = [...results, ...historicalData].slice(0, 20);

    if (historicalData.length >= 5) {
      const recentNumbers = historicalData.slice(0, 5).map(d => d.number);
      console.log(`📊 5 DATA TERBARU: ${recentNumbers.join(', ')}`);
      console.log(`📋 Issue ke-1: ${historicalData[0].issue} → angka: ${historicalData[0].number}, warna: ${historicalData[0].colour}`);
    }
  }

  /* ========= FUNGSI PESAN ========= */
  function createMotivationMessage(lossCount) {
    return `💪 <b>TERUS SEMANGAT!</b>\n\n` +
           `📉 Anda mengalami ${lossCount} kekalahan berturut-turut,\n` +
           `💰 Level: ${currentBetIndex + 1} (Rp ${currentBetAmount.toLocaleString()})\n` +
           `💪 Kesabaran adalah kunci!`;
  }

  function createWinAfterLossMessage(consecutiveLosses) {
    return `🎉 <b>SELAMAT! KEBERHASILAN SETELAH KESABARAN</b>\n\n` +
           `✅ Anda berhasil menang setelah ${consecutiveLosses} kekalahan beruntun\n` +
           `💋 Ini membuktikan pentingnya konsistensi dan kesabaran\n\n` +
           `💰 Saldo sekarang: Rp ${virtualBalance.toLocaleString()}\n` +
           `🔄 Kembali ke Level 1 untuk memulai siklus baru\n\n` +
           `🔥 <i>Teruskan semangat dan disiplin Anda!</i>`;
  }

  function createDonationMessage() {
    const winRate = totalBets > 0 ? Math.round((totalWins / totalBets) * 100) : 0;

    return `🏆 <b>CAPAIAN ${totalWins} KEMENANGAN!</b>\n\n` +
           `✅ Total ${totalWins} kemenangan sejak bot mulai\n` +
           `📊 Win Rate: ${winRate}%\n\n` +
           `❤️ <b>TERIMA KASIH ATAS KEPERCAYAANNYA!</b>\n` +
           `Untuk yang merasa terbantu & mau support keberlangsungan prediksi ini:\n\n` +
           `💰 <b>DANA: 082311640444</b>\n\n` +
           `📈 Donasi akan digunakan untuk:\n` +
           `• Upgrade server biar lebih cepat\n` +
           `• Riset algoritma baru\n` +
           `• Maintenance database historis\n\n` +
           `<i>Bersama kita buat komunitas trading yang saling support!</i>`;
  }

  function createOutOfBalanceMessage() {
    const winRate = totalBets > 0 ? Math.round((totalWins / totalBets) * 100) : 0;

    return `🚫 <b>SALDO HABIS - RESET OTOMATIS</b>\n\n` +
           `💸 Saldo virtual sudah tidak mencukupi untuk taruhan berikutnya\n` +
           `🔄 Saldo direset otomatis ke Rp ${INITIAL_BALANCE.toLocaleString()}\n\n` +
           `📊 <b>STATISTIK SEBELUM RESET:</b>\n` +
           `├── 💰 Saldo: Rp ${virtualBalance.toLocaleString()}\n` +
           `├── 🎯 Total Taruhan: ${totalBets}\n` +
           `├── ✅ Menang: ${totalWins}\n` +
           `├── ❌ Kalah: ${totalLosses}\n` +
           `├── 📊 Win Rate: ${winRate}%\n` +
           `├── 📈 P/L: ${profitLoss >= 0 ? '🟢' : '🔴'} ${profitLoss >= 0 ? '+' : ''}${profitLoss.toLocaleString()}\n` +
           `└── 🔥 Streak Terakhir: ${currentStreak > 0 ? 'W' + currentStreak : 'L' + Math.abs(currentStreak)}\n\n` +
           `💪 <b>BOT TERUS BERJALAN DENGAN SALDO BARU</b>\n` +
           `📊 Data reset telah dikirim ke database Firebase`;
  }

  function createPredictionMessage(nextIssueShort) {
    const betLabel = betLabels[currentBetIndex];
    let predictionInfo = "";
    if (historicalData.length >= 5) {
      predictionInfo = `\n🧮 Analisis: frekuensi 10 periode + deteksi streak`;
    }
    let message = `<b>WINGO 30s - FREKUENSI 10 PERIODE + STREAK</b>\n`;
    message += `<b>🆔 PERIODE ${nextIssueShort}</b>\n`;
    message += `<b>🎯 PREDIKSI: ${currentPrediction} ${betLabel}</b>\n`;
    message += `<b>📊 Metode: Angka paling jarang / deteksi streak 4x</b>\n`;
    message += `─────────────────\n`;
    message += `<b>📊 LEVEL: ${currentBetIndex + 1}/${betSequence.length}</b>\n`;
    message += `<b>💳 SALDO: Rp ${virtualBalance.toLocaleString()}</b>\n`;
    message += `<b>📈 P/L: ${profitLoss >= 0 ? '🟢' : '🔴'} ${profitLoss >= 0 ? '+' : ''}${profitLoss.toLocaleString()}</b>\n\n`;
    message += `📊 Wingo Analitik Dashboard\n`;
    message += `🔗 https://splendid-queijadas-d948bb.netlify.app/wingo_bot_analytics`;

    return message;
  }

  /* ========= LOGIKA TARUHAN ========= */
  function placeBet() {
    if (!isBotActive) {
      console.log("⏸️ Bot sedang tidak aktif");
      return false;
    }

    if (virtualBalance < currentBetAmount) {
      console.log("❌ Saldo tidak cukup, reset ke saldo awal...");
      const oldBalance = virtualBalance;
      sendResetToFirebase(oldBalance, "saldo_habis");

      virtualBalance = INITIAL_BALANCE;
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

      const outOfBalanceMessage = createOutOfBalanceMessage();
      sendTelegram(outOfBalanceMessage);
      console.log(`🔄 Saldo direset ke ${INITIAL_BALANCE.toLocaleString()}, kembali ke Level 1`);
    }

    virtualBalance -= currentBetAmount;
    totalBets++;
    dailyStats.bets++;
    dailyStats.profit -= currentBetAmount;

    isBetPlaced = true;
    currentPrediction = getPrediction();
    predictedAt = new Date();
    predictedIssue = nextIssueNumber;
    sendPredictionToFirebase();

    console.log(`🎯 Prediksi dibuat: ${currentPrediction}`);
    return true;
  }

  function processResult(result, apiData) {
    if (!isBetPlaced || !isBotActive) return false;

    const isWin = currentPrediction === result;

    console.log(`🔍 PROSES HASIL DENGAN DATA API LANGSUNG:`);
    console.log(`   API Issue: ${apiData.issueNumber}`);
    console.log(`   API Number: ${apiData.number}`);
    console.log(`   API Colour: ${apiData.colour}`);
    console.log(`   Predicted Issue: ${predictedIssue}`);
    console.log(`   Result: ${result} (${isWin ? 'WIN' : 'LOSS'})`);
    console.log(`   Prediction: ${currentPrediction}`);

    if (isWin) {
      const consecutiveLossesBeforeWin = currentStreak < 0 ? Math.abs(currentStreak) : 0;

      virtualBalance += (currentBetAmount * 2);
      totalWins++;
      currentStreak = currentStreak > 0 ? currentStreak + 1 : 1;
      lastMotivationSentAtLoss = 0;
      dailyStats.wins++;
      dailyStats.profit += (currentBetAmount * 2);

      console.log(`✅ MENANG! Prediksi ${currentPrediction} untuk issue ${apiData.issueNumber}`);

      const winningBetAmount = currentBetAmount;
      sendResultToFirebase(apiData, currentPrediction, true);

      // Reset level martingale ke 1 setelah menang
      currentBetIndex = 0;
      currentBetAmount = betSequence[0];
      console.log(`   ✅ Reset ke Level 1`);

      if (consecutiveLossesBeforeWin >= 5) {
        setTimeout(() => {
          const winAfterLossMessage = createWinAfterLossMessage(consecutiveLossesBeforeWin);
          sendTelegram(winAfterLossMessage);
        }, 1000);
      }

      if (winningBetAmount > 10000) {
        setTimeout(() => {
          const donationMessage = createDonationMessage();
          sendTelegram(donationMessage);
        }, 1500);
      }

      if (totalWins % 10 === 0 && totalWins > 0 && totalWins !== lastDonationMessageAtWin) {
        setTimeout(() => {
          const periodicMessage = createDonationMessage();
          sendTelegram(periodicMessage);
          lastDonationMessageAtWin = totalWins;
        }, 2000);
      }

    } else {
      totalLosses++;
      currentStreak = currentStreak < 0 ? currentStreak - 1 : -1;
      dailyStats.losses++;

      console.log(`❌ KALAH! Prediksi ${currentPrediction} untuk issue ${apiData.issueNumber}`);
      console.log(`   Level sebelum: ${currentBetIndex + 1} (Rp ${currentBetAmount.toLocaleString()})`);

      sendResultToFirebase(apiData, currentPrediction, false);

      // Naikkan level martingale jika belum maksimal
      if (currentBetIndex < betSequence.length - 1) {
        currentBetIndex++;
        currentBetAmount = betSequence[currentBetIndex];
        console.log(`   Level setelah: ${currentBetIndex + 1} (Rp ${currentBetAmount.toLocaleString()})`);
      } else {
        console.log(`   ⚠️ Sudah level maksimal, tetap di level ini`);
      }

      // Kirim motivasi pada kekalahan ke-3,5,7
      const lossStreakMsg = Math.abs(currentStreak);
      if (lossStreakMsg === 3 && lastMotivationSentAtLoss < 3) {
        setTimeout(() => {
          const motivationMessage = createMotivationMessage(3);
          sendTelegram(motivationMessage);
          lastMotivationSentAtLoss = 3;
        }, 500);
      } else if (lossStreakMsg === 5 && lastMotivationSentAtLoss < 5) {
        setTimeout(() => {
          const motivationMessage = createMotivationMessage(5);
          sendTelegram(motivationMessage);
          lastMotivationSentAtLoss = 5;
        }, 500);
      } else if (lossStreakMsg === 7 && lastMotivationSentAtLoss < 7) {
        setTimeout(() => {
          const motivationMessage = createMotivationMessage(7);
          sendTelegram(motivationMessage);
          lastMotivationSentAtLoss = 7;
        }, 500);
      }
    }

    profitLoss = virtualBalance - INITIAL_BALANCE;
    isBetPlaced = false;
    predictedIssue = null;
    predictedAt = null;

    return isWin;
  }

  /* ========= FUNGSI PERIODE & TIMER ========= */
  function calculateNextIssue(currentIssue) {
    if (!currentIssue) return null;
    try {
      const match = currentIssue.match(/(\d+)$/);
      if (match) {
        const lastNum = parseInt(match[1]);
        const nextNum = lastNum + 1;
        return currentIssue.replace(/(\d+)$/, nextNum.toString());
      }
      return currentIssue;
    } catch (error) {
      return currentIssue;
    }
  }

  function getShortIssue(issueNumber) {
    return issueNumber.slice(-3);
  }

  function setupDailyTimer() {
    function checkDailyReport() {
      const now = new Date();
      const hours = now.getHours();
      const minutes = now.getMinutes();
      if (hours === 23 && minutes === 59) {
        console.log("📊 Laporan harian akan dikirim (23:59)");
      }
    }
    setInterval(checkDailyReport, 60000);
    checkDailyReport();
  }

  function sendDailyReportToFirebase() {
    const dailyReportData = {
      date: new Date().toISOString().split('T')[0],
      totalBets: totalBets,
      totalWins: totalWins,
      totalLosses: totalLosses,
      winRate: totalBets > 0 ? Math.round((totalWins / totalBets) * 100) : 0,
      profitLoss: profitLoss,
      virtualBalance: virtualBalance,
      currentBetLevel: currentBetIndex + 1,
      currentBetAmount: currentBetAmount,
      currentStreak: currentStreak,
      timestamp: Date.now(),
      dailyBets: dailyStats.bets,
      dailyWins: dailyStats.wins,
      dailyLosses: dailyStats.losses,
      dailyProfit: dailyStats.profit
    };
    sendToFirebase("daily_reports", dailyReportData);
  }

  /* ========= PROCESS DATA ========= */
  let isProcessing = false;

  function processData(data) {
    if (isProcessing) return;

    try {
      isProcessing = true;

      const list = data?.data?.list;
      if (!list || list.length === 0) {
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
      console.log(`📊 PERIODE ${getShortIssue(issueNumber)}: ANGKA ${number} (${result})`);

      if (predictedIssue) {
        const predShort = getShortIssue(predictedIssue);
        const currShort = getShortIssue(issueNumber);
        console.log(`🔍 SINKRONISASI: Prediksi ${predShort} vs Hasil ${currShort}`);
      }

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
          let nextIssueForBet;

          if (nextIssueNumber) {
            nextIssueForBet = nextIssueNumber;
          } else {
            nextIssueForBet = calculateNextIssue(issueNumber);
          }

          const nextIssueShort = getShortIssue(nextIssueForBet);
          const message = createPredictionMessage(nextIssueShort);
          setTimeout(() => {
            sendTelegram(message);
          }, 1500);
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
              if (url.includes('GetGameIssue')) {
                processGameIssueData(data);
              } else if (url.includes('GetNoaverageEmerdList')) {
                processData(data);
              }
            } catch(e) {
              console.warn('⚠️ Gagal parse JSON dari:', url.substring(0, 50));
            }
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
          } catch(e) {
            console.error('XHR error:', e);
          }
        } else if (url.includes('GetGameIssue')) {
          try {
            const data = JSON.parse(this.responseText);
            processGameIssueData(data);
          } catch(e) {
            console.error('XHR game issue error:', e);
          }
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

    virtualBalance = INITIAL_BALANCE;
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
    dailyStats = {
      date: new Date().toDateString(),
      bets: 0,
      wins: 0,
      losses: 0,
      profit: 0
    };
    isBotActive = true;

    sendResetToFirebase(oldBalance, "manual_reset");
    console.log(`🔄 Bot direset ke saldo ${INITIAL_BALANCE.toLocaleString()} dan diaktifkan`);

    const startupMsg = `🔄 <b>BOT DIRESET DAN DIAKTIFKAN (Analisis Frekuensi 10 Periode + Deteksi Streak)</b>\n\n` +
                      `💰 Saldo: Rp ${INITIAL_BALANCE.toLocaleString()}\n` +
                      `🎯 Mulai dari Level 1\n` +
                      `🧮 Metode: Cari angka paling jarang dalam 10 periode terakhir, prediksi KECIL/BESAR\n` +
                      `✅ Ditambah deteksi streak 4x untuk mengikuti trend\n` +
                      `📊 Martingale 8 Level\n\n` +
                      `<i>Bot berjalan otomatis.</i>`;
    sendTelegram(startupMsg);
  }

  function addBalance(amount) {
    virtualBalance += amount;
    console.log(`💰 +${amount.toLocaleString()} | Saldo: ${virtualBalance.toLocaleString()}`);

    const addBalanceData = {
      amount: amount,
      newBalance: virtualBalance,
      timestamp: new Date().toISOString(),
      type: "manual_add_balance"
    };
    sendToFirebase("balance_changes", addBalanceData);
  }

  /* ========= STARTUP ========= */
  console.log(`

🤖 WINGO SMART TRADING BOT v7.0 - ANALISIS FREKUENSI 10 PERIODE + DETEKSI STREAK

💰 Saldo awal: ${INITIAL_BALANCE.toLocaleString()}
🧮 Strategi: 
   - Mengumpulkan 10 hasil periode terakhir
   - Menghitung frekuensi setiap angka (0-9)
   - Memilih angka yang paling jarang muncul (atau tidak muncul)
   - Prediksi KECIL jika angka <=4, BESAR jika >=5
   - ✅ DETEKSI STREAK: jika 4x hasil sama, ikuti trend (abaikan frekuensi)
   - Fallback ke hasil terakhir jika data kurang
📊 Martingale 8 Level (1K, 3K, 8K, 24K, 72K, 216K, 648K, 1.94M)
📡 Firebase aktif
🔒 Sinkronisasi issue AKTIF

✅ Bot siap!

`);

  setupDailyTimer();
  // sendStartupMotivationMessage();

  setTimeout(() => {
    if (placeBet()) {
      const message = createPredictionMessage("000");
      sendTelegram(message);
    }
  }, 2000);

  setInterval(manualCheck, 30000);
  setTimeout(manualCheck, 3000);

  /* ========= DEBUG COMMANDS ========= */
  window.wingoBot = {
    check: manualCheck,
    reset: resetBot,
    add: addBalance,
    activate: () => {
      isBotActive = true;
      console.log("✅ Bot diaktifkan");
      sendTelegram("✅ <b>BOT DIAKTIFKAN</b>");
    },
    deactivate: () => {
      isBotActive = false;
      console.log("⏸️ Bot dinonaktifkan");
      sendTelegram("⏸️ <b>BOT DINONAKTIFKAN</b>");
    },
    stats: () => {
      const winRate = totalBets > 0 ? Math.round((totalWins/totalBets)*100) : 0;
      console.log(`

💰 Saldo: ${virtualBalance.toLocaleString()}
📈 P/L: ${profitLoss >= 0 ? '+' : ''}${profitLoss.toLocaleString()}
🎯 Bet: ${totalBets} (W:${totalWins}/L:${totalLosses})
📊 Win Rate: ${winRate}%
🔥 Streak: ${currentStreak}
📊 Level: ${currentBetIndex + 1} (Rp ${currentBetAmount.toLocaleString()})
📈 Data Historis: ${historicalData.length} periode
❌ Kalah Berturut: ${currentStreak < 0 ? Math.abs(currentStreak) : 0}
📅 Hari ini: ${dailyStats.bets} bet (${dailyStats.wins}W/${dailyStats.losses}L) P/L: ${dailyStats.profit >= 0 ? '+' : ''}${dailyStats.profit.toLocaleString()}
🚦 Status: ${isBotActive ? 'AKTIF' : 'NONAKTIF'}
📅 Periode berikutnya: ${nextIssueNumber || 'Belum diketahui'}

      `);
    },
    history: () => {
      console.log(`📜 Data Historis (${historicalData.length} periode):`);
      historicalData.slice(0, 10).forEach((d, i) => {
        const shortIssue = getShortIssue(d.issue);
        console.log(`   ${i+1}. ${shortIssue}: ${d.number} (${d.result}) ${d.colour}`);
      });
    }
  };

  window.wingoBetData = {
    get prediction() { return currentPrediction; },
    get amount() { return currentBetAmount; },
    get level() { return currentBetIndex + 1; },
    get balance() { return virtualBalance; },
    get stats() {
      return {
        totalBets, totalWins, totalLosses,
        winRate: totalBets > 0 ? Math.round((totalWins/totalBets)*100) : 0,
        profit: profitLoss,
        streak: currentStreak,
        losingStreak: currentStreak < 0 ? Math.abs(currentStreak) : 0
      };
    },
    getBetInfo() {
      return { prediction: this.prediction, amount: this.amount, level: this.level };
    },
    get status() {
      return { isActive: isBotActive, isBetPlaced, nextIssue: nextIssueNumber, predictedIssue };
    }
  };

  console.log("✅ Auto-bet data exposed!");

})();
