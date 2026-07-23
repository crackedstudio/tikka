"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const core_1 = require("@nestjs/core");
const app_module_1 = require("../src/app.module");
const fee_estimator_service_1 = require("../src/fee-estimator/fee-estimator.service");
const bindings_1 = require("../src/contract/bindings");
async function main() {
    const app = await core_1.NestFactory.createApplicationContext(app_module_1.AppModule, {
        logger: ['error'],
    });
    const estimator = app.get(fee_estimator_service_1.FeeEstimatorService);
    const network = process.env.TIKKA_NETWORK ?? 'testnet';
    const publicKey = process.env.TIKKA_PUBLIC_KEY;
    const raffleId = parseInt(process.env.TIKKA_RAFFLE_ID ?? '1', 10);
    const quantity = parseInt(process.env.TIKKA_QUANTITY ?? '1', 10);
    if (!publicKey) {
        console.error('Error: TIKKA_PUBLIC_KEY is required');
        process.exit(1);
    }
    console.log(`\n🔍  Estimating fees on ${network}...\n`);
    console.log(`▶  buy_ticket(raffleId=${raffleId}, quantity=${quantity})`);
    try {
        const buyEstimate = await estimator.estimateFee({
            method: bindings_1.ContractFn.BUY_TICKET,
            params: [raffleId, publicKey, quantity],
            sourcePublicKey: publicKey,
        });
        console.log(`   Total fee    : ${buyEstimate.xlm} XLM  (${buyEstimate.stroops} stroops)`);
        console.log(`   Base fee     : ${buyEstimate.resources.baseFeeStroops} stroops`);
        console.log(`   Res. fee     : ${buyEstimate.resources.resourceFeeStroops} stroops`);
        console.log(`   CPU          : ${buyEstimate.resources.cpuInstructions.toLocaleString()} instructions`);
        console.log(`   Disk reads   : ${(buyEstimate.resources.diskReadBytes / 1024).toFixed(1)} KB`);
        console.log(`   Disk writes  : ${(buyEstimate.resources.writeBytes / 1024).toFixed(1)} KB`);
        console.log(`   RO entries   : ${buyEstimate.resources.readOnlyEntries}`);
        console.log(`   RW entries   : ${buyEstimate.resources.readWriteEntries}\n`);
    }
    catch (err) {
        console.error(`   Failed: ${err.message}\n`);
    }
    console.log(`▶  get_raffle_data(raffleId=${raffleId})`);
    try {
        const readEstimate = await estimator.estimateFee({
            method: bindings_1.ContractFn.GET_RAFFLE_DATA,
            params: [raffleId],
            sourcePublicKey: publicKey,
        });
        console.log(`   Total fee    : ${readEstimate.xlm} XLM  (${readEstimate.stroops} stroops)`);
        console.log(`   Base fee     : ${readEstimate.resources.baseFeeStroops} stroops`);
        console.log(`   Res. fee     : ${readEstimate.resources.resourceFeeStroops} stroops`);
        console.log(`   CPU          : ${readEstimate.resources.cpuInstructions.toLocaleString()} instructions`);
        console.log(`   Disk reads   : ${(readEstimate.resources.diskReadBytes / 1024).toFixed(1)} KB`);
        console.log(`   Disk writes  : ${(readEstimate.resources.writeBytes / 1024).toFixed(1)} KB`);
        console.log(`   RO entries   : ${readEstimate.resources.readOnlyEntries}`);
        console.log(`   RW entries   : ${readEstimate.resources.readWriteEntries}\n`);
    }
    catch (err) {
        console.error(`   Failed: ${err.message}\n`);
    }
    await app.close();
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=estimate-fee.js.map