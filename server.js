// `du -sh .[!.]* * | sort -h` - SORT FILES BY SIZE (INCL. HIDDEN)
// `rm -rf .git` - REMOVE GIT

import express from "express";
import compression from "compression";
import path from "node:ath";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import dotenv from "dotenv";
dotenv.config();

export const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { updateGTFS, fetchAPIproto } from "./functions/api_fetch.js";
import {
    getBearing,
    log,
    day,
    directoryTree,
    Timer,
    formatDate,
    jsonToCsv,
} from "./functions/utility.js";
import { Vehicle } from "./functions/Vehicle.js";
import { StopInstance } from "./functions/Stop.js";
import {
    createTable,
    loadCSVIntoTable,
    databaseFind,
    databaseAll,
    databaseMatch,
    databaseMatchCoords,
    databaseBatchMatch,
} from "./functions/sql.js";
// import { processTables } from './functions/sql.js';

// console.log(directoryTree(`./`, ["%node_modules", "%DS_Store", "./references/documentation", "./public/icons", "./public/images", "./public/js/leaflet"]));

// fs.writeFileSync("cache/nsw/last_updated.json", "{}");
// fs.writeFileSync("cache/nsw/route_shape_cache.json", "{}");
// fs.writeFileSync("cache/nsw/vehicles.json", "{}");
// process.exit();

export const API_Keys = {
    NSW1: process.env.NSW1,
    NSW2: process.env.NSW2,
    NSW3: process.env.NSW3,
    VIC_Trains_Buses: process.env.VIC_Trains_Buses,
};

export const gtfsPaths = [
    { type: "train", version: [1, 2], path: "sydneytrains" },
    { type: "train_link", version: 1, path: "nswtrains" },
    { type: "metro", version: 2, path: "metro" },
    { type: "bus", version: 1, path: "regionbuses/centralwestandorana" },
    { type: "bus", version: 1, path: "regionbuses/centralwestandorana2" },
    { type: "bus", version: 1, path: "regionbuses/newenglandnorthwest" },
    { type: "bus", version: 1, path: "regionbuses/northcoast" },
    { type: "bus", version: 1, path: "regionbuses/northcoast2" },
    { type: "bus", version: 1, path: "regionbuses/northcoast3" },
    { type: "bus", version: 1, path: "regionbuses/riverinamurray" },
    { type: "bus", version: 1, path: "regionbuses/riverinamurray2" },
    { type: "bus", version: 1, path: "regionbuses/southeasttablelands" },
    { type: "bus", version: 1, path: "regionbuses/southeasttablelands2" },
    { type: "bus", version: 1, path: "regionbuses/sydneysurrounds" },
    { type: "bus", version: 1, path: "regionbuses/newcastlehunter" },
    { type: "bus", version: 1, path: "regionbuses/farwest" },
    { type: "light_rail", version: 1, path: "lightrail/cbdandsoutheast" },
    { type: "light_rail", version: 1, path: "lightrail/innerwest" },
    { type: "light_rail", version: 1, path: "lightrail/newcastle" },
    { type: "light_rail", version: 1, path: "lightrail/parramatta" },
    { type: "ferry", version: 1, path: "ferries/sydneyferries" },
    { type: "bus", version: 1, path: "buses" },
];

console.log("PROGRAM STARTED");

const fixStopIds = {
    2000442: "2000441",
    203771: "203783",
    20003: "200020",
    20004: "200020",
    20005: "200020",
    20006: "200020",
    2000274: "200020",
    200910: "2000260",
};

let pendingGTFSupdate = {};
let lastGTFSupdate = {};
export const setPendingGTFSUpdate = function (path, value) {
    return (pendingGTFSupdate[path] = value);
};
export const getLastGTFSUpdate = function (path) {
    return lastGTFSupdate[path] || 0;
};
export const setLastGTFSUpdate = function (path, value) {
    return (lastGTFSupdate[path] = value);
};

