import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const files = [
    { type: "file", name: "/cache/nsw/data.db", content: "" },
    { type: "file", name: "/cache/nsw/last_updated.json", content: "{}" },
    { type: "file", name: "/cache/nsw/route_shape_cache.json", content: "{}" },
    { type: "file", name: "/cache/nsw/vehicles.json", content: "{}" },
];

files.forEach((item) => {
    const itemPath = path.join(__dirname, ".", item.name);

    if (item.type === "dir") {
        if (!fs.existsSync(itemPath)) {
            fs.mkdirSync(itemPath, { recursive: true });
            console.log(`Created directory: ${item.name}`);
        }
    } else if (item.type === "file") {
        if (!fs.existsSync(itemPath)) {
            fs.writeFileSync(itemPath, item.content);
            console.log(`Created file: ${item.name}`);
        }
    }
});

console.log("Setup complete");
