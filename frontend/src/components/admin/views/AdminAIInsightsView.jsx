import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  BrainCircuit,
  Package,
  Sparkles,
  RefreshCw,
  AlertTriangle,
  Lightbulb,
  CheckCircle2,
} from 'lucide-react';
import api from '../../../services/api';

/**
 * Module-level cache so data persists across tab switches without re-fetching.
 * Key = branchKey ('all' or a specific id)
 * Value = { data, errorMsg, timestamp }
 */
const insightsCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const AdminAIInsightsView = ({ stats, alerts = [], selectedBranchId = 'all', onRecalculateAI, forecastingLoading }) => {
  const branchKey = selectedBranchId || 'all';

  const [loading, setLoading] = useState(false);
  const [aiData, setAiData] = useState(() => insightsCache.get(branchKey)?.data || null);
  const [errorMsg, setErrorMsg] = useState(() => insightsCache.get(branchKey)?.errorMsg || null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const prevBranchKey = useRef(branchKey);

  const fetchAIInsights = useCallback(async (forceRefresh = false) => {
    // Return cached data if still fresh and not forcing
    if (!forceRefresh) {
      const cached = insightsCache.get(branchKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        setAiData(cached.data);
        setErrorMsg(cached.errorMsg);
        return;
      }
    }

    setLoading(true);
    if (forceRefresh) setErrorMsg(null);
    // NOTE: intentionally keep old aiData visible during refresh — no blank flash

    try {
      const qParams = [];
      if (branchKey !== 'all') qParams.push(`branchId=${branchKey}`);
      if (forceRefresh) qParams.push('forceRefresh=true');
      const queryString = qParams.length > 0 ? `?${qParams.join('&')}` : '';

      const res = await api.get(`/inventory/ai-insights${queryString}`);
      if (res.data?.insights) {
        const newData = res.data.insights;
        const newError = res.data.aiAvailable === false
          ? (res.data.aiErrorMessage || 'AI Groq analysis temporarily unavailable. Showing factual data only.')
          : null;

        setAiData(newData);
        setErrorMsg(newError);
        setLastUpdated(new Date());

        insightsCache.set(branchKey, {
          data: newData,
          errorMsg: newError,
          timestamp: Date.now(),
        });
      }
    } catch (err) {
      console.warn('Failed to fetch AI insights:', err.message);
      setErrorMsg(
        aiData
          ? 'AI refresh encountered an error. Showing last known data.'
          : 'AI analysis is temporarily unavailable. Please retry.'
      );
    } finally {
      setLoading(false);
    }
  }, [branchKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // On mount or branch change
  useEffect(() => {
    const cached = insightsCache.get(branchKey);
    if (cached) {
      // Restore instantly from module-level cache — zero loading shown
      setAiData(cached.data);
      setErrorMsg(cached.errorMsg);
      setLastUpdated(new Date(cached.timestamp));
    } else {
      fetchAIInsights(false);
    }
    prevBranchKey.current = branchKey;
  }, [branchKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = async () => {
    if (onRecalculateAI) await onRecalculateAI();
    await fetchAIInsights(true);
  };

  const riskAlerts = aiData?.stockRiskAlerts || alerts || [];
  const optimizations = aiData?.foodCostOptimization || [];
  const accuracyText = aiData?.accuracyLabel || (stats?.metrics?.accuracyLabel || 'Not Enough Data');
  const accuracyHelper = aiData?.accuracyHelper || (stats?.metrics?.accuracyHelper || 'Prediction accuracy will appear after enough forecast history is available.');
  const prepTimeText = aiData?.avgPrepTimeLabel || (stats?.metrics?.avgPrepTimeLabel || (aiData?.avgPrepTimeMins ? `${aiData.avgPrepTimeMins} mins` : 'Not Enough Data'));
  const prepTimeSubtext = aiData?.isActualPrepTime ? 'Dynamic queue-aware actual prep time' : 'Average configured menu item prep time';
  const confidenceScore = aiData?.posConfidenceScore || (stats?.metrics?.posConfidenceScore || 'LOW — Limited Data');
  const confidenceExplanation = aiData?.posConfidenceExplanation || (stats?.metrics?.posConfidenceExplanation || 'Based on available POS transaction history');
  const isRefreshing = loading || forecastingLoading;

  return (
    <div className="space-y-6 sm:space-y-7">
      {/* Header Bar */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-5 bg-[var(--card-bg)] border border-[var(--border-color)] p-5 sm:p-6 rounded-2xl shadow-sm">
        <div>
          <div className="flex items-center space-x-2">
            <Sparkles className="w-5 h-5 text-orange-400" />
            <h2 className="text-xl font-extrabold text-[var(--text-main)] font-display">
              AI Groq ML Insights &amp; Demand Forecasting
            </h2>
          </div>
          <p className="text-sm text-[var(--text-muted)] mt-1 max-w-3xl leading-relaxed">
            Real-time demand forecasting derived strictly from historical POS transaction data, stockout risk prediction, and Groq LLM intelligence.
          </p>
          {lastUpdated && !isRefreshing && (
            <p className="text-[10px] text-emerald-400/70 mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              Last updated: {lastUpdated.toLocaleTimeString()}
            </p>
          )}
        </div>

        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="px-4 py-2.5 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center space-x-2 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>{isRefreshing ? 'Analyzing Real Data...' : 'Recalculate AI Demand Models'}</span>
        </button>
      </div>

      {/* Refresh progress banner — non-blocking, sits over existing data */}
      {isRefreshing && (
        <div className="bg-orange-500/10 border border-orange-500/30 p-4 rounded-2xl flex items-center justify-center space-x-3 text-orange-400 font-bold text-sm shadow-inner animate-pulse">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>Querying Groq AI &amp; computing demand models...</span>
        </div>
      )}

      {/* Error banner — non-blocking, never hides data */}
      {errorMsg && !isRefreshing && (
        <div className="bg-rose-500/10 border border-rose-500/30 p-4 rounded-xl flex items-center justify-between text-xs text-rose-300">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            onClick={handleRefresh}
            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold text-xs cursor-pointer shadow-md transition-all"
          >
            Retry Analysis
          </button>
        </div>
      )}

      {/* Data content — only rendered when aiData exists */}
      {aiData && (
        <>
      {/* Executive Summary */}
          {aiData.executiveSummary && !isRefreshing && (
            <div className="bg-orange-500/5 border border-orange-500/25 p-5 sm:p-6 rounded-2xl flex items-start gap-4 shadow-sm">
              <span className="p-2.5 rounded-xl bg-orange-500/10 shrink-0"><Lightbulb className="w-5 h-5 text-orange-400" /></span>
              <div>
                <strong className="font-bold block text-sm text-[var(--text-main)]">Key takeaway</strong>
                <p className="mt-1.5 text-sm sm:text-base text-[var(--text-muted)] leading-7 max-w-5xl">{aiData.executiveSummary}</p>
              </div>
            </div>
          )}

          {/* Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="bg-[var(--card-bg)] border border-[var(--border-color)] p-5 rounded-2xl shadow-sm space-y-2">
              <span className="text-[10px] uppercase font-black tracking-wider text-[var(--text-muted)]">Model Prediction Accuracy</span>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-orange-400 font-mono">{accuracyText}</h3>
              <p className="text-[10px] text-[var(--text-muted)]">{accuracyHelper}</p>
            </div>
            <div className="bg-[var(--card-bg)] border border-[var(--border-color)] p-5 rounded-2xl shadow-sm space-y-2">
              <span className="text-[10px] uppercase font-black tracking-wider text-[var(--text-muted)]">Average Kitchen Prep Time</span>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-emerald-400 font-mono">{prepTimeText}</h3>
              <p className="text-[10px] text-[var(--text-muted)]">{prepTimeSubtext}</p>
            </div>
            <div className="bg-[var(--card-bg)] border border-[var(--border-color)] p-5 rounded-2xl shadow-sm space-y-2">
              <span className="text-[10px] uppercase font-black tracking-wider text-[var(--text-muted)]">Stock Risk Predictions</span>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-amber-400 font-mono">{riskAlerts.length} Alerts</h3>
              <p className="text-[10px] text-[var(--text-muted)]">Low stock &amp; stockout risk notifications</p>
            </div>
            <div className="bg-[var(--card-bg)] border border-[var(--border-color)] p-5 rounded-2xl shadow-sm space-y-2">
              <span className="text-[10px] uppercase font-black tracking-wider text-[var(--text-muted)]">POS Data Confidence</span>
              <h3 className={`text-2xl sm:text-3xl font-extrabold font-mono ${
                confidenceScore.includes('HIGH') ? 'text-emerald-400' : confidenceScore.includes('MEDIUM') ? 'text-amber-400' : 'text-orange-400'
              }`}>
                {confidenceScore}
              </h3>
              <p className="text-[10px] text-[var(--text-muted)]">{confidenceExplanation}</p>
            </div>
          </div>

          {/* Demand & Cost sections */}
          <div className="grid lg:grid-cols-2 gap-4 sm:gap-6">
            {/* ML Demand Forecasts */}
            <div className="bg-[var(--card-bg)] border border-[var(--border-color)] p-5 sm:p-6 rounded-2xl shadow-sm space-y-4">
              <h3 className="text-sm font-black text-[var(--text-main)] flex items-center space-x-2">
                <BrainCircuit className="w-4 h-4 text-orange-400" />
                <span>Projected Item Demand Forecasts</span>
              </h3>
              <div className="divide-y divide-[var(--border-color)] text-xs">
                {riskAlerts.length === 0 ? (
                  <p className="py-8 text-[var(--text-muted)] italic text-center">No urgent stockout alerts predicted. Inventory levels are healthy.</p>
                ) : (
                  riskAlerts.map((alert, idx) => (
                    <div key={idx} className="py-4 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-3 items-start">
                      <div className="min-w-0">
                        <div className="flex items-center space-x-2">
                          <strong className="text-[var(--text-main)] font-bold">{alert.name || alert.itemName}</strong>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black border ${
                            alert.confidenceBadge === 'HIGH'
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                              : alert.confidenceBadge === 'MEDIUM'
                              ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                              : 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                          }`}>
                            {alert.confidenceBadge || 'HIGH'} CONFIDENCE
                          </span>
                        </div>
                        <p className="text-xs text-[var(--text-muted)] mt-1.5 leading-relaxed">{alert.message || 'Based on available inventory and historical sales data.'}</p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[10px] text-[var(--text-muted)]">
                          <span>On hand: <strong className="text-[var(--text-main)]">{alert.currentStock} {alert.unit}</strong></span>
                          <span>Safety minimum: <strong className="text-[var(--text-main)]">{alert.minThreshold} {alert.unit}</strong></span>
                        </div>
                      </div>
                      <div className="sm:min-w-40 sm:text-right rounded-xl bg-[var(--bg-color)] border border-[var(--border-color)] px-3 py-2.5">
                        <span className="text-[9px] uppercase tracking-wide text-[var(--text-muted)] block">Forecast / coverage</span>
                        <span className="font-mono font-extrabold text-orange-400 block text-xs mt-1">
                          {alert.forecastLabel || (alert.forecast > 0 ? `~${alert.forecast} ${alert.unit}` : 'Not enough sales data')}
                        </span>
                        {alert.suggestedRestock > 0 && (
                          <span className="text-[10px] font-bold text-amber-400 block mt-1">
                            Advise +{alert.suggestedRestock} {alert.unit} restock
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* AI Food Cost Optimizations */}
            <div className="bg-[var(--card-bg)] border border-[var(--border-color)] p-5 sm:p-6 rounded-2xl shadow-sm space-y-4">
              <h3 className="text-sm font-black text-[var(--text-main)] flex items-center space-x-2">
                <Package className="w-4 h-4 text-amber-400" />
                <span>AI Food Cost &amp; Margin Optimizations</span>
              </h3>
              <div className="divide-y divide-[var(--border-color)] text-xs">
                {optimizations.length === 0 ? (
                  <div className="py-8 text-[var(--text-muted)] italic text-center space-y-1">
                    <p className="font-bold text-xs">Not Enough Cost Data</p>
                    <p className="text-[10px] text-[var(--text-muted)]">Cost optimizations will appear as recipe costs and purchase transactions accumulate.</p>
                  </div>
                ) : (
                  optimizations.map((opt, idx) => (
                    <div key={idx} className="py-3.5 space-y-1">
                      <div className="flex justify-between items-center">
                        <strong className="text-[var(--text-main)] font-bold text-xs">{opt.title}</strong>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black border ${
                          opt.impact === 'High' ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                        }`}>
                          {opt.impact || 'Medium'} Impact
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">{opt.description}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Empty state — only when no data and not loading */}
      {!aiData && !isRefreshing && (
        <div className="bg-[var(--card-bg)]/30 border border-[var(--border-color)] p-12 rounded-2xl text-center space-y-4">
          <BrainCircuit className="w-12 h-12 text-orange-400/50 mx-auto" />
          <p className="text-[var(--text-muted)] text-sm">No AI insights available yet.</p>
          <button
            onClick={handleRefresh}
            className="px-5 py-2.5 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center space-x-2 cursor-pointer mx-auto"
          >
            <Sparkles className="w-4 h-4" />
            <span>Generate AI Insights</span>
          </button>
        </div>
      )}

      {/* Skeleton — only when first-time loading with no data */}
      {!aiData && isRefreshing && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-[var(--card-bg)]/30 border border-[var(--border-color)] p-5 rounded-2xl shadow-lg space-y-3 animate-pulse">
              <div className="h-2 bg-[var(--border-color)] rounded w-3/4"></div>
              <div className="h-8 bg-[var(--border-color)] rounded w-1/2"></div>
              <div className="h-2 bg-[var(--border-color)] rounded w-full"></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminAIInsightsView;
