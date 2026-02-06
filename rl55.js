(function () {
  console.clear();
  console.log("🤖 WinGo Smart Trading Bot - Local Version");

  /* ========= SALDO VIRTUAL ========= */
  let virtualBalance = 502000;  // SALDO AWAL BARU: 502.000
  let totalBets = 0;
  let totalWins = 0;
  let totalLosses = 0;
  let currentStreak = 0;
  let profitLoss = 0;
  let losingStreak = 0;
  
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

  /* ========= UI ELEMENTS ========= */
  let modal = null;
  let toast = null;

  function createUI() {
    // Create modal container
    modal = document.createElement('div');
    modal.id = 'wingo-bot-modal';
    modal.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      width: 300px;
      background: white;
      border-radius: 10px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.2);
      z-index: 9999;
      font-family: Arial, sans-serif;
      overflow: hidden;
      border: 2px solid #3498db;
    `;

    // Create toast container
    toast = document.createElement('div');
    toast.id = 'wingo-toast';
    toast.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      padding: 20px 30px;
      background: white;
      border-radius: 10px;
      box-shadow: 0 4px 30px rgba(0,0,0,0.3);
      z-index: 10000;
      font-family: Arial, sans-serif;
      font-weight: bold;
      font-size: 18px;
      text-align: center;
      min-width: 200px;
      display: none;
      animation: fadeIn 0.3s ease;
    `;

    document.body.appendChild(modal);
    document.body.appendChild(toast);

    // Add CSS animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; transform: translate(-50%, -40%); }
        to { opacity: 1; transform: translate(-50%, -50%); }
      }
      @keyframes fadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
      }
      .win-toast { border: 3px solid #2ecc71; background: #d5f4e6; color: #27ae60; }
      .loss-toast { border: 3px solid #e74c3c; background: #fadbd8; color: #c0392b; }
    `;
    document.head.appendChild(style);
  }

  function updateModal() {
    const winRate = totalBets > 0 ? Math.round((totalWins / totalBets) * 100) : 0;
    
    const html = `
      <div style="background: #3498db; color: white; padding: 15px; text-align: center;">
        <strong style="font-size: 16px;">🤖 WINGO 30 DETIK</strong>
        <div style="font-size: 12px; opacity: 0.9;">Modal Awal Rp 502.000</div>
      </div>
      
      <div style="padding: 15px;">
        <div style="margin-bottom: 10px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
            <span>💰 Saldo:</span>
            <strong style="color: #2c3e50;">Rp ${virtualBalance.toLocaleString()}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
            <span>📊 P/L:</span>
            <strong style="color: ${profitLoss >= 0 ? '#27ae60' : '#e74c3c'}">
              ${profitLoss >= 0 ? '+' : ''}${profitLoss.toLocaleString()}
            </strong>
          </div>
        </div>
        
        <div style="background: #f8f9fa; padding: 10px; border-radius: 5px; margin: 10px 0;">
          <div style="text-align: center; margin-bottom: 8px; color: #3498db; font-weight: bold;">
            🎯 PREDIKSI SAAT INI
          </div>
          ${currentPrediction ? `
            <div style="display: flex; justify-content: space-between;">
              <span>Prediksi:</span>
              <strong style="color: ${currentPrediction === 'KECIL' ? '#e74c3c' : '#3498db'}">
                ${currentPrediction} ${betLabels[currentBetIndex]}
              </strong>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span>Level:</span>
              <strong>${currentBetIndex + 1} (Rp ${currentBetAmount.toLocaleString()})</strong>
            </div>
          ` : '<div style="text-align: center; color: #7f8c8d;">Belum ada prediksi</div>'}
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 10px 0;">
          <div style="background: #e8f6f3; padding: 8px; border-radius: 5px; text-align: center;">
            <div style="font-size: 12px; color: #27ae60;">✅ MENANG</div>
            <strong style="font-size: 18px;">${totalWins}</strong>
          </div>
          <div style="background: #fdedec; padding: 8px; border-radius: 5px; text-align: center;">
            <div style="font-size: 12px; color: #e74c3c;">❌ KALAH</div>
            <strong style="font-size: 18px;">${totalLosses}</strong>
          </div>
        </div>
        
        <div style="font-size: 12px; color: #7f8c8d; border-top: 1px solid #eee; padding-top: 10px;">
          <div style="display: flex; justify-content: space-between;">
            <span>Total Bet:</span>
            <span>${totalBets}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span>Win Rate:</span>
            <span>${winRate}%</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span>Streak:</span>
            <span style="color: ${currentStreak > 0 ? '#27ae60' : '#e74c3c'}">
              ${currentStreak > 0 ? 'W' : 'L'}${Math.abs(currentStreak)}
            </span>
          </div>
        </div>
      </div>
      
      <div style="background: #f8f9fa; padding: 10px 15px; font-size: 11px; color: #7f8c8d; text-align: center;">
        Aktif: ${isBotActive ? '✅' : '⏸️'} | Data: ${historicalData.length} periode
      </div>
    `;
    
    modal.innerHTML = html;
  }

  function showToast(message, isWin) {
    toast.textContent = message;
    toast.className = isWin ? 'win-toast' : 'loss-toast';
    toast.style.display = 'block';
    
    setTimeout(() => {
      toast.style.display = 'none';
    }, 3000);
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

  /* ========= FUNGSI PREDIKSI ========= */
  function getPrediction() {
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
    
    const randomFactor = Math.random();
    if (analysis.kecilTrend10 > 0.55 && randomFactor < 0.7) {
      return "BESAR";
    } else if (analysis.besarTrend10 > 0.55 && randomFactor < 0.7) {
      return "KECIL";
    } else {
      return lastResult === "KECIL" ? "BESAR" : "KECIL";
    }
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
      
      console.log(`🔄 Saldo direset ke 502.000, kembali ke Level 1`);
      
      // Show reset toast
      showToast("🔄 Saldo direset ke Rp 502.000", true);
    }
    
    // Kurangi saldo untuk taruhan
    virtualBalance -= currentBetAmount;
    totalBets++;
    dailyStats.bets++;
    dailyStats.profit -= currentBetAmount;
    
    isBetPlaced = true;
    currentPrediction = getPrediction();
    
    console.log(`🎯 Prediksi dibuat: ${currentPrediction} ${betLabels[currentBetIndex]}`);
    
    // Update modal
    updateModal();
    
    return true;
  }

  function processResult(result, apiData) {
    if (!isBetPlaced || !isBotActive) return false;
    
    const isWin = currentPrediction === result;
    
    console.log(`🔍 HASIL: ${result} (${isWin ? 'WIN' : 'LOSS'})`);
    
    if (isWin) {
      const consecutiveLossesBeforeWin = losingStreak;
      
      virtualBalance += (currentBetAmount * 2);
      totalWins++;
      currentStreak = currentStreak > 0 ? currentStreak + 1 : 1;
      losingStreak = 0;
      
      dailyStats.wins++;
      dailyStats.profit += (currentBetAmount * 2);
      
      console.log(`✅ MENANG! +Rp ${(currentBetAmount * 2).toLocaleString()}`);
      
      // Show win toast
      showToast(`✅ MENANG! +Rp ${(currentBetAmount * 2).toLocaleString()}`, true);
      
      currentBetIndex = 0;
      currentBetAmount = betSequence[0];
      
    } else {
      totalLosses++;
      currentStreak = currentStreak < 0 ? currentStreak - 1 : -1;
      losingStreak++;
      
      dailyStats.losses++;
      
      console.log(`❌ KALAH! -Rp ${currentBetAmount.toLocaleString()}`);
      
      // Show loss toast
      showToast(`❌ KALAH! -Rp ${currentBetAmount.toLocaleString()}`, false);
      
      // Naikkan level setelah kalah
      if (currentBetIndex < betSequence.length - 1) {
        currentBetIndex++;
        currentBetAmount = betSequence[currentBetIndex];
        console.log(`   Naik ke Level ${currentBetIndex + 1}`);
      } else {
        console.log(`   ⚠️ Sudah level maksimal`);
      }
    }
    
    profitLoss = virtualBalance - 502000;
    isBetPlaced = false;
    
    // Update modal
    updateModal();
    
    return isWin;
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
      
      console.log(`📊 PERIODE ${issueNumber.slice(-3)}: ANGKA ${number} (${result})`);
      
      analyzeTrendData(list);
      
      if (isBetPlaced) {
        const apiData = {
          issueNumber: item.issueNumber,
          number: item.number,
          colour: item.colour,
          premium: item.premium
        };
        
        processResult(result, apiData);
      }
      
      setTimeout(() => {
        if (placeBet()) {
          console.log(`🎯 Taruhan ditempatkan untuk periode berikutnya`);
        }
        
        lastProcessedIssue = issueNumber;
        isProcessing = false;
        
        // Update modal
        updateModal();
      }, 1000);
      
    } catch (error) {
      console.error('Error:', error);
      isProcessing = false;
    }
  }

  function processGameIssueData(data) {
    try {
      if (data?.data?.issueNumber) {
        nextIssueNumber = data.data.issueNumber;
        console.log(`📅 Periode berikutnya: ${nextIssueNumber}`);
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
              console.warn('⚠️ Gagal parse JSON');
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
    
    console.log("🔄 Bot direset ke saldo 502.000");
    showToast("🔄 Bot direset ke saldo awal", true);
    updateModal();
  }

  function addBalance(amount) {
    virtualBalance += amount;
    console.log(`💰 +${amount.toLocaleString()} | Saldo: ${virtualBalance.toLocaleString()}`);
    showToast(`💰 +Rp ${amount.toLocaleString()} ditambahkan`, true);
    updateModal();
  }

  /* ========= STARTUP ========= */
  console.log(`
🤖 WINGO SMART TRADING BOT - LOCAL VERSION
💰 Saldo awal: 502.000 (Support 7 level)
🧠 Analisis: Simple Trend Analysis
📊 Strategi: Martingale Baru (7 Level Recovery)
📱 UI: Modal tampilan real-time
🎯 Popup hasil menang/kalah

✅ Bot siap berjalan dengan tampilan lokal!
`);

  // Create UI elements
  createUI();
  updateModal();

  // Start first bet
  setTimeout(() => {
    if (placeBet()) {
      console.log("🎯 Taruhan pertama ditempatkan");
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
      showToast("✅ Bot diaktifkan", true);
      updateModal();
    },
    deactivate: () => {
      isBotActive = false;
      console.log("⏸️ Bot dinonaktifkan");
      showToast("⏸️ Bot dinonaktifkan", false);
      updateModal();
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
      `);
    },
    history: () => {
      console.log(`📜 Data Historis (${historicalData.length} periode):`);
      historicalData.slice(0, 10).forEach((d, i) => {
        const shortIssue = d.issue?.slice(-3) || '???';
        console.log(`   ${i+1}. ${shortIssue}: ${d.number} (${d.result}) ${d.colour}`);
      });
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
      updateModal();
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
        nextIssue: nextIssueNumber
      };
    }
  };

  console.log("✅ UI Bot berjalan! Lihat modal di pojok kanan atas.");
  console.log("📊 Akses data via: window.wingoBetData");
  console.log("🎮 Kontrol via: window.wingoBot");
})();