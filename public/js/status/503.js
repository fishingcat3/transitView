import { loadPartial, setTheme, registerServiceWorkers } from '../utility.js';
const url = window.location.origin;

async function checkAvailable() {
    try {
        const response = await fetch(`${url}/api/nsw/available`, { method: 'GET' });
        if (response.ok) {
            location.reload();
        } else {
            console.log(`Service not available ${new Date()}`);
        };
    } catch (error) {
        console.error(error);
    };
    setTimeout(function () { checkAvailable(); }, 5000);
};

window.addEventListener("error", (error) => { console.warn(`Unhandled rejection: ${error.reason}`); });
window.addEventListener("unhandledrejection", (error) => { console.warn(`Unhandled rejection: ${error.reason}`); });

document.addEventListener("DOMContentLoaded", async () => {
    registerServiceWorkers();
    setTheme();
    await loadPartial('title-bar', '../html/partials/title-bar.html');
    await loadPartial('footer', '../html/partials/footer.html');

    checkAvailable();
});