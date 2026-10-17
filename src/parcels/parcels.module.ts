import { Module } from '@nestjs/common';
import { ParcelsService } from './parcels.service';
import { ParcelsController } from './parcels.controller';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [ProjectsModule],
  controllers: [ParcelsController],
  providers: [ParcelsService],
  exports: [ParcelsService],
})
export class ParcelsModule {}