const app = express();
app.use(compression({ threshold: 2048 }));
const staticCacheTimes = {
    html: "86400",
    css: "86400",
    png: "86400",
    js: "86400",
};
app.use(
    express.static(path.join(__dirname, "public"), {
        setHeaders: (res, filePath) => {
            const cacheTime = Object.entries(staticCacheTimes).find(
                (extension) => filePath.endsWith(extension[0])
            );
            res.setHeader(
                "Cache-Control",
                `public, max-age=${(cacheTime || [0])[0]}`
            );
        },
    })
);

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public/html/home.html"));
});
app.get("/settings", (req, res) => {
    res.sendFile(path.join(__dirname, "public/html/settings.html"));
});
app.get("/map", async (req, res) => {
    if (Object.values(pendingGTFSupdate).includes(true)) {
        return res.sendFile(
            path.join(__dirname, "public/html/status/503.html")
        );
    }
    res.sendFile(path.join(__dirname, "public/html/map.html"));
});
app.get("/routes", async (req, res) => {
    res.sendFile(path.join(__dirname, "public/html/routes.html"));
});

let vehiclesCache = JSON.parse(
    fs.readFileSync("cache/nsw/vehicles.json", {
        encoding: "utf8",
        flag: "r",
    }) || {}
);
let stopTimesCache = JSON.parse(
    fs.readFileSync("cache/nsw/vehicles.json", {
        encoding: "utf8",
        flag: "r",
    }) || {}
);

const trainDuplicates = fs
    .readFileSync("cache/nsw/train_duplicates.txt", {
        encoding: "utf8",
        flag: "r",
    })
    .split("\n");

