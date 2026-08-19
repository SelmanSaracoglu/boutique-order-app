import { describe, expect, it } from 'vitest';

import type { OrderEntryData } from '../order-entry/orderEntry.types';
import { createOrderStorage } from './orderStorage';

function createMemoryStorage() {
  const values = new Map<string, string>();

  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },

    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

const realisticOrder: OrderEntryData = {
  orderSource: 'instagram',
  customerIdentifier: '@ayseyilmaz',
  customerName: 'Ayşe Yılmaz',
  createdAt: '2026-08-16T14:00:00.000Z',
  items: [
    {
      supplierAlias: 'A',
      description: 'Yaka çiçekli elbise',
      size: '40',
      color: 'Black',
      quantity: 1,
      unitPrice: 49.9,
    },
    {
      supplierAlias: 'B',
      description: 'Basic shirt',
      size: 'M',
      color: 'White',
      quantity: 2,
      unitPrice: 29.9,
    },
  ],
};

describe('orderStorage', () => {
  it('returns an empty collection when no orders are persisted', () => {
    const storage = createMemoryStorage();
    const orderStorage = createOrderStorage(storage);

    expect(orderStorage.getOrders()).toEqual([]);
  });

  it('persists an order and reads it back', () => {
    const storage = createMemoryStorage();

    const orderStorage = createOrderStorage(
      storage,
      () => 'order-1',
    );

    const savedOrder = orderStorage.saveOrder(realisticOrder);

    const reloadedOrderStorage = createOrderStorage(storage);

    expect(savedOrder).toEqual({
      ...realisticOrder,
      id: 'order-1',
    });

    expect(reloadedOrderStorage.getOrders()).toEqual([
      savedOrder,
    ]);
  });

  it('finds one persisted order by id', () => {
    const storage = createMemoryStorage();

    const orderStorage = createOrderStorage(
      storage,
      () => 'order-1',
    );

    const savedOrder = orderStorage.saveOrder(realisticOrder);

    expect(orderStorage.getOrder('order-1')).toEqual(savedOrder);
  });

  it('reports a failure when persisted orders cannot be read', () => {
    const storage = {
      getItem() {
        return 'invalid-json';
      },

      setItem() {},
    };

    const orderStorage = createOrderStorage(storage);

    expect(() => orderStorage.getOrders()).toThrow(
      'Unable to read persisted orders.',
    );
  });

  it('reports a failure when an order cannot be persisted', () => {
    const storage = {
      getItem() {
        return null;
      },

      setItem() {
        throw new Error('Storage unavailable');
      },
    };

    const orderStorage = createOrderStorage(storage);

    expect(() => orderStorage.saveOrder(realisticOrder)).toThrow(
      'Unable to save order.',
    );
  });
});


