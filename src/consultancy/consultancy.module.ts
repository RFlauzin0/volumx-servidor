import { Module } from '@nestjs/common';
import { ConsultancyService } from './consultancy.service';
import { ConsultancyController } from './consultancy.controller';

@Module({
  controllers: [ConsultancyController],
  providers: [ConsultancyService],
})
export class ConsultancyModule {}
