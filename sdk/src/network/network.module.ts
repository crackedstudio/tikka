import { DynamicModule } from '@nestjs/common';
import { RpcService } from './rpc.service';
import { HorizonService } from './horizon.service';
import {
  NetworkConfig,
  resolveNetworkConfig,
  TikkaNetwork,
  RpcConfig,
} from './network.config';
import { type TikkaLogger, defaultLogger } from '../utils/logger';

export const TIKKA_LOGGER = 'TIKKA_LOGGER';

export class NetworkModule {
  static forRoot(
    networkOrConfig: TikkaNetwork | NetworkConfig | (Partial<NetworkConfig> & { network: TikkaNetwork }),
    rpcConfig?: RpcConfig,
    logger?: TikkaLogger,
  ): DynamicModule {
    const networkConfig = resolveNetworkConfig(networkOrConfig);
    const resolvedRpcConfig: RpcConfig = {
      ...rpcConfig,
      endpoint: rpcConfig?.endpoint ?? networkConfig.rpcUrl,
    };
    const resolvedLogger = logger ?? defaultLogger;

    return {
      module: NetworkModule,
      providers: [
        { provide: 'NETWORK_CONFIG', useValue: networkConfig },
        { provide: 'RPC_CONFIG', useValue: resolvedRpcConfig },
        { provide: TIKKA_LOGGER, useValue: resolvedLogger },

        {
          provide: RpcService,
          useFactory: () => new RpcService(networkConfig, resolvedRpcConfig, resolvedLogger),
        },
        {
          provide: HorizonService,
          useFactory: () => new HorizonService(networkConfig, resolvedLogger),
        },
      ],
      exports: [RpcService, HorizonService, 'NETWORK_CONFIG', 'RPC_CONFIG', TIKKA_LOGGER],
    };
  }
}