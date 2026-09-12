import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type {
  AuditEventPage,
} from './auditLog.types';
import {
  AuditLogForbiddenError,
  listAuditEvents,
} from './auditLogApi';

const auditEventPage: AuditEventPage = {
  items: [
    {
      id: '42',
      occurredAt:
        '2026-03-10T10:00:00.000Z',
      category: 'PRODUCT',
      action: 'ORDER_CANCELLED',
      outcome: 'REJECTED',
      severity: 'WARN',
      actor: {
        type: 'USER',
        username: 'admin',
        role: 'ADMIN',
      },
      target: {
        resourceType: 'ORDER',
        resourceId: '42',
      },
      requestId:
        '00000000-0000-4000-8000-000000000042',
      detail: {
        operation:
          'UPDATE_ORDER_STATUS',
        http: {
          method: 'PATCH',
          route:
            '/api/orders/:orderId/status',
          status: 409,
        },
        reasonCode:
          'INVALID_STATUS_TRANSITION',
        errorCode: null,
        stateTransition: {
          previousOrderStatus: 'NEW',
          newOrderStatus: 'CANCELLED',
          previousPaymentStatus:
            'AWAITING_PAYMENT',
          newPaymentStatus:
            'AWAITING_PAYMENT',
        },
        attributes: null,
      },
    },
  ],
  nextCursor: 'next-page-cursor',
};

function mockFetch(response: Response) {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(response);

  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Audit Log API', () => {
  it('retrieves the default audit event page', async () => {
    const fetchMock = mockFetch(
      new Response(
        JSON.stringify(auditEventPage),
        {
          status: 200,
          headers: {
            'Content-Type':
              'application/json',
          },
        },
      ),
    );

    await expect(
      listAuditEvents(),
    ).resolves.toEqual(auditEventPage);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/audit-events',
      {
        credentials: 'same-origin',
      },
    );
  });

  it('sends pagination, filters, and targeted search parameters', async () => {
    const fetchMock = mockFetch(
      new Response(
        JSON.stringify(auditEventPage),
        {
          status: 200,
          headers: {
            'Content-Type':
              'application/json',
          },
        },
      ),
    );

    await listAuditEvents({
      limit: 50,
      cursor: 'next-page-cursor',
      category: 'PRODUCT',
      outcome: 'REJECTED',
      from:
        '2026-03-10T00:00:00.000Z',
      to:
        '2026-03-10T23:59:59.999Z',
      username: 'admin',
      orderId: '42',
      requestId:
        '00000000-0000-4000-8000-000000000042',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/audit-events?' +
        'limit=50&' +
        'cursor=next-page-cursor&' +
        'category=PRODUCT&' +
        'outcome=REJECTED&' +
        'from=2026-03-10T00%3A00%3A00.000Z&' +
        'to=2026-03-10T23%3A59%3A59.999Z&' +
        'username=admin&' +
        'orderId=42&' +
        'requestId=' +
        '00000000-0000-4000-8000-000000000042',
      {
        credentials: 'same-origin',
      },
    );
  });

  it('maps a forbidden response to a controlled error', async () => {
    mockFetch(
      new Response(null, {
        status: 403,
      }),
    );

    await expect(
      listAuditEvents(),
    ).rejects.toBeInstanceOf(
      AuditLogForbiddenError,
    );
  });

  it('rejects an unexpected unsuccessful response', async () => {
    mockFetch(
      new Response(null, {
        status: 500,
      }),
    );

    await expect(
      listAuditEvents(),
    ).rejects.toThrow(
      'Unable to retrieve audit events.',
    );
  });
});