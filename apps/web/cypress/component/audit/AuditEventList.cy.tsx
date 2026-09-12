import {
    AuditEventList,
} from '../../../src/features/audit/AuditEventList';
import type {
    AuditEventSummary,
} from '../../../src/features/audit/auditLog.types';

const newestEvent: AuditEventSummary = {
    id: '42',
    occurredAt:
        '2026-03-10T10:00:00.000Z',
    category: 'PRODUCT',
    action: 'ORDER_CANCELLED',
    outcome: 'REJECTED',
    severity: 'WARN',
    actor: {
        type: 'USER',
        username: 'admin',
        role: 'ADMIN',
    },
    target: {
        resourceType: 'ORDER',
        resourceId: '42',
    },
    requestId:
        '00000000-0000-4000-8000-000000000042',
    detail: {
        operation: 'UPDATE_ORDER_STATUS',
        http: {
            method: 'PATCH',
            route:
                '/api/orders/:orderId/status',
            status: 409,
        },
        reasonCode:
            'INVALID_STATUS_TRANSITION',
        errorCode: null,
        stateTransition: {
            previousOrderStatus: 'NEW',
            newOrderStatus: 'CANCELLED',
            previousPaymentStatus:
                'AWAITING_PAYMENT',
            newPaymentStatus:
                'AWAITING_PAYMENT',
        },
        attributes: null,
    },
};

const olderEvent: AuditEventSummary = {
    ...newestEvent,
    id: '41',
    occurredAt:
        '2026-03-10T09:00:00.000Z',
    category: 'SECURITY',
    action: 'AUTH_LOGIN_FAILED',
    outcome: 'FAILURE',
    severity: 'ERROR',
    actor: {
        type: 'ANONYMOUS',
        username: null,
        role: null,
    },
    target: {
        resourceType: 'AUTHENTICATION',
        resourceId: 'login',
    },
};

describe('AuditEventList', () => {
    it('renders readable summaries without changing API ordering', () => {
        cy.mount(
            <AuditEventList
                events={[
                    newestEvent,
                    olderEvent,
                ]}
            />,
        );

        cy.get(
            '[data-testid="audit-event-row"]',
        ).should('have.length', 2);

        cy.get(
            '[data-testid="audit-event-row"]',
        )
            .eq(0)
            .should('contain.text', 'Order cancelled')
            .and('contain.text', 'admin')
            .and('contain.text', 'Admin')
            .and('contain.text', 'Order #42')
            .and('contain.text', 'Rejected')
            .and('contain.text', 'Warn');

        cy.get(
            '[data-testid="audit-event-row"]',
        )
            .eq(1)
            .should(
                'contain.text',
                'Auth login failed',
            )
            .and('contain.text', 'Anonymous')
            .and(
                'contain.text',
                'Authentication · login',
            )
            .and('contain.text', 'Failure')
            .and('contain.text', 'Error');

        cy.get('time')
            .eq(0)
            .should(
                'have.attr',
                'datetime',
                newestEvent.occurredAt,
            );
    });

    it('does not render unexpected sensitive response fields', () => {
        const eventWithUnexpectedFields = {
            ...newestEvent,
            stack:
                'Sensitive raw stack trace',
            sql:
                'SELECT customer_data',
            token:
                'super-secret-token',
            requestBody: {
                customerName:
                    'Sensitive Customer',
            },
        };

        cy.mount(
            <AuditEventList
                events={[
                    eventWithUnexpectedFields,
                ]}
            />,
        );

        cy.contains(
            'Order cancelled',
        ).should('be.visible');

        cy.get('body')
            .should(
                'not.contain.text',
                'Sensitive raw stack trace',
            )
            .and(
                'not.contain.text',
                'SELECT customer_data',
            )
            .and(
                'not.contain.text',
                'super-secret-token',
            )
            .and(
                'not.contain.text',
                'Sensitive Customer',
            );
    });
});