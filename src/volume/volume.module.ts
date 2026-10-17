import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { VolumeService } from './volume.service';
import { VolumeController } from './volume.controller';

@Module({
  imports: [ProjectsModule],
  controllers: [VolumeController],
  providers: [VolumeService],
})
export class VolumeModule {}
