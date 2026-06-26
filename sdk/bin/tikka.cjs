
#!/usr/bin/env node

const { Command } = require('commander');
const inquirer = require('inquirer');

// Load SDK
const sdkModule = require('../dist/index');
const TikkaSDK = sdkModule.TikkaSDK || sdkModule.default || sdkModule;

/**
 * Helper: Format error messages safely
 */
const formatError = (err, json = false) => {
  const message = err?.message || String(err) || 'Unknown error';
  if (json) {
    return { error: message };
  }
  return message;
};

/**
 * Helper: Initialize SDK based on CLI flags
 */
const getSDK = (network) => {
  return new TikkaSDK({
    network: network === 'mainnet' ? 'mainnet' : 'testnet',
  });
};

/**
 * Helper: Output result in JSON or human-readable format
 */
const outputResult = (data, json = false) => {
  if (json) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(data);
  }
};

// ============================================================================
// CLI Program Setup
// ============================================================================

const program = new Command();

program
  .name('tikka')
  .description(
    'Tikka SDK Developer CLI - interact with Soroban contracts for raffle, ticket, and network operations'
  )
  .version('0.1.0')
  .option(
    '-n, --network <type>',
    'network to use (testnet|mainnet)',
    'testnet'
  )
  .option('-j, --json', 'output results as JSON', false);

// ============================================================================
// Command: help
// ============================================================================

program
  .command('help-all')
  .alias('commands')
  .description('List all available commands with detailed help')
  .action(() => {
    console.log(`
Tikka SDK Developer CLI - Version 0.1.0

USAGE:
  tikka [OPTIONS] <command>

GLOBAL OPTIONS:
  -n, --network <type>    Network to use: testnet (default) or mainnet
  -j, --json             Output results as JSON
  -h, --help             Show this help message

COMMANDS:

  config-check           Check CLI configuration (no secrets required)
                         Usage: tikka config-check
                         This is a read-only command for verifying setup.

  fee-quote <contractId> Get fee quote for a transaction
                         Usage: tikka fee-quote <contractId>
                         This is a read-only command that doesn't require signing.

  read <contractId>      Read contract data or state
                         Usage: tikka read <contractId>
                         This is a read-only command for data queries.

  list                   List active raffles on the network
                         Usage: tikka list
                         This is a read-only command that fetches raffle data.

  info                   Get contract status and network information
                         Usage: tikka info
                         This is a read-only command that fetches contract info.

  create                 Create a new raffle (interactive)
                         Usage: tikka create
                         This command requires wallet signing for deployment.

  buy                    Purchase raffle tickets (interactive)
                         Usage: tikka buy
                         This command requires wallet signing for transactions.

EXAMPLES:
  # Check config on testnet
  tikka config-check

  # Get fee quote as JSON
  tikka -j fee-quote abc123

  # List raffles on mainnet
  tikka -n mainnet list

  # Interactive raffle creation
  tikka create
`);
  });

// ============================================================================
// Command: config-check (read-only, no secrets required)
// ============================================================================

program
  .command('config-check')
  .description('Check CLI configuration (read-only, no secrets required)')
  .action(async () => {
    const { network, json } = program.opts();
    try {
      const sdk = getSDK(network);
      const config = {
        version: '0.1.0',
        network: network,
        rpcAvailable: !!sdk.rpc,
        contractAvailable: !!sdk.contract,
        walletAdaptersAvailable: !!sdk.wallet,
        status: 'OK',
      };
      outputResult(config, json);
    } catch (err) {
      const error = { success: false, ...formatError(err, json) };
      outputResult(error, json);
      process.exit(1);
    }
  });

// ============================================================================
// Command: fee-quote (read-only, no secrets required)
// ============================================================================

program
  .command('fee-quote <contractId>')
  .description('Get fee quote for a transaction (read-only, no secrets required)')
  .option(
    '-f, --function <name>',
    'contract function name',
    'transfer'
  )
  .action(async (contractId, options) => {
    const { network, json } = program.opts();
    try {
      const sdk = getSDK(network);
      // This is a placeholder for fee estimation logic
      const quote = {
        contractId,
        function: options.function,
        network,
        baseFee: 100,
        estimatedFee: 500,
        currency: 'stroops',
      };
      outputResult(quote, json);
    } catch (err) {
      const error = { success: false, ...formatError(err, json) };
      outputResult(error, json);
      process.exit(1);
    }
  });

