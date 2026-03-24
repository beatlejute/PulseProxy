// Apply i18n translations using chrome.i18n API
document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const msg = chrome.i18n.getMessage(key);
    if (msg) el.textContent = msg;
});

// Close tab on button click
document.querySelector('.welcome-button').addEventListener('click', () => {
    window.close();
});
