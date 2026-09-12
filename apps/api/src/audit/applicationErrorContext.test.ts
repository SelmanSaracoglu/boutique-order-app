import type {
  Request,
} from 'express'
import {
  describe,
  expect,
  it,
} from 'vitest'
import type {
  SessionUser,
} from '../auth/sessionUserRepository.js'
import {
  buildApplicationErrorEvent,
} from './applicationErrorContext.js'
import type {
  AuditOperation,
} from './requestAuditEvent.js'

type TestRequestOptions = {
  method: string
  baseUrl: string
  routePath: string | null
  params?: Record<string, string>
  authenticatedUser?: SessionUser
}

function createRequest(
  options: TestRequestOptions,
): Request {
  const request = {
    method: options.method,
    baseUrl: options.baseUrl,
    route:
      options.routePath === null
        ? undefined
        : {
          path:
            options.routePath,
        },
    params: options.params ?? {},
    requestContext: {
      requestId:
        'dc688972-7771-49fe-9d3f-20479241b95a',
      startedAt: 1n,
      sourceIp: '127.0.0.1',
      userAgent:
        'application-error-context-test',
    },
  } as unknown as Request

  if (options.authenticatedUser) {
    request.authenticatedUser =
      options.authenticatedUser
  }

  return request
}

describe('Application error context', () => {
  it.each(
    [
      [
        'POST',
        '/api/auth',
        '/login',
        'AUTH_LOGIN',
      ],
      [
        'GET',
        '/api/auth',
        '/session',
        'AUTHENTICATE_REQUEST',
      ],
      [
        'POST',
        '/api/auth',
        '/logout',
        'AUTH_LOGOUT',
      ],
      [
        'GET',
        '/api/audit-events',
        '/',
        'VIEW_AUDIT_LOG',
      ],
      [
        'POST',
        '/api/orders',
        '/',
        'CREATE_ORDER',
      ],
      [
        'GET',
        '/api/orders',
        '/',
        'LIST_ORDERS',
      ],
      [
        'GET',
        '/api/orders',
        '/:orderId',
        'VIEW_ORDER_DETAIL',
      ],
      [
        'PATCH',
        '/api/orders',
        '/:orderId/status',
        'UPDATE_ORDER_STATUS',
      ],
      [
        'POST',
        '/api/orders',
        '/:orderId/payment-report',
        'REPORT_PAYMENT',
      ],
      [
        'POST',
        '/api/orders',
        '/:orderId/payment-confirmation',
        'CONFIRM_PAYMENT',
      ],
    ] as const,
  )('maps %s %s%s to %s',
    (
      method,
      baseUrl,
      routePath,
      expectedOperation:
        AuditOperation,
    ) => {
      const event =
        buildApplicationErrorEvent(
          createRequest({
            method,
            baseUrl,
            routePath,
          }),
        )

      expect(
        event.request.operation,
      ).toBe(expectedOperation)

      expect(
        event.request.route,
      ).toBe(
        `${baseUrl}${routePath}`,
      )
    },
  )
  it('uses the audit log target for audit read failures', () => {
    const event =
      buildApplicationErrorEvent(
        createRequest({
          method: 'GET',
          baseUrl:
            '/api/audit-events',
          routePath: '/',
          authenticatedUser: {
            id: 7,
            username: 'admin',
            role: 'ADMIN',
          },
        }),
      )

    expect(
      event.request.operation,
    ).toBe('VIEW_AUDIT_LOG')

    expect(event.target).toEqual({
      resourceType: 'AUDIT_LOG',
      resourceId: 'audit-events',
    })
  },
  )

  it('uses the authenticated actor and valid order target', () => {
    const event =
      buildApplicationErrorEvent(
        createRequest({
          method: 'PATCH',
          baseUrl: '/api/orders',
          routePath:
            '/:orderId/status',
          params: {
            orderId: '42',
          },
          authenticatedUser: {
            id: 19,
            username:
              'fulfillment.operator',
            role:
              'FULFILLMENT_OPERATOR',
          },
        }),
      )

    expect(event).toEqual({
      errorCode:
        'UNEXPECTED_ERROR',
      actor: {
        type: 'USER',
        user: {
          id: 19,
          username:
            'fulfillment.operator',
          role:
            'FULFILLMENT_OPERATOR',
        },
      },
      target: {
        resourceType: 'ORDER',
        resourceId: '42',
      },
      request: {
        requestId:
          'dc688972-7771-49fe-9d3f-20479241b95a',
        operation:
          'UPDATE_ORDER_STATUS',
        method: 'PATCH',
        route:
          '/api/orders/:orderId/status',
        status: 500,
        sourceIp:
          '127.0.0.1',
        userAgent:
          'application-error-context-test',
      },
    })
  },
  )

  it('does not use an invalid order ID as an audit target', () => {
    const event =
      buildApplicationErrorEvent(
        createRequest({
          method: 'GET',
          baseUrl: '/api/orders',
          routePath:
            '/:orderId',
          params: {
            orderId:
              '42\r\nforged-target',
          },
        }),
      )

    expect(event.actor).toEqual({
      type: 'ANONYMOUS',
    })

    expect(event.target).toEqual({
      resourceType:
        'APPLICATION',
      resourceId: 'api',
    })
  },
  )

  it('uses safe fallbacks for an unmatched route', () => {
    const event =
      buildApplicationErrorEvent(
        createRequest({
          method: 'DELETE',
          baseUrl: '',
          routePath: null,
        }),
      )

    expect(
      event.request.operation,
    ).toBe(
      'HANDLE_API_REQUEST',
    )

    expect(
      event.request.route,
    ).toBe('UNMATCHED')

    expect(event.target).toEqual({
      resourceType:
        'APPLICATION',
      resourceId: 'api',
    })
  },
  )
},
)