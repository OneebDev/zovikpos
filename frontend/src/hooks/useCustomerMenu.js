import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { getSocket } from '../services/socket';

export const MENU_QUERY_KEY = ['menuItems'];

const fetchMenuItems = async () => {
  const response = await api.get('/menu');
  return response.data.items || [];
};

export const useCustomerMenu = ({ enabled = true } = {}) => {
  const queryClient = useQueryClient();

  const {
    data: menu = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: MENU_QUERY_KEY,
    queryFn: fetchMenuItems,
    staleTime: 1000 * 60 * 30, // 30 minutes
    gcTime: 1000 * 60 * 60, // 1 hour
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    enabled,
  });

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    // Granular socket update handler — modifies TanStack query cache in memory
    const handleMenuUpdate = (payload) => {
      console.log('⚡ Real-time menu update event received:', payload);
      if (!payload) return;

      queryClient.setQueryData(MENU_QUERY_KEY, (oldItems = []) => {
        if (!Array.isArray(oldItems)) return oldItems;

        // 1. Direct MenuItem update/create/delete payload (has numeric item id)
        if (payload.id !== undefined && payload.id !== null) {
          const targetId = Number(payload.id);
          const exists = oldItems.some((item) => Number(item.id) === targetId);

          // Deleted or deactivated item
          if (payload.deleted || payload.isActive === false) {
            return oldItems.filter((item) => Number(item.id) !== targetId);
          }

          // Updated item
          if (exists) {
            return oldItems.map((item) =>
              Number(item.id) === targetId ? { ...item, ...payload } : item
            );
          }

          // New item added (only if active)
          if (payload.isActive !== false) {
            return [...oldItems, payload];
          }

          return oldItems;
        }

        // 2. Inventory stock update payload (has item name and stockLevel)
        if (payload.name && (payload.stockLevel !== undefined || payload.stock !== undefined)) {
          const newStock = payload.stockLevel !== undefined ? payload.stockLevel : payload.stock;
          return oldItems.map((item) =>
            item.name.toLowerCase() === payload.name.toLowerCase()
              ? { ...item, stock: Number(newStock) }
              : item
          );
        }

        return oldItems;
      });
    };

    // Socket reconnect handler — controlled background sync after internet drop
    const handleConnect = () => {
      console.log('🔄 Socket connected/reconnected — syncing menu query cache in background');
      queryClient.invalidateQueries({ queryKey: MENU_QUERY_KEY });
    };

    socket.on('menu:update', handleMenuUpdate);
    socket.on('inventory:update', handleMenuUpdate);
    socket.on('connect', handleConnect);

    return () => {
      socket.off('menu:update', handleMenuUpdate);
      socket.off('inventory:update', handleMenuUpdate);
      socket.off('connect', handleConnect);
    };
  }, [queryClient]);

  return {
    menu,
    isLoading,
    isError,
    error,
    refetch,
  };
};
