/**
 * autoClose job
 *
 * Finds all ACTIVE campaigns whose endDate is in the past and transitions
 * them to ENDED, publishing a CampaignEnded event for each one.
 *
 * Invoked by the campaign-auto-close CronJob (every 15 minutes).
 */

import { autoCloseCampaigns } from '../services/campaignService';
import { publisher } from '../lib/events';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';

async function main() {
  logger.info('autoClose job started');

  try {
    const closedCount = await autoCloseCampaigns();
    logger.info({ closedCount }, 'autoClose job completed');
  } catch (err) {
    logger.error({ error: err }, 'autoClose job failed');
    process.exit(1);
  } finally {
    await publisher.disconnect();
    await prisma.$disconnect();
  }
}

main();
