import { MemoryRouter } from 'react-router-dom';

import { AuthGate } from '../../../src/features/auth/AuthGate';
import { AuthenticatedAppShell } from '../../../src/features/auth/AuthenticatedAppShell';
import { AuthProvider } from '../../../src/features/auth/AuthProvider';

const authenticatedSession = {
  user: {
    id: 1,
    username: 'admin.user',
    role: 'ADMIN',
  },
  csrfToken: 'test-csrf-token',
};

function mountAuthenticatedShell() {
  cy.mount(
    <MemoryRouter>
      <AuthProvider>
        <AuthGate>
          <AuthenticatedAppShell>
            <main>
              <h1>Orders content</h1>
            </main>
          </AuthenticatedAppShell>
        </AuthGate>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('AuthenticatedAppShell', () => {
  beforeEach(() => {
    cy.intercept(
      'GET',
      '**/api/auth/session',
      {
        statusCode: 200,
        body: authenticatedSession,
      },
    ).as('getSession');
  });

  it('shows the authenticated user and role', () => {
    mountAuthenticatedShell();

    cy.wait('@getSession');

    cy.contains('admin.user').should(
      'be.visible',
    );

    cy.contains('Administrator').should(
      'be.visible',
    );

    cy.contains('Orders content').should(
      'be.visible',
    );
  });

  it('signs out once and returns to the login screen', () => {
    cy.intercept(
      'POST',
      '**/api/auth/logout',
      {
        statusCode: 204,
        delay: 300,
      },
    ).as('logout');

    mountAuthenticatedShell();

    cy.wait('@getSession');

    cy.contains('button', 'Sign out').click();

    cy.contains(
      'button',
      'Signing out...',
    ).should('be.disabled');

    cy.wait('@logout').then(({ request }) => {
      expect(request.headers).to.have.property(
        'x-csrf-token',
        'test-csrf-token',
      );
    });

    cy.get('@logout.all').should(
      'have.length',
      1,
    );

    cy.contains(
      'button',
      'Sign in',
    ).should('be.visible');

    cy.contains('Orders content').should(
      'not.exist',
    );
  });

  it('keeps the session active after a logout failure', () => {
    cy.intercept(
      'POST',
      '**/api/auth/logout',
      {
        statusCode: 500,
        body: {
          error: {
            code: 'INTERNAL_ERROR',
          },
        },
      },
    ).as('logout');

    mountAuthenticatedShell();

    cy.wait('@getSession');

    cy.contains('button', 'Sign out').click();

    cy.wait('@logout');

    cy.contains(
      'Sign out failed. Please try again.',
    ).should('be.visible');

    cy.contains(
      'button',
      'Sign out',
    ).should('be.enabled');

    cy.contains('Orders content').should(
      'be.visible',
    );
  });
});