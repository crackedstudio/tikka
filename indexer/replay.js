/**
 * Replay Command Logic for #204
 * Allows the indexer to re-process a specific range of blocks.
 */

async function replay(startBlock, endBlock) {
  console.log(`Replay initiated: Blocks ${startBlock} to ${end_block}`);

  try {
    // 1. Clear existing data in the range to prevent duplicates
    await db.events.deleteRange(startBlock, endBlock);
    console.log("Old data cleared successfully.");

    // 2. Set the cursor back to the starting point
    await db.state.setCursor(startBlock);

    // 3. Start the poller to re-fetch and process events
    await poller.start({ stopAt: endBlock });
    
    console.log("Replay completed successfully.");
  } catch (error) {
    console.error("Replay failed:", error);
  }
}

export default replay;
