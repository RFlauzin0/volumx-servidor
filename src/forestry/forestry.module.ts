import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { EquationsService } from './equations.service';
import { EquationsController } from './equations.controller';

@Module({
  imports: [ProjectsModule],
  controllers: [EquationsController],
  providers: [EquationsService],
  exports: [EquationsService],
})
export class ForestryModule {}
