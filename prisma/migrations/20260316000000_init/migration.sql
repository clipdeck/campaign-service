-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('CLIP', 'VIEWS', 'BASE_PLUS_VIEWS', 'TWEET', 'TWEET_ENGAGEMENT');

-- CreateEnum
CREATE TYPE "CampaignType" AS ENUM ('WAITLIST', 'AUTO_JOIN');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WaitlistStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'BANNED');

-- CreateEnum
CREATE TYPE "ParticipantRole" AS ENUM ('CREATOR', 'ADMIN', 'MEMBER', 'PENDING', 'NONE');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'AUTO_ACCEPTED');

-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "LeaderboardMetric" AS ENUM ('VIEWS', 'LIKES', 'ENGAGEMENT');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('TIKTOK', 'INSTAGRAM', 'YOUTUBE', 'TWITTER');

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "image" TEXT,
    "createdBy" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "lastStatsRefreshedAt" TIMESTAMP(3),
    "platforms" "Platform"[] DEFAULT ARRAY[]::"Platform"[],
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "clipDuration" TEXT NOT NULL DEFAULT '10s',
    "minResolution" TEXT NOT NULL DEFAULT '1080p',
    "orientation" TEXT,
    "geoRestrictions" TEXT,
    "requirements" TEXT,
    "resources" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "countryOrigin" TEXT,
    "paymentType" "PaymentType" NOT NULL DEFAULT 'CLIP',
    "paymentMethod" TEXT NOT NULL DEFAULT 'Transferencia',
    "basePay" INTEGER NOT NULL DEFAULT 0,
    "rewardPerView" INTEGER DEFAULT 0,
    "totalBudget" INTEGER NOT NULL DEFAULT 0,
    "maxPay" INTEGER DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "approvalTime" TEXT DEFAULT '48h',
    "limitPerEditor" INTEGER DEFAULT 0,
    "limitPerClip" INTEGER DEFAULT 0,
    "limitClipsPerClipper" INTEGER DEFAULT 0,
    "minViewCount" INTEGER DEFAULT 0,
    "editorSlots" INTEGER NOT NULL DEFAULT 5,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "status" "CampaignStatus" NOT NULL DEFAULT 'ACTIVE',
    "approvedClips" INTEGER NOT NULL DEFAULT 0,
    "pendingClips" INTEGER NOT NULL DEFAULT 0,
    "rejectedClips" INTEGER NOT NULL DEFAULT 0,
    "totalViews" INTEGER NOT NULL DEFAULT 0,
    "viewsLast24h" INTEGER NOT NULL DEFAULT 0,
    "remainingBudget" INTEGER NOT NULL DEFAULT 0,
    "spentBudget" INTEGER NOT NULL DEFAULT 0,
    "campaignType" "CampaignType" NOT NULL DEFAULT 'AUTO_JOIN',
    "enableLeaderboard" BOOLEAN NOT NULL DEFAULT false,
    "leaderboardMetric" "LeaderboardMetric" DEFAULT 'VIEWS',
    "leaderboardName" TEXT,
    "leaderboardPrizePool" INTEGER DEFAULT 0,
    "notifyOnApproval" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnSubmission" BOOLEAN NOT NULL DEFAULT true,
    "discordChannelId" TEXT,
    "discordPrivateChannelId" TEXT,
    "creatorRoleId" TEXT,
    "adminRoleId" TEXT,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "areClipsPublic" BOOLEAN NOT NULL DEFAULT true,
    "showParticipantCount" BOOLEAN NOT NULL DEFAULT true,
    "isFunded" BOOLEAN NOT NULL DEFAULT false,
    "platformFee" INTEGER NOT NULL DEFAULT 0,
    "paymentCap" INTEGER DEFAULT 0,
    "paymentCapMetric" "LeaderboardMetric" DEFAULT 'VIEWS',
    "walletAddress" TEXT,
    "walletId" TEXT,
    "txHash" TEXT,
    "walletData" TEXT,
    "studioId" TEXT,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignParticipant" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ParticipantRole" NOT NULL DEFAULT 'MEMBER',
    "status" "InviteStatus" NOT NULL DEFAULT 'ACCEPTED',

    CONSTRAINT "CampaignParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignPermissions" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "adminsCanReviewClips" BOOLEAN NOT NULL DEFAULT true,
    "adminsCanManageTeam" BOOLEAN NOT NULL DEFAULT true,
    "adminsCanEditCampaign" BOOLEAN NOT NULL DEFAULT false,
    "adminsCanAddBudget" BOOLEAN NOT NULL DEFAULT false,
    "adminsCanDeleteCampaign" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignPermissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignApplication" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "CampaignApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignInvite" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "discordUserId" TEXT NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "role" "ParticipantRole" NOT NULL DEFAULT 'MEMBER',

    CONSTRAINT "CampaignInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaderboardEntry" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "editorId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "engagement" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rank" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaderboardEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrizeDistribution" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "reward" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrizeDistribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaitlistQuestion" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaitlistQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaitlistResponse" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "status" "WaitlistStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaitlistResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaitlistBan" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaitlistBan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Campaign_createdBy_idx" ON "Campaign"("createdBy");

-- CreateIndex
CREATE INDEX "Campaign_status_idx" ON "Campaign"("status");

-- CreateIndex
CREATE INDEX "Campaign_studioId_idx" ON "Campaign"("studioId");

-- CreateIndex
CREATE INDEX "CampaignParticipant_userId_idx" ON "CampaignParticipant"("userId");

-- CreateIndex
CREATE INDEX "CampaignParticipant_userId_role_idx" ON "CampaignParticipant"("userId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignParticipant_campaignId_userId_key" ON "CampaignParticipant"("campaignId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignPermissions_campaignId_key" ON "CampaignPermissions"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignApplication_userId_status_idx" ON "CampaignApplication"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignApplication_campaignId_userId_key" ON "CampaignApplication"("campaignId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignInvite_campaignId_discordUserId_key" ON "CampaignInvite"("campaignId", "discordUserId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaderboardEntry_submissionId_key" ON "LeaderboardEntry"("submissionId");

-- CreateIndex
CREATE INDEX "LeaderboardEntry_campaignId_score_idx" ON "LeaderboardEntry"("campaignId", "score");

-- CreateIndex
CREATE INDEX "LeaderboardEntry_editorId_campaignId_idx" ON "LeaderboardEntry"("editorId", "campaignId");

-- CreateIndex
CREATE INDEX "PrizeDistribution_campaignId_idx" ON "PrizeDistribution"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "PrizeDistribution_campaignId_position_key" ON "PrizeDistribution"("campaignId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "WaitlistResponse_campaignId_userId_key" ON "WaitlistResponse"("campaignId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "WaitlistBan_campaignId_userId_key" ON "WaitlistBan"("campaignId", "userId");

-- AddForeignKey
ALTER TABLE "CampaignParticipant" ADD CONSTRAINT "CampaignParticipant_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignPermissions" ADD CONSTRAINT "CampaignPermissions_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignApplication" ADD CONSTRAINT "CampaignApplication_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignInvite" ADD CONSTRAINT "CampaignInvite_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaderboardEntry" ADD CONSTRAINT "LeaderboardEntry_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrizeDistribution" ADD CONSTRAINT "PrizeDistribution_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistQuestion" ADD CONSTRAINT "WaitlistQuestion_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistResponse" ADD CONSTRAINT "WaitlistResponse_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistBan" ADD CONSTRAINT "WaitlistBan_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
