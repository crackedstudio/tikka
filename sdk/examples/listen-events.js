"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const core_1 = require("@nestjs/core");
const app_module_1 = require("../src/app.module");
const rpc_service_1 = require("../src/network/rpc.service");
const constants_1 = require("../src/contract/constants");
async function main() {
    const network = (process.env.TIKKA_NETWORK ?? 'testnet');
    const raffleIdFilter = process.env.TIKKA_RAFFLE_ID
        ? parseInt(process.env.TIKKA_RAFFLE_ID, 10)
        : null;
    const pollMs = parseInt(process.env.TIKKA_POLL_MS ?? '5000', 10);
    const contractId = process.env.TIKKA_CONTRACT_ID ?? (0, constants_1.getRaffleContractId)(network);
    const app = await core_1.NestFactory.createApplicationContext(app_module_1.AppModule.forRoot({ network }), { logger: false });
    const rpcService = app.get(rpc_service_1.RpcService);
    const server = rpcService.getServer();
    console.log(`Listening for events on ${network} (contract: ${contractId})`);
    if (raffleIdFilter !== null)
        console.log(`  Filtering for raffle #${raffleIdFilter}`);
    console.log(`  Polling every ${pollMs}ms — press Ctrl+C to stop\n`);
    let cursor;
    async function poll() {
        try {
            const filters = [
                {
                    type: 'contract',
                    contractIds: [contractId],
                },
            ];
            const response = await server.getEvents({
                cursor: cursor ?? '',
                filters,
                limit: 100,
            });
            for (const event of response.events) {
                if (response.latestLedger) {
                    cursor = String(response.latestLedger);
                }
                const topic = event.topic.map((t) => t.toString()).join(':');
                const value = event.value?.toString() ?? '';
                if (raffleIdFilter !== null && !value.includes(String(raffleIdFilter))) {
                    continue;
                }
                console.log(`[ledger ${event.ledger}] ${topic}`);
                console.log(`  value  : ${value}`);
                console.log(`  txHash : ${event.txHash}\n`);
            }
        }
        catch (err) {
            console.warn(`Poll error: ${err.message}`);
        }
    }
    try {
        const latest = await server.getLatestLedger();
        console.log(`Starting from ledger ${latest.sequence}\n`);
    }
    catch {
    }
    const interval = setInterval(poll, pollMs);
    process.on('SIGINT', async () => {
        clearInterval(interval);
        await app.close();
        console.log('\nStopped.');
        process.exit(0);
    });
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=listen-events.js.map