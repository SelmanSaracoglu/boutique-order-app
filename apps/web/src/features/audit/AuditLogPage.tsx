import {
    useEffect,
    useRef,
    useState,
} from 'react';
import { Link } from 'react-router-dom';

import {
    AuditEventDetail,
} from './AuditEventDetail';
import {
    AuditEventList,
} from './AuditEventList';
import {
    type AuditLogFilterValues,
    AuditLogFilters,
} from './AuditLogFilters';
import type {
    AuditEventPage,
    AuditEventSummary,
    AuditLogQuery,
} from './auditLog.types';
import {
    AuditLogForbiddenError,
    listAuditEvents,
} from './auditLogApi';
import './audit-log.css';

type AuditLogLoadState =
    | 'loading'
    | 'ready'
    | 'error'
    | 'forbidden';

type PaginationState =
    | 'idle'
    | 'loading'
    | 'error';

const emptyAuditEventPage: AuditEventPage = {
    items: [],
    nextCursor: null,
};

let pendingInitialPageRequest:
    Promise<AuditEventPage> | null = null;

function loadInitialAuditEventPage():
    Promise<AuditEventPage> {
    if (pendingInitialPageRequest) {
        return pendingInitialPageRequest;
    }

    const request = listAuditEvents();

    pendingInitialPageRequest = request;

    void request.then(
        () => {
            if (
                pendingInitialPageRequest === request
            ) {
                pendingInitialPageRequest = null;
            }
        },
        () => {
            if (
                pendingInitialPageRequest === request
            ) {
                pendingInitialPageRequest = null;
            }
        },
    );

    return request;
}

function resolveFailureState(
    error: unknown,
): AuditLogLoadState {
    return error instanceof AuditLogForbiddenError
        ? 'forbidden'
        : 'error';
}

function buildAuditLogQuery(
    filters: AuditLogFilterValues,
): AuditLogQuery {
    const query: AuditLogQuery = {};

    if (filters.category) {
        query.category = filters.category;
    }

    if (filters.outcome) {
        query.outcome = filters.outcome;
    }

    if (filters.fromDate) {
        query.from =
            `${filters.fromDate}T00:00:00.000Z`;
    }

    if (filters.toDate) {
        query.to =
            `${filters.toDate}T23:59:59.999Z`;
    }

    const username =
        filters.username.trim();

    if (username) {
        query.username = username;
    }

    const orderId =
        filters.orderId.trim();

    if (orderId) {
        query.orderId = orderId;
    }

    const requestId =
        filters.requestId
            .trim()
            .toLowerCase();

    if (requestId) {
        query.requestId = requestId;
    }

    return query;
}

