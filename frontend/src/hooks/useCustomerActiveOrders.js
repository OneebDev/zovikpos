import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { getSocket } from '../services/socket';

export const ACTIVE_ORDERS_QUERY_KEY = ['customerActiveOrders'];

const getInitialCache = () => {
  try {
    const saved = localStorage.getItem('customer_active_orders_cache');
    return saved ? JSON.parse(saved) : { activeOrders: [], failedOrders: [] };
  } catch {
    return { activeOrders: [], failedOrders: [] };
  }
};

const fetchCustomerOrders = async () => {
  const sessionId = localStorage.getItem('customer_sessionId');
  if (!sessionId) return { activeOrders: [], failedOrders: [] };

  // For logged-in customers, omit sessionId filter so the backend returns all
  // their orders (filtered by userId server-side). This keeps active orders
  // from a previous table visible after switching tables.
  const isLoggedIn = Boolean(
    localStorage.getItem('customer_token') || localStorage.getItem('token') ||
    sessionStorage.getItem('customer_token') || sessionStorage.getItem('token')
  );
  const url = isLoggedIn ? '/orders' : `/orders?sessionId=${sessionId}`;
  const response = await api.get(url);
  const orders = response.data.orders || [];

  const ACTIVE_ORDER_STATUSES = ['PENDING', 'PAYMENT_PENDING', 'PAID', 'PREPARING', 'READY'];
  const FAILED_STATUSES = ['PAYMENT_FAILED', 'REJECTED', 'CANCELLED'];

  const unfinished = orders.filter((o) => ACTIVE_ORDER_STATUSES.includes(o.status));

  const dismissedIds = JSON.parse(localStorage.getItem('customer_dismissed_failed') || '[]');
  const failed = orders.filter(
    (o) => FAILED_STATUSES.includes(o.status) && !dismissedIds.includes(o.id)
  );

  const result = { activeOrders: unfinished, failedOrders: failed };
  localStorage.setItem('customer_active_orders_cache', JSON.stringify(result));
  return result;
};

export const useCustomerActiveOrders = ({ enabled = true } = {}) => {
  const queryClient = useQueryClient();
  const sessionId = typeof window !== 'undefined' ? localStorage.getItem('customer_sessionId') : null;

  const {
    data = getInitialCache(),
    isLoading,
    refetch,
  } = useQuery({
    queryKey: [...ACTIVE_ORDERS_QUERY_KEY, sessionId],
    queryFn: fetchCustomerOrders,
    initialData: getInitialCache(),
    enabled: Boolean(sessionId) && enabled,
    staleTime: 1000 * 10, // 10 seconds staleTime for background re-validation on mount
    gcTime: 1000 * 60 * 30,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const ACTIVE_ORDER_STATUSES = ['PENDING', 'PAYMENT_PENDING', 'PAID', 'PREPARING', 'READY'];
    const FAILED_STATUSES = ['PAYMENT_FAILED', 'REJECTED', 'CANCELLED'];

    const handleOrderUpdate = (updatedOrder) => {
      if (!updatedOrder) return;
      const activeSId = localStorage.getItem('customer_sessionId');
      let currentCustomer = null;
      try {
        currentCustomer = JSON.parse(localStorage.getItem('customer_user') || localStorage.getItem('user') || 'null');
      } catch {}

      // Handle deletion broadcast
      if (updatedOrder.orderDeletedId || updatedOrder.bulkDeletedOrderIds) {
        queryClient.setQueryData([...ACTIVE_ORDERS_QUERY_KEY, activeSId], (oldData = getInitialCache()) => {
          const deletedIds = updatedOrder.bulkDeletedOrderIds || [updatedOrder.orderDeletedId];
          const newActive = (oldData?.activeOrders || []).filter(o => !deletedIds.includes(o.id));
          const newFailed = (oldData?.failedOrders || []).filter(o => !deletedIds.includes(o.id));
          const updatedResult = { activeOrders: newActive, failedOrders: newFailed };
          localStorage.setItem('customer_active_orders_cache', JSON.stringify(updatedResult));
          return updatedResult;
        });
        return;
      }

      const isMatch = Boolean(
        (activeSId && updatedOrder.sessionId === activeSId) ||
        (currentCustomer?.id && updatedOrder.userId === currentCustomer.id)
      );
      if (!isMatch) return;

      queryClient.setQueryData([...ACTIVE_ORDERS_QUERY_KEY, activeSId], (oldData = getInitialCache()) => {
        const currentActive = oldData?.activeOrders || [];
        const currentFailed = oldData?.failedOrders || [];

        let newActive = [...currentActive];
        let newFailed = [...currentFailed];

        if (ACTIVE_ORDER_STATUSES.includes(updatedOrder.status)) {
          const exists = newActive.some((o) => o.id === updatedOrder.id);
          if (exists) {
            newActive = newActive.map((o) => (o.id === updatedOrder.id ? updatedOrder : o));
          } else {
            newActive = [updatedOrder, ...newActive];
          }
        } else {
          // Immediately purge completed, refunded, or non-active orders from tracking
          newActive = newActive.filter((o) => o.id !== updatedOrder.id);
        }

        if (FAILED_STATUSES.includes(updatedOrder.status)) {
          const dismissedIds = JSON.parse(localStorage.getItem('customer_dismissed_failed') || '[]');
          if (!dismissedIds.includes(updatedOrder.id)) {
            const exists = newFailed.some((o) => o.id === updatedOrder.id);
            if (exists) {
              newFailed = newFailed.map((o) => (o.id === updatedOrder.id ? updatedOrder : o));
            } else {
              newFailed = [updatedOrder, ...newFailed];
            }
          }
        } else {
          newFailed = newFailed.filter((o) => o.id !== updatedOrder.id);
        }

        const updatedResult = { activeOrders: newActive, failedOrders: newFailed };
        localStorage.setItem('customer_active_orders_cache', JSON.stringify(updatedResult));
        return updatedResult;
      });
    };

    const handleTableShift = () => {
      if (enabled) refetch();
    };

    socket.on('order:update', handleOrderUpdate);
    socket.on('table:shift', handleTableShift);

    return () => {
      socket.off('order:update', handleOrderUpdate);
      socket.off('table:shift', handleTableShift);
    };
  }, [queryClient, sessionId, refetch, enabled]);

  const dismissFailedOrder = (orderId) => {
    const dismissedIds = JSON.parse(localStorage.getItem('customer_dismissed_failed') || '[]');
    if (!dismissedIds.includes(orderId)) dismissedIds.push(orderId);
    localStorage.setItem('customer_dismissed_failed', JSON.stringify(dismissedIds));

    queryClient.setQueryData([...ACTIVE_ORDERS_QUERY_KEY, sessionId], (oldData = getInitialCache()) => {
      const updatedResult = {
        ...oldData,
        failedOrders: (oldData.failedOrders || []).filter((o) => o.id !== orderId),
      };
      localStorage.setItem('customer_active_orders_cache', JSON.stringify(updatedResult));
      return updatedResult;
    });
  };

  return {
    activeOrders: data.activeOrders || [],
    failedOrders: data.failedOrders || [],
    isLoading,
    refetch,
    dismissFailedOrder,
  };
};

