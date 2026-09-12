import type {
    AuditEventPage,
} from '../../src/features/audit/auditLog.types';
import {
    loginAs,
} from '../support/e2eAuth';

const forbiddenResponse = {
    error: {
        code: 'FORBIDDEN',
        message:
            'You do not have permission to perform this action.',
    },
};

describe('Admin Audit Log', () => {
    it('allows ADMIN to navigate, filter, and inspect audit events', () => {
        cy.intercept(
            'GET',
            '**/api/audit-events*',
        ).as('listAuditEvents');

        loginAs('ADMIN');

        cy.get('a[href="/audit"]')
            .should('be.visible')
            .and('have.text', 'Audit Log');

        cy.get('a[href="/audit"]')
            .should('not.have.attr', 'target');

        cy.get('a[href="/audit"]').click();

        cy.location('pathname').should(
            'eq',
            '/audit',
        );

        cy.wait('@listAuditEvents').then(
            ({ response }) => {
                expect(response?.statusCode).to.equal(
                    200,
                );

                const page =
                    response?.body as AuditEventPage;

                expect(
                    page.items.length,
                ).to.be.greaterThan(0);
            },
        );

        cy.contains(
            'h1',
            'Audit Log',
        ).should('be.visible');

        cy.get(
            '[data-testid="audit-event-row"]',
        ).should(
            'have.length.greaterThan',
            0,
        );

        cy.contains(
            'button',
            'Security',
        ).click();

        cy.get('select[name="outcome"]')
            .select('SUCCESS');

        cy.contains(
            'button',
            'Apply filters',
        ).click();

        cy.wait('@listAuditEvents').then(
            ({ request, response }) => {
                expect(request.url)
                    .to.include('category=SECURITY')
                    .and.include('outcome=SUCCESS');

                expect(response?.statusCode).to.equal(
                    200,
                );
            },
        );

        cy.contains(
            'button',
            'Security',
        ).should(
            'have.attr',
            'aria-pressed',
            'true',
        );

        cy.get(
            '[data-testid="audit-event-row"]',
        )
            .first()
            .click();

        cy.get('.audit-event-detail')
            .should('be.visible')
            .and('contain.text', 'Event ID');

        cy.contains(
            'button',
            'Close details',
        ).click();

        cy.get(
            '.audit-event-detail',
        ).should('not.exist');

        cy.contains(
            'button',
            'Clear filters',
        ).click();

        cy.wait('@listAuditEvents').then(
            ({ request, response }) => {
                expect(
                    new URL(request.url).search,
                ).to.equal('');

                expect(response?.statusCode).to.equal(
                    200,
                );
            },
        );

        cy.contains(
            'button',
            'All',
        ).should(
            'have.attr',
            'aria-pressed',
            'true',
        );
    });

    it('hides navigation and blocks direct route and API access for a non-admin', () => {
        let auditUiRequestCount = 0;

        cy.intercept(
            'GET',
            '**/api/audit-events*',
            (request) => {
                auditUiRequestCount += 1;
                request.continue();
            },
        );

        loginAs('ORDER_OPERATOR');

        cy.get(
            'a[href="/audit"]',
        ).should('not.exist');

        cy.visit('/audit');

        cy.location('pathname').should(
            'eq',
            '/audit',
        );

        cy.contains(
            'h1',
            'Forbidden',
        ).should('be.visible');

        cy.contains('403').should('be.visible');

        cy.then(() => {
            expect(auditUiRequestCount).to.equal(0);
        });

        cy.request({
            method: 'GET',
            url: '/api/audit-events',
            failOnStatusCode: false,
        }).then((response) => {
            expect(response.status).to.equal(403);

            expect(response.body).to.deep.equal(
                forbiddenResponse,
            );
        });
    });
});