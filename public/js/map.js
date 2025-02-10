// =================================================
// INITIALISATION
// =================================================
import {
  getElement, sToHMS, bearingToCardinal, hexToLuminance, preloadImage, Dropdown, Table, handleClickers,
  updateDropdown, clickDropdown, formatDate, loadPartial, setTheme, registerServiceWorkers, isInvalidClick
} from './utility.js';
import { mapFilters, settings } from './LocalDatabase.js';
// import { IndexedDatabase } from './IndexedDatabase.js';

const url = new URL(window.location.href);
const mapURLs = {
  "Voyager": "https://{s}.basemaps.cartocdn.com/rastertiles/voyager",
  "Voyager (no labels)": "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels",
  "Voyager (labels under)": "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_labels_under",
  "Light": "https://{s}.basemaps.cartocdn.com/light_all",
  "Light (no labels)": "https://{s}.basemaps.cartocdn.com/light_nolabels",
  "Dark": "https://{s}.basemaps.cartocdn.com/dark_all",
  "Dark (no labels)": "https://{s}.basemaps.cartocdn.com/dark_nolabels",
  "Standard": "https://tile.openstreetmap.org",
  "Humanitarian": "https://{s}.tile.openstreetmap.fr/hot",
};

let startingPosition = [-33.87221, 151.20666];

let map = L.map('map').setView(startingPosition, 15);
L.tileLayer(`${mapURLs[settings.get("map-style") || "Voyager (labels under)"]}/{z}/{x}/{y}${L.Browser.retina ? '@2x' : ''}.png`, {
  minZoom: 6, maxZoom: 21,
  attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>, &copy; <a href="https://opendata.transport.nsw.gov.au/datalicence">TfNSW</a>',
}).addTo(map);

let routeShapesLayerGroup = L.layerGroup().addTo(map);
let stopLayerGroup = L.layerGroup().addTo(map);
let vehicleLayerGroup = L.layerGroup().addTo(map);
let instanceLayerGroup = L.layerGroup().addTo(map);

let sideBarAdjusting = false, oldWidth = 540;
let lastUpdated, lastUpdatedFor = "vehicles", lastUpdatedActive = false;
let onoffline = true;
let oldBounds, newBounds;
let markers = {}, vehicles, stops, routePolylines = {}, toleranceCache = {};
let mapMoving = false, currentMarkerHover = undefined;

const vehicleTypes = ["train", "train_link", "metro", "bus", "light_rail", "ferry"];
const stopTypesMinZoom = {
  11: ["train", "train_link", "metro"],
  14: ["light_rail"],
  15: ["ferry"],
  16: ["bus"],
};
const delayColors = { early: "#185ABC", ontime: "#18BC38", delay: "#E9B713", late: "#BC1818", };

// =================================================
// SETUP
// =================================================
async function vehicleToggleButtons() {
  const vehicleToggleBox = getElement("vehicle-toggle-box");
  vehicleTypes.forEach((vehicle) => {
    preloadImage(`../icons/nsw/${vehicle}.png`, 36, 36);
    const img = document.createElement("img");

    img.className = "vehicle-select-button contrast-border";
    img.src = `../icons/nsw/${vehicle}.png`;
    img.id = `toggle-view-${vehicle}`;
    img["alt"] = vehicle;
    img["aria-label"] = vehicle;
    img.setAttribute("height", 36);
    img.setAttribute("width", 36);
    img.style["opacity"] = mapFilters.get("vehicle").includes(vehicle) ? 1 : 0.4;

    vehicleToggleBox.appendChild(img);
  });

  const toggleButtons = document.querySelectorAll('.vehicle-select-button');
  toggleButtons.forEach((toggleButton) => {

    function handleToggleVehicleView(event) {
      if (isInvalidClick(event)) { return; };

      const opacity = window.getComputedStyle(toggleButton).opacity;
      toggleButton.style.opacity = opacity == 0.4 ? 1 : 0.4;
      toggleButton.addEventListener("transitionend", () => {
        const opacity = window.getComputedStyle(toggleButton).opacity;
        mapFilters.set("vehicle", getDisplayVehicles());
        vehicleUpdate(`view_toggle_${opacity == 0.4 ? "hide" : "show"}`);
      });
    };

    toggleButton.addEventListener("click", handleToggleVehicleView);
    toggleButton.addEventListener("keydown", handleToggleVehicleView);
  });
};

async function checkboxHandling() {
  const checkboxes = document.querySelectorAll(".checkbox");
  checkboxes.forEach((checkbox) => {
    checkbox.classList.add("contrast-border");
    const id = checkbox.id;
    const classes = checkbox.classList;
    const img = document.createElement("img");
    img.className = "check-icon image-invert2";
    img.style["max-height"] = "90%";
    img.style["max-width"] = "90%";
    img.src = "../icons/check-icon.png";
    img.alt = "check";
    checkbox.setAttribute("aria-label", id.replaceAll("-", " ").replaceAll("_", " "));
    checkbox.appendChild(img);
    let initialState;
    if (id == "checkbox-display_station_icons") {
      initialState = mapFilters.get("display_stations_icons") == "true";
    } else if (id == "checkbox-display_route_shapes") {
      initialState = mapFilters.get("display_route_shapes") == "true";
    } else if (id == "checkbox-display_unscheduled_vehicles") {
      initialState = mapFilters.get("display_unscheduled_vehicles") == "true";
    };
    if (initialState) {
      checkbox.setAttribute("aria-checked", "true");
      classes.add("selected");
      img.style["opacity"] = 1;
    } else {
      checkbox.setAttribute("aria-checked", "false");
      classes.remove("selected");
      img.style["opacity"] = 0;
    };

    function handleCheckboxClick(event) {
      if (isInvalidClick(event)) { return; };

      classes.toggle("selected");
      const isSelected = classes.contains("selected");
      if (id == "checkbox-display_station_icons") {
        mapFilters.set("display_stations_icons", isSelected.toString());
        mapUpdate("no_vehicles");
      } else if (id == "checkbox-display_route_shapes") {
        mapFilters.set("display_route_shapes", isSelected.toString());
        mapUpdate("no_vehicles");
      } else if (id == "checkbox-display_unscheduled_vehicles") {
        mapFilters.set("display_unscheduled_vehicles", isSelected.toString());
        mapUpdate();
      };
      img.style["opacity"] = isSelected ? 1 : 0;
      checkbox.setAttribute("aria-checked", `${isSelected}`);
    };
    checkbox.addEventListener("click", handleCheckboxClick);
    checkbox.addEventListener("keydown", handleCheckboxClick);

    function fixDisplay() {
      const opacity = window.getComputedStyle(img).opacity;
      img.style["display"] = opacity == 1 ? "block" : "none";
    };
    checkbox.addEventListener("transitionstart", fixDisplay);
    checkbox.addEventListener("transitionend", fixDisplay);
  });
};

