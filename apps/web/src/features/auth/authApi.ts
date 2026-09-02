import type {
  AuthenticatedSession,
  LoginCredentials,
} from './auth.types';

export const CSRF_HEADER_NAME = 'x-csrf-token';

export class InvalidCredentialsError extends Error {
  constructor() {
    super('Invalid username or password.');
    this.name = 'InvalidCredentialsError';
  }
}

export class LoginRateLimitedError extends Error {
  constructor() {
    super('Too many login attempts. Please try again later.');
    this.name = 'LoginRateLimitedError';
  }
}

export async function getSession(): Promise<
  AuthenticatedSession | null
> {
  const response = await fetch('/api/auth/session', {
    credentials: 'same-origin',
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error('Unable to restore session.');
  }

  return response.json() as Promise<AuthenticatedSession>;
}

export async function login(
  credentials: LoginCredentials,
): Promise<AuthenticatedSession> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(credentials),
  });

  if (response.status === 401) {
    throw new InvalidCredentialsError();
  }

  if (response.status === 429) {
    throw new LoginRateLimitedError();
  }

  if (!response.ok) {
    throw new Error('Unable to sign in.');
  }

  return response.json() as Promise<AuthenticatedSession>;
}

export async function logout(
  csrfToken: string,
): Promise<void> {
  const response = await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      [CSRF_HEADER_NAME]: csrfToken,
    },
  });

  if (!response.ok) {
    throw new Error('Unable to sign out.');
  }
}