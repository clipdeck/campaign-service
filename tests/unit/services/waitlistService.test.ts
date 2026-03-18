import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeWaitlistQuestion, makeWaitlistResponse } from '../../setup'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../../src/lib/prisma', () => ({
  prisma: {
    waitlistQuestion: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
    waitlistResponse: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    campaignParticipant: {
      findUnique: vi.fn(),
    },
  },
}))

vi.mock('../../../src/lib/events', () => ({
  publisher: { publish: vi.fn().mockResolvedValue(undefined) },
  CampaignEvents: {},
  SERVICE_NAME: 'campaign-service',
}))

import { prisma } from '../../../src/lib/prisma'
import {
  getWaitlistQuestions,
  setWaitlistQuestions,
  getWaitlistResponses,
  reviewWaitlistResponse,
} from '../../../src/services/waitlistService'

const prismaMock = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>

const mockCreator = { userId: 'user-1', email: 'creator@test.com', isStaff: false }
const mockAdmin = { userId: 'admin-user', email: 'admin@test.com', isStaff: false }
const mockMember = { userId: 'member-user', email: 'member@test.com', isStaff: false }
const mockStaff = { userId: 'staff-1', email: 'staff@test.com', isStaff: true }

beforeEach(() => {
  vi.clearAllMocks()
})

// ── getWaitlistQuestions ──────────────────────────────────────────────────────

describe('getWaitlistQuestions', () => {
  it('returns ordered questions for a campaign', async () => {
    const questions = [
      makeWaitlistQuestion({ order: 1 }),
      makeWaitlistQuestion({ id: 'q2', order: 2, question: 'Second question' }),
    ]
    prismaMock.waitlistQuestion.findMany.mockResolvedValue(questions)

    const result = await getWaitlistQuestions('campaign-1')

    expect(result).toEqual(questions)
    expect(prismaMock.waitlistQuestion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { campaignId: 'campaign-1' }, orderBy: { order: 'asc' } })
    )
  })

  it('returns empty array when no questions exist', async () => {
    prismaMock.waitlistQuestion.findMany.mockResolvedValue([])

    const result = await getWaitlistQuestions('campaign-1')

    expect(result).toEqual([])
  })
})

// ── setWaitlistQuestions ──────────────────────────────────────────────────────

describe('setWaitlistQuestions', () => {
  it('replaces all questions for a campaign (creator)', async () => {
    prismaMock.campaignParticipant.findUnique.mockResolvedValue({ role: 'CREATOR' })
    prismaMock.waitlistQuestion.deleteMany.mockResolvedValue({ count: 2 })
    prismaMock.waitlistQuestion.create
      .mockResolvedValueOnce(makeWaitlistQuestion({ id: 'q1', order: 1 }))
      .mockResolvedValueOnce(makeWaitlistQuestion({ id: 'q2', order: 2 }))

    const result = await setWaitlistQuestions(
      'campaign-1',
      [
        { question: 'Why join?', order: 1 },
        { question: 'Your experience?', order: 2 },
      ],
      mockCreator
    )

    expect(prismaMock.waitlistQuestion.deleteMany).toHaveBeenCalledWith({ where: { campaignId: 'campaign-1' } })
    expect(prismaMock.waitlistQuestion.create).toHaveBeenCalledTimes(2)
    expect(result).toHaveLength(2)
  })

  it('assigns auto order when order not provided', async () => {
    prismaMock.campaignParticipant.findUnique.mockResolvedValue({ role: 'CREATOR' })
    prismaMock.waitlistQuestion.deleteMany.mockResolvedValue({ count: 0 })
    prismaMock.waitlistQuestion.create.mockResolvedValue(makeWaitlistQuestion())

    await setWaitlistQuestions('campaign-1', [{ question: 'Q1' }, { question: 'Q2' }], mockCreator)

    expect(prismaMock.waitlistQuestion.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ data: expect.objectContaining({ order: 1 }) })
    )
    expect(prismaMock.waitlistQuestion.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ data: expect.objectContaining({ order: 2 }) })
    )
  })

  it('throws forbidden when non-creator non-staff tries to set questions', async () => {
    prismaMock.campaignParticipant.findUnique.mockResolvedValue({ role: 'MEMBER' })

    await expect(
      setWaitlistQuestions('campaign-1', [{ question: 'Q1' }], mockMember)
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('allows staff to set questions', async () => {
    prismaMock.campaignParticipant.findUnique.mockResolvedValue(null)
    prismaMock.waitlistQuestion.deleteMany.mockResolvedValue({ count: 0 })
    prismaMock.waitlistQuestion.create.mockResolvedValue(makeWaitlistQuestion())

    await expect(
      setWaitlistQuestions('campaign-1', [{ question: 'Q1' }], mockStaff)
    ).resolves.not.toThrow()
  })
})

// ── getWaitlistResponses ──────────────────────────────────────────────────────

describe('getWaitlistResponses', () => {
  it('returns all responses for campaign (creator)', async () => {
    const responses = [makeWaitlistResponse(), makeWaitlistResponse({ id: 'r2', userId: 'user-3' })]
    prismaMock.campaignParticipant.findUnique.mockResolvedValue({ role: 'CREATOR' })
    prismaMock.waitlistResponse.findMany.mockResolvedValue(responses)

    const result = await getWaitlistResponses('campaign-1', mockCreator)

    expect(result).toEqual(responses)
    expect(prismaMock.waitlistResponse.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { campaignId: 'campaign-1' } })
    )
  })

  it('filters by status when provided', async () => {
    prismaMock.campaignParticipant.findUnique.mockResolvedValue({ role: 'CREATOR' })
    prismaMock.waitlistResponse.findMany.mockResolvedValue([])

    await getWaitlistResponses('campaign-1', mockCreator, { status: 'PENDING' })

    expect(prismaMock.waitlistResponse.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { campaignId: 'campaign-1', status: 'PENDING' } })
    )
  })

  it('allows admin to view responses', async () => {
    prismaMock.campaignParticipant.findUnique.mockResolvedValue({ role: 'ADMIN' })
    prismaMock.waitlistResponse.findMany.mockResolvedValue([])

    await expect(getWaitlistResponses('campaign-1', mockAdmin)).resolves.not.toThrow()
  })

  it('throws forbidden when member tries to view responses', async () => {
    prismaMock.campaignParticipant.findUnique.mockResolvedValue({ role: 'MEMBER' })

    await expect(getWaitlistResponses('campaign-1', mockMember)).rejects.toMatchObject({
      statusCode: 403,
    })
  })
})

