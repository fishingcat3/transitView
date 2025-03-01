import fs from "node:fs";
import path from "path";
import chalk from "chalk";

export const getBearing = function (coord1, coord2) {
    const rad = (degrees) => degrees * (Math.PI / 180),
        deg = (radians) => radians * (180 / Math.PI);
    const φ1 = rad(coord1.lat),
        φ2 = rad(coord2.lat),
        Δλ = rad(coord2.lng - coord1.lng);
    const x = Math.sin(Δλ) * Math.cos(φ2),
        y =
            Math.cos(φ1) * Math.sin(φ2) -
            Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    return (deg(Math.atan2(x, y)) + 360).toFixed(2) % 360;
};

export const toBase = function (newBase, number, digits) {
    const value = parseInt(number, newBase).toString();
    return `${"0".repeat(digits - value.length())}${value}`;
};

export const day = function () {
    const date = new Date();
    return `${date.getDate()}${date.getMonth() + 1}${date
        .getFullYear()
        .toString()
        .slice(2)}`;
};

export function formatDate(date) {
    date = date ? new Date(date) : new Date();
    const DD = String(date.getDate()).padStart(2, "0");
    const MM = String(date.getMonth() + 1).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    const ss = String(date.getSeconds()).padStart(2, "0");

    return `${DD}/${MM}, ${hh}:${mm}:${ss}`;
}

export const divider = function (x) {
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "_");
};

export const log = {
    white: (text) => console.log(text),
    red: (text) => console.log(chalk.red(text)),
    redB: (text) => console.log(chalk.redBright(text)),
    yellow: (text) => console.log(chalk.yellow(text)),
    yellowB: (text) => console.log(chalk.yellowBright(text)),
    green: (text) => console.log(chalk.green(text)),
    greenB: (text) => console.log(chalk.greenBright(text)),
    blue: (text) => console.log(chalk.blue(text)),
    blueB: (text) => console.log(chalk.blueBright(text)),
    magenta: (text) => console.log(chalk.magenta(text)),
    magentaB: (text) => console.log(chalk.magentaBright(text)),
};

export const printDirectories = function (dirPath) {
    try {
        const absolutePath = path.resolve(dirPath);
        console.log(`Checking directory: ${absolutePath}`);

        const files = fs.readdirSync(absolutePath);
        console.log(`Contents of ${absolutePath}:`);
        files.forEach((file) => {
            const filePath = path.join(absolutePath, file);
            const stats = fs.statSync(filePath);
            console.log(`${stats.isDirectory() ? "DIR " : "FILE"}: ${file}`);
        });
    } catch (err) {
        console.error(`Error accessing ${dirPath}:`, err.message);
    }
};

export const directoryTree = function (dir, collapse, prefix = "") {
    const files = fs.readdirSync(dir);
    const result = [];
    files.forEach((file, index) => {
        const filePath = path.join(dir, file);
        const last = index == files.length - 1;
        if (
            collapse.some((pattern) =>
                pattern.startsWith("%")
                    ? filePath.includes(pattern.slice(1))
                    : path.resolve(filePath) == path.resolve(pattern)
            )
        ) {
            if (fs.statSync(filePath).isDirectory()) {
                let count = [0, 0];
                fs.readdirSync(filePath).forEach((file) => {
                    count[
                        fs.statSync(path.join(filePath, file)).isDirectory()
                            ? 1
                            : 0
                    ]++;
                });
                result.push(
                    `${prefix}${last ? "└── " : "├── "}${file} <${
                        count[0]
                    } file${count[0] != 1 ? `s` : ``}, ${count[1]} director${
                        count[1] != 1 ? `ies` : `y`
                    }>`
                );
            }
            return;
        }
        result.push(`${prefix}${last ? "└── " : "├── "}${file}`);
        if (fs.statSync(filePath).isDirectory()) {
            const subdirectory = directoryTree(
                filePath,
                collapse,
                `${prefix}${last ? "    " : "│   "}`
            );
            if (subdirectory != "") {
                result.push(subdirectory);
            }
        }
    });
    return result.flatMap((x) => x).join("\n");
};

export class Timer {
    constructor(name) {
        this.name = name;
        this.startTime = Date.now();
    }
    start() {
        this.startTime = Date.now();
        log.yellowB(`START ${this.name}`);
        return this;
    }
    end() {
        return log.greenB(
            `FINISH ${this.name} ${divider(Date.now() - this.startTime)}ms`
        );
    }
    get timeSinceStart() {
        return Date.now() - this.startTime;
    }
}

export function jsonToCsv(json) {
    const headers = Object.keys(json[0]);
    const rows = [headers.join(",")];
    for (const obj of json) {
        rows.push(
            headers
                .map((header) => {
                    const value = obj[header];
                    return typeof value === "string"
                        ? `"${value.replace(/"/g, '""')}"`
                        : value;
                })
                .join(",")
        );
    }
    return rows.join("\n");
}
