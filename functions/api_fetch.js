import unzipper from "unzipper";
import protobuf from "protobufjs";
import fs from "node:fs";

import {
    API_Keys,
    __dirname,
    setPendingGTFSUpdate,
    gtfsPaths,
    getLastGTFSUpdate,
    setLastGTFSUpdate,
} from "../server.js";
import { processTables } from "./sql.js";
import { divider, log, Timer, formatDate } from "./utility.js";

async function gtfsAPI({ version, path }, method) {
    return await fetch(
        `https://api.transport.nsw.gov.au/v${version}/gtfs/schedule/${path}`,
        {
            method: method,
            mode: "cors",
            headers: {
                accept: "application/octet-stream",
                authorization: `apikey ${API_Keys.NSW1}`,
            },
        }
    );
}

async function readGTFSzip(path, blob) {
    const t = new Timer("READ ZIP").start();
    fs.closeSync(fs.openSync(`./cache/nsw/gtfs_${path}.zip`, "w"));
    const reader = blob.stream().getReader();
    const writableStream = fs.createWriteStream(`./cache/nsw/gtfs_${path}.zip`);
    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            writableStream.close();
            t.end();
            break;
        }
        writableStream.write(value);
    }
}

async function unzipGTFS(path) {
    const t = new Timer("UNZIP").start();
    fs.mkdirSync(`./cache/nsw/gtfs_${path}`, { recursive: true });
    const directory = await unzipper.Open.file(`./cache/nsw/gtfs_${path}.zip`);
    await directory.extract({ path: `./cache/nsw/gtfs_${path}` });
    t.end();
}

async function deleteGTFS(path) {
    const t = new Timer("DELETE GTFS").start();
    fs.unlinkSync(`./cache/nsw/gtfs_${path}.zip`);
    fs.rmSync(
        `./cache/nsw/gtfs_${path}`,
        { recursive: true, force: true },
        (err) => {
            if (err) {
                log.redB(`FAILED DELETE GTFS ${err.message}`);
            }
        }
    );
    t.end();
}

export async function updateGTFS({ version, path }) {
    if (Date.now() - getLastGTFSUpdate(path) < 600000) {
        return;
    }
    const t = new Timer(`GTFS UPDATE ${path.padStart(34, " ")}`).start();
    version = version[0] || version;
    const preresponse = await gtfsAPI({ version, path }, "HEAD");
    const savedLastModified = JSON.parse(
        fs.readFileSync("./cache/nsw/last_updated.json", {
            encoding: "utf8",
            flag: "r",
        }) || "{}"
    );
    const lastModified = Date.parse(preresponse.headers.get("last-modified"));
    if (lastModified == (savedLastModified[path] || undefined)) {
        setLastGTFSUpdate(path, Date.now());
        return log.greenB(
            `FINISH GTFS ${path.padStart(40, " ")} UPDATED <${formatDate(
                lastModified
            )}> ${t.timeSinceStart}ms`
        );
    }

    setPendingGTFSUpdate(path, true);

    const t1 = new Timer(`GTFS FETCH ${path}`).start();
    const response = await gtfsAPI({ version, path }, "GET");
    t1.end();
    if (!response.ok) {
        log.redB(`ERROR ${response.status} ${response.statusText}`);
        throw new Error("Failed to fetch data");
    }

    const t2 = new Timer("GTFS BLOB FETCH").start();
    const blob = await response.blob();
    t2.end();

    const workingPath = path.replaceAll("/", "");
    try {
        await readGTFSzip(workingPath, blob);
        await unzipGTFS(workingPath);
        await processTables(workingPath)
            .then(async () => {
                await deleteGTFS(workingPath);
                savedLastModified[path] = lastModified;
                fs.writeFileSync(
                    "./cache/nsw/last_updated.json",
                    JSON.stringify(savedLastModified, null, 4)
                );
                t.end();
                setLastGTFSUpdate(path, Date.now());
                return setPendingGTFSUpdate(path, false);
            })
            .catch((error) => {
                log.redB(`ERROR ${error.message}`);
            });
        return;
    } catch (error) {
        console.error(`ERROR ${error}`);
    }
}

export async function fetchAPIproto(url, method, proto, type, headers) {
    try {
        const response = await fetch(url, {
            method: method,
            mode: "cors",
            headers: headers,
        });
        if (!response.ok) {
            log.redB(`ERROR ${response.status} ${response.statusText}`);
            throw new Error("Failed to fetch data");
        }
        const buffer = await response.arrayBuffer();
        const root = await protobuf.load(proto);
        const RealtimeData = root.lookupType(type);
        const decodedData = RealtimeData.decode(new Uint8Array(buffer));
        return decodedData;
    } catch (error) {
        log.redB(`ERROR ${error.message}`);
    }
}
