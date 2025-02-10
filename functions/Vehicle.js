import { databaseFind } from './sql.js';
import { toBase, getBearing, day } from './utility.js';

const Enum = function (value, type) {
    return Object.keys(type).find((key) => type[key] == value);
};

const TripDescSchRel = {
    // OVERALL TRIP
    SCHEDULED: 0,
    ADDED: 1,
    UNSCHEDULED: 2,
    CANCELED: 3,
    REPLACEMENT: 5,
};
const StopTimeUpdateSchRel = {
    // INDIVIDUAL STOP
    SCHEDULED: 0,
    SKIPPED: 1,
    NO_DATA: 2,
    UNSCHEDULED: 3,
};
const OccupancyStatus = {
    EMPTY: 0,
    MANY_SEATS_AVAILABLE: 1,
    FEW_SEATS_AVAILABLE: 2,
    STANDING_ROOM_ONLY: 3,
    CRUSHED_STANDING_ROOM_ONLY: 4,
    FULL: 5,
    NOT_ACCEPTING_PASSENGERS: 6,
};
const VehicleStopStatus = {
    INCOMING_AT: 0,
    STOPPED_AT: 1,
    IN_TRANSIT_TO: 2,
};
const CongestionLevel = {
    UNKNOWN_CONGESTION_LEVEL: 0,
    RUNNING_SMOOTHLY: 1,
    STOP_AND_GO: 2,
    CONGESTION: 3,
    SEVERE_CONGESTION: 4,
};
const AlertCause = {
    UNKNOWN_CAUSE: 1,
    OTHER_CAUSE: 2,
    TECHNICAL_PROBLEM: 3,
    STRIKE: 4,
    DEMONSTRATION: 5,
    ACCIDENT: 6,
    HOLIDAY: 7,
    WEATHER: 8,
    MAINTENANCE: 9,
    CONSTRUCTION: 10,
    POLICE_ACTIVITY: 11,
    MEDICAL_EMERGENCY: 12,
};
const AlertEffect = {
    NO_SERVICE: 1,
    REDUCED_SERVICE: 2,
    SIGNIFICANT_DELAYS: 3,
    DETOUR: 4,
    ADDITIONAL_SERVICE: 5,
    MODIFIED_SERVICE: 6,
    OTHER_EFFECT: 7,
    UNKNOWN_EFFECT: 8,
    STOP_MOVED: 9,
    NO_EFFECT: 10,
    ACCESSIBILITY_ISSUE: 11,
};
const AlertSeverityLevel = {
    UNKNOWN_SEVERITY: 1,
    INFO: 2,
    WARNING: 3,
    SEVERE: 4,
};
const ToiletStatus = {
    NONE: 0,
    NORMAL: 1,
    ACCESSIBLE: 2,
};

const trainVehicleTypes = {
    "A": { name: "Waratah Series 1", letter: "A", },
    "B": { name: "Waratah Series 2", letter: "B", },
    "C": { name: "C-Set", letter: "C", },
    "D": { name: "Mariyung/NIF", letter: "D", },
    "H": { name: "Oscar", letter: "H", },
    "J": { name: "Hunter", letter: "J", },
    "Hunter Railcar": { name: "Hunter", letter: "J", },
    "K": { name: "K-Set", letter: "K", },
    "M": { name: "Millenium", letter: "M", },
    "N": { name: "Endeavour", letter: "N", },
    "Endeavour": { name: "Endeavour", letter: "N", },
    "P": { name: "Xplorer", letter: "P", },
    "Xplorer": { name: "Xplorer", letter: "P", },
    "S": { name: "S-Set", letter: "S", },
    "T": { name: "Tangara", letter: "T", },
    "V": { name: "Intercity V Set", letter: "V", },
    "X": { name: "XPT", letter: "X", },
    "XPT": { name: "XPT", letter: "X", },
    "Z": { name: "Heritage", letter: "Z", },

    "G": { name: "Freight", letter: "G", },
    "I": { name: "Track Inspection", letter: "I", },
    "L": { name: "Light Locomotive", letter: "L", },
    "O": { name: "Other", letter: "O", },
    "Q": { name: "Maintinence Track Machine", letter: "Q", },
    "U": { name: "Track Occupation", letter: "U", },
    "W": { name: "Fast Freight", letter: "W", },
    "Y": { name: "Other", letter: "Y", },
};