async function backCancelButtons() {
  if (!getElement("back-side-bar")) { return; };

  async function handleBackButtonSideBar(event) {
    if (isInvalidClick(event)) { return; };

    history.go(-1);
    setTimeout(async () => {
      history.replaceState({}, '', window.location.href);
      await handleInstance();
    }, 50);
  };

  async function handleCancelButtonSideBar(event) {
    if (isInvalidClick(event)) { return; };

    history.pushState({}, "", `${url.origin}/map`);
    await handleInstance();
  };

  getElement("back-side-bar").addEventListener("click", handleBackButtonSideBar);
  getElement("back-side-bar").addEventListener("keydown", handleBackButtonSideBar);

  getElement("close-side-bar").addEventListener("click", handleCancelButtonSideBar);
  getElement("close-side-bar").addEventListener("keydown", handleCancelButtonSideBar);
};

function handleDropdowns(reposition) {
  const specAttDropdown = new Dropdown("specialattributes", "size-2", ["Articulated Bus", "Electric Bus", "Social Distancing", "Christmas Bus", "Wi-Fi", "Special Livery",
    "Temporary Bus", "Metro Bus", "NightRide", "South West Link", "Sydney Area Bus", "Regional Bus", "School Bus", "Express"], !reposition);
  const vehicleTypeDropdown = new Dropdown("vehicletype", "size-1", ["Waratah A", "Waratah B", "C-Set C", "Mariyung D", "Oscar H", "Hunter J", "K-Set K", "Millenium M", "Endeavour N", "Xplorer P", "S-Set S", "Tangara T", "V-Set Intercity V", "XPT X", "Heritage/Private Z", "Freight G", "Track Inspection I", "Light Locomotive L", "Other O", "Maintinence Vehicle Q", "Fast Freight W", "Other Y"], !reposition);

  if (reposition) {
    function repositionDropdowns() {
      updateDropdown(vehicleTypeDropdown, mapFilters.get("special-attributes"));
      updateDropdown(specAttDropdown, mapFilters.get("train-set-type").map((set) => vehicleTypeDropdown.options.find((fullName) => fullName.endsWith(set))));
    };
    return { repositionDropdowns: repositionDropdowns };
  };

  getElement("dropdown-current-specialattributes").innerHTML = `Bus Attribute Filters (${mapFilters.get("special-attributes").length}/${mapFilters.getOptions("special-attributes").length})`;
  const specAttDropdownListeners = {
    "dropdown-specialattributes": (event) => {
      clickDropdown(event, vehicleTypeDropdown, true, []);
      return clickDropdown(event, specAttDropdown, false, mapFilters.get("special-attributes"));
    },
  };
  specAttDropdown.options.forEach((option) => {
    specAttDropdownListeners[`dropdown-${specAttDropdown.id}-${specAttDropdown.options.indexOf(option)}`] = (event) => {
      let filters = mapFilters.get("special-attributes");
      if (filters.includes(option)) { filters = filters.filter((x) => x != option); }
      else { filters.push(option); };
      mapFilters.set("special-attributes", filters);
      getElement("dropdown-current-specialattributes").innerHTML = `Bus Attribute Filters (${mapFilters.get("special-attributes").length}/${mapFilters.getOptions("special-attributes").length})`;
      vehicleUpdate();
      return clickDropdown(event, specAttDropdown, "notdefault", filters);
    };
  });
  handleClickers(specAttDropdownListeners);

  getElement("dropdown-current-vehicletype").innerHTML = `Train Set Type Filters (${mapFilters.get("train-set-type").length}/${mapFilters.getOptions("train-set-type").length})`;
  const vehicleTypeDropdownListeners = {
    "dropdown-vehicletype": (event) => {
      const filtersFullName = mapFilters.get("train-set-type").map((set) => vehicleTypeDropdown.options.find((fullName) => fullName.endsWith(set)));
      clickDropdown(event, specAttDropdown, true, []);
      return clickDropdown(event, vehicleTypeDropdown, false, filtersFullName);
    },
  };
  vehicleTypeDropdown.options.forEach((option) => {
    vehicleTypeDropdownListeners[`dropdown-${vehicleTypeDropdown.id}-${vehicleTypeDropdown.options.indexOf(option)}`] = (event) => {
      option = option[option.length - 1];
      let filters = mapFilters.get("train-set-type");
      if (filters.includes(option)) { filters = filters.filter((x) => x != option); }
      else { filters.push(option); };
      mapFilters.set("train-set-type", filters);
      getElement("dropdown-current-vehicletype").innerHTML = `Train Set Type Filters (${mapFilters.get("train-set-type").length}/${mapFilters.getOptions("train-set-type").length})`;
      vehicleUpdate();
      const filtersFullName = filters.map((set) => vehicleTypeDropdown.options.find((fullName) => fullName.endsWith(set)));
      return clickDropdown(event, vehicleTypeDropdown, "notdefault", filtersFullName);
    };
  });
  handleClickers(vehicleTypeDropdownListeners);

  if (window.onresize) { return; };
  window.addEventListener("resize", (event) => {
    if ([oldWidth <= 992, event.currentTarget.innerWidth <= 992].filter((x) => !!x).length == 1) {
      getElement("side-bar").style["height"] = "auto";
      getElement("side-bar").style["width"] = "auto";
    };
    oldWidth = event.currentTarget.innerWidth;
    handleDropdowns(true).repositionDropdowns();
  });
};

