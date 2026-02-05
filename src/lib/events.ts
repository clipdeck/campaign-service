import { createPublisher, CampaignEvents } from '@clipdeck/events';
import type { EventPublisher } from '@clipdeck/events';
import { config } from '../config';
import { logger } from './logger';

const SERVICE_NAME = 'campaign-service';

export const publisher: EventPublisher = createPublisher({
  serviceName: SERVICE_NAME,
  connectionUrl: config.rabbitmqUrl,
  exchange: config.eventExchange,
  enableLogging: true,
  logger: {
    info: (msg, data) => logger.info(data, msg),
    error: (msg, err) => logger.error(err, msg),
    debug: (msg, data) => logger.debug(data, msg),
  },
});

export { CampaignEvents, SERVICE_NAME };
