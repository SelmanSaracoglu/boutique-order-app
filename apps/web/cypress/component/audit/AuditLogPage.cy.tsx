import { StrictMode } from 'react';
import {
    MemoryRouter,
} from 'react-router-dom';

import {
    AuditLogPage,
} from '../../../src/features/audit/AuditLogPage';

function mountAuditLogPage(
    strictMode = false,
) {
    const page = (
        <MemoryRouter>
            <AuditLogPage />
        </MemoryRouter>
    );

    cy.mount(
        strictMode
            ? <StrictMode>{page}</StrictMode>
            : page,
    );
}

describe('AuditLogPage', () => {
    it('loads once under StrictMode and shows the empty state', () => {
        let requestCount = 0;

        cy.intercept(
            'GET',
            '**/api/audit-events',
            (request) => {
                requestCount += 1;

                request.reply({
                    statusCode: 200,
                    delay: 300,
                    body: {
                        items: [],
                        nextCursor: null,
                    },
                });
            },
        ).as('listAuditEvents');

        mountAuditLogPage(true);

        cy.contains(
            'Loading audit events...',
        ).should('be.visible');

        cy.wait('@listAuditEvents');

        cy.contains(
            'No audit events found',
        ).should('be.visible');

        cy.then(() => {
            expect(requestCount).to.equal(1);
        });
    });

    it('shows a controlled error and retries successfully', () => {
        let requestCount = 0;

        cy.intercept(
            'GET',
            '**/api/audit-events',
            (request) => {
                requestCount += 1;

                if (requestCount === 1) {
                    request.reply({
                        statusCode: 500,
                        body: {
                            error: {
                                code: 'INTERNAL_ERROR',
                            },
                        },
                    });

                    return;
                }

                request.reply({
                    statusCode: 200,
                    delay: 300,
                    body: {
                        items: [],
                        nextCursor: null,
                    },
                });
            },
        ).as('listAuditEvents');

        mountAuditLogPage();

        cy.wait('@listAuditEvents');

        cy.contains(
            'Audit events could not be loaded.',
        ).should('be.visible');

        cy.contains(
            'button',
            'Try again',
        ).click();

        cy.contains(
            'Loading audit events...',
        ).should('be.visible');

        cy.wait('@listAuditEvents');

        cy.contains(
            'No audit events found',
        ).should('be.visible');

        cy.contains(
            'Audit events could not be loaded.',
        ).should('not.exist');
    });

    it('shows the forbidden state when the API returns 403', () => {
        cy.intercept(
            'GET',
            '**/api/audit-events',
            {
                statusCode: 403,
                body: {
                    error: {
                        code: 'FORBIDDEN',
                        message:
                            'You do not have permission to perform this action.',
                    },
                },
            },
        ).as('listAuditEvents');

        mountAuditLogPage();

        cy.wait('@listAuditEvents');

        cy.contains('403').should('be.visible');

        cy.contains(
            'h1',
            'Forbidden',
        ).should('be.visible');

        cy.get('a[href="/"]')
            .should('have.text', 'Return to orders')
            .and('not.have.attr', 'target');
    });
});