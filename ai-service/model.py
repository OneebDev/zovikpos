import numpy as np
import pandas as pd
from exception_logger import exception as log_error
from datetime import datetime, timedelta

try:
    from sklearn.ensemble import RandomForestRegressor
    SKLEARN_AVAILABLE = True
except Exception as e:
    log_error("ai.model.import", e, level="warn")
    SKLEARN_AVAILABLE = False

def generate_synthetic_data(item_name: str, days: int = 90) -> pd.DataFrame:
    """
    Generates realistic daily sales data for the past N days for an item,
    modelling weekday patterns, seasons, weather, exams, and promotions.
    """
    np.random.seed(42 + hash(item_name) % 100)
    
    # Establish a baseline sales volume depending on the item name
    name_lower = item_name.lower()
    if 'biryani' in name_lower or 'qorma' in name_lower or 'aloo' in name_lower:
        base_qty = 35.0  # Main lunch items
    elif 'burger' in name_lower or 'roll' in name_lower or 'shawarma' in name_lower:
        base_qty = 45.0  # Popular fast food
    elif 'fries' in name_lower:
        base_qty = 50.0  # Very popular snack
    elif 'tea' in name_lower:
        base_qty = 60.0  # Extremely popular refreshment
    else:
        base_qty = 20.0  # Other items
        
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days-1)
    date_range = [start_date + timedelta(days=i) for i in range(days)]
    
    data = []
    for dt in date_range:
        weekday = dt.weekday()  # 0 = Monday, 6 = Sunday
        month = dt.month
        
        # Season: 0: Winter (Dec-Feb), 1: Spring (Mar-May), 2: Summer (Jun-Aug), 3: Autumn (Sep-Nov)
        if month in [12, 1, 2]:
            season = 0
        elif month in [3, 4, 5]:
            season = 1
        elif month in [6, 7, 8]:
            season = 2
        else:
            season = 3
            
        # Exams season: Finals in June and December
        exams_season = 1 if month in [6, 12] else 0
        
        # Promotions: e.g. active on Fridays and Saturdays (4, 5)
        promotions = 1 if weekday in [4, 5] and np.random.rand() > 0.3 else 0
        
        # Weather: 0: Clear, 1: Rain, 2: Hot/Sunny, 3: Cold
        if season == 0:  # Winter
            weather = np.random.choice([0, 1, 3], p=[0.6, 0.1, 0.3])
        elif season == 2:  # Summer
            weather = np.random.choice([0, 1, 2], p=[0.5, 0.1, 0.4])
        else:
            weather = np.random.choice([0, 1], p=[0.8, 0.2])
            
        # Base demand modifiers
        modifier = 1.0
        
        # Weekday modifier (canteen busy Mon-Fri, slow on weekends)
        if weekday in [5, 6]:  # Weekend
            modifier *= 0.3
        else:
            modifier *= 1.2
            
        # Category specific modifiers
        if ('biryani' in name_lower or 'lunch' in name_lower) and weekday == 4:
            modifier *= 1.5
            
        if 'tea' in name_lower or 'coffee' in name_lower:
            if weather in [1, 3]:
                modifier *= 1.5
                
        if ('burger' in name_lower or 'fries' in name_lower) and promotions == 1:
            modifier *= 1.4
            
        if exams_season == 1:
            if 'tea' in name_lower or 'fries' in name_lower:
                modifier *= 1.3
            else:
                modifier *= 0.8
                
        # Add random noise
        noise = np.random.normal(0, base_qty * 0.1)
        qty = max(0.0, base_qty * modifier + noise)
        
        data.append({
            'date': dt,
            'weekday': weekday,
            'month': month,
            'season': season,
            'promotions': promotions,
            'exams_season': exams_season,
            'weather': weather,
            'sales_quantity': round(qty, 2)
        })
        
    return pd.DataFrame(data)

def forecast_demand(item_name: str, target_features: dict, historical_sales: list = None) -> dict:
    """
    Predicts tomorrow's demand for an item using RandomForestRegressor.
    Features: weekday, month, season, promotions, exams_season, weather
    """
    try:
        # 1. Generate synthetic training dataset (90 days)
        df = generate_synthetic_data(item_name, days=90)
        
        # 2. Integrate actual history if provided by Node backend (overwrite recent dates)
        if historical_sales and len(historical_sales) > 0:
            n_actual = min(len(historical_sales), len(df))
            # Overwrite the last n_actual sales quantities in our df with the actual ones
            df.iloc[-n_actual:, df.columns.get_loc('sales_quantity')] = historical_sales[-n_actual:]
            
        # 3. Train RandomForestRegressor or use Heuristic Fallback
        features_list = ['weekday', 'month', 'season', 'promotions', 'exams_season', 'weather']
        X = df[features_list]
        y = df['sales_quantity']
        
        if SKLEARN_AVAILABLE:
            model = RandomForestRegressor(n_estimators=50, random_state=42)
            model.fit(X, y)
            target_df = pd.DataFrame([target_features])
            prediction = model.predict(target_df[features_list])[0]
            prediction = max(0.0, float(prediction))
            r2 = model.score(X, y)
            confidence = float(max(0.5, min(0.98, 0.6 + (r2 * 0.38))))
            note_str = "RandomForestRegressor forecasting completed."
        else:
            # Weighted historical average matching target weekday & conditions
            matching = df[(df['weekday'] == target_features['weekday'])]
            if len(matching) > 0:
                base_pred = matching['sales_quantity'].mean()
            else:
                base_pred = y.mean()
            
            # Apply promo/exam modifiers
            if target_features.get('promotions', 0) == 1:
                base_pred *= 1.25
            if target_features.get('exams_season', 0) == 1:
                base_pred *= 1.15
            prediction = max(0.0, float(base_pred))
            confidence = 0.75
            note_str = "Heuristic demand forecasting completed (sklearn unavailable)."

        
        # 6. Calculate trend / percentage change relative to normal weekday average
        normal_weekday_sales = df[(df['weekday'] == target_features['weekday']) & 
                                  (df['promotions'] == 0) & 
                                  (df['exams_season'] == 0)]['sales_quantity'].mean()
        if pd.isna(normal_weekday_sales) or normal_weekday_sales == 0:
            normal_weekday_sales = df['sales_quantity'].mean()
            
        percent_change = 0.0
        if normal_weekday_sales > 0:
            percent_change = ((prediction - normal_weekday_sales) / normal_weekday_sales) * 100
            
        return {
            "forecast": round(prediction, 2),
            "confidence": round(confidence, 2),
            "percent_change": round(percent_change, 1),
            "note": note_str
        }
    except Exception as e:
        log_error("ai.forecast", e, level="warn", context={"action": "fallback"})
        avg = sum(historical_sales) / max(len(historical_sales), 1) if historical_sales else 15.0
        return {
            "forecast": round(avg, 2),
            "confidence": 0.5,
            "percent_change": 0.0,
            "note": f"Fallback to simple average due to error: {str(e)}"
        }
