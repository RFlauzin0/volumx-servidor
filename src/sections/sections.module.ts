import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { SectionsService } from './sections.service';
import { SectionsController } from './sections.controller';

@Module({
  imports: [ProjectsModule],
  controllers: [SectionsController],
  providers: [SectionsService],
})
export class SectionsModule {}
