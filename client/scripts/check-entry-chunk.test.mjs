import assert from "node:assert/strict";
import test from "node:test";
import { inspectEntryGraph } from "./check-entry-chunk.mjs";

test("fails when the Stellar SDK is in the static entry graph", () => {
    const manifestFixture = {
        "src/main.tsx": {
            file: "assets/index-test.js",
            isEntry: true,
            imports: ["node_modules/@stellar/stellar-sdk/lib/index.js"],
        },
        "node_modules/@stellar/stellar-sdk/lib/index.js": {
            file: "assets/stellar-sdk-test.js",
        },
    };
    const chunkFixture = new Map([
        ["assets/index-test.js", "import './stellar-sdk-test.js';"],
        ["assets/stellar-sdk-test.js", "export const StellarSdk = {};"],
    ]);

    const result = inspectEntryGraph(manifestFixture, (file) => chunkFixture.get(file));

    assert.equal(result.entry, "src/main.tsx");
    assert.ok(result.offenders.some((offender) => offender.packageName === "@stellar/stellar-sdk"));
});

test("passes when Stellar packages occur only in ignored dynamic imports", () => {
    const manifestFixture = {
        "src/main.tsx": {
            file: "assets/index-test.js",
            isEntry: true,
            imports: ["node_modules/react/index.js"],
            dynamicImports: ["node_modules/@stellar/stellar-sdk/lib/index.js"],
        },
        "node_modules/react/index.js": {
            file: "assets/react-vendor-test.js",
        },
        "node_modules/@stellar/stellar-sdk/lib/index.js": {
            file: "assets/stellar-sdk-test.js",
        },
    };
    const chunkFixture = new Map([
        ["assets/index-test.js", "import './react-vendor-test.js';"],
        ["assets/react-vendor-test.js", "export const createElement = () => {};"],
        ["assets/stellar-sdk-test.js", "export const StellarSdk = {};"],
    ]);

    const result = inspectEntryGraph(manifestFixture, (file) => chunkFixture.get(file));

    assert.deepEqual(result.offenders, []);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.visitedFiles, ["assets/index-test.js", "assets/react-vendor-test.js"]);
});

test("fails when the wallet kit is in the static entry graph", () => {
    const manifestFixture = {
        "src/main.tsx": {
            file: "assets/index-test.js",
            isEntry: true,
            imports: ["node_modules/@creit.tech/stellar-wallets-kit/index.js"],
        },
        "node_modules/@creit.tech/stellar-wallets-kit/index.js": {
            file: "assets/stellar-wallets-kit-test.js",
        },
    };
    const result = inspectEntryGraph(manifestFixture, () => "");

    assert.ok(result.offenders.some((offender) => offender.packageName === "@creit.tech/stellar-wallets-kit"));
});