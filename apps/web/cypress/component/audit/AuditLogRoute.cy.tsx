import {
    MemoryRouter,
    useLocation,
} from 'react-router-dom';

import App from '../../../src/App';
import type { UserRole } from '../../../src/features/auth/auth.types';
import { AuthenticatedTestProvider } from '../../support/AuthenticatedTestProvider';

function LocationProbe() {
    const location = useLocation();

    return (
        <span data-testid="location">
            {location.pathname}
        </span>
    );
}

function mountAuditRoute(
    role: UserRole,
) {
    cy.mount(
        <AuthenticatedTestProvider role={role}>
            <MemoryRouter
                initialEntries={['/audit']}
            >
                <App />
                <LocationProbe />
            </MemoryRouter>
        </AuthenticatedTestProvider>,
    );
}

describe('Audit Log route', () => {
    it('renders the Audit Log page for ADMIN', () => {
        cy.intercept(
            'GET',
            '**/api/audit-events',
            {
                statusCode: 200,
                body: {
                    items: [],
                    nextCursor: null,
                },
            },
        ).as('listAuditEvents');

        mountAuditRoute('ADMIN');

        cy.wait('@listAuditEvents');

        cy.contains('h1', 'Audit Log').should(
            'be.visible',
        );

        cy.contains('Forbidden').should(
            'not.exist',
        );

        cy.get('[data-testid="location"]').should(
            'have.text',
            '/audit',
        );
    });

    const nonAdminRoles: readonly UserRole[] = [
        'ORDER_OPERATOR',
        'PAYMENT_OPERATOR',
        'FULFILLMENT_OPERATOR',
    ];

    for (const role of nonAdminRoles) {
        it(`renders a controlled forbidden state for ${role}`, () => {
            mountAuditRoute(role);

            cy.contains('403').should(
                'be.visible',
            );

            cy.contains(
                'h1',
                'Forbidden',
            ).should('be.visible');

            cy.contains(
                'h1',
                'Audit Log',
            ).should('not.exist');

            cy.contains(
                'a',
                'Return to orders',
            )
                .should('have.attr', 'href', '/')
                .and('not.have.attr', 'target');

            cy.get('[data-testid="location"]').should(
                'have.text',
                '/audit',
            );
        });
    }
});