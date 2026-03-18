import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../helpers/buildApp'
import { makeParticipant, makeAuthHeaders } from '../../setup'
import type { FastifyInstance } from 'fastify'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../../src/services/participantService', () => ({
  joinCampaign: vi.fn(),
  approveParticipant: vi.fn(),
  getTeamMembers: vi.fn(),
  manageParticipant: vi.fn(),
  removeParticipant: vi.fn(),
  banParticipant: vi.fn(),
  getParticipantRole: vi.fn(),
}))

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

vi.mock('../../../src/lib/prisma', () => ({
  prisma: {
    campaign: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    campaignParticipant: { findUnique: vi.fn() },
    campaignPermissions: { findUnique: vi.fn(), upsert: vi.fn() },
    leaderboardEntry: { findMany: vi.fn() },
    prizeDistribution: { findMany: vi.fn() },
  },
}))

import * as participantService from '../../../src/services/participantService'

const svcMock = participantService as Record<string, ReturnType<typeof vi.fn>>

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

// ── POST /campaigns/:id/join ──────────────────────────────────────────────────

describe('POST /campaigns/:id/join', () => {
  it('returns 200 when user successfully joins', async () => {
    svcMock.joinCampaign.mockResolvedValue({ role: 'MEMBER', campaignType: 'AUTO_JOIN' })

    const res = await app.inject({
      method: 'POST',
      url: '/campaigns/campaign-1/join',
      headers: { ...makeAuthHeaders(), 'content-type': 'application/json' },
      payload: {},
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().role).toBe('MEMBER')
    expect(svcMock.joinCampaign).toHaveBeenCalledWith(
      'campaign-1',
      expect.objectContaining({ userId: 'user-1' }),
      undefined
    )
  })

  it('passes answers to service', async () => {
    svcMock.joinCampaign.mockResolvedValue({ role: 'PENDING', campaignType: 'WAITLIST' })

    const res = await app.inject({
      method: 'POST',
      url: '/campaigns/campaign-1/join',
      headers: { ...makeAuthHeaders(), 'content-type': 'application/json' },
      payload: { answers: { q1: 'my answer' } },
    })

    expect(res.statusCode).toBe(200)
    expect(svcMock.joinCampaign).toHaveBeenCalledWith(
      'campaign-1',
      expect.objectContaining({ userId: 'user-1' }),
      { q1: 'my answer' }
    )
  })

  it('returns 401 without auth', async () => {
    const res = await app.inject({ method: 'POST', url: '/campaigns/campaign-1/join' })

    expect(res.statusCode).toBe(401)
  })

  it('returns 400 when campaign is not active', async () => {
    const { ServiceError } = await import('../../../src/lib/errors')
    svcMock.joinCampaign.mockRejectedValue(new ServiceError(400, 'BAD_REQUEST', 'Campaign is not active'))

    const res = await app.inject({
      method: 'POST',
      url: '/campaigns/campaign-1/join',
      headers: { ...makeAuthHeaders(), 'content-type': 'application/json' },
      payload: {},
    })

    expect(res.statusCode).toBe(400)
  })

  it('returns 409 when already a participant', async () => {
    const { ServiceError } = await import('../../../src/lib/errors')
    svcMock.joinCampaign.mockRejectedValue(new ServiceError(409, 'CONFLICT', 'Already a participant'))

    const res = await app.inject({
      method: 'POST',
      url: '/campaigns/campaign-1/join',
      headers: { ...makeAuthHeaders(), 'content-type': 'application/json' },
      payload: {},
    })

    expect(res.statusCode).toBe(409)
  })

  it('returns 403 when user is banned', async () => {
    const { ServiceError } = await import('../../../src/lib/errors')
    svcMock.joinCampaign.mockRejectedValue(new ServiceError(403, 'FORBIDDEN', 'You are banned'))

    const res = await app.inject({
      method: 'POST',
      url: '/campaigns/campaign-1/join',
      headers: { ...makeAuthHeaders(), 'content-type': 'application/json' },
      payload: {},
    })

    expect(res.statusCode).toBe(403)
  })
})

// ── POST /campaigns/:id/approve ───────────────────────────────────────────────

describe('POST /campaigns/:id/approve', () => {
  it('approves a participant', async () => {
    svcMock.approveParticipant.mockResolvedValue(makeParticipant({ role: 'MEMBER' }))

    const res = await app.inject({
      method: 'POST',
      url: '/campaigns/campaign-1/approve',
      headers: { ...makeAuthHeaders(), 'content-type': 'application/json' },
      payload: { userId: 'user-2' },
    })

    expect(res.statusCode).toBe(200)
    expect(svcMock.approveParticipant).toHaveBeenCalledWith(
      'campaign-1',
      'user-2',
      expect.objectContaining({ userId: 'user-1' })
    )
  })

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/campaigns/campaign-1/approve',
      headers: { 'content-type': 'application/json' },
      payload: { userId: 'user-2' },
    })

    expect(res.statusCode).toBe(401)
  })

  it('returns 403 when not authorized', async () => {
    const { ServiceError } = await import('../../../src/lib/errors')
    svcMock.approveParticipant.mockRejectedValue(new ServiceError(403, 'FORBIDDEN', 'No permission'))

    const res = await app.inject({
      method: 'POST',
      url: '/campaigns/campaign-1/approve',
      headers: { ...makeAuthHeaders(), 'content-type': 'application/json' },
      payload: { userId: 'user-2' },
    })

    expect(res.statusCode).toBe(403)
  })
})

