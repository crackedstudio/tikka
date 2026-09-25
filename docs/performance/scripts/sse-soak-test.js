import http from 'http';
import { URL } from 'url';

const targetConnections = parseInt(process.argv[2] || '200', 10);
const durationSeconds = parseInt(process.argv[3] || '30', 10);
const baseUrl = process.argv[4] || 'http://localhost:3001';

console.log(`=======================================================`);
console.log(` Starting SSE Connection Soak Test`);
console.log(` Target Connections : ${targetConnections}`);
console.log(` Test Duration      : ${durationSeconds} seconds`);
console.log(` Target Base URL    : ${baseUrl}`);
console.log(`=======================================================\n`);

let activeConnections = 0;
let totalOpened = 0;
let totalFailed = 0;
let messagesReceived = 0;
const sockets = [];

const parsedUrl = new URL(`${baseUrl}/raffles/events`);

function connectSSE(id) {
  const req = http.request(
    {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 80,
      path: parsedUrl.pathname,
      method: 'GET',
      headers: {
        Accept: 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    },
    (res) => {
      if (res.statusCode === 200) {
        activeConnections++;
        totalOpened++;
        res.on('data', () => {
          messagesReceived++;
        });
        res.on('end', () => {
          activeConnections--;
        });
      } else {
        totalFailed++;
      }
    },
  );

  req.on('error', () => {
    totalFailed++;
  });

  req.end();
  sockets.push(req);
}

let created = 0;
const rampInterval = setInterval(() => {
  if (created < targetConnections) {
    connectSSE(created + 1);
    created++;
  } else {
    clearInterval(rampInterval);
    console.log(`[Ramp Completed] ${totalOpened} connections established.\n`);
  }
}, 20);

const statusInterval = setInterval(() => {
  const mem = process.memoryUsage();
  console.log(
    `[Status] Active: ${activeConnections} | Opened: ${totalOpened} | Failed: ${totalFailed} | SSE Msgs: ${messagesReceived} | Heap: ${(mem.heapUsed / 1024 / 1024).toFixed(2)} MB`,
  );
}, 5000);

setTimeout(() => {
  clearInterval(statusInterval);
  clearInterval(rampInterval);
  console.log(`\n=======================================================`);
  console.log(` Test Completed. Closing all SSE sockets...`);
  sockets.forEach((s) => s.destroy());
  
  console.log(`\nFinal Report:`);
  console.log(`  Peak Active Connections : ${activeConnections}`);
  console.log(`  Total Opened            : ${totalOpened}`);
  console.log(`  Failed Connections      : ${totalFailed}`);
  console.log(`  Total Messages Received : ${messagesReceived}`);
  console.log(`  Connection Success Rate : ${((totalOpened / targetConnections) * 100).toFixed(1)}%`);
  console.log(`=======================================================\n`);
  process.exit(0);
}, durationSeconds * 1000);
