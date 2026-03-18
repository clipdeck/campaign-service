import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeCampaign, makeParticipant } from '../../setup'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../../src/lib/prisma', () => ({
  prisma: {
    campaign: {
      findUnique: vi.fn(),
    },
    campaignParticipant: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    waitlistBan: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    waitlistResponse: {
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    campaignApplication: {
      updateMany: vi.fn(),
    },
  },
}))

vi.mock('../../../src/lib/events', () => ({
  publisher: {
    publish: vi.fn().mockResolvedValue(undefined),
  },
  CampaignEvents: {
    participantJoined: vi.fn().mockReturnValue({ type: 'campaign.participant_joined', payload: {} }),
    participantLeft: vi.fn().mockReturnValue({ type: 'campaign.participant_left', payload: {} }),
  },
  SERVICE_NAME: 'campaign-service',
}))

import { prisma } from '../../../src/lib/prisma'
import { publisher, CampaignEvents } from '../../../src/lib/events'
import {
  getParticipantRole,
  joinCampaign,
  approveParticipant,
  removeParticipant,
  banParticipant,
  getTeamMembers,
  manageParticipant,
} from '../../../src/services/participantService'

const prismaMock = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>

const mockUser = { userId: 'user-2', email: 'user@test.com', isStaff: false }
const mockCreatorUser = { userId: 'user-1', email: 'creator@test.com', isStaff: false }
const mockStaff = { userId: 'staff-1', email: 'staff@test.com', isStaff: true }

beforeEach(() => {
  vi.clearAllMocks()
})

// ── getParticipantRole ────────────────────────────────────────────────────────

describe('getParticipantRole', () => {
  it('returns role when participant found', async () => {
    prismaMock.campaignParticipant.findUnique.mockResolvedValue(makeParticipant({ role: 'CREATOR' }))

    const role = await getParticipantRole('campaign-1', 'user-1')

    expect(role).toBe('CREATOR')
  })

  it('returns null when participant not found', async () => {
    prismaMock.campaignParticipant.findUnique.mockResolvedValue(null)

    const role = await getParticipantRole('campaign-1', 'unknown-user')

    expect(role).toBeNull()
  })
})

// ── joinCampaign ──────────────────────────────────────────────────────────────

