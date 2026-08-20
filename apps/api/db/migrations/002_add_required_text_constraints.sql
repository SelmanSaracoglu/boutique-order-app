ALTER TABLE orders
  ADD CONSTRAINT orders_customer_identifier_not_blank
  CHECK (btrim(customer_identifier) <> '');

ALTER TABLE order_items
  ADD CONSTRAINT order_items_supplier_alias_not_blank
  CHECK (btrim(supplier_alias) <> ''),
  ADD CONSTRAINT order_items_description_not_blank
  CHECK (btrim(description) <> '');