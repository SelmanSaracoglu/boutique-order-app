import type {
  UserRole,
} from '../auth/auth.types';
import type {
  Permission,
} from '../auth/permissions';
import type {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from '../orders/ordersApi';

export type AuditReadCategory =
  | 'PRODUCT'
  | 'SECURITY'
  | 'ERROR';

export type AuditEventCategory =
  | AuditReadCategory
  | 'SYSTEM';

export type AuditEventOutcome =
  | 'SUCCESS'
  | 'FAILURE'
  | 'REJECTED';

export type AuditEventSeverity =
  | 'INFO'
  | 'WARN'
  | 'ERROR'
  | 'CRITICAL';

export type AuditEventActorType =
  | 'USER'
  | 'ANONYMOUS'
  | 'SYSTEM';

export type AuditTargetResourceType =
  | 'ORDER'
  | 'AUTHENTICATION'
  | 'SESSION'
  | 'REQUEST'
  | 'APPLICATION'
  | 'AUDIT_LOG';

export type AuditEventHttpDetail = {
  method: string;
  route: string;
  status: number;
};

export type AuditEventStateTransition = {
  previousOrderStatus: OrderStatus | null;
  newOrderStatus: OrderStatus | null;
  previousPaymentStatus: PaymentStatus | null;
  newPaymentStatus: PaymentStatus | null;
};

export type AuditEventAttributes = {
  orderSource:
    | 'instagram'
    | 'whatsapp'
    | null;
  itemCount: number | null;
  paymentMethod: PaymentMethod | null;
  permission: Permission | null;
  attemptedUsername: string | null;
};

export type AuditEventDetail = {
  operation: string | null;
  http: AuditEventHttpDetail | null;
  reasonCode: string | null;
  errorCode: string | null;
  stateTransition:
    AuditEventStateTransition | null;
  attributes: AuditEventAttributes | null;
};

export type AuditEventSummary = {
  id: string;
  occurredAt: string;
  category: AuditEventCategory;
  action: string;
  outcome: AuditEventOutcome;
  severity: AuditEventSeverity;
  actor: {
    type: AuditEventActorType;
    username: string | null;
    role: UserRole | null;
  };
  target: {
    resourceType: AuditTargetResourceType;
    resourceId: string;
  };
  requestId: string | null;
  detail: AuditEventDetail;
};

export type AuditEventPage = {
  items: AuditEventSummary[];
  nextCursor: string | null;
};

export type AuditLogQuery = {
  limit?: number;
  cursor?: string;
  category?: AuditReadCategory;
  outcome?: AuditEventOutcome;
  from?: string;
  to?: string;
  username?: string;
  orderId?: string;
  requestId?: string;
};