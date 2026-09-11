import type {
    Request,
} from 'express'
import {
    buildRequestAuditMetadata,
    resolveRequestAuditRoute,
} from './auditRequestMetadata.js'
import {
    APPLICATION_ERROR_CODE,
    type ApplicationErrorEventInput,
} from './applicationErrorEvent.js'
import type {
    AuditOperation,
    RequestAuditActor,
    RequestAuditTarget,
} from './requestAuditEvent.js'

const APPLICATION_ERROR_OPERATIONS:
    Readonly<
        Record<string, AuditOperation>
    > = {
    'POST /api/auth/login':
        'AUTH_LOGIN',
    'GET /api/auth/session':
        'AUTHENTICATE_REQUEST',
    'POST /api/auth/logout':
        'AUTH_LOGOUT',
    'POST /api/orders/':
        'CREATE_ORDER',
    'GET /api/orders/':
        'LIST_ORDERS',
    'GET /api/orders/:orderId':
        'VIEW_ORDER_DETAIL',
    'PATCH /api/orders/:orderId/status':
        'UPDATE_ORDER_STATUS',
    'POST /api/orders/:orderId/payment-report':
        'REPORT_PAYMENT',
    'POST /api/orders/:orderId/payment-confirmation':
        'CONFIRM_PAYMENT',
}


type ApplicationErrorRoutePattern = {
    method: string
    pattern: RegExp
    route: string
}

const APPLICATION_ERROR_ROUTE_PATTERNS:
    ApplicationErrorRoutePattern[] = [
        {
            method: 'POST',
            pattern:
                /^\/api\/auth\/login\/?$/,
            route: '/api/auth/login',
        },
        {
            method: 'GET',
            pattern:
                /^\/api\/auth\/session\/?$/,
            route: '/api/auth/session',
        },
        {
            method: 'POST',
            pattern:
                /^\/api\/auth\/logout\/?$/,
            route: '/api/auth/logout',
        },
        {
            method: 'POST',
            pattern: /^\/api\/orders\/?$/,
            route: '/api/orders/',
        },
        {
            method: 'GET',
            pattern: /^\/api\/orders\/?$/,
            route: '/api/orders/',
        },
        {
            method: 'GET',
            pattern:
                /^\/api\/orders\/[^/]+\/?$/,
            route: '/api/orders/:orderId',
        },
        {
            method: 'PATCH',
            pattern:
                /^\/api\/orders\/[^/]+\/status\/?$/,
            route:
                '/api/orders/:orderId/status',
        },
        {
            method: 'POST',
            pattern:
                /^\/api\/orders\/[^/]+\/payment-report\/?$/,
            route:
                '/api/orders/:orderId/payment-report',
        },
        {
            method: 'POST',
            pattern:
                /^\/api\/orders\/[^/]+\/payment-confirmation\/?$/,
            route:
                '/api/orders/:orderId/payment-confirmation',
        },
    ]

function resolveApplicationErrorRoute(
    request: Request,
): string {
    const originalPath =
        typeof request.originalUrl === 'string'
            ? request.originalUrl.split('?')[0] ?? ''
            : ''

    const matchedRoute =
        APPLICATION_ERROR_ROUTE_PATTERNS.find(
            ({ method, pattern }) =>
                method === request.method &&
                pattern.test(originalPath),
        )

    return (
        matchedRoute?.route ??
        resolveRequestAuditRoute(request)
    )
}

function resolveApplicationErrorOperation(
    method: string,
    route: string,
): AuditOperation {
    const operationKey =
        `${method.toUpperCase()} ${route}`

    return (
        APPLICATION_ERROR_OPERATIONS[
        operationKey
        ] ?? 'HANDLE_API_REQUEST'
    )
}

function resolveApplicationErrorActor(
    request: Request,
): RequestAuditActor {
    const authenticatedUser =
        request.authenticatedUser

    if (!authenticatedUser) {
        return {
            type: 'ANONYMOUS',
        }
    }

    return {
        type: 'USER',
        user: {
            id: authenticatedUser.id,
            username:
                authenticatedUser.username,
            role: authenticatedUser.role,
        },
    }
}

function readOrderResourceId(
    request: Request,
): string | null {
    const orderId =
        request.params.orderId

    if (
        typeof orderId !== 'string' ||
        !/^[1-9]\d*$/.test(orderId)
    ) {
        return null
    }

    const numericOrderId =
        Number(orderId)

    if (
        !Number.isSafeInteger(
            numericOrderId,
        )
    ) {
        return null
    }

    return String(numericOrderId)
}

function resolveApplicationErrorTarget(
    request: Request,
    route: string,
): RequestAuditTarget {
    const orderResourceId =
        readOrderResourceId(request)

    if (
        route.includes(':orderId') &&
        orderResourceId !== null
    ) {
        return {
            resourceType: 'ORDER',
            resourceId: orderResourceId,
        }
    }

    if (route === '/api/auth/login') {
        return {
            resourceType:
                'AUTHENTICATION',
            resourceId: 'login',
        }
    }

    if (
        route === '/api/auth/session' ||
        route === '/api/auth/logout'
    ) {
        return {
            resourceType: 'SESSION',
            resourceId: 'current',
        }
    }

    return {
        resourceType: 'APPLICATION',
        resourceId: 'api',
    }
}

export function buildApplicationErrorEvent(
    request: Request,
): ApplicationErrorEventInput {
    const route =
        resolveApplicationErrorRoute(request)

    return {
        errorCode:
            APPLICATION_ERROR_CODE,
        actor:
            resolveApplicationErrorActor(
                request,
            ),
        target:
            resolveApplicationErrorTarget(
                request,
                route,
            ),
        request:
            buildRequestAuditMetadata(
                request,
                {
                    operation:
                        resolveApplicationErrorOperation(
                            request.method,
                            route,
                        ),
                    route,
                    status: 500,
                },
            ),
    }
}