describe('joinCampaign', () => {
  it('joins AUTO_JOIN campaign as MEMBER', async () => {
    const campaign = makeCampaign({ status: 'ACTIVE', campaignType: 'AUTO_JOIN', editorSlots: 5, _count: { participants: 2 } })
    prismaMock.campaign.findUnique.mockResolvedValue(campaign)
    prismaMock.campaignParticipant.findUnique
      .mockResolvedValueOnce(null) // existing check
      .mockResolvedValueOnce(null) // ban check (waitlistBan mock)
    prismaMock.waitlistBan.findUnique.mockResolvedValue(null)
    prismaMock.campaignParticipant.create.mockResolvedValue({})

    const result = await joinCampaign('campaign-1', mockUser)

    expect(result.role).toBe('MEMBER')
    expect(result.campaignType).toBe('AUTO_JOIN')
    expect(CampaignEvents.participantJoined).toHaveBeenCalledWith(
      expect.objectContaining({ joinMethod: 'DIRECT' }),
      'campaign-service'
    )
  })

  it('joins WAITLIST campaign as PENDING', async () => {
    const campaign = makeCampaign({
      status: 'ACTIVE',
      campaignType: 'WAITLIST',
      editorSlots: 5,
      _count: { participants: 1 },
    })
    prismaMock.campaign.findUnique.mockResolvedValue(campaign)
    prismaMock.campaignParticipant.findUnique.mockResolvedValue(null)
    prismaMock.waitlistBan.findUnique.mockResolvedValue(null)
    prismaMock.campaignParticipant.create.mockResolvedValue({})

    const result = await joinCampaign('campaign-1', mockUser, { q1: 'my answer' })

    expect(result.role).toBe('PENDING')
    expect(CampaignEvents.participantJoined).toHaveBeenCalledWith(
      expect.objectContaining({ joinMethod: 'WAITLIST' }),
      'campaign-service'
    )
  })

  it('saves waitlist responses for WAITLIST campaigns', async () => {
    const campaign = makeCampaign({
      status: 'ACTIVE',
      campaignType: 'WAITLIST',
      _count: { participants: 1 },
    })
    prismaMock.campaign.findUnique.mockResolvedValue(campaign)
    prismaMock.campaignParticipant.findUnique.mockResolvedValue(null)
    prismaMock.waitlistBan.findUnique.mockResolvedValue(null)
    prismaMock.campaignParticipant.create.mockResolvedValue({})
    prismaMock.waitlistResponse.create.mockResolvedValue({})

    await joinCampaign('campaign-1', mockUser, { q1: 'answer' })

    expect(prismaMock.waitlistResponse.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: mockUser.userId, status: 'PENDING' }),
      })
    )
  })

  it('does not save waitlist responses for AUTO_JOIN campaigns', async () => {
    const campaign = makeCampaign({
      status: 'ACTIVE',
      campaignType: 'AUTO_JOIN',
      _count: { participants: 1 },
    })
    prismaMock.campaign.findUnique.mockResolvedValue(campaign)
    prismaMock.campaignParticipant.findUnique.mockResolvedValue(null)
    prismaMock.waitlistBan.findUnique.mockResolvedValue(null)
    prismaMock.campaignParticipant.create.mockResolvedValue({})

    await joinCampaign('campaign-1', mockUser, { q1: 'answer' })

    expect(prismaMock.waitlistResponse.create).not.toHaveBeenCalled()
  })

  it('throws 404 when campaign not found', async () => {
    prismaMock.campaign.findUnique.mockResolvedValue(null)

    await expect(joinCampaign('missing', mockUser)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('throws badRequest when campaign is not active', async () => {
    prismaMock.campaign.findUnique.mockResolvedValue(makeCampaign({ status: 'ENDED' }))

    await expect(joinCampaign('campaign-1', mockUser)).rejects.toMatchObject({
      statusCode: 400,
      message: 'Campaign is not active',
    })
  })

  it('throws conflict when user is already a participant', async () => {
    prismaMock.campaign.findUnique.mockResolvedValue(makeCampaign({ status: 'ACTIVE' }))
    prismaMock.campaignParticipant.findUnique.mockResolvedValue(makeParticipant())

    await expect(joinCampaign('campaign-1', mockUser)).rejects.toMatchObject({ statusCode: 409 })
  })

  it('throws forbidden when user is banned', async () => {
    prismaMock.campaign.findUnique.mockResolvedValue(makeCampaign({ status: 'ACTIVE', campaignType: 'AUTO_JOIN' }))
    prismaMock.campaignParticipant.findUnique.mockResolvedValue(null)
    prismaMock.waitlistBan.findUnique.mockResolvedValue({ id: 'ban-1', userId: mockUser.userId })

    await expect(joinCampaign('campaign-1', mockUser)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('throws forbidden when AUTO_JOIN campaign is full', async () => {
    const campaign = makeCampaign({
      status: 'ACTIVE',
      campaignType: 'AUTO_JOIN',
      editorSlots: 3,
      _count: { participants: 3 },
    })
    prismaMock.campaign.findUnique.mockResolvedValue(campaign)
    prismaMock.campaignParticipant.findUnique.mockResolvedValue(null)
    prismaMock.waitlistBan.findUnique.mockResolvedValue(null)

    await expect(joinCampaign('campaign-1', mockUser)).rejects.toMatchObject({
      statusCode: 403,
      message: 'Campaign is full',
    })
  })
})

// ── approveParticipant ────────────────────────────────────────────────────────

describe('approveParticipant', () => {
  it('promotes PENDING participant to MEMBER', async () => {
    const campaign = makeCampaign({ _count: { participants: 2 }, editorSlots: 10 })
    prismaMock.campaign.findUnique.mockResolvedValue(campaign)
    prismaMock.campaignParticipant.findUnique.mockResolvedValue(makeParticipant({ role: 'CREATOR' }))
    prismaMock.campaignParticipant.update.mockResolvedValue(makeParticipant({ role: 'MEMBER' }))
    prismaMock.waitlistResponse.updateMany.mockResolvedValue({})

    const result = await approveParticipant('campaign-1', 'user-2', mockCreatorUser)

    expect(prismaMock.campaignParticipant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { role: 'MEMBER' },
      })
    )
    expect(CampaignEvents.participantJoined).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-2', role: 'MEMBER', joinMethod: 'WAITLIST' }),
      'campaign-service'
    )
  })

  it('throws 404 when campaign not found', async () => {
    prismaMock.campaign.findUnique.mockResolvedValue(null)

    await expect(approveParticipant('missing', 'user-2', mockCreatorUser)).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('throws forbidden when requester lacks permission', async () => {
    prismaMock.campaign.findUnique.mockResolvedValue(makeCampaign())
    prismaMock.campaignParticipant.findUnique.mockResolvedValue(makeParticipant({ role: 'MEMBER' }))

    await expect(
      approveParticipant('campaign-1', 'user-2', { userId: 'member-user', isStaff: false })
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('throws forbidden when campaign is full', async () => {
    const campaign = makeCampaign({ _count: { participants: 5 }, editorSlots: 5 })
    prismaMock.campaign.findUnique.mockResolvedValue(campaign)
    prismaMock.campaignParticipant.findUnique.mockResolvedValue(makeParticipant({ role: 'CREATOR' }))

    await expect(approveParticipant('campaign-1', 'user-2', mockCreatorUser)).rejects.toMatchObject({
      statusCode: 403,
      message: 'Campaign is full',
    })
  })
})

// ── removeParticipant ─────────────────────────────────────────────────────────

describe('removeParticipant', () => {
  it('allows creator to remove a participant', async () => {
    prismaMock.campaignParticipant.findUnique.mockResolvedValue(makeParticipant({ role: 'CREATOR' }))
    prismaMock.campaignParticipant.delete.mockResolvedValue({})

    await expect(removeParticipant('campaign-1', 'user-2', mockCreatorUser)).resolves.not.toThrow()
    expect(prismaMock.campaignParticipant.delete).toHaveBeenCalledOnce()
    expect(CampaignEvents.participantLeft).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-2', reason: 'KICKED' }),
      'campaign-service'
    )
  })

  it('throws forbidden when non-creator tries to remove', async () => {
    prismaMock.campaignParticipant.findUnique.mockResolvedValue(makeParticipant({ role: 'MEMBER' }))

    await expect(
      removeParticipant('campaign-1', 'user-2', { userId: 'member-user', isStaff: false })
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('throws badRequest when user tries to remove themselves', async () => {
    prismaMock.campaignParticipant.findUnique.mockResolvedValue(makeParticipant({ role: 'CREATOR' }))

    await expect(
      removeParticipant('campaign-1', 'user-1', mockCreatorUser)
    ).rejects.toMatchObject({ statusCode: 400, message: 'Cannot remove yourself' })
  })

  it('sends BANNED reason when reason is ban', async () => {
    prismaMock.campaignParticipant.findUnique.mockResolvedValue(makeParticipant({ role: 'CREATOR' }))
    prismaMock.campaignParticipant.delete.mockResolvedValue({})

    await removeParticipant('campaign-1', 'user-2', mockCreatorUser, 'ban')

    expect(CampaignEvents.participantLeft).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'BANNED' }),
      'campaign-service'
    )
  })
})

// ── banParticipant ────────────────────────────────────────────────────────────

describe('banParticipant', () => {
  it('bans a participant (creates ban record, removes participant, rejects applications)', async () => {
    prismaMock.campaignParticipant.findUnique.mockResolvedValue(makeParticipant({ role: 'CREATOR' }))
    prismaMock.waitlistBan.create.mockResolvedValue({})
    prismaMock.campaignParticipant.deleteMany.mockResolvedValue({ count: 1 })
    prismaMock.campaignApplication.updateMany.mockResolvedValue({ count: 0 })

    await banParticipant('campaign-1', 'user-2', mockCreatorUser, 'Cheating')

    expect(prismaMock.waitlistBan.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'user-2', reason: 'Cheating' }),
      })
    )
    expect(prismaMock.campaignParticipant.deleteMany).toHaveBeenCalledOnce()
    expect(prismaMock.campaignApplication.updateMany).toHaveBeenCalledOnce()
    expect(CampaignEvents.participantLeft).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'BANNED' }),
      'campaign-service'
    )
  })

  it('throws forbidden when non-creator/non-admin/non-staff tries to ban', async () => {
    prismaMock.campaignParticipant.findUnique.mockResolvedValue(makeParticipant({ role: 'MEMBER' }))

    await expect(
      banParticipant('campaign-1', 'user-2', { userId: 'member-user', isStaff: false })
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it('allows admin to ban', async () => {
    prismaMock.campaignParticipant.findUnique.mockResolvedValue(makeParticipant({ role: 'ADMIN' }))
    prismaMock.waitlistBan.create.mockResolvedValue({})
    prismaMock.campaignParticipant.deleteMany.mockResolvedValue({})
    prismaMock.campaignApplication.updateMany.mockResolvedValue({})

    await expect(
      banParticipant('campaign-1', 'user-2', { userId: 'admin-user', isStaff: false })
    ).resolves.not.toThrow()
  })
})

// ── getTeamMembers ────────────────────────────────────────────────────────────

describe('getTeamMembers', () => {
  it('returns participants for a campaign', async () => {
    const members = [makeParticipant({ role: 'CREATOR' }), makeParticipant({ userId: 'user-2', role: 'MEMBER' })]
    prismaMock.campaignParticipant.findMany.mockResolvedValue(members)

    const result = await getTeamMembers('campaign-1')

    expect(result).toEqual(members)
    expect(prismaMock.campaignParticipant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { campaignId: 'campaign-1' } })
    )
  })
})

