import type { FastifyInstance } from 'fastify';
import { requireAuth, getAuthUser } from '../middleware/auth';
import { sendError, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';

export async function analyticsRoutes(app: FastifyInstance) {
  // GET /campaigns/:id/stats - Public stats
  app.get<{ Params: { id: string } }>('/:id/stats', async (request, reply) => {
    try {
      const campaign = await prisma.campaign.findUnique({
        where: { id: request.params.id },
        select: {
          id: true,
          totalViews: true,
          viewsLast24h: true,
          approvedClips: true,
          pendingClips: true,
          rejectedClips: true,
          startDate: true,
          endDate: true,
          status: true,
          totalBudget: true,
          lastStatsRefreshedAt: true,
          showParticipantCount: true,
          _count: { select: { participants: true } },
        },
      });

      if (!campaign) throw notFound(`Campaign ${request.params.id} not found`);

      return {
        totalViews: campaign.totalViews,
        totalSubmissions: campaign.approvedClips + campaign.pendingClips + campaign.rejectedClips,
        approvedSubmissions: campaign.approvedClips,
        campaignStartDate: campaign.startDate,
        campaignEndDate: campaign.endDate,
        isActive: campaign.status === 'ACTIVE',
        lastStatsRefreshedAt: campaign.lastStatsRefreshedAt,
        participantsCount: campaign._count.participants,
        showParticipantCount: campaign.showParticipantCount,
        totalBudget: campaign.totalBudget,
      };
    } catch (error) {
      sendError(reply, error);
    }
  });
}
