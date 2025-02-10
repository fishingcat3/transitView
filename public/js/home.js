import { loadPartial, setTheme, registerServiceWorkers } from './utility.js';

window.addEventListener("error", (error) => { console.warn(`Unhandled rejection: ${error.reason}`); });
window.addEventListener("unhandledrejection", (error) => { console.warn(`Unhandled rejection: ${error.reason}`); });

document.addEventListener('DOMContentLoaded', async () => {
    registerServiceWorkers();
    setTheme();
    await loadPartial('title-bar', '../html/partials/title-bar.html');
    await loadPartial('footer', '../html/partials/footer.html');
});