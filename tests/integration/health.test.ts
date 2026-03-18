import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../helpers/buildApp'
import type { FastifyInstance } from 'fastify'

// ── Mock everything that touches external resources ───────────────────────────

import { vi } from 'vitest'

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    campaign: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    campaignParticipant: { findUnique: vi.fn() },
    campaignPermissions: { findUnique: vi.fn(), upsert: vi.fn() },
    leaderboardEntry: { findMany: vi.fn() },
    prizeDistribution: { findMany: vi.fn() },
  },
}))

vi.mock('../../src/lib/events', () => ({
  publisher: {
    publish: vi.fn().mockResolvedValue(undefined),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
  },
  CampaignEvents: {},
  SERVICE_NAME: 'campaign-service',
}))

vi.mock('../../src/services/campaignService', () => ({
  listCampaigns: vi.fn(),
  getCampaign: vi.fn(),
  createCampaign: vi.fn(),
  updateCampaign: vi.fn(),
  deleteCampaign: vi.fn(),
  closeCampaign: vi.fn(),
  fundCampaign: vi.fn(),
}))

vi.mock('../../src/services/participantService', () => ({
  joinCampaign: vi.fn(),
  approveParticipant: vi.fn(),
  getTeamMembers: vi.fn(),
  manageParticipant: vi.fn(),
  removeParticipant: vi.fn(),
  banParticipant: vi.fn(),
  getParticipantRole: vi.fn(),
}))

vi.mock('../../src/services/waitlistService', () => ({
  getWaitlistQuestions: vi.fn(),
  setWaitlistQuestions: vi.fn(),
  getWaitlistResponses: vi.fn(),
  reviewWaitlistResponse: vi.fn(),
}))

let app: FastifyInstance

beforeAll(async () => {
  app = await buildApp()
})

afterAll(async () => {
  await app.close()
})

// ── Health endpoint tests ─────────────────────────────────────────────────────

describe('Health endpoints', () => {
  it('GET /health returns 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' })

    expect(res.statusCode).toBe(200)
  })

  it('GET /health returns service name', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.service).toBe('campaign-service')
  })

  it('GET /health returns ok status', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' })

    expect(res.json().status).toBe('ok')
  })

  it('GET /ready returns 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/ready' })

    expect(res.statusCode).toBe(200)
  })

  it('GET /ready returns ready status', async () => {
    const res = await app.inject({ method: 'GET', url: '/ready' })

    const body = res.json()
    expect(body.status).toBe('ready')
    expect(body.service).toBe('campaign-service')
  })

  it('unknown route returns 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/nonexistent' })

    expect(res.statusCode).toBe(404)
  })
})
