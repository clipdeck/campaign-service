import { prisma } from '../lib/prisma';
import { publisher, CampaignEvents, SERVICE_NAME } from '../lib/events';
import { notFound, badRequest, forbidden, conflict } from '../lib/errors';
import { logger } from '../lib/logger';
import type { AuthUser } from '../middleware/auth';

/**
 * Get campaign participant role for a user
 */
export async function getParticipantRole(campaignId: string, userId: string) {
  const participant = await prisma.campaignParticipant.findUnique({
    where: { campaignId_userId: { campaignId, userId } },
  });
  return participant?.role ?? null;
}

/**
 * Join a campaign
 */
export async function joinCampaign(
  campaignId: string,
  user: AuthUser,
  answers?: Record<string, any>
) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      _count: { select: { participants: true } },
    },
  });

  if (!campaign) throw notFound(`Campaign ${campaignId} not found`);
  if (campaign.status !== 'ACTIVE') throw badRequest('Campaign is not active');

  // Check if already a participant
  const existing = await prisma.campaignParticipant.findUnique({
    where: { campaignId_userId: { campaignId, userId: user.userId } },
  });
  if (existing) throw conflict('Already a participant in this campaign');

  // Check banned
  const banned = await prisma.waitlistBan.findUnique({
    where: { campaignId_userId: { campaignId, userId: user.userId } },
  });
  if (banned) throw forbidden('You are banned from this campaign');

  const isAutoJoin = campaign.campaignType === 'AUTO_JOIN';
  const role = isAutoJoin ? 'MEMBER' : 'PENDING';

  // Check slots for auto-join
  if (isAutoJoin && campaign._count.participants >= campaign.editorSlots) {
    throw forbidden('Campaign is full');
  }

  // Create participant
  await prisma.campaignParticipant.create({
    data: { campaignId, userId: user.userId, role },
  });

  // Save waitlist responses if provided
  if (!isAutoJoin && answers) {
    await prisma.waitlistResponse.create({
      data: {
        campaignId,
        userId: user.userId,
        answers,
        status: 'PENDING',
      },
    });
  }

  // Publish event
  const event = CampaignEvents.participantJoined(
    {
      campaignId,
      userId: user.userId,
      role: role as any,
      joinMethod: isAutoJoin ? 'DIRECT' : 'WAITLIST',
    },
    SERVICE_NAME
  );
  await publisher.publish(event);

  logger.info({ campaignId, userId: user.userId, role }, 'Participant joined');
  return { role, campaignType: campaign.campaignType };
}

/**
 * Approve a waitlist participant
 */
export async function approveParticipant(
  campaignId: string,
  targetUserId: string,
  user: AuthUser
) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { _count: { select: { participants: true } } },
  });
  if (!campaign) throw notFound(`Campaign ${campaignId} not found`);

  // Verify requester has permission
  const requesterRole = await getParticipantRole(campaignId, user.userId);
  if (requesterRole !== 'CREATOR' && requesterRole !== 'ADMIN' && !user.isStaff) {
    throw forbidden('You do not have permission to approve participants');
  }

  // Check slots
  if (campaign._count.participants >= campaign.editorSlots) {
    throw forbidden('Campaign is full');
  }

  // Update to MEMBER
  const updated = await prisma.campaignParticipant.update({
    where: { campaignId_userId: { campaignId, userId: targetUserId } },
    data: { role: 'MEMBER' },
  });

  // Update waitlist response
  await prisma.waitlistResponse.updateMany({
    where: { campaignId, userId: targetUserId },
    data: { status: 'APPROVED', reviewedBy: user.userId, reviewedAt: new Date() },
  });

  const event = CampaignEvents.participantJoined(
    {
      campaignId,
      userId: targetUserId,
      role: 'MEMBER',
      joinMethod: 'WAITLIST',
    },
    SERVICE_NAME
  );
  await publisher.publish(event);

  return updated;
}

/**
 * Remove a participant from a campaign
 */
export async function removeParticipant(
  campaignId: string,
  targetUserId: string,
  user: AuthUser,
  reason?: string
) {
  const requesterRole = await getParticipantRole(campaignId, user.userId);
  if (requesterRole !== 'CREATOR' && !user.isStaff) {
    throw forbidden('Only the campaign creator can remove participants');
  }

  if (targetUserId === user.userId) {
    throw badRequest('Cannot remove yourself');
  }

  await prisma.campaignParticipant.delete({
    where: { campaignId_userId: { campaignId, userId: targetUserId } },
  });

  const event = CampaignEvents.participantLeft(
    {
      campaignId,
      userId: targetUserId,
      reason: reason === 'ban' ? 'BANNED' : 'KICKED',
    },
    SERVICE_NAME
  );
  await publisher.publish(event);

  logger.info({ campaignId, targetUserId, by: user.userId }, 'Participant removed');
}

/**
 * Ban a participant from a campaign
 */
export async function banParticipant(
  campaignId: string,
  targetUserId: string,
  user: AuthUser,
  reason?: string
) {
  const requesterRole = await getParticipantRole(campaignId, user.userId);
  if (requesterRole !== 'CREATOR' && requesterRole !== 'ADMIN' && !user.isStaff) {
    throw forbidden('You do not have permission to ban participants');
  }

  // Create ban record
  await prisma.waitlistBan.create({
    data: { campaignId, userId: targetUserId, reason },
  });

  // Remove participant
  await prisma.campaignParticipant.deleteMany({
    where: { campaignId, userId: targetUserId },
  });

  // Reject any pending applications
  await prisma.campaignApplication.updateMany({
    where: { campaignId, userId: targetUserId, status: 'PENDING' },
    data: { status: 'REJECTED', decidedAt: new Date() },
  });

  const event = CampaignEvents.participantLeft(
    { campaignId, userId: targetUserId, reason: 'BANNED' },
    SERVICE_NAME
  );
  await publisher.publish(event);

  logger.info({ campaignId, targetUserId, by: user.userId }, 'Participant banned');
}

/**
 * Get team members for a campaign
 */
export async function getTeamMembers(campaignId: string) {
  return prisma.campaignParticipant.findMany({
    where: { campaignId },
    orderBy: { role: 'asc' },
  });
}

/**
 * Manage participant role (promote/demote)
 */
export async function manageParticipant(
  campaignId: string,
  targetUserId: string,
  action: 'PROMOTE' | 'DEMOTE' | 'REMOVE',
  user: AuthUser
) {
  const requesterRole = await getParticipantRole(campaignId, user.userId);
  if (requesterRole !== 'CREATOR' && !user.isStaff) {
    throw forbidden('Only the campaign creator can manage participants');
  }

  if (action === 'REMOVE') {
    return removeParticipant(campaignId, targetUserId, user);
  }

  const newRole = action === 'PROMOTE' ? 'ADMIN' : 'MEMBER';

  return prisma.campaignParticipant.update({
    where: { campaignId_userId: { campaignId, userId: targetUserId } },
    data: { role: newRole },
  });
}
