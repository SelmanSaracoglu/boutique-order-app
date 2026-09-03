ALTER TABLE orders
  ADD COLUMN payment_status TEXT NOT NULL
    DEFAULT 'AWAITING_PAYMENT',
  ADD COLUMN payment_method TEXT,
  ADD CONSTRAINT orders_payment_status_valid
    CHECK (
      payment_status IN (
        'AWAITING_PAYMENT',
        'REPORTED',
        'CONFIRMED'
      )
    ),
  ADD CONSTRAINT orders_payment_method_valid
    CHECK (
      payment_method IS NULL
      OR payment_method IN ('BANK_TRANSFER', 'PAYPAL')
    ),
  ADD CONSTRAINT orders_payment_state_consistent
    CHECK (
      (
        payment_status = 'AWAITING_PAYMENT'
        AND payment_method IS NULL
      )
      OR (
        payment_status IN ('REPORTED', 'CONFIRMED')
        AND payment_method IS NOT NULL
      )
    );