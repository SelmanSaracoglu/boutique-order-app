import { AuthProvider } from '../../../src/features/auth/AuthProvider';
import { LoginPage } from '../../../src/features/auth/LoginPage';

const authenticatedSession = {
  user: {
    id: 1,
    username: 'order.operator',
    role: 'ORDER_OPERATOR',
  },
  csrfToken: 'test-csrf-token',
};

function mountLoginPage() {
  cy.intercept('GET', '**/api/auth/session', {
    statusCode: 401,
  }).as('getSession');

  cy.mount(
    <AuthProvider>
      <LoginPage />
    </AuthProvider>,
  );

  cy.wait('@getSession');
}

function submitCredentials() {
  cy.get('input[name="username"]').type(
    'order.operator',
  );
  cy.get('input[name="password"]').type(
    'test passphrase',
  );
  cy.contains('button', 'Sign in').click();
}

describe('LoginPage', () => {
  it('submits credentials once and prevents duplicate input', () => {
    cy.intercept('POST', '**/api/auth/login', {
      statusCode: 200,
      delay: 200,
      body: authenticatedSession,
    }).as('login');

    mountLoginPage();
    submitCredentials();

    cy.contains('button', 'Signing in...')
      .should('be.disabled');

    cy.get('input[name="username"]').should(
      'be.disabled',
    );
    cy.get('input[name="password"]').should(
      'be.disabled',
    );

    cy.wait('@login')
      .its('request.body')
      .should('deep.equal', {
        username: 'order.operator',
        password: 'test passphrase',
      });

    cy.get('@login.all').should('have.length', 1);
  });

  it('shows a controlled invalid credentials error', () => {
    cy.intercept('POST', '**/api/auth/login', {
      statusCode: 401,
      body: {
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid username or password.',
        },
      },
    }).as('login');

    mountLoginPage();
    submitCredentials();

    cy.wait('@login');

    cy.get('[role="alert"]')
      .should('be.visible')
      .and(
        'have.text',
        'Invalid username or password.',
      );

    cy.contains('button', 'Sign in').should(
      'be.enabled',
    );
  });

  it('shows a controlled rate limit error', () => {
    cy.intercept('POST', '**/api/auth/login', {
      statusCode: 429,
    }).as('login');

    mountLoginPage();
    submitCredentials();

    cy.wait('@login');

    cy.get('[role="alert"]')
      .should('be.visible')
      .and(
        'have.text',
        'Too many login attempts. Please try again later.',
      );
  });

  it('shows a controlled unexpected error', () => {
    cy.intercept('POST', '**/api/auth/login', {
      statusCode: 500,
    }).as('login');

    mountLoginPage();
    submitCredentials();

    cy.wait('@login');

    cy.get('[role="alert"]')
      .should('be.visible')
      .and(
        'have.text',
        'Unable to sign in. Please try again.',
      );
  });
});