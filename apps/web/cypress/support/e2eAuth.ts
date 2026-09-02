import type {
  AuthenticatedSession,
} from '../../src/features/auth/auth.types';

export type E2ERole =
  | 'ORDER_OPERATOR'
  | 'PAYMENT_OPERATOR';

type CredentialEnvironmentKeys = {
  username: string;
  password: string;
};

const credentialEnvironmentKeys: Record<
  E2ERole,
  CredentialEnvironmentKeys
> = {
  ORDER_OPERATOR: {
    username: 'ORDER_OPERATOR_USERNAME',
    password: 'ORDER_OPERATOR_PASSWORD',
  },
  PAYMENT_OPERATOR: {
    username: 'PAYMENT_OPERATOR_USERNAME',
    password: 'PAYMENT_OPERATOR_PASSWORD',
  },
};

function readRequiredEnvironmentValue(
  name: string,
): string {
  const value: unknown = Cypress.env(name);

  if (
    typeof value !== 'string' ||
    value.trim().length === 0
  ) {
    throw new Error(
      `Missing required Cypress environment value: ${name}`,
    );
  }

  return value;
}

export function loginAs(
  role: E2ERole,
): Cypress.Chainable<AuthenticatedSession> {
  const environmentKeys =
    credentialEnvironmentKeys[role];

  const username = readRequiredEnvironmentValue(
    environmentKeys.username,
  );

  const password = readRequiredEnvironmentValue(
    environmentKeys.password,
  );

  cy.intercept(
    'POST',
    '**/api/auth/login',
  ).as('login');

  cy.visit('/');

  cy.get('input[name="username"]').type(username);

  cy.get('input[name="password"]').type(
    password,
    {
      log: false,
    },
  );

  cy.contains('button', 'Sign in').click();

  return cy
    .wait('@login')
    .then(({ response }) => {
      if (
        !response ||
        response.statusCode !== 200
      ) {
        throw new Error(
          `Login failed for E2E role: ${role}`,
        );
      }

      return response.body as AuthenticatedSession;
    });
}