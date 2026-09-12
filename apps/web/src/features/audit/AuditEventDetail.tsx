import type { AuditEventSummary, } from './auditLog.types';
import { formatAuditLabel, } from './auditLogFormatting';

type AuditEventDetailProps = {
    event: AuditEventSummary;
    onClose: () => void;
};

type DetailFieldProps = {
    label: string;
    value: string | number | null;
};

function DetailField({
    label,
    value,
}: DetailFieldProps) {
    if (value === null) {
        return null;
    }

    return (
        <div className="audit-event-detail__field">
            <dt>{label}</dt>
            <dd>{value}</dd>
        </div>
    );
}

export function AuditEventDetail({
    event,
    onClose,
}: AuditEventDetailProps) {
    const {
        attributes,
        http,
        stateTransition,
    } = event.detail;

    return (
        <section
            id="audit-event-detail"
            className="audit-event-detail"
            aria-labelledby="audit-event-detail-heading"
        >
            <header className="audit-event-detail__header">
                <div>
                    <p>Selected event</p>
                    <h2 id="audit-event-detail-heading">
                        {formatAuditLabel(event.action)}
                    </h2>
                </div>

                <button
                    type="button"
                    onClick={onClose}
                >
                    Close details
                </button>
            </header>

            <dl className="audit-event-detail__grid">
                <DetailField
                    label="Event ID"
                    value={event.id}
                />

                <DetailField
                    label="Request ID"
                    value={event.requestId}
                />

                <DetailField
                    label="Operation"
                    value={
                        event.detail.operation
                            ? formatAuditLabel(
                                event.detail.operation,
                            )
                            : null
                    }
                />

                <DetailField
                    label="Reason code"
                    value={
                        event.detail.reasonCode
                            ? formatAuditLabel(
                                event.detail.reasonCode,
                            )
                            : null
                    }
                />

                <DetailField
                    label="Error code"
                    value={
                        event.detail.errorCode
                            ? formatAuditLabel(
                                event.detail.errorCode,
                            )
                            : null
                    }
                />

                <DetailField
                    label="HTTP method"
                    value={http?.method ?? null}
                />

                <DetailField
                    label="HTTP route"
                    value={http?.route ?? null}
                />

                <DetailField
                    label="HTTP status"
                    value={http?.status ?? null}
                />

                <DetailField
                    label="Previous order status"
                    value={
                        stateTransition
                            ?.previousOrderStatus
                            ? formatAuditLabel(
                                stateTransition
                                    .previousOrderStatus,
                            )
                            : null
                    }
                />

                <DetailField
                    label="New order status"
                    value={
                        stateTransition
                            ?.newOrderStatus
                            ? formatAuditLabel(
                                stateTransition.newOrderStatus,
                            )
                            : null
                    }
                />

                <DetailField
                    label="Previous payment status"
                    value={
                        stateTransition
                            ?.previousPaymentStatus
                            ? formatAuditLabel(
                                stateTransition
                                    .previousPaymentStatus,
                            )
                            : null
                    }
                />

                <DetailField
                    label="New payment status"
                    value={
                        stateTransition
                            ?.newPaymentStatus
                            ? formatAuditLabel(
                                stateTransition
                                    .newPaymentStatus,
                            )
                            : null
                    }
                />

                <DetailField
                    label="Order source"
                    value={
                        attributes?.orderSource
                            ? formatAuditLabel(
                                attributes.orderSource,
                            )
                            : null
                    }
                />

                <DetailField
                    label="Item count"
                    value={
                        attributes?.itemCount ?? null
                    }
                />

                <DetailField
                    label="Payment method"
                    value={
                        attributes?.paymentMethod
                            ? formatAuditLabel(
                                attributes.paymentMethod,
                            )
                            : null
                    }
                />

                <DetailField
                    label="Permission"
                    value={
                        attributes?.permission
                            ? formatAuditLabel(
                                attributes.permission,
                            )
                            : null
                    }
                />

                <DetailField
                    label="Attempted username"
                    value={
                        attributes
                            ?.attemptedUsername ?? null
                    }
                />
            </dl>
        </section>
    );
}