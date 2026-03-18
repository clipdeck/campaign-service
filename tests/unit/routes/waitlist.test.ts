import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../helpers/buildApp'
import { makeWaitlistQuestion, makeWaitlistResponse, makeAuthHeaders } from '../../setup'
import type { FastifyInstance } from 'fastify'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../../src/services/waitlistService', () => ({
  getWaitlistQuestions: vi.fn(),
  setWaitlistQuestions: vi.fn(),
  getWaitlistResponses: vi.fn(),
  reviewWaitlistResponse: vi.fn(),
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

vi.mock('../../../src/services/participantService', () => ({
  joinCampaign: vi.fn(),
  approveParticipant: vi.fn(),
  getTeamMembers: vi.fn(),
  manageParticipant: vi.fn(),
  removeParticipant: vi.fn(),
  banParticipant: vi.fn(),
  getParticipantRole: vi.fn(),
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

import * as waitlistService from '../../../src/services/waitlistService'

const svcMock = waitlistService as Record<string, ReturnType<typeof vi.fn>>

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

// ── GET /campaigns/:id/waitlist/questions ─────────────────────────────────────

describe('GET /campaigns/:id/waitlist/questions', () => {
  it('returns 200 with questions (no auth required)', async () => {
    const questions = [makeWaitlistQuestion(), makeWaitlistQuestion({ id: 'q2', order: 2 })]
    svcMock.getWaitlistQuestions.mockResolvedValue(questions)

    const res = await app.inject({
      method: 'GET',
      url: '/campaigns/campaign-1/waitlist/questions',
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().questions).toHaveLength(2)
    expect(svcMock.getWaitlistQuestions).toHaveBeenCalledWith('campaign-1')
  })

  it('returns empty array when no questions', async () => {
    svcMock.getWaitlistQuestions.mockResolvedValue([])

    const res = await app.inject({
      method: 'GET',
      url: '/campaigns/campaign-1/waitlist/questions',
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().questions).toEqual([])
  })

  it('returns 500 on unexpected error', async () => {
    svcMock.getWaitlistQuestions.mockRejectedValue(new Error('DB down'))

    const res = await app.inject({
      method: 'GET',
      url: '/campaigns/campaign-1/waitlist/questions',
    })

    expect(res.statusCode).toBe(500)
  })
})

// ── POST /campaigns/:id/waitlist/questions ────────────────────────────────────

describe('POST /campaigns/:id/waitlist/questions', () => {
  it('returns 200 with created questions', async () => {
    const created = [makeWaitlistQuestion()]
    svcMock.setWaitlistQuestions.mockResolvedValue(created)

    const res = await app.inject({
      method: 'POST',
      url: '/campaigns/campaign-1/waitlist/questions',
      headers: { ...makeAuthHeaders(), 'content-type': 'application/json' },
      payload: { questions: [{ question: 'Why join?', order: 1 }] },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().questions).toHaveLength(1)
    expect(svcMock.setWaitlistQuestions).toHaveBeenCalledWith(
      'campaign-1',
      [{ question: 'Why join?', order: 1 }],
      expect.objectContaining({ userId: 'user-1' })
    )
  })

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/campaigns/campaign-1/waitlist/questions',
      headers: { 'content-type': 'application/json' },
      payload: { questions: [] },
    })

    expect(res.statusCode).toBe(401)
  })

  it('returns 403 when non-creator tries to set questions', async () => {
    const { ServiceError } = await import('../../../src/lib/errors')
    svcMock.setWaitlistQuestions.mockRejectedValue(new ServiceError(403, 'FORBIDDEN', 'Only creator'))

    const res = await app.inject({
      method: 'POST',
      url: '/campaigns/campaign-1/waitlist/questions',
      headers: { ...makeAuthHeaders(), 'content-type': 'application/json' },
      payload: { questions: [{ question: 'Q' }] },
    })

    expect(res.statusCode).toBe(403)
  })
})

// ── GET /campaigns/:id/waitlist/responses ─────────────────────────────────────

describe('GET /campaigns/:id/waitlist/responses', () => {
  it('returns 200 with responses for authorized user', async () => {
    const responses = [makeWaitlistResponse()]
    svcMock.getWaitlistResponses.mockResolvedValue(responses)

    const res = await app.inject({
      method: 'GET',
      url: '/campaigns/campaign-1/waitlist/responses',
      headers: makeAuthHeaders(),
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().responses).toHaveLength(1)
  })

  it('passes status filter to service', async () => {
    svcMock.getWaitlistResponses.mockResolvedValue([])

    await app.inject({
      method: 'GET',
      url: '/campaigns/campaign-1/waitlist/responses?status=PENDING',
      headers: makeAuthHeaders(),
    })

    expect(svcMock.getWaitlistResponses).toHaveBeenCalledWith(
      'campaign-1',
      expect.objectContaining({ userId: 'user-1' }),
      { status: 'PENDING' }
    )
  })

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/campaigns/campaign-1/waitlist/responses',
    })

    expect(res.statusCode).toBe(401)
  })

  it('returns 403 when member tries to view', async () => {
    const { ServiceError } = await import('../../../src/lib/errors')
    svcMock.getWaitlistResponses.mockRejectedValue(new ServiceError(403, 'FORBIDDEN', 'No permission'))

    const res = await app.inject({
      method: 'GET',
      url: '/campaigns/campaign-1/waitlist/responses',
      headers: makeAuthHeaders(),
    })

    expect(res.statusCode).toBe(403)
  })
})

