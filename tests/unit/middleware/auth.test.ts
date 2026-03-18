import { describe, it, expect } from 'vitest'
import { getAuthUser, requireAuth, requireStaff } from '../../../src/middleware/auth'
import type { FastifyRequest } from 'fastify'

// Helper to build a minimal FastifyRequest-like object with headers
function makeRequest(headers: Record<string, string> = {}): FastifyRequest {
  return { headers } as unknown as FastifyRequest
}

// ── getAuthUser ───────────────────────────────────────────────────────────────

describe('getAuthUser', () => {
  it('returns null when x-user-id header is missing', () => {
    const req = makeRequest({})
    expect(getAuthUser(req)).toBeNull()
  })

  it('returns AuthUser when x-user-id is present', () => {
    const req = makeRequest({ 'x-user-id': 'user-1' })
    const user = getAuthUser(req)
    expect(user).not.toBeNull()
    expect(user?.userId).toBe('user-1')
  })

  it('includes all available headers in AuthUser', () => {
    const req = makeRequest({
      'x-user-id': 'user-1',
      'x-user-discord-id': 'discord-99',
      'x-user-email': 'user@test.com',
      'x-user-name': 'Test User',
      'x-user-staff': 'true',
    })
    const user = getAuthUser(req)
    expect(user?.userId).toBe('user-1')
    expect(user?.discordId).toBe('discord-99')
    expect(user?.email).toBe('user@test.com')
    expect(user?.name).toBe('Test User')
    expect(user?.isStaff).toBe(true)
  })

  it('sets isStaff to false when x-user-staff is not true', () => {
    const req = makeRequest({ 'x-user-id': 'user-1', 'x-user-staff': 'false' })
    const user = getAuthUser(req)
    expect(user?.isStaff).toBe(false)
  })
})

// ── requireAuth ───────────────────────────────────────────────────────────────

describe('requireAuth', () => {
  it('returns AuthUser when authenticated', () => {
    const req = makeRequest({ 'x-user-id': 'user-1' })
    const user = requireAuth(req)
    expect(user.userId).toBe('user-1')
  })

  it('throws 401 when not authenticated', () => {
    const req = makeRequest({})
    expect(() => requireAuth(req)).toThrow()
    try {
      requireAuth(req)
    } catch (e: any) {
      expect(e.statusCode).toBe(401)
      expect(e.code).toBe('UNAUTHORIZED')
    }
  })
})

// ── requireStaff ──────────────────────────────────────────────────────────────

describe('requireStaff', () => {
  it('returns AuthUser when user is staff', () => {
    const req = makeRequest({ 'x-user-id': 'staff-1', 'x-user-staff': 'true' })
    const user = requireStaff(req)
    expect(user.userId).toBe('staff-1')
    expect(user.isStaff).toBe(true)
  })

  it('throws 401 when not authenticated', () => {
    const req = makeRequest({})
    try {
      requireStaff(req)
      expect.fail('should have thrown')
    } catch (e: any) {
      expect(e.statusCode).toBe(401)
    }
  })

  it('throws 403 when authenticated but not staff', () => {
    const req = makeRequest({ 'x-user-id': 'user-1', 'x-user-staff': 'false' })
    try {
      requireStaff(req)
      expect.fail('should have thrown')
    } catch (e: any) {
      expect(e.statusCode).toBe(403)
      expect(e.code).toBe('FORBIDDEN')
    }
  })
})
