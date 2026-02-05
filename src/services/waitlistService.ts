import { prisma } from '../lib/prisma';
import { notFound, forbidden } from '../lib/errors';
import type { AuthUser } from '../middleware/auth';
import { getParticipantRole } from './participantService';

/**
 * Get waitlist questions for a campaign
 */
export async function getWaitlistQuestions(campaignId: string) {
  return prisma.waitlistQuestion.findMany({
    where: { campaignId },
    orderBy: { order: 'asc' },
  });
}

/**
 * Set waitlist questions for a campaign
 */
export async function setWaitlistQuestions(
  campaignId: string,
  questions: Array<{ question: string; order?: number }>,
  user: AuthUser
) {
  const role = await getParticipantRole(campaignId, user.userId);
  if (role !== 'CREATOR' && !user.isStaff) {
    throw forbidden('Only the creator can manage waitlist questions');
  }

  // Replace all questions
  await prisma.waitlistQuestion.deleteMany({ where: { campaignId } });

  const created = [];
  for (let i = 0; i < questions.length; i++) {
    const q = await prisma.waitlistQuestion.create({
      data: {
        campaignId,
        question: questions[i].question,
        order: questions[i].order ?? i + 1,
      },
    });
    created.push(q);
  }

  return created;
}

/**
 * Get waitlist responses for a campaign
 */
export async function getWaitlistResponses(
  campaignId: string,
  user: AuthUser,
  filters?: { status?: string }
) {
  const role = await getParticipantRole(campaignId, user.userId);
  if (role !== 'CREATOR' && role !== 'ADMIN' && !user.isStaff) {
    throw forbidden('You do not have permission to view waitlist responses');
  }

  const where: any = { campaignId };
  if (filters?.status) where.status = filters.status;

  return prisma.waitlistResponse.findMany({
    where,
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Review a waitlist response (approve/reject)
 */
export async function reviewWaitlistResponse(
  campaignId: string,
  responseUserId: string,
  action: 'APPROVED' | 'REJECTED',
  user: AuthUser,
  note?: string
) {
  const role = await getParticipantRole(campaignId, user.userId);
  if (role !== 'CREATOR' && role !== 'ADMIN' && !user.isStaff) {
    throw forbidden('You do not have permission to review waitlist responses');
  }

  const response = await prisma.waitlistResponse.findUnique({
    where: { campaignId_userId: { campaignId, userId: responseUserId } },
  });

  if (!response) throw notFound('Waitlist response not found');

  return prisma.waitlistResponse.update({
    where: { campaignId_userId: { campaignId, userId: responseUserId } },
    data: {
      status: action,
      reviewedBy: user.userId,
      reviewedAt: new Date(),
      note,
    },
  });
}
