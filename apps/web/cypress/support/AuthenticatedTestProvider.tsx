import type { PropsWithChildren } from 'react';

import type { UserRole } from '../../src/features/auth/auth.types';
import {
  AuthContext,
  type AuthContextValue,
} from '../../src/features/auth/AuthContext';

type AuthenticatedTestProviderProps =
  PropsWithChildren<{
    role?: UserRole;
    csrfToken?: string;
  }>;

export function AuthenticatedTestProvider({
  children,
  role = 'ADMIN',
  csrfToken = 'test-csrf-token',
}: AuthenticatedTestProviderProps) {
  const contextValue: AuthContextValue = {
    state: {
      status: 'authenticated',
      session: {
        user: {
          id: 1,
          username: 'test.user',
          role,
        },
        csrfToken,
      },
    },
    signIn: () => Promise.resolve(),
    signOut: () => Promise.resolve(),
    retrySession: () => undefined,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}