function sideBarAdjuster() {
  const sideBarAdjuster = getElement("side-bar-adjuster");

  sideBarAdjuster.addEventListener("touchstart", startResize);
  sideBarAdjuster.addEventListener("mousedown", startResize);

  function startResize(event) {
    sideBarAdjusting = true;

    const touchEvent = event.type == "touchstart";

    document.addEventListener(touchEvent ? "touchmove" : "mousemove", resize);
    document.addEventListener(touchEvent ? "touchend" : "mouseup", endResize);
  };

  function resize(event) {
    if (!sideBarAdjusting) { return; };

    const direction = document.body.clientWidth <= 992 ? "height" : "width";
    const otherDirection = direction == "height" ? "width" : "height";
    const size = (direction == "width" ? (event.clientX || event.changedTouches[0].clientX) : (document.body.clientHeight - (event.clientY || event.changedTouches[0].clientY))) - 28;

    getElement("side-bar").style[direction] = `${size}px`;
    getElement("side-bar").style[otherDirection] = `auto`;

    handleDropdowns(true).repositionDropdowns();
  };

  function endResize() {
    sideBarAdjusting = false;
    getElement("side-bar").style["transition-property"] = "width";
    getElement("side-bar").style["transition-duration"] = "0.2s";

    document.removeEventListener("touchmove", resize);
    document.removeEventListener("touchend", endResize);

    document.removeEventListener("mousemove", resize);
    document.removeEventListener("mouseup", endResize);
  };
};

async function handleInstance() {
  instanceLayerGroup.clearLayers();
  vehicleOpacity(false);

  const params = new URLSearchParams(window.location.search);
  if (!params.has('instanceId')) {
    await loadPartial('side-bar', '../html/partials/default-side-bar.html');
    mapUpdate();
    vehicleToggleButtons();
    if (!lastUpdatedActive) { updateLastUpdated(); };
    checkboxHandling();
    handleDropdowns();

    lastUpdatedFor = "vehicles";
    return;
  };

  const instanceId = params.get('instanceId');
  const instanceSplit = instanceId.split("/");

  if (instanceSplit[0] == "vehicle") {
    const vehicle = await loadVehicleInstance(params, instanceId);
    updateVehicleInstance(params, instanceId, vehicle, true);
  } else if (instanceSplit[0] == "stop") {
    await loadStopInstance(params, instanceId);
    updateStopInstance(params, instanceId, null, true);
  } else {
    params.delete("instanceId");
  };
  params.forEach((value, key) => { if (key != "instanceId") params.delete(key); });
  history.replaceState({}, "", `${new URL(window.location.href).pathname}?${params.toString()}`);
};

async function loadVehicleInstance(params, instanceId) {
  await loadPartial('side-bar', '../html/partials/vehicle-instance.html');
  backCancelButtons();
  if (!lastUpdatedActive) {
    updateLastUpdated();
  };
  const vehicle = await fetchInstance(instanceId);
  if (vehicle?.TripInstance?.path && vehicle?.TripInstance?.shapeId) {
    instanceLayerGroup.clearLayers();
    const shapes = await fetchRouteShapes(vehicle.TripInstance?.path, `${vehicle.TripInstance?.shapeId};${vehicle.TripInstance?.route?.id}`, false);
    for (const shape of Object.values(shapes)) {
      const color = ((x) => x.startsWith("#") ? x.slice(1) : x)(shape.color || vehicle?.TripInstance?.route?.color || (vehicle.VehicleInstance?.type == "bus" ? "00B5EF" : "8F8F8F"));
      const points = filterPointsMinDistance(shape.polyline, 60);
      const polyline = L.polyline(points, { color: `#${color}`, weight: 4, offset: 2, ppm: shape.ppm, smoothFactor: 1.5, polyline: points });
      instanceLayerGroup.addLayer(polyline);
    };
    vehicleOpacity(true);
    instanceLayerGroup.setZIndex(1000);
  };

  return vehicle;
};