async function updateGTFSR(type, version, path) {
    try {
        const t = new Timer(`GTFS-R UPDATE ${path.padStart(32, " ")}`).start();
        version = version[1] || version;
        let vehiclePositions = await fetchAPIproto(
            `https://api.transport.nsw.gov.au/v${version}/gtfs/vehiclepos/${path}`,
            "GET",
            "proto/1007_extension.proto",
            "transit_realtime.FeedMessage",
            {
                accept: "application/x-google-protobuf",
                authorization: `apikey ${API_Keys.NSW1}`,
            }
        );
        let tripUpdates = await fetchAPIproto(
            `https://api.transport.nsw.gov.au/v${version}/gtfs/realtime/${path}`,
            "GET",
            "proto/1007_extension.proto",
            "transit_realtime.FeedMessage",
            {
                accept: "application/x-google-protobuf",
                authorization: `apikey ${API_Keys.NSW1}`,
            }
        );
        if (!vehiclePositions || !tripUpdates) {
            return;
        }

        const workingPath = path.replaceAll("/", "");

        const match = vehiclePositions?.response
            .map((vehiclePosition) => vehiclePosition?.vehicle?.trip?.tripId)
            .filter(Boolean);
        const dbMatch = databaseBatchMatch(
            match,
            "trip_id",
            `${workingPath}_trips`,
            "*"
        );
        const tripLookup = dbMatch
            ? Object.fromEntries(dbMatch.map((row) => [row.trip_id, row]))
            : {};

        const match2 = [
            ...new Set(
                Object.values(tripLookup)?.map((trip) => trip?.route_id)
            ),
        ];
        const dbMatch2 = databaseBatchMatch(
            match2,
            "route_id",
            `${workingPath}_routes`,
            "*"
        );
        const routeLookup = dbMatch2
            ? Object.fromEntries(dbMatch2.map((row) => [row.route_id, row]))
            : {};

        const match3 = [
            ...new Set(
                Object.values(routeLookup)?.map((route) => route?.agency_id)
            ),
        ];
        const dbMatch3 = databaseBatchMatch(
            match3,
            "agency_id",
            `${workingPath}_agency`,
            "*"
        );
        const agencyLookup = dbMatch3
            ? Object.fromEntries(dbMatch3.map((row) => [row.agency_id, row]))
            : {};

        const vehicles = vehiclePositions?.response;
        const previousVehicles = vehiclesCache[path]?.response;

        const stoppingPatternLookup = databaseBatchMatch(
            match,
            "trip_id",
            `${workingPath}_stop_times`,
            "*"
        ).reduce((acc, row) => {
            const { trip_id, ...rest } = row;
            acc[trip_id] = acc[trip_id] || {};
            acc[trip_id]["timetable"] = acc[trip_id]["timetable"] || [];
            acc[trip_id]["timetable"].push(rest);
            return acc;
        }, {});

        vehiclesCache[path] = vehiclesCache[path] || {};
        vehiclesCache[path].header = tripUpdates?.header;
        vehiclesCache[path].response = [];

        vehicles?.forEach((vehiclePosition) => {
            const tripId = vehiclePosition?.vehicle?.trip?.tripId;
            const tripUpdate = tripUpdates.response.find(
                (trip) => tripId == trip?.tripUpdate?.trip?.tripId
            );
            if (type == "train") {
                if (trainDuplicates.includes(tripId.split(".")[0])) {
                    return undefined;
                }
                if (vehiclesCache[path]?.response) {
                    const previousVehicle = previousVehicles?.find(
                        (vehicle) =>
                            vehicle.VehicleInstance.instanceId ==
                            `vehicle/${type}/${day()}/${
                                tripId.startsWith("NonTimetabled")
                                    ? tripId
                                    : tripId.split(".")[0]
                            }`
                    );
                    const previousVehiclePosition =
                        previousVehicle?.VehicleInstance?.lastPosition
                            ?.coordinates;
                    const currentVehiclePosition =
                        vehiclePosition?.vehicle.position;
                    if (!!previousVehiclePosition && !!currentVehiclePosition) {
                        if (
                            previousVehiclePosition.lat ==
                                currentVehiclePosition.lat &&
                            previousVehiclePosition.lng ==
                                currentVehiclePosition.lng
                        ) {
                            vehiclePosition.vehicle.position.dir =
                                previousVehicle.VehicleInstance.lastPosition
                                    .bearing || 0;
                        } else {
                            vehiclePosition.vehicle.position.dir = getBearing(
                                previousVehicle.VehicleInstance.lastPosition
                                    .coordinates,
                                vehiclePosition.vehicle.position
                            );
                        }
                    }
                }
            }
            const tripInfo = tripLookup[tripId];
            const routeInfo = tripInfo
                ? routeLookup[tripInfo.route_id]
                : undefined;
            const agencyInfo = routeInfo
                ? agencyLookup[routeInfo.agency_id]
                : undefined;

            const stopTimeUpdates =
                tripUpdate?.tripUpdate?.stopTimeUpdate || [];
            const stoppingPattern = stoppingPatternLookup[tripId] || [];

            vehiclesCache[path].response.push(
                new Vehicle(
                    vehiclePosition,
                    tripUpdate,
                    tripInfo,
                    routeInfo,
                    agencyInfo,
                    stoppingPattern,
                    type,
                    workingPath
                )
            );

            if (stoppingPattern != [] && !!stoppingPatternLookup[tripId]) {
                for (const stopTimeUpdate of stopTimeUpdates) {
                    stopTimeUpdate.arrival;
                }
                stoppingPatternLookup[tripId]["stop_times"] = stopTimeUpdates;
            }
            //console.log(stopTimeUpdates);
        });

        // stopTimesCache[path].response = stoppingPatternLookup;

        // stopTimesCache[path].response = tripUpdates.response.map((tripUpdate) => {
        //     const tripId = tripUpdate?.vehicle?.trip?.tripId;
        //     const vehiclePosition = vehicles.find((vehicle) => tripId == vehicle?.vehicle?.trip?.tripId);
        //     if (!vehiclePosition) {
        //         console.log(tripUpdate)
        //     }
        // });

        fs.writeFileSync(
            "cache/nsw/vehicles.json",
            JSON.stringify(vehiclesCache, null, 4)
        );

        return log.greenB(
            `FINISH GTFS-R ${path.padStart(
                38,
                " "
            )} UPDATED <${formatDate()}> ${t.timeSinceStart}ms`
        );
    } catch (error) {
        console.error(error);
    }
}

