import { describe, test, expect } from 'vitest';
import { RafflesQueryService, RafflesCommandService, Raffle } from './services';

describe('Raffles CQRS Service Segregation Architecture', () => {
  const seedDatabase: Raffle[] = [
    { id: '1', title: 'Premium NFT Pack Raffle', ticketPrice: 10, status: 'active', createdAt: new Date() },
    { id: '2', title: 'Legacy Token Reward Allocation', ticketPrice: 5, status: 'paused', createdAt: new Date() },
  ];

  test('Query Service should execute isolated reads without affecting entity states', async () => {
    const queryService = new RafflesQueryService([...seedDatabase]);
    
    const activeList = await queryService.listAllActive();
    expect(activeList.length).toBe(1);
    expect(activeList[0].id).toBe('1');

    const lookup = await queryService.getById('2');
    expect(lookup?.status).toBe('paused');
  });

  test('Command Service should process state-altering transactions predictably', async () => {
    const sharedDbInstance = [...seedDatabase];
    const commandService = new RafflesCommandService(sharedDbInstance);

    const created = await commandService.createRaffle('Supercharger System Drop', 100);
    expect(created.status).toBe('active');
    expect(sharedDbInstance.length).toBe(3);

    const checkPurchase = await commandService.purchaseTicket('1', 'user_0xDEADBEEF');
    expect(checkPurchase).toBe(true);
  });
});
