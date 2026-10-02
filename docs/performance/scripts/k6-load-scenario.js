import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const listLatency = new Trend('list_duration', true);
const detailLatency = new Trend('detail_duration', true);
const leaderboardLatency = new Trend('leaderboard_duration', true);
const searchLatency = new Trend('search_duration', true);
const errorRate = new Rate('errors');

export const options = {
  stages: [
    { duration: '30s', target: 20 },
    { duration: '2m',  target: 100 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    list_duration: ['p(95)<300'],
    detail_duration: ['p(95)<200'],
    leaderboard_duration: ['p(95)<250'],
    search_duration: ['p(95)<250'],
    errors: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

export default function () {
  let res = http.get(`${BASE_URL}/raffles?limit=20`, { tags: { endpoint: 'list' } });
  listLatency.add(res.timings.duration);
  errorRate.add(res.status >= 400);
  check(res, { 'list status is 200': (r) => r.status === 200 });

  sleep(0.2);

  res = http.get(`${BASE_URL}/raffles/1`, { tags: { endpoint: 'detail' } });
  detailLatency.add(res.timings.duration);
  errorRate.add(res.status >= 400 && res.status !== 404);
  check(res, { 'detail status is 200 or 404': (r) => r.status === 200 || r.status === 404 });

  sleep(0.2);

  res = http.get(`${BASE_URL}/leaderboard`, { tags: { endpoint: 'leaderboard' } });
  leaderboardLatency.add(res.timings.duration);
  errorRate.add(res.status >= 400);
  check(res, { 'leaderboard status is 200': (r) => r.status === 200 });

  sleep(0.2);

  res = http.get(`${BASE_URL}/search?q=test`, { tags: { endpoint: 'search' } });
  searchLatency.add(res.timings.duration);
  errorRate.add(res.status >= 400);
  check(res, { 'search status is 200': (r) => r.status === 200 });

  sleep(0.5);
}
