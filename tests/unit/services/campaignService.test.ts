import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeCampaign, makeParticipant } from '../../setup'

// Mock src/lib/prisma with vi.fn() stubs for all methods used by campaignService
vi.mock('../../../src/lib/prisma', () => ({
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
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    prizeDistribution: {
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    campaignInvite: {
      create: vi.fn(),
    },
  },
}))

// Mock src/lib/events to control the publisher singleton and CampaignEvents
vi.mock('../../../src/lib/events', () => ({
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

import { prisma } from '../../../src/lib/prisma'
import { publisher, CampaignEvents } from '../../../src/lib/events'
import {
  mapPlatforms,
  listCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  closeCampaign,
  fundCampaign,
  autoCloseCampaigns,
} from '../../../src/services/campaignService'

// Access mocked prisma methods
const pm = prisma as any

const mockCreator = { userId: 'user-1', email: 'creator@test.com', isStaff: false }
const mockStaff = { userId: 'staff-1', email: 'staff@test.com', isStaff: true }

beforeEach(() => {
  vi.clearAllMocks()
})

// ── mapPlatforms ──────────────────────────────────────────────────────────────

describe('mapPlatforms', () => {
  it('maps tiktok variants correctly', () => {
    expect(mapPlatforms(['tiktok'])).toEqual(['TIKTOK'])
    expect(mapPlatforms(['tik tok'])).toEqual(['TIKTOK'])
    expect(mapPlatforms(['TikTok'])).toEqual(['TIKTOK'])
  })

  it('maps instagram variants correctly', () => {
    expect(mapPlatforms(['instagram'])).toEqual(['INSTAGRAM'])
    expect(mapPlatforms(['insta'])).toEqual(['INSTAGRAM'])
  })

  it('maps youtube variants correctly', () => {
    expect(mapPlatforms(['youtube'])).toEqual(['YOUTUBE'])
    expect(mapPlatforms(['yt'])).toEqual(['YOUTUBE'])
  })

  it('maps twitter variants correctly', () => {
    expect(mapPlatforms(['twitter'])).toEqual(['TWITTER'])
    expect(mapPlatforms(['x'])).toEqual(['TWITTER'])
  })

  it('maps multiple platforms', () => {
    expect(mapPlatforms(['tiktok', 'instagram'])).toEqual(['TIKTOK', 'INSTAGRAM'])
  })

  it('throws badRequest for invalid platform', () => {
    expect(() => mapPlatforms(['facebook'])).toThrow('Invalid platform: facebook')
  })
})

// ── listCampaigns ─────────────────────────────────────────────────────────────

describe('listCampaigns', () => {
  it('returns campaigns with pagination metadata', async () => {
    const campaigns = [makeCampaign()]
    pm.campaign.findMany.mockResolvedValue(campaigns)
    pm.campaign.count.mockResolvedValue(1)

    const result = await listCampaigns({})

    expect(result.campaigns).toEqual(campaigns)
    expect(result.total).toBe(1)
    expect(result.page).toBe(1)
    expect(result.limit).toBe(20)
    expect(result.totalPages).toBe(1)
  })

  it('applies status filter', async () => {
    pm.campaign.findMany.mockResolvedValue([])
    pm.campaign.count.mockResolvedValue(0)

    await listCampaigns({ status: 'ACTIVE' })

    expect(pm.campaign.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'ACTIVE' }) })
    )
  })

  it('applies studioId filter', async () => {
    pm.campaign.findMany.mockResolvedValue([])
    pm.campaign.count.mockResolvedValue(0)

    await listCampaigns({ studioId: 'studio-1' })

    expect(pm.campaign.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ studioId: 'studio-1' }) })
    )
  })

  it('applies createdBy filter', async () => {
    pm.campaign.findMany.mockResolvedValue([])
    pm.campaign.count.mockResolvedValue(0)

    await listCampaigns({ createdBy: 'user-1' })

    expect(pm.campaign.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ createdBy: 'user-1' }) })
    )
  })

  it('applies published filter when true', async () => {
    pm.campaign.findMany.mockResolvedValue([])
    pm.campaign.count.mockResolvedValue(0)

    await listCampaigns({ published: true })

    expect(pm.campaign.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ published: true }) })
    )
  })

  it('respects custom page and limit', async () => {
    pm.campaign.findMany.mockResolvedValue([])
    pm.campaign.count.mockResolvedValue(50)

    const result = await listCampaigns({ page: 3, limit: 5 })

    expect(result.page).toBe(3)
    expect(result.limit).toBe(5)
    expect(result.totalPages).toBe(10)
    expect(pm.campaign.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 5 })
    )
  })
})

