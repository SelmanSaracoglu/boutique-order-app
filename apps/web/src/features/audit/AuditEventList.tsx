import type { AuditEventSummary, } from './auditLog.types';
import { formatAuditLabel, } from './auditLogFormatting';

type AuditEventListProps = {
    events: AuditEventSummary[];
    selectedEventId?: string | null;
    onSelectEvent?: (
        event: AuditEventSummary,
    ) => void;
};

const dateTimeFormatter =
    new Intl.DateTimeFormat(
        undefined,
        {
            dateStyle: 'medium',
            timeStyle: 'medium',
        },
    );

function formatActor(
    event: AuditEventSummary,
): string {
    if (event.actor.username) {
        return event.actor.role
            ? `${event.actor.username} · ${formatAuditLabel(
                event.actor.role,
            )}`
            : event.actor.username;
    }

    return formatAuditLabel(
        event.actor.type,
    );
}

function formatTarget(
    event: AuditEventSummary,
): string {
    if (
        event.target.resourceType === 'ORDER'
    ) {
        return `Order #${event.target.resourceId}`;
    }

    return `${formatAuditLabel(
        event.target.resourceType,
    )} · ${event.target.resourceId}`;
}

export function AuditEventList({
    events,
    selectedEventId = null,
    onSelectEvent,
}: AuditEventListProps) {
    return (
        <div className="audit-events">
            <div
                className="audit-events__header"
                aria-hidden="true"
            >
                <span>Timestamp</span>
                <span>Category</span>
                <span>Action</span>
                <span>Actor</span>
                <span>Target</span>
                <span>Outcome</span>
                <span>Severity</span>
            </div>

            {events.map((event) => {
                const isSelected =
                    selectedEventId === event.id;

                return (
                    <button
                        key={event.id}
                        type="button"
                        className={
                            isSelected
                                ? 'audit-event-row audit-event-row--selected'
                                : 'audit-event-row'
                        }
                        data-testid="audit-event-row"
                        aria-pressed={isSelected}
                        onClick={() =>
                            onSelectEvent?.(event)
                        }
                    >
                        <span className="audit-event-cell">
                            <span className="audit-event-row__label">
                                Timestamp
                            </span>

                            <time dateTime={event.occurredAt}>
                                {dateTimeFormatter.format(
                                    new Date(event.occurredAt),
                                )}
                            </time>
                        </span>

                        <span className="audit-event-cell">
                            <span className="audit-event-row__label">
                                Category
                            </span>

                            <span
                                className={`audit-event-badge audit-event-badge--${event.category.toLowerCase()}`}
                            >
                                {formatAuditLabel(
                                    event.category,
                                )}
                            </span>
                        </span>

                        <span className="audit-event-cell audit-event-row__action">
                            <span className="audit-event-row__label">
                                Action
                            </span>

                            <strong>
                                {formatAuditLabel(
                                    event.action,
                                )}
                            </strong>
                        </span>

                        <span className="audit-event-cell">
                            <span className="audit-event-row__label">
                                Actor
                            </span>

                            <span>{formatActor(event)}</span>
                        </span>

                        <span className="audit-event-cell">
                            <span className="audit-event-row__label">
                                Target
                            </span>

                            <span>{formatTarget(event)}</span>
                        </span>

                        <span className="audit-event-cell">
                            <span className="audit-event-row__label">
                                Outcome
                            </span>

                            <span
                                className={`audit-event-badge audit-event-badge--${event.outcome.toLowerCase()}`}
                            >
                                {formatAuditLabel(
                                    event.outcome,
                                )}
                            </span>
                        </span>

                        <span className="audit-event-cell">
                            <span className="audit-event-row__label">
                                Severity
                            </span>

                            <span
                                className={`audit-event-badge audit-event-badge--severity-${event.severity.toLowerCase()}`}
                            >
                                {formatAuditLabel(
                                    event.severity,
                                )}
                            </span>
                        </span>
                    </button>
                );
            })}
        </div>
    );
}