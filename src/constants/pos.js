const SALE_STATUSES = Object.freeze({
    OPEN: 'open',
    PENDING_PAYMENT: 'pending_payment',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled'
});

const PAYMENT_METHODS = Object.freeze([
    { value: 'cash', label: 'Dinheiro' },
    { value: 'debit', label: 'Débito' },
    { value: 'credit', label: 'Crédito' },
    { value: 'pix', label: 'PIX' },
    { value: 'voucher', label: 'Voucher' },
    { value: 'transfer', label: 'Transferência' },
    { value: 'other', label: 'Outro' }
]);

const PAYMENT_METHOD_VALUES = PAYMENT_METHODS.map((method) => method.value);

module.exports = {
    SALE_STATUSES,
    PAYMENT_METHODS,
    PAYMENT_METHOD_VALUES
};