const openDataFetch = async function (resourceId, method, headers) {
    return await fetch(
        `https://opendata.transport.nsw.gov.au/data/api/3/action/datastore_search?resource_id=${resourceId}&limit=10000`,
        { method: method, mode: "cors", headers: headers }
    );
};
async function updateLocationFacilities() {
    try {
        const t = new Timer(`UPDATE LOCATION FACILITIES`).start();
        const resourceId = "e9d94351-f22d-46ea-b64d-10e7e238368a";
        const response = await openDataFetch(resourceId, "GET", {
            accept: "application/json",
            "Cache-Control": "max-age=86400",
        });
        const data = await response.json();
        const records = jsonToCsv(data.result.records);
        const fieldTypes = { int: "INTEGER", text: "TEXT", numeric: "FLOAT" };
        const tableColumns = data.result.fields.map((field) => [
            field.id,
            fieldTypes[field.type],
        ]);
        fs.writeFileSync("./cache/nsw/location_facilities.txt", records);
        createTable("location_facilities", tableColumns);
        const t2 = new Timer(`LOAD LOCATION FACILITIES`).start();
        await loadCSVIntoTable(
            "./cache/nsw/location_facilities.txt",
            "location_facilities",
            tableColumns
        );
        fs.unlinkSync("./cache/nsw/location_facilities.txt");
        t2.end();
        t.end();
    } catch (error) {
        log.redB(error);
    }
}

