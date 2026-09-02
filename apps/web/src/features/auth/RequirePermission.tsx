import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

import { useAuthenticatedSession } from './AuthContext';
import {
  hasPermission,
  type Permission,
} from './permissions';

type RequirePermissionProps = {
  permission: Permission;
  children: ReactNode;
  redirectTo?: string;
};

export function RequirePermission({
  permission,
  children,
  redirectTo = '/',
}: RequirePermissionProps) {
  const session = useAuthenticatedSession();

  if (
    !hasPermission(session.user.role, permission)
  ) {
    return (
      <Navigate
        to={redirectTo}
        replace
      />
    );
  }

  return children;
}