// ── manageParticipant ─────────────────────────────────────────────────────────

describe('manageParticipant', () => {
  it('promotes a member to admin', async () => {
    prismaMock.campaignParticipant.findUnique.mockResolvedValue(makeParticipant({ role: 'CREATOR' }))
    prismaMock.campaignParticipant.update.mockResolvedValue(makeParticipant({ role: 'ADMIN' }))

    const result = await manageParticipant('campaign-1', 'user-2', 'PROMOTE', mockCreatorUser)

    expect(prismaMock.campaignParticipant.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { role: 'ADMIN' } })
    )
  })

  it('demotes an admin to member', async () => {
    prismaMock.campaignParticipant.findUnique.mockResolvedValue(makeParticipant({ role: 'CREATOR' }))
    prismaMock.campaignParticipant.update.mockResolvedValue(makeParticipant({ role: 'MEMBER' }))

    await manageParticipant('campaign-1', 'user-2', 'DEMOTE', mockCreatorUser)

    expect(prismaMock.campaignParticipant.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { role: 'MEMBER' } })
    )
  })

  it('delegates REMOVE to removeParticipant', async () => {
    prismaMock.campaignParticipant.findUnique.mockResolvedValue(makeParticipant({ role: 'CREATOR' }))
    prismaMock.campaignParticipant.delete.mockResolvedValue({})

    await manageParticipant('campaign-1', 'user-2', 'REMOVE', mockCreatorUser)

    expect(prismaMock.campaignParticipant.delete).toHaveBeenCalledOnce()
  })

  it('throws forbidden when non-creator tries to manage', async () => {
    prismaMock.campaignParticipant.findUnique.mockResolvedValue(makeParticipant({ role: 'MEMBER' }))

    await expect(
      manageParticipant('campaign-1', 'user-2', 'PROMOTE', { userId: 'member-user', isStaff: false })
    ).rejects.toMatchObject({ statusCode: 403 })
  })
})
