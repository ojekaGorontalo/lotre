// CARI: Fungsi highlightConfirmButtons()
// GANTI dengan:

function highlightConfirmButtons() {
    // 1. Cari dengan selector CSS yang valid
    const validSelectors = ['.confirm-btn', '.bet-confirm', '.submit-bet'];
    
    validSelectors.forEach(selector => {
        const buttons = document.querySelectorAll(selector);
        buttons.forEach(btn => {
            if (btn.offsetParent !== null) {
                btn.style.cssText = `
                    border: 4px solid #00FF00 !important;
                    box-shadow: 0 0 30px #00FF00 !important;
                    background: linear-gradient(45deg, #003300, #00AA00) !important;
                    color: white !important;
                    font-weight: bold !important;
                    font-size: 16px !important;
                    animation: pulse 1s infinite !important;
                    position: relative !important;
                    z-index: 9999 !important;
                    transform: scale(1.05) !important;
                `;
            }
        });
    });

    // 2. Cari berdasarkan teks (VALID method)
    const allButtons = document.querySelectorAll('button, .btn');
    allButtons.forEach(btn => {
        const text = (btn.textContent || btn.innerText || '').toLowerCase();
        if (text.includes('konfirmasi') || text.includes('confirm') || text.includes('ok')) {
            if (btn.offsetParent !== null) {
                btn.style.cssText = `
                    border: 4px solid #00FF00 !important;
                    box-shadow: 0 0 30px #00FF00 !important;
                    background: linear-gradient(45deg, #003300, #00AA00) !important;
                    color: white !important;
                    font-weight: bold !important;
                    font-size: 16px !important;
                    animation: pulse 1s infinite !important;
                    position: relative !important;
                    z-index: 9999 !important;
                    transform: scale(1.05) !important;
                `;
            }
        }
    });
    
    console.log("🎯 Tombol konfirmasi disorot!");
}