export function AuditLogPage() {
    const [page, setPage] =
        useState<AuditEventPage>(
            emptyAuditEventPage,
        );

    const [loadState, setLoadState] =
        useState<AuditLogLoadState>('loading');

    const [
        paginationState,
        setPaginationState,
    ] = useState<PaginationState>('idle');

    const [activeQuery, setActiveQuery] =
        useState<AuditLogQuery>({});

    const [
        selectedEvent,
        setSelectedEvent,
    ] = useState<AuditEventSummary | null>(
        null,
    );

    const requestVersionRef = useRef(0);

    useEffect(() => {
        let isActive = true;

        const requestVersion =
            ++requestVersionRef.current;

        void loadInitialAuditEventPage().then(
            (loadedPage) => {
                if (
                    !isActive ||
                    requestVersion !==
                    requestVersionRef.current
                ) {
                    return;
                }

                setPage(loadedPage);
                setLoadState('ready');
            },
            (error: unknown) => {
                if (
                    isActive &&
                    requestVersion ===
                    requestVersionRef.current
                ) {
                    setLoadState(
                        resolveFailureState(error),
                    );
                }
            },
        );

        return () => {
            isActive = false;
        };
    }, []);

    async function loadFirstPage(
        query: AuditLogQuery,
    ) {
        const requestVersion =
            ++requestVersionRef.current;

        setActiveQuery(query);
        setSelectedEvent(null);
        setPage(emptyAuditEventPage);
        setPaginationState('idle');
        setLoadState('loading');

        try {
            const loadedPage =
                await listAuditEvents(query);

            if (
                requestVersion !==
                requestVersionRef.current
            ) {
                return;
            }

            setPage(loadedPage);
            setLoadState('ready');
        } catch (error) {
            if (
                requestVersion !==
                requestVersionRef.current
            ) {
                return;
            }

            setLoadState(
                resolveFailureState(error),
            );
        }
    }

    async function loadNextPage() {
        if (
            page.nextCursor === null ||
            paginationState === 'loading'
        ) {
            return;
        }

        const requestVersion =
            requestVersionRef.current;

        setPaginationState('loading');

        try {
            const nextPage =
                await listAuditEvents({
                    ...activeQuery,
                    cursor: page.nextCursor,
                });

            if (
                requestVersion !==
                requestVersionRef.current
            ) {
                return;
            }

            setPage((currentPage) => ({
                items: [
                    ...currentPage.items,
                    ...nextPage.items,
                ],
                nextCursor:
                    nextPage.nextCursor,
            }));

            setPaginationState('idle');
        } catch (error) {
            if (
                requestVersion !==
                requestVersionRef.current
            ) {
                return;
            }

            if (
                error instanceof
                AuditLogForbiddenError
            ) {
                setLoadState('forbidden');
                return;
            }

            setPaginationState('error');
        }
    }

    if (loadState === 'forbidden') {
        return <AuditLogForbiddenPage />;
    }

    const hasActiveFilters =
        Object.keys(activeQuery).length > 0;

    return (
        <main className="page">
            <div className="audit-log">
                <header className="audit-log__header">
                    <p className="audit-log__eyebrow">
                        Administration
                    </p>

                    <h1>Audit Log</h1>

                    <p className="audit-log__intro">
                        Review product, security, and error
                        events.
                    </p>
                </header>

                <AuditLogFilters
                    disabled={loadState === 'loading'}
                    onApply={(filters) =>
                        void loadFirstPage(
                            buildAuditLogQuery(filters),
                        )
                    }
                    onClear={() =>
                        void loadFirstPage({})
                    }
                />

                <section
                    className="audit-log__panel"
                    aria-label="Audit events"
                >
                    {loadState === 'loading' && (
                        <div
                            className="audit-log-state"
                            role="status"
                        >
                            <strong>
                                Loading audit events...
                            </strong>

                            <span>
                                Retrieving the latest audit
                                records.
                            </span>
                        </div>
                    )}

                    {loadState === 'error' && (
                        <div
                            className="audit-log-state audit-log-state--error"
                            role="alert"
                        >
                            <strong>
                                Audit events could not be loaded.
                            </strong>

                            <span>
                                Check the connection and try
                                again.
                            </span>

                            <button
                                type="button"
                                className="audit-log__retry"
                                onClick={() =>
                                    void loadFirstPage(
                                        activeQuery,
                                    )
                                }
                            >
                                Try again
                            </button>
                        </div>
                    )}

                    {loadState === 'ready' &&
                        page.items.length === 0 && (
                            <div className="audit-log-state">
                                <strong>
                                    No audit events found
                                </strong>

                                <span>
                                    {hasActiveFilters
                                        ? 'No audit events match the applied filters.'
                                        : 'There are currently no audit events to review.'}
                                </span>
                            </div>
                        )}

                    {loadState === 'ready' &&
                        page.items.length > 0 && (
                            <>
                                <AuditEventList
                                    events={page.items}
                                    selectedEventId={
                                        selectedEvent?.id ?? null
                                    }
                                    onSelectEvent={
                                        setSelectedEvent
                                    }
                                />

                                <div className="audit-log__pagination">
                                    {page.nextCursor && (
                                        <button
                                            type="button"
                                            disabled={
                                                paginationState ===
                                                'loading'
                                            }
                                            onClick={() =>
                                                void loadNextPage()
                                            }
                                        >
                                            {paginationState ===
                                                'loading'
                                                ? 'Loading more...'
                                                : 'Load more'}
                                        </button>
                                    )}

                                    {paginationState ===
                                        'error' && (
                                            <div role="alert">
                                                <span>
                                                    The next page could not
                                                    be loaded.
                                                </span>

                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        void loadNextPage()
                                                    }
                                                >
                                                    Retry page
                                                </button>
                                            </div>
                                        )}
                                </div>

                                {selectedEvent && (
                                    <AuditEventDetail
                                        event={selectedEvent}
                                        onClose={() =>
                                            setSelectedEvent(null)
                                        }
                                    />
                                )}
                            </>
                        )}
                </section>
            </div>
        </main>
    );
}

export function AuditLogForbiddenPage() {
    return (
        <main className="page">
            <div className="audit-log">
                <section
                    className="audit-log__panel"
                    aria-labelledby="forbidden-heading"
                >
                    <div
                        className="audit-log-state audit-log-state--forbidden"
                        role="alert"
                    >
                        <span>403</span>

                        <h1 id="forbidden-heading">
                            Forbidden
                        </h1>

                        <p>
                            You do not have permission to view
                            this page.
                        </p>

                        <Link
                            className="audit-log__return"
                            to="/"
                        >
                            Return to orders
                        </Link>
                    </div>
                </section>
            </div>
        </main>
    );
}