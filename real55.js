(function () {
  console.clear();
  console.log("🤖 WinGo Smart Trading Bot - Enhanced Analysis v5.0");

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
    maxConsecutiveLosses: 100,
    maxDailyLoss: 1000000000,
    minBalance: 1,
    profitTarget: 1000000000,
    maxBetLevel: 7
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
    127000     // Level 7: 127,000
  ];
  
  const betLabels = [
    "1K",
    "3K", 
    "7K",
    "15K",
    "31K",
    "63K",
    "127K"
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
    
    console.log(`📤 Mengirim ke Firebase: Issue ${apiResultData.issueNumber}, Angka ${apiResultData.number} (${resultData.result})`);
    
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
    const startupMessage = `🤖 <b>WINGO SMART TRADING BOT v5.0</b>\n\n` +
                          `Saya adalah bot yang dibuat untuk memprediksi pola serta mendeteksi dragon sesuai pola, namun ini saya tidak bisa menjamin 100% menang karena ini adalah permainan.\n\n` +
                          `📊 <b>FITUR BOT:</b>\n` +
                          `• Analisis AI Multi-Faktor (Sistem Baru)\n` +
                          `• Deteksi Streak & Pola Dragon\n` +
                          `• Martingale Baru (7 Level Recovery)\n` +
                          `• Auto Reset saat Saldo Habis\n` +
                          `• Laporan Harian Otomatis\n\n` +
                          `⚠️ <b>PERINGATAN RESIKO:</b>\n` +
                          `• Trading memiliki resiko kerugian\n` +
                          `• Gunakan modal yang siap hilang\n` +
                          `• Disiplin dalam money management\n` +
                          `• Jangan gunakan emosi saat trading\n` +
                          `• Prediksi tidak 100% akurat\n\n` +
                          `📈 <b>STATISTIK AWAL:</b>\n` +
                          `• Saldo Awal: Rp 502.000\n` +
                          `• Level Maksimal: 7\n` +
                          `• Strategi: Martingale Baru\n` +
                          `• Target: Konsistensi jangka panjang\n\n` +
                          `🤝 <b>SEMOGA BERUNTUNG & TETAP DISIPLIN!</b>`;
    
    sendTelegram(startupMessage);
  }

  /* ========= ANALISIS TREND DATA (DARI analisa&autobet.js) ========= */
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
    
    historicalData = [...results, ...historicalData].slice(0, 100);
    
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
  }

  /* ========= SISTEM ANALISIS MULTI-LEVEL (DARI analisa&autobet.js) ========= */
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
    } else if (streak.currentLength >= 2) {
      score += 10;
    }
    
    if (volatility.isLowVolatility) {
      score += 15;
    } else if (volatility.isHighVolatility) {
      score -= 10;
    }
    
    if (numbers.range < 5) {
      score += 10;
    }
    
    if (numbers.isAscending || numbers.isDescending) {
      score += 5;
    }
    
    if (timing.kecilFrequency > 0.7) {
      score += 10;
    } else if (timing.besarFrequency > 0.7) {
      score += 10;
    }
    
    if (timing.timeSinceLastKecil >= 5) {
      score += 15;
    } else if (timing.timeSinceLastBesar >= 5) {
      score += 15;
    }
    
    return Math.min(Math.max(score, 0), 100);
  }

  /* ========= ANALISIS STREAK CERDAS (DARI analisa&autobet.js) ========= */
  function analyzeStreakIntelligence() {
    if (historicalData.length < 15) return null;
    
    const last15 = historicalData.slice(0, 15);
    const streaks = [];
    let currentStreak = { type: last15[0].result, length: 1, startIndex: 0 };
    
    for (let i = 1; i < last15.length; i++) {
      if (last15[i].result === currentStreak.type) {
        currentStreak.length++;
      } else {
        streaks.push({ ...currentStreak });
        currentStreak = { type: last15[i].result, length: 1, startIndex: i };
      }
    }
    streaks.push({ ...currentStreak });
    
    const streakAnalysis = {
      currentStreak: streaks[0],
      allStreaks: streaks,
      avgStreakLength: streaks.reduce((sum, s) => sum + s.length, 0) / streaks.length,
      maxStreakLength: Math.max(...streaks.map(s => s.length)),
      streakHistory: streaks.map(s => `${s.length}x ${s.type}`),
      
      shouldFollowStreak: function() {
        const current = this.currentStreak;
        
        if (current.length < 3) return false;
        
        if (current.length > 6) return false;
        
        if (current.length > this.avgStreakLength * 1.5) {
          return false;
        }
        
        const streakNumbers = historicalData
          .slice(0, current.length)
          .map(d => d.number);
        const numberVariance = Math.max(...streakNumbers) - Math.min(...streakNumbers);
        
        if (numberVariance < 2 && current.length >= 4) {
          return Math.random() > 0.3; 
        }
        
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
    
    if (!streakIntel.shouldFollowStreak()) {
      if (breakPrediction?.probability > 60) {
        const opposite = currentStreak.type === "KECIL" ? "BESAR" : "KECIL";
        return {
          prediction: opposite,
          confidence: breakPrediction.probability,
          reason: `Streak break anticipation (${currentStreak.length}x ${currentStreak.type})`
        };
      }
      
      return null;
    }
    
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
      continueProbability -= 15;
    }
    
    const recentBreaks = historicalData.slice(0, 20).filter((d, i, arr) => {
      if (i < 2) return false;
      return d.result !== arr[i-1].result && 
             arr[i-1].result === arr[i-2].result &&
             arr[i-1].result === currentStreak.type;
    }).length;
    
    if (recentBreaks > 0) {
      continueProbability -= 10;
    }
    
    const shouldContinue = Math.random() * 100 < continueProbability;
    
    if (!shouldContinue) {
      return currentStreak.type === "KECIL" ? "BESAR" : "KECIL";
    }
    
    return null;
  }

  /* ========= SISTEM PREDIKSI AI (DARI analisa&autobet.js) ========= */
  function getAIPrediction() {
    if (historicalData.length < 10) {
      return getTrendBasedPrediction();
    }
    
    const analysis = analyzeAdvancedTrends();
    if (!analysis) return getTrendBasedPrediction();
    
    const factors = [];
    
    // FACTOR 1: STRONG STREAK FOLLOW
    if (analysis.streak.currentLength >= 4) {
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
      factors.push({
        prediction: "BESAR",
        weight: 35,
        reason: `Mean reversion from ${(kecilRatio*100).toFixed(0)}% KECIL`
      });
    } else if (besarRatio > 0.7) {
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
      factors.push({
        prediction: opposite,
        weight: 25,
        reason: `High volatility pattern (${(analysis.volatility.mediumTerm*100).toFixed(0)}% changes)`
      });
    } else if (analysis.volatility.isLowVolatility && analysis.streak.currentLength >= 2) {
      factors.push({
        prediction: analysis.streak.currentType,
        weight: 25,
        reason: `Low volatility with existing streak`
      });
    }
    
    // FACTOR 4: NUMBER TREND ANALYSIS
    if (analysis.numbers.avg5 < 2.5) {
      factors.push({
        prediction: "BESAR",
        weight: 20,
        reason: `Low number trend (avg: ${analysis.numbers.avg5.toFixed(1)})`
      });
    } else if (analysis.numbers.avg5 > 6.5) {
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
      factors.push({
        prediction: commonPatterns[analysis.patterns.currentPattern],
        weight: 15,
        reason: `Pattern match: ${analysis.patterns.currentPattern}`
      });
    }
    
    // FACTOR 6: TIME-BASED REVERSION
    if (analysis.timing.timeSinceLastKecil >= 5) {
      factors.push({
        prediction: "KECIL",
        weight: 10 + (analysis.timing.timeSinceLastKecil * 2),
        reason: `KECIL not seen for ${analysis.timing.timeSinceLastKecil} periods`
      });
    } else if (analysis.timing.timeSinceLastBesar >= 5) {
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
      if (adaptiveStreakPred.confidence > 65) {
        factors.push({
          prediction: adaptiveStreakPred.prediction,
          weight: 25,
          reason: `Smart streak following (${adaptiveStreakPred.reason})`
        });
      } else {
        factors.push({
          prediction: antiFallacyPred,
          weight: 20,
          reason: `Anti-gambler's fallacy correction`
        });
      }
    } else if (adaptiveStreakPred) {
      factors.push({
        prediction: adaptiveStreakPred.prediction,
        weight: Math.min(25, adaptiveStreakPred.confidence),
        reason: adaptiveStreakPred.reason
      });
    } else if (antiFallacyPred) {
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
    
    if (scores.KECIL === scores.BESAR) {
      return getTrendBasedPrediction();
    }
    
    const finalPrediction = scores.KECIL > scores.BESAR ? "KECIL" : "BESAR";
    
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
      const streakContinueProbability = Math.max(30, 70 - (analysis.currentStreak.length * 5));
      
      if (Math.random() * 100 < streakContinueProbability) {
        return analysis.currentStreak.type;
      } else {
        return analysis.currentStreak.type === "KECIL" ? "BESAR" : "KECIL";
      }
    }
    
    if (analysis.volatility > 0.75) {
      return lastResult === "KECIL" ? "BESAR" : "KECIL";
    }
    
    if (analysis.volatility < 0.25 && analysis.currentStreak.length >= 2) {
      return lastResult;
    }
    
    if (analysis.kecilTrend10 > 0.65) {
      return "BESAR";
    }
    if (analysis.besarTrend10 > 0.65) {
      return "KECIL";
    }
    
    const chartAnalysis = createSimpleChart();
    if (chartAnalysis) {
      const trendStrength = Math.abs(analysis.trendSlope);
      if (trendStrength > 0.3) {
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

  /* ========= FUNGSI PESAN ========= */
  function createMotivationMessage(lossCount) {
    switch(lossCount) {
      case 3:
        return `💪 <b>TERUS SEMANGAT!</b>\n\n` +
               `📉 Meskipun sudah kalah ${losingStreak}x berturut-turut,\n` +
               `📊 strategi Martingale kami dirancang untuk recovery.\n\n` +
               `🎯 <b>Tetap ikuti rekomendasi sistem analisis kami</b>\n` +
               `💰 Level: ${currentBetIndex + 1} (Rp ${currentBetAmount.toLocaleString()})\n` +
               `💪 Kesabaran adalah kunci!`;
               
      case 5:
        return `🔥 <b>PERTAHANKAN!</b>\n\n` +
               `📊 Sudah ${losingStreak} kekalahan beruntun,\n` +
               `📈 Tapi sistem analisis multi-faktor kami tetap bekerja.\n\n` +
               `🎯 <b>Kami rekomendasikan tetap mengikuti prediksi</b>\n` +
               `💡 Pola reversal biasanya terjadi setelah streak negatif panjang\n` +
               `💰 Level: ${currentBetIndex + 1} (Rp ${currentBetAmount.toLocaleString()})`;
               
      case 7:
        return `🚀 <b>HAMPIR SAMPAI!</b>\n\n` +
               `📉 ${losingStreak} kekalahan beruntun - ini jarang terjadi!\n` +
               `📊 <b>Peluang reversal sangat tinggi sekarang</b>\n\n` +
               `🎯 <b>Kami sangat menyarankan tetap mengikuti sistem</b>\n` +
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
    
    if (!predictedIssue) {
      if (nextIssueNumber) {
        predictedIssue = nextIssueNumber;
      } else {
        predictedIssue = `20260130${nextIssueShort}`;
      }
    }
    
    let message = `<b>WINGO 30s SALDO AWAL 502.000</b>\n`;
    message += `<b>🆔 PERIODE ${nextIssueShort} (${predictedIssue})</b>\n`;
    message += `<b>🎯 PREDIKSI B/K: ${currentPrediction} ${betLabel}</b>\n`;
    message += `<b>🎯 PREDIKSI B/K: ${currentPrediction} ${betLabel}</b>\n`;
    message += `<b>🎯 PREDIKSI B/K: ${currentPrediction} ${betLabel}</b>\n`;
    message += `━━━━━━━━━━━━━━━━━\n`;
    message += `<b>📊 LEVEL: ${currentBetIndex + 1}</b>\n`;
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
      
      // Kirim notifikasi ke Telegram
      const outOfBalanceMessage = createOutOfBalanceMessage();
      sendTelegram(outOfBalanceMessage);
      
      console.log(`🔄 Saldo direset ke 502.000, kembali ke Level 1`);
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
    
    console.log(`🎯 Prediksi dibuat untuk periode berikutnya`);
    
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
    
    sendResetToFirebase(oldBalance, "manual_reset");
    
    console.log("🔄 Bot direset ke saldo 502.000 dan diaktifkan");
    
    const startupMsg = `🔄 <b>BOT DIRESET DAN DIAKTIFKAN</b>\n\n` +
                      `💰 Saldo: Rp 502.000\n` +
                      `🎯 Mulai dari Level 1 (Rp 1.000)\n` +
                      `🧠 Sistem: AI Analysis v5.0\n` +
                      `📊 Strategi: 7 Level Recovery\n\n` +
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
🤖 WINGO SMART TRADING BOT v5.0 - NEW SYSTEM
💰 Saldo awal: 502.000 (Support 7 level)
🧠 Analisis: Advanced AI System (Sistem Baru)
📊 Strategi: Martingale Baru (7 Level Recovery)
📡 Firebase: Data dikirim ke wingo-bot-analytics
🔒 ISSUE SINKRONISASI: AKTIF
✅ PERBAIKAN BUG: Data API langsung ke Firebase

📊 URUTAN TARUHAN BARU:
   1. Rp 1.000     (x1)
   2. Rp 3.000     (x3)
   3. Rp 7.000     (x7)
   4. Rp 15.000    (x15)
   5. Rp 31.000    (x31)
   6. Rp 63.000    (x63)
   7. Rp 127.000   (x127)

📨 Telegram Groups:
   • Primary Group: ${TELEGRAM_GROUPS.primary}
   • Secondary Groups: ${TELEGRAM_GROUPS.secondary.length > 0 ? TELEGRAM_GROUPS.secondary.join(', ') : 'Tidak ada'}
   • Multi-Group Sending: ${enableMultipleGroups ? 'AKTIF' : 'NONAKTIF'}

🔥 FITUR BARU:
   • Sistem Analisis dari analisa&autobet.js
   • Saldo Awal: 502.000
   • Urutan Taruhan Baru: 1K, 3K, 7K, 15K, 31K, 63K, 127K
   • Bot TIDAK PERNAH BERHENTI otomatis
   • Reset otomatis saat saldo habis
   • Semua data dikirim ke Firebase langsung dari API

✅ Bot siap berjalan dengan sistem analisis baru!
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
      sendTelegram("✅ <b>BOT DIAKTIFKAN</b>\n\nSistem kembali beroperasi dengan saldo Rp " + virtualBalance.toLocaleString());
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
        losingStreak: losingStreak
      };
    },
    
    update: function() {
      return this;
    },
    
    getBetInfo: function() {
      return {
        prediction: this.prediction,
        amount: this.amount,
        level: this.level
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
