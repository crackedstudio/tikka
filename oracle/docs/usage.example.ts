import { Injectable } from '@nestjs/common';
import { OracleConfigService } from '../src/config/oracle-config.service';

@Injectable()
export class ExampleService {
  constructor(private readonly config: OracleConfigService) {}

  async connectToStellar() {
    const stellar = this.config.getStellar();
    console.log(`Connecting to Horizon: ${stellar.horizonUrl}`);
  }
}
