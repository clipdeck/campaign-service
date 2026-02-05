import { prisma } from '../lib/prisma';
import { publisher, CampaignEvents, SERVICE_NAME } from '../lib/events';
import { notFound, badRequest, forbidden, conflict } from '../lib/errors';
import { logger } from '../lib/logger';
import type { AuthUser } from '../middleware/auth';
import type { Prisma } from '@prisma/client';

/**
 * Map platform strings to enum values
 */
export function mapPlatforms(platforms: string[]): ('TIKTOK' | 'INSTAGRAM' | 'YOUTUBE' | 'TWITTER')[] {
  return platforms.map((p) => {
    const v = p.toLowerCase();
    if (v.includes('tiktok') || v === 'tik tok') return 'TIKTOK';
    if (v.includes('instagram') || v === 'insta') return 'INSTAGRAM';
    if (v.includes('youtube') || v === 'yt') return 'YOUTUBE';
    if (v.includes('twitter') || v === 'x') return 'TWITTER';
    throw badRequest(`Invalid platform: ${p}`);
  });
}

/**
 * List campaigns with filters
 */
export async function listCampaigns(filters: {
  status?: string;
  studioId?: string;
  createdBy?: string;
  published?: boolean;
  page?: number;
  limit?: number;
}) {
  const { status, studioId, createdBy, published, page = 1, limit = 20 } = filters;
  const skip = (page - 1) * limit;

  const where: Prisma.CampaignWhereInput = {};
  if (status) where.status = status as any;
  if (studioId) where.studioId = studioId;
  if (createdBy) where.createdBy = createdBy;
  if (published !== undefined) where.published = published;

  const [campaigns, total] = await Promise.all([
    prisma.campaign.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        prizeDistributions: true,
        _count: { select: { participants: true, applications: true } },
      },
    }),
    prisma.campaign.count({ where }),
  ]);

  return { campaigns, total, page, limit, totalPages: Math.ceil(total / limit) };
}

/**
 * Get campaign by ID
 */
export async function getCampaign(id: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: {
      prizeDistributions: true,
      permissions: true,
      _count: { select: { participants: true, applications: true } },
    },
  });

  if (!campaign) throw notFound(`Campaign ${id} not found`);
  return campaign;
}

/**
 * Create a new campaign
 */
