import { PostgreSQlContainer } from '@testcontainers/postgresql';
import { RedisContainer } from '@testcontainers/redis';

export interface IntegrationEnvironment {
  postgresUrl: string;
  redisUrl: string;
  teardown: () => Promise<void>;
}

export async function setupIntegrationEnvironment(): Promise<IntegrationEnvironment> {
  const postgresContainer = await new PostgreSQlContainer().start();
  const redisContainer = await new RedisContainer().start();

  return {
    postgresUrl: postgresContainer.getConnectionUri(),
    redisUrl: redisContainer.getConnectionUrl(),
    teardown: async () => {
      await postgresContainer.stop();
      await redisContainer.stop();
    },
  };
}
