import { Module } from '@nestjs/common';
import { UploadService } from './upload.service';
import { UploadController } from './upload.controller';
import { StorageController } from './storage.controller';

@Module({
  controllers: [UploadController, StorageController],
  providers: [UploadService],
})
export class UploadModule {}
