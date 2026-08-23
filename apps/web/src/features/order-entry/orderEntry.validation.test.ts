import { describe, expect, it } from 'vitest';
import type { OrderEntryFormValues } from './orderEntry.types';
import { validateOrderEntry } from './orderEntry.validation';

const validOrderEntry: OrderEntryFormValues = {
  orderSource: 'instagram',
  customerIdentifier: '@selinboutique',
  customerName: 'Selin',
  operationalNote: 'Call before shipping',
  items: [
    {
      supplierAlias: 'A',
      description: 'Black linen dress',
      size: '40',
      color: 'Black',
      quantity: '2',
      unitPrice: '49.90',
    },
  ],
};

describe('validateOrderEntry', () => {
  it('returns validated order data for valid input', () => {
    const result = validateOrderEntry(validOrderEntry);

    expect(result).toEqual({
      success: true,
      data: {
        orderSource: 'instagram',
        customerIdentifier: '@selinboutique',
        customerName: 'Selin',
        operationalNote: 'Call before shipping',
        items: [
          {
            supplierAlias: 'A',
            description: 'Black linen dress',
            size: '40',
            color: 'Black',
            quantity: 2,
            unitPrice: 49.9,
          },
        ],
      },
    });
  });

  it('requires an order source', () => {
    const result = validateOrderEntry({
      ...validOrderEntry,
      orderSource: '',
    });

    expect(result).toEqual({
      success: false,
      errors: {
        orderSource: 'Order source is required.',
      },
    });
  });

  it('requires a customer identifier', () => {
    const result = validateOrderEntry({
      ...validOrderEntry,
      customerIdentifier: ' ',
    });

    expect(result).toEqual({
      success: false,
      errors: {
        customerIdentifier: 'Customer identifier is required.',
      },
    });
  });

  it('allows an order without a customer name', () => {
    const result = validateOrderEntry(
      {
        ...validOrderEntry,
        customerName: ' ',
      },
    );

    expect(result).toMatchObject({
      success: true,
      data: {
        orderSource: 'instagram',
        customerIdentifier: '@selinboutique',
      },
    });

    if (result.success) {
      expect(result.data).not.toHaveProperty('customerName');
    }
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

  it('requires required order item fields', () => {
    const result = validateOrderEntry({
      ...validOrderEntry,
      items: [
        {
          supplierAlias: '',
          description: '',
          size: '',
          color: '',
          quantity: '',
          unitPrice: '',
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
            quantity: 'Quantity must be at least 1.',
            unitPrice: 'Unit price is required.',
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

  it('accepts multiple order items and trims user-entered text', () => {
    const result = validateOrderEntry({
      ...validOrderEntry,
      customerIdentifier: ' @selinboutique ',
      customerName: ' Selin ',
      operationalNote: ' Call before shipping ',
      items: [
        {
          supplierAlias: ' A ',
          description: ' Black linen dress ',
          size: ' 40 ',
          color: ' Black ',
          quantity: '2',
          unitPrice: '49.90',
        },
        {
          supplierAlias: ' B ',
          description: ' Cream scarf ',
          size: ' One size ',
          color: ' Cream ',
          quantity: '1',
          unitPrice: '29.90',
        },
      ],
    },
  );

    expect(result).toEqual({
      success: true,
      data: {
        orderSource: 'instagram',
        customerIdentifier: '@selinboutique',
        customerName: 'Selin',
        operationalNote: 'Call before shipping',
        items: [
          {
            supplierAlias: 'A',
            description: 'Black linen dress',
            size: '40',
            color: 'Black',
            quantity: 2,
            unitPrice: 49.9,
          },
          {
            supplierAlias: 'B',
            description: 'Cream scarf',
            size: 'One size',
            color: 'Cream',
            quantity: 1,
            unitPrice: 29.9,
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
        orderSource: 'instagram',
        customerIdentifier: '@selinboutique',
      },
    });

    if (result.success) {
      expect(result.data).not.toHaveProperty('operationalNote');
    }
  });

  it('allows size and color to be omitted', () => {
    const result = validateOrderEntry(
      {
        ...validOrderEntry,
        items: [
          {
            ...validOrderEntry.items[0],
            size: ' ',
            color: ' ',
          },
        ],
      },
    );

    expect(result).toMatchObject({
      success: true,
      data: {
        items: [
          {
            supplierAlias: 'A',
            description: 'Black linen dress',
            quantity: 2,
            unitPrice: 49.9,
          },
        ],
      },
    });

    if (result.success) {
      expect(result.data.items[0]).not.toHaveProperty('size');
      expect(result.data.items[0]).not.toHaveProperty('color');
    }
  });

  it('rejects a non-positive unit price', () => {
    const result = validateOrderEntry({
      ...validOrderEntry,
      items: [
        {
          ...validOrderEntry.items[0],
          unitPrice: '0',
        },
      ],
    });

    expect(result).toEqual({
      success: false,
      errors: {
        items: [
          {
            unitPrice: 'Unit price must be greater than 0.',
          },
        ],
      },
    });
  });

  it('rejects a quantity above the PostgreSQL integer range', () => {
  const result = validateOrderEntry({
    ...validOrderEntry,
    items: [
      {
        ...validOrderEntry.items[0],
        quantity: '2147483648',
      },
    ],
  });

  expect(result).toEqual({
    success: false,
    errors: {
      items: [
        {
          quantity:
            'Quantity must be less than or equal to 2147483647.',
        },
      ],
    },
  });
});

it('accepts the maximum supported quantity', () => {
  const result = validateOrderEntry({
    ...validOrderEntry,
    items: [
      {
        ...validOrderEntry.items[0],
        quantity: '2147483647',
      },
    ],
  });

  expect(result.success).toBe(true);
});

it('rejects a unit price with more than two decimal places', () => {
  const result = validateOrderEntry({
    ...validOrderEntry,
    items: [
      {
        ...validOrderEntry.items[0],
        unitPrice: '49.999',
      },
    ],
  });

  expect(result).toEqual({
    success: false,
    errors: {
      items: [
        {
          unitPrice:
            'Unit price must have at most 2 decimal places.',
        },
      ],
    },
  });
});

  it('rejects a unit price above the API-supported range', () => {
    const result = validateOrderEntry({
      ...validOrderEntry,
      items: [
        {
          ...validOrderEntry.items[0],
          unitPrice: '10000000000.00',
        },
      ],
    });

    expect(result).toEqual({
      success: false,
      errors: {
        items: [
          {
            unitPrice:
              'Unit price must be €9,999,999,999.99 or less.',
          },
        ],
      },
    });
  });

});