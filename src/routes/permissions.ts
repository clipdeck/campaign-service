import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth';
import { sendError, notFound, forbidden } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { getParticipantRole } from '../services/participantService';

export async function permissionRoutes(app: FastifyInstance) {
  // GET /campaigns/:id/permissions
  app.get<{ Params: { id: string } }>('/:id/permissions', async (request, reply) => {
    try {
      const permissions = await prisma.campaignPermissions.findUnique({
        where: { campaignId: request.params.id },
      });

      if (!permissions) {
        return {
          adminsCanReviewClips: true,
          adminsCanManageTeam: true,
          adminsCanEditCampaign: false,
          adminsCanAddBudget: false,
          adminsCanDeleteCampaign: false,
        };
      }

      return permissions;
    } catch (error) {
      sendError(reply, error);
    }
  });

  // POST /campaigns/:id/permissions
  app.post<{ Params: { id: string } }>('/:id/permissions', async (request, reply) => {
    try {
      const user = requireAuth(request);
      const role = await getParticipantRole(request.params.id, user.userId);

      if (role !== 'CREATOR' && !user.isStaff) {
        throw forbidden('Only the campaign creator can modify permissions');
      }

      const data = request.body as Record<string, boolean>;
      const permissions = await prisma.campaignPermissions.upsert({
        where: { campaignId: request.params.id },
        update: data,
        create: { campaignId: request.params.id, ...data },
      });

      return permissions;
    } catch (error) {
      sendError(reply, error);
    }
  });
}
