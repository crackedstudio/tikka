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
    networkOrConfig: TikkaNetwork | NetworkConfig,
    rpcConfig?: RpcConfig,
  ): DynamicModule {
    const networkConfig = resolveNetworkConfig(networkOrConfig);

    return {
      module: NetworkModule,
      providers: [
        { provide: 'NETWORK_CONFIG', useValue: networkConfig },
        { provide: 'RPC_CONFIG', useValue: rpcConfig },

        {
          provide: RpcService,
          useFactory: () => new RpcService(networkConfig, rpcConfig),
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