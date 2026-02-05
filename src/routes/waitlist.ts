import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth';
import { sendError } from '../lib/errors';
import * as waitlistService from '../services/waitlistService';

export async function waitlistRoutes(app: FastifyInstance) {
  // GET /campaigns/:id/waitlist/questions
  app.get<{ Params: { id: string } }>('/:id/waitlist/questions', async (request, reply) => {
    try {
      const questions = await waitlistService.getWaitlistQuestions(request.params.id);
      return { questions };
    } catch (error) {
      sendError(reply, error);
    }
  });

  // POST /campaigns/:id/waitlist/questions
  app.post<{ Params: { id: string } }>('/:id/waitlist/questions', async (request, reply) => {
    try {
      const user = requireAuth(request);
      const { questions } = request.body as { questions: Array<{ question: string; order?: number }> };
      const result = await waitlistService.setWaitlistQuestions(
        request.params.id,
        questions,
        user
      );
      return { questions: result };
    } catch (error) {
      sendError(reply, error);
    }
  });

  // GET /campaigns/:id/waitlist/responses
  app.get<{ Params: { id: string } }>('/:id/waitlist/responses', async (request, reply) => {
    try {
      const user = requireAuth(request);
      const query = request.query as { status?: string };
      const responses = await waitlistService.getWaitlistResponses(
        request.params.id,
        user,
        { status: query.status }
      );
      return { responses };
    } catch (error) {
      sendError(reply, error);
    }
  });

  // POST /campaigns/:id/waitlist/review
  app.post<{ Params: { id: string } }>('/:id/waitlist/review', async (request, reply) => {
    try {
      const user = requireAuth(request);
      const { userId, action, note } = request.body as {
        userId: string;
        action: 'APPROVED' | 'REJECTED';
        note?: string;
      };
      const result = await waitlistService.reviewWaitlistResponse(
        request.params.id,
        userId,
        action,
        user,
        note
      );
      return result;
    } catch (error) {
      sendError(reply, error);
    }
  });
}
