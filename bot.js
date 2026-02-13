console.log("✅ Remote script aktif");

bot.onText(/\/uid (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const uid = match[1];

  try {
    const snap = await db.ref("uids/" + uid).once("value");

    if (snap.exists()) {
      const data = snap.val();

      bot.sendMessage(chatId,
        `🔎 UID Ditemukan\n\n` +
        `UID: ${uid}\n` +
        `Nick: ${data.nickName || '-'}\n` +
        `Level: ${data.lv || 0}`
      );
    } else {
      bot.sendMessage(chatId, "❌ UID tidak ditemukan");
    }
  } catch (err) {
    bot.sendMessage(chatId, "⚠️ Error Firebase");
  }
});
