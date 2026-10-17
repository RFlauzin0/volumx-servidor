import { Module } from '@nestjs/common';
import { TreesService } from './trees.service';
import { TreesController } from './trees.controller';
import { ProjectsModule } from '../projects/projects.module';
import { AuditModule } from '../audit/audit.module';
import { ForestryModule } from '../forestry/forestry.module';

@Module({
  imports: [ProjectsModule, AuditModule, ForestryModule],
  controllers: [TreesController],
  providers: [TreesService],
  exports: [TreesService],
})
export class TreesModule {}
