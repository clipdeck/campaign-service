import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../helpers/buildApp'
import { makeCampaign, makePermissions, makeAuthHeaders } from '../../setup'
import type { FastifyInstance } from 'fastify'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../../src/services/campaignService', () => ({
  listCampaigns: vi.fn(),
  getCampaign: vi.fn(),
  createCampaign: vi.fn(),
  updateCampaign: vi.fn(),
  deleteCampaign: vi.fn(),
  closeCampaign: vi.fn(),
  fundCampaign: vi.fn(),
}))

vi.mock('../../../src/services/participantService', () => ({
  joinCampaign: vi.fn(),
  approveParticipant: vi.fn(),
  getTeamMembers: vi.fn(),
  manageParticipant: vi.fn(),
  removeParticipant: vi.fn(),
  banParticipant: vi.fn(),
  getParticipantRole: vi.fn(),
}))

vi.mock('../../../src/services/waitlistService', () => ({
  getWaitlistQuestions: vi.fn(),
  setWaitlistQuestions: vi.fn(),
  getWaitlistResponses: vi.fn(),
  reviewWaitlistResponse: vi.fn(),
}))

vi.mock('../../../src/lib/events', () => ({
  publisher: {
    publish: vi.fn().mockResolvedValue(undefined),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
  },
  CampaignEvents: {},
  SERVICE_NAME: 'campaign-service',
}))

vi.mock('../../../src/lib/prisma', () => ({
  prisma: {
    campaign: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    campaignParticipant: { findUnique: vi.fn() },
    campaignPermissions: { findUnique: vi.fn(), upsert: vi.fn() },
    leaderboardEntry: { findMany: vi.fn() },
    prizeDistribution: { findMany: vi.fn() },
  },
}))

import { prisma } from '../../../src/lib/prisma'
import * as participantService from '../../../src/services/participantService'

const prismaMock = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>
const participantSvcMock = participantService as Record<string, ReturnType<typeof vi.fn>>

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

// ── GET /campaigns/:id/permissions ────────────────────────────────────────────

describe('GET /campaigns/:id/permissions', () => {
  it('returns stored permissions when they exist', async () => {
    const perms = makePermissions()
    prismaMock.campaignPermissions.findUnique.mockResolvedValue(perms)

    const res = await app.inject({
      method: 'GET',
      url: '/campaigns/campaign-1/permissions',
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().adminsCanReviewClips).toBe(true)
  })

  it('returns default permissions when none stored', async () => {
    prismaMock.campaignPermissions.findUnique.mockResolvedValue(null)

    const res = await app.inject({
      method: 'GET',
      url: '/campaigns/campaign-1/permissions',
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.adminsCanReviewClips).toBe(true)
    expect(body.adminsCanManageTeam).toBe(true)
    expect(body.adminsCanEditCampaign).toBe(false)
    expect(body.adminsCanAddBudget).toBe(false)
    expect(body.adminsCanDeleteCampaign).toBe(false)
  })

  it('returns 500 on unexpected DB error', async () => {
    prismaMock.campaignPermissions.findUnique.mockRejectedValue(new Error('DB down'))

    const res = await app.inject({
      method: 'GET',
      url: '/campaigns/campaign-1/permissions',
    })

    expect(res.statusCode).toBe(500)
  })
})

// ── POST /campaigns/:id/permissions ──────────────────────────────────────────

describe('POST /campaigns/:id/permissions', () => {
  it('updates permissions when user is creator', async () => {
    participantSvcMock.getParticipantRole.mockResolvedValue('CREATOR')
    const updatedPerms = makePermissions({ adminsCanEditCampaign: true })
    prismaMock.campaignPermissions.upsert.mockResolvedValue(updatedPerms)

    const res = await app.inject({
      method: 'POST',
      url: '/campaigns/campaign-1/permissions',
      headers: { ...makeAuthHeaders(), 'content-type': 'application/json' },
      payload: { adminsCanEditCampaign: true },
    })

    expect(res.statusCode).toBe(200)
    expect(prismaMock.campaignPermissions.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { campaignId: 'campaign-1' },
        create: expect.objectContaining({ campaignId: 'campaign-1' }),
      })
    )
  })

  it('allows staff to update permissions', async () => {
    participantSvcMock.getParticipantRole.mockResolvedValue(null)
    prismaMock.campaignPermissions.upsert.mockResolvedValue(makePermissions())

    const res = await app.inject({
      method: 'POST',
      url: '/campaigns/campaign-1/permissions',
      headers: { ...makeAuthHeaders({ 'x-user-staff': 'true', 'x-user-id': 'staff-1' }), 'content-type': 'application/json' },
      payload: { adminsCanEditCampaign: false },
    })

    expect(res.statusCode).toBe(200)
  })

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/campaigns/campaign-1/permissions',
      headers: { 'content-type': 'application/json' },
      payload: {},
    })

    expect(res.statusCode).toBe(401)
  })

  it('returns 403 when non-creator non-staff tries to update', async () => {
    participantSvcMock.getParticipantRole.mockResolvedValue('MEMBER')

    const res = await app.inject({
      method: 'POST',
      url: '/campaigns/campaign-1/permissions',
      headers: { ...makeAuthHeaders({ 'x-user-id': 'member-user' }), 'content-type': 'application/json' },
      payload: { adminsCanEditCampaign: true },
    })

    expect(res.statusCode).toBe(403)
  })
})

