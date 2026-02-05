import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth';
import { sendError } from '../lib/errors';
import * as campaignService from '../services/campaignService';

export async function campaignRoutes(app: FastifyInstance) {
  // GET /campaigns - List campaigns
  app.get('/', async (request, reply) => {
    try {
      const query = request.query as Record<string, string>;
      const result = await campaignService.listCampaigns({
        status: query.status,
        studioId: query.studioId,
        createdBy: query.createdBy,
        published: query.published === 'true' ? true : query.published === 'false' ? false : undefined,
        page: query.page ? parseInt(query.page, 10) : undefined,
        limit: query.limit ? parseInt(query.limit, 10) : undefined,
      });
      return result;
    } catch (error) {
      sendError(reply, error);
    }
  });

  // GET /campaigns/:id - Get campaign
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const campaign = await campaignService.getCampaign(request.params.id);
      return campaign;
    } catch (error) {
      sendError(reply, error);
    }
  });

  // POST /campaigns - Create campaign
  app.post('/', async (request, reply) => {
    try {
      const user = requireAuth(request);
      const campaign = await campaignService.createCampaign(request.body as any, user);
      reply.status(201);
      return campaign;
    } catch (error) {
      sendError(reply, error);
    }
  });

  // PATCH /campaigns/:id - Update campaign
  app.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const user = requireAuth(request);
      const updated = await campaignService.updateCampaign(
        request.params.id,
        request.body as any,
        user
      );
      return updated;
    } catch (error) {
      sendError(reply, error);
    }
  });

  // DELETE /campaigns/:id - Delete campaign
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const user = requireAuth(request);
      await campaignService.deleteCampaign(request.params.id, user);
      reply.status(204);
    } catch (error) {
      sendError(reply, error);
    }
  });

  // POST /campaigns/:id/close - Close campaign
  app.post<{ Params: { id: string } }>('/:id/close', async (request, reply) => {
    try {
      const user = requireAuth(request);
      const result = await campaignService.closeCampaign(request.params.id, user);
      return result;
    } catch (error) {
      sendError(reply, error);
    }
  });

  // POST /campaigns/:id/fund - Fund campaign
  app.post<{ Params: { id: string } }>('/:id/fund', async (request, reply) => {
    try {
      const user = requireAuth(request);
      const result = await campaignService.fundCampaign(request.params.id, user);
      return result;
    } catch (error) {
      sendError(reply, error);
    }
  });
}