app.get("/api/:state/:request", async (req, res) => {
    const { state, request } = req.params;
    if (state == "nsw") {
        if (request == "available") {
            return res.sendStatus(
                Object.values(pendingGTFSupdate).includes(true) ? 503 : 200
            );
        }
        if (Object.values(pendingGTFSupdate).includes(true)) {
            return res.sendStatus(503);
        }
        if (request == "vehicles") {
            let {
                type,
                min_lat = -90,
                max_lat = 90,
                min_lng = -180,
                max_lng = 180,
            } = req.query;

            let vehicles = {};

            const paths = gtfsPaths.filter((item) =>
                type.toLowerCase().split(",").includes(item.type)
            );
            for (const { type, path, version } of paths) {
                if (
                    !vehiclesCache[path] ||
                    !vehiclesCache[path]?.header ||
                    Date.now() - vehiclesCache[path]?.header?.timestamp * 1000 >
                        15000
                ) {
                    try {
                        setTimeout(() => {
                            if (!pendingGTFSupdate[path]) {
                                updateGTFS({ version, path });
                            }
                            updateGTFSR(type, version, path);
                        }, 0);
                    } catch (error) {
                        console.error(error);
                        return res
                            .status(500)
                            .send({ error: "Internal server error" });
                    }
                }
                vehicles[type] = (vehicles[type] || []).concat(
                    vehiclesCache[path]?.response
                );
            }
            for (const { type } of paths) {
                vehicles[type] = (vehicles[type] || [])
                    .filter((vehicle) => {
                        const { lat, lng } =
                            vehicle?.VehicleInstance?.lastPosition
                                ?.coordinates || {};
                        return (
                            lat &&
                            lng &&
                            lat > min_lat &&
                            lat < max_lat &&
                            lng > min_lng &&
                            lng < max_lng
                        );
                    })
                    .map((vehicle) => {
                        return {
                            TripInstance: vehicle.TripInstance,
                            VehicleInstance: vehicle.VehicleInstance,
                        };
                    });
            }

            res.setHeader("Content-Type", "application/json");
            res.setHeader(
                "Cache-Control",
                req.headers["cache-control"] || "no-cache"
            );
            return res.status(200).json(vehicles);
        } else if (request == "stops") {
            let {
                type,
                min_lat = -90,
                max_lat = 90,
                min_lng = -180,
                max_lng = 180,
            } = req.query;

            let stops = {};

            const paths = gtfsPaths.filter((item) =>
                type.toLowerCase().split(",").includes(item.type)
            );

            for (const { type, path } of paths) {
                try {
                    const stopSearch = {
                        train: { column: "location_type", toFind: "1" },
                        train_link: { column: "location_type", toFind: "1" },
                        metro: { column: "location_type", toFind: "1" },
                        bus: { column: "parent_station", toFind: "" },
                        ferry: { column: "parent_station", toFind: "" },
                        light_rail: { column: "location_type", toFind: "0" },
                    };
                    const stopInfo = databaseMatchCoords(
                        stopSearch[type].toFind,
                        stopSearch[type].column,
                        `${path.replaceAll("/", "")}_stops`,
                        "*",
                        min_lat,
                        max_lat,
                        min_lng,
                        max_lng,
                        "stop_lat",
                        "stop_lon"
                    );
                    stops[type] = (stops[type] || []).concat(stopInfo);
                } catch (error) {
                    console.error(error);
                    return res
                        .status(500)
                        .send({ error: "Internal server error" });
                }
            }
            for (const type of [...new Set(paths.map((path) => path.type))]) {
                const match = (stops[type] || [])
                    .map((stop) => stop.stop_id)
                    .filter(Boolean);
                const stopLookup = Object.fromEntries(
                    databaseBatchMatch(
                        match,
                        "TSN",
                        "location_facilities",
                        "*"
                    ).map((row) => [row.TSN, row])
                );
                stops[type] = (stops[type] || [])
                    .map((stop) => {
                        const { stop_lat, stop_lon, stop_id } = stop || {};
                        if (
                            !(
                                stop_lat &&
                                stop_lon &&
                                stop_lat > min_lat &&
                                stop_lat < max_lat &&
                                stop_lon > min_lng &&
                                stop_lon < max_lng
                            )
                        ) {
                            return undefined;
                        }
                        const stopInfo =
                            stopLookup[fixStopIds[stop_id] || stop_id];
                        return new StopInstance(stop, stopInfo, type);
                    })
                    .filter(Boolean);
            }

            res.setHeader("Content-Type", "application/json");
            res.setHeader(
                "Cache-Control",
                req.headers["cache-control"] || "no-cache"
            );
            return res.status(200).json(stops);
        } else if (request == "route_shape") {
            let { path, routes, cache } = req.query;
            routes = routes.split(",");
            let routeIds = routes.map(
                (x) => x.split(";")[1] || x.split(";")[0]
            );
            routes = routes.map((x) => x.split(";")[0]);

            const routeShapesCache =
                JSON.parse(
                    fs.readFileSync("cache/nsw/route_shape_cache.json")
                ) || {};
            const cached = routes.filter((x) => routeShapesCache[x]);
            const dbMatch = databaseBatchMatch(
                routeIds,
                "route_id",
                `${path}_routes`,
                "route_id, route_color"
            );
            const routeColors = dbMatch
                ? Object.fromEntries(dbMatch.map((row) => [row.route_id, row]))
                : [];
            let routeShapes = databaseBatchMatch(
                routes.filter((x) => !routeShapesCache[x]),
                "shape_id",
                `${path}_shapes`,
                "*"
            ).reduce((acc, row) => {
                const { shape_id, ...rest } = row;
                const lat = rest.shape_pt_lat,
                    lng = rest.shape_pt_lon,
                    seq = rest.shape_pt_sequence,
                    dist = rest.shape_dist_traveled;
                acc[shape_id] = acc[shape_id] || {};
                acc[shape_id]["polyline"] = acc[shape_id]["polyline"] || [];
                acc[shape_id]["length"] = dist;
                acc[shape_id]["polyline"].push({
                    lat: lat,
                    lng: lng,
                    seq: seq,
                });
                acc[shape_id]["color"] =
                    routeColors[shape_id]?.route_color ||
                    routeColors[routeIds[routes.indexOf(shape_id)]]
                        ?.route_color ||
                    {
                        3722: "168388",
                        9093: "DD1E25",
                        9033: "781140",
                        5068: "BB2043",
                        L10017: "BE1622",
                        "NLR.OUTBOUND": "EE343F",
                        187249: "ED2891",
                        168350: "BC1286",
                        187248: "6B2D86",
                        94342: "FDAE1A",
                    }[shape_id];
                return acc;
            }, {});
            for (const [shapeId, values] of Object.entries(routeShapes)) {
                routeShapes[shapeId]["polyline"] = values["polyline"]
                    .sort((a, b) => a.seq - b.seq)
                    .filter((x) => x.lng > 120)
                    .map((x) => {
                        return { lat: x.lat, lng: x.lng };
                    });
                routeShapes[shapeId]["ppm"] =
                    routeShapes[shapeId]["polyline"].length /
                    (routeShapes[shapeId]["length"] || 20000);
                if (cache || cache == "true") {
                    routeShapesCache[shapeId] = routeShapes[shapeId];
                }
            }

            cached.forEach(
                (shapeId) => (routeShapes[shapeId] = routeShapesCache[shapeId])
            );

            fs.writeFileSync(
                "cache/nsw/route_shape_cache.json",
                JSON.stringify(routeShapesCache, null, 4)
            );

            res.setHeader("Content-Type", "application/json");
            res.setHeader(
                "Cache-Control",
                req.headers["cache-control"] || "no-cache"
            );
            return res.status(200).json(routeShapes);
        } else if (request == "instance") {
            let { instanceId = "" } = req.query;

            try {
                instanceId = instanceId.split("/");
                const instanceType = instanceId[0] || "";
                const instanceVehicleType = instanceId[1] || "";
                if (!["vehicle", "stop"].includes(instanceType)) {
                    return res
                        .status(400)
                        .json({ error: "Invalid instance type" });
                }
                if (
                    ![...new Set(gtfsPaths.map((path) => path.type))].includes(
                        instanceVehicleType
                    )
                ) {
                    return res
                        .status(400)
                        .json({ error: "Invalid vehicle type" });
                }
                if (instanceType == "vehicle") {
                    const vehicleTypePaths = gtfsPaths
                        .filter((path) => path.type == instanceVehicleType)
                        .map((path) => path.path);
                    const vehicleTypeCache = Object.entries(vehiclesCache)
                        .filter(([key, value]) =>
                            vehicleTypePaths.includes(key)
                        )
                        .flatMap((feed) => feed[1].response);
                    const vehicle = vehicleTypeCache.find(
                        (vehicles) =>
                            vehicles.VehicleInstance?.instanceId ==
                            instanceId.join("/")
                    );
                    if (!vehicle) {
                        return res.status(400).json({
                            error: "Vehicle instance does not currently exist",
                        });
                    }
                    const match = vehicle.StoppingPattern?.timetable?.map(
                        (stopEvent) => stopEvent.stopId.toString()
                    );
                    const dbMatch = match
                        ? databaseBatchMatch(
                              match,
                              "stop_id",
                              `${vehicle.TripInstance?.path}_stops`,
                              "stop_id, stop_name"
                          )
                        : [];
                    const stopLookup = dbMatch
                        ? Object.fromEntries(
                              dbMatch.map((row) => [row?.stop_id, row])
                          )
                        : null;

                    if (stopLookup) {
                        vehicle.StoppingPattern?.timetable?.forEach(
                            (stopEvent) => {
                                stopEvent.stopId = stopEvent.stopId.toString();
                                const stopInfo =
                                    stopLookup[stopEvent.stopId] || undefined;
                                if (stopInfo) {
                                    stopEvent.stop = {
                                        name: stopInfo.stop_name,
                                        // desc: stopInfo.stop_desc,
                                        // pos: {
                                        //     lat: stopInfo.stop_lat,
                                        //     lng: stopInfo.stop_lon,
                                        // },
                                    };
                                }
                            }
                        );
                    }

                    res.setHeader("Content-Type", "application/json");
                    res.setHeader(
                        "Cache-Control",
                        req.headers["cache-control"] || "no-cache"
                    );
                    return res.status(200).json(vehicle);
                } else if (instanceType == "stop") {
                    let stop;
                    const vehicleTypePaths = gtfsPaths
                        .filter((path) => path.type == instanceVehicleType)
                        .map((path) => path.path.replaceAll("/", ""));
                    vehicleTypePaths.forEach(
                        (path) =>
                            (stop =
                                databaseFind(
                                    instanceId[2],
                                    "stop_id",
                                    `${path}_stops`,
                                    "*"
                                ) || stop)
                    );
                    if (!stop) {
                        return res
                            .status(400)
                            .json({ error: "Stop does not exist" });
                    }
                    const stopInfo =
                        databaseFind(
                            fixStopIds[stop.stop_id] || stop.stop_id,
                            "TSN",
                            "location_facilities",
                            "*"
                        ) ||
                        databaseFind(
                            stop.parent_station,
                            "TSN",
                            "location_facilities",
                            "*"
                        );
                    const stopInstance =
                        new StopInstance(stop, stopInfo, instanceVehicleType) ||
                        {};

                    res.setHeader("Content-Type", "application/json");
                    res.setHeader(
                        "Cache-Control",
                        req.headers["cache-control"] || "no-cache"
                    );
                    return res.status(200).json(stopInstance);
                }
            } catch (error) {
                console.error(error);
            }
        } else if (request == "routes") {
            if (Object.values(pendingGTFSupdate).includes(true)) {
                return res.sendStatus(503);
            }

            let routes = {},
                routes2 = {},
                trainLinkRouteNames;

            for (const { type, path } of gtfsPaths) {
                const workingPath = path.replaceAll("/", "");
                routes[path] = databaseAll(`${workingPath}_routes`, "*");

                const thisPathAgency = databaseAll(
                    `${workingPath}_agency`,
                    "*"
                );
                if (type == "train_link") {
                    trainLinkRouteNames = databaseBatchMatch(
                        routes[path].map((route) => route.route_id),
                        "route_id",
                        `${workingPath}_trips`,
                        "route_id, route_direction"
                    );
                    trainLinkRouteNames = trainLinkRouteNames
                        ? Object.fromEntries(
                              trainLinkRouteNames.map((row) => [
                                  row.route_id,
                                  row,
                              ])
                          )
                        : [];
                }
                let routeX = 0;
                routes[path].forEach((route) => {
                    const matchingAgency =
                        thisPathAgency.find(
                            (agency) => agency.agency_id == route.agency_id
                        ) || {};
                    const route2 = {
                        agencyId: route.agency_id,
                        agencyName: matchingAgency?.agency_name || "unknown",
                        routeId: route.route_id,
                        routeShortName: route.route_short_name,
                        routeLongName: route.route_long_name,
                        routeDesc: route.route_desc,
                        routeColor: `#${route.route_color}`,
                        routeTextColor: `#${route.route_text_color}`,
                        routeType: route.route_type,
                    };
                    if (type == "train_link") {
                        route2["routeCategory"] = route2.routeLongName;
                        route2["routeLongName"] =
                            trainLinkRouteNames[route.route_id].route_direction;
                    }
                    routes[path][routeX] = route2;
                    routeX++;
                });
            }

            for (const { type, path } of gtfsPaths) {
                routes2[type] = (routes2[type] || []).concat(routes[path]);
            }

            res.setHeader("Content-Type", "application/json");
            res.setHeader(
                "Cache-Control",
                req.headers["cache-control"] || "no-cache"
            );
            return res.status(200).json(routes2);
        }
    }
});

app.all("*", (req, res) => {
    if (req.accepts("html")) {
        return res
            .status(404)
            .sendFile(path.join(__dirname, "public/html/status/404.html"));
    }
    return res.sendStatus(404);
});

const PORT = process.env.PORT;
app.listen(PORT, "127.0.0.1", async () => {
    log.blueB(`START server on port ${PORT}`);
    updateLocationFacilities();
    async function updateAll() {
        const t = new Timer(`GTFS FOR ALL FEEDS`).start();
        for (const { type, version, path } of gtfsPaths) {
            if (!pendingGTFSupdate[path]) {
                await (async (version) => {
                    await updateGTFS({ version, path });
                })(version[0] || version);
            }
            // updateGTFSR(type, version[1] || version, path);
        }
        t.end();
        log.magentaB("SERVER API READY");
        // setTimeout(updateAll, 15000)
    }
    updateAll();
});

process.on("unhandledRejection", (error) => {
    log.redB(`ERROR UNHANDLED REJECTION ${error}`);
});