async function updateVehicleInstance(params, instanceId, vehicle, pan) {
  if (instanceId != new URLSearchParams(window.location.search).get('instanceId')) { return; };
  lastUpdated = undefined;
  lastUpdatedFor = "none";
  vehicle = vehicle || await fetchInstance(instanceId);

  if (instanceId != new URLSearchParams(window.location.search).get('instanceId')) { return; };
  if (!vehicle || vehicle == {} || !vehicle.TripInstance || !vehicle.VehicleInstance || vehicle.error) { return await loadPartial('side-bar', '../html/partials/error.html'); };
  lastUpdated = vehicle.VehicleInstance?.lastPosition?.time * 1000;
  lastUpdatedFor = "vehicleInstance";

  const vehicleRouteIcon = getElement("vehicle-instance-shortname");
  vehicleRouteIcon.style["background-color"] = vehicle.TripInstance?.route?.color;
  vehicleRouteIcon.style["color"] = vehicle.TripInstance?.route?.textColor;
  vehicleRouteIcon.style["font-weight"] = [0, 800, 600, 400, 350][vehicle.TripInstance?.route?.shortName?.length || 1];
  vehicleRouteIcon.innerHTML = vehicle.TripInstance?.route?.shortName || "?";

  const vehicleTitle = getElement("vehicle-instance-title");
  vehicleTitle.innerHTML = ((x) => x == "" ? vehicle.TripInstance?.route?.longName || "Unknown" : x)((Object.values(vehicle.TripInstance?.headSign || {}) || ["Unknown"]).join(" via "));

  const model = ((model, scheduledSet, type) => {
    if (type == "bus") {
      return ["Model", `${((x) => x == "" ? "Unknown" : String(x))(String(Object.values(model).join(" ")).replaceAll("Unknown", "").trim())}`];
    } else if (["train", "train_link"].includes(type)) {
      return [`${scheduledSet ? "Scheduled" : "Model"}`, `${((x, y) => `${x?.vehicle_category_name || y.name} (${x?.vehicle_category_id || y.letter})`)(scheduledSet, model)}`];
    } else {
      return ["Model", `${model || "Unknown"}`];
    };
  })(vehicle?.VehicleInstance?.model, vehicle.TripInstance?.scheduledSet, vehicle?.VehicleInstance?.type);

  new Table("vehicle-information-table", {

    "Trip": "SECTION_HEADER",
    "ID": vehicle.TripInstance?.id,
    "Headsign": vehicleTitle.innerText,
    "Note": vehicle.TripInstance?.note,
    "Direction bound": typeof vehicle.TripInstance?.directionBound == "number" ? `${vehicle.TripInstance.directionBound == 0 ? "Outbound" : "Inbound"} (${vehicle.TripInstance.directionBound})` : null,
    "Schedule relationship": vehicle.TripInstance?.scheduleRelationship,
    "Shape ID": vehicle.TripInstance?.shapeId,
    "Last updated": vehicle.TripInstance?.time ? `<time>${formatDate(vehicle?.TripInstance?.time * 1000)}</time>` : null,

    "Route": "SECTION_HEADER",
    "ID": vehicle.TripInstance?.route?.id,
    "Agency": vehicle.TripInstance?.route?.agency ? `${vehicle.TripInstance.route.agency.name} (${vehicle.TripInstance.route.agency.id})` : null,
    "Colour": vehicle.TripInstance?.route?.color ? `<div class="color-box" style="background-color: ${vehicle?.TripInstance?.route?.color};  color: ${hexToLuminance(vehicle?.TripInstance?.route?.color) >= 0.6 ? "#000000" : "#FFFFFF"}">${vehicle?.TripInstance?.route?.color}</div>` : null,
    "Text colour": vehicle.TripInstance?.route?.textColor ? `<div class="color-box" style="background-color: ${vehicle?.TripInstance?.route?.textColor}; color: ${hexToLuminance(vehicle?.TripInstance?.route?.textColor) >= 0.6 ? "#000000" : "#FFFFFF"}">${vehicle?.TripInstance?.route?.textColor}</div>` : null,
    "Description": vehicle.TripInstance?.route.description,
    "Short name": vehicle.TripInstance?.route?.shortName,
    "Long name": vehicle.TripInstance?.route?.longName,

    "Vehicle": "SECTION_HEADER",
    "ID": vehicle.VehicleInstance?.id,
    "Mode type": vehicle.VehicleInstance?.type,
    "Air conditioning": vehicle.VehicleInstance?.aircon,
    "Wheelchair accessible": vehicle.VehicleInstance?.wheelchair,
    "Last position": Object.entries(vehicle.VehicleInstance?.lastPosition?.coordinates).map((x) => `${x[0] == "lat" ? "Latitude" : "Longitude"}: ${parseFloat(Math.abs(x[1]).toFixed(7))}°${x[0] == "lat" ? x[1] > 0 ? "N" : "S" : x[1] > 0 ? "E" : "W"}`).join("\n"),
    "Last bearing": vehicle.VehicleInstance?.lastPosition?.bearing ? `${bearingToCardinal(vehicle.VehicleInstance.lastPosition.bearing)} (${parseFloat(vehicle.VehicleInstance.lastPosition.bearing.toFixed(2))}°)` : null,
    "Last location": vehicle.VehicleInstance?.lastPosition?.location,
    "Last speed": typeof vehicle.VehicleInstance?.lastPosition?.speed == "number" ? `${parseFloat(vehicle.VehicleInstance.lastPosition.speed.toFixed(3))} km/h` : null,
    "Last updated": vehicle.VehicleInstance?.lastPosition?.time ? `<time>${formatDate(vehicle?.VehicleInstance?.lastPosition?.time * 1000)}</time>` : null,
    [model[0]]: vehicle.VehicleInstance?.model ? model[1] : null,
    "Status": vehicle.VehicleInstance?.status ? vehicle?.VehicleInstance?.status.replaceAll("_", " ") : null,

    "Bus filter attributes": vehicle.VehicleInstance?.specialAttributes?.length > 0 ? vehicle?.VehicleInstance?.specialAttributes.join("\n") : null,

    "Other": "SECTION_HEADER",
    "Feed path": vehicle.TripInstance?.path ? vehicle.TripInstance.path?.replace("regionbuses", "regionbuses/")?.replace("lightrail", "lightrail/")?.replace("ferries", "ferries/") : null,

  });

  const timetableTable = vehicle.StoppingPattern?.timetable?.map((stopEvent) => {
    return [`${stopEvent.stop?.name || `ID: ${stopEvent.stopId}`}${stopEvent.timepoint == true ? "\n(Timepoint)" : ""}`, `ARR: <time>${stopEvent.arr}</time>\nDEP: <time>${stopEvent.dep}</time>`];
  });

  new Table("stopping-information-table", Object.fromEntries([["Static Timetable", "SECTION_HEADER"]].concat(timetableTable.length == 0 ? ["Unknown", "Unknown"] : timetableTable)));

  if (pan) {
    map.panTo(vehicle.VehicleInstance?.lastPosition?.coordinates, { animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches, duration: 0.5 });
  };

  console.log(vehicle);

  setTimeout(() => { updateVehicleInstance(params, instanceId, null, false); }, 10000);
};

async function loadStopInstance(params, instanceId) {
  await loadPartial('side-bar', '../html/partials/stop-instance.html');
  backCancelButtons();
};

