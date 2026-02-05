import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth';
import { sendError, notFound, badRequest } from '../lib/errors';
import { prisma } from '../lib/prisma';

export async function leaderboardRoutes(app: FastifyInstance) {
  // GET /campaigns/:id/leaderboard
  app.get<{ Params: { id: string } }>('/:id/leaderboard', async (request, reply) => {
    try {
      const campaign = await prisma.campaign.findUnique({
        where: { id: request.params.id },
        select: { enableLeaderboard: true },
      });

      if (!campaign) throw notFound(`Campaign ${request.params.id} not found`);
      if (!campaign.enableLeaderboard) throw badRequest('Leaderboard is not enabled for this campaign');

      const entries = await prisma.leaderboardEntry.findMany({
        where: { campaignId: request.params.id },
        orderBy: { score: 'desc' },
      });

      return { leaderboard: entries };
    } catch (error) {
      sendError(reply, error);
    }
  });

  // GET /campaigns/:id/prizes
  app.get<{ Params: { id: string } }>('/:id/prizes', async (request, reply) => {
    try {
      const prizes = await prisma.prizeDistribution.findMany({
        where: { campaignId: request.params.id },
        orderBy: { position: 'asc' },
      });
      return { prizes };
    } catch (error) {
      sendError(reply, error);
    }
  });
}
