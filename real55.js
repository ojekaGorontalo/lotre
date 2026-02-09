(function () {
  console.clear();
  console.log("🤖 WinGo Smart Trading Bot - New System v6.0 (Updated Switching Order)");

  /* ========= TELEGRAM ========= */
  const BOT_TOKEN = "8380843917:AAEpz0TiAlug533lGenKM8sDgTFH-0V5wAw";
  
  // Multi-group configuration
  const TELEGRAM_GROUPS = {
    primary: "-1003291560910", // Grup utama (selalu aktif)
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
  let virtualBalance = 502000;  // SALDO AWAL BARU: 502.000
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

  /* ========= STRATEGI MARTINGALE BARU ========= */
  const betSequence = [
    1000,      // Level 1: 1,000
    3000,      // Level 2: 3,000
    7000,      // Level 3: 7,000
    15000,     // Level 4: 15,000
    31000,     // Level 5: 31,000
    63000,     // Level 6: 63,000
    127000,    // Level 7: 127,000
    255000     // Level 8: 255,000 (BARU)
  ];
  
  const betLabels = [
    "1K",
    "3K", 
    "7K",
    "15K",
    "31K",
    "63K",
    "127K",
    "255K"
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

  /* ========= VARIABEL ANALISIS BARU ========= */
  let predictionHistory = [];
  let currentPredictionMode = 3; // PERUBAHAN: Mulai dari Mode 3 (ZIGZAG)
  let lastPredictionResult = null; // "WIN" atau "LOSE"
  let zigzagToggle = false;

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
        headers: {
          'Content-Type': 'application/json',
        },
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
      losingStreak: losingStreak,
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

  function sendResetToFirebase(oldBalance, reason) {
    const resetData = {
      oldBalance: oldBalance,
      newBalance: 502000,
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
      losingStreak: losingStreak,
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
    const startupMessage = `🤖 <b>WINGO SMART TRADING BOT v6.0 - SYSTEM BARU (ORDER UPDATE)</b>\n\n` +
                          `Sistem analisis baru menggunakan 4 angka terbaru dengan 3 rumus:\n\n` +
                          `🧮 <b>3 RUMUS ANALISIS (ORDER BARU):</b>\n` +
                          `1️⃣ ZIGZAG → bergantian antara rumus jumlah dan reverse\n` +
                          `2️⃣ REVERSE → kebalikan dari rumus jumlah\n` +
                          `3️⃣ JUMLAH 4 ANGKA → ambil digit terakhir\n\n` +
                          `🔄 <b>LOGIKA SWITCHING BARU:</b>\n` +
                          `• Mulai dari Mode 3 (ZIGZAG)\n` +
                          `• Menang → tetap di rumus sama\n` +
                          `• Kalah → pindah ke rumus berikutnya\n` +
                          `• Urutan: Mode 3 → Mode 2 → Mode 1 → Mode 3 → ...\n\n` +
                          `💰 <b>SISTEM MARTINGALE 8 LEVEL:</b>\n` +
                          `1. Rp 1.000\n` +
                          `2. Rp 3.000\n` +
                          `3. Rp 7.000\n` +
                          `4. Rp 15.000\n` +
                          `5. Rp 31.000\n` +
                          `6. Rp 63.000\n` +
                          `7. Rp 127.000\n` +
                          `8. Rp 255.000\n\n` +
                          `📊 Total saldo: 502.000 (cukup untuk semua level)\n` +
                          `🔄 Auto-reset saat saldo habis\n\n` +
                          `⚠️ <b>HATI-HATI:</b> Trading punya risiko tinggi!`;
    
    sendTelegram(startupMessage);
  }

  /* ========= ANALISIS 4 ANGKA TERBARU ========= */
  function getLastFourNumbers() {
    if (historicalData.length < 4) {
      console.log("⚠️ Data kurang dari 4, pakai default");
      return null;
    }
    
    // Ambil 4 data terbaru (index 0 adalah terbaru)
    const lastFour = historicalData.slice(0, 4);
    return lastFour.map(item => item.number);
  }

  /* ========= RUMUS 1: JUMLAH 4 ANGKA ========= */
  function calculatePredictionBySum() {
    const fourNumbers = getLastFourNumbers();
    if (!fourNumbers) return null;
    
    // Jumlahkan 4 angka
    const sum = fourNumbers.reduce((total, num) => total + num, 0);
    
    // Ambil digit terakhir
    const lastDigit = sum % 10;
    
    console.log(`🔢 ANALISIS 4 ANGKA: ${fourNumbers.join('+')} = ${sum} → digit terakhir ${lastDigit}`);
    
    // 0-4: KECIL, 5-9: BESAR
    const prediction = (lastDigit <= 4) ? "KECIL" : "BESAR";
    
    return {
      prediction: prediction,
      details: {
        numbers: fourNumbers,
        sum: sum,
        lastDigit: lastDigit,
        method: "SUM"
      }
    };
  }

  /* ========= RUMUS 2: REVERSE DARI RUMUS 1 ========= */
  function calculatePredictionByReverse() {
    const sumResult = calculatePredictionBySum();
    if (!sumResult) return null;
    
    // Balikkan prediksi
    const reversePrediction = sumResult.prediction === "KECIL" ? "BESAR" : "KECIL";
    
    return {
      prediction: reversePrediction,
      details: {
        ...sumResult.details,
        method: "REVERSE",
        originalPrediction: sumResult.prediction
      }
    };
  }

  /* ========= RUMUS 3: ZIGZAG ========= */
  function calculatePredictionByZigzag() {
    // Bergantian antara jumlah dan reverse
    zigzagToggle = !zigzagToggle;
    
    if (zigzagToggle) {
      return calculatePredictionBySum();
    } else {
      return calculatePredictionByReverse();
    }
  }

  /* ========= SISTEM SWITCHING RUMUS ========= */
  function getPredictionByNewMethod() {
    let predictionData = null;
    let methodName = "";
    
    // Tentukan rumus berdasarkan mode saat ini
    switch(currentPredictionMode) {
      case 1: // Rumus Jumlah
        predictionData = calculatePredictionBySum();
        methodName = "JUMLAH 4 ANGKA";
        break;
        
      case 2: // Rumus Reverse
        predictionData = calculatePredictionByReverse();
        methodName = "REVERSE";
        break;
        
      case 3: // Rumus Zigzag
        predictionData = calculatePredictionByZigzag();
        methodName = "ZIGZAG";
        break;
        
      default:
        predictionData = calculatePredictionBySum();
        methodName = "DEFAULT";
    }
    
    if (predictionData) {
      console.log(`🎯 PREDIKSI MODE ${currentPredictionMode} (${methodName}): ${predictionData.prediction}`);
      console.log(`   Detail: ${JSON.stringify(predictionData.details)}`);
      
      // Simpan history
      predictionHistory.push({
        mode: currentPredictionMode,
        method: methodName,
        prediction: predictionData.prediction,
        timestamp: new Date(),
        details: predictionData.details
      });
      
      // Max 50 history
      predictionHistory = predictionHistory.slice(-50);
    }
    
    return predictionData ? predictionData.prediction : "KECIL"; // fallback
  }

  /* ========= UPDATE MODE BERDASARKAN HASIL (ORDER BARU) ========= */
  function updatePredictionMode(isWin) {
    console.log(`🔄 UPDATE MODE: Hasil ${isWin ? 'MENANG' : 'KALAH'}, Mode sebelumnya: ${currentPredictionMode}`);
    
    if (isWin) {
      // Jika menang, pertahankan mode saat ini
      lastPredictionResult = "WIN";
      console.log(`   ✅ MENANG: Tetap di Mode ${currentPredictionMode}`);
    } else {
      // Jika kalah, ganti mode dengan ORDER BARU:
      // Mode 3 (ZIGZAG) → 2 (REVERSE) → 1 (JUMLAH) → 3 (ZIGZAG) → ...
      lastPredictionResult = "LOSE";
      
      if (currentPredictionMode === 3) {
        currentPredictionMode = 2;
        console.log(`   🔄 KALAH: Switch Mode 3 → 2 (REVERSE)`);
      } else if (currentPredictionMode === 2) {
        currentPredictionMode = 1;
        console.log(`   🔄 KALAH: Switch Mode 2 → 1 (JUMLAH)`);
      } else if (currentPredictionMode === 1) {
        currentPredictionMode = 3;
        zigzagToggle = true; // Reset zigzag saat kembali ke mode 3
        console.log(`   🔄 KALAH: Switch Mode 1 → 3 (ZIGZAG)`);
      }
    }
    
    // Simpan ke Firebase
    sendToFirebase("prediction_mode_changes", {
      oldMode: currentPredictionMode,
      newMode: currentPredictionMode,
      result: isWin ? "WIN" : "LOSE",
      timestamp: new Date().toISOString(),
      virtualBalance: virtualBalance,
      currentBetLevel: currentBetIndex + 1
    });
  }

  /* ========= FUNGSI getPrediction() YANG BARU ========= */
  function getPrediction() {
    // Jika data kurang dari 4, pakai default
    if (historicalData.length < 4) {
      console.log("⚠️ Data historis kurang dari 4, pakai prediksi default");
      
      if (historicalData.length > 0) {
        // Jika ada data, prediksi kebalikan dari hasil terakhir
        const last = historicalData[0];
        return last.result === "KECIL" ? "BESAR" : "KECIL";
      }
      
      return Math.random() > 0.5 ? "KECIL" : "BESAR";
    }
    
    // Gunakan metode baru
    return getPredictionByNewMethod();
  }

  /* ========= FUNGSI analyzeTrendData YANG DISEDERHANAKAN ========= */
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
    
    // Simpan maksimal 50 data terbaru
    historicalData = [...results, ...historicalData].slice(0, 50);
    
    // Tampilkan info data terbaru
    if (historicalData.length >= 4) {
      const lastFour = historicalData.slice(0, 4).map(d => d.number);
      console.log(`📊 4 ANGKA TERBARU: ${lastFour.join(', ')}`);
    }
  }

  /* ========= FUNGSI PESAN ========= */
  function createMotivationMessage(lossCount) {
    switch(lossCount) {
      case 3:
        return `💪 <b>TERUS SEMANGAT!</b>\n\n` +
               `📉 Meskipun sudah kalah ${losingStreak}x berturut-turut,\n` +
               `📊 sistem switching (ORDER BARU) akan mencari rumus yang tepat.\n\n` +
               `🎯 <b>Tetap ikuti sistem switching baru: ZIGZAG→REVERSE→JUMLAH</b>\n` +
               `💰 Level: ${currentBetIndex + 1} (Rp ${currentBetAmount.toLocaleString()})\n` +
               `💪 Kesabaran adalah kunci!`;
               
      case 5:
        return `🔥 <b>PERTAHANKAN!</b>\n\n` +
               `📊 Sudah ${losingStreak} kekalahan beruntun,\n` +
               `📈 Tapi sistem switching baru tetap bekerja.\n\n` +
               `🎯 <b>Urutan switching baru: Mode ${currentPredictionMode}</b>\n` +
               `💡 Reversal biasanya terjadi setelah streak negatif panjang\n` +
               `💰 Level: ${currentBetIndex + 1} (Rp ${currentBetAmount.toLocaleString()})`;
               
      case 7:
        return `🚀 <b>HAMPIR SAMPAI!</b>\n\n` +
               `📉 ${losingStreak} kekalahan beruntun - ini jarang terjadi!\n` +
               `📊 <b>Peluang reversal sangat tinggi sekarang</b>\n\n` +
               `🎯 <b>Kami sangat menyarankan tetap mengikuti sistem baru</b>\n` +
               `💰 Level: ${currentBetIndex + 1} (Rp ${currentBetAmount.toLocaleString()})\n` +
               `💎 Kesempatan recovery besar di depan!`;
               
      default:
        return "";
    }
  }

  function createWinAfterLossMessage(consecutiveLosses) {
    return `🎉 <b>SELAMAT! KEBERHASILAN SETELAH KESABARAN</b>\n\n` +
           `✅ Anda berhasil menang setelah ${consecutiveLosses} kekalahan beruntun\n` +
           `💎 Ini membuktikan pentingnya konsistensi dan kesabaran\n\n` +
           `🏆 <b>PELAJARAN BERHARGA:</b>\n` +
           `1️⃣ Disiplin mengikuti sistem membuahkan hasil\n` +
           `2️⃣ Sabar menunggu reversal adalah kunci\n` +
           `3️⃣ Emosi harus dikendalikan meski dalam tekanan\n` +
           `4️⃣ Trust the process, trust the system\n\n` +
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
           `Untuk yang merasa terbantu & mau support keberlanjutan prediksi ini:\n\n` +
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
           `🔄 Saldo direset otomatis ke Rp 502.000\n\n` +
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
    
    // Nama mode
    const modeNames = {
      1: "JUMLAH 4 ANGKA",
      2: "REVERSE",
      3: "ZIGZAG"
    };
    
    let message = `<b>WINGO 30s SALDO AWAL 502.000</b>\n`;
    message += `<b>🆔 PERIODE ${nextIssueShort}</b>\n`;
    message += `<b>🎯 PREDIKSI B/K: ${currentPrediction} ${betLabel}</b>\n`;
    message += `<b>🎯 PREDIKSI B/K: ${currentPrediction} ${betLabel}</b>\n`;
    message += `<b>🎯 PREDIKSI B/K: ${currentPrediction} ${betLabel}</b>\n`;
    message += `━━━━━━━━━━━━━━━━━\n`;
    message += `<b>📊 LEVEL: ${currentBetIndex + 1}/${betSequence.length}</b>\n`;
    message += `<b>🧮 MODE: ${modeNames[currentPredictionMode]}</b>\n`;
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
    
    // Cek jika saldo tidak cukup untuk taruhan saat ini
    if (virtualBalance < currentBetAmount) {
      console.log("❌ Saldo tidak cukup, reset ke saldo awal...");
      const oldBalance = virtualBalance;
      
      sendResetToFirebase(oldBalance, "saldo_habis");
      
      // Reset saldo ke awal (502.000)
      virtualBalance = 502000;
      
      // Reset level ke awal
      currentBetIndex = 0;
      currentBetAmount = betSequence[0];
      
      // Reset beberapa statistik
      totalBets = 0;
      totalWins = 0;
      totalLosses = 0;
      currentStreak = 0;
      losingStreak = 0;
      profitLoss = 0;
      
      // Reset issue prediksi
      predictedIssue = null;
      predictedAt = null;
      
      // Reset mode prediksi (PERUBAHAN: Kembali ke Mode 3/ZIGZAG)
      currentPredictionMode = 3;
      lastPredictionResult = null;
      zigzagToggle = false;
      predictionHistory = [];
      
      // Kirim notifikasi ke Telegram
      const outOfBalanceMessage = createOutOfBalanceMessage();
      sendTelegram(outOfBalanceMessage);
      
      console.log(`🔄 Saldo direset ke 502.000, kembali ke Level 1, Mode 3 (ZIGZAG)`);
    }
    
    // Kurangi saldo untuk taruhan
    virtualBalance -= currentBetAmount;
    totalBets++;
    dailyStats.bets++;
    dailyStats.profit -= currentBetAmount;
    
    isBetPlaced = true;
    currentPrediction = getPrediction();
    
    // Simpan timestamp prediksi
    predictedAt = new Date();
    
    console.log(`🎯 Prediksi dibuat: ${currentPrediction} (Mode ${currentPredictionMode})`);
    
    return true;
  }

  function processResult(result, apiData) {
    if (!isBetPlaced || !isBotActive) return false;
    
    const isWin = currentPrediction === result;
    
    const issueToSave = predictedIssue || apiData.issueNumber;
    
    console.log(`🔍 PROSES HASIL DENGAN DATA API LANGSUNG:`);
    console.log(`   API Issue: ${apiData.issueNumber}`);
    console.log(`   API Number: ${apiData.number}`);
    console.log(`   API Colour: ${apiData.colour}`);
    console.log(`   Predicted Issue: ${predictedIssue}`);
    console.log(`   Result: ${result} (${isWin ? 'WIN' : 'LOSS'})`);
    console.log(`   Prediction: ${currentPrediction} (Mode ${currentPredictionMode})`);
    
    if (isWin) {
      const consecutiveLossesBeforeWin = losingStreak;
      
      virtualBalance += (currentBetAmount * 2);
      totalWins++;
      currentStreak = currentStreak > 0 ? currentStreak + 1 : 1;
      losingStreak = 0;
      lastMotivationSentAtLoss = 0;
      
      dailyStats.wins++;
      dailyStats.profit += (currentBetAmount * 2);
      
      console.log(`✅ MENANG! Prediksi ${currentPrediction} untuk issue ${apiData.issueNumber}`);
      
      const winningBetAmount = currentBetAmount;
      
      sendResultToFirebase(apiData, currentPrediction, true);
      
      // UPDATE MODE PREDIKSI
      updatePredictionMode(true);
      
      currentBetIndex = 0;
      currentBetAmount = betSequence[0];
      
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
      losingStreak++;
      
      dailyStats.losses++;
      
      console.log(`❌ KALAH! Prediksi ${currentPrediction} untuk issue ${apiData.issueNumber}`);
      console.log(`   Level sebelum: ${currentBetIndex + 1} (Rp ${currentBetAmount.toLocaleString()})`);
      
      sendResultToFirebase(apiData, currentPrediction, false);
      
      // UPDATE MODE PREDIKSI
      updatePredictionMode(false);
      
      // Naikkan level setelah kalah
      if (currentBetIndex < betSequence.length - 1) {
        currentBetIndex++;
        currentBetAmount = betSequence[currentBetIndex];
        console.log(`   Level setelah: ${currentBetIndex + 1} (Rp ${currentBetAmount.toLocaleString()})`);
      } else {
        console.log(`   ⚠️ Sudah level maksimal (${betSequence.length}), tetap di level ini`);
      }
      
      // Motivation messages
      if (losingStreak === 3 && lastMotivationSentAtLoss < 3) {
        setTimeout(() => {
          const motivationMessage = createMotivationMessage(3);
          sendTelegram(motivationMessage);
          lastMotivationSentAtLoss = 3;
        }, 500);
      } else if (losingStreak === 5 && lastMotivationSentAtLoss < 5) {
        setTimeout(() => {
          const motivationMessage = createMotivationMessage(5);
          sendTelegram(motivationMessage);
          lastMotivationSentAtLoss = 5;
        }, 500);
      } else if (losingStreak === 7 && lastMotivationSentAtLoss < 7) {
        setTimeout(() => {
          const motivationMessage = createMotivationMessage(7);
          sendTelegram(motivationMessage);
          lastMotivationSentAtLoss = 7;
        }, 500);
      }
    }
    
    profitLoss = virtualBalance - 502000;
    isBetPlaced = false;
    
    // Reset variabel prediksi setelah hasil diproses
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
      losingStreak: losingStreak,
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
      
      console.log(`\n════════════════════════════════════════`);
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
    return originalFetch.apply(this, args).then(response => {
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
    
    virtualBalance = 502000;
    currentBetIndex = 0;
    totalBets = 0;
    totalWins = 0;
    totalLosses = 0;
    currentStreak = 0;
    profitLoss = 0;
    losingStreak = 0;
    currentBetAmount = betSequence[0];
    isBetPlaced = false;
    nextIssueNumber = null;
    historicalData = [];
    lastMotivationSentAtLoss = 0;
    lastDonationMessageAtWin = 0;
    
    predictedIssue = null;
    predictedAt = null;
    
    // Reset mode prediksi (PERUBAHAN: Kembali ke Mode 3/ZIGZAG)
    currentPredictionMode = 3;
    lastPredictionResult = null;
    zigzagToggle = false;
    predictionHistory = [];
    
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
    
    console.log("🔄 Bot direset ke saldo 502.000 dan diaktifkan (Mulai dari Mode 3: ZIGZAG)");
    
    const startupMsg = `🔄 <b>BOT DIRESET DAN DIAKTIFKAN (ORDER BARU)</b>\n\n` +
                      `💰 Saldo: Rp 502.000\n` +
                      `🎯 Mulai dari Level 1 (Rp 1.000)\n` +
                      `🧮 Mode: ZIGZAG (Mode 3) → REVERSE → JUMLAH → ZIGZAG\n` +
                      `📊 Strategi: 8 Level Recovery\n\n` +
                      `<i>Bot akan berjalan otomatis tanpa henti, reset otomatis jika saldo habis</i>`;
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
🤖 WINGO SMART TRADING BOT v6.0 - NEW SYSTEM (ORDER UPDATE)
💰 Saldo awal: 502.000 (Support 8 level)
🧮 Analisis: Sistem 4 Angka dengan 3 Rumus
📊 Strategi: Martingale 8 Level Recovery
📡 Firebase: Data dikirim ke wingo-bot-analytics
🔒 ISSUE SINKRONISASI: AKTIF

🔄 ORDER SWITCHING BARU:
   Mulai dari: Mode 3 (ZIGZAG)
   Urutan: Mode 3 → Mode 2 → Mode 1 → Mode 3 → ...

📊 URUTAN TARUHAN BARU:
   1. Rp 1.000     (x1)
   2. Rp 3.000     (x3)
   3. Rp 7.000     (x7)
   4. Rp 15.000    (x15)
   5. Rp 31.000    (x31)
   6. Rp 63.000    (x63)
   7. Rp 127.000   (x127)
   8. Rp 255.000   (x255)

🧮 3 RUMUS ANALISIS (ORDER BARU):
   1. ZIGZAG → bergantian antara jumlah dan reverse
   2. REVERSE → kebalikan dari rumus jumlah
   3. JUMLAH 4 ANGKA → ambil digit terakhir

🔄 LOGIKA SWITCHING BARU:
   • Mulai dari Mode 3 (ZIGZAG)
   • Menang → tetap di rumus sama
   • Kalah → pindah ke rumus berikutnya
   • Kalah lagi → pindah ke rumus ketiga
   • Kalah lagi → kembali ke rumus pertama (ZIGZAG)

📨 Telegram Groups:
   • Primary Group: ${TELEGRAM_GROUPS.primary}
   • Secondary Groups: ${TELEGRAM_GROUPS.secondary.length > 0 ? TELEGRAM_GROUPS.secondary.join(', ') : 'Tidak ada'}
   • Multi-Group Sending: ${enableMultipleGroups ? 'AKTIF' : 'NONAKTIF'}

🔥 FITUR BARU:
   • Sistem Analisis Baru (4 angka terbaru)
   • Saldo Awal: 502.000
   • Urutan Taruhan Baru: 8 Level
   • 3 Rumus dengan ORDER SWITCHING BARU
   • Bot TIDAK PERNAH BERHENTI otomatis
   • Reset otomatis saat saldo habis

✅ Bot siap berjalan dengan ORDER SWITCHING BARU!
`);

  setupDailyTimer();
  sendStartupMotivationMessage();
  
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
      sendTelegram("✅ <b>BOT DIAKTIFKAN</b>\n\nSistem kembali beroperasi dengan saldo Rp " + virtualBalance.toLocaleString() + "\nMode: " + currentPredictionMode);
    },
    deactivate: () => {
      isBotActive = false;
      console.log("⏸️ Bot dinonaktifkan");
      sendTelegram("⏸️ <b>BOT DINONAKTIFKAN</b>\n\nSistem berhenti beroperasi");
    },
    stats: () => {
      const winRate = totalBets > 0 ? Math.round((totalWins/totalBets)*100) : 0;
      
      console.log(`
💰 Saldo: ${virtualBalance.toLocaleString()}
📊 P/L: ${profitLoss >= 0 ? '+' : ''}${profitLoss.toLocaleString()}
🎯 Bet: ${totalBets} (W:${totalWins}/L:${totalLosses})
📈 Win Rate: ${winRate}%
🔥 Streak: ${currentStreak}
📊 Level: ${currentBetIndex + 1} (Rp ${currentBetAmount.toLocaleString()})
🧮 Mode: ${currentPredictionMode} (${currentPredictionMode === 1 ? 'JUMLAH' : currentPredictionMode === 2 ? 'REVERSE' : 'ZIGZAG'})
📈 Data Historis: ${historicalData.length} periode
❌ Kalah Berturut: ${losingStreak}
📅 Hari ini: ${dailyStats.bets} bet (${dailyStats.wins}W/${dailyStats.losses}L) P/L: ${dailyStats.profit >= 0 ? '+' : ''}${dailyStats.profit.toLocaleString()}
🚦 Status: ${isBotActive ? 'AKTIF' : 'NONAKTIF'}
📅 Periode berikutnya: ${nextIssueNumber || 'Belum diketahui'}
📨 Antrian Pesan: ${messageQueue.length} pesan
🔒 Issue Prediksi: ${predictedIssue || 'Belum ada'}
⏰ Predicted At: ${predictedAt || 'Belum ada'}
      `);
    },
    history: () => {
      console.log(`📜 Data Historis (${historicalData.length} periode):`);
      historicalData.slice(0, 10).forEach((d, i) => {
        const shortIssue = getShortIssue(d.issue);
        console.log(`   ${i+1}. ${shortIssue}: ${d.number} (${d.result}) ${d.colour}`);
      });
    },
    mode: () => {
      const modeNames = {
        1: "JUMLAH 4 ANGKA",
        2: "REVERSE", 
        3: "ZIGZAG"
      };
      
      console.log(`
🧮 MODE PREDIKSI SAAT INI (ORDER BARU):
   Mode: ${currentPredictionMode} (${modeNames[currentPredictionMode]})
   Hasil Terakhir: ${lastPredictionResult || 'Belum ada'}
   Zigzag Toggle: ${zigzagToggle ? 'Rumus JUMLAH' : 'Rumus REVERSE'}
   History: ${predictionHistory.length} prediksi
   Urutan Switching: Mode 3 → 2 → 1 → 3 → ...
   
📊 4 ANGKA TERBARU: ${historicalData.length >= 4 ? 
      historicalData.slice(0,4).map(d => d.number).join(', ') : 'Data kurang'}
      `);
    },
    testCalc: () => {
      if (historicalData.length >= 4) {
        const sumResult = calculatePredictionBySum();
        const reverseResult = calculatePredictionByReverse();
        
        console.log(`
🧪 TEST PERHITUNGAN:
   Data: ${historicalData.slice(0,4).map(d => d.number).join(', ')}
   
   RUMUS 1 (JUMLAH):
      Jumlah: ${sumResult.details.sum}
      Digit Terakhir: ${sumResult.details.lastDigit}
      Prediksi: ${sumResult.prediction}
   
   RUMUS 2 (REVERSE):
      Prediksi: ${reverseResult.prediction}
      
   RUMUS 3 (ZIGZAG):
      Next akan: ${zigzagToggle ? 'REVERSE' : 'JUMLAH'}
        `);
      } else {
        console.log("❌ Data kurang dari 4");
      }
    },
    testPrediction: () => {
      console.log(`\n🧪 TEST PREDICTION SYSTEM (ORDER BARU):`);
      console.log(`1. Mode Saat Ini: ${currentPredictionMode} (${currentPredictionMode === 1 ? 'JUMLAH' : currentPredictionMode === 2 ? 'REVERSE' : 'ZIGZAG'})`);
      console.log(`2. 4 Angka Terbaru: ${historicalData.length >= 4 ? historicalData.slice(0,4).map(d => d.number).join(', ') : 'Data kurang'}`);
      console.log(`3. Final Prediction: ${getPrediction()}`);
    }
  };

  /* ========= AUTO-BET EXPOSE ========= */
  window.wingoBetData = {
    get prediction() { return currentPrediction; },
    get amount() { return currentBetAmount; },
    get level() { return currentBetIndex + 1; },
    get balance() { return virtualBalance; },
    
    get stats() {
      return {
        totalBets: totalBets,
        totalWins: totalWins,
        totalLosses: totalLosses,
        winRate: totalBets > 0 ? Math.round((totalWins / totalBets) * 100) : 0,
        profit: profitLoss,
        streak: currentStreak,
        losingStreak: losingStreak,
        predictionMode: currentPredictionMode
      };
    },
    
    update: function() {
      return this;
    },
    
    getBetInfo: function() {
      return {
        prediction: this.prediction,
        amount: this.amount,
        level: this.level,
        mode: currentPredictionMode
      };
    },
    
    get status() {
      return {
        isActive: isBotActive,
        isBetPlaced: isBetPlaced,
        nextIssue: nextIssueNumber,
        predictedIssue: predictedIssue
      };
    }
  };

  console.log("✅ Auto-bet data exposed!");
  console.log("📊 Access via: window.wingoBetData.getBetInfo()");
  console.log("📊 Access via: window.wingoBetData.stats");
  console.log("📊 Access via: window.wingoBetData.status");
})();