async function updateStopInstance(params, instanceId, stop, pan) {
  if (instanceId != new URLSearchParams(window.location.search).get('instanceId')) { return; };
  stop = stop || await fetchInstance(instanceId);
  if (instanceId != new URLSearchParams(window.location.search).get('instanceId')) { return; };
  if (!stop || stop == {} || stop?.error) { return await loadPartial('side-bar', '../html/partials/error.html'); };
  lastUpdatedFor = "stopInstance";

  preloadImage(`../icons/nsw/${stop.type}.png`, 34, 34);
  const stopInstanceTypeIcon = getElement("stop-instance-type-img");
  stopInstanceTypeIcon.src = `../icons/nsw/${stop.name.includes("Coach Stop") ? "coach" : stop.type}.png`;
  stopInstanceTypeIcon.alt = `${stop.name.includes("Coach Stop") ? "coach" : stop.type} icon`

  getElement("stop-instance-title").innerHTML = stop.subName?.headName || stop.name;

  if (stop.subName?.subtitle) {
    const subtitle = document.createElement("div");
    subtitle.id = "stop-instance-subtitle";
    subtitle.className = "text-14px text-medium text-secondary";
    subtitle.innerHTML = `${(stop?.subName?.delim || "").replace(",", "").trim()}${stop?.subName?.delim ? " " : ""}${stop.subName.subtitle}`;
    const subtitleElement = getElement("stop-instance-subtitle");
    if (subtitleElement) {
      subtitleElement.innerHTML = subtitle.innerHTML;
    } else {
      getElement("stop-instance-header").appendChild(subtitle);
    };
  };

  getElement("stop-instance-stop_id").innerHTML = `ID: ${stop.id}`;

  new Table("stop-information-table", {

    "Stop ID": stop.id?.toString(),
    "Stop code": stop.code?.toString(),
    "Expected postcode": stop.code?.toString().slice(0, 4),
    "Stop name": stop.name,
    "Stop position": [["lat", stop.lat], ["lng", stop.lng]].map((x) => `${x[0] == "lat" ? "Latitude" : "Longitude"}: ${parseFloat(Math.abs(x[1]).toFixed(7))}°${x[0] == "lat" ? x[1] > 0 ? "N" : "S" : x[1] > 0 ? "E" : "W"}`).join("\n"),
    "Stop type": stop.type,
    "Location type": stop.locationType,

  });

  if (stop?.stopInfo) {
    const table1 = new Table("locfal-information-table", {
      "TSN": stop.stopInfo.transitStopNumber?.toString(),
      "EFA ID": stop.stopInfo.efaId?.toString(),
      "Address": stop.stopInfo.address,
      "Location name": stop.stopInfo.locationName,
      "Phone number": stop.stopInfo.phone,
      "Opal morning peak": stop.stopInfo.opalMorningPeak?.replace("-", " - "),
      "Opal afternoon peak": stop.stopInfo.opalAfternoonPeak?.replace("-", " - "),
      "Short platform": stop.stopInfo.shortPlatform,
      "Accessibility": stop.stopInfo.accessibility.join("\n"),
      "Facilities": stop.stopInfo.facilities.join("\n"),
    });

    if (!getElement("locfal-information-table")) {
      const div1 = document.createElement("article");
      div1.className = "side-bar-content";
      div1.setAttribute("aria-labelledby", "locfal-title");
      const div2 = document.createElement("div");
      div2.className = "text-primary text-bold text-18px table-title";
      div2.innerHTML = "Location Facilities";
      div2.id = "locfal-title";

      div1.appendChild(div2);
      div1.appendChild(table1.table);
      getElement("stop-instance-content").appendChild(div1);
    };
  };

  if (pan) {
    map.panTo([stop.lat, stop.lng], { animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches, duration: 0.5 });
  };

  console.log(stop);

  setTimeout(() => { updateStopInstance(params, instanceId, null, false); }, 10000);
};

// =================================================
// UTILITY FUNCTIONS
// =================================================
function clock() {
  getElement("time").innerHTML = formatDate();
  setTimeout(clock, 1000);
};

async function updateLastUpdated() {
  if (!getElement("last-updated")) { return lastUpdatedActive = false; };
  lastUpdatedActive = true;
  getElement("last-updated").innerHTML = `${sToHMS((Date.now() - (lastUpdated)) / 1000)
    } ago`;
  getElement("last-updated").innerHTML += `${onoffline ? '' : `\n(offline, no internet connection)`} `
  setTimeout(() => { updateLastUpdated(); }, 1000);
};

function marker(position, type, id, html, instanceId, zindex) {
  if (type == "div") {
    return L.marker(position, { icon: L.divIcon({ className: '', html: html, instanceId: instanceId }), zIndexOffset: zindex });
  };
  return L.marker(position, { icon: L.icon({ iconUrl: `../icons/${id} `, iconSize: [18, 18], iconAnchor: [9, 9], popupAnchor: [0, 0], instanceId: instanceId }), zIndexOffset: zindex });
};

function vehicleHTMLmarker(label, scheduleDeviation, color, textColor, bearing) {
  return `<div class="vehicle-body">
  <div class="vehicle length-${label?.length || "3"}" style = "background-color: ${color}; color: ${textColor};${scheduleDeviation ? ` box-shadow: ${delayColors[scheduleDeviation]} 0px 0px 5px 0.5px;` : ""}">
    ${bearing ? `<div class="vehicle-arrow" style="${(bearing - 90 < -320 || bearing - 90 < 70) ? "top: 2px; right: 0.5px; position:relative;" : ""} transform: rotate(${bearing - 90}deg);">➤</div>` : ""} ${label || "ADD"}
  </div>
</div>`
};

const boundsQuery = function (bounds) {
  return `&min_lat=${bounds._southWest.lat}&max_lat=${bounds._northEast.lat}&min_lng=${bounds._southWest.lng}&max_lng=${bounds._northEast.lng} `;
};

function getDisplayVehicles() {
  return vehicleTypes.filter((vehicleType) => getElement(`toggle-view-${vehicleType}`) && getComputedStyle(getElement(`toggle-view-${vehicleType}`)).opacity == 1);
};

function applyTolerance(polyline, tolerance) {
  let newPolyline = polyline.map((latLng) => map.latLngToLayerPoint(latLng));
  newPolyline = L.LineUtil.simplify(newPolyline, tolerance);
  newPolyline = newPolyline.map((point) => map.layerPointToLatLng(point));
  return newPolyline;
};

// =================================================
// FETCH FUNCTIONS
// =================================================
async function fetchVehicles(vehiclesToFetch) {
  if (vehiclesToFetch.length == 0) { return {}; };
  const response = await fetch(`${url.origin}/api/nsw/vehicles?type=${vehiclesToFetch.join(',')}${boundsQuery(map.getBounds())} `, {
    method: 'GET', headers: { "Content-Type": "application/json", "Cache-Control": "max-age=5" },
  });
  if (!response.ok) { return location.reload(); };

  if (lastUpdatedFor == "vehicles") {
    lastUpdated = Date.now();
    if (!lastUpdatedActive) {
      updateLastUpdated();
    };
  };
  return await response.json();
};

async function fetchStops(stopsToFetch) {
  if (stopsToFetch.length == 0) { return {}; };
  const response = await fetch(`${url.origin}/api/nsw/stops?type=${stopsToFetch.join(',')}${boundsQuery(map.getBounds())} `, {
    method: 'GET', headers: { "Content-Type": "application/json", "Cache-Control": "max-age=86400" },
  });
  if (!response.ok) { return location.reload(); };
  return await response.json();
};

