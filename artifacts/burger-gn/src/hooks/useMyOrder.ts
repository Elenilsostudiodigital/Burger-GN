import { useEffect, useState } from 'react';
import {
  getVisibleMyOrder,
  subscribeMyOrderChanged,
  type MyOrderRef,
} from '../lib/myOrder';

/** Reactive "Meu Pedido" tab/FAB visibility — only when an active order exists. */
export function useVisibleMyOrder(): MyOrderRef | null {
  const [order, setOrder] = useState<MyOrderRef | null>(() => getVisibleMyOrder());

  useEffect(() => {
    const sync = () => setOrder(getVisibleMyOrder());
    sync();
    return subscribeMyOrderChanged(sync);
  }, []);

  return order;
}
