import type { OrderEntryData } from '../order-entry/orderEntry.types';

export type PersistedOrder = OrderEntryData & {
  id: string;
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

const ORDERS_STORAGE_KEY = 'boutique-order-app.orders';

export function createOrderStorage(
  storage: StorageLike = window.localStorage,
  createId: () => string = () => crypto.randomUUID(),
) {
  function getOrders(): PersistedOrder[] {
    try {
      const storedOrders = storage.getItem(ORDERS_STORAGE_KEY);

      if (storedOrders === null) {
        return [];
      }

      const parsedOrders: unknown = JSON.parse(storedOrders);

      if (!Array.isArray(parsedOrders)) {
        throw new Error('Persisted orders are not a collection.');
      }

      return parsedOrders as PersistedOrder[];
    } catch (error) {
      throw new Error('Unable to read persisted orders.', {
        cause: error,
      });
    }
  }

  function saveOrder(order: OrderEntryData): PersistedOrder {
    const persistedOrder: PersistedOrder = {
      ...order,
      id: createId(),
    };

    const currentOrders = getOrders();

    try {
      storage.setItem(
        ORDERS_STORAGE_KEY,
        JSON.stringify([...currentOrders, persistedOrder]),
      );
    } catch (error) {
      throw new Error('Unable to save order.', {
        cause: error,
      });
    }

    return persistedOrder;
  }

  function getOrder(id: string): PersistedOrder | undefined {
    return getOrders().find((order) => order.id === id);
  }

  return {
    getOrders,
    saveOrder,
    getOrder,
  };
}

export type OrderStorage = ReturnType<typeof createOrderStorage>;