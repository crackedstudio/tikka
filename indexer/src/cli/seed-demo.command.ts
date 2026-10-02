import { AppDataSource } from '../data-source';
import { seedDemoDatabase } from './seed-demo';

async function main(): Promise<void> {
  await AppDataSource.initialize();
  try {
    await AppDataSource.runMigrations({ transaction: 'each' });
    const { raffleIds, tickets, users } = await seedDemoDatabase(AppDataSource);
    console.log(
      `Seeded demo raffles ${raffleIds.join(', ')} with ${tickets.length} tickets and ${users.length} users.`,
    );
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error('Failed to seed demo dataset:', error);
  process.exitCode = 1;
});
