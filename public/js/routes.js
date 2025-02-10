import { getElement, formatDate, loadPartial, preloadImage, setTheme, handleClickers, Timer, registerServiceWorkers } from "./utility.js";
import { routesFilters } from "./LocalDatabase.js";
import { IndexedDatabase } from "./IndexedDatabase.js";

const url = new URL(window.location.href);
const vehicleTypes = ["train", "train_link", "metro", "bus", "light_rail", "ferry"];
const vehicleTypes2 = ["Train", "TrainLink", "Metro", "Bus", "Light Rail", "Ferry"];

let routes = {};

function clock() {
    getElement("time").innerHTML = formatDate();
    setTimeout(clock, 1000);
};

function vehicleTypeButtons() {
    const vehicleTypeButtons = getElement("vehicle-type-buttons");
    vehicleTypeButtons.innerHTML = "";

    const title = document.createElement("span");
    title.innerHTML = "Vehicle Types";
    title.id = "vehicle-select-title";

    const div1 = document.createElement("div");
    const div2 = document.createElement("div");
    div2.id = "vehicle-type-buttons2";

    div1.appendChild(title);

    const selectedVehicle = routesFilters.get("vehicle");

    vehicleTypeButtons.appendChild(div1);
    vehicleTypeButtons.appendChild(div2);

    vehicleTypes.forEach((vehicle) => {
        preloadImage(`../icons/nsw/${vehicle}.png`, 26, 26);
        const div = document.createElement("div");
        const img = document.createElement("img");
        const span = document.createElement("span");

        div.role = "button";
        div.id = `vehicle-toggle-${vehicle}`;
        div.className = `vehicle-select-button-large contrast-border ${selectedVehicle == vehicle ? "selected" : ""}`;

        img.src = `../icons/nsw/${vehicle}.png`;
        img["aria-label"] = vehicle;
        img.setAttribute("height", 26);
        img.setAttribute("width", 26);

        span.innerHTML = vehicleTypes2[vehicleTypes.indexOf(vehicle)];
        span.className = `vehicle-select-button-large-text`;

        div.appendChild(img);
        div.appendChild(span);
        div2.appendChild(div);

        handleClickers({
            [div.id]: (event) => {
                routesFilters.set("vehicle", vehicle);
                updateVehicleTypeButtons();
                updateRoutesDisplay();
            },
        });
    });

};

function updateVehicleTypeButtons() {
    const selectedVehicle = routesFilters.get("vehicle");
    vehicleTypes.forEach((vehicle) => {
        const button = getElement(`vehicle-toggle-${vehicle}`);
        if (vehicle == selectedVehicle) {
            button.classList.add("selected");
        } else {
            button.classList.remove("selected");
        };
    });
};

async function createRoutesDisplay() {
    await loadPartial("routes-list-content", "../html/partials/routes-list.html");
    updateRoutesDisplay();

    const searchBar = getElement("routes-list-searchbar");
    searchBar.addEventListener("keyup", (event) => {
        updateRoutesDisplay(event.target.value);
    });

};

function updateRoutesDisplay(filter) {
    const div2 = getElement("routes-list-content-2");
    const subtitle = getElement("routes-list-subtitle");
    div2.innerHTML = "";

    const selectedVehicle = routesFilters.get("vehicle");
    let vehicleRoutes = routes[selectedVehicle] || [];
    if (vehicleRoutes.length == []) {
        const div3 = document.createElement("div");
        div3.className = "route-list-item-container contrast-border";

        const span = document.createElement("span");
        span.innerText = `Routes list unavailable, please try again later${routes["offline"] ? "\nYou or the server are offline" : ""}`;

        div3.appendChild(span);
        div2.appendChild(div3);
    };

    if (filter) {
        filter = filter.toLowerCase().trim();
        vehicleRoutes = vehicleRoutes.filter((route) => [
            route.agencyName,
            route.routeShortName,
            route.routeLongName,
            route.routeDesc,
            route.routeCategory,
        ].map((x) => {
            return (x && typeof x == "string" && x != "") ? x.toLowerCase().trim() : "";
        }).filter(Boolean).some((x) => {
            return x.includes(filter)
        }));
    };

    vehicleRoutes = vehicleRoutes.sort((a, b) => a.routeShortName.localeCompare(b.routeShortName));

    const maxDisplay = 20;
    vehicleRoutes = vehicleRoutes.slice(0, Math.min(maxDisplay, vehicleRoutes.length));
    subtitle.innerHTML = `Displaying ${vehicleRoutes.length} ${vehicleRoutes.length == maxDisplay ? "(max) " : ""}result${vehicleRoutes.length == 1 ? "" : "s"} found`

    vehicleRoutes.forEach((route) => {
        if (!route.routeShortName) { return; };
        const div3 = document.createElement("div");
        div3.className = "route-list-item-container contrast-border";

        const div4 = document.createElement("div");
        div4.className = "route-list-item-icon";
        div4.style["color"] = route.routeTextColor || "var(--white);";
        div4.style["background-color"] = route.routeColor || "var(--black);";
        div4.innerText = route.routeShortName;
        const span = document.createElement("span");
        span.innerText = `${route.routeLongName} (${route.routeId})\n${route.routeDesc}`;

        div3.appendChild(div4);
        div3.appendChild(span);
        div2.appendChild(div3);

    });
};

async function fetchRoutes() {
    const response = await fetch(`${url.origin}/api/nsw/routes`, {
        method: 'GET', headers: { "Content-Type": "application/json", "Cache-Control": `max-age=86400;` },
    });
    if (!response.ok) { return {}; };
    return await response.json();
};

async function updateRoutes() {
    const routesDB = new IndexedDatabase('Routes', 1);
    await routesDB.openDatabase((db) => {
        db.addObjectStore('Routes', 'vehicle_type');
        db.addObjectStore("LastUpdated", 'key');
    });

    const lastUpdated = await routesDB.get("LastUpdated", "date");

    if (!lastUpdated || (Date.now() - parseInt(lastUpdated)) > 86460_000) {
        try {
            const routeData = await fetchRoutes();

            if (Object.is(routes, {})) { return routes = { "offline": true }; };

            for (const [vehicleType, routes] of Object.entries(routeData)) {
                await routesDB.add('Routes', { vehicle_type: vehicleType, routes });
            };

            await routesDB.add("LastUpdated", { key: "date", value: String(Date.now()) });
        } catch (error) {
            console.error(error);
        };
    };

    routes = await routesDB.get("Routes", "ALL");
    routes = Object.fromEntries(routes.map((x) => [x.vehicle_type, x.routes]));

    // const lastUpdatedTime = (await routesDB.get("LastUpdated", "ALL")).map((x) => parseInt(x.value) || 0)[0];

    // console.log(`Last updated: ${formatDate(lastUpdatedTime)}`);
    // console.log("Routes: ", routes);
};

window.addEventListener("error", (error) => { console.warn(`Unhandled rejection: ${error.reason}`); });
window.addEventListener("unhandledrejection", (error) => { console.warn(`Unhandled rejection: ${error.reason}`); });

document.addEventListener('DOMContentLoaded', async () => {
    registerServiceWorkers();
    setTheme();
    await loadPartial('nav-bar', '../html/partials/nav-bar.html');
    await loadPartial('footer', '../html/partials/footer.html');
    clock();

    vehicleTypeButtons();

    await updateRoutes();

    await createRoutesDisplay();
});