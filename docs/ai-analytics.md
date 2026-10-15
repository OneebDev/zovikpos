# AI and analytics functionality

## Demand forecasts

The Python FastAPI app exposes `POST /predict`. It accepts an item name and context fields (weekday, month, season, promotions, exam season, weather), plus optional historical sales. `ai-service/model.py` generates a synthetic 90-day series influenced by item-name heuristics and contextual features; provided history can replace the latest generated values. If scikit-learn is available, it fits a RandomForest for the request; otherwise it uses a weekday-average heuristic. Errors fall back to a simple average. This is a hybrid/synthetic estimator, not a pure historical-sales model.

The backend also exposes inventory forecast/AI insight endpoints via `/api/inventory/:id/forecast`, `/api/inventory/ai-insights`, and `/api/inventory/recalculate-forecasts`. The Node-side services determine how sales history and any LLM provider are used. Groq integrations/alias matching/OCR are implemented under `backend/src/services/`.

## ETA prediction

The Python app exposes `POST /predict-eta`. Its startup training data is generated randomly (200 rows), and the model estimates time from base ETA, queue length, hour/day, peak flag, kitchen load, and historical delay. When scikit-learn/model prediction is unavailable, it uses a simple formula. The frontend calls the Node route `/api/eta`; inspect the Node ETA controller/service configuration to identify whether a given deployment delegates to Python.

## AI-assisted recipes and invoice capture

- `/api/inventory/recipes/ai-suggest` suggests recipe ingredients from the inventory/menu context.
- `/api/inventory/receivings/ocr-preview` extracts a draft representation from invoice images/PDFs through backend OCR/AI services.
- `/api/inventory/receivings/import/preview` previews spreadsheet/CSV rows and matches them to stock catalog items.
- Alias services and learned-alias endpoints support future/confirmed item matching.

These flows assist data entry. Review AI/OCR suggestions before saving or confirming operational records.

## Limits and confidence

Forecast confidence and notes are returned by the Python service, but the source training series is partly synthetic. Treat those values as model outputs, not a guarantee of real-world accuracy. Feature claims in the root README (such as guaranteed uptime or sub-millisecond navigation) are not validated by this code documentation.