export async function createCampaign(
  data: {
    title: string;
    description: string;
    category: string;
    image?: string | null;
    platforms: string[];
    startDate: string | Date;
    endDate: string | Date;
    tags?: string[];
    approvalTime?: string;
    hashtags?: string[];
    languages?: string[];
    paymentType?: string;
    paymentMethod?: string;
    clipDuration?: string;
    minResolution?: string;
    basePay?: number;
    rewardPerView?: number;
    totalBudget?: number;
    maxPay?: number;
    currency?: string;
    limitPerEditor?: number;
    limitPerClip?: number;
    limitClipsPerClipper?: number;
    minViewCount?: number;
    countryOrigin?: string | null;
    geoRestrictions?: string;
    campaignType?: string;
    editorSlots?: number;
    requirements?: string;
    resources?: string[];
    enableLeaderboard?: boolean;
    leaderboardRanks?: Array<{ position: string; reward: number }>;
    isPrivate?: boolean;
    areClipsPublic?: boolean;
    paymentCap?: number;
    paymentCapMetric?: string;
    studioId?: string | null;
    invitedUsers?: string[];
    campaignAdmins?: Array<{ userId: string; discordId: string }>;
  },
  creator: AuthUser
) {
  const platforms = mapPlatforms(data.platforms);

  const campaign = await prisma.campaign.create({
    data: {
      title: data.title,
      description: data.description,
      category: data.category,
      image: data.image ?? null,
      platforms,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      tags: data.tags ?? [],
      approvalTime: data.approvalTime ?? '48h',
      hashtags: data.hashtags ?? [],
      languages: data.languages ?? [],
      paymentType: (data.paymentType as any) ?? 'CLIP',
      paymentMethod: data.paymentMethod ?? 'Transferencia',
      clipDuration: data.clipDuration ?? '10s',
      minResolution: data.minResolution ?? '1080p',
      basePay: data.basePay ?? 0,
      rewardPerView: data.rewardPerView ?? 0,
      totalBudget: data.totalBudget ?? 0,
      maxPay: data.maxPay ?? 0,
      currency: data.currency ?? 'USD',
      limitPerEditor: data.limitPerEditor ?? 0,
      limitPerClip: data.limitPerClip ?? 0,
      limitClipsPerClipper: data.limitClipsPerClipper ?? 0,
      minViewCount: data.minViewCount ?? 0,
      countryOrigin: data.countryOrigin ?? null,
      geoRestrictions: data.geoRestrictions ?? '',
      campaignType: (data.campaignType as any) ?? 'AUTO_JOIN',
      editorSlots: data.editorSlots ?? 5,
      requirements: data.requirements,
      resources: data.resources ?? [],
      enableLeaderboard: data.enableLeaderboard ?? false,
      isPrivate: data.isPrivate ?? false,
      areClipsPublic: data.areClipsPublic ?? true,
      paymentCap: data.paymentCap ?? 0,
      paymentCapMetric: (data.paymentCapMetric as any) ?? undefined,
      createdBy: creator.userId,
      studioId: data.studioId ?? null,
      published: false,
    },
  });

  // Add creator as participant
  await prisma.campaignParticipant.create({
    data: {
      campaignId: campaign.id,
      userId: creator.userId,
      role: 'CREATOR',
    },
  });

  // Create prize distributions if leaderboard enabled
  if (data.enableLeaderboard && data.leaderboardRanks?.length) {
    for (let i = 0; i < data.leaderboardRanks.length; i++) {
      const rank = data.leaderboardRanks[i];
      await prisma.prizeDistribution.create({
        data: {
          campaignId: campaign.id,
          position: i + 1,
          reward: rank.reward,
          label: rank.position,
        },
      });
    }
  }

  // Create invites for private campaigns
  if (data.isPrivate && data.invitedUsers?.length) {
    for (const discordUserId of data.invitedUsers) {
      await prisma.campaignInvite.create({
        data: { campaignId: campaign.id, discordUserId, status: 'PENDING' },
      });
    }
  }

  // Publish event
  const event = CampaignEvents.created(
    {
      campaignId: campaign.id,
      ownerId: creator.userId,
      title: campaign.title,
      status: campaign.status,
      studioId: campaign.studioId ?? undefined,
    },
    SERVICE_NAME
  );
  await publisher.publish(event);

  logger.info({ campaignId: campaign.id }, 'Campaign created');
  return campaign;
}

/**
 * Update an existing campaign
 */
export async function updateCampaign(
  id: string,
  data: Record<string, any>,
  user: AuthUser
) {
  const campaign = await getCampaign(id);

  // Check permission
  const participant = await prisma.campaignParticipant.findUnique({
    where: { campaignId_userId: { campaignId: id, userId: user.userId } },
  });

  const isCreator = participant?.role === 'CREATOR';
  const isAdmin = participant?.role === 'ADMIN';

  if (!isCreator && !isAdmin && !user.isStaff) {
    throw forbidden('You do not have permission to edit this campaign');
  }

  if (isAdmin) {
    const permissions = campaign.permissions;
    if (!permissions?.adminsCanEditCampaign) {
      throw forbidden('Admins do not have permission to edit this campaign');
    }
  }

  // Handle prize distributions update
  if (data.prizeDistributions) {
    await prisma.prizeDistribution.deleteMany({ where: { campaignId: id } });
    for (let i = 0; i < data.prizeDistributions.length; i++) {
      const rank = data.prizeDistributions[i];
      await prisma.prizeDistribution.create({
        data: {
          campaignId: id,
          position: i + 1,
          reward: rank.reward,
          label: rank.position,
        },
      });
    }
    delete data.prizeDistributions;
  }

  const oldStatus = campaign.status;
  const updated = await prisma.campaign.update({
    where: { id },
    data,
    include: { prizeDistributions: true },
  });

  // Publish status change event if status changed
  if (data.status && data.status !== oldStatus) {
    const event = CampaignEvents.statusChanged(
      {
        campaignId: id,
        oldStatus,
        newStatus: data.status,
        changedBy: user.userId,
      },
      SERVICE_NAME
    );
    await publisher.publish(event);
  }

  return updated;
}

