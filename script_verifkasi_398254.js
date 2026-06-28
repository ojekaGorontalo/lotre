// ====================================================
// SCRIPT VERIFIKASI UID 398254 + KIRIM KE KODULAR
// ====================================================

(function() {
    'use strict';

    const ALLOWED_UID = '398254';
    let verificationDone = false; // cegah eksekusi ganda

    // ---------- TOAST (opsional) ----------
    function showToast(message, type) {
        const oldToast = document.getElementById('wingoToast');
        if (oldToast) oldToast.remove();

        const toast = document.createElement('div');
        toast.id = 'wingoToast';
        let bgColor = '#1e293b';
        if (type === 'success') bgColor = '#22c55e';
        else if (type === 'error') bgColor = '#ef4444';
        else if (type === 'info') bgColor = '#3b82f6';

        toast.style.cssText = `
            position: fixed;
            bottom: 80px;
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

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(-50%) translateY(10px)';
            setTimeout(() => toast.remove(), 400);
        }, 4000);
    }

    // ---------- KIRIM PESAN KE KODULAR ----------
    function sendToKodular(message) {
        try {
            if (window.AppInventor && typeof window.AppInventor.setWebViewString === 'function') {
                window.AppInventor.setWebViewString(message);
                console.log('📤 Pesan terkirim ke Kodular:', message);
            } else {
                console.warn('⚠️ window.AppInventor tidak tersedia (bukan di Kodular?)');
            }
        } catch (e) {
            console.error('❌ Gagal kirim ke Kodular:', e);
        }
    }

    // ---------- HANDLER RESPON GetUserInfo ----------
    function handleUserInfo(data) {
        if (verificationDone) return;
        if (!data || data.code !== 0 || !data.data) return;

        const userId = String(data.data.userId);
        console.log('🔍 User ID dari GetUserInfo:', userId);

        if (userId === ALLOWED_UID) {
            verificationDone = true;
            // Simpan data user
            sessionStorage.setItem('wingoUserData', JSON.stringify(data.data));
            window.__wingoUser = data.data;
            console.log('✅ Verifikasi sukses!');
            showToast('✅ Selamat datang ' + (data.data.nickName || userId), 'success');
            // Kirim sukses ke Kodular (opsional)
            sendToKodular('UID_VALID');
            // Di sini TIDAK panggil wingoAuto.start() – biarkan script lain yang menjalankan
        } else {
            verificationDone = true;
            // Tampilkan alert dan toast
            alert('❌ ID anda tidak terdaftar di Wingo bot, hubungi admin @PredictorUser');
            showToast('❌ ID tidak terdaftar', 'error');
            window.__wingoVerified = false;
            // Kirim pesan GAGAL ke Kodular
            sendToKodular('UID_TIDAK_TERDAFTAR');
        }
    }

    // ---------- HOOK API GetUserInfo ----------
    function hookGetUserInfo() {
        // OVERRIDE FETCH
        const originalFetch = window.fetch;
        window.fetch = function(...args) {
            const url = args[0] || '';
            return originalFetch.apply(this, arguments).then(response => {
                const cloned = response.clone();
                if (typeof url === 'string' && url.includes('GetUserInfo')) {
                    cloned.json().then(data => handleUserInfo(data)).catch(() => {});
                }
                return response;
            });
        };

        // OVERRIDE XMLHttpRequest
        const originalOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(...args) {
            const url = args[1] || '';
            this.addEventListener('load', function() {
                if (typeof url === 'string' && url.includes('GetUserInfo')) {
                    try {
                        const data = JSON.parse(this.responseText);
                        handleUserInfo(data);
                    } catch (e) {}
                }
            });
            return originalOpen.apply(this, args);
        };
    }

    // ---------- PASANG HOOK ----------
    hookGetUserInfo();
    console.log('✅ Script verifikasi UID aktif (hanya menerima 398254 + kirim ke Kodular)');
    showToast('🔐 Verifikasi UID aktif - login untuk proses', 'info');

})();
