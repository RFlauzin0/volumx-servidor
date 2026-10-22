import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { TeamsModule } from './teams/teams.module';
import { ProjectsModule } from './projects/projects.module';
import { ParcelsModule } from './parcels/parcels.module';
import { TreesModule } from './trees/trees.module';
import { PhotosModule } from './photos/photos.module';
import { SectionsModule } from './sections/sections.module';
import { ForestryModule } from './forestry/forestry.module';
import { VolumeModule } from './volume/volume.module';
import { UploadModule } from './upload/upload.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ExportModule } from './export/export.module';
import { SyncModule } from './sync/sync.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AuditModule } from './audit/audit.module';
import { SpeciesModule } from './species/species.module';
import { LogPileModule } from './logpile/logpile.module';
import { ConsultancyModule } from './consultancy/consultancy.module';
import { AiModule } from './ai/ai.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    TeamsModule,
    ProjectsModule,
    ParcelsModule,
    TreesModule,
    PhotosModule,
    SectionsModule,
    VolumeModule,
    ForestryModule,
    UploadModule,
    DashboardModule,
    ExportModule,
    SyncModule,
    NotificationsModule,
    AuditModule,
    SpeciesModule,
    LogPileModule,
    ConsultancyModule,
    AiModule,
  ],
})
export class AppModule {}
