import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { config } from './config';
import { logger } from './lib/logger';
import { campaignRoutes } from './routes/campaigns';
import { participantRoutes } from './routes/participants';
import { waitlistRoutes } from './routes/waitlist';
import { permissionRoutes } from './routes/permissions';
import { analyticsRoutes } from './routes/analytics';
import { leaderboardRoutes } from './routes/leaderboard';
import { publisher } from './lib/events';

async function main() {
  const app = Fastify({
    logger: logger as any,
  });

  // Plugins
  await app.register(cors, {
    origin: config.allowedOrigins,
    credentials: true,
  });
  await app.register(helmet);

  // Health check
  app.get('/health', async () => ({ status: 'ok', service: 'campaign-service' }));
  app.get('/ready', async () => {
    // Could add DB connectivity check here
    return { status: 'ready', service: 'campaign-service' };
  });

  // Routes
  await app.register(campaignRoutes, { prefix: '/campaigns' });
  await app.register(participantRoutes, { prefix: '/campaigns' });
  await app.register(waitlistRoutes, { prefix: '/campaigns' });
  await app.register(permissionRoutes, { prefix: '/campaigns' });
  await app.register(analyticsRoutes, { prefix: '/campaigns' });
  await app.register(leaderboardRoutes, { prefix: '/campaigns' });

  // Connect event publisher
  await publisher.connect();

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');
    await publisher.disconnect();
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // Start server
  await app.listen({ port: config.port, host: config.host });
  logger.info(`Campaign service listening on ${config.host}:${config.port}`);
}

main().catch((err) => {
  logger.error(err, 'Failed to start campaign service');
  process.exit(1);
});
