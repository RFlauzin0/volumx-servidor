import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LogPileController } from './logpile.controller';
import { LogPileService } from './logpile.service';

@Module({
  imports: [ConfigModule],
  controllers: [LogPileController],
  providers: [LogPileService],
})
export class LogPileModule {}