// ============================================================================
// Command: read (read-only, no secrets required)
// ============================================================================

program
  .command('read <contractId>')
  .description('Read contract data or state (read-only, no secrets required)')
  .option('-k, --key <key>', 'data key to read (optional)')
  .action(async (contractId, options) => {
    const { network, json } = program.opts();
    try {
      const sdk = getSDK(network);
      const data = {
        contractId,
        key: options.key || 'default',
        network,
        data: null, // Placeholder for actual contract data
      };
      outputResult(data, json);
    } catch (err) {
      const error = { success: false, ...formatError(err, json) };
      outputResult(error, json);
      process.exit(1);
    }
  });

// ============================================================================
// Command: list (read-only, no secrets required)
// ============================================================================

program
  .command('list')
  .description('List active raffles on the network (read-only)')
  .option('-l, --limit <number>', 'limit results', '10')
  .action(async (options) => {
    const { network, json } = program.opts();
    try {
      const sdk = getSDK(network);
      console.log(`\n📋 Active Raffles on ${network}:`);
      try {
        const list = await sdk.raffle.listActive();
        outputResult(list, json);
      } catch (err) {
        const error = { success: false, ...formatError(err, json) };
        outputResult(error, json);
        process.exit(1);
      }
    } catch (err) {
      const error = { success: false, ...formatError(err, json) };
      outputResult(error, json);
      process.exit(1);
    }
  });

// ============================================================================
// Command: info (read-only, no secrets required)
// ============================================================================

program
  .command('info')
  .description('Get contract status and network information (read-only)')
  .action(async () => {
    const { network, json } = program.opts();
    try {
      const sdk = getSDK(network);
      if (!json) {
        console.log(`\n🔍 Fetching Info for ${network.toUpperCase()}...`);
      }
      try {
        const status = await sdk.contract.getStatus();
        outputResult(status, json);
      } catch (err) {
        const error = { success: false, ...formatError(err, json) };
        outputResult(error, json);
        process.exit(1);
      }
    } catch (err) {
      const error = { success: false, ...formatError(err, json) };
      outputResult(error, json);
      process.exit(1);
    }
  });

// ============================================================================
// Command: create (requires wallet)
// ============================================================================

program
  .command('create')
  .description('Create a new raffle (interactive, requires wallet signing)')
  .action(async () => {
    const { network, json } = program.opts();
    try {
      const sdk = getSDK(network);

      const answers = await inquirer.prompt([
        { type: 'input', name: 'name', message: 'Raffle Name:' },
        {
          type: 'input',
          name: 'symbol',
          message: 'Token Symbol (e.g., TIKKA):',
        },
        { type: 'number', name: 'price', message: 'Ticket Price:' },
        {
          type: 'confirm',
          name: 'confirm',
          message: 'Ready to deploy to contract?',
        },
      ]);

      if (answers.confirm) {
        if (!json) console.log('🚀 Deploying raffle...');
        // Placeholder for actual deployment
        const result = { success: true, message: 'Raffle deployment started' };
        outputResult(result, json);
      } else {
        const result = { success: false, message: 'Deployment cancelled' };
        outputResult(result, json);
      }
    } catch (err) {
      const error = { success: false, ...formatError(err, json) };
      outputResult(error, json);
      process.exit(1);
    }
  });

// ============================================================================
// Command: buy (requires wallet)
// ============================================================================

program
  .command('buy')
  .description('Purchase raffle tickets (interactive, requires wallet signing)')
  .action(async () => {
    const { network, json } = program.opts();
    try {
      const sdk = getSDK(network);

      const answers = await inquirer.prompt([
        { type: 'input', name: 'raffleId', message: 'Enter Raffle ID:' },
        { type: 'number', name: 'quantity', message: 'Number of tickets:' },
      ]);

      if (!json) {
        console.log(
          `🎟️ Purchasing ${answers.quantity} tickets for #${answers.raffleId}`
        );
      }
      // Placeholder for actual purchase
      const result = {
        success: true,
        message: 'Purchase initiated',
        raffleId: answers.raffleId,
        quantity: answers.quantity,
      };
      outputResult(result, json);
    } catch (err) {
      const error = { success: false, ...formatError(err, json) };
      outputResult(error, json);
      process.exit(1);
    }
  });

// ============================================================================
// Default help and error handling
// ============================================================================

program.on('command:*', function () {
  console.error(
    '\n❌ Invalid command. Use "tikka --help" for usage information.'
  );
  process.exit(1);
});

program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}