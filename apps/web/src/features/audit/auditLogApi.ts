import type {
  AuditEventPage,
  AuditLogQuery,
} from './auditLog.types';

export class AuditLogForbiddenError extends Error {
  constructor() {
    super(
      'You do not have permission to view the audit log.',
    );
    this.name = 'AuditLogForbiddenError';
  }
}

function buildAuditLogUrl(
  query: AuditLogQuery,
): string {
  const searchParams = new URLSearchParams();

  if (query.limit !== undefined) {
    searchParams.set(
      'limit',
      String(query.limit),
    );
  }

  if (query.cursor !== undefined) {
    searchParams.set(
      'cursor',
      query.cursor,
    );
  }

  if (query.category !== undefined) {
    searchParams.set(
      'category',
      query.category,
    );
  }

  if (query.outcome !== undefined) {
    searchParams.set(
      'outcome',
      query.outcome,
    );
  }

  if (query.from !== undefined) {
    searchParams.set(
      'from',
      query.from,
    );
  }

  if (query.to !== undefined) {
    searchParams.set(
      'to',
      query.to,
    );
  }

  if (query.username !== undefined) {
    searchParams.set(
      'username',
      query.username,
    );
  }

  if (query.orderId !== undefined) {
    searchParams.set(
      'orderId',
      query.orderId,
    );
  }

  if (query.requestId !== undefined) {
    searchParams.set(
      'requestId',
      query.requestId,
    );
  }

  const queryString =
    searchParams.toString();

  return queryString
    ? `/api/audit-events?${queryString}`
    : '/api/audit-events';
}

export async function listAuditEvents(
  query: AuditLogQuery = {},
): Promise<AuditEventPage> {
  const response = await fetch(
    buildAuditLogUrl(query),
    {
      credentials: 'same-origin',
    },
  );

  if (response.status === 403) {
    throw new AuditLogForbiddenError();
  }

  if (!response.ok) {
    throw new Error(
      'Unable to retrieve audit events.',
    );
  }

  return response.json() as Promise<AuditEventPage>;
}