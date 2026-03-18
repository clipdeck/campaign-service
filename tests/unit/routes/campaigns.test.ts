import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../helpers/buildApp'
import { makeCampaign, makeAuthHeaders } from '../../setup'
import type { FastifyInstance } from 'fastify'

// ── Mock the service layer ────────────────────────────────────────────────────

vi.mock('../../../src/services/campaignService', () => ({
  listCampaigns: vi.fn(),
  getCampaign: vi.fn(),
  createCampaign: vi.fn(),
  updateCampaign: vi.fn(),
  deleteCampaign: vi.fn(),
  closeCampaign: vi.fn(),
  fundCampaign: vi.fn(),
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

// Also mock prisma to prevent connection attempts from permission/analytics routes
vi.mock('../../../src/lib/prisma', () => ({
  prisma: {
    campaign: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    campaignParticipant: { findUnique: vi.fn() },
    campaignPermissions: { findUnique: vi.fn(), upsert: vi.fn() },
    leaderboardEntry: { findMany: vi.fn() },
    prizeDistribution: { findMany: vi.fn() },
  },
}))

import * as campaignService from '../../../src/services/campaignService'

const svcMock = campaignService as Record<string, ReturnType<typeof vi.fn>>

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

// ── GET /campaigns ────────────────────────────────────────────────────────────

describe('GET /campaigns', () => {
  it('returns 200 with campaign list', async () => {
    const payload = { campaigns: [makeCampaign()], total: 1, page: 1, limit: 20, totalPages: 1 }
    svcMock.listCampaigns.mockResolvedValue(payload)

    const res = await app.inject({ method: 'GET', url: '/campaigns' })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.campaigns).toHaveLength(1)
    expect(body.total).toBe(1)
  })

  it('forwards query filters to service', async () => {
    svcMock.listCampaigns.mockResolvedValue({ campaigns: [], total: 0, page: 1, limit: 20, totalPages: 0 })

    await app.inject({ method: 'GET', url: '/campaigns?status=ACTIVE&studioId=s1&page=2&limit=5' })

    expect(svcMock.listCampaigns).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ACTIVE', studioId: 's1', page: 2, limit: 5 })
    )
  })

  it('parses published=true correctly', async () => {
    svcMock.listCampaigns.mockResolvedValue({ campaigns: [], total: 0, page: 1, limit: 20, totalPages: 0 })

    await app.inject({ method: 'GET', url: '/campaigns?published=true' })

    expect(svcMock.listCampaigns).toHaveBeenCalledWith(
      expect.objectContaining({ published: true })
    )
  })

  it('parses published=false correctly', async () => {
    svcMock.listCampaigns.mockResolvedValue({ campaigns: [], total: 0, page: 1, limit: 20, totalPages: 0 })

    await app.inject({ method: 'GET', url: '/campaigns?published=false' })

    expect(svcMock.listCampaigns).toHaveBeenCalledWith(
      expect.objectContaining({ published: false })
    )
  })

  it('returns 500 on unexpected service error', async () => {
    svcMock.listCampaigns.mockRejectedValue(new Error('DB crash'))

    const res = await app.inject({ method: 'GET', url: '/campaigns' })

    expect(res.statusCode).toBe(500)
  })
})

// ── GET /campaigns/:id ────────────────────────────────────────────────────────

describe('GET /campaigns/:id', () => {
  it('returns 200 with campaign data', async () => {
    svcMock.getCampaign.mockResolvedValue(makeCampaign())

    const res = await app.inject({ method: 'GET', url: '/campaigns/campaign-1' })

    expect(res.statusCode).toBe(200)
    expect(res.json().id).toBe('campaign-1')
  })

  it('returns 404 when campaign not found', async () => {
    const { ServiceError } = await import('../../../src/lib/errors')
    svcMock.getCampaign.mockRejectedValue(new ServiceError(404, 'NOT_FOUND', 'Campaign not found'))

    const res = await app.inject({ method: 'GET', url: '/campaigns/missing' })

    expect(res.statusCode).toBe(404)
    expect(res.json().error.code).toBe('NOT_FOUND')
  })
})

// ── POST /campaigns ───────────────────────────────────────────────────────────

describe('POST /campaigns', () => {
  const validBody = {
    title: 'Test',
    description: 'Desc',
    category: 'Gaming',
    platforms: ['tiktok'],
    startDate: '2025-01-01',
    endDate: '2025-12-31',
  }

  it('returns 201 with created campaign', async () => {
    svcMock.createCampaign.mockResolvedValue(makeCampaign())

    const res = await app.inject({
      method: 'POST',
      url: '/campaigns',
      headers: { ...makeAuthHeaders(), 'content-type': 'application/json' },
      payload: validBody,
    })

    expect(res.statusCode).toBe(201)
    expect(svcMock.createCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Test' }),
      expect.objectContaining({ userId: 'user-1' })
    )
  })

  it('returns 401 when no auth headers provided', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/campaigns',
      headers: { 'content-type': 'application/json' },
      payload: validBody,
    })

    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('UNAUTHORIZED')
  })

  it('forwards ServiceError status codes', async () => {
    const { ServiceError } = await import('../../../src/lib/errors')
    svcMock.createCampaign.mockRejectedValue(new ServiceError(400, 'BAD_REQUEST', 'Invalid platform: facebook'))

    const res = await app.inject({
      method: 'POST',
      url: '/campaigns',
      headers: { ...makeAuthHeaders(), 'content-type': 'application/json' },
      payload: { ...validBody, platforms: ['facebook'] },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('BAD_REQUEST')
  })
})

