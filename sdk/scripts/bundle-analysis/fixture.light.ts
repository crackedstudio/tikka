/**
 * Fixture app for issue #1108: imports a single helper from the light SDK
 * entrypoint so a bundler's tree-shaking behavior can be measured in
 * isolation, without pulling in the rest of the light bundle's exports.
 */
import { resolveNetworkConfig } from '../../dist/light/index.light.js';

const config = resolveNetworkConfig('testnet');
console.log(config.rpcUrl);
