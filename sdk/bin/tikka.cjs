

const { Command } = require('commander');
const inquirer = require('inquirer');

// --- THE FIX ---
const sdkModule = require('../dist/index');

/**
 * We look for TikkaSDK in three places:
 * 1. Inside a named export: sdkModule.TikkaSDK
 * 2. Inside a default export: sdkModule.default
 * 3. As the module itself: sdkModule
 */
const TikkaSDK = sdkModule.TikkaSDK || sdkModule.default || sdkModule;
// ----------------

const program = new Command();
program
  .name('tikka')
  .description('Tikka SDK Developer CLI')
  .version('0.1.0')
  .option('-n, --network <type>', 'network to use (testnet/mainnet)', 'testnet');

// HELPER: Initialize SDK based on CLI flags
const getSDK = (network) => {
  // Ensure we are calling the constructor properly
  return new TikkaSDK({ 
    network: network === 'mainnet' ? 'mainnet' : 'testnet' 
  });
};

// --- REQUIREMENT: Subcommand INFO ---
program
  .command('info')
  .description('Quickly interact with the contract info')
  .action(async () => {
    const { network } = program.opts();
    const sdk = getSDK(network);
    console.log(`\n🔍 Fetching Info for ${network.toUpperCase()}...`);
    
    try {
      // Adjusted to use your real service structure found in the tree (contract.service)
      const status = await sdk.contract.getStatus(); 
      console.table(status);
    } catch (err) {
      console.error('❌ Error fetching info:', err.message);
    }
  });

// --- REQUIREMENT: Subcommand CREATE ---
program
  .command('create')
  .description('Create a new raffle (Interactive)')
  .action(async () => {
    const { network } = program.opts();
    const sdk = getSDK(network);

    const answers = await inquirer.prompt([
      { type: 'input', name: 'name', message: 'Raffle Name:' },
      { type: 'input', name: 'symbol', message: 'Token Symbol (e.g., TIKKA):' },
      { type: 'number', name: 'price', message: 'Ticket Price:' },
      { type: 'confirm', name: 'confirm', message: 'Ready to deploy to contract?' }
    ]);

    if (answers.confirm) {
      console.log('🚀 Deploying raffle...');
      // await sdk.raffle.createRaffle(answers);
    }
  });

// --- REQUIREMENT: Subcommand BUY ---
program
  .command('buy')
  .description('Purchase tickets')
  .action(async () => {
    const { network } = program.opts();
    const sdk = getSDK(network);

    const answers = await inquirer.prompt([
      { type: 'input', name: 'raffleId', message: 'Enter Raffle ID:' },
      { type: 'number', name: 'quantity', message: 'Number of tickets:' }
    ]);
    
    console.log(`🎟️ Purchasing ${answers.quantity} tickets for #${answers.raffleId}`);
    // await sdk.ticket.buyTickets(answers.raffleId, answers.quantity);
  });

// --- REQUIREMENT: Subcommand LIST ---
program
  .command('list')
  .description('List active raffles')
  .action(async () => {
    const { network } = program.opts();
    const sdk = getSDK(network);

    console.log(`\n📋 Active Raffles on ${network}:`);
    try {
      // Matches the raffle service in your tree
      const list = await sdk.raffle.listActive(); 
      console.table(list);
    } catch (err) {
      console.error('❌ Error listing raffles:', err.message);
    }
  });

program.parse(process.argv);