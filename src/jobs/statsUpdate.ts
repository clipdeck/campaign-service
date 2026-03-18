/**
 * statsUpdate job
 *
 * Recalculates and persists leaderboard rankings for all active campaigns
 * that have leaderboards enabled. Rankings are ordered by score descending.
 *
 * Invoked by the stats-update CronJob (every 10 minutes).
 */

import { publisher } from '../lib/events';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';

async function refreshLeaderboardRankings(): Promise<number> {
  const activeCampaigns = await prisma.campaign.findMany({
    where: {
      status: 'ACTIVE',
      enableLeaderboard: true,
    },
    select: { id: true },
  });

  let updatedCount = 0;

  for (const campaign of activeCampaigns) {
    try {
      const entries = await prisma.leaderboardEntry.findMany({
        where: { campaignId: campaign.id },
        orderBy: { score: 'desc' },
        select: { id: true },
      });

      if (entries.length === 0) continue;

      await prisma.$transaction(
        entries.map((entry, index) =>
          prisma.leaderboardEntry.update({
            where: { id: entry.id },
            data: { rank: index + 1 },
          })
        )
      );

      updatedCount++;
    } catch (err) {
      logger.error({ campaignId: campaign.id, error: err }, 'Failed to refresh leaderboard rankings');
    }
  }

  return updatedCount;
}

async function main() {
  logger.info('statsUpdate job started');

  try {
    const updatedCount = await refreshLeaderboardRankings();
    logger.info({ updatedCount }, 'statsUpdate job completed');
  } catch (err) {
    logger.error({ error: err }, 'statsUpdate job failed');
    process.exit(1);
  } finally {
    await publisher.disconnect();
    await prisma.$disconnect();
  }
}

main();
