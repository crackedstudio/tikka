"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const core_1 = require("@nestjs/core");
const app_module_1 = require("../src/app.module");
const raffle_service_1 = require("../src/modules/raffle/raffle.service");
const mock_wallet_adapter_1 = require("../src/wallet/mock-wallet.adapter");
async function main() {
    const network = (process.env.TIKKA_NETWORK ?? 'testnet');
    const publicKey = process.env.TIKKA_PUBLIC_KEY ?? '';
    const ticketPrice = process.env.TIKKA_TICKET_PRICE ?? '1';
    const maxTickets = parseInt(process.env.TIKKA_MAX_TICKETS ?? '50', 10);
    const durationHours = parseInt(process.env.TIKKA_DURATION_HOURS ?? '24', 10);
    const metadataCid = process.env.TIKKA_METADATA_CID ?? '';
    if (!publicKey) {
        console.error('Error: TIKKA_PUBLIC_KEY is required');
        process.exit(1);
    }
    const wallet = new mock_wallet_adapter_1.MockWalletAdapter({ publicKey });
    const app = await core_1.NestFactory.createApplicationContext(app_module_1.AppModule.forRoot({ network, wallet }), { logger: false });
    const raffleService = app.get(raffle_service_1.RaffleService);
    console.log(`Creating raffle on ${network}...`);
    console.log(`  ticketPrice : ${ticketPrice} XLM`);
    console.log(`  maxTickets  : ${maxTickets}`);
    console.log(`  duration    : ${durationHours}h`);
    const result = await raffleService.create({
        ticketPrice,
        maxTickets,
        endTime: Date.now() + durationHours * 60 * 60 * 1000,
        allowMultiple: true,
        asset: 'XLM',
        metadataCid,
    });
    console.log('\nRaffle created successfully:');
    console.log(`  raffleId : ${result.raffleId}`);
    console.log(`  txHash   : ${result.txHash}`);
    console.log(`  ledger   : ${result.ledger}`);
    await app.close();
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=create-raffle.js.map