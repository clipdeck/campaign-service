import { vi } from 'vitest'

// ── Env is set via vitest.config.mts `env:` option ───────────────────────────

// ── Mock PrismaClient at the @prisma/client level so the singleton in
//    src/lib/prisma.ts never connects to a real database ──────────────────────

vi.mock('@prisma/client', () => {
  const makeModel = () => ({
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
    upsert: vi.fn(),
    updateMany: vi.fn(),
  })

  const PrismaClient = vi.fn().mockImplementation(() => ({
    campaign: makeModel(),
    campaignParticipant: makeModel(),
    campaignPermissions: makeModel(),
    campaignApplication: makeModel(),
    campaignInvite: makeModel(),
    leaderboardEntry: makeModel(),
    prizeDistribution: makeModel(),
    waitlistQuestion: makeModel(),
    waitlistResponse: makeModel(),
    waitlistBan: makeModel(),
  }))

  return { PrismaClient }
})

// ── Mock @clipdeck/events publisher globally ──────────────────────────────────

vi.mock('@clipdeck/events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@clipdeck/events')>()
  return {
    ...actual,
    createPublisher: vi.fn().mockReturnValue({
      publish: vi.fn().mockResolvedValue(undefined),
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
    }),
    createConsumer: vi.fn().mockReturnValue({
      on: vi.fn(),
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
    }),
  }
})

// ── Prisma mock factory helpers ───────────────────────────────────────────────

export function makeCampaign(overrides: Partial<Record<string, any>> = {}): Record<string, any> {
  return {
    id: 'campaign-1',
    title: 'Test Campaign',
    description: 'A test campaign',
    category: 'Gaming',
    image: null,
    createdBy: 'user-1',
    startDate: new Date('2025-01-01'),
    endDate: new Date('2025-12-31'),
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    archivedAt: null,
    lastStatsRefreshedAt: null,
    platforms: ['TIKTOK'],
    tags: [],
    hashtags: [],
    languages: [],
    clipDuration: '10s',
    minResolution: '1080p',
    orientation: null,
    geoRestrictions: '',
    requirements: null,
    resources: [],
    countryOrigin: null,
    paymentType: 'CLIP',
    paymentMethod: 'Transferencia',
    basePay: 0,
    rewardPerView: 0,
    totalBudget: 1000,
    maxPay: 0,
    currency: 'USD',
    approvalTime: '48h',
    limitPerEditor: 0,
    limitPerClip: 0,
    limitClipsPerClipper: 0,
    minViewCount: 0,
    editorSlots: 5,
    published: true,
    status: 'ACTIVE',
    approvedClips: 0,
    pendingClips: 0,
    rejectedClips: 0,
    totalViews: 0,
    viewsLast24h: 0,
    remainingBudget: 0,
    spentBudget: 0,
    campaignType: 'AUTO_JOIN',
    enableLeaderboard: false,
    leaderboardMetric: 'VIEWS',
    leaderboardName: null,
    leaderboardPrizePool: 0,
    notifyOnApproval: true,
    notifyOnSubmission: true,
    discordChannelId: null,
    discordPrivateChannelId: null,
    creatorRoleId: null,
    adminRoleId: null,
    isPrivate: false,
    areClipsPublic: true,
    showParticipantCount: true,
    isFunded: false,
    platformFee: 0,
    paymentCap: 0,
    paymentCapMetric: 'VIEWS',
    walletAddress: null,
    walletId: null,
    txHash: null,
    walletData: null,
    studioId: null,
    permissions: null,
    prizeDistributions: [],
    _count: { participants: 1, applications: 0 },
    ...overrides,
  }
}

export function makeParticipant(overrides: Partial<Record<string, any>> = {}): Record<string, any> {
  return {
    id: 'participant-1',
    campaignId: 'campaign-1',
    userId: 'user-1',
    role: 'MEMBER',
    status: 'ACCEPTED',
    ...overrides,
  }
}

export function makeWaitlistQuestion(overrides: Partial<Record<string, any>> = {}): Record<string, any> {
  return {
    id: 'question-1',
    campaignId: 'campaign-1',
    question: 'Why do you want to join?',
    order: 1,
    createdAt: new Date('2025-01-01'),
    ...overrides,
  }
}

export function makeWaitlistResponse(overrides: Partial<Record<string, any>> = {}): Record<string, any> {
  return {
    id: 'response-1',
    campaignId: 'campaign-1',
    userId: 'user-2',
    answers: { q1: 'Because I want to' },
    status: 'PENDING',
    reviewedBy: null,
    reviewedAt: null,
    note: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  }
}

export function makePermissions(overrides: Partial<Record<string, any>> = {}): Record<string, any> {
  return {
    id: 'perms-1',
    campaignId: 'campaign-1',
    adminsCanReviewClips: true,
    adminsCanManageTeam: true,
    adminsCanEditCampaign: false,
    adminsCanAddBudget: false,
    adminsCanDeleteCampaign: false,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  }
}

export function makeAuthHeaders(overrides: Partial<Record<string, string>> = {}): Record<string, string> {
  return {
    'x-user-id': 'user-1',
    'x-user-email': 'test@example.com',
    'x-user-name': 'Test User',
    'x-user-staff': 'false',
    ...overrides,
  }
}

// ── buildApp is in tests/helpers/buildApp.ts ─────────────────────────────────
//
// The app builder is NOT exported from this file. It lives in helpers/buildApp.ts
// so that route module imports happen only when a test explicitly imports that
// helper — after all vi.mock() hoisting has already taken place.
