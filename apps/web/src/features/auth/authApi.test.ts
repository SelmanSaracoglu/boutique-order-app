import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { AuthenticatedSession } from './auth.types';
import {
  getSession,
  InvalidCredentialsError,
  login,
  LoginRateLimitedError,
  logout,
} from './authApi';

const authenticatedSession: AuthenticatedSession = {
  user: {
    id: 1,
    username: 'order.operator',
    role: 'ORDER_OPERATOR',
  },
  csrfToken: 'test-csrf-token',
};

function mockFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Auth API', () => {
  it('restores an authenticated session', async () => {
    const fetchMock = mockFetch(
      new Response(JSON.stringify(authenticatedSession), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    );

    await expect(getSession()).resolves.toEqual(
      authenticatedSession,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/session',
      {
        credentials: 'same-origin',
      },
    );
  });

  it('returns null when no authenticated session exists', async () => {
    mockFetch(new Response(null, { status: 401 }));

    await expect(getSession()).resolves.toBeNull();
  });

  it('rejects an unexpected session response', async () => {
    mockFetch(new Response(null, { status: 500 }));

    await expect(getSession()).rejects.toThrow(
      'Unable to restore session.',
    );
  });

  it('logs in with local credentials', async () => {
    const fetchMock = mockFetch(
      new Response(JSON.stringify(authenticatedSession), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    );

    await expect(
      login({
        username: 'order.operator',
        password: 'test passphrase',
      }),
    ).resolves.toEqual(authenticatedSession);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/login',
      {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: 'order.operator',
          password: 'test passphrase',
        }),
      },
    );
  });

  it('maps rejected credentials to a controlled error', async () => {
    mockFetch(new Response(null, { status: 401 }));

    await expect(
      login({
        username: 'order.operator',
        password: 'wrong password',
      }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it('maps login rate limiting to a controlled error', async () => {
    mockFetch(new Response(null, { status: 429 }));

    await expect(
      login({
        username: 'order.operator',
        password: 'test passphrase',
      }),
    ).rejects.toBeInstanceOf(LoginRateLimitedError);
  });

  it('logs out with the current CSRF token', async () => {
    const fetchMock = mockFetch(
      new Response(null, { status: 204 }),
    );

    await expect(
      logout('test-csrf-token'),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/logout',
      {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'x-csrf-token': 'test-csrf-token',
        },
      },
    );
  });

  it('rejects an unsuccessful logout response', async () => {
    mockFetch(new Response(null, { status: 403 }));

    await expect(
      logout('invalid-csrf-token'),
    ).rejects.toThrow('Unable to sign out.');
  });
});