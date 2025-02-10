import { settings } from "./LocalDatabase.js";

export class Dropdown {
    constructor(id, size, options, add) {
        this._id = id;
        this._size = size;
        this._options = options;
        this._html = createDropdown(this._id, this._size, this._options, add);
    };

    get id() {
        return this._id;
    };

    get options() {
        return this._options;
    };
};

export class Table {
    constructor(id, rows) {
        this._id = id;
        this._rows = Array.isArray(rows) ? rows : Object.entries(rows);
        this.updateTable();
    };

    // addRow(row) {
    //     row = Array.isArray(row) ? row : Object.entries(row);
    //     if (!row.some((x) => [undefined, null, ""].includes(x))) {
    //         this._rows.push(row.map((x) => String(x)));
    //     };
    //     return this;
    // };

    // removeRow(idx) {
    //     if (idx < this._rows.length) { this._rows.splice(idx, 1); };
    //     return this;
    // };

    updateTable() {
        let table = getElement(this._id) || document.createElement("table");
        table.setAttribute("id", this._id);
        table.innerHTML = "";
        this._rows.forEach((row) => {
            if (row.some((x) => [undefined, null, ""].includes(x))) { return; };
            const tr = document.createElement("tr");
            const isHeader = row.includes("SECTION_HEADER");
            if (isHeader) {
                tr.className = "table-header";
            };
            row.forEach((column) => {
                const td = document.createElement("td");
                td.innerHTML = column == "SECTION_HEADER" ? "" : column;
                tr.appendChild(td);
            });
            table.appendChild(tr);
        });
        this._table = table;
        return this;
    };

    get table() {
        return this._table;
    };

    get rows() {
        return this._rows;
    };
};

export const divider = function (x) {
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "_");
};

export class Timer {
    constructor(name) {
        this.name = name;
        this.startTime = Date.now();
    };
    start() {
        this.startTime = Date.now();
        console.log(`START ${this.name}`);
        return this;
    }
    end() {
        return console.log(`FINISH ${this.name} ${divider(Date.now() - this.startTime)}ms`);
    };
    get timeSinceStart() {
        return Date.now() - this.startTime;
    };
};

export function getElement(id) {
    return document.getElementById(id);
};

export function bearingToCardinal(bearing = 0) {
    return ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"][(Math.round(bearing / 22.5) % 16) || 0];
};

export function formatDate(date) {
    date = date ? new Date(date) : new Date();
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');

    return `${hh}:${mm}:${ss}`;
};

// function newLinePerChars(str, maxChars) {
//     if (!str || !maxChars) { return undefined; };

//     let currentLine = "", result = "";

//     str.split(" ").forEach(word => {
//         if ((currentLine + word).length > maxChars) {
//             result += `${currentLine.trim()}\n`;
//             currentLine = '';
//         };
//         currentLine += `${word} `;
//     });

//     result += currentLine.trim();
//     return result;
// };

export function hexToLuminance(hex) {
    hex = hex.replace('#', '');
    const rgb = (a, b) => { return parseInt(hex.substring(a, b), 16) / 255; };
    const r = rgb(0, 2), g = rgb(2, 4), b = rgb(4, 6);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b);
};

export function preloadImage(url, width = 64, height = 64) {
    let image = new Image(width, height);
    image.src = url;
};

export function sToHMS(time) {
    const hours = Math.floor((time / 3600));
    const minutes = Math.floor((time - hours * 3600) / 60);
    const seconds = Math.floor(time - hours * 3600 - minutes * 60);
    return isNaN(time) ? "?" : (`${hours > 0 ? `${hours}h ` : ""}${minutes > 0 ? `${minutes}m ` : ""}${seconds > 0 ? `${seconds}s ` : ((hours == 0 && minutes == 0) ? "0s " : "")}`).trim();
};

export async function loadPartial(id, ref) {
    try {
        const response = await fetch(ref, { method: "GET", headers: { accept: "gzip, compress, br", "Cache-Control": "max-age=86400" } });
        const html = await response.text();

        const tag = getElement(id);
        tag.innerHTML = html;
        tag.querySelectorAll('link').forEach((link) => {
            document.head.appendChild(link.cloneNode(true));
        });
        tag.querySelectorAll('script').forEach((script) => {
            const execScript = document.createElement('script');
            execScript.textContent = script.textContent;
            document.body.appendChild(execScript);
        });
        tag.querySelectorAll('meta').forEach(element => {
            document.head.appendChild(element.cloneNode(true));
        });
        return;
    } catch (error) {
        return console.error(error);
    };
};

