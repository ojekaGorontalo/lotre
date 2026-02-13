const TelegramBot = require('node-telegram-bot-api');
const https = require('https');

const token = 'TOKEN_KAK';
const bot = new TelegramBot(token, { polling: true });

// fungsi ambil file github
function loadGithubScript(url) {
  https.get(url, (res) => {
    let data = '';

    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        eval(data); // jalankan script
        console.log("Script GitHub loaded ✅");
      } catch (err) {
        console.log("Error script:", err.message);
      }
    });
  });
}

// load saat start
loadGithubScript("https://raw.githubusercontent.com/username/repo/main/script.js");

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "Bot aktif kak ✅");
});
