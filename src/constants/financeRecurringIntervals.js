'use strict';

const FINANCE_RECURRING_INTERVALS = Object.freeze([
    { value: 'weekly', label: 'Semanal' },
    { value: 'biweekly', label: 'Quinzenal' },
    { value: 'monthly', label: 'Mensal' },
    { value: 'quarterly', label: 'Trimestral' },
    { value: 'yearly', label: 'Anual' }
]);

const FINANCE_RECURRING_INTERVAL_VALUES = Object.freeze(
    FINANCE_RECURRING_INTERVALS.map((interval) => interval.value)
);

const FINANCE_RECURRING_INTERVAL_LABEL_TO_VALUE = FINANCE_RECURRING_INTERVALS.reduce(
    (accumulator, interval) => {
        if (!interval || typeof interval.label !== 'string') {
            return accumulator;
        }

        const normalizedLabel = interval.label.trim().toLowerCase();
        if (normalizedLabel) {
            accumulator[normalizedLabel] = interval.value;
        }

        return accumulator;
    },
    Object.create(null)
);

const FINANCE_RECURRING_INTERVAL_VALUE_SET = new Set(
    FINANCE_RECURRING_INTERVAL_VALUES.map((value) => value.toLowerCase())
);

const normalizeRecurringInterval = (rawValue) => {
    if (typeof rawValue !== 'string') {
        return null;
    }

    const trimmedValue = rawValue.trim();
    if (!trimmedValue) {
        return null;
    }

    const normalizedValue = trimmedValue.toLowerCase();
    if (FINANCE_RECURRING_INTERVAL_VALUE_SET.has(normalizedValue)) {
        return normalizedValue;
    }

    const mappedValue = FINANCE_RECURRING_INTERVAL_LABEL_TO_VALUE[normalizedValue];
    return mappedValue || null;
};

module.exports = {
    FINANCE_RECURRING_INTERVALS,
    FINANCE_RECURRING_INTERVAL_VALUES,
    FINANCE_RECURRING_INTERVAL_LABEL_TO_VALUE,
    normalizeRecurringInterval
};
