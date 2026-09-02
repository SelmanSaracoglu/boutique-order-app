import type { PropsWithChildren } from 'react';
import { useAuth } from './AuthContext';
import { LoginPage } from './LoginPage';

export function AuthGate({
  children,
}: PropsWithChildren) {
  const { state, retrySession } = useAuth();

  if (state.status === 'loading') {
    return (
      <main className="auth-page">
        <section
          className="auth-card auth-status-card"
          aria-live="polite"
        >
          <p className="auth-eyebrow">
            Boutique Orders
          </p>

          <h1 className="auth-status-title">
            Checking session
          </h1>

          <p className="auth-description">
            Please wait while your access is verified.
          </p>
        </section>
      </main>
    );
  }

  if (state.status === 'error') {
    return (
      <main className="auth-page">
        <section
          className="auth-card auth-status-card"
          aria-labelledby="session-error-title"
        >
          <p className="auth-eyebrow">
            Boutique Orders
          </p>

          <h1
            id="session-error-title"
            className="auth-status-title"
          >
            Unable to verify access
          </h1>

          <p className="auth-description" role="alert">
            The session service could not be reached.
            Please try again.
          </p>

          <button
            className="auth-submit"
            type="button"
            onClick={retrySession}
          >
            Try again
          </button>
        </section>
      </main>
    );
  }

  if (state.status === 'anonymous') {
    return <LoginPage />;
  }

  return children;
}