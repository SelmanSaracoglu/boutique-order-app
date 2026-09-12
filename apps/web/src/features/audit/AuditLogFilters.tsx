import {
    type FormEvent,
    useState,
} from 'react';

import type {
    AuditEventOutcome,
    AuditReadCategory,
} from './auditLog.types';

export type AuditLogFilterValues = {
    category: AuditReadCategory | '';
    outcome: AuditEventOutcome | '';
    fromDate: string;
    toDate: string;
    username: string;
    orderId: string;
    requestId: string;
};

type AuditLogFiltersProps = {
    disabled: boolean;
    onApply: (
        filters: AuditLogFilterValues,
    ) => void;
    onClear: () => void;
};

const emptyFilters: AuditLogFilterValues = {
    category: '',
    outcome: '',
    fromDate: '',
    toDate: '',
    username: '',
    orderId: '',
    requestId: '',
};

const categoryOptions = [
    {
        value: '',
        label: 'All',
    },
    {
        value: 'PRODUCT',
        label: 'Product',
    },
    {
        value: 'SECURITY',
        label: 'Security',
    },
    {
        value: 'ERROR',
        label: 'Errors',
    },
] as const;

export function AuditLogFilters({
    disabled,
    onApply,
    onClear,
}: AuditLogFiltersProps) {
    const [filters, setFilters] =
        useState<AuditLogFilterValues>(
            emptyFilters,
        );

    const hasFilterValue = Object.values(
        filters,
    ).some(Boolean);

    function handleSubmit(
        event: FormEvent<HTMLFormElement>,
    ) {
        event.preventDefault();
        onApply(filters);
    }

    function handleClear() {
        setFilters(emptyFilters);
        onClear();
    }

    return (
        <form
            className="audit-filters"
            onSubmit={handleSubmit}
        >
            <fieldset disabled={disabled}>
                <legend className="audit-filters__legend">
                    Audit event filters
                </legend>

                <div
                    className="audit-filters__categories"
                    aria-label="Audit event category"
                >
                    {categoryOptions.map((option) => (
                        <button
                            key={option.label}
                            type="button"
                            className={
                                filters.category === option.value
                                    ? 'audit-filter audit-filter--active'
                                    : 'audit-filter'
                            }
                            aria-pressed={
                                filters.category === option.value
                            }
                            onClick={() =>
                                setFilters((current) => ({
                                    ...current,
                                    category: option.value,
                                }))
                            }
                        >
                            {option.label}
                        </button>
                    ))}
                </div>

                <div className="audit-filters__fields">
                    <label>
                        <span>Outcome</span>

                        <select
                            name="outcome"
                            value={filters.outcome}
                            onChange={(event) =>
                                setFilters((current) => ({
                                    ...current,
                                    outcome: event.target.value as
                                        AuditEventOutcome | '',
                                }))
                            }
                        >
                            <option value="">
                                All outcomes
                            </option>
                            <option value="SUCCESS">
                                Success
                            </option>
                            <option value="FAILURE">
                                Failure
                            </option>
                            <option value="REJECTED">
                                Rejected
                            </option>
                        </select>
                    </label>

                    <label>
                        <span>From date</span>

                        <input
                            name="fromDate"
                            type="date"
                            value={filters.fromDate}
                            max={filters.toDate || undefined}
                            onChange={(event) =>
                                setFilters((current) => ({
                                    ...current,
                                    fromDate:
                                        event.target.value,
                                }))
                            }
                        />
                    </label>

                    <label>
                        <span>To date</span>

                        <input
                            name="toDate"
                            type="date"
                            value={filters.toDate}
                            min={
                                filters.fromDate ||
                                undefined
                            }
                            onChange={(event) =>
                                setFilters((current) => ({
                                    ...current,
                                    toDate:
                                        event.target.value,
                                }))
                            }
                        />
                    </label>

                    <label>
                        <span>Username</span>

                        <input
                            name="username"
                            type="text"
                            maxLength={64}
                            autoComplete="off"
                            value={filters.username}
                            onChange={(event) =>
                                setFilters((current) => ({
                                    ...current,
                                    username:
                                        event.target.value,
                                }))
                            }
                        />
                    </label>

                    <label>
                        <span>Order ID</span>

                        <input
                            name="orderId"
                            type="text"
                            inputMode="numeric"
                            pattern="[1-9][0-9]*"
                            maxLength={10}
                            value={filters.orderId}
                            onChange={(event) =>
                                setFilters((current) => ({
                                    ...current,
                                    orderId:
                                        event.target.value,
                                }))
                            }
                        />
                    </label>

                    <label>
                        <span>Request ID</span>

                        <input
                            name="requestId"
                            type="text"
                            maxLength={36}
                            spellCheck={false}
                            value={filters.requestId}
                            onChange={(event) =>
                                setFilters((current) => ({
                                    ...current,
                                    requestId:
                                        event.target.value,
                                }))
                            }
                        />
                    </label>
                </div>

                <div className="audit-filters__actions">
                    <button
                        type="submit"
                        className="audit-filters__apply"
                    >
                        Apply filters
                    </button>

                    <button
                        type="button"
                        className="audit-filters__clear"
                        disabled={!hasFilterValue}
                        onClick={handleClear}
                    >
                        Clear filters
                    </button>
                </div>
            </fieldset>
        </form>
    );
}