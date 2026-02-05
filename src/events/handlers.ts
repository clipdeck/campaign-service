import { createConsumer, withRetry, withLogging } from '@clipdeck/events';
import type { EventConsumer } from '@clipdeck/events';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { config } from '../config';

let consumer: EventConsumer | null = null;

/**
 * Set up event handlers for events this service consumes from other services
 */
export async function setupEventHandlers() {
  consumer = createConsumer({
    serviceName: 'campaign-service',
    connectionUrl: config.rabbitmqUrl,
    exchange: config.eventExchange,
    queueName: 'campaign.events',
    routingKeys: ['clip.submitted', 'clip.approved', 'clip.rejected', 'stats.updated'],
    enableLogging: true,
    logger: {
      info: (msg, data) => logger.info(data, msg),
      error: (msg, err) => logger.error(err, msg),
      debug: (msg, data) => logger.debug(data, msg),
    },
  });

  // Handle clip submission stats updates from Clip Service
  consumer.on(
    'stats.updated',
    withRetry(
      withLogging(async (event, ctx) => {
        // Update campaign denormalized stats when clip stats change
        // This would update totalViews, etc. based on aggregated clip data
        logger.debug({ event: event.type, clipId: event.payload.clipId }, 'Stats update received');
        ctx.ack();
      })
    )
  );

  // Handle clip status changes from Clip Service
  consumer.on(
    'clip.approved',
    withRetry(
      withLogging(async (event, ctx) => {
        const { campaignId } = event.payload;
        await prisma.campaign.update({
          where: { id: campaignId },
          data: { approvedClips: { increment: 1 } },
        });
        ctx.ack();
      })
    )
  );

  consumer.on(
    'clip.rejected',
    withRetry(
      withLogging(async (event, ctx) => {
        const { campaignId } = event.payload;
        await prisma.campaign.update({
          where: { id: campaignId },
          data: { rejectedClips: { increment: 1 } },
        });
        ctx.ack();
      })
    )
  );

  consumer.on(
    'clip.submitted',
    withRetry(
      withLogging(async (event, ctx) => {
        const { campaignId } = event.payload;
        await prisma.campaign.update({
          where: { id: campaignId },
          data: { pendingClips: { increment: 1 } },
        });
        ctx.ack();
      })
    )
  );

  await consumer.start();
  logger.info('Event handlers started');
}

export async function stopEventHandlers() {
  if (consumer) {
    await consumer.stop();
    consumer = null;
  }
}
