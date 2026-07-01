"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const core_1 = require("@nestjs/core");
const app_module_1 = require("../src/app.module");
const raffle_service_1 = require("../src/modules/raffle/raffle.service");
const ticket_service_1 = require("../src/modules/ticket/ticket.service");
const mock_wallet_adapter_1 = require("../src/wallet/mock-wallet.adapter");
const bindings_1 = require("../src/contract/bindings");
async function main() {
    const network = (process.env.TIKKA_NETWORK ?? 'testnet');
    const publicKey = process.env.TIKKA_PUBLIC_KEY ?? '';
    const raffleId = parseInt(process.env.TIKKA_RAFFLE_ID ?? '0', 10);
    const quantity = parseInt(process.env.TIKKA_QUANTITY ?? '1', 10);
    if (!publicKey) {
        console.error('Error: TIKKA_PUBLIC_KEY is required');
        process.exit(1);
    }
    if (!raffleId) {
        console.error('Error: TIKKA_RAFFLE_ID is required');
        process.exit(1);
    }
    const wallet = new mock_wallet_adapter_1.MockWalletAdapter({ publicKey });
    const app = await core_1.NestFactory.createApplicationContext(app_module_1.AppModule.forRoot({ network, wallet }), { logger: false });
    const raffleService = app.get(raffle_service_1.RaffleService);
    const ticketService = app.get(ticket_service_1.TicketService);
    const raffle = await raffleService.get(raffleId);
    if (raffle.status !== bindings_1.RaffleStatus.Open) {
        console.error(`Raffle ${raffleId} is not open (status=${raffle.status})`);
        await app.close();
        process.exit(1);
    }
    const available = raffle.maxTickets - raffle.ticketsSold;
    console.log(`Raffle ${raffleId}: ${available} tickets remaining at ${raffle.ticketPrice} XLM each`);
    if (quantity > available) {
        console.error(`Requested ${quantity} tickets but only ${available} available`);
        await app.close();
        process.exit(1);
    }
    console.log(`Buying ${quantity} ticket(s)...`);
    const result = await ticketService.buy({ raffleId, quantity });
    console.log('\nTickets purchased successfully:');
    console.log(`  ticketIds : ${result.ticketIds.join(', ')}`);
    console.log(`  txHash    : ${result.txHash}`);
    console.log(`  ledger    : ${result.ledger}`);
    const myTickets = await ticketService.getUserTickets({ raffleId, userAddress: publicKey });
    console.log(`\nAll your tickets for raffle ${raffleId}: [${myTickets.join(', ')}]`);
    await app.close();
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=buy-tickets.js.map