// ── GET /campaigns/:id/team ───────────────────────────────────────────────────

describe('GET /campaigns/:id/team', () => {
  it('returns team members', async () => {
    svcMock.getTeamMembers.mockResolvedValue([makeParticipant(), makeParticipant({ userId: 'user-2' })])

    const res = await app.inject({
      method: 'GET',
      url: '/campaigns/campaign-1/team',
      headers: makeAuthHeaders(),
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.members).toHaveLength(2)
  })

  it('returns 401 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/campaigns/campaign-1/team' })

    expect(res.statusCode).toBe(401)
  })
})

// ── POST /campaigns/:id/team/manage ──────────────────────────────────────────

describe('POST /campaigns/:id/team/manage', () => {
  it('promotes a member', async () => {
    svcMock.manageParticipant.mockResolvedValue(makeParticipant({ role: 'ADMIN' }))

    const res = await app.inject({
      method: 'POST',
      url: '/campaigns/campaign-1/team/manage',
      headers: { ...makeAuthHeaders(), 'content-type': 'application/json' },
      payload: { userId: 'user-2', action: 'PROMOTE' },
    })

    expect(res.statusCode).toBe(200)
    expect(svcMock.manageParticipant).toHaveBeenCalledWith(
      'campaign-1',
      'user-2',
      'PROMOTE',
      expect.objectContaining({ userId: 'user-1' })
    )
  })

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/campaigns/campaign-1/team/manage',
      headers: { 'content-type': 'application/json' },
      payload: { userId: 'user-2', action: 'PROMOTE' },
    })

    expect(res.statusCode).toBe(401)
  })

  it('returns 403 when not creator', async () => {
    const { ServiceError } = await import('../../../src/lib/errors')
    svcMock.manageParticipant.mockRejectedValue(new ServiceError(403, 'FORBIDDEN', 'No permission'))

    const res = await app.inject({
      method: 'POST',
      url: '/campaigns/campaign-1/team/manage',
      headers: { ...makeAuthHeaders(), 'content-type': 'application/json' },
      payload: { userId: 'user-2', action: 'DEMOTE' },
    })

    expect(res.statusCode).toBe(403)
  })
})

// ── DELETE /campaigns/:id/team/:userId ────────────────────────────────────────

describe('DELETE /campaigns/:id/team/:userId', () => {
  it('removes a team member and returns 204', async () => {
    svcMock.removeParticipant.mockResolvedValue(undefined)

    const res = await app.inject({
      method: 'DELETE',
      url: '/campaigns/campaign-1/team/user-2',
      headers: makeAuthHeaders(),
    })

    expect(res.statusCode).toBe(204)
    expect(svcMock.removeParticipant).toHaveBeenCalledWith(
      'campaign-1',
      'user-2',
      expect.objectContaining({ userId: 'user-1' })
    )
  })

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/campaigns/campaign-1/team/user-2',
    })

    expect(res.statusCode).toBe(401)
  })

  it('returns 400 when user tries to remove themselves', async () => {
    const { ServiceError } = await import('../../../src/lib/errors')
    svcMock.removeParticipant.mockRejectedValue(new ServiceError(400, 'BAD_REQUEST', 'Cannot remove yourself'))

    const res = await app.inject({
      method: 'DELETE',
      url: '/campaigns/campaign-1/team/user-1',
      headers: makeAuthHeaders(),
    })

    expect(res.statusCode).toBe(400)
  })
})

// ── POST /campaigns/:id/participants/:userId/ban ──────────────────────────────

describe('POST /campaigns/:id/participants/:userId/ban', () => {
  it('bans a participant and returns success', async () => {
    svcMock.banParticipant.mockResolvedValue(undefined)

    const res = await app.inject({
      method: 'POST',
      url: '/campaigns/campaign-1/participants/user-2/ban',
      headers: { ...makeAuthHeaders(), 'content-type': 'application/json' },
      payload: { reason: 'Cheating' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().success).toBe(true)
    expect(svcMock.banParticipant).toHaveBeenCalledWith(
      'campaign-1',
      'user-2',
      expect.objectContaining({ userId: 'user-1' }),
      'Cheating'
    )
  })

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/campaigns/campaign-1/participants/user-2/ban',
    })

    expect(res.statusCode).toBe(401)
  })

  it('returns 403 when not authorized to ban', async () => {
    const { ServiceError } = await import('../../../src/lib/errors')
    svcMock.banParticipant.mockRejectedValue(new ServiceError(403, 'FORBIDDEN', 'No permission'))

    const res = await app.inject({
      method: 'POST',
      url: '/campaigns/campaign-1/participants/user-2/ban',
      headers: { ...makeAuthHeaders(), 'content-type': 'application/json' },
      payload: {},
    })

    expect(res.statusCode).toBe(403)
  })

  it('bans a participant with no request body (covers ?? null-coalescing)', async () => {
    svcMock.banParticipant.mockResolvedValue(undefined)

    // Send request with no body at all — the `?? {}` in the route handler covers this branch
    const res = await app.inject({
      method: 'POST',
      url: '/campaigns/campaign-1/participants/user-2/ban',
      headers: makeAuthHeaders(),
    })

    expect(res.statusCode).toBe(200)
    expect(svcMock.banParticipant).toHaveBeenCalledWith(
      'campaign-1',
      'user-2',
      expect.objectContaining({ userId: 'user-1' }),
      undefined
    )
  })
})
