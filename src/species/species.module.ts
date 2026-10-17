import { Module } from '@nestjs/common';
import { SpeciesController } from './species.controller';

@Module({
  controllers: [SpeciesController],
})
export class SpeciesModule {}
