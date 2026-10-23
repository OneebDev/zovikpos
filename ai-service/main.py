from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import os
import numpy as np
import pandas as pd
from fastapi import Request
from exception_logger import log as log_exception, exception as log_error, fatal_sync as log_fatal_sync, flush as flush_logs, validate_config

try:
    validate_config()
except Exception as config_error:
    log_error("startup.env", config_error)
    raise

import sys
import threading
import atexit

def _uncaught_exception(exc_type, exc_value, exc_traceback):
    if issubclass(exc_type, KeyboardInterrupt):
        return sys.__excepthook__(exc_type, exc_value, exc_traceback)
    log_fatal_sync("process.uncaughtException", exc_value)
    flush_logs()

sys.excepthook = _uncaught_exception

def _thread_exception(args):
    log_error("process.threadException", args.exc_value)

threading.excepthook = _thread_exception
atexit.register(flush_logs)
try:
    from sklearn.ensemble import RandomForestRegressor
    SKLEARN_AVAILABLE = True
except Exception as e:
    log_error("ai.startup", e, level="warn")
    SKLEARN_AVAILABLE = False
from model import forecast_demand

app = FastAPI(
    title="AI POS Inventory Forecasting API",
    description="Python FastAPI service for ML-powered inventory demand prediction & ETA prediction",
    version="1.0.0"
)

@app.middleware("http")
async def log_http_failures(request: Request, call_next):
    try:
        response = await call_next(request)
        if response.status_code >= 400:
            log_exception(
                "error" if response.status_code >= 500 else "warn",
                f"http.response.{response.status_code}",
                f"HTTP {response.status_code}",
                context={"method": request.method, "url": request.url.path, "status": response.status_code, "ip": request.client.host if request.client else None},
            )
        return response
    except Exception as request_error:
        log_error("http.unhandled", request_error, context={"method": request.method, "url": request.url.path, "status": 500, "ip": request.client.host if request.client else None})
        raise

@app.on_event("startup")
async def log_startup():
    log_exception("info", "service.startup", "AI service started")

@app.on_event("shutdown")
async def log_shutdown():
    log_exception("warn", "process.signal", "AI service shutting down")
    flush_logs()

# Train the ETA model at startup
print("Training RandomForest ETA model...")
eta_model = None
eta_model = None

# --------------------
# Train ETA model (optional – uses scikit‑learn if available)
# --------------------

def train_eta_model():
    if not SKLEARN_AVAILABLE:
        return None
    np.random.seed(42)
    n_samples = 200
    base_etas = np.random.uniform(3, 20, n_samples)
    queue_lengths = np.random.randint(0, 15, n_samples)
    hours = np.random.randint(8, 22, n_samples)
    days = np.random.randint(0, 7, n_samples)
    is_peak = np.array([1 if h in [12, 13, 18, 19] else 0 for h in hours])

    kitchen_loads = []
    for q in queue_lengths:
        if q <= 3:
            kitchen_loads.append(0)
        elif q <= 7:
            kitchen_loads.append(1)
        else:
            kitchen_loads.append(2)
    kitchen_loads = np.array(kitchen_loads)

    historical_delays = np.random.uniform(-1, 5, n_samples)
    noise = np.random.normal(0, 1.0, n_samples)
    actual_times = base_etas + (queue_lengths * 1.2) + (is_peak * 3.0) + (kitchen_loads * 2.0) + historical_delays + noise
    actual_times = np.clip(actual_times, 2.0, None)

    df = pd.DataFrame({
        'base_eta': base_etas,
        'queue_length': queue_lengths,
        'hour': hours,
        'day_of_week': days,
        'is_peak_hour': is_peak,
        'kitchen_load': kitchen_loads,
        'historical_delay': historical_delays,
        'actual_time': actual_times
    })

    features = ['base_eta', 'queue_length', 'hour', 'day_of_week', 'is_peak_hour', 'kitchen_load', 'historical_delay']
    model = RandomForestRegressor(n_estimators=50, random_state=42)
    model.fit(df[features], df['actual_time'])
    return model

# Initialise the model (fallback if sklearn missing)
try:
    eta_model = train_eta_model()
    if eta_model is not None:
        print("RandomForest ETA model trained successfully.")
    else:
        print("Skipping model training – using fallback ETA calculations.")
except Exception as e:
    log_error("ai.eta.startup", e)
    eta_model = None

class ForecastRequest(BaseModel):
    item_name: str
    weekday: int
    month: int
    season: int
    promotions: int
    exams_season: int
    weather: int
    historical_sales: Optional[List[float]] = None

class ForecastResponse(BaseModel):
    item_name: str
    forecast: float
    confidence: float
    percent_change: float
    note: str

class ETARequest(BaseModel):
    base_eta: float
    queue_length: int
    hour: int
    day_of_week: int
    is_peak_hour: int
    kitchen_load: int  # 0: Low, 1: Medium, 2: High
    historical_delay: float

class ETAResponse(BaseModel):
    estimated_time: float

@app.get("/")
def read_root():
    return {
        "service": "AI POS Inventory Forecasting API",
        "status": "online",
        "endpoints": ["/predict", "/predict-eta"]
    }

@app.post("/predict", response_model=ForecastResponse)
def get_prediction(request: ForecastRequest):
    target_features = {
        'weekday': request.weekday,
        'month': request.month,
        'season': request.season,
        'promotions': request.promotions,
        'exams_season': request.exams_season,
        'weather': request.weather
    }
    
    result = forecast_demand(request.item_name, target_features, request.historical_sales)
    
    return ForecastResponse(
        item_name=request.item_name,
        forecast=result["forecast"],
        confidence=result["confidence"],
        percent_change=result.get("percent_change", 0.0),
        note=result["note"]
    )

@app.post("/predict-eta", response_model=ETAResponse)
def predict_eta(request: ETARequest):
    if eta_model is None:
        # Simple math fallback if model training failed
        fallback = request.base_eta + (request.queue_length * 1.2) + (request.is_peak_hour * 3.0) + (request.kitchen_load * 2.0) + request.historical_delay
        return ETAResponse(estimated_time=float(max(2.0, fallback)))
    
    try:
        features = [[
            request.base_eta,
            request.queue_length,
            request.hour,
            request.day_of_week,
            request.is_peak_hour,
            request.kitchen_load,
            request.historical_delay
        ]]
        prediction = eta_model.predict(features)[0]
        return ETAResponse(estimated_time=float(max(2.0, prediction)))
    except Exception as e:
        # Fallback formula
        log_error("ai.eta.predict", e, level="warn", context={"action": "fallback"})
        fallback = request.base_eta + (request.queue_length * 1.2) + (request.is_peak_hour * 3.0) + (request.kitchen_load * 2.0) + request.historical_delay
        return ETAResponse(estimated_time=float(max(2.0, fallback)))

if __name__ == "__main__":
    import os
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