async function fetchRouteShapes(path, routeShapes, cache) {
  if (typeof routeShapes == "string") { routeShapes = [routeShapes]; };
  if (routeShapes.length == 0) { return {}; };
  const response = await fetch(`${url.origin}/api/nsw/route_shape?path=${path}&routes=${routeShapes.join(',')}${cache ? `&cache=true` : ""} `, {
    method: 'GET', headers: { "Content-Type": "application/json", "Cache-Control": "max-age=86400" },
  });
  if (!response.ok) { return location.reload(); };
  return await response.json();
};

async function fetchInstance(instanceId) {
  const response = await fetch(`${url.origin}/api/nsw/instance?instanceId=${instanceId}`, {
    method: 'GET', headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${instanceId.split("/")[0] == "stop" ? "86400" : "4"} ` },
  });
  if (!response.ok) { return {}; };
  return await response.json();
};

// =================================================
// UPDATE FUNCTIONS
// =================================================
function updateMarkerTooltip(event) {
  currentMarkerHover = document.body.clientWidth <= 768 ? undefined : currentMarkerHover;
  const toolTip = getElement("hover-tooltip");
  if (currentMarkerHover) {
    const instanceIdSplit = currentMarkerHover.split("/");
    const markerPosition = ((mapPosition, markerInMapPosition) => {
      mapPosition = mapPosition || { x: 0, y: 0 }, markerInMapPosition = markerInMapPosition || { x: 0, y: 0 };
      return { x: markerInMapPosition.x + mapPosition.x, y: markerInMapPosition.y + mapPosition.y };
    })(getElement("map").getBoundingClientRect(), event?.containerPoint);

    toolTip.innerHTML = "";
    toolTip.style.display = "flex";
    if (instanceIdSplit[0] == "vehicle") {
      const vehicle = vehicles[instanceIdSplit[1]].find(((vehicle) => vehicle.VehicleInstance.instanceId == currentMarkerHover)) || {};

      const title = document.createElement("div");
      const routeShortName = vehicle?.TripInstance?.route?.shortName || "Unknown";
      const tripHeadSign = Object.values(vehicle?.TripInstance?.headSign || { headline: "Unknown" }).join(" via ");
      title.innerHTML = `<span class="text-bold"> ${routeShortName}</span> ${["Empty Train", "Non Timetabled", "Non Revenue"].some((x) => tripHeadSign.includes(x)) ? " " : " to "}${tripHeadSign != "" ? tripHeadSign : "Unknown"}
      ${vehicle?.VehicleInstance?.specialAttributes?.includes("Christmas Bus") ? "🎄" : ""} `;
      title.style["background-color"] = vehicle?.TripInstance?.route?.color || "#000000";
      title.style["color"] = vehicle?.TripInstance?.route?.textColor || "#FFFFFF";
      title.className = "vehicleToolTipTitle";
      toolTip.appendChild(title);

      const subtext = document.createElement("div");
      ((model, scheduledSet, type) => {
        if (type == "bus") {
          subtext.innerHTML = `Vehicle Model: ${((x) => x == "" ? "Unknown" : String(x))(String(Object.values(model).join(" ")).replaceAll("Unknown", "").trim())} `;
        } else if (["train", "train_link"].includes(type)) {
          subtext.innerHTML = `${scheduledSet ? "Schedule Vehicle: " : "Vehicle Model: "}${((x, y) => `${x?.vehicle_category_name || y.name} (${x?.vehicle_category_id || y.letter})`)(scheduledSet, model)} `;
        } else {
          subtext.innerHTML = `Vehicle Model: ${model || "Unknown"} `;
        };
      })(vehicle?.VehicleInstance?.model, vehicle.TripInstance?.scheduledSet, vehicle?.VehicleInstance?.type);

      subtext.className = "vehicleToolTipSubtext";

      const subtext2 = document.createElement("div");
      subtext2.innerHTML += `Position last updated: ${sToHMS((Date.now() - vehicle.VehicleInstance?.lastPosition?.time * 1000) / 1000)} ago`
      subtext2.className = "vehicleToolTipSubtext";

      toolTip.appendChild(subtext);
      toolTip.appendChild(subtext2);

      if (markerPosition.x + toolTip.offsetWidth + 40 < document.body.clientWidth) {
        // right
        toolTip.style.left = `${markerPosition.x + 40}px`;
        toolTip.style.top = `${markerPosition.y - (toolTip.offsetHeight / 2) + 2.5}px`;
      } else {
        // left
        toolTip.style.left = `${markerPosition.x - 15 - toolTip.offsetWidth}px`;
        toolTip.style.top = `${markerPosition.y - (toolTip.offsetHeight / 2) + 2.5}px`;
      };

      toolTip.setAttribute("role", "tooltip");
      toolTip.setAttribute("aria-label", "Vehicle information tooltip");

    } else if (instanceIdSplit[0] == "stop") {
      const stop = stops[instanceIdSplit[1]].find(((stop) => stop.instanceId == currentMarkerHover)) || {};

      const title = document.createElement("div");
      title.className = "stopToolTipTitle";

      const headName = document.createElement("span");
      headName.innerHTML = stop?.subName?.headName ? stop.subName.headName : stop.name;
      headName.className = "stopToolTipHeadName";
      title.appendChild(headName);

      if (stop.subName?.subtitle) {
        const subtitle = document.createElement("span");
        subtitle.innerHTML = `${(stop?.subName?.delim || "").replace(",", "").trim()}${stop?.subName?.delim ? " " : ""}${stop?.subName?.subtitle} `;
        subtitle.className = "stopToolTipSubTitle";
        title.appendChild(subtitle);
      };

      const subtitle2 = document.createElement("span");
      subtitle2.innerHTML = `ID: ${stop?.id} `;
      subtitle2.className = "stopToolTipSubTitle2";
      title.appendChild(subtitle2);

      toolTip.appendChild(title);

      if (markerPosition.x + toolTip.offsetWidth + 40 < document.body.clientWidth) {
        // right
        toolTip.style.left = `${markerPosition.x + 14}px`;
        toolTip.style.top = `${markerPosition.y - (toolTip.offsetHeight / 2)}px`;
      } else {
        // left
        toolTip.style.left = `${markerPosition.x - 14 - toolTip.offsetWidth}px`;
        toolTip.style.top = `${markerPosition.y - (toolTip.offsetHeight / 2)}px`;
      };
    };

    toolTip.setAttribute("role", "tooltip");
    toolTip.setAttribute("aria-label", "Stop information tooltip");

  } else {
    toolTip.style.display = "none";
  }
};

function markerHoverStart(event) {
  currentMarkerHover = event?.sourceTarget?.options?.icon?.options?.instanceId;
  if (!currentMarkerHover && !mapMoving) { return; };
  updateMarkerTooltip(event);
};

function markerHoverEnd(event) {
  currentMarkerHover = undefined;
  updateMarkerTooltip(event);
};

function isMovingHideTooltip() {
  mapMoving = true;
  currentMarkerHover = undefined;
  updateMarkerTooltip();
};

async function markerClick(event) {
  const markerClicked = event?.sourceTarget?.options?.icon?.options?.instanceId;
  // false when prefers reduced motion
  map.panTo(event.sourceTarget._latlng, { animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches, duration: 0.5 });
  history.pushState({}, "", `?instanceId=${encodeURIComponent(markerClicked)} `);
  await handleInstance();
};

async function drawRoutes(path, routeShapesIds) {
  let routeShapes = await fetchRouteShapes(path, routeShapesIds, true);
  for (const routeShape of Object.keys(routeShapes)) {
    const latLngs = routeShapes[routeShape].polyline;
    const polyline = L.polyline(filterPointsMinDistance(latLngs, 60), { color: `#${routeShapes[routeShape].color} `, weight: 2.5, offset: 2, smoothFactor: 2.5 });
    routeShapesLayerGroup.addLayer(polyline);
    routeShapes[routeShape].layer = polyline;
  };
  routePolylines[path] = routeShapes;
};

function filterPointsMinDistance(points, minimum) {
  const filtered = [points[0]];
  for (const point of points) {
    const lastPoint = filtered[filtered.length - 1];
    const currentPoint = point;
    const distance = map.distance(lastPoint, currentPoint);
    if (distance > minimum) { filtered.push(currentPoint); };
  };
  return filtered;
};

function updateTolerance() {
  const tolerance = Math.max(0, (21 - map._zoom) / 6 - 0.3);
  let newPolyline;
  for (const [key, value] of Object.entries(Object.assign({}, ...Object.values(routePolylines)))) {
    if (!key || !value) { return; };
    if (toleranceCache[tolerance] && toleranceCache[tolerance][key]) {
      newPolyline = toleranceCache[tolerance][key];
    } else {
      newPolyline = applyTolerance(value.polyline, tolerance);
      toleranceCache[tolerance] = toleranceCache[tolerance] || {};
      toleranceCache[tolerance][key] = newPolyline;
    };
    value.layer.setLatLngs(newPolyline);
  };

  for (const [key, value] of Object.entries(instanceLayerGroup._layers)) {
    let thisTolerance = Math.max(0, (21 - map._zoom) / 6 - 0.3);
    newPolyline = applyTolerance(value.options.polyline, thisTolerance);
    value.setLatLngs(newPolyline);
  };
};

async function mapUpdate(updateType) {
  if (updateType != "no_vehicles") { vehicleUpdate(updateType); };

  if (mapFilters.get("display_stations_icons") == "false") {
    map.removeLayer(stopLayerGroup);
  } else if (!map.hasLayer(stopLayerGroup)) {
    map.addLayer(stopLayerGroup);
  };
  if (mapFilters.get("display_route_shapes") == "false") {
    map.removeLayer(routeShapesLayerGroup);
  } else if (!map.hasLayer(routeShapesLayerGroup)) {
    map.addLayer(routeShapesLayerGroup);
  };

  if (!map.hasLayer(stopLayerGroup)) { return; };
  const displayStops = Object.entries(stopTypesMinZoom).filter(([zoom]) => Number(zoom) <= map._zoom).flatMap(([, stopTypes]) => stopTypes);
  stops = await fetchStops(displayStops);

  for (const stopType of Object.keys(stops)) {
    stops[stopType].forEach((stop) => {
      const instanceId = stop.instanceId || `stop/${stopType}/${stop.id}`;
      if (!markers[instanceId]) {
        const stopMarker = marker([stop.lat, stop.lng], "icon", `nsw/${stop.name.includes("Coach Stop") ? "coach" : stopType}.png`, "", instanceId, 0);
        stopMarker.on('mouseover', markerHoverStart).on('mouseout', markerHoverEnd).on('click', markerClick);
        stopLayerGroup.addLayer(stopMarker);
        markers[instanceId] = stopMarker;
      }
    });
  };

  Object.keys(markers).filter((marker) => marker.startsWith(`stop`)).forEach((instanceId) => {
    if (!stops[instanceId.split("/")[1]]?.some((stop) => stop.instanceId == instanceId)) {
      stopLayerGroup.removeLayer(markers[instanceId]);
      delete markers[instanceId];
    };
  });
};

function deleteVehicleMarker(instanceId) {
  vehicleLayerGroup.removeLayer(markers[instanceId]);
  delete markers[instanceId];
};

function vehicleOpacity(auto) {
  const params = new URLSearchParams(window.location.search);
  const instanceDisplayed = auto || !!(((x) => x && x.has('instanceId') && x.get('instanceId').split("/")[0] == "vehicle")(params));
  const instanceId = instanceDisplayed ? params.get('instanceId') : null;
  Object.values(vehicleLayerGroup._layers).forEach((x) => {
    x._icon.style["opacity"] = instanceDisplayed ? (x.options.icon.options.instanceId == instanceId ? 1 : 0.5) : 1;
    if (x.options.icon.options.instanceId == instanceId) {
      x.options.zIndexOffset = 20000;
    }
  });
};

async function vehicleUpdate(updateType) {
  const displayVehicles = vehicleTypes.filter((vehicleType) => mapFilters.get("vehicle").includes(vehicleType));
  if (updateType == "view_toggle_hide") {
    vehicles = Object.fromEntries(Object.entries(vehicles).filter(([key]) => displayVehicles.includes(key)));
  } else if (updateType == "zoom_in_update") {
    for (const vehicleType of Object.keys(vehicles)) {
      vehicles[vehicleType].filter(vehicle => {
        const { lat, lng } = vehicle?.VehicleInstance?.lastPosition?.coordinates;
        const inBounds = lat && lat > newBounds._southWest.lat && lat < newBounds._northEast.lat && lng && lng > newBounds._southWest.lng && lng < newBounds._northEast.lng;
        // const instanceId = vehicle.VehicleInstance?.instanceId;
        // if (!inBounds && markers[instanceId]) {
        //   vehicleLayerGroup.removeLayer(markers[instanceId]);
        //   delete markers[instanceId];
        // };
        return inBounds;
      });
    };
  } else {
    vehicles = await fetchVehicles(displayVehicles);
  };

  Object.keys(markers).filter((marker) => marker.startsWith(`vehicle`)).filter((instanceId) => !displayVehicles.some((vehicleType) => instanceId.split("/")[1] == vehicleType)).forEach((instanceId) => {
    deleteVehicleMarker(instanceId);
  });

  for (const vehicleType of Object.keys(vehicles)) {
    vehicles[vehicleType].forEach((vehicle) => {
      const position = vehicle.VehicleInstance?.lastPosition;
      if (!position?.coordinates?.lat) { return; };

      const vTi = vehicle?.TripInstance;
      const instanceId = vehicle.VehicleInstance?.instanceId;
      const vehicleIcon = vehicleHTMLmarker(vTi?.route?.shortName, vTi?.serviceDeviation, vTi?.route?.color, vTi?.route?.textColor, position?.bearing);

      const isHidden = (mapFilters.get("display_unscheduled_vehicles") == "false" && vehicle?.TripInstance?.scheduleRelationship == "UNSCHEDULED") ||
        ((mapFilters.get("special-attributes").length > 0 && !vehicle?.VehicleInstance?.specialAttributes.some((specialAttribute) => mapFilters.get("special-attributes").includes(specialAttribute))) ||
          (mapFilters.get("train-set-type").length > 0 && !mapFilters.get("train-set-type").includes(vehicle.VehicleInstance?.model?.letter))
        );

      if (markers[instanceId]) {
        if (isHidden) {
          return deleteVehicleMarker(instanceId);
        };

        markers[instanceId].setIcon(L.divIcon({ className: '', html: vehicleIcon, instanceId: instanceId }));

        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          markers[instanceId].setLatLng(position?.coordinates);
        } else {
          markers[instanceId].slideTo(position?.coordinates, { duration: 500, keepAtCenter: false, });
        };
      } else if (!isHidden) {
        const vehicleMarker = marker(position?.coordinates, "div", undefined, vehicleIcon, vehicle.VehicleInstance.instanceId, 10000);
        vehicleMarker.on('mouseover', markerHoverStart).on('mouseout', markerHoverEnd).on('click', markerClick);
        vehicleLayerGroup.addLayer(vehicleMarker);
        markers[instanceId] = vehicleMarker;
      };
    });
  };

  Object.keys(markers).filter((marker) => marker.startsWith(`vehicle`)).forEach((instanceId) => {
    if (!vehicles[instanceId.split("/")[1]]?.some((vehicle) => vehicle.VehicleInstance?.instanceId == instanceId)) {
      deleteVehicleMarker(instanceId);
    };
  });

  vehicleOpacity();

  if (updateType == "tick_update") {
    setTimeout(() => { vehicleUpdate("tick_update"); }, 10000);
  };
};

