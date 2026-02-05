import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth';
import { sendError } from '../lib/errors';
import * as participantService from '../services/participantService';

export async function participantRoutes(app: FastifyInstance) {
  // POST /campaigns/:id/join - Join campaign
  app.post<{ Params: { id: string } }>('/:id/join', async (request, reply) => {
    try {
      const user = requireAuth(request);
      const body = request.body as { answers?: Record<string, any> };
      const result = await participantService.joinCampaign(
        request.params.id,
        user,
        body.answers
      );
      return result;
    } catch (error) {
      sendError(reply, error);
    }
  });

  // POST /campaigns/:id/approve - Approve waitlist participant
  app.post<{ Params: { id: string } }>('/:id/approve', async (request, reply) => {
    try {
      const user = requireAuth(request);
      const { userId } = request.body as { userId: string };
      const result = await participantService.approveParticipant(
        request.params.id,
        userId,
        user
      );
      return result;
    } catch (error) {
      sendError(reply, error);
    }
  });

  // GET /campaigns/:id/team - Get team members
  app.get<{ Params: { id: string } }>('/:id/team', async (request, reply) => {
    try {
      requireAuth(request);
      const members = await participantService.getTeamMembers(request.params.id);
      return { members };
    } catch (error) {
      sendError(reply, error);
    }
  });

  // POST /campaigns/:id/team/manage - Manage participant
  app.post<{ Params: { id: string } }>('/:id/team/manage', async (request, reply) => {
    try {
      const user = requireAuth(request);
      const { userId, action } = request.body as { userId: string; action: 'PROMOTE' | 'DEMOTE' | 'REMOVE' };
      const result = await participantService.manageParticipant(
        request.params.id,
        userId,
        action,
        user
      );
      return result;
    } catch (error) {
      sendError(reply, error);
    }
  });

  // DELETE /campaigns/:id/team/:userId - Remove team member
  app.delete<{ Params: { id: string; userId: string } }>(
    '/:id/team/:userId',
    async (request, reply) => {
      try {
        const user = requireAuth(request);
        await participantService.removeParticipant(
          request.params.id,
          request.params.userId,
          user
        );
        reply.status(204);
      } catch (error) {
        sendError(reply, error);
      }
    }
  );

  // POST /campaigns/:id/participants/:userId/ban - Ban participant
  app.post<{ Params: { id: string; userId: string } }>(
    '/:id/participants/:userId/ban',
    async (request, reply) => {
      try {
        const user = requireAuth(request);
        const { reason } = (request.body as { reason?: string }) ?? {};
        await participantService.banParticipant(
          request.params.id,
          request.params.userId,
          user,
          reason
        );
        return { success: true };
      } catch (error) {
        sendError(reply, error);
      }
    }
  );
}
