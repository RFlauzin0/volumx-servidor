import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';

@Module({
  imports: [ProjectsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