// =================================================
// EVENT LISTENERS
// =================================================
window.addEventListener("unhandledrejection", (error) => { console.warn(`Unhandled rejection: ${error.reason}`); });

document.addEventListener("DOMContentLoaded", async () => {
  registerServiceWorkers();
  setTheme();
  await loadPartial('nav-bar', '../html/partials/nav-bar.html');
  clock();

  await handleInstance();
  sideBarAdjuster();

  mapUpdate("tick_update");

  await drawRoutes("metro", ["3722",]);

  await drawRoutes("sydneytrains", [
    "APS_1a", "APS_1c", "BMT_1", "CCN_1a", "CMB_2a", "CTY_NC1", "CTY_NW1a", "CTY_NW1b", "CTY_S1a", "CTY_S1d", "CTY_S1g",
    "CTY_W1a", "CTY_W1b", "ESI_1a", "ESI_1d", "HUN_1a", "HUN_1b", "IWL_1a", "IWL_1c", "IWL_1e", "NSN_1a", "NSN_2i",
    "NSN_2k", "NTH_1a", "OLY_1a", "SCO_1a", "SCO_1b", "SHL_1d", "T3_1a", "T6_1a", "WST_2c", "WST_2d",
  ]);

  await drawRoutes("lightrailcbdandsoutheast", ["9093", "9033",]);
  await drawRoutes("lightrailparramatta", ["5068",]);
  await drawRoutes("lightrailinnerwest", ["L10017",]);
  await drawRoutes("lightrailnewcastle", ["NLR.OUTBOUND",]);
  await drawRoutes("buses", ["187249", "168350", "187248", "94342",]);

});

window.addEventListener("offline", () => { onoffline = false });
window.addEventListener("online", () => { onoffline = true });

document.addEventListener("visibilitychange", () => { if (!document.hidden) { mapUpdate("page_show"); }; });

map.addEventListener("move", isMovingHideTooltip);
map.addEventListener("movestart", isMovingHideTooltip);
map.addEventListener("mousedown", isMovingHideTooltip);

map.addEventListener("moveend", () => {
  updateTolerance();

  mapMoving = false;
  oldBounds = newBounds || map.getBounds(), newBounds = map.getBounds();
  const zoomType = (newBounds._southWest.lat > oldBounds._southWest.lat &&
    newBounds._northEast.lat < oldBounds._northEast.lat &&
    newBounds._southWest.lng > oldBounds._southWest.lng &&
    newBounds._northEast.lng < oldBounds._northEast.lng) ? "in" : "out";
  return mapUpdate(`zoom_${zoomType}_update`);
});

map.addEventListener("click", async (event) => {
  history.pushState({}, "", `${url.origin}/map`);
  await handleInstance();
});