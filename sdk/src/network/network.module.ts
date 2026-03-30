import { Module, DynamicModule, Global } from '@nestjs/common';
import { RpcService } from './rpc.service';
import { HorizonService } from './horizon.service';
import {
  NetworkConfig,
  resolveNetworkConfig,
  TikkaNetwork,
  RpcConfig,
} from './network.config';

@Global()
@Module({})
export class NetworkModule {
  static forRoot(
    networkOrConfig: TikkaNetwork | NetworkConfig | (Partial<NetworkConfig> & { network: TikkaNetwork }),
    rpcConfig?: RpcConfig,
  ): DynamicModule {
    const networkConfig = resolveNetworkConfig(networkOrConfig);
    const resolvedRpcConfig: RpcConfig = {
      ...rpcConfig,
      endpoint: rpcConfig?.endpoint ?? networkConfig.rpcUrl,
    };

    return {
      module: NetworkModule,
      providers: [
        { provide: 'NETWORK_CONFIG', useValue: networkConfig },
        { provide: 'RPC_CONFIG', useValue: resolvedRpcConfig },

        {
          provide: RpcService,
          useFactory: () => new RpcService(networkConfig, resolvedRpcConfig),
        },
        {
          provide: HorizonService,
          useFactory: () => new HorizonService(networkConfig),
        },
      ],
      exports: [RpcService, HorizonService, 'NETWORK_CONFIG', 'RPC_CONFIG'],
    };
  }
}