const stopName = new (class sN {
    split(str, delim) {
        return String(str)?.split(delim) || [];
    }
    existsSplit(str, delim) {
        return this.split(str, delim).length > 1;
    }
    subName(str, delim) {
        return {
            headName: this.split(str, delim)[0],
            delim: delim,
            subtitle: this.split(str, delim).slice(1).join(delim),
        };
    }
})();

const delims = [" at ", " opp ", " before ", " after ", ", "];

export class StopInstance {
    constructor(stop, stopInfo, type) {
        this.id = stop.stop_id;
        this.code = stop.stop_code || this.id;
        this.name = stop.stop_name;
        if (type == "bus") {
            const delimSplit = delims.find((delim) =>
                stopName.existsSplit(this.name, delim)
            );
            this.subName = delimSplit
                ? stopName.subName(this.name, delimSplit)
                : {};
        } else if (!["", null].includes(stop.platform_code)) {
            this.subName = {
                headName: this.name,
                subtitle: `Platform ${String(stop.platform_code)}`,
            };
        }
        this.type = type;
        this.lat = stop.stop_lat;
        this.lng = stop.stop_lon;
        this.locationType = stop.location_type;
        this.parentStation = !!stop.parent_station
            ? stop.parent_station
            : undefined;
        this.wheelchair = !!stop.wheelchair_boarding;
        this.levelId = !!stop.level_id ? stop.level_id : undefined;
        this.platformNumber = !!stop.platform_code
            ? stop.platform_code
            : undefined;
        this.instanceId = `stop/${type}/${this.id}`;

        if (stopInfo) {
            this.stopInfo = {
                locationName: stopInfo.LOCATION_NAME,
                transitStopNumber: stopInfo.TSN,
                efaId: stopInfo.EFA_ID,
                phone: stopInfo.PHONE,
                address: stopInfo.ADDRESS,
                facilities: stopInfo.FACILITIES.split(" | "),
                accessibility: stopInfo.ACCESSIBILITY.split(" | "),
                transit_modes: stopInfo.TRANSPORT_MODE.toLowerCase()
                    .split(",")
                    .map((x) => x.trim()),
                opalMorningPeak: stopInfo.MORNING_PEAK,
                opalAfternoonPeak: stopInfo.AFTERNOON_PEAK,
                shortPlatform: stopInfo.SHORT_PLATFORM == "True",
            };
        }
    }
}