export class Vehicle {
    static TripInstance = class {
        constructor(trip, vehicle, tripInfo, routeInfo, agencyInfo, stopTimes, type, path) {
            this.id = trip.trip?.tripId || vehicle.trip.tripId;
            this.path = path;
            const idSplit = this.id.split(".");
            const routeId = trip.trip?.routeId || vehicle.trip?.routeId;
            const schRel = Enum((trip.trip?.scheduleRelationship || vehicle.trip?.scheduleRelationship), TripDescSchRel);
            // if (tripInfo) {
            //     routeInfo = databaseFind(tripInfo.route_id, "route_id", `${path}_routes`, "*");
            //     if (routeInfo) {
            //         agencyInfo = databaseFind(routeInfo.agency_id, "agency_id", `${path}_agency`, "*");
            //     };
            // };
            if (!(tripInfo || routeInfo || agencyInfo) && type == "train") {
                const unscheduled = !tripInfo || this.id.startsWith("NonTimetabled");
                const nonRevenue = ["RTTA_DEF", "RTTA_REV"].includes(routeId);
                this.runNumber = idSplit[1];
                this.scheduleRelationship = "UNSCHEDULED";
                if (unscheduled && !nonRevenue) {
                    // console.log(this.runNumber)
                    this.headSign = { headline: "Non Timetabled" };
                    this.route = {
                        color: "#000000", textColor: "#FFFFFF",
                        shortName: idSplit[1],
                        longName: `Non Timetabled.${idSplit[1]}`,
                    };
                    this.time = trip.timestamp?.low;
                    if (idSplit[1].startsWith("U")) {
                        this.route.color = "#ff0000";
                        this.route.shortName = "OCCP";
                        this.route.longName = `Track Occupation.${idSplit[1]}`;
                    };
                } else {
                    this.headSign = { headline: "Unscheduled Non Revenue" };
                    this.route = {
                        color: "#888888", textColor: "#FFFFFF",
                        shortName: idSplit[1],
                        longName: `Non Revenue.${idSplit[1]}`,
                        description: 'Non Revenue trips',
                        agency: {
                            id: 'SydneyTrains',
                            name: 'Sydney Trains'
                        }
                    };
                    this.time = trip.timestamp?.low;
                };
                return;
            } else {
                // if (trip.stopTimeUpdate.map((x) => x.stopId).join(", ") == "") {
                //     console.log(trip)
                // }
            };
            let headSign, altHeadSign;
            if (stopTimes?.timetable?.length > 0) {
                altHeadSign = stopTimes?.timetable?.find((stopTime) => stopTime.stop_id == (trip?.stopTimeUpdate?.length > 0 ? trip?.stopTimeUpdate[0].stopId : ""))?.stop_headsign;
            };
            headSign = (altHeadSign && altHeadSign != "") ? altHeadSign : tripInfo?.trip_headsign;
            headSign = ((headSign?.split(" via ")?.length == 1 ? headSign?.split(" Via ") : headSign?.split(" via ")) || []).map((x) => x?.trim())
            this.headSign = {
                headline: headSign[0] || undefined,
                subtitle: headSign[1] || undefined,
            };
            if (this.headSign.headline == '') { this.headSign.headline = 'Non Revenue' };

            this.scheduleRelationship = schRel;
            // trip?.stopTimeUpdate?.length > 0 ? "" : ""
            // console.log(trip?.stopTimeUpdate[0])
            this.serviceDeviation = "ontime";
            this.serviceId = tripInfo?.serviceId;
            this.directionBound = tripInfo?.direction_id;
            this.scheduledSet = ["train", "train_link"].includes(type) ? databaseFind(tripInfo?.vehicle_category_id, "vehicle_category_id", `${path}_vehicle_categories`, "*") : null;
            this.shapeId = tripInfo?.shape_id;
            this.note = tripInfo?.trip_note && (tripInfo?.trip_note != '' ? databaseFind(tripInfo?.trip_note, "note_id", `${path}_notes`, "*") : null);
            this.route = {
                id: tripInfo?.route_id,
                shortName: ((x) => x == "" ? routeInfo?.route_long_name == "Out Of Service" ? "OS" : idSplit[0] : x)(routeInfo?.route_short_name),
                longName: routeInfo?.route_long_name,
                description: routeInfo?.route_desc,
                color: `#${routeInfo?.route_color || "000000"}`,
                textColor: `#${routeInfo?.route_text_color || "FFFFFF"}`,
                agency: {
                    id: routeInfo?.agency_id,
                    name: agencyInfo?.agency_name
                }
            };
            if (this.route.shortName == '' && this.route.longName == 'Non Revenue') {
                this.route.shortName = 'NR';
            };
            this.time = trip.timestamp?.low;
        };
    };
    static VehicleInstance = class {
        constructor(vehicle, trip, tripInfo, routeInfo, agencyInfo, stopTimes, type, path, tripInstance) {
            this.id = vehicle.vehicle?.id;
            this.tripId = vehicle.trip?.tripId;
            this.type = type;
            this.lastPosition = {
                time: vehicle.timestamp?.low,
                bearing: vehicle.position?.dir,
                speed: vehicle.position?.speed,
                location: vehicle.stopId,
                coordinates: {
                    lat: vehicle.position?.lat,
                    lng: vehicle.position?.lng,
                }
            };
            this.instanceId = `vehicle/${type}/${day()}/${this.tripId.startsWith("NonTimetabled") ? this.tripId : this.tripId.split(".")[0]}`;
            this.status = Enum(vehicle.currentStatus, VehicleStopStatus);
            if (vehicle.vehicle) {
                this.specialAttributes = [];
                this.model = vehicle.vehicle[".transit_realtime.tfnswVehicleDescriptor"]?.vehicleModel || "unknown";
                if (type == "bus") {
                    const vehicleDetails = this.model.split("~");
                    this.model = {
                        chassis: vehicleDetails[1],
                        chassisManufacturer: vehicleDetails[0],
                        body: vehicleDetails[3],
                        bodyManufacturer: vehicleDetails[2],
                    };
                    if (this.model.chassis == "B12BLEA") { this.specialAttributes.push("Articulated Bus"); };
                    if (["ZK6131HG1", "D9RA", "BYDK9", "ELEMENT"].includes(this.model.chassis)) { this.specialAttributes.push("Electric Bus"); };
                } else if (["train", "train_link"].includes(type)) {
                    this.model = trainVehicleTypes[this.model] || { name: "Unknown", letter: this.model };
                } else if (path == "lightrailinnerwest") {
                    this.model = "Citadis X05/CAF Urbos 3";
                };
                this.aircon = vehicle.vehicle[".transit_realtime.tfnswVehicleDescriptor"]?.airConditioned || "unknown";
                this.wheelchair = vehicle.vehicle[".transit_realtime.tfnswVehicleDescriptor"]?.wheelchairAccessible ? vehicle.vehicle[".transit_realtime.tfnswVehicleDescriptor"]?.wheelchairAccessible == 1 : "unknown";
                const specialAttributes = vehicle.vehicle[".transit_realtime.tfnswVehicleDescriptor"]?.specialVehicleAttributes;
                if (specialAttributes && specialAttributes != 0) {
                    if (specialAttributes % 16 / 8 >= 1) { this.specialAttributes.push("Social Distancing"); };
                    if (specialAttributes % 8 / 4 >= 1) { this.specialAttributes.push("Christmas Bus"); };
                    if (specialAttributes % 4 / 2 >= 1) { this.specialAttributes.push("Wi-Fi"); };
                    if (specialAttributes % 2 / 1 >= 1) { this.specialAttributes.push("Special Livery"); };
                };
                if (type == "bus") {
                    const routeName = tripInstance?.route?.shortName || "";
                    if (tripInstance?.route?.description == "Temporary Buses" || routeName[routeName.length - 2] == "T" || routeName == "535") { this.specialAttributes.push("Temporary Bus"); };
                    if (routeName.startsWith("M")) { this.specialAttributes.push("Metro Bus"); };
                    if (routeName.startsWith("N")) { this.specialAttributes.push("NightRide"); };
                    if (routeName.startsWith("SW")) { this.specialAttributes.push("South West Link"); };
                    if (path == "buses") {
                        this.specialAttributes.push("Sydney Area Bus");
                    } else {
                        this.specialAttributes.push("Regional Bus");
                    };
                    if (tripInstance?.route?.description == "School Buses") { this.specialAttributes.push("School Bus"); };
                    if (routeName.includes("X") && tripInstance?.route?.description == "Sydney Buses Network") { this.specialAttributes.push("Express"); };
                };
            };
            this.consist = vehicle[".transit_realtime.carriages"];
        };
    };
    static StoppingPattern = class {
        constructor(vehicle, trip, tripInfo, routeInfo, agencyInfo, stopTimes, type, path, tripInstance) {
            stopTimes.timetable = stopTimes.timetable ? stopTimes.timetable
                // .sort((a, b) => a.stop_sequence || 0 - b.stop_sequence || 0)
                .map((stopEvent) => {
                    return {
                        arr: stopEvent.arrival_time || "00:00:00",
                        dep: stopEvent.departure_time || "00:00:00",
                        stopId: stopEvent.stop_id || 0,
                        headsign: ((x) => !x || x == '')(stopEvent.stop_headsign) ? null : stopEvent.stop_headsign,
                        pickUp: stopEvent.pickup_type == 1 || false,
                        dropOff: stopEvent.drop_off_type == 1 || false,
                        timepoint: stopEvent.timepoint == 1 || false,
                        distance: stopEvent.shape_dist_traveled || 0,
                        note: ((x) => !x || x == '')(stopEvent.stop_note) ? null : stopEvent.stop_note,
                    };
                }) : null;
            this.timetable = stopTimes.timetable;
        };
    };
    constructor(vehiclePos, tripUpdate, tripInfo, routeInfo, agencyInfo, stopTimes, vehicleType, path) {
        if (vehiclePos?.vehicle?.vehicle[".transit_realtime.tfnswVehicleDescriptor"]?.performingPriorTrip && path != "lightrailnewcastle") { return null; };
        const newTripUpdate = tripUpdate?.tripUpdate || {};
        const newVehiclePos = vehiclePos?.vehicle || {};
        this.TripInstance = new Vehicle.TripInstance(newTripUpdate, newVehiclePos, tripInfo, routeInfo, agencyInfo, stopTimes, vehicleType, path);
        this.VehicleInstance = new Vehicle.VehicleInstance(newVehiclePos, null, null, null, null, null, vehicleType, path, this.TripInstance);
        this.StoppingPattern = new Vehicle.StoppingPattern(null, null, null, null, null, stopTimes, null, null, null);
    };
};