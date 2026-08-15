import { describe, expect, it } from 'vitest';
import type { OrderEntryFormValues } from './orderEntry.types';
import { validateOrderEntry } from './orderEntry.validation';

const validOrderEntry: OrderEntryFormValues = {
  customerReference: '@selinboutique',
  contactChannel: 'instagram',
  contactValue: '@selinboutique',
  orderChannel: 'instagram',
  orderDate: '2026-08-14',
  operationalNote: 'Call before shipping',
  items: [
    {
      supplierAlias: 'A',
      description: 'Black linen dress',
      size: '40',
      color: 'Black',
      quantity: '2',
    },
  ],
};

describe('validateOrderEntry', () => {
  it('returns validated order data for valid input', () => {
    const result = validateOrderEntry(validOrderEntry);

    expect(result).toEqual({
      success: true,
      data: {
        customerReference: '@selinboutique',
        contactChannel: 'instagram',
        contactValue: '@selinboutique',
        orderChannel: 'instagram',
        orderDate: '2026-08-14',
        operationalNote: 'Call before shipping',
        items: [
          {
            supplierAlias: 'A',
            description: 'Black linen dress',
            size: '40',
            color: 'Black',
            quantity: 2,
          },
        ],
      },
    });
  });

  it('requires a customer reference', () => {
    const result = validateOrderEntry({
      ...validOrderEntry,
      customerReference: ' ',
    });

    expect(result).toEqual({
      success: false,
      errors: {
        customerReference: 'Customer reference is required.',
      },
    });
  });

  it('requires a contact channel', () => {
    const result = validateOrderEntry({
      ...validOrderEntry,
      contactChannel: '',
    });

    expect(result).toEqual({
      success: false,
      errors: {
        contactChannel: 'Contact channel is required.',
      },
    });
  });

  it('requires an  order channel', () => {
    const result = validateOrderEntry({
      ...validOrderEntry,
      orderChannel: '',
    });

    expect(result).toEqual({
      success: false,
      errors: {
        orderChannel: 'Order channel is required.',
      },
    });
  });

  it('requires an order date', () => {
    const result = validateOrderEntry({
      ...validOrderEntry,
      orderDate: '',
    });

    expect(result).toEqual({
      success: false,
      errors: {
        orderDate: 'Order date is required.',
      },
    });
  });

  it('requires a contact value', () => {
    const result = validateOrderEntry({
      ...validOrderEntry,
      contactValue: ' ',
    });

    expect(result).toEqual({
      success: false,
      errors: {
        contactValue: 'Contact value is required.',
      },
    });
  });

  it('requires at least one order item', () => {
    const result = validateOrderEntry({
      ...validOrderEntry,
      items: [],
    });

    expect(result).toEqual({
      success: false,
      errors: {
        itemsMessage: 'At least one order item is required.',
      },
    });
  });

  it('requires all order item fields', () => {
    const result = validateOrderEntry({
      ...validOrderEntry,
      items: [
        {
          supplierAlias: '',
          description: '',
          size: '',
          color: '',
          quantity: '',
        },
      ],
    });

    expect(result).toEqual({
      success: false,
      errors: {
        items: [
          {
            supplierAlias: 'Supplier alias is required.',
            description: 'Item description is required.',
            size: 'Size is required.',
            color: 'Color is required.',
            quantity: 'Quantity must be at least 1.',
          },
        ],
      },
    });
  });

  it('rejects a quantity below one', () => {
    const result = validateOrderEntry({
      ...validOrderEntry,
      items: [
        {
          ...validOrderEntry.items[0],
          quantity: '0',
        },
      ],
    });

    expect(result).toEqual({
      success: false,
      errors: {
        items: [
          {
            quantity: 'Quantity must be at least 1.',
          },
        ],
      },
    });
  });

  it('rejects a non-integer quantity', () => {
    const result = validateOrderEntry({
      ...validOrderEntry,
      items: [
        {
          ...validOrderEntry.items[0],
          quantity: '1.5',
        },
      ],
    });

    expect(result).toEqual({
      success: false,
      errors: {
        items: [
          {
            quantity: 'Quantity must be at least 1.',
          },
        ],
      },
    });
  });

  it('rejects an invalid order date', () => {
    const result = validateOrderEntry({
      ...validOrderEntry,
      orderDate: '2026-02-30',
    });

    expect(result).toEqual({
      success: false,
      errors: {
        orderDate: 'Order date must be a valid date.',
      },
    });
  });

  it('accepts multiple order items and trims user-entered text', () => {
    const result = validateOrderEntry({
      ...validOrderEntry,
      customerReference: ' @selinboutique ',
      contactValue: ' @selinboutique ',
      operationalNote: ' Call before shipping ',
      items: [
        {
          supplierAlias: ' A ',
          description: ' Black linen dress ',
          size: ' 40 ',
          color: ' Black ',
          quantity: '2',
        },
        {
          supplierAlias: ' B ',
          description: ' Cream scarf ',
          size: ' One size ',
          color: ' Cream ',
          quantity: '1',
        },
      ],
    });

    expect(result).toEqual({
      success: true,
      data: {
        customerReference: '@selinboutique',
        contactChannel: 'instagram',
        contactValue: '@selinboutique',
        orderChannel: 'instagram',
        orderDate: '2026-08-14',
        operationalNote: 'Call before shipping',
        items: [
          {
            supplierAlias: 'A',
            description: 'Black linen dress',
            size: '40',
            color: 'Black',
            quantity: 2,
          },
          {
            supplierAlias: 'B',
            description: 'Cream scarf',
            size: 'One size',
            color: 'Cream',
            quantity: 1,
          },
        ],
      },
    });
  });

  it('keeps validation errors aligned with the order item index', () => {
    const result = validateOrderEntry({
      ...validOrderEntry,
      items: [
        validOrderEntry.items[0],
        {
          ...validOrderEntry.items[0],
          description: '',
        },
      ],
    });

    expect(result).toEqual({
      success: false,
      errors: {
        items: [
          {},
          {
            description: 'Item description is required.',
          },
        ],
      },
    });
  });

  it('allows an order without an operational note', () => {
    const result = validateOrderEntry({
      ...validOrderEntry,
      operationalNote: ' ',
    });

    expect(result).toMatchObject({
      success: true,
      data: {
        customerReference: '@selinboutique',
        contactChannel: 'instagram',
        contactValue: '@selinboutique',
        orderChannel: 'instagram',
        orderDate: '2026-08-14',
      },
    });

    if (result.success) {
      expect(result.data).not.toHaveProperty('operationalNote');
    }
  });

});