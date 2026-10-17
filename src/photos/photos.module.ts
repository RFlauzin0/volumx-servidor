import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { PhotosService } from './photos.service';
import { PhotosController } from './photos.controller';

@Module({
  imports: [ProjectsModule],
  controllers: [PhotosController],
  providers: [PhotosService],
})
export class PhotosModule {}