// ── getCampaign ───────────────────────────────────────────────────────────────

describe('getCampaign', () => {
  it('returns campaign when found', async () => {
    const campaign = makeCampaign()
    pm.campaign.findUnique.mockResolvedValue(campaign)

    const result = await getCampaign('campaign-1')

    expect(result).toEqual(campaign)
    expect(pm.campaign.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'campaign-1' } })
    )
  })

  it('throws 404 when campaign not found', async () => {
    pm.campaign.findUnique.mockResolvedValue(null)

    await expect(getCampaign('missing-id')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    })
  })
})

// ── createCampaign ────────────────────────────────────────────────────────────

describe('createCampaign', () => {
  const validData = {
    title: 'New Campaign',
    description: 'A great campaign',
    category: 'Gaming',
    platforms: ['tiktok', 'youtube'],
    startDate: '2025-01-01',
    endDate: '2025-12-31',
  }

  it('creates campaign and returns it', async () => {
    const created = makeCampaign({ id: 'new-campaign', title: 'New Campaign' })
    pm.campaign.create.mockResolvedValue(created)
    pm.campaignParticipant.create.mockResolvedValue({})

    const result = await createCampaign(validData, mockCreator)

    expect(result).toEqual(created)
    expect(pm.campaign.create).toHaveBeenCalledOnce()
    expect(pm.campaignParticipant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'user-1', role: 'CREATOR' }),
      })
    )
  })

  it('publishes campaign.created event', async () => {
    const created = makeCampaign()
    pm.campaign.create.mockResolvedValue(created)
    pm.campaignParticipant.create.mockResolvedValue({})

    await createCampaign(validData, mockCreator)

    expect(CampaignEvents.created).toHaveBeenCalledWith(
      expect.objectContaining({ campaignId: created.id, ownerId: mockCreator.userId }),
      'campaign-service'
    )
    expect(publisher.publish).toHaveBeenCalledOnce()
  })

  it('creates prize distributions when leaderboard enabled', async () => {
    const created = makeCampaign({ enableLeaderboard: true })
    pm.campaign.create.mockResolvedValue(created)
    pm.campaignParticipant.create.mockResolvedValue({})
    pm.prizeDistribution.create.mockResolvedValue({})

    await createCampaign(
      {
        ...validData,
        enableLeaderboard: true,
        leaderboardRanks: [
          { position: '1st', reward: 500 },
          { position: '2nd', reward: 300 },
        ],
      },
      mockCreator
    )

    expect(pm.prizeDistribution.create).toHaveBeenCalledTimes(2)
  })

  it('does not create prize distributions when leaderboard disabled', async () => {
    const created = makeCampaign()
    pm.campaign.create.mockResolvedValue(created)
    pm.campaignParticipant.create.mockResolvedValue({})

    await createCampaign(validData, mockCreator)

    expect(pm.prizeDistribution.create).not.toHaveBeenCalled()
  })

  it('creates invites for private campaigns with invitedUsers', async () => {
    const created = makeCampaign({ isPrivate: true })
    pm.campaign.create.mockResolvedValue(created)
    pm.campaignParticipant.create.mockResolvedValue({})
    pm.campaignInvite.create.mockResolvedValue({})

    await createCampaign(
      { ...validData, isPrivate: true, invitedUsers: ['discord-123', 'discord-456'] },
      mockCreator
    )

    expect(pm.campaignInvite.create).toHaveBeenCalledTimes(2)
  })

  it('throws badRequest for invalid platform', async () => {
    await expect(
      createCampaign({ ...validData, platforms: ['facebook'] }, mockCreator)
    ).rejects.toMatchObject({ statusCode: 400, code: 'BAD_REQUEST' })
  })

  it('uses defaults for optional fields', async () => {
    const created = makeCampaign()
    pm.campaign.create.mockResolvedValue(created)
    pm.campaignParticipant.create.mockResolvedValue({})

    await createCampaign(validData, mockCreator)

    expect(pm.campaign.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          currency: 'USD',
          approvalTime: '48h',
          editorSlots: 5,
          published: false,
        }),
      })
    )
  })
})

