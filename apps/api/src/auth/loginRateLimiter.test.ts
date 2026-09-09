import {
  describe,
  expect,
  it,
} from 'vitest'
import {
  LOGIN_RATE_LIMIT_MAX_FAILURES,
  LOGIN_RATE_LIMIT_WINDOW_MS,
  LoginRateLimiter,
} from './loginRateLimiter.js'

describe('LoginRateLimiter', () => {
  it('blocks requests after the maximum number of failures', () => {
    let currentTime = 1_000

    const limiter = new LoginRateLimiter({
      now: () => currentTime,
    })

    for (
      let failureCount = 0;
      failureCount <
      LOGIN_RATE_LIMIT_MAX_FAILURES;
      failureCount += 1
    ) {
      expect(
        limiter.check(
          '127.0.0.1',
          'order.operator',
        ),
      ).toEqual({
        allowed: true,
      })

      limiter.recordFailure(
        '127.0.0.1',
        'order.operator',
      )
    }

    expect(
      limiter.check(
        '127.0.0.1',
        'order.operator',
      ),
    ).toEqual({
      allowed: false,
      retryAfterSeconds:
        LOGIN_RATE_LIMIT_WINDOW_MS / 1_000,
    })

    currentTime += 1_000

    expect(
      limiter.check(
        '127.0.0.1',
        'order.operator',
      ),
    ).toEqual({
      allowed: false,
      retryAfterSeconds:
        LOGIN_RATE_LIMIT_WINDOW_MS /
          1_000 -
        1,
    })
  })

  it('allows requests after the failure window expires', () => {
    let currentTime = 10_000

    const limiter = new LoginRateLimiter({
      maximumFailures: 2,
      windowMs: 10_000,
      now: () => currentTime,
    })

    limiter.recordFailure(
      '127.0.0.1',
      'order.operator',
    )

    limiter.recordFailure(
      '127.0.0.1',
      'order.operator',
    )

    expect(
      limiter.check(
        '127.0.0.1',
        'order.operator',
      ),
    ).toEqual({
      allowed: false,
      retryAfterSeconds: 10,
    })

    currentTime += 9_500

    expect(
      limiter.check(
        '127.0.0.1',
        'order.operator',
      ),
    ).toEqual({
      allowed: false,
      retryAfterSeconds: 1,
    })

    currentTime += 500

    expect(
      limiter.check(
        '127.0.0.1',
        'order.operator',
      ),
    ).toEqual({
      allowed: true,
    })
  })

   it('resets only the matching source and username', () => {
    const limiter = new LoginRateLimiter({
      maximumFailures: 1,
    })

    limiter.recordFailure(
      '127.0.0.1',
      'Order.Operator',
    )

    expect(
      limiter.check(
        '127.0.0.1',
        'order.operator',
      ),
    ).toEqual({
      allowed: false,
      retryAfterSeconds:
        LOGIN_RATE_LIMIT_WINDOW_MS / 1_000,
    })

    expect(
      limiter.check(
        '127.0.0.1',
        'payment.operator',
      ),
    ).toEqual({
      allowed: true,
    })

    expect(
      limiter.check(
        '127.0.0.2',
        'order.operator',
      ),
    ).toEqual({
      allowed: true,
    })

    limiter.reset(
      '127.0.0.1',
      'ORDER.OPERATOR',
    )

    expect(
      limiter.check(
        '127.0.0.1',
        'order.operator',
      ),
    ).toEqual({
      allowed: true,
    })
  })

  it('evicts the oldest entry when capacity is reached', () => {
    const limiter = new LoginRateLimiter({
      maximumFailures: 1,
      maximumTrackedKeys: 2,
    })

    limiter.recordFailure(
      '127.0.0.1',
      'first.user',
    )

    limiter.recordFailure(
      '127.0.0.1',
      'second.user',
    )

    limiter.recordFailure(
      '127.0.0.1',
      'third.user',
    )

    expect(
      limiter.check(
        '127.0.0.1',
        'first.user',
      ),
    ).toEqual({
      allowed: true,
    })

    expect(
      limiter.check(
        '127.0.0.1',
        'second.user',
      ).allowed,
    ).toBe(false)

    expect(
      limiter.check(
        '127.0.0.1',
        'third.user',
      ).allowed,
    ).toBe(false)
  })
})