import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../helpers/buildApp'
import { makeCampaign, makeParticipant, makeAuthHeaders } from '../setup'
import type { FastifyInstance } from 'fastify'

// ── Mock all external dependencies at the module level ────────────────────────

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    campaign: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    campaignParticipant: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
    campaignPermissions: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    prizeDistribution: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
    campaignInvite: {
      create: vi.fn(),
    },
    waitlistBan: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    waitlistResponse: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    waitlistQuestion: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
    leaderboardEntry: {
      findMany: vi.fn(),
    },
    campaignApplication: {
      updateMany: vi.fn(),
    },
  },
}))

vi.mock('../../src/lib/events', () => ({
  publisher: {
    publish: vi.fn().mockResolvedValue(undefined),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
  },
  CampaignEvents: {
    created: vi.fn().mockReturnValue({ type: 'campaign.created', payload: {} }),
    statusChanged: vi.fn().mockReturnValue({ type: 'campaign.status_changed', payload: {} }),
    ended: vi.fn().mockReturnValue({ type: 'campaign.ended', payload: {} }),
    funded: vi.fn().mockReturnValue({ type: 'campaign.funded', payload: {} }),
    participantJoined: vi.fn().mockReturnValue({ type: 'campaign.participant_joined', payload: {} }),
    participantLeft: vi.fn().mockReturnValue({ type: 'campaign.participant_left', payload: {} }),
  },
  SERVICE_NAME: 'campaign-service',
}))

import { prisma } from '../../src/lib/prisma'
import { publisher } from '../../src/lib/events'

const prismaMock = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>

let app: FastifyInstance

beforeAll(async () => {
  app = await buildApp()
})

afterAll(async () => {
  await app.close()
})

beforeEach(() => {
  vi.clearAllMocks()
})

// ── Full CRUD flow for campaigns ──────────────────────────────────────────────