// ── GET /campaigns/:id/stats ──────────────────────────────────────────────────

describe('GET /campaigns/:id/stats', () => {
  it('returns stats for an existing campaign', async () => {
    const campaign = {
      id: 'campaign-1',
      totalViews: 5000,
      viewsLast24h: 200,
      approvedClips: 10,
      pendingClips: 2,
      rejectedClips: 1,
      startDate: new Date('2025-01-01'),
      endDate: new Date('2025-12-31'),
      status: 'ACTIVE',
      totalBudget: 1000,
      lastStatsRefreshedAt: null,
      showParticipantCount: true,
      _count: { participants: 15 },
    }
    prismaMock.campaign.findUnique.mockResolvedValue(campaign)

    const res = await app.inject({
      method: 'GET',
      url: '/campaigns/campaign-1/stats',
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.totalViews).toBe(5000)
    expect(body.totalSubmissions).toBe(13) // 10+2+1
    expect(body.approvedSubmissions).toBe(10)
    expect(body.isActive).toBe(true)
    expect(body.participantsCount).toBe(15)
  })

  it('returns 404 when campaign not found', async () => {
    prismaMock.campaign.findUnique.mockResolvedValue(null)

    const res = await app.inject({
      method: 'GET',
      url: '/campaigns/missing/stats',
    })

    expect(res.statusCode).toBe(404)
  })

  it('reports isActive as false for ENDED campaigns', async () => {
    prismaMock.campaign.findUnique.mockResolvedValue({
      id: 'campaign-1',
      totalViews: 0, viewsLast24h: 0, approvedClips: 0, pendingClips: 0, rejectedClips: 0,
      startDate: new Date(), endDate: new Date(), status: 'ENDED',
      totalBudget: 0, lastStatsRefreshedAt: null, showParticipantCount: true,
      _count: { participants: 0 },
    })

    const res = await app.inject({ method: 'GET', url: '/campaigns/campaign-1/stats' })

    expect(res.statusCode).toBe(200)
    expect(res.json().isActive).toBe(false)
  })
})

// ── GET /campaigns/:id/leaderboard ────────────────────────────────────────────

describe('GET /campaigns/:id/leaderboard', () => {
  it('returns leaderboard entries when leaderboard is enabled', async () => {
    prismaMock.campaign.findUnique.mockResolvedValue({ enableLeaderboard: true })
    const entries = [
      { id: 'e1', campaignId: 'campaign-1', editorId: 'user-1', score: 100, rank: 1 },
      { id: 'e2', campaignId: 'campaign-1', editorId: 'user-2', score: 80, rank: 2 },
    ]
    prismaMock.leaderboardEntry.findMany.mockResolvedValue(entries)

    const res = await app.inject({
      method: 'GET',
      url: '/campaigns/campaign-1/leaderboard',
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().leaderboard).toHaveLength(2)
  })

  it('returns 404 when campaign not found', async () => {
    prismaMock.campaign.findUnique.mockResolvedValue(null)

    const res = await app.inject({
      method: 'GET',
      url: '/campaigns/missing/leaderboard',
    })

    expect(res.statusCode).toBe(404)
  })

  it('returns 400 when leaderboard is not enabled', async () => {
    prismaMock.campaign.findUnique.mockResolvedValue({ enableLeaderboard: false })

    const res = await app.inject({
      method: 'GET',
      url: '/campaigns/campaign-1/leaderboard',
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('BAD_REQUEST')
  })
})

// ── GET /campaigns/:id/prizes ─────────────────────────────────────────────────

describe('GET /campaigns/:id/prizes', () => {
  it('returns prize distributions', async () => {
    const prizes = [
      { id: 'p1', campaignId: 'campaign-1', position: 1, reward: 500, label: '1st' },
      { id: 'p2', campaignId: 'campaign-1', position: 2, reward: 300, label: '2nd' },
    ]
    prismaMock.prizeDistribution.findMany.mockResolvedValue(prizes)

    const res = await app.inject({
      method: 'GET',
      url: '/campaigns/campaign-1/prizes',
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().prizes).toHaveLength(2)
    expect(res.json().prizes[0].position).toBe(1)
  })

  it('returns empty array when no prizes', async () => {
    prismaMock.prizeDistribution.findMany.mockResolvedValue([])

    const res = await app.inject({
      method: 'GET',
      url: '/campaigns/campaign-1/prizes',
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().prizes).toEqual([])
  })

  it('returns 500 on unexpected DB error for prizes', async () => {
    prismaMock.prizeDistribution.findMany.mockRejectedValue(new Error('DB down'))

    const res = await app.inject({
      method: 'GET',
      url: '/campaigns/campaign-1/prizes',
    })

    expect(res.statusCode).toBe(500)
  })
})

