import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KeyService } from './key.service';

@Global()
@Module({
    imports: [ConfigModule],
    providers: [KeyService],
    exports: [KeyService],
})
export class KeysModule { }
