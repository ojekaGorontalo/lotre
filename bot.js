// bot.js
const TelegramBot = require('node-telegram-bot-api');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// ========== KONFIGURASI ==========
// Ambil token bot dari environment variable (disarankan)
const token = process.env.BOT_TOKEN;
if (!token) {
  console.error('❌ BOT_TOKEN tidak ditemukan di environment variable');
  process.exit(1);
}

// ========== INISIALISASI BOT ==========
const bot = new TelegramBot(token, { polling: true });
console.log('✅ Bot Telegram berjalan dengan polling');

// ========== INISIALISASI FIREBASE ADMIN ==========
let db;
try {
  // Pastikan file serviceAccountKey.json berada di direktori yang sama
  const serviceAccount = require('./serviceAccountKey.json');
  
  // Ganti dengan URL database Firebase Anda
  const databaseURL = 'https://steady-fin-368617-default-rtdb.firebaseio.com/';
  
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: databaseURL
  });
  
  db = admin.database();
  console.log('✅ Firebase Admin SDK initialized');
} catch (error) {
  console.error('❌ Gagal inisialisasi Firebase:', error);
  process.exit(1);
}

// ========== EXPOSE GLOBAL VARIABLES ==========
// Variabel bot dan db dapat diakses oleh script remote melalui global.bot dan global.db
global.bot = bot;
global.db = db;
console.log('🌐 global.bot dan global.db telah di-set');

// ========== HANDLER PERINTAH ==========

// Handler /uid (sesuai dengan kode asli, tanpa perubahan)
bot.onText(/\/uid (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const uid = match[1];

  try {
    const snap = await db.ref('uids/' + uid).once('value');

    if (snap.exists()) {
      const data = snap.val();

      bot.sendMessage(
        chatId,
        `🔎 UID Ditemukan\n\n` +
        `UID: ${uid}\n` +
        `Nick: ${data.nickName || '-'}\n` +
        `Level: ${data.lv || 0}`
      );
    } else {
      bot.sendMessage(chatId, '❌ UID tidak ditemukan');
    }
  } catch (err) {
    console.log('🔥 Firebase Error:', err);
    bot.sendMessage(chatId, '⚠️ Error Firebase\n' + err.message);
  }
});

// Contoh handler untuk menjalankan remote script via eval
// (sesuaikan dengan mekanisme loading script Anda)
bot.onText(/\/run (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const scriptUrl = match[1];

  try {
    // Di sini Anda bisa fetch script dari URL (misal dengan axios atau fetch)
    // Lalu eval kode tersebut. Contoh sederhana:
    // const code = await fetch(scriptUrl).then(res => res.text());
    // eval(code);  // Kode di eval akan punya akses ke global.bot dan global.db

    bot.sendMessage(chatId, 'Fitur eval remote script dapat diimplementasikan di sini.');
  } catch (error) {
    bot.sendMessage(chatId, 'Error: ' + error.message);
  }
});

// Handler pesan default (hanya untuk logging)
bot.on('message', (msg) => {
  console.log('Pesan diterima:', msg.text);
});

console.log('🤖 Bot siap digunakan');
