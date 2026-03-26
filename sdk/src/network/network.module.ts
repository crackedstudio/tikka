import { Module, DynamicModule, Global } from '@nestjs/common';
import { RpcService } from './rpc.service';
import { HorizonService } from './horizon.service';
import { RpcConfig } from './network.config';

@Global()
@Module({
  providers: [RpcService, HorizonService],
  exports: [RpcService, HorizonService],
})
export class NetworkModule {
  static forRoot(config?: RpcConfig): DynamicModule {
    return {
      module: NetworkModule,
      providers: [
        {
          provide: RpcService,
          useValue: new RpcService(config),
        },
        {
          provide: HorizonService,
          useValue: new HorizonService(config),
        },
      ],
      exports: [RpcService, HorizonService],
    };
  }
}
