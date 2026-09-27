import { Test, TestingModule } from '@nestjs/testing';
import { Logger, OnApplicationShutdown } from '@nestjs/common';
import { NestFactory, NestApplication } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { BullModule, BullModuleOptions, InjectQueue } from '@nestjs/bullmq';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Queue } from 'bullmq';
import { setTimeout as sleep } from 'node:timers/promises';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_QUEUE = 'graceful-shutdown-test';

/** A simple processor that records when jobs start and finish. */
const jobEvents: { started: string[]; finished: string[] } = {
  started: [],
  finished: [],
};

@Processor(TEST_QUEUE)
class TestProcessor extends WorkerHost {
  async process(job: Job<{ id: string; delayMs: number }>): Promise<string> {
    jobEvents.started.push(job.data.id);
    await sleep(job.data.delayMs);
    jobEvents.finished.push(job.data.id);
    return `done-${job.data.id}`;
  }
}

@Module({
  imports: [
    BullModule.forRoot({ connection: { host: 'localhost', port: 6379 } }),
    BullModule.registerQueue({ name: TEST_QUEUE }),
  ],
  providers: [TestProcessor],
})
class TestAppModule {}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Graceful shutdown (e2e)', () => {
  let app: NestApplication;
  let queue: Queue;

  beforeAll(async () => {
    // Skip if Redis is not available
    try {
      const Redis = (await import('ioredis')).default;
      const client = new Redis({ host: 'localhost', port: 6379, lazyConnect: true });
      await client.connect();
      await client.quit();
    } catch {
      console.warn('Skipping graceful-shutdown e2e: Redis not available');
      return;
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [TestAppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.enableShutdownHooks();

    await app.init();
    queue = moduleFixture.get<Queue>(`BullQueue_${TEST_QUEUE}`);
  });

  afterAll(async () => {
    if (app) {
      await queue?.close();
      await app.close();
    }
    jobEvents.started = [];
    jobEvents.finished = [];
  });

  it('SIGTERM lets in-flight jobs finish before the process shuts down', async function () {
    if (!app) return this.skip();

    // Enqueue a job that takes 500 ms
    await queue.add('slow-job', { id: 'job-1', delayMs: 500 });

    // Wait a bit for the worker to pick it up
    await sleep(200);
    expect(jobEvents.started).toContain('job-1');
    expect(jobEvents.finished).not.toContain('job-1');

    // Trigger graceful shutdown — this should let the in-flight job finish
    await app.close();

    // After close resolves, the job should have completed
    expect(jobEvents.finished).toContain('job-1');
  });

  it('multiple in-flight jobs all complete during shutdown', async function () {
    if (!app) return this.skip();

    // Re-init for this test
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [TestAppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.enableShutdownHooks();
    await app.init();
    queue = moduleFixture.get<Queue>(`BullQueue_${TEST_QUEUE}`);

    jobEvents.started = [];
    jobEvents.finished = [];

    // Enqueue 3 jobs with staggered delays
    await queue.add('job-a', { id: 'job-a', delayMs: 300 });
    await queue.add('job-b', { id: 'job-b', delayMs: 400 });
    await queue.add('job-c', { id: 'job-c', delayMs: 200 });

    // Wait for all to be picked up
    await sleep(300);
    expect(jobEvents.started.length).toBeGreaterThanOrEqual(2);

    // Trigger shutdown
    await app.close();

    // All jobs should have finished
    expect(jobEvents.finished).toContain('job-a');
    expect(jobEvents.finished).toContain('job-b');
    expect(jobEvents.finished).toContain('job-c');
  });
});
