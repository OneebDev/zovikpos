import api from './api';

/**
 * Fetches the predicted preparation time, estimated bill in Rs., and kitchen load status
 * for the items currently in the cart before order confirmation.
 * @param {Array} items - Array of { menuItemId: number, quantity: number }
 * @returns {Promise<Object>} - Promise resolving to { estimatedTime, estimatedBill, kitchenLoad }
 */
export const getETAPrediction = async (items, { signal } = {}) => {
  try {
    const response = await api.post('/eta', { items }, { signal });
    return response.data;
  } catch (error) {
    console.error('Failed to retrieve ETA prediction from backend:', error);
    throw error;
  }
};