// ── updateCampaign ────────────────────────────────────────────────────────────

describe('updateCampaign', () => {
  it('allows creator to update campaign', async () => {
    const campaign = makeCampaign({ permissions: null })
    const updated = makeCampaign({ title: 'Updated' })
    pm.campaign.findUnique.mockResolvedValue(campaign)
    pm.campaignParticipant.findUnique.mockResolvedValue(makeParticipant({ role: 'CREATOR' }))
    pm.campaign.update.mockResolvedValue(updated)

    const result = await updateCampaign('campaign-1', { title: 'Updated' }, mockCreator)

    expect(result).toEqual(updated)
  })

  it('allows staff to update campaign', async () => {
    const campaign = makeCampaign()
    pm.campaign.findUnique.mockResolvedValue(campaign)
    pm.campaignParticipant.findUnique.mockResolvedValue(null)
    pm.campaign.update.mockResolvedValue(campaign)

    await expect(updateCampaign('campaign-1', { title: 'X' }, mockStaff)).resolves.toBeDefined()
  })

  it('throws forbidden when non-creator non-staff tries to update', async () => {
    const campaign = makeCampaign()
    pm.campaign.findUnique.mockResolvedValue(campaign)
    pm.campaignParticipant.findUnique.mockResolvedValue(makeParticipant({ role: 'MEMBER' }))

    await expect(
      updateCampaign('campaign-1', { title: 'X' }, { userId: 'other-user', isStaff: false })
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('throws forbidden when admin lacks permission to edit', async () => {
    const campaign = makeCampaign({ permissions: { adminsCanEditCampaign: false } })
    pm.campaign.findUnique.mockResolvedValue(campaign)
    pm.campaignParticipant.findUnique.mockResolvedValue(makeParticipant({ role: 'ADMIN' }))

    await expect(
      updateCampaign('campaign-1', { title: 'X' }, { userId: 'admin-user', isStaff: false })
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('allows admin to update when adminsCanEditCampaign is true', async () => {
    const campaign = makeCampaign({ permissions: { adminsCanEditCampaign: true } })
    pm.campaign.findUnique.mockResolvedValue(campaign)
    pm.campaignParticipant.findUnique.mockResolvedValue(makeParticipant({ role: 'ADMIN' }))
    pm.campaign.update.mockResolvedValue(campaign)

    await expect(
      updateCampaign('campaign-1', { title: 'X' }, { userId: 'admin-user', isStaff: false })
    ).resolves.toBeDefined()
  })

  it('publishes statusChanged event when status changes', async () => {
    const campaign = makeCampaign({ status: 'ACTIVE', permissions: null })
    pm.campaign.findUnique.mockResolvedValue(campaign)
    pm.campaignParticipant.findUnique.mockResolvedValue(makeParticipant({ role: 'CREATOR' }))
    pm.campaign.update.mockResolvedValue({ ...campaign, status: 'PAUSED' })

    await updateCampaign('campaign-1', { status: 'PAUSED' }, mockCreator)

    expect(CampaignEvents.statusChanged).toHaveBeenCalledWith(
      expect.objectContaining({ oldStatus: 'ACTIVE', newStatus: 'PAUSED' }),
      'campaign-service'
    )
  })

  it('does not publish statusChanged event when status unchanged', async () => {
    const campaign = makeCampaign({ status: 'ACTIVE', permissions: null })
    pm.campaign.findUnique.mockResolvedValue(campaign)
    pm.campaignParticipant.findUnique.mockResolvedValue(makeParticipant({ role: 'CREATOR' }))
    pm.campaign.update.mockResolvedValue(campaign)

    await updateCampaign('campaign-1', { title: 'New Title' }, mockCreator)

    expect(CampaignEvents.statusChanged).not.toHaveBeenCalled()
  })

  it('replaces prizeDistributions when included in update', async () => {
    const campaign = makeCampaign({ permissions: null })
    pm.campaign.findUnique.mockResolvedValue(campaign)
    pm.campaignParticipant.findUnique.mockResolvedValue(makeParticipant({ role: 'CREATOR' }))
    pm.prizeDistribution.deleteMany.mockResolvedValue({ count: 2 })
    pm.prizeDistribution.create.mockResolvedValue({})
    pm.campaign.update.mockResolvedValue(campaign)

    await updateCampaign(
      'campaign-1',
      { prizeDistributions: [{ position: '1st', reward: 500 }] },
      mockCreator
    )

    expect(pm.prizeDistribution.deleteMany).toHaveBeenCalledWith({ where: { campaignId: 'campaign-1' } })
    expect(pm.prizeDistribution.create).toHaveBeenCalledOnce()
  })
})

// ── deleteCampaign ────────────────────────────────────────────────────────────

describe('deleteCampaign', () => {
  it('allows creator to delete campaign', async () => {
    pm.campaign.findUnique.mockResolvedValue(makeCampaign())
    pm.campaignParticipant.findUnique.mockResolvedValue(makeParticipant({ role: 'CREATOR' }))
    pm.campaign.delete.mockResolvedValue({})

    await expect(deleteCampaign('campaign-1', mockCreator)).resolves.not.toThrow()
    expect(pm.campaign.delete).toHaveBeenCalledWith({ where: { id: 'campaign-1' } })
  })

  it('allows staff to delete campaign', async () => {
    pm.campaign.findUnique.mockResolvedValue(makeCampaign())
    pm.campaignParticipant.findUnique.mockResolvedValue(null)
    pm.campaign.delete.mockResolvedValue({})

    await expect(deleteCampaign('campaign-1', mockStaff)).resolves.not.toThrow()
  })

  it('throws forbidden when non-creator tries to delete without permission', async () => {
    pm.campaign.findUnique.mockResolvedValue(
      makeCampaign({ permissions: { adminsCanDeleteCampaign: false } })
    )
    pm.campaignParticipant.findUnique.mockResolvedValue(makeParticipant({ role: 'MEMBER' }))

    await expect(
      deleteCampaign('campaign-1', { userId: 'other-user', isStaff: false })
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('allows delete when non-creator has adminsCanDeleteCampaign permission', async () => {
    pm.campaign.findUnique.mockResolvedValue(
      makeCampaign({ permissions: { adminsCanDeleteCampaign: true } })
    )
    pm.campaignParticipant.findUnique.mockResolvedValue(makeParticipant({ role: 'ADMIN' }))
    pm.campaign.delete.mockResolvedValue({})

    await expect(
      deleteCampaign('campaign-1', { userId: 'admin-user', isStaff: false })
    ).resolves.not.toThrow()
  })
})

// ── closeCampaign ─────────────────────────────────────────────────────────────

describe('closeCampaign', () => {
  it('closes an active campaign', async () => {
    const campaign = makeCampaign({ status: 'ACTIVE' })
    const closed = makeCampaign({ status: 'ENDED' })
    pm.campaign.findUnique.mockResolvedValue(campaign)
    pm.campaignParticipant.findUnique.mockResolvedValue(makeParticipant({ role: 'CREATOR' }))
    pm.campaign.update.mockResolvedValue(closed)

    const result = await closeCampaign('campaign-1', mockCreator)

    expect(result.status).toBe('ENDED')
    expect(CampaignEvents.ended).toHaveBeenCalledWith(
      expect.objectContaining({ campaignId: 'campaign-1', endReason: 'MANUAL' }),
      'campaign-service'
    )
  })

  it('throws conflict when campaign is already ended', async () => {
    pm.campaign.findUnique.mockResolvedValue(makeCampaign({ status: 'ENDED' }))

    await expect(closeCampaign('campaign-1', mockCreator)).rejects.toMatchObject({
      statusCode: 409,
      code: 'CONFLICT',
    })
  })

  it('throws forbidden when non-creator tries to close', async () => {
    pm.campaign.findUnique.mockResolvedValue(makeCampaign({ status: 'ACTIVE' }))
    pm.campaignParticipant.findUnique.mockResolvedValue(makeParticipant({ role: 'MEMBER' }))

    await expect(
      closeCampaign('campaign-1', { userId: 'member-user', isStaff: false })
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('allows staff to close campaign', async () => {
    const campaign = makeCampaign({ status: 'ACTIVE' })
    pm.campaign.findUnique.mockResolvedValue(campaign)
    pm.campaignParticipant.findUnique.mockResolvedValue(null)
    pm.campaign.update.mockResolvedValue(makeCampaign({ status: 'ENDED' }))

    await expect(closeCampaign('campaign-1', mockStaff)).resolves.toBeDefined()
  })
})

// ── fundCampaign ──────────────────────────────────────────────────────────────

describe('fundCampaign', () => {
  it('funds a campaign and calculates platform fee', async () => {
    const campaign = makeCampaign({ createdBy: 'user-1', isFunded: false, totalBudget: 1000 })
    const funded = makeCampaign({ isFunded: true, platformFee: 100, remainingBudget: 900 })
    pm.campaign.findUnique.mockResolvedValue(campaign)
    pm.campaign.update.mockResolvedValue(funded)

    const result = await fundCampaign('campaign-1', mockCreator)

    expect(result.isFunded).toBe(true)
    expect(pm.campaign.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isFunded: true, platformFee: 100, remainingBudget: 900 }),
      })
    )
  })

  it('publishes funded event', async () => {
    const campaign = makeCampaign({ createdBy: 'user-1', isFunded: false, totalBudget: 1000 })
    pm.campaign.findUnique.mockResolvedValue(campaign)
    pm.campaign.update.mockResolvedValue(makeCampaign({ isFunded: true }))

    await fundCampaign('campaign-1', mockCreator)

    expect(CampaignEvents.funded).toHaveBeenCalledWith(
      expect.objectContaining({ campaignId: 'campaign-1', amount: 1000, fundedBy: 'user-1' }),
      'campaign-service'
    )
  })

  it('throws conflict when campaign is already funded', async () => {
    pm.campaign.findUnique.mockResolvedValue(
      makeCampaign({ createdBy: 'user-1', isFunded: true })
    )

    await expect(fundCampaign('campaign-1', mockCreator)).rejects.toMatchObject({
      statusCode: 409,
      code: 'CONFLICT',
    })
  })

  it('throws forbidden when non-creator tries to fund', async () => {
    pm.campaign.findUnique.mockResolvedValue(makeCampaign({ createdBy: 'other-user', isFunded: false }))

    await expect(
      fundCampaign('campaign-1', { userId: 'user-1', isStaff: false })
    ).rejects.toMatchObject({ statusCode: 403 })
  })
})

// ── autoCloseCampaigns ────────────────────────────────────────────────────────

describe('autoCloseCampaigns', () => {
  it('closes all active campaigns past their end date', async () => {
    const expired = [
      { id: 'c1', enableLeaderboard: false, approvedClips: 10, totalViews: 1000, spentBudget: 500 },
      { id: 'c2', enableLeaderboard: true, approvedClips: 5, totalViews: 200, spentBudget: 100 },
    ]
    pm.campaign.findMany.mockResolvedValue(expired)
    pm.campaign.update.mockResolvedValue({})

    const count = await autoCloseCampaigns()

    expect(count).toBe(2)
    expect(pm.campaign.update).toHaveBeenCalledTimes(2)
    expect(CampaignEvents.ended).toHaveBeenCalledTimes(2)
    expect(CampaignEvents.ended).toHaveBeenCalledWith(
      expect.objectContaining({ endReason: 'DATE_REACHED' }),
      'campaign-service'
    )
  })

  it('returns 0 when no expired campaigns', async () => {
    pm.campaign.findMany.mockResolvedValue([])

    const count = await autoCloseCampaigns()

    expect(count).toBe(0)
  })

  it('continues processing if one campaign fails to close', async () => {
    const expired = [
      { id: 'c1', enableLeaderboard: false, approvedClips: 0, totalViews: 0, spentBudget: 0 },
      { id: 'c2', enableLeaderboard: false, approvedClips: 0, totalViews: 0, spentBudget: 0 },
    ]
    pm.campaign.findMany.mockResolvedValue(expired)
    pm.campaign.update
      .mockRejectedValueOnce(new Error('DB error'))
      .mockResolvedValueOnce({})

    const count = await autoCloseCampaigns()

    expect(count).toBe(1)
  })
})
