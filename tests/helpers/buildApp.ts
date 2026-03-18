// ── App builder ───────────────────────────────────────────────────────────────
//
// This file is intentionally NOT listed in vitest.config.mts `setupFiles`.
// It is imported directly by test files that need a running Fastify instance.
// This ensures all vi.mock() calls in those test files are hoisted and resolved
// before these route modules are first imported.

import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import { campaignRoutes } from '../../src/routes/campaigns'
import { participantRoutes } from '../../src/routes/participants'
import { waitlistRoutes } from '../../src/routes/waitlist'
import { permissionRoutes } from '../../src/routes/permissions'
import { analyticsRoutes } from '../../src/routes/analytics'
import { leaderboardRoutes } from '../../src/routes/leaderboard'

export async function buildApp() {
  const app = Fastify({ logger: false })

  await app.register(cors, { origin: '*', credentials: true })
  await app.register(helmet)

  app.get('/health', async () => ({ status: 'ok', service: 'campaign-service' }))
  app.get('/ready', async () => ({ status: 'ready', service: 'campaign-service' }))

  await app.register(campaignRoutes, { prefix: '/campaigns' })
  await app.register(participantRoutes, { prefix: '/campaigns' })
  await app.register(waitlistRoutes, { prefix: '/campaigns' })
  await app.register(permissionRoutes, { prefix: '/campaigns' })
  await app.register(analyticsRoutes, { prefix: '/campaigns' })
  await app.register(leaderboardRoutes, { prefix: '/campaigns' })

  return app
}