// ── PATCH /campaigns/:id ──────────────────────────────────────────────────────

describe('PATCH /campaigns/:id', () => {
  it('returns 200 with updated campaign', async () => {
    svcMock.updateCampaign.mockResolvedValue(makeCampaign({ title: 'Updated' }))

    const res = await app.inject({
      method: 'PATCH',
      url: '/campaigns/campaign-1',
      headers: { ...makeAuthHeaders(), 'content-type': 'application/json' },
      payload: { title: 'Updated' },
    })

    expect(res.statusCode).toBe(200)
    expect(svcMock.updateCampaign).toHaveBeenCalledWith(
      'campaign-1',
      expect.objectContaining({ title: 'Updated' }),
      expect.objectContaining({ userId: 'user-1' })
    )
  })

  it('returns 401 when no auth headers', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/campaigns/campaign-1',
      headers: { 'content-type': 'application/json' },
      payload: { title: 'X' },
    })

    expect(res.statusCode).toBe(401)
  })

  it('returns 403 when user lacks permission', async () => {
    const { ServiceError } = await import('../../../src/lib/errors')
    svcMock.updateCampaign.mockRejectedValue(new ServiceError(403, 'FORBIDDEN', 'No permission'))

    const res = await app.inject({
      method: 'PATCH',
      url: '/campaigns/campaign-1',
      headers: { ...makeAuthHeaders(), 'content-type': 'application/json' },
      payload: { title: 'X' },
    })

    expect(res.statusCode).toBe(403)
  })
})

// ── DELETE /campaigns/:id ─────────────────────────────────────────────────────

describe('DELETE /campaigns/:id', () => {
  it('returns 204 on successful delete', async () => {
    svcMock.deleteCampaign.mockResolvedValue(undefined)

    const res = await app.inject({
      method: 'DELETE',
      url: '/campaigns/campaign-1',
      headers: makeAuthHeaders(),
    })

    expect(res.statusCode).toBe(204)
  })

  it('returns 401 without auth', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/campaigns/campaign-1' })

    expect(res.statusCode).toBe(401)
  })

  it('returns 403 when forbidden', async () => {
    const { ServiceError } = await import('../../../src/lib/errors')
    svcMock.deleteCampaign.mockRejectedValue(new ServiceError(403, 'FORBIDDEN', 'No permission'))

    const res = await app.inject({
      method: 'DELETE',
      url: '/campaigns/campaign-1',
      headers: makeAuthHeaders(),
    })

    expect(res.statusCode).toBe(403)
  })
})

// ── POST /campaigns/:id/close ─────────────────────────────────────────────────

describe('POST /campaigns/:id/close', () => {
  it('returns 200 on successful close', async () => {
    svcMock.closeCampaign.mockResolvedValue(makeCampaign({ status: 'ENDED' }))

    const res = await app.inject({
      method: 'POST',
      url: '/campaigns/campaign-1/close',
      headers: makeAuthHeaders(),
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('ENDED')
  })

  it('returns 401 without auth', async () => {
    const res = await app.inject({ method: 'POST', url: '/campaigns/campaign-1/close' })

    expect(res.statusCode).toBe(401)
  })

  it('returns 409 when already ended', async () => {
    const { ServiceError } = await import('../../../src/lib/errors')
    svcMock.closeCampaign.mockRejectedValue(new ServiceError(409, 'CONFLICT', 'Already ended'))

    const res = await app.inject({
      method: 'POST',
      url: '/campaigns/campaign-1/close',
      headers: makeAuthHeaders(),
    })

    expect(res.statusCode).toBe(409)
  })
})

// ── POST /campaigns/:id/fund ──────────────────────────────────────────────────

describe('POST /campaigns/:id/fund', () => {
  it('returns 200 on successful fund', async () => {
    svcMock.fundCampaign.mockResolvedValue(makeCampaign({ isFunded: true }))

    const res = await app.inject({
      method: 'POST',
      url: '/campaigns/campaign-1/fund',
      headers: makeAuthHeaders(),
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().isFunded).toBe(true)
  })

  it('returns 401 without auth', async () => {
    const res = await app.inject({ method: 'POST', url: '/campaigns/campaign-1/fund' })

    expect(res.statusCode).toBe(401)
  })

  it('returns 409 when already funded', async () => {
    const { ServiceError } = await import('../../../src/lib/errors')
    svcMock.fundCampaign.mockRejectedValue(new ServiceError(409, 'CONFLICT', 'Already funded'))

    const res = await app.inject({
      method: 'POST',
      url: '/campaigns/campaign-1/fund',
      headers: makeAuthHeaders(),
    })

    expect(res.statusCode).toBe(409)
  })
})
