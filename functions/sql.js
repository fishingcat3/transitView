import Database from 'better-sqlite3';
import csvParser from 'csv-parser';
import fs from 'fs';

import { tables } from './tables.js';
import { divider, log, Timer } from './utility.js';

const db = new Database('./cache/nsw/data.db');
db.pragma('journal_mode = WAL');

log.blueB("DATABASE connection open");

export function createTable(name, columns) {
    let startTable = Date.now();
    const columnsDefinition = columns.map((col) => col.join(" ")).join(', ');
    db.exec(`CREATE TABLE IF NOT EXISTS ${name} (${columnsDefinition});`);
    db.prepare(`DELETE FROM ${name};`).run();
    log.greenB(`${name} table created ${Date.now() - startTable}ms`);
};

export function createTables(path, tables) {
    const createdTables = []
    if (!path) { return; };
    tables.forEach(async ({ name, columns }) => {
        if (!fs.existsSync(`./cache/nsw/gtfs_${path}/${name}.txt`)) { return; };
        createTable(`${path}_${name}`, columns);
        createdTables.push(`${path}_${name}`)
    });
    return createdTables;
};

export async function loadCSVIntoTable(filePath, tableName, columns) {
    if (!fs.existsSync(filePath)) { return; };
    const insertStatement = db.prepare(`INSERT INTO ${tableName} (${columns.map((col) => `${col[0]}`).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`);
    const rows = [];
    const transaction = db.transaction(() => {
        rows.forEach((row) => insertStatement.run(...columns.map((col) => row[col[0].trim()])));
    });

    return new Promise((resolve, reject) => {
        fs.createReadStream(filePath).pipe(csvParser({ mapHeaders: ({ header }) => header.trim() }))
            .on('data', (row) => {
                rows.push(row);
                if (rows.length >= 500) {
                    transaction();
                    rows.length = 0;
                };
            })
            .on('end', () => {
                if (rows.length > 0) {
                    transaction();
                };
                resolve();
            })
            .on('error', (error) => {
                reject(error);
            });
    });
};

async function indexTables(path, createdTables) {
    const t3 = new Timer(`INDEX ${path}`).start();
    db.transaction(() => {
        [
            { table: `${path}_agency`, idx: "idx_agency_id", column: "agency_id" },
            { table: `${path}_routes`, idx: "idx_route_id", column: "route_id" },
            { table: `${path}_notes`, idx: "idx_note_id", column: "note_id" },
            { table: `${path}_trips`, idx: "idx_trip_id", column: "trip_id" },
            { table: `${path}_shapes`, idx: "idx_shape_id", column: "shape_id" },
        ].forEach((x) => {
            if (!createdTables.includes(x.table)) { return; };
            db.prepare(`DROP INDEX IF EXISTS "${x.idx}";`).run();
            db.prepare(`CREATE INDEX IF NOT EXISTS "${x.idx}" ON "${x.table}"("${x.column}");`).run();
        });
    })();

    // const indexes = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = '${path}_routes';`).all();
    // console.log(`Indexes on ${path}_routes: ${indexes.map((x) => x.name).join(", ")}`);

    t3.end();
};

let queries = {};
export function databaseAll(tableName, amount) {
    const query = `SELECT ${amount} FROM ${tableName}`;
    if (!queries[query]) { queries[query] = db.prepare(query); };
    return queries[query].all();
};

export function databaseFind(toFind, column, tableName, amount) {
    const query = `SELECT ${amount} FROM ${tableName} WHERE ${column} = ?;`;
    if (!queries[query]) { queries[query] = db.prepare(query); };
    return queries[query].get(toFind);
};

export function databaseMatchCoords(toFind, column, tableName, amount, minLat, maxLat, minLng, maxLng, latName, lngName) {
    const query = `SELECT ${amount} FROM ${tableName} WHERE ${column} = ? AND ${latName} BETWEEN ? AND ? AND ${lngName} BETWEEN ? and ?;`;
    if (!queries[query]) { queries[query] = db.prepare(query); };
    return queries[query].all(toFind, minLat, maxLat, minLng, maxLng);
};

export function databaseMatch(toFind, column, tableName, amount) {
    const query = `SELECT ${amount} FROM ${tableName} WHERE ${column} = ?;`;
    if (!queries[query]) { queries[query] = db.prepare(query); };
    return queries[query].all(toFind);
};

export function databaseBatchMatch(toFind, column, tableName, amount) {
    const query = `SELECT ${amount} FROM ${tableName} WHERE ${column} IN (${toFind.map(() => "?").join(",")});`;
    return db.prepare(query).all(toFind);
};

function fixRouteColors() {
    const query = db.prepare(`UPDATE buses_routes SET route_color = ? WHERE route_short_name LIKE ?;`);
    const query2 = db.prepare(`UPDATE buses_routes SET route_text_color = ? WHERE route_short_name LIKE ?;`);
    db.transaction(() => {
        [
            { color: "F79210", match: "%T1" },
            { color: "0897D2", match: "%T2" },
            { color: "F25C19", match: "%T3" },
            { color: "2057A9", match: "%T4" },
            { color: "C41191", match: "%T5" },
            { color: "77351D", match: "%T6" },
            { color: "6A7D8B", match: "%T7" },
            { color: "0B974A", match: "%T8" },
            { color: "D31C2E", match: "%T9" },
            { color: "06969F", match: "%M" },
            { color: "D11F2F", match: "%CN" },
            { color: "F99D1C", match: "%BM" },
            { color: "005AA3", match: "%SC" },
            { color: "00954C", match: "%SH" },
            { color: "833135", match: "%HU" },
            { color: "C52026", match: "M9%" },
            { color: "001F38", match: "N%" },
            { color: "FDB71A", match: "%B1" },
            { color: "FDB71A", match: "%BN1" },
            // { color: "456CAA", match: "535" },
        ].forEach((route) => query.run(...Object.values(route)));
        [
            { color: "006199", match: "%B1" },
            { color: "006199", match: "%BN1" },
        ].forEach((route) => query2.run(...Object.values(route)));
    })();
};

export async function processTables(path) {
    // console.log(`${(process.memoryUsage().heapTotal / 1073741824).toFixed(3)} GB used`);
    return new Promise(async (resolve, reject) => {
        try {

            const t1 = new Timer(`CREATE TABLES ${path}`).start();
            const thisTables = tables(path);
            const createdTables = createTables(path, thisTables);
            t1.end();

            const t2 = new Timer(`ALL DB UPDATE ${path}`).start();
            for (const table of thisTables) {
                const t = new Timer(`LOAD ${path}_${table.name}`).start();
                await loadCSVIntoTable(table.file, `${path}_${table.name}`, table.columns);
                t.end();
            };
            indexTables(path, createdTables);
            if (path == "buses") {
                fixRouteColors();
                db.exec('VACUUM;');
            };
            t2.end();

        } catch (error) {
            log.redB(`ERROR processing files ${error.message}`);
            reject(error);
        };
        resolve();
    });
};

process.on('exit', () => {
    db.close();
});

// const tableInfo = db.prepare('PRAGMA table_info(buses_routes);').all();
// console.log(tableInfo)