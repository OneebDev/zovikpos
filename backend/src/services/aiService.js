const axios = require('axios');
const exceptionLogger = require('../utils/exceptionLogger');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

/**
 * Retrieves stock level forecasting for a given item.
 * Falls back to simple moving average if Python FastAPI service is offline.
 * @param {string} itemName
 * @param {Array<number>} historicalSales
 * @returns {Promise<{forecast: number, source: string}>}
 */
const getInventoryForecast = async (itemName, historicalSales, features = {}) => {
  const actualHistory = historicalSales && historicalSales.length > 0
    ? historicalSales
    : [10, 12, 14, 11, 15, 13, 16]; // baseline history for forecasting

  const now = new Date();
  const weekday = features.weekday !== undefined ? features.weekday : now.getDay();
  const month = features.month !== undefined ? features.month : now.getMonth() + 1;

  // 0: Winter, 1: Spring, 2: Summer, 3: Autumn
  let defaultSeason = 0;
  if (month >= 3 && month <= 5) defaultSeason = 1;
  else if (month >= 6 && month <= 8) defaultSeason = 2;
  else if (month >= 9 && month <= 11) defaultSeason = 3;

  const season = features.season !== undefined ? features.season : defaultSeason;
  const promotions = features.promotions !== undefined ? features.promotions : 0;
  const exams_season = features.exams_season !== undefined ? features.exams_season : 0;

  // Weather mapping: 0: Clear, 1: Rain, 2: Hot/Sunny, 3: Cold
  let weather;
  if (features.weather !== undefined) {
    weather = features.weather;
  } else {
    const weatherMapping = { 'Clear': 0, 'Rain': 1, 'Hot/Sunny': 2, 'Cold': 3 };
    weather = weatherMapping[features.weatherString] || 0;
  }

  try {
    const response = await axios.post(`${AI_SERVICE_URL}/predict`, {
      item_name: itemName,
      weekday,
      month,
      season,
      promotions,
      exams_season,
      weather,
      historical_sales: actualHistory
    }, { timeout: 500 });

    return {
      forecast: response.data.forecast,
      confidence: response.data.confidence,
      percentChange: response.data.percent_change,
      source: 'fastapi-ml'
    };
  } catch (error) {
    exceptionLogger.exception('ai.forecast', error, {
      level: 'warn', context: { action: 'fallback', code: error.code },
    });

    // Fallback: Simple moving average (SMA) of last 3 periods, or average of whatever is available
    const length = actualHistory.length;
    const subset = actualHistory.slice(Math.max(0, length - 3));
    const sum = subset.reduce((acc, val) => acc + val, 0);
    const average = subset.length > 0 ? sum / subset.length : 15.0;

    return {
      forecast: parseFloat(average.toFixed(2)),
      confidence: 0.6,
      percentChange: 0.0,
      source: 'node-fallback-sma'
    };
  }
};

module.exports = {
  getInventoryForecast
};