describe('Campaign CRUD integration flows', () => {
  describe('Create campaign flow', () => {
    it('creates a campaign with full data, adds creator as participant, publishes event', async () => {
      const campaign = makeCampaign({ id: 'new-id', title: 'Integration Campaign' })
      prismaMock.campaign.create.mockResolvedValue(campaign)
      prismaMock.campaignParticipant.create.mockResolvedValue(makeParticipant({ role: 'CREATOR' }))

      const res = await app.inject({
        method: 'POST',
        url: '/campaigns',
        headers: { ...makeAuthHeaders(), 'content-type': 'application/json' },
        payload: {
          title: 'Integration Campaign',
          description: 'Full integration test campaign',
          category: 'Gaming',
          platforms: ['tiktok', 'youtube'],
          startDate: '2025-06-01',
          endDate: '2025-12-31',
          totalBudget: 5000,
          currency: 'USD',
        },
      })

      expect(res.statusCode).toBe(201)
      expect(res.json().id).toBe('new-id')
      expect(prismaMock.campaignParticipant.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'user-1', role: 'CREATOR' }),
        })
      )
      expect(publisher.publish).toHaveBeenCalledOnce()
    })

    it('creates a private campaign with leaderboard and invites', async () => {
      const campaign = makeCampaign({ isPrivate: true, enableLeaderboard: true })
      prismaMock.campaign.create.mockResolvedValue(campaign)
      prismaMock.campaignParticipant.create.mockResolvedValue({})
      prismaMock.prizeDistribution.create.mockResolvedValue({})
      prismaMock.campaignInvite.create.mockResolvedValue({})

      const res = await app.inject({
        method: 'POST',
        url: '/campaigns',
        headers: { ...makeAuthHeaders(), 'content-type': 'application/json' },
        payload: {
          title: 'Private Campaign',
          description: 'Private',
          category: 'Music',
          platforms: ['instagram'],
          startDate: '2025-01-01',
          endDate: '2025-06-30',
          isPrivate: true,
          invitedUsers: ['discord-111', 'discord-222'],
          enableLeaderboard: true,
          leaderboardRanks: [
            { position: '1st Place', reward: 1000 },
            { position: '2nd Place', reward: 500 },
          ],
        },
      })

      expect(res.statusCode).toBe(201)
      expect(prismaMock.prizeDistribution.create).toHaveBeenCalledTimes(2)
      expect(prismaMock.campaignInvite.create).toHaveBeenCalledTimes(2)
    })
  })

  describe('Update campaign flow', () => {
    it('creator can update campaign title', async () => {
      const campaign = makeCampaign({ permissions: null })
      const updated = makeCampaign({ title: 'New Title' })
      prismaMock.campaign.findUnique.mockResolvedValue(campaign)
      prismaMock.campaignParticipant.findUnique.mockResolvedValue(makeParticipant({ role: 'CREATOR' }))
      prismaMock.campaign.update.mockResolvedValue(updated)

      const res = await app.inject({
        method: 'PATCH',
        url: '/campaigns/campaign-1',
        headers: { ...makeAuthHeaders(), 'content-type': 'application/json' },
        payload: { title: 'New Title' },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().title).toBe('New Title')
    })

    it('status change triggers event publish', async () => {
      const campaign = makeCampaign({ status: 'ACTIVE', permissions: null })
      prismaMock.campaign.findUnique.mockResolvedValue(campaign)
      prismaMock.campaignParticipant.findUnique.mockResolvedValue(makeParticipant({ role: 'CREATOR' }))
      prismaMock.campaign.update.mockResolvedValue({ ...campaign, status: 'PAUSED' })

      const res = await app.inject({
        method: 'PATCH',
        url: '/campaigns/campaign-1',
        headers: { ...makeAuthHeaders(), 'content-type': 'application/json' },
        payload: { status: 'PAUSED' },
      })

      expect(res.statusCode).toBe(200)
      expect(publisher.publish).toHaveBeenCalledOnce()
    })
  })

  describe('Close and fund flows', () => {
    it('close campaign flow — publishes ended event', async () => {
      const campaign = makeCampaign({ status: 'ACTIVE' })
      prismaMock.campaign.findUnique
        .mockResolvedValueOnce(campaign)  // getCampaign inside closeCampaign
        .mockResolvedValueOnce(campaign)  // second getCampaign call for permissions check
      prismaMock.campaignParticipant.findUnique.mockResolvedValue(makeParticipant({ role: 'CREATOR' }))
      prismaMock.campaign.update.mockResolvedValue(makeCampaign({ status: 'ENDED' }))

      const res = await app.inject({
        method: 'POST',
        url: '/campaigns/campaign-1/close',
        headers: makeAuthHeaders(),
      })

      expect(res.statusCode).toBe(200)
      expect(publisher.publish).toHaveBeenCalledOnce()
    })

    it('fund campaign flow — calculates 10% platform fee', async () => {
      // Default makeCampaign has totalBudget: 1000, so fee = 100, remaining = 900
      const campaign = makeCampaign({ createdBy: 'user-1', isFunded: false })
      prismaMock.campaign.findUnique.mockResolvedValue(campaign)
      prismaMock.campaign.update.mockResolvedValue(
        makeCampaign({ isFunded: true, platformFee: 100, remainingBudget: 900 })
      )

      const res = await app.inject({
        method: 'POST',
        url: '/campaigns/campaign-1/fund',
        headers: makeAuthHeaders(),
      })

      expect(res.statusCode).toBe(200)
      expect(prismaMock.campaign.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isFunded: true,
            platformFee: 100,
            remainingBudget: 900,
          }),
        })
      )
      expect(publisher.publish).toHaveBeenCalledOnce()
    })
  })

  describe('Join campaign flow', () => {
    it('joins an AUTO_JOIN campaign directly as MEMBER', async () => {
      const campaign = makeCampaign({
        status: 'ACTIVE',
        campaignType: 'AUTO_JOIN',
        editorSlots: 10,
        _count: { participants: 3 },
      })
      prismaMock.campaign.findUnique.mockResolvedValue(campaign)
      prismaMock.campaignParticipant.findUnique.mockResolvedValue(null)
      prismaMock.waitlistBan.findUnique.mockResolvedValue(null)
      prismaMock.campaignParticipant.create.mockResolvedValue({})

      const res = await app.inject({
        method: 'POST',
        url: '/campaigns/campaign-1/join',
        headers: { ...makeAuthHeaders({ 'x-user-id': 'new-user' }), 'content-type': 'application/json' },
        payload: {},
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().role).toBe('MEMBER')
      expect(publisher.publish).toHaveBeenCalledOnce()
    })

    it('joins a WAITLIST campaign as PENDING with answers', async () => {
      const campaign = makeCampaign({
        status: 'ACTIVE',
        campaignType: 'WAITLIST',
        editorSlots: 10,
        _count: { participants: 3 },
      })
      prismaMock.campaign.findUnique.mockResolvedValue(campaign)
      prismaMock.campaignParticipant.findUnique.mockResolvedValue(null)
      prismaMock.waitlistBan.findUnique.mockResolvedValue(null)
      prismaMock.campaignParticipant.create.mockResolvedValue({})
      prismaMock.waitlistResponse.create.mockResolvedValue({})

      const res = await app.inject({
        method: 'POST',
        url: '/campaigns/campaign-1/join',
        headers: { ...makeAuthHeaders({ 'x-user-id': 'new-user' }), 'content-type': 'application/json' },
        payload: { answers: { q1: 'I love gaming' } },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().role).toBe('PENDING')
      expect(prismaMock.waitlistResponse.create).toHaveBeenCalledOnce()
    })

    it('rejects join when campaign is full', async () => {
      const campaign = makeCampaign({
        status: 'ACTIVE',
        campaignType: 'AUTO_JOIN',
        editorSlots: 5,
        _count: { participants: 5 },
      })
      prismaMock.campaign.findUnique.mockResolvedValue(campaign)
      prismaMock.campaignParticipant.findUnique.mockResolvedValue(null)
      prismaMock.waitlistBan.findUnique.mockResolvedValue(null)

      const res = await app.inject({
        method: 'POST',
        url: '/campaigns/campaign-1/join',
        headers: { ...makeAuthHeaders({ 'x-user-id': 'new-user' }), 'content-type': 'application/json' },
        payload: {},
      })

      expect(res.statusCode).toBe(403)
      expect(res.json().error.message).toBe('Campaign is full')
    })
  })

  describe('Staff bypass flows', () => {
    it('staff can update any campaign without being a participant', async () => {
      const campaign = makeCampaign({ permissions: null })
      prismaMock.campaign.findUnique.mockResolvedValue(campaign)
      prismaMock.campaignParticipant.findUnique.mockResolvedValue(null)
      prismaMock.campaign.update.mockResolvedValue(makeCampaign({ title: 'Staff Updated' }))

      const res = await app.inject({
        method: 'PATCH',
        url: '/campaigns/campaign-1',
        headers: {
          ...makeAuthHeaders({ 'x-user-id': 'staff-1', 'x-user-staff': 'true' }),
          'content-type': 'application/json',
        },
        payload: { title: 'Staff Updated' },
      })

      expect(res.statusCode).toBe(200)
    })

    it('staff can close any campaign', async () => {
      const campaign = makeCampaign({ status: 'ACTIVE' })
      prismaMock.campaign.findUnique.mockResolvedValue(campaign)
      prismaMock.campaignParticipant.findUnique.mockResolvedValue(null)
      prismaMock.campaign.update.mockResolvedValue(makeCampaign({ status: 'ENDED' }))

      const res = await app.inject({
        method: 'POST',
        url: '/campaigns/campaign-1/close',
        headers: makeAuthHeaders({ 'x-user-id': 'staff-1', 'x-user-staff': 'true' }),
      })

      expect(res.statusCode).toBe(200)
    })
  })

  describe('Error handling', () => {
    it('returns 404 when fetching non-existent campaign', async () => {
      prismaMock.campaign.findUnique.mockResolvedValue(null)

      const res = await app.inject({
        method: 'GET',
        url: '/campaigns/does-not-exist',
      })

      expect(res.statusCode).toBe(404)
      expect(res.json().error.code).toBe('NOT_FOUND')
    })

    it('returns 500 on unexpected database errors', async () => {
      prismaMock.campaign.findMany.mockRejectedValue(new Error('Connection lost'))
      prismaMock.campaign.count.mockRejectedValue(new Error('Connection lost'))

      const res = await app.inject({
        method: 'GET',
        url: '/campaigns',
      })

      expect(res.statusCode).toBe(500)
      expect(res.json().error.code).toBe('INTERNAL_ERROR')
    })

    it('unauthenticated requests to protected endpoints get 401', async () => {
      const protectedRoutes = [
        { method: 'POST', url: '/campaigns' },
        { method: 'PATCH', url: '/campaigns/campaign-1' },
        { method: 'DELETE', url: '/campaigns/campaign-1' },
        { method: 'POST', url: '/campaigns/campaign-1/close' },
        { method: 'POST', url: '/campaigns/campaign-1/fund' },
        { method: 'POST', url: '/campaigns/campaign-1/join' },
        { method: 'POST', url: '/campaigns/campaign-1/approve' },
        { method: 'GET', url: '/campaigns/campaign-1/team' },
      ]

      for (const route of protectedRoutes) {
        const res = await app.inject({ method: route.method as any, url: route.url })
        expect(res.statusCode, `Expected 401 for ${route.method} ${route.url}`).toBe(401)
      }
    })
  })
})
