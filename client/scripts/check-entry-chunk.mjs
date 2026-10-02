import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const clientDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const forbiddenPackages = [
    {
        name: "@stellar/stellar-sdk",
        modulePattern: /@stellar\/stellar-sdk/i,
        chunkPattern: /stellar-sdk/i,
        markers: ["StellarSdk", "StrKey", "TransactionBuilder", "SorobanRpc"],
    },
    {
        name: "@creit.tech/stellar-wallets-kit",
        modulePattern: /@creit\.tech\/stellar-wallets-kit/i,
        chunkPattern: /stellar-wallets-kit/i,
        markers: ["StellarWalletsKit", "WalletNetwork", "WalletType"],
    },
];

export function inspectEntryGraph(manifest, readChunk) {
    const records = Object.entries(manifest);
    const entryRecords = records.filter(([, record]) => record.isEntry);
    const errors = [];
    const offenders = [];

    if (entryRecords.length !== 1) {
        errors.push(`Expected exactly one entry in the Vite manifest; found ${entryRecords.length}.`);
    }
    if (entryRecords.length === 0) {
        return { entry: null, visitedFiles: [], offenders, errors };
    }

    const byFile = new Map(records.map(([key, record]) => [record.file, key]));
    const [entryKey] = entryRecords[0];
    const pending = [entryKey];
    const visited = new Set();
    const visitedFiles = [];

    while (pending.length > 0) {
        const key = pending.pop();
        if (visited.has(key)) continue;
        visited.add(key);

        const record = manifest[key];
        if (!record) {
            errors.push(`Static import '${key}' is missing from the Vite manifest.`);
            continue;
        }

        const identifiers = [key, record.src, record.name, record.file].filter(Boolean);
        for (const forbidden of forbiddenPackages) {
            if (identifiers.some((identifier) => forbidden.modulePattern.test(identifier)) || forbidden.chunkPattern.test(record.file ?? "")) {
                offenders.push({ packageName: forbidden.name, module: key });
            }
        }

        if (record.file) {
            visitedFiles.push(record.file);
            try {
                const source = readChunk(record.file);
                for (const forbidden of forbiddenPackages) {
                    if (forbidden.markers.some((marker) => source.includes(marker))) {
                        offenders.push({ packageName: forbidden.name, module: `${key} (${record.file})` });
                    }
                }
            } catch (error) {
                errors.push(`Unable to inspect '${record.file}': ${error.message}`);
            }
        }

        for (const imported of record.imports ?? []) {
            const importedKey = manifest[imported] ? imported : byFile.get(imported);
            if (importedKey) {
                pending.push(importedKey);
            } else {
                errors.push(`Static import '${imported}' from '${key}' is missing from the Vite manifest.`);
            }
        }
    }

    return {
        entry: entryKey,
        visitedFiles,
        offenders: [...new Map(offenders.map((item) => [`${item.packageName}:${item.module}`, item])).values()],
        errors,
    };
}

export async function checkEntryChunk(distDirectory = path.join(clientDirectory, "dist")) {
    const manifestPath = path.join(distDirectory, ".vite", "manifest.json");
    let manifest;

    try {
        manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    } catch (error) {
        return {
            entry: null,
            visitedFiles: [],
            offenders: [],
            errors: [`Unable to read Vite manifest '${manifestPath}': ${error.message}`],
        };
    }

    return inspectEntryGraph(manifest, (file) => {
        const filePath = path.resolve(distDirectory, file);
        if (!filePath.startsWith(`${path.resolve(distDirectory)}${path.sep}`)) {
            throw new Error("manifest file path escapes dist directory");
        }
        return readFileSync(filePath, "utf8");
    });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const result = await checkEntryChunk();
    if (result.errors.length > 0 || result.offenders.length > 0) {
        for (const error of result.errors) console.error(`Entry chunk check: ${error}`);
        for (const offender of result.offenders) {
            console.error(`Entry chunk check: ${offender.packageName} found in static entry graph via ${offender.module}.`);
        }
        process.exitCode = 1;
    } else {
        console.log(`Entry chunk check passed for '${result.entry}'.`);
    }
}