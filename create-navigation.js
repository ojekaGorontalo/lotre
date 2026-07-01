(function() {
    'use strict';

    // ================================================================
    // 1. GLOBAL SETTINGS (default) + betLevels dinamis
    // ================================================================
    if (!window.BotSettings) {
        window.BotSettings = {
            targetProfit: 0,
            stopLoss: 0,
            maxBetLevel: 8,          // tetap dipakai sebagai batas maksimal level yang boleh dipakai (opsional)
            maxWinStreak: 0,
            maxLossStreak: 0,
            sessionTimeout: 0,
            minBetTime: 8,
            maxBetTime: 25,
            betCooldown: 10000,
            autoConfirm: true,
            betLevels: [1000, 3000, 7000, 15000, 31000, 63000, 127000, 247000] // default
        };
    }

    // Fungsi kirim ke Kodular
    function sendToKodular(message) {
        try {
            if (window.AppInventor && window.AppInventor.setWebViewString) {
                window.AppInventor.setWebViewString(message);
                console.log('📤 Pesan "' + message + '" dikirim ke Kodular');
            } else if (window.AppInventor) {
                window.AppInventor.WebViewString = message;
                console.log('📤 Pesan "' + message + '" diset ke WebViewString');
            } else {
                console.log('Pesan "' + message + '" (tidak ada AppInventor)');
            }
        } catch(e) {
            console.error('Error mengirim ke Kodular:', e);
        }
    }

    // ================================================================
    // 2. TOAST NOTIFICATION (sama)
    // ================================================================
    function showToast(message, type) {
        var old = document.getElementById('wingoToast');
        if (old) old.remove();

        var toast = document.createElement('div');
        toast.id = 'wingoToast';
        var bgColor = '#1e293b';
        if (type === 'success') bgColor = '#22c55e';
        else if (type === 'error') bgColor = '#ef4444';
        else if (type === 'info') bgColor = '#3b82f6';

        toast.style.cssText = `
            position: fixed;
            bottom: 90px;
            left: 50%;
            transform: translateX(-50%);
            background: ${bgColor};
            color: white;
            padding: 14px 24px;
            border-radius: 14px;
            font-size: 15px;
            font-weight: 600;
            box-shadow: 0 8px 30px rgba(0,0,0,0.5);
            z-index: 99999;
            max-width: 90%;
            text-align: center;
            transition: opacity 0.3s ease, transform 0.3s ease;
            font-family: 'Inter', -apple-system, sans-serif;
            border: 1px solid rgba(255,255,255,0.15);
            pointer-events: none;
            white-space: pre-line;
            line-height: 1.5;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(function() {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(-50%) translateY(10px)';
            setTimeout(function() { toast.remove(); }, 400);
        }, 4000);
    }

    // ================================================================
    // 3. BUAT NAVIGASI (sama seperti sebelumnya)
    // ================================================================
    function createNav() {
        if (document.getElementById('wingo-nav-container')) return;
        console.log('🕹️ Wingo Navigation Active');

        var nav = document.createElement('div');
        nav.id = 'wingo-nav-container';
        nav.style.cssText = `
            position: fixed;
            bottom: 0;
            left: 0;
            width: 100%;
            background: rgba(0,0,0,0.85);
            backdrop-filter: blur(8px);
            display: flex;
            flex-wrap: wrap;
            justify-content: space-around;
            padding: 8px 0;
            z-index: 99999;
            border-top: 1px solid rgba(255,255,255,0.1);
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        `;

        function createButton(text, color, onClick) {
            var btn = document.createElement('button');
            btn.innerText = text;
            btn.style.cssText = `
                background: ${color};
                border: none;
                border-radius: 8px;
                color: white;
                padding: 6px 10px;
                font-size: 12px;
                font-weight: bold;
                cursor: pointer;
                min-width: 50px;
                margin: 4px 2px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                transition: transform 0.1s;
                flex: 1 0 auto;
                max-width: 100px;
            `;
            btn.addEventListener('click', onClick);
            btn.addEventListener('touchstart', function() {
                this.style.transform = 'scale(0.95)';
            });
            btn.addEventListener('touchend', function() {
                this.style.transform = 'scale(1)';
            });
            return btn;
        }

        var keepOnBtn = createButton('Keep On', '#4CAF50', function() {
            sendToKodular('keepOn');
        });
        var startBtn = createButton('Start', '#2196F3', function() {
            sendToKodular('start');
        });
        var stopBtn = createButton('Stop', '#f44336', function() {
            sendToKodular('stop');
        });
        var resetBtn = createButton('Reset', '#FF9800', function() {
            sendToKodular('reset');
        });
        var statusBtn = createButton('Status', '#9C27B0', function() {
            sendToKodular('status');
        });
        var settingBtn = createButton('Setting', '#607D8B', function() {
            showSettings();
        });

        nav.appendChild(keepOnBtn);
        nav.appendChild(startBtn);
        nav.appendChild(stopBtn);
        nav.appendChild(resetBtn);
        nav.appendChild(statusBtn);
        nav.appendChild(settingBtn);

        document.body.appendChild(nav);
        document.body.style.paddingBottom = '70px';
        console.log('✅ Wingo navigation added');
    }

    // ================================================================
    // 4. MODAL SETTING (LENGKAP + LEVEL DINAMIS)
    // ================================================================
    function showSettings() {
        var existing = document.getElementById('wingo-settings-overlay');
        if (existing) {
            existing.remove();
            return;
        }

        var overlay = document.createElement('div');
        overlay.id = 'wingo-settings-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.7);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 100000;
            backdrop-filter: blur(4px);
            padding: 16px;
            box-sizing: border-box;
        `;

        var panel = document.createElement('div');
        panel.style.cssText = `
            background: #1e1e1e;
            border-radius: 16px;
            padding: 24px;
            max-width: 600px;
            width: 100%;
            color: white;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            box-shadow: 0 8px 32px rgba(0,0,0,0.5);
            max-height: 90vh;
            overflow-y: auto;
            box-sizing: border-box;
        `;

        var title = document.createElement('h3');
        title.innerText = '⚙️ Pengaturan Bot WinGo';
        title.style.cssText = 'text-align:center; margin:0 0 16px 0; color:#fff; font-size:20px;';
        panel.appendChild(title);

        // === Helper: Input grup dengan deskripsi ===
        function addInputGroup(labelText, id, placeholder, type, defaultValue, description) {
            var container = document.createElement('div');
            container.style.cssText = 'margin-bottom: 14px;';

            var label = document.createElement('label');
            label.innerText = labelText;
            label.style.cssText = 'display:block; font-size:14px; font-weight:600; color:#e0e0e0; margin-bottom:2px;';
            container.appendChild(label);

            var input = document.createElement('input');
            input.type = type;
            input.id = id;
            input.placeholder = placeholder;
            input.style.cssText = `
                width: 100%;
                padding: 10px 12px;
                border-radius: 6px;
                border: 1px solid #555;
                background: #333;
                color: white;
                font-size: 15px;
                box-sizing: border-box;
                outline: none;
                transition: border 0.2s;
            `;
            input.addEventListener('focus', function() { this.style.borderColor = '#4CAF50'; });
            input.addEventListener('blur', function() { this.style.borderColor = '#555'; });
            if (defaultValue !== undefined) {
                input.value = defaultValue;
            }
            container.appendChild(input);

            if (description) {
                var desc = document.createElement('div');
                desc.style.cssText = 'font-size:12px; color:#aaa; margin-top:4px; line-height:1.4;';
                desc.innerText = description;
                container.appendChild(desc);
            }

            panel.appendChild(container);
            return input;
        }

        // === Input parameter standar ===
        addInputGroup('🎯 Target Profit (Rp)', 'wingo-target-profil', '0 = nonaktif', 'number', window.BotSettings.targetProfit,
            'Bot akan berhenti otomatis saat total keuntungan mencapai angka ini. Isi 0 untuk nonaktif.');

        addInputGroup('🛑 Stop Loss (Rp)', 'wingo-stop-lose', '0 = nonaktif', 'number', window.BotSettings.stopLoss,
            'Bot akan berhenti otomatis saat total kerugian mencapai angka ini. Isi 0 untuk nonaktif.');

        addInputGroup('🔥 Max Win Streak', 'wingo-max-win', '0 = nonaktif', 'number', window.BotSettings.maxWinStreak,
            'Berhenti jika menang berturut-turut sebanyak nilai ini. Isi 0 untuk nonaktif.');

        addInputGroup('❌ Max Loss Streak', 'wingo-max-loss', '0 = nonaktif', 'number', window.BotSettings.maxLossStreak,
            'Berhenti jika kalah berturut-turut sebanyak nilai ini. Isi 0 untuk nonaktif.');

        addInputGroup('⏱️ Session Timeout (detik)', 'wingo-session', '0 = nonaktif', 'number', window.BotSettings.sessionTimeout,
            'Bot berhenti otomatis setelah berjalan selama X detik. Contoh: 3600 = 1 jam. Isi 0 untuk nonaktif.');

        addInputGroup('⏳ Min Bet Time (detik)', 'wingo-min-bet', 'detik', 'number', window.BotSettings.minBetTime,
            'Bot hanya akan bertaruh jika waktu tersisa ≥ nilai ini. (misal 8 detik)');

        addInputGroup('⏳ Max Bet Time (detik)', 'wingo-max-bet', 'detik', 'number', window.BotSettings.maxBetTime,
            'Bot hanya akan bertaruh jika waktu tersisa ≤ nilai ini. (misal 25 detik)');

        // ========== AREA LEVEL BETTING DINAMIS ==========
        var levelContainer = document.createElement('div');
        levelContainer.style.cssText = 'margin: 16px 0 12px 0; border-top: 1px solid #444; padding-top: 12px;';

        var levelTitle = document.createElement('div');
        levelTitle.innerText = '📊 Level Taruhan (Martingale)';
        levelTitle.style.cssText = 'font-size:16px; font-weight:bold; color:#e0e0e0; margin-bottom:10px;';
        levelContainer.appendChild(levelTitle);

        // Container untuk daftar level
        var levelList = document.createElement('div');
        levelList.id = 'wingo-level-list';
        levelList.style.cssText = 'margin-bottom:10px;';
        levelContainer.appendChild(levelList);

        // Fungsi render ulang daftar level berdasarkan array `window.BotSettings.betLevels`
        function renderLevels() {
            levelList.innerHTML = '';
            var levels = window.BotSettings.betLevels || [1000, 3000, 7000, 15000, 31000, 63000, 127000, 247000];

            levels.forEach(function(value, index) {
                var row = document.createElement('div');
                row.style.cssText = 'display:flex; align-items:center; gap:8px; margin-bottom:6px;';

                var label = document.createElement('span');
                label.innerText = 'Level ' + (index + 1) + ':';
                label.style.cssText = 'font-size:14px; font-weight:500; color:#ccc; min-width:70px;';
                row.appendChild(label);

                var input = document.createElement('input');
                input.type = 'number';
                input.value = value;
                input.style.cssText = `
                    flex:1;
                    padding: 6px 10px;
                    border-radius: 6px;
                    border: 1px solid #555;
                    background: #333;
                    color: white;
                    font-size: 14px;
                    box-sizing: border-box;
                `;
                row.appendChild(input);

                // Tombol hapus level (tidak boleh hapus jika hanya 1 level)
                var delBtn = document.createElement('button');
                delBtn.innerText = '×';
                delBtn.style.cssText = `
                    background: #d32f2f;
                    border: none;
                    border-radius: 4px;
                    color: white;
                    font-size: 16px;
                    font-weight: bold;
                    width: 28px;
                    height: 28px;
                    cursor: pointer;
                    line-height: 1;
                `;
                delBtn.addEventListener('click', function() {
                    if (window.BotSettings.betLevels.length <= 1) {
                        showToast('Minimal 1 level', 'error');
                        return;
                    }
                    window.BotSettings.betLevels.splice(index, 1);
                    renderLevels();
                });
                row.appendChild(delBtn);

                // Simpan perubahan nilai saat input berubah
                input.addEventListener('change', function() {
                    var newVal = parseInt(this.value) || 0;
                    if (newVal <= 0) {
                        showToast('Nominal harus > 0', 'error');
                        this.value = window.BotSettings.betLevels[index] || 1000;
                        return;
                    }
                    window.BotSettings.betLevels[index] = newVal;
                });

                levelList.appendChild(row);
            });

            // Tambahkan tombol tambah level
            var addRow = document.createElement('div');
            addRow.style.cssText = 'display:flex; justify-content:center; margin-top:4px;';

            var addBtn = document.createElement('button');
            addBtn.innerText = '+ Tambah Level';
            addBtn.style.cssText = `
                background: #4CAF50;
                border: none;
                border-radius: 6px;
                color: white;
                padding: 6px 16px;
                font-weight: bold;
                cursor: pointer;
                font-size: 14px;
            `;
            addBtn.addEventListener('click', function() {
                // Tambah level baru dengan nominal 1000
                window.BotSettings.betLevels.push(1000);
                renderLevels();
            });
            addRow.appendChild(addBtn);
            levelList.appendChild(addRow);
        }

        // Render awal
        renderLevels();
        panel.appendChild(levelContainer);

        // ========== TOMBOL SIMPAN & TUTUP ==========
        var btnContainer = document.createElement('div');
        btnContainer.style.cssText = 'display:flex; gap:8px; margin-top:16px;';

        var saveBtn = document.createElement('button');
        saveBtn.innerText = '💾 Simpan';
        saveBtn.style.cssText = `
            flex:2;
            padding: 12px;
            background: #4CAF50;
            border: none;
            border-radius: 8px;
            color: white;
            font-weight: bold;
            font-size: 16px;
            cursor: pointer;
            transition: background 0.2s;
        `;
        saveBtn.addEventListener('mouseover', function() { this.style.background = '#45a049'; });
        saveBtn.addEventListener('mouseout', function() { this.style.background = '#4CAF50'; });
        saveBtn.addEventListener('click', function() {
            // Baca nilai dari input standar
            window.BotSettings.targetProfit = parseFloat(document.getElementById('wingo-target-profil').value) || 0;
            window.BotSettings.stopLoss = parseFloat(document.getElementById('wingo-stop-lose').value) || 0;
            window.BotSettings.maxWinStreak = parseInt(document.getElementById('wingo-max-win').value) || 0;
            window.BotSettings.maxLossStreak = parseInt(document.getElementById('wingo-max-loss').value) || 0;
            window.BotSettings.sessionTimeout = parseInt(document.getElementById('wingo-session').value) || 0;
            window.BotSettings.minBetTime = parseInt(document.getElementById('wingo-min-bet').value) || 8;
            window.BotSettings.maxBetTime = parseInt(document.getElementById('wingo-max-bet').value) || 25;

            // Pastikan betLevels sudah tersimpan (render sudah sync via event change)
            // Tapi jika ada input yang belum trigger change, kita paksa baca ulang dari DOM
            var levelInputs = levelList.querySelectorAll('input[type="number"]');
            var newLevels = [];
            levelInputs.forEach(function(inp) {
                var val = parseInt(inp.value) || 0;
                if (val > 0) newLevels.push(val);
            });
            if (newLevels.length === 0) newLevels = [1000]; // fallback
            window.BotSettings.betLevels = newLevels;

            // Kirim ke Kodular (opsional)
            var msg = 'setting:target=' + window.BotSettings.targetProfit +
                      '&stoplose=' + window.BotSettings.stopLoss +
                      '&maxwin=' + window.BotSettings.maxWinStreak +
                      '&maxloss=' + window.BotSettings.maxLossStreak +
                      '&session=' + window.BotSettings.sessionTimeout +
                      '&minbet=' + window.BotSettings.minBetTime +
                      '&maxbet=' + window.BotSettings.maxBetTime +
                      '&levels=' + window.BotSettings.betLevels.join(',');
            sendToKodular(msg);

            showToast('✅ Pengaturan disimpan!', 'success');
            overlay.remove();

            // Update bot jika ada fungsi
            if (window.updateBotConfig) {
                window.updateBotConfig(window.BotSettings);
            }
        });

        var closeBtn = document.createElement('button');
        closeBtn.innerText = '✕ Tutup';
        closeBtn.style.cssText = `
            flex:1;
            padding: 12px;
            background: #f44336;
            border: none;
            border-radius: 8px;
            color: white;
            font-weight: bold;
            font-size: 16px;
            cursor: pointer;
            transition: background 0.2s;
        `;
        closeBtn.addEventListener('mouseover', function() { this.style.background = '#d32f2f'; });
        closeBtn.addEventListener('mouseout', function() { this.style.background = '#f44336'; });
        closeBtn.addEventListener('click', function() {
            overlay.remove();
        });

        btnContainer.appendChild(saveBtn);
        btnContainer.appendChild(closeBtn);
        panel.appendChild(btnContainer);

        overlay.appendChild(panel);
        document.body.appendChild(overlay);
    }

    // ================================================================
    // 5. HAPUS NAVIGASI
    // ================================================================
    function removeNav() {
        var nav = document.getElementById('wingo-nav-container');
        if (nav) {
            nav.remove();
            document.body.style.paddingBottom = '0';
            console.log('🗑️ Wingo navigation removed');
        }
        var overlay = document.getElementById('wingo-settings-overlay');
        if (overlay) overlay.remove();
    }

    // ================================================================
    // 6. INIT
    // ================================================================
    if (window.location.href.includes('/home/AllLotteryGames/WinGo')) {
        createNav();
    }

    window.addEventListener('hashchange', function() {
        if (window.location.href.includes('/home/AllLotteryGames/WinGo')) {
            createNav();
        } else {
            removeNav();
        }
    });

    window.openSettings = showSettings;
    window.getBotSettings = function() { return window.BotSettings; };

})();
