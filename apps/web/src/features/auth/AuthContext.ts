import {
  createContext,
  useContext,
} from 'react';
import type {
  AuthenticatedSession,
  LoginCredentials,
} from './auth.types';

export type AuthState =
  | {
      status: 'loading';
    }
  | {
      status: 'anonymous';
    }
  | {
      status: 'authenticated';
      session: AuthenticatedSession;
    }
  | {
      status: 'error';
    };

export type AuthContextValue = {
  state: AuthState;
  signIn: (
    credentials: LoginCredentials,
  ) => Promise<void>;
  signOut: () => Promise<void>;
  retrySession: () => void;
};

export const AuthContext = createContext<
  AuthContextValue | undefined
>(undefined);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      'useAuth must be used within an AuthProvider.',
    );
  }

  return context;
}

export function useAuthenticatedSession(): AuthenticatedSession {
  const { state } = useAuth();

  if (state.status !== 'authenticated') {
    throw new Error(
      'Authenticated session is required.',
    );
  }

  return state.session;
}