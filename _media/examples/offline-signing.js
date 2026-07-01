"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const core_1 = require("@nestjs/core");
const app_module_1 = require("../src/app.module");
const contract_service_1 = require("../src/contract/contract.service");
const bindings_1 = require("../src/contract/bindings");
async function main() {
    const network = (process.env.TIKKA_NETWORK ?? 'testnet');
    const publicKey = process.env.TIKKA_PUBLIC_KEY ?? '';
    const signedXdr = process.env.TIKKA_SIGNED_XDR ?? '';
    if (!publicKey) {
        console.error('Error: TIKKA_PUBLIC_KEY is required');
        process.exit(1);
    }
    const app = await core_1.NestFactory.createApplicationContext(app_module_1.AppModule.forRoot({ network }), { logger: false });
    const contractService = app.get(contract_service_1.ContractService);
    if (signedXdr) {
        console.log('Submitting signed transaction...');
        const result = await contractService.submitSigned(signedXdr);
        console.log('\nTransaction confirmed:');
        console.log(`  txHash : ${result.txHash}`);
        console.log(`  ledger : ${result.ledger}`);
        console.log(`  result :`, result.result);
    }
    else {
        console.log(`Building unsigned transaction on ${network}...`);
        const endTimeSecs = BigInt(Math.floor((Date.now() + 24 * 60 * 60 * 1000) / 1000));
        const unsigned = await contractService.buildUnsigned(bindings_1.ContractFn.CREATE_RAFFLE, [
            {
                ticket_price: BigInt(10_000_000),
                max_tickets: 50,
                end_time: endTimeSecs,
                allow_multiple: true,
                asset: 'XLM',
                metadata_cid: '',
            },
        ], publicKey);
        console.log('\n--- Simulated result (review before signing) ---');
        console.log('  simulatedResult :', unsigned.simulatedResult);
        console.log('  estimatedFee    :', unsigned.fee, 'stroops');
        console.log('  networkPassphrase:', unsigned.networkPassphrase);
        console.log('\n--- Unsigned XDR (copy to your offline signer) ---');
        console.log(unsigned.unsignedXdr);
        console.log('\nNext steps:');
        console.log('  1. Copy the XDR above to your offline/cold-wallet machine');
        console.log('  2. Sign it with your key (e.g. stellar-sdk, Ledger, Trezor)');
        console.log('  3. Re-run this script with TIKKA_SIGNED_XDR=<signedXdr> to submit');
    }
    await app.close();
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=offline-signing.js.map