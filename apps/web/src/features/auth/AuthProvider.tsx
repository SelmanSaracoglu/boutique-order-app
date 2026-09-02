import {
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type {
  AuthenticatedSession,
  LoginCredentials,
} from './auth.types';
import {
  getSession,
  login,
  logout,
} from './authApi';
import {
  AuthContext,
  type AuthContextValue,
  type AuthState,
} from './AuthContext';

function createSessionState(
  session: AuthenticatedSession | null,
): AuthState {
  return session
    ? {
        status: 'authenticated',
        session,
      }
    : {
        status: 'anonymous',
      };
}

export function AuthProvider({
  children,
}: PropsWithChildren) {
  const [state, setState] = useState<AuthState>({
    status: 'loading',
  });

  useEffect(() => {
    let isActive = true;

    void getSession()
      .then((session) => {
        if (isActive) {
          setState(createSessionState(session));
        }
      })
      .catch(() => {
        if (isActive) {
          setState({
            status: 'error',
          });
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  const signIn = useCallback(
    async (credentials: LoginCredentials) => {
      const session = await login(credentials);

      setState({
        status: 'authenticated',
        session,
      });
    },
    [],
  );

  const signOut = useCallback(async () => {
    if (state.status !== 'authenticated') {
      return;
    }

    await logout(state.session.csrfToken);

    setState({
      status: 'anonymous',
    });
  }, [state]);

  const retrySession = useCallback(() => {
    setState({
      status: 'loading',
    });

    void getSession()
      .then((session) => {
        setState(createSessionState(session));
      })
      .catch(() => {
        setState({
          status: 'error',
        });
      });
  }, []);

  const contextValue = useMemo<AuthContextValue>(
    () => ({
      state,
      signIn,
      signOut,
      retrySession,
    }),
    [
      state,
      signIn,
      signOut,
      retrySession,
    ],
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}