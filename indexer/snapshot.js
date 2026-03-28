/**
 * Snapshot Feature for #209
 * Allows exporting and importing current state for faster syncing.
 */

const fs = require('fs');

// 1. Export Snapshot Command
async function exportSnapshot() {
  const currentState = {
    users: await db.users.findMany(),
    raffles: await db.raffles.findMany(),
    cursor: await db.state.getLatestCursor(),
    version: "1.0",
    timestamp: new Date().toISOString()
  };
  
  fs.writeFileSync('snapshot.json', JSON.stringify(currentState, null, 2));
  console.log("State exported to snapshot.json");
}

// 2. Bootstrap (Import) Command
async function bootstrapFromSnapshot(filePath) {
  const rawData = fs.readFileSync(filePath);
  const data = JSON.parse(rawData);

  // Clear existing state before importing
  await db.users.deleteAll();
  await db.raffles.deleteAll();

  // Import new state
  await db.users.bulkInsert(data.users);
  await db.raffles.bulkInsert(data.raffles);
  
  // Update the cursor to match the snapshot
  await db.state.setCursor(data.cursor);

  console.log(`System bootstrapped successfully to cursor: ${data.cursor}`);
}

export { exportSnapshot, bootstrapFromSnapshot };
