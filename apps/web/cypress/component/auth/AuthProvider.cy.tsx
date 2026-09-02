import { AuthProvider } from '../../../src/features/auth/AuthProvider';
import { useAuth } from '../../../src/features/auth/AuthContext';

const authenticatedSession = {
  user: {
    id: 1,
    username: 'order.operator',
    role: 'ORDER_OPERATOR' as const,
  },
  csrfToken: 'test-csrf-token',
};

function AuthHarness() {
  const {
    state,
    signIn,
    signOut,
    retrySession,
  } = useAuth();

  if (state.status === 'loading') {
    return <p>Checking session...</p>;
  }

  if (state.status === 'error') {
    return (
      <button type="button" onClick={retrySession}>
        Retry session
      </button>
    );
  }

  if (state.status === 'anonymous') {
    return (
      <button
        type="button"
        onClick={() => {
          void signIn({
            username: 'order.operator',
            password: 'test passphrase',
          });
        }}
      >
        Sign in
      </button>
    );
  }

  return (
    <div>
      <p>{state.session.user.username}</p>
      <p>{state.session.user.role}</p>

      <button
        type="button"
        onClick={() => {
          void signOut();
        }}
      >
        Sign out
      </button>
    </div>
  );
}

function mountAuthProvider() {
  cy.mount(
    <AuthProvider>
      <AuthHarness />
    </AuthProvider>,
  );
}

describe('AuthProvider', () => {
  it('restores and exposes an authenticated session', () => {
    cy.intercept('GET', '**/api/auth/session', {
      statusCode: 200,
      delay: 200,
      body: authenticatedSession,
    }).as('getSession');

    mountAuthProvider();

    cy.contains('Checking session...').should(
      'be.visible',
    );

    cy.wait('@getSession');

    cy.contains('order.operator').should('be.visible');
    cy.contains('ORDER_OPERATOR').should('be.visible');
  });

  it('allows an anonymous user to sign in', () => {
    cy.intercept('GET', '**/api/auth/session', {
      statusCode: 401,
    }).as('getSession');

    cy.intercept('POST', '**/api/auth/login', {
      statusCode: 200,
      body: authenticatedSession,
    }).as('login');

    mountAuthProvider();

    cy.wait('@getSession');

    cy.contains('button', 'Sign in').click();

    cy.wait('@login')
      .its('request.body')
      .should('deep.equal', {
        username: 'order.operator',
        password: 'test passphrase',
      });

    cy.contains('order.operator').should('be.visible');
    cy.contains('ORDER_OPERATOR').should('be.visible');
  });

  it('logs out with the current CSRF token', () => {
    cy.intercept('GET', '**/api/auth/session', {
      statusCode: 200,
      body: authenticatedSession,
    }).as('getSession');

    cy.intercept('POST', '**/api/auth/logout', {
      statusCode: 204,
    }).as('logout');

    mountAuthProvider();

    cy.wait('@getSession');

    cy.contains('button', 'Sign out').click();

    cy.wait('@logout')
      .its('request.headers')
      .its('x-csrf-token')
      .should('equal', 'test-csrf-token');

    cy.contains('button', 'Sign in').should(
      'be.visible',
    );
  });

  it('recovers from a session bootstrap error', () => {
    let requestCount = 0;

    cy.intercept(
      'GET',
      '**/api/auth/session',
      (request) => {
        requestCount += 1;

        if (requestCount === 1) {
          request.reply({
            statusCode: 500,
          });
          return;
        }

        request.reply({
          statusCode: 200,
          delay: 200,
          body: authenticatedSession,
        });
      },
    ).as('getSession');

    mountAuthProvider();

    cy.wait('@getSession');

    cy.contains('button', 'Retry session').click();

    cy.contains('Checking session...').should(
      'be.visible',
    );

    cy.wait('@getSession');

    cy.contains('order.operator').should('be.visible');
    cy.contains('ORDER_OPERATOR').should('be.visible');
  });
});