export function isInvalidClick(event) {
    return (!(event.type == "click" || (event.type == "keydown" && event.key == "Enter")));
};

export function createDropdown(id, size, options, add) {
    const wrapper = getElement(`dropdown-wrapper-${id}`);

    const dropdown = document.createElement("div");
    dropdown.id = `dropdown-${id}`;
    dropdown.className = "dropdown contrast-border";

    const dropdownText = document.createElement("span");
    dropdownText.id = `dropdown-current-${id}`;

    const img = document.createElement("img");
    img.id = `dropdown-img-${id}`;
    img.className = "dropdown-icon image-invert";
    img.src = "../icons/dropdown-icon.png";
    img.setAttribute("height", "20");
    img.setAttribute("width", "20");
    img.alt = "dropdown";

    const dropdownList = document.createElement("ul");
    dropdownList.className = "dropdown-list hidden contrast-border";
    dropdownList.id = `dropdown-list-${id}`;

    for (const option of options) {
        const optionDiv = document.createElement("li");
        optionDiv.className = `dropdown-item ${size} contrast-border`;
        optionDiv.id = `dropdown-${id}-${options.indexOf(option)}`
        optionDiv.innerHTML = option;
        dropdownList.appendChild(optionDiv);
    };

    if (add != false) {
        wrapper.appendChild(dropdown);
        dropdown.appendChild(dropdownText);
        dropdown.appendChild(img);
        wrapper.appendChild(dropdownList);
    };
    return wrapper;
};

export function updateDropdown(dropdownInstance, selected = []) {
    const dropdown = getElement(`dropdown-${dropdownInstance.id}`);
    const dropdownList = getElement(`dropdown-list-${dropdownInstance.id}`);

    if (!dropdown || !dropdownList) { return; };

    Array.from(document.getElementsByClassName("dropdown-item")).forEach((dropdownItem) => {
        if (selected.includes(dropdownItem.innerHTML)) {
            return dropdownItem.classList.add("selected");
        };
        dropdownItem.classList.remove("selected");
    });
};

export function clickDropdown(event, dropdownInstance, hide = false, selected) {
    if (!Array.isArray(selected)) { selected = [selected]; };
    const img = getElement(`dropdown-img-${dropdownInstance.id}`);
    const list = getElement(`dropdown-list-${dropdownInstance.id}`);

    if (!img || !list) { return; };

    if (hide == true || (hide != "notdefault" && !list.classList.contains('hidden'))) {
        img.src = `../icons/dropdown-icon.png`;
        list.classList.add('hidden');
    } else {
        img.src = `../icons/dropup-icon.png`;
        list.classList.remove('hidden');
    };

    updateDropdown(dropdownInstance, selected);

    if (window.onresize) { return; };
    window.addEventListener("resize", (event) => { updateDropdown(dropdownInstance, selected); });
};

export function setTheme() {
    const theme = ((theme) => {
        if (theme == "Browser") {
            return window.matchMedia("(prefers-color-scheme: dark)").matches ? "Dark" : "Light";
        };
        return theme;
    })(settings.unsavedGet("theme"));

    document.documentElement.setAttribute('data-theme', theme.toLowerCase());

    if (window.matchMedia("(prefers-color-scheme: dark)").onchange) { return; };
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (event) => {
        setTheme();
    });
};

export function handleClickers(clickEvents) {
    Object.keys(clickEvents).forEach((clicker) => {
        const element = getElement(clicker);

        function thisFunction(event) {
            if (isInvalidClick(event)) { return; };
            clickEvents[clicker](event);
        };

        element.addEventListener("click", thisFunction);
        element.addEventListener("keydown", thisFunction);
    });
};

export async function registerServiceWorkers() {
    if (!("serviceWorker" in navigator)) { return; };
    try {
        const start = Date.now();
        const registration = await navigator.serviceWorker.register("../serviceWorker.js", { scope: "/", });
        console.log(`SERVICE WORKER ${registration.installing ? "INSTALLING" : registration.waiting ? "INSTALLED" : registration.active ? "ACTIVE" : "UNKNOWN"} ${Date.now() - start}ms`);
    } catch (error) {
        console.error(`SERVICE WORKER REGISTRATION FAILED ${error}`);
    };
};