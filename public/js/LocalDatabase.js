class LocalDatabase {
    constructor(type, saveType, keyName, keyValues) {
        this.saveType = saveType;
        this.keyName = keyName;
        this.keyValues = keyValues;
        if (type == "local") {
            this.storageType = localStorage;
        } else if (type == "session") {
            this.storageType == sessionStorage;
        }
        this.storage = JSON.parse(
            this.storageType.getItem(this.keyName) || "{}"
        );
        this.save();
    }

    get(key) {
        return this.storage[key];
    }

    getDefault(key) {
        return this.keyValues[key].default;
    }

    getOptions(key) {
        return this.keyValues[key].options;
    }

    unsavedGet(key) {
        return JSON.parse(this.storageType.getItem(this.keyName) || "{}")[key];
    }

    set(key, value) {
        this.storage[key] = value;
        if (this.saveType == "auto_save") {
            this.save();
        }
        return this;
    }

    get isSaved() {
        return Object.keys(this.storage).every((key) => {
            return (
                this.storage[key] ==
                JSON.parse(this.storageType.getItem(this.keyName) || "{}")[key]
            );
        });
    }

    validate() {
        let validated = {};
        Object.keys(this.keyValues).forEach((key) => {
            if (!Object.keys(this.storage).includes(key)) {
                return (validated[key] = this.keyValues[key].default);
            }
            const options = this.keyValues[key].options;
            validated[key] = ((options) => {
                if (
                    Array.isArray(options) &&
                    this.keyValues[key].type == "multiple"
                ) {
                    return this.keyValues[key]?.options?.every((item) =>
                        this.keyValues[key].options.includes(item)
                    );
                }
                if (Array.isArray(options)) {
                    return this.keyValues[key].options.includes(
                        this.storage[key]
                    );
                }
                if (
                    ["boolean", "number", "string"].includes(
                        this.keyValues[key].type
                    )
                ) {
                    return typeof this.storage[key] == options;
                }
            })(options)
                ? this.storage[key]
                : this.keyValues[key].default;
        });
        return (this.storage = validated);
    }

    reset() {
        let defaultStorage = {};
        Object.keys(this.keyValues).forEach((key) => {
            defaultStorage[key] = this.keyValues[key].default;
        });
        return (this.storage = defaultStorage);
    }

    save() {
        this.validate();
        return this.storageType.setItem(
            this.keyName,
            JSON.stringify(this.storage)
        );
    }
}

export const mapFilters = new LocalDatabase(
    "local",
    "auto_save",
    "map_filters",
    {
        vehicle: {
            type: "multiple",
            default: ["train", "train_link", "metro", "light_rail", "ferry"],
            options: [
                "train",
                "train_link",
                "metro",
                "bus",
                "light_rail",
                "ferry",
            ],
        },
        display_stations_icons: {
            type: "string",
            default: "true",
            options: ["true", "false"],
        },
        display_route_shapes: {
            type: "string",
            default: "true",
            options: ["true", "false"],
        },
        display_unscheduled_vehicles: {
            type: "string",
            default: "true",
            options: ["true", "false"],
        },
        "special-attributes": {
            type: "multiple",
            default: [],
            options: [
                "Articulated Bus",
                "Electric Bus",
                "Social Distancing",
                "Christmas Bus",
                "Wi-Fi",
                "Special Livery",
                "Temporary Bus",
                "Metro Bus",
                "NightRide",
                "South West Link",
                "Sydney Area Bus",
                "Regional Bus",
                "School Bus",
                "Express",
            ],
        },
        "train-set-type": {
            type: "multiple",
            default: [],
            options: [
                "A",
                "B",
                "C",
                "D",
                "H",
                "J",
                "K",
                "M",
                "N",
                "P",
                "S",
                "T",
                "V",
                "X",
                "G",
                "I",
                "L",
                "O",
                "Q",
                "W",
                "Y",
            ],
        },
    }
);

export const settings = new LocalDatabase("local", "manual_save", "settings", {
    theme: {
        type: "string",
        default: "Browser",
        options: ["Browser", "Light", "Dark"],
    },
    "map-style": {
        type: "string",
        default: "Voyager (labels under)",
        options: [
            "Voyager",
            "Voyager (no labels)",
            "Voyager (labels under)",
            "Light",
            "Light (no labels)",
            "Dark",
            "Dark (no labels)",
            "Standard",
            "Humanitarian",
        ],
    },
});

export const routesFilters = new LocalDatabase(
    "local",
    "auto_save",
    "routes_filters",
    {
        vehicle: {
            type: "string",
            default: "train",
            options: [
                "train",
                "train_link",
                "metro",
                "bus",
                "light_rail",
                "ferry",
                "none",
            ],
        },
    }
);
