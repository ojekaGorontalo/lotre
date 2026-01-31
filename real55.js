(function () {
  console.clear();
  console.log("🤖 WinGo Smart Trading Bot - Enhanced Analysis");

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
  let enableMultipleGroups = false; // Set false untuk menonaktifkan pengiriman ke grup lain
  
  // Sistem antrian pesan
  let messageQueue = [];
  let isSendingMessage = false;
  const MESSAGE_DELAY = 800;

  /* ========= FIREBASE DATABASE ========= */
  const FIREBASE_URL = "https://wingo-bot-analytics-default-rtdb.firebaseio.com/";

  /* ========= SAFETY LIMITS ========= */
  const SAFETY_LIMITS = {
    maxConsecutiveLosses: 100,      // Diubah menjadi sangat tinggi agar tidak pernah trigger
    maxDailyLoss: 1000000000,       // Diubah menjadi sangat tinggi (1M)
    minBalance: 1,                  // Diubah menjadi 1 agar tidak pernah trigger
    profitTarget: 1000000000,       // Diubah menjadi sangat tinggi (1M)
    maxBetLevel: 7
  };

  /* ========= SALDO VIRTUAL ========= */
  let virtualBalance = 2916000;  // Saldo awal untuk support semua level
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

  /* ========= STRATEGI MARTINGALE x3 ========= */
  const betSequence = [
    1000,      // Level 1: 1,000
    3000,      // Level 2: 3,000
    8000,      // Level 3: 8,000
    24000,     // Level 4: 24,000
    72000,     // Level 5: 72,000
    216000,    // Level 6: 216,000
    648000,    // Level 7: 648,000
    1944000    // Level 8: 1,944,000
  ];
  
  const betLabels = [
    "1K",
    "3K", 
    "8K",
    "24K",
    "72K",
    "216K",
    "648K",
    "1.9M"
  ];
  
  let currentBetIndex = 0;
  let lastProcessedIssue = null;
  let currentBetAmount = betSequence[0];
  let isBetPlaced = false;
  let currentPrediction = null;
  let nextIssueNumber = null;
  
  /* ========= VARIABEL ISSUE SINKRONISASI ========= */
  let predictedIssue = null; // Issue yang diprediksi dan dikirim ke Telegram
  let predictedAt = null;    // Waktu prediksi

  /* ========= VARIABEL HISTORIS ========= */
  let historicalData = [];
  let patternAnalysis = {
    kecilTrend10: 0,
    besarTrend10: 0,
    kecilTrend20: 0,
    besarTrend20: 0,
    currentStreak: { type: null, length: 0 },
    volatility: 0,
    lastPattern: null,
    averageNumber: 0,
    trendSlope: 0,
    isVolatile: false,
    isStable: false,
    colourAnalysis: { red: 0, green: 0, violet: 0 },
    last10Results: [],
    last10Numbers: []
  };

  /* ========= STREAK FOLLOWING STATS ========= */
  let streakFollowingStats = {
    totalFollows: 0,
    successfulFollows: 0,
    failedFollows: 0,
    currentStreakFollowCount: 0,
    lastStreakType: null
  };

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

  // ========= FUNGSI BARU: Simpan data lengkap dari API ke Firebase =========
  function sendResultToFirebase(apiResultData, prediction, isWin) {
    // apiResultData berisi: { issueNumber, number, colour, premium }
    const resultData = {
      issue: apiResultData.issueNumber,  // Issue langsung dari API
      predictedIssue: predictedIssue,     // Issue yang diprediksi
      actualIssue: apiResultData.issueNumber, // Issue aktual dari API (harus sama dengan di atas)
      number: parseInt(apiResultData.number), // Angka langsung dari API, di-parse jadi integer
      colour: apiResultData.colour,      // Warna dari API
      premium: apiResultData.premium,    // Premium dari API
      result: parseInt(apiResultData.number) <= 4 ? "KECIL" : "BESAR", // Hitung dari angka API
      prediction: prediction,             // Prediksi bot
      isWin: isWin,                      // Menang/kalah
      betAmount: currentBetAmount,        // Jumlah taruhan
      betLevel: currentBetIndex + 1,      // Level taruhan
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
      // Debugging data untuk verifikasi
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
    
    console.log(`📤 Mengirim ke Firebase: Issue ${apiResultData.issueNumber}, Angka ${apiResultData.number} (${resultData.result})`);
    
    // Debug: tampilkan perbandingan
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
      newBalance: 2916000,
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

  /* ========= FUNGSI RESET DATABASE HARIAN ========= */
  async function resetDailyDatabase() {
    try {
      console.log('🔄 RESET DATABASE HARIAN DIMULAI...');
      
      // 1. Hapus semua results
      console.log('🧹 Menghapus semua data results...');
      await fetch(`${FIREBASE_URL}results.json`, { method: 'DELETE' });
      
      // 2. Hapus safety_events lama (opsional)
      console.log('🧹 Menghapus safety_events lama...');
      const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      const safetyResponse = await fetch(`${FIREBASE_URL}safety_events.json?orderBy="timestamp"&endAt=${sevenDaysAgo}`);
      const safetyData = await safetyResponse.json();
      
      if (safetyData) {
        const deletePromises = [];
        for (const key in safetyData) {
          deletePromises.push(
            fetch(`${FIREBASE_URL}safety_events/${key}.json`, { method: 'DELETE' })
          );
        }
        await Promise.all(deletePromises);
      }
      
      // 3. Kirim event reset ke Firebase
      await sendToFirebase("system_events", {
        type: "daily_database_reset",
        timestamp: Date.now(),
        date: new Date().toISOString().split('T')[0],
        message: "Database harian direset - semua data results dihapus"
      });
      
      console.log('✅ RESET DATABASE HARIAN SELESAI');
      return true;
      
    } catch (error) {
      console.error('❌ Error reset database harian:', error);
      return false;
    }
  }

  /* ========= AUTO CLEANUP FUNCTIONS ========= */
  async function cleanupOldData() {
    try {
      console.log('🧹 Starting daily data cleanup...');
      
      // Hitung timestamp untuk 2 hari yang lalu
      const twoDaysAgo = Date.now() - (2 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      
      let deletedCount = 0;
      
      // 1. Cleanup old results (lebih dari 2 hari)
      try {
        const resultsResponse = await fetch(`${FIREBASE_URL}results.json?orderBy="timestamp"&endAt=${twoDaysAgo}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          }
        });
        
        const resultsData = await resultsResponse.json();
        if (resultsData) {
          const deletePromises = [];
          for (const key in resultsData) {
            deletePromises.push(
              fetch(`${FIREBASE_URL}results/${key}.json`, {
                method: 'DELETE'
              }).catch(err => {
                console.error(`Error deleting result ${key}:`, err);
              })
            );
          }
          
          await Promise.all(deletePromises);
          deletedCount += Object.keys(resultsData).length;
          console.log(`🧹 Deleted ${Object.keys(resultsData).length} old results`);
        }
      } catch (error) {
        console.error('❌ Error cleaning up results:', error);
      }
      
      // 2. Cleanup old safety events (lebih dari 7 hari)
      try {
        const safetyResponse = await fetch(`${FIREBASE_URL}safety_events.json?orderBy="timestamp"&endAt=${sevenDaysAgo}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          }
        });
        
        const safetyData = await safetyResponse.json();
        if (safetyData) {
          const deletePromises = [];
          for (const key in safetyData) {
            deletePromises.push(
              fetch(`${FIREBASE_URL}safety_events/${key}.json`, {
                method: 'DELETE'
              }).catch(err => {
                console.error(`Error deleting safety event ${key}:`, err);
              })
            );
          }
          
          await Promise.all(deletePromises);
          deletedCount += Object.keys(safetyData).length;
          console.log(`🧹 Deleted ${Object.keys(safetyData).length} old safety events`);
        }
      } catch (error) {
        console.error('❌ Error cleaning up safety events:', error);
      }
      
      // 3. Cleanup old balance changes (lebih dari 7 hari)
      try {
        const balanceResponse = await fetch(`${FIREBASE_URL}balance_changes.json?orderBy="timestamp"&endAt=${sevenDaysAgo}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          }
        });
        
        const balanceData = await balanceResponse.json();
        if (balanceData) {
          const deletePromises = [];
          for (const key in balanceData) {
            deletePromises.push(
              fetch(`${FIREBASE_URL}balance_changes/${key}.json`, {
                method: 'DELETE'
              }).catch(err => {
                console.error(`Error deleting balance change ${key}:`, err);
              })
            );
          }
          
          await Promise.all(deletePromises);
          deletedCount += Object.keys(balanceData).length;
          console.log(`🧹 Deleted ${Object.keys(balanceData).length} old balance changes`);
        }
      } catch (error) {
        console.error('❌ Error cleaning up balance changes:', error);
      }
      
      // 4. Cleanup old test data
      try {
        const testResponse = await fetch(`${FIREBASE_URL}test.json?orderBy="timestamp"&endAt=${sevenDaysAgo}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          }
        });
        
        const testData = await testResponse.json();
        if (testData) {
          const deletePromises = [];
          for (const key in testData) {
            deletePromises.push(
              fetch(`${FIREBASE_URL}test/${key}.json`, {
                method: 'DELETE'
              }).catch(err => {
                console.error(`Error deleting test data ${key}:`, err);
              })
            );
          }
          
          await Promise.all(deletePromises);
          deletedCount += Object.keys(testData).length;
          console.log(`🧹 Deleted ${Object.keys(testData).length} old test data`);
        }
      } catch (error) {
        console.error('❌ Error cleaning up test data:', error);
      }
      
      // Kirim event cleanup ke Firebase
      sendToFirebase("system_events", {
        type: "daily_cleanup_completed",
        timestamp: Date.now(),
        deletedCount: deletedCount,
        date: new Date().toISOString().split('T')[0],
        message: `Daily cleanup completed. Deleted ${deletedCount} old records.`
      });
      
      console.log(`✅ Cleanup completed. Total deleted: ${deletedCount} records`);
      
    } catch (error) {
      console.error('❌ General cleanup error:', error);
      
      // Kirim error event ke Firebase
      sendToFirebase("system_events", {
        type: "cleanup_error",
        timestamp: Date.now(),
        error: error.message,
        date: new Date().toISOString().split('T')[0],
        message: "Error during daily cleanup"
      });
    }
  }

  /* ========= TELEGRAM FUNCTIONS ========= */
  function sendTelegram(msg) {
    // Selalu kirim ke grup utama
    sendToGroup(msg, TELEGRAM_GROUPS.primary);
    
    // Kirim ke grup lain hanya jika diaktifkan
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
    const startupMessage = `🤖 <b>WINGO SMART TRADING BOT v4.0</b>\n\n` +
                          `Saya adalah bot yang dibuat untuk memprediksi pola serta mendeteksi dragon sesuai pola, namun ini saya tidak bisa menjamin 100% menang karena ini adalah permainan.\n\n` +
                          `📊 <b>FITUR BOT:</b>\n` +
                          `• Analisis AI Multi-Faktor\n` +
                          `• Deteksi Streak & Pola Dragon\n` +
                          `• Martingale x3 (8 Level Recovery)\n` +
                          `• Auto Reset saat Saldo Habis\n` +
                          `• Laporan Harian Otomatis\n` +
                          `• Database Reset Harian\n\n` +
                          `⚠️ <b>PERINGATAN RESIKO:</b>\n` +
                          `• Trading memiliki resiko kerugian\n` +
                          `• Gunakan modal yang siap hilang\n` +
                          `• Disiplin dalam money management\n` +
                          `• Jangan gunakan emosi saat trading\n` +
                          `• Prediksi tidak 100% akurat\n\n` +
                          `📈 <b>STATISTIK AWAL:</b>\n` +
                          `• Saldo Awal: Rp 2.916.000\n` +
                          `• Level Maksimal: 8\n` +
                          `• Strategi: Martingale x3\n` +
                          `• Target: Konsistensi jangka panjang\n\n` +
                          `🔧 <b>FITUR BARU:</b>\n` +
                          `• Database direset setiap hari pukul 23:59\n` +
                          `• Data harian dimulai dari fresh\n` +
                          `• Auto-cleanup data lama otomatis\n\n` +
                          `🤝 <b>SEMOGA BERUNTUNG & TETAP DISIPLIN!</b>`;
    
    sendTelegram(startupMessage);
  }

  /* ========= SAFETY CHECK FUNCTIONS ========= */
  function checkSafetyLimits() {
    const todayProfit = dailyStats.profit;
    
    // 1. Cek streak kalah (hanya log, tidak berhenti)
    if (losingStreak >= SAFETY_LIMITS.maxConsecutiveLosses) {
      console.log(`⚠️ SAFETY LOG: ${losingStreak} consecutive losses (bot tetap berjalan)`);
      sendSafetyEventToFirebase("high_losing_streak", {
        consecutiveLosses: losingStreak,
        maxAllowed: SAFETY_LIMITS.maxConsecutiveLosses
      });
    }
    
    // 2. Cek kerugian harian (hanya log, tidak berhenti)
    if (todayProfit <= -SAFETY_LIMITS.maxDailyLoss) {
      console.log(`⚠️ SAFETY LOG: Daily loss ${Math.abs(todayProfit).toLocaleString()} (bot tetap berjalan)`);
      sendSafetyEventToFirebase("high_daily_loss", {
        dailyLoss: todayProfit,
        maxAllowed: SAFETY_LIMITS.maxDailyLoss
      });
    }
    
    // 3. Cek saldo minimum (hanya log, tidak berhenti)
    if (virtualBalance < SAFETY_LIMITS.minBalance) {
      console.log(`⚠️ SAFETY LOG: Low balance ${virtualBalance.toLocaleString()} (bot tetap berjalan)`);
      sendSafetyEventToFirebase("low_balance", {
        balance: virtualBalance,
        minAllowed: SAFETY_LIMITS.minBalance
      });
    }
    
    // 4. Cek profit target (hanya log, tidak berhenti)
    if (todayProfit >= SAFETY_LIMITS.profitTarget) {
      console.log(`🎯 PROFIT TARGET REACHED: +${todayProfit.toLocaleString()} (bot tetap berjalan)`);
      sendSafetyEventToFirebase("profit_target_reached", {
        profit: todayProfit,
        target: SAFETY_LIMITS.profitTarget
      });
    }
    
    // Selalu return true agar bot tidak pernah berhenti
    return true;
  }

  /* ========= ANALISIS STREAK CERDAS ========= */
  function analyzeStreakIntelligence() {
    if (historicalData.length < 15) return null;
    
    const last15 = historicalData.slice(0, 15);
    const streaks = [];
    let currentStreak = { type: last15[0].result, length: 1, startIndex: 0 };
    
    // Analisis semua streak dalam 15 data terakhir
    for (let i = 1; i < last15.length; i++) {
      if (last15[i].result === currentStreak.type) {
        currentStreak.length++;
      } else {
        streaks.push({ ...currentStreak });
        currentStreak = { type: last15[i].result, length: 1, startIndex: i };
      }
    }
    streaks.push({ ...currentStreak });
    
    // Analisis pola streak
    const streakAnalysis = {
      currentStreak: streaks[0],
      allStreaks: streaks,
      avgStreakLength: streaks.reduce((sum, s) => sum + s.length, 0) / streaks.length,
      maxStreakLength: Math.max(...streaks.map(s => s.length)),
      streakHistory: streaks.map(s => `${s.length}x ${s.type}`),
      
      shouldFollowStreak: function() {
        const current = this.currentStreak;
        
        // Rule 1: Jangan ikut streak pendek (< 3x)
        if (current.length < 3) return false;
        
        // Rule 2: Streak panjang (> 6x) lebih mungkin putus
        if (current.length > 6) return false;
        
        // Rule 3: Lihat rata-rata streak sebelumnya
        if (current.length > this.avgStreakLength * 1.5) {
          console.log(`⚠️ Streak ${current.length}x sudah ${Math.round(current.length/this.avgStreakLength)}x di atas rata-rata`);
          return false;
        }
        
        // Rule 4: Jika streak terlalu "sempurna" (angka konsisten)
        const streakNumbers = historicalData
          .slice(0, current.length)
          .map(d => d.number);
        const numberVariance = Math.max(...streakNumbers) - Math.min(...streakNumbers);
        
        if (numberVariance < 2 && current.length >= 4) {
          console.log(`🎯 Streak terlalu sempurna (variance: ${numberVariance}), berhati-hati`);
          return Math.random() > 0.3; 
        }
        
        // Rule 5: Confidence based on streak position
        const confidence = Math.min(70, 40 + (current.length * 5));
        return Math.random() * 100 < confidence;
      },
      
      predictStreakBreak: function() {
        const current = this.currentStreak;
        if (current.length < 3) return null;
        
        const breakProbability = Math.min(95, 30 + (current.length * 10));
        
        return {
          probability: breakProbability,
          suggestedAction: breakProbability > 70 ? "PREPARE_FOR_BREAK" : "CONTINUE",
          maxFollow: Math.max(2, 7 - current.length)
        };
      }
    };
    
    return streakAnalysis;
  }

  function getAdaptiveStreakPrediction() {
    const streakIntel = analyzeStreakIntelligence();
    if (!streakIntel) return null;
    
    const currentStreak = streakIntel.currentStreak;
    const breakPrediction = streakIntel.predictStreakBreak();
    
    console.log(`🧠 STREAK INTELLIGENCE:`);
    console.log(`   Current: ${currentStreak.length}x ${currentStreak.type}`);
    console.log(`   Avg Streak: ${streakIntel.avgStreakLength.toFixed(1)}x`);
    console.log(`   Max Historical: ${streakIntel.maxStreakLength}x`);
    console.log(`   Break Probability: ${breakPrediction?.probability || 0}%`);
    
    if (!streakIntel.shouldFollowStreak()) {
      console.log(`   ❌ Decision: NOT following streak`);
      
      if (breakPrediction?.probability > 60) {
        const opposite = currentStreak.type === "KECIL" ? "BESAR" : "KECIL";
        console.log(`   🔄 High break prob (${breakPrediction.probability}%): Predicting ${opposite}`);
        return {
          prediction: opposite,
          confidence: breakPrediction.probability,
          reason: `Streak break anticipation (${currentStreak.length}x ${currentStreak.type})`
        };
      }
      
      return null;
    }
    
    console.log(`   ✅ Decision: Following streak (${currentStreak.length}x ${currentStreak.type})`);
    
    let confidence = 60;
    if (currentStreak.length === 3) confidence = 65;
    if (currentStreak.length === 4) confidence = 70;
    if (currentStreak.length === 5) confidence = 60;
    if (currentStreak.length === 6) confidence = 50;
    
    return {
      prediction: currentStreak.type,
      confidence: confidence,
      reason: `Following ${currentStreak.length}x streak`,
      maxFollow: breakPrediction?.maxFollow || 1
    };
  }

  function updateStreakBetting(prediction, actualResult) {
    const streakIntel = analyzeStreakIntelligence();
    if (!streakIntel) return;
    
    const currentStreak = streakIntel.currentStreak;
    const isFollowingStreak = prediction === currentStreak.type && currentStreak.length >= 3;
    
    if (isFollowingStreak) {
      streakFollowingStats.totalFollows++;
      streakFollowingStats.currentStreakFollowCount++;
      
      if (prediction === actualResult) {
        streakFollowingStats.successfulFollows++;
        console.log(`✅ Streak follow SUCCESS (${streakFollowingStats.successfulFollows}/${streakFollowingStats.totalFollows})`);
        
        if (streakFollowingStats.currentStreakFollowCount >= 2) {
          console.log(`⚠️ Already followed this streak ${streakFollowingStats.currentStreakFollowCount}x, consider stopping`);
        }
      } else {
        streakFollowingStats.failedFollows++;
        console.log(`❌ Streak follow FAILED (streak broken)`);
        streakFollowingStats.currentStreakFollowCount = 0;
      }
    } else {
      streakFollowingStats.currentStreakFollowCount = 0;
    }
    
    streakFollowingStats.lastStreakType = currentStreak.type;
    
    if (streakFollowingStats.totalFollows > 0) {
      const successRate = Math.round(
        (streakFollowingStats.successfulFollows / streakFollowingStats.totalFollows) * 100
      );
      console.log(`📊 Streak Following Stats: ${successRate}% (${streakFollowingStats.successfulFollows}/${streakFollowingStats.totalFollows})`);
    }
  }

  function getAntiFallacyPrediction() {
    if (historicalData.length < 10) return null;
    
    const streakIntel = analyzeStreakIntelligence();
    if (!streakIntel) return null;
    
    const currentStreak = streakIntel.currentStreak;
    let continueProbability = Math.max(10, 50 - (currentStreak.length * 8));
    
    const similarBrokenStreaks = streakIntel.allStreaks
      .filter(s => s.type === currentStreak.type && s.length === currentStreak.length)
      .length;
    
    if (similarBrokenStreaks > 1) {
      console.log(`⚠️ ${similarBrokenStreaks} similar ${currentStreak.length}x ${currentStreak.type} streaks broken before`);
      continueProbability -= 15;
    }
    
    const recentBreaks = historicalData.slice(0, 20).filter((d, i, arr) => {
      if (i < 2) return false;
      return d.result !== arr[i-1].result && 
             arr[i-1].result === arr[i-2].result &&
             arr[i-1].result === currentStreak.type;
    }).length;
    
    if (recentBreaks > 0) {
      console.log(`🔄 ${recentBreaks} recent breaks of ${currentStreak.type} streaks detected`);
      continueProbability -= 10;
    }
    
    const shouldContinue = Math.random() * 100 < continueProbability;
    
    console.log(`🧮 ANTI-FALLACY SYSTEM:`);
    console.log(`   Streak: ${currentStreak.length}x ${currentStreak.type}`);
    console.log(`   Continue Probability: ${continueProbability}%`);
    console.log(`   Decision: ${shouldContinue ? 'FOLLOW' : 'BREAK'}`);
    
    if (!shouldContinue) {
      return currentStreak.type === "KECIL" ? "BESAR" : "KECIL";
    }
    
    return null;
  }

  /* ========= SISTEM ANALISIS MULTI-LEVEL ========= */
  function analyzeAdvancedTrends() {
    if (historicalData.length < 8) return null;
    
    const last20 = historicalData.slice(0, 20);
    const last15 = historicalData.slice(0, 15);
    const last10 = historicalData.slice(0, 10);
    const last5 = historicalData.slice(0, 5);
    
    // 1. ANALISIS STREAK DETAILED
    const streakAnalysis = {
      currentType: last10[0]?.result || null,
      currentLength: 1,
      maxStreak: { type: null, length: 0 },
      recentPatterns: []
    };
    
    for (let i = 1; i < last10.length; i++) {
      if (last10[i]?.result === streakAnalysis.currentType) {
        streakAnalysis.currentLength++;
      } else {
        break;
      }
    }
    
    let currentStreakCount = 1;
    let currentStreakType = last20[0]?.result;
    for (let i = 1; i < last20.length; i++) {
      if (last20[i]?.result === currentStreakType) {
        currentStreakCount++;
      } else {
        if (currentStreakCount > streakAnalysis.maxStreak.length) {
          streakAnalysis.maxStreak = {
            type: currentStreakType,
            length: currentStreakCount
          };
        }
        currentStreakType = last20[i]?.result;
        currentStreakCount = 1;
      }
    }
    
    // 2. ANALISIS VOLATILITAS DETAILED
    let changes5 = 0;
    let changes10 = 0;
    let changes15 = 0;
    
    for (let i = 1; i < last5.length; i++) {
      if (last5[i]?.result !== last5[i-1]?.result) changes5++;
    }
    for (let i = 1; i < last10.length; i++) {
      if (last10[i]?.result !== last10[i-1]?.result) changes10++;
    }
    for (let i = 1; i < last15.length; i++) {
      if (last15[i]?.result !== last15[i-1]?.result) changes15++;
    }
    
    const volatilityAnalysis = {
      shortTerm: last5.length > 1 ? changes5 / (last5.length - 1) : 0,
      mediumTerm: last10.length > 1 ? changes10 / (last10.length - 1) : 0,
      longTerm: last15.length > 1 ? changes15 / (last15.length - 1) : 0,
      isHighVolatility: changes10 / 9 > 0.7,
      isLowVolatility: changes10 / 9 < 0.3,
      isIncreasingVolatility: (changes10 / 9) > (changes15 / 14)
    };
    
    // 3. ANALISIS ANGKA DETAILED
    const numbersLast10 = last10.map(d => d.number);
    const numbersLast5 = last5.map(d => d.number);
    
    const numberAnalysis = {
      avg10: numbersLast10.reduce((a,b) => a + b, 0) / numbersLast10.length,
      avg5: numbersLast5.reduce((a,b) => a + b, 0) / numbersLast5.length,
      min10: Math.min(...numbersLast10),
      max10: Math.max(...numbersLast10),
      median10: numbersLast10.sort((a,b) => a-b)[Math.floor(numbersLast10.length/2)],
      isAscending: numbersLast5[0] < numbersLast5[numbersLast5.length-1],
      isDescending: numbersLast5[0] > numbersLast5[numbersLast5.length-1],
      range: Math.max(...numbersLast10) - Math.min(...numbersLast10)
    };
    
    // 4. ANALISIS POLA BERULANG
    const patterns = [];
    for (let i = 0; i < last10.length - 2; i++) {
      const pattern = `${last10[i]?.result}-${last10[i+1]?.result}-${last10[i+2]?.result}`;
      patterns.push(pattern);
    }
    
    const patternFrequency = {};
    patterns.forEach(p => {
      patternFrequency[p] = (patternFrequency[p] || 0) + 1;
    });
    
    const commonPatterns = Object.entries(patternFrequency)
      .sort((a,b) => b[1] - a[1])
      .slice(0, 3);
    
    // 5. ANALISIS WARNA ENHANCED
    const colourAnalysis = {
      red: { count: 0, lastSeen: 0, streak: 0 },
      green: { count: 0, lastSeen: 0, streak: 0 },
      violet: { count: 0, lastSeen: 0, streak: 0 }
    };
    
    let currentColourStreak = 1;
    
    for (let i = 0; i < last10.length; i++) {
      const colour = last10[i]?.colour || '';
      
      if (colour.includes('red')) colourAnalysis.red.count++;
      if (colour.includes('green')) colourAnalysis.green.count++;
      if (colour.includes('violet')) colourAnalysis.violet.count++;
      
      if (i > 0) {
        if (colour === last10[i-1]?.colour) {
          currentColourStreak++;
          if (colour.includes('red') && currentColourStreak > colourAnalysis.red.streak) {
            colourAnalysis.red.streak = currentColourStreak;
          }
          if (colour.includes('green') && currentColourStreak > colourAnalysis.green.streak) {
            colourAnalysis.green.streak = currentColourStreak;
          }
          if (colour.includes('violet') && currentColourStreak > colourAnalysis.violet.streak) {
            colourAnalysis.violet.streak = currentColourStreak;
          }
        } else {
          currentColourStreak = 1;
        }
      }
    }
    
    // 6. ANALISIS TIMING
    const timingAnalysis = {
      timeSinceLastKecil: 0,
      timeSinceLastBesar: 0,
      kecilFrequency: last10.filter(d => d.result === "KECIL").length / 10,
      besarFrequency: last10.filter(d => d.result === "BESAR").length / 10
    };
    
    for (let i = 0; i < last10.length; i++) {
      if (last10[i]?.result === "KECIL") {
        timingAnalysis.timeSinceLastKecil = i;
        break;
      }
    }
    
    for (let i = 0; i < last10.length; i++) {
      if (last10[i]?.result === "BESAR") {
        timingAnalysis.timeSinceLastBesar = i;
        break;
      }
    }
    
    return {
      streak: streakAnalysis,
      volatility: volatilityAnalysis,
      numbers: numberAnalysis,
      patterns: {
        mostCommon: commonPatterns,
        currentPattern: patterns[0] || null,
        patternCount: patterns.length
      },
      colours: colourAnalysis,
      timing: timingAnalysis,
      confidence: calculateConfidenceScore(
        streakAnalysis,
        volatilityAnalysis,
        numberAnalysis,
        timingAnalysis
      )
    };
  }

  function calculateConfidenceScore(streak, volatility, numbers, timing) {
    let score = 50;
    
    if (streak.currentLength >= 4) {
      score += 20;
      console.log(`🔥 CONFIDENCE +20 (Streak ${streak.currentLength}x ${streak.currentType})`);
    } else if (streak.currentLength >= 2) {
      score += 10;
    }
    
    if (volatility.isLowVolatility) {
      score += 15;
      console.log(`🎯 CONFIDENCE +15 (Low Volatility)`);
    } else if (volatility.isHighVolatility) {
      score -= 10;
      console.log(`⚠️ CONFIDENCE -10 (High Volatility)`);
    }
    
    if (numbers.range < 5) {
      score += 10;
      console.log(`📊 CONFIDENCE +10 (Narrow Range: ${numbers.range})`);
    }
    
    if (numbers.isAscending || numbers.isDescending) {
      score += 5;
      console.log(`📈 CONFIDENCE +5 (Clear ${numbers.isAscending ? 'Ascending' : 'Descending'} Trend)`);
    }
    
    if (timing.kecilFrequency > 0.7) {
      score += 10;
      console.log(`🎯 CONFIDENCE +10 (KECIL Bias: ${(timing.kecilFrequency*100).toFixed(0)}%)`);
    } else if (timing.besarFrequency > 0.7) {
      score += 10;
      console.log(`🎯 CONFIDENCE +10 (BESAR Bias: ${(timing.besarFrequency*100).toFixed(0)}%)`);
    }
    
    if (timing.timeSinceLastKecil >= 5) {
      score += 15;
      console.log(`🔄 CONFIDENCE +15 (Due for KECIL - Last seen ${timing.timeSinceLastKecil} periods ago)`);
    } else if (timing.timeSinceLastBesar >= 5) {
      score += 15;
      console.log(`🔄 CONFIDENCE +15 (Due for BESAR - Last seen ${timing.timeSinceLastBesar} periods ago)`);
    }
    
    return Math.min(Math.max(score, 0), 100);
  }

  /* ========= SISTEM PREDIKSI AI ========= */
  function getAIPrediction() {
    if (historicalData.length < 10) {
      return getTrendBasedPrediction();
    }
    
    const analysis = analyzeAdvancedTrends();
    if (!analysis) return getTrendBasedPrediction();
    
    console.log(`\n🧠 AI ANALYSIS START`);
    console.log(`   Confidence: ${analysis.confidence}%`);
    console.log(`   Streak: ${analysis.streak.currentLength}x ${analysis.streak.currentType}`);
    console.log(`   Volatility: ${(analysis.volatility.mediumTerm*100).toFixed(0)}%`);
    console.log(`   Number Range: ${analysis.numbers.min10}-${analysis.numbers.max10}`);
    console.log(`   Pattern: ${analysis.patterns.currentPattern || 'None'}`);
    
    const factors = [];
    
    // FACTOR 1: STRONG STREAK FOLLOW
    if (analysis.streak.currentLength >= 4) {
      console.log(`   🐉 STRONG STREAK DETECTED: Following streak`);
      factors.push({
        prediction: analysis.streak.currentType,
        weight: 40 + (analysis.streak.currentLength * 5),
        reason: `Streak ${analysis.streak.currentLength}x ${analysis.streak.currentType}`
      });
    }
    
    // FACTOR 2: MEAN REVERSION
    const kecilRatio = historicalData.slice(0, 10).filter(d => d.result === "KECIL").length / 10;
    const besarRatio = historicalData.slice(0, 10).filter(d => d.result === "BESAR").length / 10;
    
    if (kecilRatio > 0.7) {
      console.log(`   📉 MEAN REVERSION: KECIL dominance → predicting BESAR`);
      factors.push({
        prediction: "BESAR",
        weight: 35,
        reason: `Mean reversion from ${(kecilRatio*100).toFixed(0)}% KECIL`
      });
    } else if (besarRatio > 0.7) {
      console.log(`   📉 MEAN REVERSION: BESAR dominance → predicting KECIL`);
      factors.push({
        prediction: "KECIL",
        weight: 35,
        reason: `Mean reversion from ${(besarRatio*100).toFixed(0)}% BESAR`
      });
    }
    
    // FACTOR 3: VOLATILITY PATTERN
    if (analysis.volatility.isHighVolatility) {
      const lastResult = historicalData[0].result;
      const opposite = lastResult === "KECIL" ? "BESAR" : "KECIL";
      console.log(`   🌀 HIGH VOLATILITY: Predicting opposite of last result`);
      factors.push({
        prediction: opposite,
        weight: 25,
        reason: `High volatility pattern (${(analysis.volatility.mediumTerm*100).toFixed(0)}% changes)`
      });
    } else if (analysis.volatility.isLowVolatility && analysis.streak.currentLength >= 2) {
      console.log(`   🛑 LOW VOLATILITY: Continuing streak`);
      factors.push({
        prediction: analysis.streak.currentType,
        weight: 25,
        reason: `Low volatility with existing streak`
      });
    }
    
    // FACTOR 4: NUMBER TREND ANALYSIS
    if (analysis.numbers.avg5 < 2.5) {
      console.log(`   📊 LOW NUMBER TREND: Predicting BESAR`);
      factors.push({
        prediction: "BESAR",
        weight: 20,
        reason: `Low number trend (avg: ${analysis.numbers.avg5.toFixed(1)})`
      });
    } else if (analysis.numbers.avg5 > 6.5) {
      console.log(`   📊 HIGH NUMBER TREND: Predicting KECIL`);
      factors.push({
        prediction: "KECIL",
        weight: 20,
        reason: `High number trend (avg: ${analysis.numbers.avg5.toFixed(1)})`
      });
    }
    
    // FACTOR 5: PATTERN MATCHING
    const commonPatterns = {
      "KECIL-KECIL-KECIL": "BESAR",
      "BESAR-BESAR-BESAR": "KECIL",
      "KECIL-BESAR-KECIL": "BESAR",
      "BESAR-KECIL-BESAR": "KECIL",
      "KECIL-KECIL-BESAR": "KECIL",
      "BESAR-BESAR-KECIL": "BESAR",
      "KECIL-BESAR-BESAR": "KECIL",
      "BESAR-KECIL-KECIL": "BESAR"
    };
    
    if (analysis.patterns.currentPattern && commonPatterns[analysis.patterns.currentPattern]) {
      console.log(`   🔄 PATTERN RECOGNITION: ${analysis.patterns.currentPattern} → ${commonPatterns[analysis.patterns.currentPattern]}`);
      factors.push({
        prediction: commonPatterns[analysis.patterns.currentPattern],
        weight: 15,
        reason: `Pattern match: ${analysis.patterns.currentPattern}`
      });
    }
    
    // FACTOR 6: TIME-BASED REVERSION
    if (analysis.timing.timeSinceLastKecil >= 5) {
      console.log(`   ⏰ TIME REVERSION: Due for KECIL (${analysis.timing.timeSinceLastKecil} periods)`);
      factors.push({
        prediction: "KECIL",
        weight: 10 + (analysis.timing.timeSinceLastKecil * 2),
        reason: `KECIL not seen for ${analysis.timing.timeSinceLastKecil} periods`
      });
    } else if (analysis.timing.timeSinceLastBesar >= 5) {
      console.log(`   ⏰ TIME REVERSION: Due for BESAR (${analysis.timing.timeSinceLastBesar} periods)`);
      factors.push({
        prediction: "BESAR",
        weight: 10 + (analysis.timing.timeSinceLastBesar * 2),
        reason: `BESAR not seen for ${analysis.timing.timeSinceLastBesar} periods`
      });
    }
    
    // FACTOR 7: SMART STREAK MANAGEMENT
    const adaptiveStreakPred = getAdaptiveStreakPrediction();
    const antiFallacyPred = getAntiFallacyPrediction();
    
    if (adaptiveStreakPred && antiFallacyPred) {
      console.log(`   ⚔️ STREAK CONFLICT: Adaptive says ${adaptiveStreakPred.prediction}, Anti-Fallacy says ${antiFallacyPred}`);
      
      if (adaptiveStreakPred.confidence > 65) {
        console.log(`   🤖 Choosing adaptive streak (confidence: ${adaptiveStreakPred.confidence}%)`);
        factors.push({
          prediction: adaptiveStreakPred.prediction,
          weight: 25,
          reason: `Smart streak following (${adaptiveStreakPred.reason})`
        });
      } else {
        console.log(`   🤖 Choosing anti-fallacy (streak confidence low)`);
        factors.push({
          prediction: antiFallacyPred,
          weight: 20,
          reason: `Anti-gambler's fallacy correction`
        });
      }
    } else if (adaptiveStreakPred) {
      console.log(`   🐉 SMART STREAK: Following ${adaptiveStreakPred.prediction} (${adaptiveStreakPred.confidence}% conf)`);
      factors.push({
        prediction: adaptiveStreakPred.prediction,
        weight: Math.min(25, adaptiveStreakPred.confidence),
        reason: adaptiveStreakPred.reason
      });
    } else if (antiFallacyPred) {
      console.log(`   🚫 ANTI-FALLACY: Predicting ${antiFallacyPred}`);
      factors.push({
        prediction: antiFallacyPred,
        weight: 20,
        reason: `Avoiding gambler's fallacy`
      });
    }
    
    // FACTOR 8: CONFIDENCE-BASED RANDOMIZATION
    const randomFactor = Math.random() * 100;
    if (randomFactor > analysis.confidence) {
      const randomPrediction = Math.random() > 0.5 ? "KECIL" : "BESAR";
      console.log(`   🎲 LOW CONFIDENCE: Adding randomness (${randomPrediction})`);
      factors.push({
        prediction: randomPrediction,
        weight: 10,
        reason: `Low confidence injection`
      });
    }
    
    if (factors.length === 0) {
      return getTrendBasedPrediction();
    }
    
    const scores = { KECIL: 0, BESAR: 0 };
    let totalWeight = 0;
    
    factors.forEach(f => {
      scores[f.prediction] += f.weight;
      totalWeight += f.weight;
    });
    
    console.log(`   ⚖️ FINAL VOTING: KECIL ${scores.KECIL.toFixed(0)} (${((scores.KECIL/totalWeight)*100).toFixed(0)}%) vs BESAR ${scores.BESAR.toFixed(0)} (${((scores.BESAR/totalWeight)*100).toFixed(0)}%)`);
    
    if (scores.KECIL === scores.BESAR) {
      return getTrendBasedPrediction();
    }
    
    const finalPrediction = scores.KECIL > scores.BESAR ? "KECIL" : "BESAR";
    const confidencePercent = ((Math.max(scores.KECIL, scores.BESAR) / totalWeight) * 100).toFixed(0);
    
    console.log(`   🎯 FINAL PREDICTION: ${finalPrediction} (${confidencePercent}% confidence)`);
    
    return finalPrediction;
  }

  function getTrendBasedPrediction() {
    if (historicalData.length < 10) {
      if (historicalData.length > 0) {
        const last = historicalData[0];
        return last.result === "KECIL" ? "BESAR" : "KECIL";
      }
      return Math.random() > 0.5 ? "KECIL" : "BESAR";
    }
    
    const analysis = patternAnalysis;
    const lastResult = historicalData[0].result;
    
    // MODIFIED STREAK FOLLOWING
    if (analysis.currentStreak.length >= 4) {
      console.log(`🐉 DETEKSI NAGA: Streak ${analysis.currentStreak.length}x ${analysis.currentStreak.type}`);
      
      const streakContinueProbability = Math.max(30, 70 - (analysis.currentStreak.length * 5));
      
      if (Math.random() * 100 < streakContinueProbability) {
        console.log(`   ✅ Following streak (${streakContinueProbability}% confidence)`);
        return analysis.currentStreak.type;
      } else {
        console.log(`   ⚠️ Streak ${analysis.currentStreak.length}x too long, predicting opposite`);
        return analysis.currentStreak.type === "KECIL" ? "BESAR" : "KECIL";
      }
    }
    
    if (analysis.volatility > 0.75) {
      console.log(`🌀 VOLATILITAS TINGGI (${(analysis.volatility*100).toFixed(0)}%): Prediksi kebalikan`);
      return lastResult === "KECIL" ? "BESAR" : "KECIL";
    }
    
    if (analysis.volatility < 0.25 && analysis.currentStreak.length >= 2) {
      console.log(`🛑 VOLATILITAS RENDAH (${(analysis.volatility*100).toFixed(0)}%): Lanjutkan streak`);
      return lastResult;
    }
    
    if (analysis.kecilTrend10 > 0.65) {
      console.log(`📉 MEAN REVERSION: KECIL ${(analysis.kecilTrend10*100).toFixed(0)}% → BESAR`);
      return "BESAR";
    }
    if (analysis.besarTrend10 > 0.65) {
      console.log(`📉 MEAN REVERSION: BESAR ${(analysis.besarTrend10*100).toFixed(0)}% → KECIL`);
      return "KECIL";
    }
    
    const chartAnalysis = createSimpleChart();
    if (chartAnalysis) {
      const trendStrength = Math.abs(analysis.trendSlope);
      if (trendStrength > 0.3) {
        console.log(`📈 TREND KUAT (${analysis.trendSlope > 0 ? 'Naik' : 'Turun'}): Mengikuti chart`);
        return chartAnalysis.prediction;
      }
    }
    
    const randomFactor = Math.random();
    if (analysis.kecilTrend10 > 0.55 && randomFactor < 0.7) {
      return "BESAR";
    } else if (analysis.besarTrend10 > 0.55 && randomFactor < 0.7) {
      return "KECIL";
    } else {
      return lastResult === "KECIL" ? "BESAR" : "KECIL";
    }
  }

  function createSimpleChart() {
    if (historicalData.length < 10) return null;
    
    const chartData = historicalData.slice(0, 15).map((d, i) => ({
      x: i,
      y: d.number,
      type: d.result
    }));
    
    const n = chartData.length;
    const sumX = chartData.reduce((sum, d) => sum + d.x, 0);
    const sumY = chartData.reduce((sum, d) => sum + d.y, 0);
    const sumXY = chartData.reduce((sum, d) => sum + (d.x * d.y), 0);
    const sumX2 = chartData.reduce((sum, d) => sum + (d.x * d.x), 0);
    
    const m = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const b = (sumY - m * sumX) / n;
    const nextY = m * n + b;
    
    return {
      prediction: nextY <= 4.5 ? "KECIL" : "BESAR",
      predictedNumber: nextY,
      trendDirection: m > 0 ? "UP" : "DOWN"
    };
  }

  function getPrediction() {
    if (historicalData.length >= 10) {
      return getAIPrediction();
    }
    
    if (historicalData.length >= 5) {
      return getTrendBasedPrediction();
    }
    
    if (historicalData.length > 0) {
      const last = historicalData[0];
      return last.result === "KECIL" ? "BESAR" : "KECIL";
    }
    
    return Math.random() > 0.5 ? "KECIL" : "BESAR";
  }

  /* ========= RECOVERY STRATEGY ========= */
  function adjustBetAfterLongLoss() {
    // Untuk strategi Martingale x3, tidak ada penurunan level
    // Hanya beri peringatan jika losing streak panjang
    if (losingStreak >= 4) {
      console.log(`⚠️ Martingale x3: Loss streak ${losingStreak}x, tetap lanjut ke level berikutnya`);
      return;
    }
  }

  /* ========= ANALISIS TREND DATA ========= */
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
    
    // ========= PERBAIKAN PENTING =========
    // JANGAN gunakan .reverse() karena akan membalik urutan!
    // Data dari API sudah terurut dari TERBARU ke TERLAMA (index 0 = terbaru)
    historicalData = [...results, ...historicalData].slice(0, 100);
    
    // VERIFIKASI: Pastikan historicalData[0] adalah data terbaru
    if (historicalData.length > 0) {
      const latestIssue = historicalData[0].issue;
      const latestNumber = historicalData[0].number;
      console.log(`📊 HistoricalData[0] terbaru: ${latestIssue} - ${latestNumber}`);
    }
    
    if (historicalData.length >= 10) {
      const last10 = historicalData.slice(0, 10);
      const last20 = historicalData.slice(0, 20);
      
      const kecilCount10 = last10.filter(r => r.result === "KECIL").length;
      const besarCount10 = last10.filter(r => r.result === "BESAR").length;
      const kecilCount20 = last20.filter(r => r.result === "KECIL").length;
      const besarCount20 = last20.filter(r => r.result === "BESAR").length;
      
      let currentStreakType = last10[0].result;
      let currentStreakLength = 1;
      for (let i = 1; i < last10.length; i++) {
        if (last10[i].result === currentStreakType) {
          currentStreakLength++;
        } else {
          break;
        }
      }
      
      const patterns = [];
      for (let i = 0; i < last10.length - 2; i++) {
        patterns.push(`${last10[i].result}-${last10[i+1].result}-${last10[i+2].result}`);
      }
      
      let changes = 0;
      for (let i = 1; i < last10.length; i++) {
        if (last10[i].result !== last10[i-1].result) changes++;
      }
      const volatility = changes / (last10.length - 1);
      
      const angkaArray = last10.map(r => r.number);
      const avg = angkaArray.reduce((a,b) => a + b, 0) / angkaArray.length;
      
      const colourCounts = { red: 0, green: 0, violet: 0 };
      last10.forEach(d => {
        if (d.colour.includes('red')) colourCounts.red++;
        if (d.colour.includes('green')) colourCounts.green++;
        if (d.colour.includes('violet')) colourCounts.violet++;
      });
      
      patternAnalysis = {
        kecilTrend10: kecilCount10 / last10.length,
        besarTrend10: besarCount10 / last10.length,
        kecilTrend20: kecilCount20 / last20.length,
        besarTrend20: besarCount20 / last20.length,
        currentStreak: { type: currentStreakType, length: currentStreakLength },
        volatility: volatility,
        lastPattern: patterns[0] || null,
        averageNumber: avg,
        trendSlope: patternAnalysis.trendSlope || 0,
        isVolatile: volatility > 0.7,
        isStable: volatility < 0.3,
        colourAnalysis: colourCounts,
        last10Results: last10.map(r => r.result),
        last10Numbers: last10.map(r => r.number)
      };
    }
    
    if (historicalData.length >= 8) {
      const advancedAnalysis = analyzeAdvancedTrends();
      if (advancedAnalysis) {
        console.log(`📊 ADVANCED ANALYSIS:`);
        console.log(`   Confidence: ${advancedAnalysis.confidence}%`);
        console.log(`   Streak: ${advancedAnalysis.streak.currentLength}x ${advancedAnalysis.streak.currentType}`);
        console.log(`   Volatility: ${(advancedAnalysis.volatility.mediumTerm*100).toFixed(0)}%`);
        console.log(`   Avg Numbers: ${advancedAnalysis.numbers.avg5.toFixed(1)} (5) | ${advancedAnalysis.numbers.avg10.toFixed(1)} (10)`);
        console.log(`   Range: ${advancedAnalysis.numbers.min10}-${advancedAnalysis.numbers.max10}`);
        console.log(`   Pattern: ${advancedAnalysis.patterns.currentPattern || 'None'}`);
      }
    }
  }

  /* ========= FUNGSI PESAN ========= */
  function createMotivationMessage(lossCount) {
    switch(lossCount) {
      case 3:
        return `💪 <b>TERUS SEMANGAT!</b>\n\n` +
               `📉 Meskipun sudah kalah ${losingStreak}x berturut-turut,\n` +
               `📊 strategi Martingale x3 kami dirancang untuk recovery.\n\n` +
               `🎯 <b>Tetap ikuti rekomendasi sistem analisis kami</b>\n` +
               `💰 Level: ${currentBetIndex + 1} (Rp ${currentBetAmount.toLocaleString()})\n` +
               `💪 Kesabaran adalah kunci!\n\n` +
               `<i>Analisis berdasarkan data & pola matematis tetap berjalan...</i>`;
               
      case 5:
        return `🔥 <b>PERTAHANKAN!</b>\n\n` +
               `📊 Sudah ${losingStreak} kekalahan beruntun,\n` +
               `📈 Tapi sistem analisis multi-faktor kami tetap bekerja.\n\n` +
               `🎯 <b>Kami rekomendasikan tetap mengikuti prediksi</b>\n` +
               `💡 Pola reversal biasanya terjadi setelah streak negatif panjang\n` +
               `💰 Level: ${currentBetIndex + 1} (Rp ${currentBetAmount.toLocaleString()})\n\n` +
               `<i>Statistik menunjukkan peluang mean reversion meningkat setelah 5+ streak negatif</i>`;
               
      case 7:
        return `🚀 <b>HAMPIR SAMPAI!</b>\n\n` +
               `📉 ${losingStreak} kekalahan beruntun - ini jarang terjadi!\n` +
               `📊 <b>Peluang reversal sangat tinggi sekarang</b>\n\n` +
               `🎯 <b>Kami sangat menyarankan tetap mengikuti sistem</b>\n` +
               `💰 Level: ${currentBetIndex + 1} (Rp ${currentBetAmount.toLocaleString()})\n` +
               `💎 Kesempatan recovery besar di depan!\n\n` +
               `<i>Berdasarkan data historis, streak negatif panjang biasanya diikuti reversal kuat</i>`;
               
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
           `🔄 Saldo direset otomatis ke Rp 2.916.000\n\n` +
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
  
  // Simpan issue lengkap untuk sinkronisasi
  if (!predictedIssue) {
    if (nextIssueNumber) {
      predictedIssue = nextIssueNumber;
    } else {
      predictedIssue = `20260130${nextIssueShort}`;
    }
  }
  
  let message = `<b>WINGO 30s SALDO AWAL 2.916.000</b>\n`;
  message += `<b>🆔 PERIODE ${nextIssueShort} (${predictedIssue})</b>\n`;
  message += `<b>🎯 PREDIKSI B/K: ${currentPrediction} ${betLabel}</b>\n`;
  message += `<b>🎯 PREDIKSI B/K: ${currentPrediction} ${betLabel}</b>\n`;
  message += `<b>🎯 PREDIKSI B/K: ${currentPrediction} ${betLabel}</b>\n`;
  message += `━━━━━━━━━━━━━━━━━\n`;
  message += `<b>📊 LEVEL: ${currentBetIndex + 1}</b>\n`;
  message += `<b>💳 SALDO: Rp ${virtualBalance.toLocaleString()}</b>\n`;
  message += `<b>📈 P/L: ${profitLoss >= 0 ? '🟢' : '🔴'} ${profitLoss >= 0 ? '+' : ''}${profitLoss.toLocaleString()}</b>\n\n`;
  
  // TAMBAHKAN PESAN DASHBOARD ANALITIK DI SINI
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
    
    // Safety check hanya untuk logging, tidak pernah menghentikan bot
    checkSafetyLimits();
    
    // Cek jika saldo tidak cukup untuk taruhan saat ini
    if (virtualBalance < currentBetAmount) {
      console.log("❌ Saldo tidak cukup, reset ke saldo awal...");
      const oldBalance = virtualBalance;
      
      // Kirim data reset ke Firebase
      sendResetToFirebase(oldBalance, "saldo_habis");
      
      // Reset saldo ke awal
      virtualBalance = 2916000;
      
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
      
      // Kirim notifikasi ke Telegram
      const outOfBalanceMessage = createOutOfBalanceMessage();
      sendTelegram(outOfBalanceMessage);
      
      console.log(`🔄 Saldo direset ke 2.916.000, kembali ke Level 1`);
    }
    
    // Kurangi saldo untuk taruhan
    virtualBalance -= currentBetAmount;
    totalBets++;
    dailyStats.bets++;
    dailyStats.profit -= currentBetAmount;
    
    isBetPlaced = true;
    currentPrediction = getPrediction();
    
    // Simpan timestamp prediksi untuk sinkronisasi
    predictedAt = new Date();
    
    console.log(`🎯 Prediksi dibuat untuk periode berikutnya`);
    
    return true;
  }

  // ========= FUNGSI BARU: Proses hasil dengan data API langsung =========
  function processResult(result, apiData) {
    if (!isBetPlaced || !isBotActive) return false;
    
    const isWin = currentPrediction === result;
    
    // Tentukan issue yang akan disimpan ke Firebase
    // Prioritaskan predictedIssue, jika tidak ada gunakan issue dari API
    const issueToSave = predictedIssue || apiData.issueNumber;
    
    // Debug: Tampilkan perbandingan data
    console.log(`🔍 PROSES HASIL DENGAN DATA API LANGSUNG:`);
    console.log(`   API Issue: ${apiData.issueNumber}`);
    console.log(`   API Number: ${apiData.number}`);
    console.log(`   API Colour: ${apiData.colour}`);
    console.log(`   Predicted Issue: ${predictedIssue}`);
    console.log(`   Result: ${result} (${isWin ? 'WIN' : 'LOSS'})`);
    
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
      
      // ✅ SIMPAN NILAI SEBELUM RESET untuk donasi
      const winningBetAmount = currentBetAmount;
      
      // ✅ KIRIM DATA KE FIREBASE SEBELUM RESET LEVEL
      sendResultToFirebase(apiData, currentPrediction, true);
      
      // ✅ RESET LEVEL SETELAH MENGIRIM DATA
      currentBetIndex = 0;
      currentBetAmount = betSequence[0];
      
      if (consecutiveLossesBeforeWin >= 5) {
        setTimeout(() => {
          const winAfterLossMessage = createWinAfterLossMessage(consecutiveLossesBeforeWin);
          sendTelegram(winAfterLossMessage);
        }, 1000);
      }
      
      // ✅ GUNAKAN winningBetAmount untuk kondisi donasi
      if (winningBetAmount > 10000) {
        setTimeout(() => {
          const donationMessage = createDonationMessage();
          sendTelegram(donationMessage);
        }, 1500);
      }
      
      // ✅ PERBAIKI KONDISI PERIODIC DONATION
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
      
      // Kirim data hasil ke Firebase dengan data API langsung
      sendResultToFirebase(apiData, currentPrediction, false);
      
      updateStreakBetting(currentPrediction, result);
      
      // Naikkan level setelah kalah (Martingale x3)
      if (currentBetIndex < betSequence.length - 1) {
        currentBetIndex++;
        currentBetAmount = betSequence[currentBetIndex];
        console.log(`   Level setelah: ${currentBetIndex + 1} (Rp ${currentBetAmount.toLocaleString()})`);
      } else {
        console.log(`   ⚠️ Sudah level maksimal (${betSequence.length}), tetap di level ini`);
      }
      
      // Hanya beri peringatan, jangan turunkan level
      if (losingStreak >= 3) {
        console.log(`   🚨 Loss streak: ${losingStreak}x berturut-turut`);
      }
      
      // Motivation messages tetap ada
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
    
    profitLoss = virtualBalance - 2916000;
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

  // ========= PERBAIKAN: WAKTU LAPORAN HARIAN 23:59 =========
  function setupDailyTimer() {
    function checkDailyReport() {
      const now = new Date();
      const hours = now.getHours();
      const minutes = now.getMinutes();
      
      // UBAH DARI 00:06 MENJADI 23:59
      if (hours === 23 && minutes === 59) {
        const dailyReport = createDailyReportMessage();
        sendTelegram("false\n\n" + dailyReport);
        // Bot tetap berjalan, tidak dinonaktifkan
        console.log("📊 Laporan harian dikirim (23:59), bot tetap berjalan");
        
        // Kirim data laporan harian ke Firebase
        sendDailyReportToFirebase();
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
      // TAMBAHKAN FIELD UNTUK KEBUTUHAN DASHBOARD
      dailyBets: dailyStats.bets,
      dailyWins: dailyStats.wins,
      dailyLosses: dailyStats.losses,
      dailyProfit: dailyStats.profit
    };
    
    // Kirim laporan harian
    sendToFirebase("daily_reports", dailyReportData);
    
    // RESET DATABASE untuk hari baru yang bersih
    setTimeout(() => {
      console.log('🔄 Reset database harian...');
      resetDailyDatabase();
    }, 3000); // Tunggu 3 detik setelah laporan dikirim
    
    // JALANKAN CLEANUP DATA LAMA (delay 5 detik)
    setTimeout(() => {
      console.log('🧹 Running daily data cleanup...');
      cleanupOldData();
    }, 6000);
  }

  function createDailyReportMessage() {
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    const yesterdayStats = { ...dailyStats };
    
    // Kirim data kemarin ke Firebase
    const yesterdayData = {
      date: yesterday,
      bets: yesterdayStats.bets,
      wins: yesterdayStats.wins,
      losses: yesterdayStats.losses,
      profit: yesterdayStats.profit,
      winRate: yesterdayStats.bets > 0 ? Math.round((yesterdayStats.wins / yesterdayStats.bets) * 100) : 0,
      timestamp: Date.now()
    };
    
    sendToFirebase("yesterday_reports", yesterdayData);
    
    // Reset statistik harian
    dailyStats = {
      date: today,
      bets: 0,
      wins: 0,
      losses: 0,
      profit: 0
    };
    
    const winRateYesterday = yesterdayStats.bets > 0 ? 
      Math.round((yesterdayStats.wins / yesterdayStats.bets) * 100) : 0;
    
    return `⏰ <b>LAPORAN HARIAN - ${yesterday}</b>\n\n` +
           `📅 Periode: ${yesterday}\n\n` +
           `📊 <b>PERFORMANCE KEMARIN:</b>\n` +
           `├── 🎯 Total Taruhan: ${yesterdayStats.bets}\n` +
           `├── ✅ Menang: ${yesterdayStats.wins}\n` +
           `├── ❌ Kalah: ${yesterdayStats.losses}\n` +
           `├── 📊 Win Rate: ${winRateYesterday}%\n` +
           `└── 📈 Profit/Loss: ${yesterdayStats.profit >= 0 ? '🟢' : '🔴'} ${yesterdayStats.profit >= 0 ? '+' : ''}${yesterdayStats.profit.toLocaleString()}\n\n` +
           `💡 <b>PELAJARAN HARI INI:</b>\n` +
           `${yesterdayStats.profit >= 0 ? 
             '• Terus pertahankan konsistensi dan disiplin!\n• Fokus pada risk management\n• Jangan tergoda increase bet size terlalu cepat' : 
             '• Evaluasi strategi trading Anda\n• Perhatikan money management\n• Jangan revenge trading\n• Tetap tenang dan ikuti sistem'}\n\n` +
           `🎯 <b>HARI INI:</b>\n` +
           `• Mulai dengan fresh mind\n• Tetap ikuti sistem dan analisis\n• Batasi kerugian harian\n• Disiplin adalah kunci utama\n\n` +
           `🤖 <b>BOT TETAP BERJALAN - DATABASE RESET HARIAN</b>\n` +
           `🧹 Semua data hasil kemarin telah dihapus, mulai fresh hari ini!`;
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
      console.log(`🔗 Data API Lengkap: ${JSON.stringify(item)}`);
      
      // DEBUG: Log issue untuk sinkronisasi
      if (predictedIssue) {
        const predShort = getShortIssue(predictedIssue);
        const currShort = getShortIssue(issueNumber);
        console.log(`🔍 SINKRONISASI: Prediksi ${predShort} vs Hasil ${currShort}`);
      }
      
      analyzeTrendData(list);
      
      if (isBetPlaced) {
        // ========= PERBAIKAN PENTING =========
        // Kirim data API LENGKAP ke processResult, bukan hanya result saja
        const apiData = {
          issueNumber: item.issueNumber,
          number: item.number,        // String dari API
          colour: item.colour,
          premium: item.premium
        };
        
        const isWin = processResult(result, apiData);
        console.log(`   ${isWin ? '✅ MENANG' : '❌ KALAH'} | Saldo: ${virtualBalance.toLocaleString()}`);
      }
      
      setTimeout(() => {
        // Bot selalu berjalan, tidak ada pengecekan isBotActive
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
    
    virtualBalance = 2916000;
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
    
    // Reset variabel sinkronisasi issue
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
    
    streakFollowingStats = {
      totalFollows: 0,
      successfulFollows: 0,
      failedFollows: 0,
      currentStreakFollowCount: 0,
      lastStreakType: null
    };
    
    isBotActive = true;
    
    patternAnalysis = {
      kecilTrend10: 0,
      besarTrend10: 0,
      kecilTrend20: 0,
      besarTrend20: 0,
      currentStreak: { type: null, length: 0 },
      volatility: 0,
      lastPattern: null,
      averageNumber: 0,
      trendSlope: 0,
      isVolatile: false,
      isStable: false,
      colourAnalysis: { red: 0, green: 0, violet: 0 },
      last10Results: [],
      last10Numbers: []
    };
    
    // Kirim data reset ke Firebase
    sendResetToFirebase(oldBalance, "manual_reset");
    
    console.log("🔄 Bot direset ke saldo 2.916.000 dan diaktifkan");
    
    const startupMsg = `🔄 <b>BOT DIRESET DAN DIAKTIFKAN</b>\n\n` +
                      `💰 Saldo: Rp 2.916.000\n` +
                      `🎯 Mulai dari Level 1 (Rp 1.000)\n` +
                      `🧠 Sistem: Martingale x3 + AI Analysis v4.0\n` +
                      `📊 Strategi: 8 Level Recovery\n\n` +
                      `<i>Bot akan berjalan otomatis tanpa henti, reset otomatis jika saldo habis</i>`;
    sendTelegram(startupMsg);
  }

  function addBalance(amount) {
    virtualBalance += amount;
    console.log(`💰 +${amount.toLocaleString()} | Saldo: ${virtualBalance.toLocaleString()}`);
    
    // Kirim data tambah saldo ke Firebase
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

🤖 WINGO SMART TRADING BOT v4.0 - NO STOP VERSION
💰 Saldo awal: 2.916.000 (Support semua 8 level)
🧠 Analisis: Advanced AI System
📊 Strategi: Martingale x3 (8 Level Recovery)
📡 Firebase: Data dikirim ke wingo-bot-analytics
🔒 ISSUE SINKRONISASI: AKTIF
✅ PERBAIKAN BUG: Data API langsung ke Firebase

📊 URUTAN TARUHAN:
   1. Rp 1.000     (x1)
   2. Rp 3.000     (x3)
   3. Rp 8.000     (x8)
   4. Rp 24.000    (x24)
   5. Rp 72.000    (x72)
   6. Rp 216.000   (x216)
   7. Rp 648.000   (x648)
   8. Rp 1.944.000 (x1944)

📨 Telegram Groups:
   • Primary Group: ${TELEGRAM_GROUPS.primary}
   • Secondary Groups: ${TELEGRAM_GROUPS.secondary.length > 0 ? TELEGRAM_GROUPS.secondary.join(', ') : 'Tidak ada'}
   • Multi-Group Sending: ${enableMultipleGroups ? 'AKTIF' : 'NONAKTIF'}

🔥 FITUR BARU:
   • Issue Sinkronisasi: Prediksi ↔ Hasil di Firebase
   • Bot TIDAK PERNAH BERHENTI otomatis
   • Reset otomatis saat saldo habis
   • Semua data dikirim ke Firebase langsung dari API
   • Safety limits hanya untuk logging
   • Auto-cleanup data lama setiap hari
   • Database reset harian pukul 23:59
   • Pesan motivasi startup

⏰ Laporan harian: 23:59 WIB (dengan auto-cleanup & database reset)
✅ Bot siap berjalan SELAMANYA dengan strategi Martingale x3!
`);

  setupDailyTimer();

  // Kirim pesan motivasi startup
  sendStartupMotivationMessage();
  
  setTimeout(() => {
    // Bot selalu berjalan, tidak ada pengecekan saldo di awal
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
    cleanup: cleanupOldData,
    resetDatabase: resetDailyDatabase,
    activate: () => {
      isBotActive = true;
      console.log("✅ Bot diaktifkan");
      sendTelegram("✅ <b>BOT DIAKTIFKAN</b>\n\nSistem kembali beroperasi dengan saldo Rp " + virtualBalance.toLocaleString());
    },
    deactivate: () => {
      isBotActive = false;
      console.log("⏸️ Bot dinonaktifkan");
      sendTelegram("⏸️ <b>BOT DINONAKTIFKAN</b>\n\nSistem berhenti beroperasi");
    },
    stats: () => {
      const winRate = totalBets > 0 ? Math.round((totalWins/totalBets)*100) : 0;
      const streakSuccessRate = streakFollowingStats.totalFollows > 0 ? 
        Math.round((streakFollowingStats.successfulFollows/streakFollowingStats.totalFollows)*100) : 0;
      
      console.log(`

💰 Saldo: ${virtualBalance.toLocaleString()}
📊 P/L: ${profitLoss >= 0 ? '+' : ''}${profitLoss.toLocaleString()}
🎯 Bet: ${totalBets} (W:${totalWins}/L:${totalLosses})
📈 Win Rate: ${winRate}%
🔥 Streak: ${currentStreak}
📊 Level: ${currentBetIndex + 1} (Rp ${currentBetAmount.toLocaleString()})
📈 Data Historis: ${historicalData.length} periode
❌ Kalah Berturut: ${losingStreak}
📊 Streak Following: ${streakSuccessRate}% (${streakFollowingStats.successfulFollows}/${streakFollowingStats.totalFollows})
📅 Hari ini: ${dailyStats.bets} bet (${dailyStats.wins}W/${dailyStats.losses}L) P/L: ${dailyStats.profit >= 0 ? '+' : ''}${dailyStats.profit.toLocaleString()}
🚦 Status: ${isBotActive ? 'AKTIF' : 'NONAKTIF'}
📅 Periode berikutnya: ${nextIssueNumber || 'Belum diketahui'}
📨 Antrian Pesan: ${messageQueue.length} pesan
📨 Multi-Group: ${enableMultipleGroups ? 'AKTIF' : 'NONAKTIF'}
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
    queue: () => {
      console.log(`📨 Antrian Telegram: ${messageQueue.length} pesan`);
      messageQueue.forEach((task, i) => {
        console.log(`   ${i+1}. Grup ${task.chatId}: ${task.msg.substring(0, 50)}...`);
      });
    },
    analyze: () => {
      if (historicalData.length >= 8) {
        console.log(`📋 ANALISIS DETAIL:`);
        const analysis = analyzeAdvancedTrends();
        console.log(JSON.stringify(analysis, null, 2));
        
        console.log(`\n🤖 AI PREDICTION TEST:`);
        console.log(`Basic: ${getTrendBasedPrediction()}`);
        if (historicalData.length >= 10) {
          console.log(`AI: ${getAIPrediction()}`);
        }
      } else {
        console.log(`❌ Data historis kurang (${historicalData.length}/8)`);
      }
    },
    analyzeAdvanced: () => {
      if (historicalData.length < 8) {
        console.log(`❌ Data kurang (${historicalData.length}/8)`);
        return;
      }
      
      const analysis = analyzeAdvancedTrends();
      if (analysis) {
        console.log(`\n🧠 ADVANCED ANALYSIS DETAIL:`);
        console.log(JSON.stringify(analysis, null, 2));
        
        console.log(`\n🤖 AI PREDICTION SIMULATION:`);
        const prediction = getAIPrediction();
        console.log(`   Final Prediction: ${prediction}`);
      }
    },
    testPrediction: () => {
      console.log(`\n🧪 TEST PREDICTION SYSTEM:`);
      console.log(`1. Basic Trend Prediction: ${getTrendBasedPrediction()}`);
      
      if (historicalData.length >= 10) {
        console.log(`2. AI Prediction: ${getAIPrediction()}`);
        console.log(`3. Final Prediction: ${getPrediction()}`);
      } else {
        console.log(`2. AI Prediction: Data tidak cukup (${historicalData.length}/10)`);
        console.log(`3. Final Prediction: ${getPrediction()}`);
      }
    },
    setMultiGroup: (enabled) => {
      if (typeof enabled !== 'boolean') {
        console.log("❌ Parameter harus boolean (true/false)");
        return;
      }
      
      enableMultipleGroups = enabled;
      console.log(`📨 Pengiriman multi-group: ${enabled ? 'DIAKTIFKAN' : 'DINONAKTIFKAN'}`);
      
      if (enabled && TELEGRAM_GROUPS.secondary.length > 0) {
        console.log(`📋 Akan mengirim ke ${1 + TELEGRAM_GROUPS.secondary.length} grup:`);
        console.log(`   • Primary: ${TELEGRAM_GROUPS.primary}`);
        TELEGRAM_GROUPS.secondary.forEach((chatId, i) => {
          console.log(`   • Secondary ${i+1}: ${chatId}`);
        });
      } else if (enabled) {
        console.log("⚠️ Multi-group diaktifkan tapi tidak ada secondary group");
        console.log("   Gunakan wingoBot.addGroup(chatId) untuk menambah grup");
      }
    },
    addGroup: (chatId, isPrimary = false) => {
      if (!chatId || typeof chatId !== 'string') {
        console.log("❌ chatId harus berupa string");
        return;
      }
      
      if (isPrimary) {
        TELEGRAM_GROUPS.primary = chatId;
        console.log(`✅ Primary group diatur ke: ${chatId}`);
      } else {
        if (!TELEGRAM_GROUPS.secondary.includes(chatId)) {
          TELEGRAM_GROUPS.secondary.push(chatId);
          console.log(`✅ Secondary group ditambahkan: ${chatId}`);
          console.log(`   Total secondary groups: ${TELEGRAM_GROUPS.secondary.length}`);
        } else {
          console.log(`⚠️ Group ${chatId} sudah ada`);
        }
      }
    },
    removeGroup: (chatId) => {
      if (TELEGRAM_GROUPS.primary === chatId) {
        console.log(`❌ Tidak bisa menghapus primary group`);
        console.log(`   Gunakan wingoBot.addGroup(chatId, true) untuk mengubah primary group`);
        return;
      }
      
      const index = TELEGRAM_GROUPS.secondary.indexOf(chatId);
      if (index !== -1) {
        TELEGRAM_GROUPS.secondary.splice(index, 1);
        console.log(`✅ Secondary group dihapus: ${chatId}`);
        console.log(`   Sisa secondary groups: ${TELEGRAM_GROUPS.secondary.length}`);
      } else {
        console.log(`⚠️ Group ${chatId} tidak ditemukan`);
      }
    },
    listGroups: () => {
      console.log(`📋 Daftar Grup Telegram:`);
      console.log(`   Primary: ${TELEGRAM_GROUPS.primary}`);
      console.log(`   Secondary (${TELEGRAM_GROUPS.secondary.length}):`);
      
      if (TELEGRAM_GROUPS.secondary.length > 0) {
        TELEGRAM_GROUPS.secondary.forEach((chatId, i) => {
          console.log(`     ${i+1}. ${chatId}`);
        });
      } else {
        console.log(`     Tidak ada`);
      }
      
      console.log(`\n📨 Status Multi-Group: ${enableMultipleGroups ? '🟢 AKTIF' : '🔴 NONAKTIF'}`);
      if (enableMultipleGroups) {
        console.log(`   Pesan dikirim ke ${1 + TELEGRAM_GROUPS.secondary.length} grup`);
      } else {
        console.log(`   Pesan hanya dikirim ke primary group`);
      }
    },
    updateSettings: (settings) => {
      if (settings.maxConsecutiveLosses !== undefined) {
        SAFETY_LIMITS.maxConsecutiveLosses = settings.maxConsecutiveLosses;
        console.log(`⚙️ Max Consecutive Losses diubah ke: ${settings.maxConsecutiveLosses}`);
      }
      if (settings.maxDailyLoss !== undefined) {
        SAFETY_LIMITS.maxDailyLoss = settings.maxDailyLoss;
        console.log(`⚙️ Max Daily Loss diubah ke: ${settings.maxDailyLoss.toLocaleString()}`);
      }
      if (settings.profitTarget !== undefined) {
        SAFETY_LIMITS.profitTarget = settings.profitTarget;
        console.log(`⚙️ Profit Target diubah ke: ${settings.profitTarget.toLocaleString()}`);
      }
      console.log(`✅ Settings updated`);
    },
    firebaseTest: () => {
      console.log("🧪 Testing Firebase connection...");
      const testData = {
        test: true,
        timestamp: new Date().toISOString(),
        message: "Firebase connection test from bot"
      };
      
      sendToFirebase("test", testData).then(success => {
        if (success) {
          console.log("✅ Firebase test successful!");
        } else {
          console.log("❌ Firebase test failed!");
        }
      });
    },
    
    /* ========= FUNGSI DEBUG ISSUE SINKRONISASI ========= */
    debugIssueSync: () => {
      console.log("🔍 DEBUG SINKRONISASI ISSUE:");
      console.log(`1. Predicted Issue: ${predictedIssue}`);
      console.log(`2. Last Processed Issue: ${lastProcessedIssue}`);
      console.log(`3. Next Issue Number: ${nextIssueNumber}`);
      console.log(`4. Historical Data[0]: ${historicalData[0]?.issue}`);
      console.log(`5. Is Bet Placed: ${isBetPlaced}`);
      console.log(`6. Predicted At: ${predictedAt}`);
      
      if (historicalData.length > 0) {
        console.log("\n📜 Last 3 Historical Issues:");
        historicalData.slice(0, 3).forEach((d, i) => {
          console.log(`   ${i+1}. ${d.issue} - ${d.number} (${d.result})`);
        });
      }
      
      // Cek apakah ada mismatch
      if (predictedIssue && historicalData[0]?.issue) {
        const predShort = getShortIssue(predictedIssue);
        const histShort = getShortIssue(historicalData[0].issue);
        
        if (predShort !== histShort) {
          console.log(`\n⚠️ ISSUE MISMATCH DETECTED!`);
          console.log(`   Prediksi: ${predShort}`);
          console.log(`   Hasil: ${histShort}`);
          console.log(`   Selisih: ${Math.abs(parseInt(predShort) - parseInt(histShort))}`);
        } else {
          console.log(`\n✅ Issue synchronized: ${predShort}`);
        }
      }
    },
    
    forceSyncIssue: (issue) => {
      if (!issue) {
        console.log("❌ Masukkan issue number");
        return;
      }
      
      predictedIssue = issue;
      console.log(`✅ Issue diset ke: ${issue}`);
      
      // Jika ada taruhan yang sedang berjalan, update prediksi
      if (isBetPlaced) {
        console.log(`📝 Update issue untuk taruhan yang sedang berjalan`);
      }
    },
    
    testIssueFlow: () => {
      console.log("🧪 Testing Issue Flow:");
      console.log(`1. Next Issue dari API: ${nextIssueNumber}`);
      console.log(`2. Last Processed: ${lastProcessedIssue}`);
      console.log(`3. Predicted Issue: ${predictedIssue}`);
      
      if (lastProcessedIssue) {
        const calculatedNext = calculateNextIssue(lastProcessedIssue);
        console.log(`4. Calculated Next: ${calculatedNext}`);
        
        if (nextIssueNumber && calculatedNext) {
          const apiShort = getShortIssue(nextIssueNumber);
          const calcShort = getShortIssue(calculatedNext);
          console.log(`5. Comparison: API ${apiShort} vs Calc ${calcShort}`);
        }
      }
    },
    
    /* ========= FUNGSI BARU: VERIFIKASI DATA API ========= */
    verifyAPIData: () => {
      fetch("https://api.55fiveapi.com/api/webapi/GetNoaverageEmerdList", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: 1, pageNo: 1, pageSize: 10 })
      })
      .then(res => res.json())
      .then(data => {
        console.log("🔍 VERIFIKASI DATA API LANGSUNG:");
        const list = data?.data?.list;
        if (list && list.length > 0) {
          const latest = list[0];
          console.log(`   Issue: ${latest.issueNumber}`);
          console.log(`   Angka: ${latest.number}`);
          console.log(`   Warna: ${latest.colour}`);
          console.log(`   Premium: ${latest.premium}`);
          console.log(`   Result: ${parseInt(latest.number) <= 4 ? "KECIL" : "BESAR"}`);
          
          // Bandingkan dengan historicalData
          if (historicalData.length > 0) {
            console.log(`\n🔍 PERBANDINGAN DENGAN historicalData[0]:`);
            console.log(`   historicalData[0].issue: ${historicalData[0].issue}`);
            console.log(`   historicalData[0].number: ${historicalData[0].number}`);
            console.log(`   historicalData[0].colour: ${historicalData[0].colour}`);
            console.log(`   Sama? ${latest.issueNumber === historicalData[0].issue ? '✅' : '❌'}`);
          }
        }
      })
      .catch(console.error);
    },
    
    /* ========= FUNGSI BARU: KIRIM ULANG PESAN MOTIVASI ========= */
    sendMotivation: () => {
      sendStartupMotivationMessage();
      console.log("✅ Pesan motivasi dikirim ulang");
    }
  };

  console.log("\n🛠️ Perintah debug di console:");
  console.log("   wingoBot.check()        - Manual check data");
  console.log("   wingoBot.reset()        - Reset bot ke 2.916.000");
  console.log("   wingoBot.add(X)         - Tambah saldo");
  console.log("   wingoBot.cleanup()      - Hapus data lama dari Firebase");
  console.log("   wingoBot.resetDatabase()- Reset database harian");
  console.log("   wingoBot.activate()     - Aktifkan bot");
  console.log("   wingoBot.deactivate()   - Nonaktifkan bot");
  console.log("   wingoBot.stats()        - Lihat statistik");
  console.log("   wingoBot.history()      - Lihat data historis");
  console.log("   wingoBot.analyze()      - Analisis detail");
  console.log("   wingoBot.analyzeAdvanced() - Analisis advanced");
  console.log("   wingoBot.testPrediction()  - Test sistem prediksi");
  console.log("   wingoBot.queue()        - Lihat antrian pesan");
  console.log("   wingoBot.setMultiGroup(true/false) - Kontrol multi-group");
  console.log("   wingoBot.addGroup(chatId, isPrimary) - Tambah grup");
  console.log("   wingoBot.removeGroup(chatId) - Hapus grup");
  console.log("   wingoBot.listGroups()   - Lihat daftar grup");
  console.log("   wingoBot.updateSettings({maxConsecutiveLosses: X, ...}) - Update settings");
  console.log("   wingoBot.firebaseTest() - Test koneksi Firebase");
  console.log("   wingoBot.verifyAPIData() - Verifikasi data API langsung");
  console.log("   wingoBot.sendMotivation() - Kirim ulang pesan motivasi");
  console.log("\n🔍 PERINTAH ISSUE SINKRONISASI:");
  console.log("   wingoBot.debugIssueSync() - Debug sinkronisasi issue");
  console.log("   wingoBot.forceSyncIssue('2026013010005253') - Paksa set issue");
  console.log("   wingoBot.testIssueFlow()  - Test alur issue");
})();

