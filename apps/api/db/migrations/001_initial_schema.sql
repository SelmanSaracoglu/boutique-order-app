CREATE TABLE orders (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_source TEXT NOT NULL
    CHECK (order_source IN ('instagram', 'whatsapp')),
  customer_identifier TEXT NOT NULL,
  customer_name TEXT,
  operational_note TEXT,
  status TEXT NOT NULL DEFAULT 'NEW'
    CHECK (status IN ('NEW', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE order_items (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  position INTEGER NOT NULL CHECK (position > 0),
  supplier_alias TEXT NOT NULL,
  description TEXT NOT NULL,
  size TEXT,
  color TEXT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price > 0),
  UNIQUE (order_id, position)
);