// ── POST /campaigns/:id/waitlist/review ───────────────────────────────────────

describe('POST /campaigns/:id/waitlist/review', () => {
  it('approves a response', async () => {
    svcMock.reviewWaitlistResponse.mockResolvedValue(makeWaitlistResponse({ status: 'APPROVED' }))

    const res = await app.inject({
      method: 'POST',
      url: '/campaigns/campaign-1/waitlist/review',
      headers: { ...makeAuthHeaders(), 'content-type': 'application/json' },
      payload: { userId: 'user-2', action: 'APPROVED' },
    })

    expect(res.statusCode).toBe(200)
    expect(svcMock.reviewWaitlistResponse).toHaveBeenCalledWith(
      'campaign-1',
      'user-2',
      'APPROVED',
      expect.objectContaining({ userId: 'user-1' }),
      undefined
    )
  })

  it('rejects a response with note', async () => {
    svcMock.reviewWaitlistResponse.mockResolvedValue(makeWaitlistResponse({ status: 'REJECTED' }))

    const res = await app.inject({
      method: 'POST',
      url: '/campaigns/campaign-1/waitlist/review',
      headers: { ...makeAuthHeaders(), 'content-type': 'application/json' },
      payload: { userId: 'user-2', action: 'REJECTED', note: 'Not qualified' },
    })

    expect(res.statusCode).toBe(200)
    expect(svcMock.reviewWaitlistResponse).toHaveBeenCalledWith(
      'campaign-1',
      'user-2',
      'REJECTED',
      expect.objectContaining({ userId: 'user-1' }),
      'Not qualified'
    )
  })

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/campaigns/campaign-1/waitlist/review',
      headers: { 'content-type': 'application/json' },
      payload: { userId: 'user-2', action: 'APPROVED' },
    })

    expect(res.statusCode).toBe(401)
  })

  it('returns 404 when response not found', async () => {
    const { ServiceError } = await import('../../../src/lib/errors')
    svcMock.reviewWaitlistResponse.mockRejectedValue(new ServiceError(404, 'NOT_FOUND', 'Response not found'))

    const res = await app.inject({
      method: 'POST',
      url: '/campaigns/campaign-1/waitlist/review',
      headers: { ...makeAuthHeaders(), 'content-type': 'application/json' },
      payload: { userId: 'user-2', action: 'APPROVED' },
    })

    expect(res.statusCode).toBe(404)
  })
})
