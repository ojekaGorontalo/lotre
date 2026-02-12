(function () {

  console.clear();

  console.log("🤖 WinGo Smart Trading Bot - New System v6.0 (Updated Formula)");



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

  let virtualBalance = 2916000;  // SALDO AWAL BARU: 2.916.000

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
  1000,
  3000,
  8000,
  24000,
  72000,
  216000,
  648000,
  11940000
];

  

  const betLabels = [

    "1K",

    "3K", 

    "8K",

    "24K",

    "72K",

    "216K",

    "648K",

    "1944K"

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

  let currentReverseMode = false; // Mode reverse setelah 2x kalah

  let consecutiveReverseTriggers = 0; // Hitung berapa kali trigger reverse

  let reverseModeWins = 0;

  let reverseModeLosses = 0;



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

      reverseMode: currentReverseMode,

      reverseTriggers: consecutiveReverseTriggers,

      reverseModeWins: reverseModeWins,

      reverseModeLosses: reverseModeLosses,

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

    console.log(`   - Reverse Mode: ${currentReverseMode}`);

    

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

    const startupMessage = `🤖 <b>WINGO SMART TRADING BOT v6.0 - SYSTEM FORMULA BARU</b>\n\n` +

                          `Sistem analisis menggunakan rumus baru:\n\n` +

                          `🧮 <b>RUMUS ANALISIS BARU:</b>\n` +

                          `1. Ambil angka pertama dari data terbaru\n` +

                          `2. Ambil digit terakhir dari issue ke-5\n` +

                          `3. Jumlahkan kedua angka tersebut\n` +

                          `4. Hasil 0-4: KECIL, 5-9: BESAR\n\n` +

                          `🔄 <b>SISTEM REVERSE TERBARU:</b>\n` +

                          `• Jika kalah 2x berturut-turut → AKTIFKAN REVERSE\n` +

                          `• Reverse: KECIL jadi BESAR, BESAR jadi KECIL\n` +

                          `• Menang dalam reverse mode → TETAP dalam reverse mode\n` +

                          `• Kalah 2x dalam reverse mode → KEMBALI ke mode normal\n\n` +

                          `💰 <b>SISTEM MARTINGALE 8 LEVEL:</b>\n` +

                          `1. Rp 1.000\n` +

                          `2. Rp 3.000\n` +

                          `3. Rp 8.000\n` +

                          `4. Rp 24.000\n` +

                          `5. Rp 72.000\n` +

                          `6. Rp 216.000\n` +

                          `7. Rp 648.000\n` +

                          `8. Rp 1.944.000\n\n` +

                          `📊 Total saldo: 2.916.000 (cukup untuk semua level)\n` +

                          `🔄 Auto-reset saat saldo habis\n\n` +

                          `⚠️ <b>HATI-HATI:</b> Trading punya risiko tinggi!`;

    

    sendTelegram(startupMessage);

  }



  /* ========= ANALISIS RUMUS BARU ========= */

  function calculateNewPrediction() {

    if (historicalData.length < 5) {

      console.log("⚠️ Data kurang dari 5, pakai default");

      return "KECIL";

    }

    

    try {

      // Ambil angka pertama (data terbaru)

      const firstNumber = parseInt(historicalData[0].number);

      console.log(`🔢 Angka pertama (terbaru): ${firstNumber}`);

      

      // Ambil issue ke-5 dan digit terakhirnya

      const fifthIssue = historicalData[4].issue;

      const lastDigit = parseInt(fifthIssue.slice(-1));

      console.log(`🔢 Issue ke-5: ${fifthIssue} → digit terakhir: ${lastDigit}`);

      

      // Hitung jumlah

      const sum = firstNumber + lastDigit;

      const lastDigitSum = sum % 10;

      

      console.log(`🔢 PERHITUNGAN: ${firstNumber} + ${lastDigit} = ${sum} → digit terakhir ${lastDigitSum}`);

      

      // Tentukan prediksi dasar

      let basePrediction = (lastDigitSum <= 4) ? "KECIL" : "BESAR";

      

      console.log(`🔢 Prediksi dasar: ${basePrediction} (${lastDigitSum} = ${lastDigitSum <= 4 ? '0-4: KECIL' : '5-9: BESAR'})`);

      

      // Jika dalam mode reverse, balikkan prediksi

      if (currentReverseMode) {

        const reversedPrediction = basePrediction === "KECIL" ? "BESAR" : "KECIL";

        console.log(`🔄 REVERSE MODE: ${basePrediction} → ${reversedPrediction}`);

        return reversedPrediction;

      }

      

      return basePrediction;

    } catch (error) {

      console.error("❌ Error dalam perhitungan:", error);

      return "KECIL";

    }

  }



  /* ========= FUNGSI getPrediction() YANG BARU ========= */

  function getPrediction() {

    // Gunakan rumus baru

    const prediction = calculateNewPrediction();

    

    console.log(`🎯 FINAL PREDIKSI: ${prediction}`);

    console.log(`   Reverse Mode: ${currentReverseMode}`);

    console.log(`   Losing Streak: ${losingStreak}`);

    

    return prediction;

  }



  /* ========= FUNGSI analyzeTrendData ========= */

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

    

    // Simpan maksimal 20 data terbaru

    historicalData = [...results, ...historicalData].slice(0, 20);

    

    // Tampilkan info data terbaru

    if (historicalData.length >= 5) {

      const recentNumbers = historicalData.slice(0, 5).map(d => d.number);

      console.log(`📊 5 DATA TERBARU: ${recentNumbers.join(', ')}`);

      

      // Tampilkan issue untuk debugging

      console.log(`📋 Issue ke-1: ${historicalData[0].issue} → angka: ${historicalData[0].number}`);

      console.log(`📋 Issue ke-5: ${historicalData[4].issue} → digit terakhir: ${historicalData[4].issue.slice(-1)}`);

    }

  }



  /* ========= LOGIKA REVERSE BARU ========= */

  function updateReverseMode(isWin) {

    console.log(`🔄 UPDATE REVERSE MODE: Hasil ${isWin ? 'MENANG' : 'KALAH'}, Losing Streak: ${losingStreak}`);
    
    if (currentReverseMode) {
      // SAAT DALAM MODE REVERSE
      if (isWin) {
        // Menang dalam mode reverse: TETAP dalam reverse mode
        console.log(`   ✅ MENANG dalam Reverse Mode: Tetap di Reverse Mode`);
        reverseModeWins++;
        losingStreak = 0; // Reset losing streak karena menang
      } else {
        // Kalah dalam mode reverse
        losingStreak++;
        reverseModeLosses++;
        console.log(`   ❌ KALAH dalam Reverse Mode: Losing Streak = ${losingStreak}`);
        
        // Jika kalah 2x berturut dalam mode reverse, kembali ke mode normal
        if (losingStreak >= 2) {
          console.log(`   🔄 KALAH 2x dalam Reverse Mode: Kembali ke Mode Normal`);
          currentReverseMode = false;
          consecutiveReverseTriggers++;
          losingStreak = 0; // Reset streak setelah kembali ke mode normal
          
          // Kirim notifikasi
          const backToNormalMessage = `🔄 <b>KEMBALI KE MODE NORMAL!</b>\n\n` +
                                    `📉 Telah kalah 2x berturut-turut dalam Reverse Mode\n` +
                                    `🎯 Sistem kembali menggunakan prediksi normal\n` +
                                    `💰 Siklus dimulai kembali dari awal`;
          
          setTimeout(() => {
            sendTelegram(backToNormalMessage);
          }, 1000);
        }
      }
    } else {
      // SAAT DALAM MODE NORMAL
      if (isWin) {
        // Menang dalam mode normal: reset streak
        losingStreak = 0;
        console.log(`   ✅ MENANG dalam Mode Normal`);
      } else {
        // Kalah dalam mode normal
        losingStreak++;
        console.log(`   ❌ KALAH dalam Mode Normal: Losing Streak = ${losingStreak}`);
        
        // Jika kalah 2x berturut dalam mode normal, aktifkan reverse
        if (losingStreak >= 2) {
          console.log(`   🔄 KALAH 2x BERTURUT: Aktifkan Reverse Mode`);
          currentReverseMode = true;
          consecutiveReverseTriggers++;
          reverseModeWins = 0;
          reverseModeLosses = 0;
          
          // Kirim notifikasi
          const reverseMessage = `🔄 <b>REVERSE MODE AKTIF!</b>\n\n` +
                               `📉 Telah mengalami ${losingStreak} kekalahan berturut-turut\n` +
                               `🎯 Sistem sekarang menggunakan prediksi terbalik\n` +
                               `💰 Tetap ikuti sistem untuk recovery!`;
          
          setTimeout(() => {
            sendTelegram(reverseMessage);
          }, 1000);
        }
      }
    }
    
    console.log(`   Mode Sekarang: ${currentReverseMode ? 'REVERSE' : 'NORMAL'}`);
    console.log(`   Reverse Stats: ${reverseModeWins}W / ${reverseModeLosses}L`);
  }



  /* ========= FUNGSI PESAN ========= */

  function createMotivationMessage(lossCount) {

    switch(lossCount) {

      case 3:

        return `💪 <b>TERUS SEMANGAT!</b>\n\n` +

               `📉 Meskipun sudah kalah ${losingStreak}x berturut-turut,\n` +

               `🔄 sistem reverse akan segera aktif jika mencapai 2x kalah.\n\n` +

               `🎯 <b>Tetap ikuti sistem martingale</b>\n` +

               `💰 Level: ${currentBetIndex + 1} (Rp ${currentBetAmount.toLocaleString()})\n` +

               `💪 Kesabaran adalah kunci!`;

               

      case 5:

        return `🔥 <b>PERTAHANKAN!</b>\n\n` +

               `📊 Sudah ${losingStreak} kekalahan beruntun,\n` +

               `🔄 Reverse mode: ${currentReverseMode ? 'AKTIF' : 'NONAKTIF'}\n\n` +

               `🎯 <b>Reverse biasanya aktif setelah 2x kalah berturut</b>\n` +

               `💰 Level: ${currentBetIndex + 1} (Rp ${currentBetAmount.toLocaleString()})`;

               

      case 7:

        return `🚀 <b>HAMPIR SAMPAI!</b>\n\n` +

               `📉 ${losingStreak} kekalahan beruntun - ini jarang terjadi!\n` +

               `📊 <b>Peluang reversal sangat tinggi sekarang</b>\n\n` +

               `🎯 <b>Reverse mode akan membantu recovery</b>\n` +

               `💰 Level: ${currentBetIndex + 1} (Rp ${currentBetAmount.toLocaleString()})\n` +

               `💎 Kesempatan recovery besar di depan!`;

               

      default:

        return "";

    }

  }



  function createWinAfterLossMessage(consecutiveLosses) {

    const reverseInfo = currentReverseMode ? 

      ` (dengan bantuan Reverse Mode)` : 

      ` (tanpa Reverse Mode)`;

    

    return `🎉 <b>SELAMAT! KEBERHASILAN SETELAH KESABARAN</b>\n\n` +

           `✅ Anda berhasil menang setelah ${consecutiveLosses} kekalahan beruntun${reverseInfo}\n` +

           `💎 Ini membuktikan pentingnya konsistensi dan kesabaran\n\n` +

           `🏆 <b>PELAJARAN BERHARGA:</b>\n` +

           `1️⃣ Disiplin mengikuti sistem membuahkan hasil\n` +

           `2️⃣ Sabar menunggu reversal adalah kunci\n` +

           `3️⃣ Reverse mode membantu recovery setelah 2x kalah\n` +

           `4️⃣ Trust the process, trust the system\n\n` +

           `💰 Saldo sekarang: Rp ${virtualBalance.toLocaleString()}\n` +

           `🔄 Kembali ke Level 1 untuk memulai siklus baru\n\n` +

           `🔥 <i>Teruskan semangat dan disiplin Anda!</i>`;

  }



  function createDonationMessage() {

    const winRate = totalBets > 0 ? Math.round((totalWins / totalBets) * 100) : 0;

    

    return `🏆 <b>CAPAIAN ${totalWins} KEMENANGAN!</b>\n\n` +

           `✅ Total ${totalWins} kemenangan sejak bot mulai\n` +

           `📊 Win Rate: ${winRate}%\n` +

           `🔄 Reverse Triggers: ${consecutiveReverseTriggers}x\n` +

           `🔄 Reverse Mode Wins: ${reverseModeWins}\n\n` +

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

           `├── 🔄 Reverse Triggers: ${consecutiveReverseTriggers}\n` +

           `├── 📈 P/L: ${profitLoss >= 0 ? '🟢' : '🔴'} ${profitLoss >= 0 ? '+' : ''}${profitLoss.toLocaleString()}\n` +

           `└── 🔥 Streak Terakhir: ${currentStreak > 0 ? 'W' + currentStreak : 'L' + Math.abs(currentStreak)}\n\n` +

           `💪 <b>BOT TERUS BERJALAN DENGAN SALDO BARU</b>\n` +

           `📊 Data reset telah dikirim ke database Firebase`;

  }



  function createPredictionMessage(nextIssueShort) {

    const betLabel = betLabels[currentBetIndex];

    

    let message = `<b>WINGO 30s SALDO AWAL 502.000</b>\n`;

    message += `<b>🆔 PERIODE ${nextIssueShort}</b>\n`;

    message += `<b>🎯 PREDIKSI B/K: ${currentPrediction} ${betLabel}</b>\n`;

    message += `<b>🎯 PREDIKSI B/K: ${currentPrediction} ${betLabel}</b>\n`;

    message += `<b>🎯 PREDIKSI B/K: ${currentPrediction} ${betLabel}</b>\n`;

    message += `━━━━━━━━━━━━━━━━━\n`;

    message += `<b>📊 LEVEL: ${currentBetIndex + 1}/${betSequence.length}</b>\n`;

    message += `<b>🔄 REVERSE: ${currentReverseMode ? 'AKTIF' : 'NONAKTIF'}</b>\n`;

    message += `<b>💳 SALDO: Rp ${virtualBalance.toLocaleString()}</b>\n`;

    message += `<b>📈 P/L: ${profitLoss >= 0 ? '🟢' : '🔴'} ${profitLoss >= 0 ? '+' : ''}${profitLoss.toLocaleString()}</b>\n\n`;

    

    // Tambahkan info rumus jika ada data cukup

    if (historicalData.length >= 5) {

      const firstNum = historicalData[0].number;

      const fifthIssueLast = historicalData[4].issue.slice(-1);

      const sum = firstNum + parseInt(fifthIssueLast);

      const lastDigit = sum % 10;

      

      message += `🧮 <b>RUMUS: ${firstNum} + ${fifthIssueLast} = ${sum} → ${lastDigit} (${lastDigit <= 4 ? 'KECIL' : 'BESAR'})</b>\n`;

    }

    

    // Tambahkan info reverse stats jika dalam mode reverse

    if (currentReverseMode) {

      message += `🔄 <b>REVERSE STATS: ${reverseModeWins}W / ${reverseModeLosses}L</b>\n`;

    }

    

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

      currentReverseMode = false;

      consecutiveReverseTriggers = 0;

      reverseModeWins = 0;

      reverseModeLosses = 0;

      

      // Reset issue prediksi

      predictedIssue = null;

      predictedAt = null;

      

      // Reset data historis

      historicalData = [];

      lastMotivationSentAtLoss = 0;

      lastDonationMessageAtWin = 0;

      

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

    

    console.log(`🎯 Prediksi dibuat: ${currentPrediction} (Reverse: ${currentReverseMode})`);

    

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

    console.log(`   Prediction: ${currentPrediction} (Reverse: ${currentReverseMode})`);

    

    if (isWin) {

      const consecutiveLossesBeforeWin = losingStreak;

      

      virtualBalance += (currentBetAmount * 2);

      totalWins++;

      currentStreak = currentStreak > 0 ? currentStreak + 1 : 1;

      lastMotivationSentAtLoss = 0;

      

      dailyStats.wins++;

      dailyStats.profit += (currentBetAmount * 2);

      

      console.log(`✅ MENANG! Prediksi ${currentPrediction} untuk issue ${apiData.issueNumber}`);

      

      const winningBetAmount = currentBetAmount;

      

      sendResultToFirebase(apiData, currentPrediction, true);

      

      // UPDATE REVERSE MODE

      updateReverseMode(true);

      

      // Reset level hanya jika dalam mode normal DAN streak kalah sudah teratasi

      if (!currentReverseMode && losingStreak === 0) {

        currentBetIndex = 0;

        currentBetAmount = betSequence[0];

        console.log(`   ✅ Reset ke Level 1 (menang dalam mode normal, streak teratasi)`);

      } else if (currentReverseMode) {

        // Dalam mode reverse, turun 1 level jika memungkinkan

        if (currentBetIndex > 0) {

          currentBetIndex--;

          currentBetAmount = betSequence[currentBetIndex];

          console.log(`   🔽 Turun ke Level ${currentBetIndex + 1} (menang dalam mode reverse)`);

        } else {

          console.log(`   📍 Tetap di Level 1 (sudah level terendah)`);

        }

      }

      

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

      console.log(`   Losing Streak: ${losingStreak}`);

      console.log(`   Mode: ${currentReverseMode ? 'REVERSE' : 'NORMAL'}`);

      

      sendResultToFirebase(apiData, currentPrediction, false);

      

      // UPDATE REVERSE MODE

      updateReverseMode(false);

      

      // Naikkan level setelah kalah (baik mode normal maupun reverse)

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

      reverseMode: currentReverseMode,

      reverseTriggers: consecutiveReverseTriggers,

      reverseModeWins: reverseModeWins,

      reverseModeLosses: reverseModeLosses,

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

        console.log(`   ${isWin ? '✅ MENANG' : '❌ KALAH'} | Saldo: ${virtualBalance.toLocaleString()} | Reverse: ${currentReverseMode}`);

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

    

    predictedIssue = null;

    predictedAt = null;

    

    // Reset reverse mode

    currentReverseMode = false;

    consecutiveReverseTriggers = 0;

    reverseModeWins = 0;

    reverseModeLosses = 0;

    

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

    

    console.log("🔄 Bot direset ke saldo 502.000 dan diaktifkan");

    

    const startupMsg = `🔄 <b>BOT DIRESET DAN DIAKTIFKAN (FORMULA BARU)</b>\n\n` +

                      `💰 Saldo: Rp 502.000\n` +

                      `🎯 Mulai dari Level 1 (Rp 1.000)\n` +

                      `🧮 Rumus: Angka pertama + digit terakhir issue ke-5\n` +

                      `🔄 Reverse: Aktif setelah 2x kalah berturut\n` +

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

🤖 WINGO SMART TRADING BOT v6.0 - NEW FORMULA SYSTEM

💰 Saldo awal: 502.000 (Support 8 level)

🧮 Analisis: Rumus Baru (Angka pertama + digit terakhir issue ke-5)

📊 Strategi: Martingale 8 Level dengan Reverse Mode

📡 Firebase: Data dikirim ke wingo-bot-analytics

🔒 ISSUE SINKRONISASI: AKTIF



🧮 RUMUS BARU:

   Ambil angka pertama dari data terbaru

   Ambil digit terakhir dari issue ke-5

   Jumlahkan kedua angka

   Hasil 0-4: KECIL, 5-9: BESAR



🔄 SISTEM REVERSE TERBARU:

   Kalah 2x berturut → AKTIFKAN REVERSE

   Reverse: KECIL ↔ BESAR (terbalik)

   Menang dalam reverse → TETAP dalam reverse

   Kalah 2x dalam reverse → KEMBALI ke mode normal



📊 URUTAN TARUHAN:

   1. Rp 1.000     (x1)

   2. Rp 3.000     (x3)

   3. Rp 7.000     (x7)

   4. Rp 15.000    (x15)

   5. Rp 31.000    (x31)

   6. Rp 63.000    (x63)

   7. Rp 127.000   (x127)

   8. Rp 255.000   (x255)



📨 Telegram Groups:

   • Primary Group: ${TELEGRAM_GROUPS.primary}

   • Secondary Groups: ${TELEGRAM_GROUPS.secondary.length > 0 ? TELEGRAM_GROUPS.secondary.join(', ') : 'Tidak ada'}

   • Multi-Group Sending: ${enableMultipleGroups ? 'AKTIF' : 'NONAKTIF'}



🔥 FITUR BARU:

   • Rumus Analisis Baru

   • Reverse Mode setelah 2x kalah

   • Menang dalam reverse → tetap reverse

   • Kalah 2x dalam reverse → kembali normal

   • Saldo Awal: 502.000

   • 8 Level Martingale

   • Bot TIDAK PERNAH BERHENTI otomatis

   • Reset otomatis saat saldo habis



✅ Bot siap berjalan dengan FORMULA BARU!

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

🔄 Reverse Mode: ${currentReverseMode}

🔄 Reverse Stats: ${reverseModeWins}W / ${reverseModeLosses}L

🔢 Reverse Triggers: ${consecutiveReverseTriggers}

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

    testCalc: () => {

      if (historicalData.length >= 5) {

        const firstNum = historicalData[0].number;

        const fifthIssueLast = historicalData[4].issue.slice(-1);

        const sum = firstNum + parseInt(fifthIssueLast);

        const lastDigit = sum % 10;

        const basePrediction = lastDigit <= 4 ? "KECIL" : "BESAR";

        const finalPrediction = currentReverseMode ? 

          (basePrediction === "KECIL" ? "BESAR" : "KECIL") : 

          basePrediction;

        

        console.log(`

🧪 TEST PERHITUNGAN:

   Data ke-1: ${firstNum} (terbaru)

   Issue ke-5: ${historicalData[4].issue} → digit terakhir: ${fifthIssueLast}

   Perhitungan: ${firstNum} + ${fifthIssueLast} = ${sum}

   Digit terakhir: ${lastDigit}

   Prediksi dasar: ${basePrediction} (${lastDigit} = ${lastDigit <= 4 ? '0-4: KECIL' : '5-9: BESAR'})

   Reverse Mode: ${currentReverseMode}

   Prediksi final: ${finalPrediction}

        `);

      } else {

        console.log("❌ Data kurang dari 5");

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

        losingStreak: losingStreak,

        reverseMode: currentReverseMode,

        reverseTriggers: consecutiveReverseTriggers,

        reverseModeWins: reverseModeWins,

        reverseModeLosses: reverseModeLosses

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

        reverseMode: currentReverseMode,

        reverseStats: `${reverseModeWins}W / ${reverseModeLosses}L`

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