// ── reviewWaitlistResponse ────────────────────────────────────────────────────

describe('reviewWaitlistResponse', () => {
  it('approves a pending response', async () => {
    prismaMock.campaignParticipant.findUnique.mockResolvedValue({ role: 'CREATOR' })
    prismaMock.waitlistResponse.findUnique.mockResolvedValue(makeWaitlistResponse())
    prismaMock.waitlistResponse.update.mockResolvedValue(makeWaitlistResponse({ status: 'APPROVED' }))

    const result = await reviewWaitlistResponse('campaign-1', 'user-2', 'APPROVED', mockCreator)

    expect(prismaMock.waitlistResponse.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'APPROVED', reviewedBy: mockCreator.userId }),
      })
    )
  })

  it('rejects a pending response with note', async () => {
    prismaMock.campaignParticipant.findUnique.mockResolvedValue({ role: 'CREATOR' })
    prismaMock.waitlistResponse.findUnique.mockResolvedValue(makeWaitlistResponse())
    prismaMock.waitlistResponse.update.mockResolvedValue(makeWaitlistResponse({ status: 'REJECTED' }))

    await reviewWaitlistResponse('campaign-1', 'user-2', 'REJECTED', mockCreator, 'Not qualified')

    expect(prismaMock.waitlistResponse.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'REJECTED', note: 'Not qualified' }),
      })
    )
  })

  it('throws 404 when response not found', async () => {
    prismaMock.campaignParticipant.findUnique.mockResolvedValue({ role: 'CREATOR' })
    prismaMock.waitlistResponse.findUnique.mockResolvedValue(null)

    await expect(
      reviewWaitlistResponse('campaign-1', 'user-2', 'APPROVED', mockCreator)
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('throws forbidden when member tries to review', async () => {
    prismaMock.campaignParticipant.findUnique.mockResolvedValue({ role: 'MEMBER' })

    await expect(
      reviewWaitlistResponse('campaign-1', 'user-2', 'APPROVED', mockMember)
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('allows admin to review responses', async () => {
    prismaMock.campaignParticipant.findUnique.mockResolvedValue({ role: 'ADMIN' })
    prismaMock.waitlistResponse.findUnique.mockResolvedValue(makeWaitlistResponse())
    prismaMock.waitlistResponse.update.mockResolvedValue(makeWaitlistResponse({ status: 'APPROVED' }))

    await expect(
      reviewWaitlistResponse('campaign-1', 'user-2', 'APPROVED', mockAdmin)
    ).resolves.not.toThrow()
  })
})
