import { appendFileSync, readFileSync, readdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkEntryChunk } from "./check-entry-chunk.mjs";

const clientDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDirectory = path.join(clientDirectory, "dist");
const packageJson = JSON.parse(readFileSync(path.join(clientDirectory, "package.json"), "utf8"));

function globExpression(pattern) {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*");
    return new RegExp(`^${escaped}$`);
}

function listFiles(directory, relativeDirectory = "") {
    try {
        return readdirSync(path.join(directory, relativeDirectory), { withFileTypes: true }).flatMap((entry) => {
            const relativePath = path.join(relativeDirectory, entry.name);
            return entry.isDirectory()
                ? listFiles(directory, relativePath)
                : [relativePath.split(path.sep).join("/")];
        });
    } catch {
        return [];
    }
}

function limitInBytes(limit) {
    const match = /^(\d+(?:\.\d+)?)\s*(B|kB|KB|MB|GB)$/i.exec(limit);
    if (!match) throw new Error(`Unsupported size-limit value '${limit}'.`);
    const power = { b: 0, kb: 1, mb: 2, gb: 3 }[match[2].toLowerCase()];
    return Number(match[1]) * 1000 ** power;
}

function formatGzipSize(bytes) {
    return `${(bytes / 1000).toFixed(1)} kB gzip`;
}

const rows = [];
let failed = false;
const files = listFiles(distDirectory).map((file) => `dist/${file}`);

for (const budget of packageJson["size-limit"] ?? []) {
    const matches = files.filter((file) => globExpression(budget.path).test(file));
    if (!budget.gzip) {
        rows.push({ name: budget.name, size: "N/A", limit: budget.limit, status: "FAIL (gzip not configured)" });
        failed = true;
        continue;
    }
    if (matches.length === 0) {
        rows.push({ name: budget.name, size: "N/A", limit: `${budget.limit} gzip`, status: "FAIL (chunk missing)" });
        failed = true;
        continue;
    }

    const size = matches.reduce((total, file) => {
        const source = readFileSync(path.join(clientDirectory, file));
        return total + gzipSync(source, { level: 9 }).byteLength;
    }, 0);
    let limit;
    try {
        limit = limitInBytes(budget.limit);
    } catch (error) {
        rows.push({ name: budget.name, size: formatGzipSize(size), limit: budget.limit, status: `FAIL (${error.message})` });
        failed = true;
        continue;
    }
    const passed = size <= limit;
    rows.push({
        name: budget.name,
        size: formatGzipSize(size),
        limit: `${budget.limit} gzip`,
        status: passed ? "PASS" : "FAIL (over budget)",
    });
    failed ||= !passed;
}

const entryCheck = await checkEntryChunk(distDirectory);
const entryPassed = entryCheck.errors.length === 0 && entryCheck.offenders.length === 0;
rows.push({
    name: "Entry static graph",
    size: "N/A",
    limit: "No Stellar SDK or wallet kit",
    status: entryPassed ? "PASS" : "FAIL",
});
failed ||= !entryPassed;

const summary = [
    "### Client bundle budgets",
    "",
    "Compression: gzip (level 9).",
    "",
    "| Chunk/check | Size | Budget | Status |",
    "| --- | ---: | ---: | --- |",
    ...rows.map((row) => `| ${row.name} | ${row.size} | ${row.limit} | ${row.status} |`),
    "",
    ...entryCheck.errors.map((error) => `- Entry check: ${error}`),
    ...entryCheck.offenders.map((offender) => `- Entry check: ${offender.packageName} found via ${offender.module}.`),
    "",
].join("\n");

console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
if (failed) process.exitCode = 1;