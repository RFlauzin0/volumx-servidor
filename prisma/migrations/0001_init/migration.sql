-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "googleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_members" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "teamId" TEXT,
    "userId" TEXT NOT NULL,
    "location" TEXT,
    "clientId" TEXT,
    "projectType" TEXT,
    "totalAreaHa" DOUBLE PRECISION,
    "municipality" TEXT,
    "state" TEXT,
    "technicalLead" TEXT,
    "artNumber" TEXT,
    "status" TEXT DEFAULT 'planejamento',
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parcels" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "area" DOUBLE PRECISION,
    "description" TEXT,
    "stratum" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parcels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trees" (
    "id" TEXT NOT NULL,
    "parcelId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "speciesName" TEXT NOT NULL,
    "dbh" DOUBLE PRECISION NOT NULL,
    "height" DOUBLE PRECISION NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "measuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "measuredByUserId" TEXT NOT NULL,
    "notes" TEXT,
    "barkPercentage" DOUBLE PRECISION,
    "commercialHeight" DOUBLE PRECISION,
    "pom" DOUBLE PRECISION,
    "cap" DOUBLE PRECISION,
    "measurementMethod" TEXT,
    "measurementConfidence" INTEGER,
    "tagNumber" TEXT,
    "stemQuality" INTEGER,
    "sanity" TEXT,
    "treeStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tree_photos" (
    "id" TEXT NOT NULL,
    "treeId" TEXT NOT NULL,
    "cloud_storage_path" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "caption" TEXT,
    "contentType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tree_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "log_sections" (
    "id" TEXT NOT NULL,
    "treeId" TEXT NOT NULL,
    "sectionNumber" INTEGER NOT NULL,
    "length" DOUBLE PRECISION NOT NULL,
    "diameterSmallEnd" DOUBLE PRECISION NOT NULL,
    "diameterLargeEnd" DOUBLE PRECISION NOT NULL,
    "diameterMiddle" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "log_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "volume_calculations" (
    "id" TEXT NOT NULL,
    "treeId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "totalVolume" DOUBLE PRECISION NOT NULL,
    "sectionVolumes" JSONB NOT NULL,
    "barkPercentage" DOUBLE PRECISION,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "calculatedByUserId" TEXT NOT NULL,

    CONSTRAINT "volume_calculations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "changes" JSONB,
    "userId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "token" TEXT NOT NULL,
    "deviceType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "cloud_storage_path" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "contentType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_queue" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "synced" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "volume_equations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "coefficients" JSONB NOT NULL,
    "speciesName" TEXT,
    "projectId" TEXT,
    "userId" TEXT NOT NULL,
    "rSquared" DOUBLE PRECISION,
    "sampleSize" INTEGER,
    "isFitted" BOOLEAN NOT NULL DEFAULT false,
    "heightBasis" TEXT NOT NULL DEFAULT 'total',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "volume_equations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "city" TEXT,
    "state" TEXT,
    "propertyName" TEXT,
    "carNumber" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "licenses" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT,
    "projectId" TEXT,
    "type" TEXT NOT NULL,
    "number" TEXT,
    "issuer" TEXT,
    "title" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "alertDays" INTEGER NOT NULL DEFAULT 60,
    "status" TEXT NOT NULL DEFAULT 'vigente',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "licenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");

-- CreateIndex
CREATE INDEX "teams_ownerId_idx" ON "teams"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "team_members_teamId_userId_key" ON "team_members"("teamId", "userId");

-- CreateIndex
CREATE INDEX "projects_userId_idx" ON "projects"("userId");

-- CreateIndex
CREATE INDEX "projects_teamId_idx" ON "projects"("teamId");

-- CreateIndex
CREATE INDEX "parcels_projectId_idx" ON "parcels"("projectId");

-- CreateIndex
CREATE INDEX "trees_parcelId_idx" ON "trees"("parcelId");

-- CreateIndex
CREATE INDEX "trees_projectId_idx" ON "trees"("projectId");

-- CreateIndex
CREATE INDEX "trees_measuredByUserId_idx" ON "trees"("measuredByUserId");

-- CreateIndex
CREATE INDEX "trees_speciesName_idx" ON "trees"("speciesName");

-- CreateIndex
CREATE INDEX "tree_photos_treeId_idx" ON "tree_photos"("treeId");

-- CreateIndex
CREATE INDEX "log_sections_treeId_idx" ON "log_sections"("treeId");

-- CreateIndex
CREATE UNIQUE INDEX "log_sections_treeId_sectionNumber_key" ON "log_sections"("treeId", "sectionNumber");

-- CreateIndex
CREATE INDEX "volume_calculations_treeId_idx" ON "volume_calculations"("treeId");

-- CreateIndex
CREATE INDEX "volume_calculations_calculatedByUserId_idx" ON "volume_calculations"("calculatedByUserId");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_timestamp_idx" ON "audit_logs"("timestamp");

-- CreateIndex
CREATE INDEX "notifications_userId_idx" ON "notifications"("userId");

-- CreateIndex
CREATE INDEX "notifications_userId_read_idx" ON "notifications"("userId", "read");

-- CreateIndex
CREATE INDEX "notifications_createdAt_idx" ON "notifications"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "push_tokens_token_key" ON "push_tokens"("token");

-- CreateIndex
CREATE INDEX "push_tokens_userId_idx" ON "push_tokens"("userId");

-- CreateIndex
CREATE INDEX "files_userId_idx" ON "files"("userId");

-- CreateIndex
CREATE INDEX "files_cloud_storage_path_idx" ON "files"("cloud_storage_path");

-- CreateIndex
CREATE INDEX "sync_queue_userId_idx" ON "sync_queue"("userId");

-- CreateIndex
CREATE INDEX "sync_queue_userId_synced_idx" ON "sync_queue"("userId", "synced");

-- CreateIndex
CREATE INDEX "sync_queue_createdAt_idx" ON "sync_queue"("createdAt");

-- CreateIndex
CREATE INDEX "volume_equations_userId_idx" ON "volume_equations"("userId");

-- CreateIndex
CREATE INDEX "volume_equations_projectId_idx" ON "volume_equations"("projectId");

-- CreateIndex
CREATE INDEX "volume_equations_speciesName_idx" ON "volume_equations"("speciesName");

-- CreateIndex
CREATE INDEX "clients_userId_idx" ON "clients"("userId");

-- CreateIndex
CREATE INDEX "licenses_userId_idx" ON "licenses"("userId");

-- CreateIndex
CREATE INDEX "licenses_expiryDate_idx" ON "licenses"("expiryDate");

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trees" ADD CONSTRAINT "trees_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "parcels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trees" ADD CONSTRAINT "trees_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trees" ADD CONSTRAINT "trees_measuredByUserId_fkey" FOREIGN KEY ("measuredByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tree_photos" ADD CONSTRAINT "tree_photos_treeId_fkey" FOREIGN KEY ("treeId") REFERENCES "trees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "log_sections" ADD CONSTRAINT "log_sections_treeId_fkey" FOREIGN KEY ("treeId") REFERENCES "trees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volume_calculations" ADD CONSTRAINT "volume_calculations_treeId_fkey" FOREIGN KEY ("treeId") REFERENCES "trees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volume_calculations" ADD CONSTRAINT "volume_calculations_calculatedByUserId_fkey" FOREIGN KEY ("calculatedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_queue" ADD CONSTRAINT "sync_queue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volume_equations" ADD CONSTRAINT "volume_equations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volume_equations" ADD CONSTRAINT "volume_equations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

