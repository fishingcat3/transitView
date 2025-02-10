import { getElement, formatDate, loadPartial, setTheme, handleClickers, Dropdown, clickDropdown, registerServiceWorkers } from './utility.js';
import { settings } from './LocalDatabase.js';

function clock() {
    getElement("time").innerHTML = formatDate();
    setTimeout(clock, 1000);
};

function updateSaveChangesState() {
    if (settings.isSaved) {
        getElement("button-save-changes").classList.add("disabled");
        getElement("button-save-changes").classList.remove("enabled");
        setTheme();
    } else {
        getElement("button-save-changes").classList.add("enabled");
        getElement("button-save-changes").classList.remove("disabled");
    };
};

function displayValues() {
    getElement("dropdown-current-theme").innerHTML = settings.get("theme");
    getElement("dropdown-current-map-style").innerHTML = settings.get("map-style");
};

window.addEventListener("error", (error) => { console.warn(`Unhandled rejection: ${error.reason}`); });
window.addEventListener("unhandledrejection", (error) => { console.warn(`Unhandled rejection: ${error.reason}`); });

document.addEventListener('DOMContentLoaded', async () => {
    registerServiceWorkers();
    setTheme();
    await loadPartial('nav-bar', '../html/partials/nav-bar.html');
    await loadPartial('footer', '../html/partials/footer.html');
    clock();
    const themeDropdown = new Dropdown(
        "theme", "size-3",
        ["Browser", "Light", "Dark"]
    );
    const mapStyleDropdown = new Dropdown(
        "map-style", "size-3",
        ["Voyager", "Voyager (no labels)", "Voyager (labels under)", "Light", "Light (no labels)", "Dark", "Dark (no labels)", "Standard", "Humanitarian"]
    );

    handleClickers({
        "button-reset-settings": (event) => {
            settings.reset();
            displayValues();
            settings.save();
            return updateSaveChangesState();
        },
        "button-save-changes": (event) => {
            settings.save();
            return updateSaveChangesState();
        },
    });

    const themeDropdownListeners = {
        "dropdown-theme": (event) => {
            clickDropdown(event, mapStyleDropdown, true, []);
            return clickDropdown(event, themeDropdown, false, settings.get("theme"));
        },
    };
    themeDropdown.options.forEach((option) => {
        themeDropdownListeners[`dropdown-${themeDropdown.id}-${themeDropdown.options.indexOf(option)}`] = (event) => {
            settings.set("theme", option);
            displayValues();
            updateSaveChangesState();
            return clickDropdown(event, themeDropdown, true, option);
        };
    });
    handleClickers(themeDropdownListeners);

    const mapStyleDropdownListeners = {
        "dropdown-map-style": (event) => {
            clickDropdown(event, themeDropdown, true, []);
            return clickDropdown(event, mapStyleDropdown, false, settings.get("map-style"));
        },
    };
    mapStyleDropdown.options.forEach((option) => {
        mapStyleDropdownListeners[`dropdown-${mapStyleDropdown.id}-${mapStyleDropdown.options.indexOf(option)}`] = (event) => {
            settings.set("map-style", option);
            displayValues();
            updateSaveChangesState();
            return clickDropdown(event, mapStyleDropdown, true, option);
        };
    });
    handleClickers(mapStyleDropdownListeners);

    displayValues();
});