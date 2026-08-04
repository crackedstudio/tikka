"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const core_1 = require("@nestjs/core");
const app_module_1 = require("../src/app.module");
const raffle_service_1 = require("../src/modules/raffle/raffle.service");
const ticket_service_1 = require("../src/modules/ticket/ticket.service");
const mock_wallet_adapter_1 = require("../src/wallet/mock-wallet.adapter");
async function main() {
    const network = (process.env.TIKKA_NETWORK ?? 'testnet');
    const publicKey = process.env.TIKKA_PUBLIC_KEY ?? '';
    const wallet = new mock_wallet_adapter_1.MockWalletAdapter({ publicKey: publicKey || undefined });
    const app = await core_1.NestFactory.createApplicationContext(app_module_1.AppModule.forRoot({ network, wallet }), { logger: false });
    const raffleService = app.get(raffle_service_1.RaffleService);
    const ticketService = app.get(ticket_service_1.TicketService);
    console.log('Creating raffle...');
    const { raffleId, txHash } = await raffleService.create({
        ticketPrice: '1',
        maxTickets: 100,
        endTime: Date.now() + 24 * 60 * 60 * 1000,
        allowMultiple: true,
        asset: 'XLM',
        metadataCid: '',
    });
    console.log(`Raffle created — id=${raffleId}  tx=${txHash}`);
    console.log('Buying 2 tickets...');
    const { ticketIds, txHash: buyTx } = await ticketService.buy({ raffleId, quantity: 2 });
    console.log(`Tickets purchased — ids=${ticketIds.join(',')}  tx=${buyTx}`);
    const raffle = await raffleService.get(raffleId);
    console.log('Raffle state:', raffle);
    await app.close();
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=quickstart.js.map