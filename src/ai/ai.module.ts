import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({
  imports: [ProjectsModule],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}
