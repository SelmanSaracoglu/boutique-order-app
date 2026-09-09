import { sanitizeLogText } from '../logging/structuredLogger.js'

export const LOGIN_RATE_LIMIT_MAX_FAILURES = 5

export const LOGIN_RATE_LIMIT_WINDOW_MS =
  15 * 60 * 1000

const MAX_TRACKED_LOGIN_KEYS = 10_000
const MAX_SOURCE_IP_LENGTH = 64
const MAX_USERNAME_LENGTH = 64

type LoginFailureState = {
  failureCount: number
  windowStartedAt: number
}

export type LoginRateLimitDecision =
  | {
      allowed: true
    }
  | {
      allowed: false
      retryAfterSeconds: number
    }

type LoginRateLimiterOptions = {
  maximumFailures?: number
  windowMs?: number
  maximumTrackedKeys?: number
  now?: () => number
}

function requirePositiveInteger(
  value: number,
  name: string,
): number {
  if (
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new Error(
      `${name} must be a positive integer`,
    )
  }

  return value
}

function buildLoginRateLimitKey(
  sourceIp: string,
  attemptedUsername: string,
): string {
  const normalizedSourceIp =
    sanitizeLogText(
      sourceIp,
      MAX_SOURCE_IP_LENGTH,
    ) || 'unknown'

  const normalizedUsername =
    sanitizeLogText(
      attemptedUsername.toLowerCase(),
      MAX_USERNAME_LENGTH,
    ) || 'unknown'

  return `${normalizedSourceIp}\u0000${normalizedUsername}`
}

export class LoginRateLimiter {
  private readonly failureStates =
    new Map<string, LoginFailureState>()

  private readonly maximumFailures: number
  private readonly windowMs: number
  private readonly maximumTrackedKeys: number
  private readonly now: () => number

  constructor(
    options: LoginRateLimiterOptions = {},
  ) {
    this.maximumFailures =
      requirePositiveInteger(
        options.maximumFailures ??
          LOGIN_RATE_LIMIT_MAX_FAILURES,
        'maximumFailures',
      )

    this.windowMs =
      requirePositiveInteger(
        options.windowMs ??
          LOGIN_RATE_LIMIT_WINDOW_MS,
        'windowMs',
      )

    this.maximumTrackedKeys =
      requirePositiveInteger(
        options.maximumTrackedKeys ??
          MAX_TRACKED_LOGIN_KEYS,
        'maximumTrackedKeys',
      )

    this.now = options.now ?? Date.now
  }

  check(
    sourceIp: string,
    attemptedUsername: string,
  ): LoginRateLimitDecision {
    const now = this.now()

    const key = buildLoginRateLimitKey(
      sourceIp,
      attemptedUsername,
    )

    const state = this.readActiveState(
      key,
      now,
    )

    if (
      !state ||
      state.failureCount <
        this.maximumFailures
    ) {
      return {
        allowed: true,
      }
    }

    const windowEndsAt =
      state.windowStartedAt + this.windowMs

    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil(
          (windowEndsAt - now) / 1000,
        ),
      ),
    }
  }

  recordFailure(
    sourceIp: string,
    attemptedUsername: string,
  ): void {
    const now = this.now()

    const key = buildLoginRateLimitKey(
      sourceIp,
      attemptedUsername,
    )

    const existingState =
      this.readActiveState(key, now)

    if (existingState) {
      existingState.failureCount += 1
      return
    }

    this.ensureCapacity(now)

    this.failureStates.set(key, {
      failureCount: 1,
      windowStartedAt: now,
    })
  }

  reset(
    sourceIp: string,
    attemptedUsername: string,
  ): void {
    const key = buildLoginRateLimitKey(
      sourceIp,
      attemptedUsername,
    )

    this.failureStates.delete(key)
  }

  clear(): void {
    this.failureStates.clear()
  }

  private readActiveState(
    key: string,
    now: number,
  ): LoginFailureState | null {
    const state =
      this.failureStates.get(key)

    if (!state) {
      return null
    }

    const hasExpired =
      now - state.windowStartedAt >=
      this.windowMs

    if (hasExpired) {
      this.failureStates.delete(key)
      return null
    }

    return state
  }

  private ensureCapacity(now: number): void {
    if (
      this.failureStates.size <
      this.maximumTrackedKeys
    ) {
      return
    }

    for (
      const [key, state]
      of this.failureStates
    ) {
      const hasExpired =
        now - state.windowStartedAt >=
        this.windowMs

      if (hasExpired) {
        this.failureStates.delete(key)
      }
    }

    if (
      this.failureStates.size <
      this.maximumTrackedKeys
    ) {
      return
    }

    const oldestKey =
      this.failureStates.keys().next().value

    if (oldestKey !== undefined) {
      this.failureStates.delete(oldestKey)
    }
  }
}

export const loginRateLimiter =
  new LoginRateLimiter()