/**
 * Delete a campaign
 */
export async function deleteCampaign(id: string, user: AuthUser) {
  const campaign = await getCampaign(id);

  const participant = await prisma.campaignParticipant.findUnique({
    where: { campaignId_userId: { campaignId: id, userId: user.userId } },
  });

  const isCreator = participant?.role === 'CREATOR';

  if (!isCreator && !user.isStaff) {
    const permissions = campaign.permissions;
    if (!permissions?.adminsCanDeleteCampaign) {
      throw forbidden('You do not have permission to delete this campaign');
    }
  }

  await prisma.campaign.delete({ where: { id } });
  logger.info({ campaignId: id }, 'Campaign deleted');
}

/**
 * Close/end a campaign
 */
export async function closeCampaign(id: string, user: AuthUser) {
  const campaign = await getCampaign(id);

  if (campaign.status === 'ENDED') {
    throw conflict('Campaign is already ended');
  }

  const participant = await prisma.campaignParticipant.findUnique({
    where: { campaignId_userId: { campaignId: id, userId: user.userId } },
  });

  if (participant?.role !== 'CREATOR' && !user.isStaff) {
    throw forbidden('Only the campaign creator can close a campaign');
  }

  const updated = await prisma.campaign.update({
    where: { id },
    data: {
      status: 'ENDED',
      archivedAt: new Date(),
    },
  });

  // Publish campaign ended event
  const event = CampaignEvents.ended(
    {
      campaignId: id,
      endReason: 'MANUAL',
      hasLeaderboard: campaign.enableLeaderboard,
      totalClips: campaign.approvedClips,
      totalViews: campaign.totalViews,
      totalPaid: campaign.spentBudget,
    },
    SERVICE_NAME
  );
  await publisher.publish(event);

  logger.info({ campaignId: id }, 'Campaign closed');
  return updated;
}

/**
 * Fund a campaign
 */
export async function fundCampaign(id: string, user: AuthUser) {
  const campaign = await getCampaign(id);

  if (campaign.createdBy !== user.userId && !user.isStaff) {
    throw forbidden('Only the campaign creator can fund a campaign');
  }

  if (campaign.isFunded) {
    throw conflict('Campaign is already funded');
  }

  const platformFee = Math.round(campaign.totalBudget * 0.1);

  const updated = await prisma.campaign.update({
    where: { id },
    data: {
      isFunded: true,
      platformFee,
      remainingBudget: campaign.totalBudget - platformFee,
    },
  });

  // Publish funded event
  const event = CampaignEvents.funded(
    {
      campaignId: id,
      amount: campaign.totalBudget,
      totalBudget: campaign.totalBudget,
      fundedBy: user.userId,
    },
    SERVICE_NAME
  );
  await publisher.publish(event);

  logger.info({ campaignId: id, fee: platformFee }, 'Campaign funded');
  return updated;
}

/**
 * Auto-close campaigns that have passed their end date
 */
export async function autoCloseCampaigns() {
  const now = new Date();
  const expiredCampaigns = await prisma.campaign.findMany({
    where: {
      status: 'ACTIVE',
      endDate: { lt: now },
    },
    select: { id: true, enableLeaderboard: true, approvedClips: true, totalViews: true, spentBudget: true },
  });

  let closedCount = 0;

  for (const campaign of expiredCampaigns) {
    try {
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: 'ENDED', archivedAt: now },
      });

      const event = CampaignEvents.ended(
        {
          campaignId: campaign.id,
          endReason: 'DATE_REACHED',
          hasLeaderboard: campaign.enableLeaderboard,
          totalClips: campaign.approvedClips,
          totalViews: campaign.totalViews,
          totalPaid: campaign.spentBudget,
        },
        SERVICE_NAME
      );
      await publisher.publish(event);

      closedCount++;
    } catch (err) {
      logger.error({ campaignId: campaign.id, error: err }, 'Failed to auto-close campaign');
    }
  }

  return closedCount;
}
