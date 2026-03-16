-- Performance indexes for campaign-service
-- Migration: 20260316000001_indexes

-- Campaign: sort/paginate by creation date (browse, dashboard listings)
CREATE INDEX CONCURRENTLY "Campaign_createdAt_idx" ON "Campaign"("createdAt" DESC);

-- Campaign: filter by status then sort by date (active/ended campaigns browse)
CREATE INDEX CONCURRENTLY "Campaign_status_createdAt_idx" ON "Campaign"("status", "createdAt" DESC);

-- Campaign: filter by end date (upcoming deadlines, auto-close cron jobs)
CREATE INDEX CONCURRENTLY "Campaign_endDate_idx" ON "Campaign"("endDate");

-- CampaignInvite: FK lookup — campaignId is a FK but has no dedicated index
-- (the unique key on (campaignId, discordUserId) covers single-row lookups but
--  a plain campaignId index is needed for efficient cascade deletes and list queries)
CREATE INDEX CONCURRENTLY "CampaignInvite_campaignId_idx" ON "CampaignInvite"("campaignId");

-- CampaignInvite: filter by status for pending invites per campaign
CREATE INDEX CONCURRENTLY "CampaignInvite_campaignId_status_idx" ON "CampaignInvite"("campaignId", "status");

-- WaitlistQuestion: FK lookup — list questions for a campaign (ordered display)
CREATE INDEX CONCURRENTLY "WaitlistQuestion_campaignId_idx" ON "WaitlistQuestion"("campaignId");

-- WaitlistResponse: review queue — filter pending/approved responses per campaign
CREATE INDEX CONCURRENTLY "WaitlistResponse_campaignId_status_idx" ON "WaitlistResponse"("campaignId", "status");

-- WaitlistBan: FK lookup — check if a user is banned from a campaign's waitlist
CREATE INDEX CONCURRENTLY "WaitlistBan_campaignId_idx" ON "WaitlistBan"("campaignId");
