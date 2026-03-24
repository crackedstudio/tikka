import { DynamicModule, Module } from '@nestjs/common';
import { SdkNetworkConfig, SDK_NETWORK_CONFIG } from './network.config';
import { RpcService } from './rpc.service';

@Module({})
export class NetworkModule {
  static forRoot(config: SdkNetworkConfig): DynamicModule {
    return {
      module: NetworkModule,
      global: true,
      providers: [
        { provide: SDK_NETWORK_CONFIG, useValue: config },
        RpcService,
      ],
      exports: [RpcService, SDK_NETWORK_CONFIG],
    };
  }
}
