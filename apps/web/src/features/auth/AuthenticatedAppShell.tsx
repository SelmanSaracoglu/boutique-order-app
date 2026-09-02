import {
  type PropsWithChildren,
  useState,
} from 'react';
import { Link } from 'react-router-dom';

import type { UserRole } from './auth.types';
import {
  useAuth,
  useAuthenticatedSession,
} from './AuthContext';
import './authenticated-app-shell.css';

type SignOutState =
  | 'idle'
  | 'pending'
  | 'error';

const roleLabels: Record<UserRole, string> = {
  ADMIN: 'Administrator',
  ORDER_OPERATOR: 'Order operator',
  PAYMENT_OPERATOR: 'Payment operator',
  FULFILLMENT_OPERATOR: 'Fulfillment operator',
};

export function AuthenticatedAppShell({
  children,
}: PropsWithChildren) {
  const { signOut } = useAuth();
  const session = useAuthenticatedSession();

  const [signOutState, setSignOutState] =
    useState<SignOutState>('idle');

  async function handleSignOut() {
    if (signOutState === 'pending') {
      return;
    }

    setSignOutState('pending');

    try {
      await signOut();
    } catch {
      setSignOutState('error');
    }
  }

  return (
    <div className="app-shell">
      <header className="app-shell__header">
        <div className="app-shell__inner">
          <Link
            className="app-shell__brand"
            to="/"
          >
            Boutique Orders
          </Link>

          <div className="app-shell__account">
            <div className="app-shell__identity">
              <strong>
                {session.user.username}
              </strong>

              <span>
                {roleLabels[session.user.role]}
              </span>
            </div>

            <button
              type="button"
              className="app-shell__sign-out"
              disabled={signOutState === 'pending'}
              onClick={() => void handleSignOut()}
            >
              {signOutState === 'pending'
                ? 'Signing out...'
                : 'Sign out'}
            </button>
          </div>
        </div>

        {signOutState === 'error' && (
          <p
            className="app-shell__feedback"
            role="alert"
          >
            Sign out failed. Please try again.
          </p>
        )}
      </header>

      {children}
    </div>
  );
}