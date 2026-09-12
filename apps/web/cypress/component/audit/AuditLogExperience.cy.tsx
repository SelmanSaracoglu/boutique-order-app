import {
    MemoryRouter,
} from 'react-router-dom';

import {
    AuditLogPage,
} from '../../../src/features/audit/AuditLogPage';

const errorEvent = {
    id: '42',
    occurredAt:
        '2026-03-10T10:00:00.000Z',
    category: 'ERROR',
    action: 'APPLICATION_ERROR',
    outcome: 'FAILURE',
    severity: 'ERROR',
    actor: {
        type: 'USER',
        username: 'admin',
        role: 'ADMIN',
    },
    target: {
        resourceType: 'APPLICATION',
        resourceId: 'api',
    },
    requestId:
        '00000000-0000-4000-8000-000000000042',
    detail: {
        operation: 'HANDLE_API_REQUEST',
        http: {
            method: 'GET',
            route: '/api/orders',
            status: 500,
        },
        reasonCode: null,
        errorCode: 'DB_ERROR',
        stateTransition: null,
        attributes: null,

        stack: 'Sensitive raw stack trace',
        sql: 'SELECT customer_data',
        token: 'super-secret-token',
        requestBody: {
            customerName: 'Sensitive Customer',
        },
    },
    cookie: 'super-secret-cookie',
    sessionId: 'super-secret-session',
};

const olderEvent = {
    ...errorEvent,
    id: '41',
    occurredAt:
        '2026-03-10T09:00:00.000Z',
    category: 'SECURITY',
    action: 'AUTH_LOGIN_FAILED',
    target: {
        resourceType: 'AUTHENTICATION',
        resourceId: 'login',
    },
};

function mountAuditLogPage() {
    cy.mount(
        <MemoryRouter>
            <AuditLogPage />
        </MemoryRouter>,
    );
}

describe('Audit Log experience', () => {
    it('applies combined filters and shows allowlisted inline details', () => {
        cy.intercept(
            'GET',
            '**/api/audit-events*',
            {
                statusCode: 200,
                body: {
                    items: [errorEvent],
                    nextCursor: null,
                },
            },
        ).as('listAuditEvents');

        mountAuditLogPage();

        cy.wait('@listAuditEvents');

        cy.contains('button', 'All').should(
            'have.attr',
            'aria-pressed',
            'true',
        );

        cy.contains('button', 'Errors').click();

        cy.get('select[name="outcome"]')
            .select('FAILURE');

        cy.get('input[name="fromDate"]')
            .type('2026-03-10');

        cy.get('input[name="toDate"]')
            .type('2026-03-11');

        cy.get('input[name="username"]')
            .type('admin');

        cy.get('input[name="orderId"]')
            .type('42');

        cy.get('input[name="requestId"]')
            .type(
                '00000000-0000-4000-8000-000000000042',
            );

        cy.contains(
            'button',
            'Apply filters',
        ).click();

        cy.wait('@listAuditEvents').then(
            (interception) => {
                expect(interception.request.url)
                    .to.include('category=ERROR')
                    .and.include('outcome=FAILURE')
                    .and.include(
                        'from=2026-03-10T00%3A00%3A00.000Z',
                    )
                    .and.include(
                        'to=2026-03-11T23%3A59%3A59.999Z',
                    )
                    .and.include('username=admin')
                    .and.include('orderId=42')
                    .and.include(
                        'requestId=00000000-0000-4000-8000-000000000042',
                    );
            },
        );

        cy.contains(
            'button',
            'Errors',
        ).should(
            'have.attr',
            'aria-pressed',
            'true',
        );

        cy.get(
            '[data-testid="audit-event-row"]',
        ).click();

        cy.contains(
            '.audit-event-detail__field',
            'Event ID',
        ).should('contain.text', '42');

        cy.contains(
            '.audit-event-detail__field',
            'Request ID',
        ).should(
            'contain.text',
            errorEvent.requestId,
        );

        cy.contains(
            '.audit-event-detail__field',
            'Operation',
        ).should(
            'contain.text',
            'Handle api request',
        );

        cy.contains(
            '.audit-event-detail__field',
            'HTTP route',
        ).should(
            'contain.text',
            '/api/orders',
        );

        cy.contains(
            '.audit-event-detail__field',
            'Error code',
        ).should(
            'contain.text',
            'Db error',
        );

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
            )
            .and(
                'not.contain.text',
                'super-secret-cookie',
            )
            .and(
                'not.contain.text',
                'super-secret-session',
            );

        cy.contains(
            'button',
            'Close details',
        ).click();

        cy.get(
            '.audit-event-detail',
        ).should('not.exist');
    });

    it('appends the next deterministic page without reordering events', () => {
        cy.intercept(
            'GET',
            '**/api/audit-events*',
            (request) => {
                if (
                    request.url.includes(
                        'cursor=next-page-cursor',
                    )
                ) {
                    request.reply({
                        statusCode: 200,
                        body: {
                            items: [olderEvent],
                            nextCursor: null,
                        },
                    });

                    return;
                }

                request.reply({
                    statusCode: 200,
                    body: {
                        items: [errorEvent],
                        nextCursor:
                            'next-page-cursor',
                    },
                });
            },
        ).as('listAuditEvents');

        mountAuditLogPage();

        cy.wait('@listAuditEvents');

        cy.contains(
            'button',
            'Load more',
        ).click();

        cy.wait('@listAuditEvents').then(
            (interception) => {
                expect(
                    interception.request.url,
                ).to.include(
                    'cursor=next-page-cursor',
                );
            },
        );

        cy.get(
            '[data-testid="audit-event-row"]',
        ).should('have.length', 2);

        cy.get(
            '[data-testid="audit-event-row"]',
        )
            .eq(0)
            .should(
                'contain.text',
                'Application error',
            );

        cy.get(
            '[data-testid="audit-event-row"]',
        )
            .eq(1)
            .should(
                'contain.text',
                'Auth login failed',
            );

        cy.contains(
            'button',
            'Load more',
        ).should('not.exist');
    });
});