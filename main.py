import os
from datetime import datetime, timedelta
from contextlib import asynccontextmanager
import httpx
from fastapi import FastAPI, HTTPException, Query, Body, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
import database

# Initialize SQLite database
database.init_db()

# ----------------------------------------------------
# Global Cache & Defaults configuration
# ----------------------------------------------------
FRANKFURTER_BASE_URL = "https://api.frankfurter.dev/v1"
CACHE_TTL_SECONDS = 300  # Cache rates for 5 minutes
RATES_CACHE = {}

# Safety default exchange rates if Frankfurter API is completely offline
HARDCODED_DEFAULTS = {
    "EUR": {
        "rates": {
            "USD": 1.0924, "GBP": 0.8582, "JPY": 170.45,
            "AUD": 1.6321, "CAD": 1.4878, "CHF": 0.9854, "CNY": 7.9125
        }
    },
    "USD": {
        "rates": {
            "EUR": 0.9154, "GBP": 0.7856, "JPY": 156.02,
            "AUD": 1.4940, "CAD": 1.3620, "CHF": 0.9020, "CNY": 7.2430
        }
    },
    "GBP": {
        "rates": {
            "EUR": 1.1652, "USD": 1.2729, "JPY": 198.54,
            "AUD": 1.9020, "CAD": 1.7340, "CHF": 1.1480, "CNY": 9.2210
        }
    },
}

# ----------------------------------------------------
# Lifespan Management (Global HTTP client pool)
# ----------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Establish a persistent shared connection pool
    async with httpx.AsyncClient(timeout=httpx.Timeout(5.0), follow_redirects=True) as client:
        app.state.http_client = client
        yield

# Initialize App with lifespan context manager
app = FastAPI(
    title="Valut Currency API",
    description="Premium Fintech Exchange Rate Backend",
    lifespan=lifespan
)

# Enable CORS for local testing/development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------------------------------------------
# Custom Exception Handlers for consistent JSON responses
# ----------------------------------------------------
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "error": exc.detail}
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = exc.errors()
    error_msgs = [f"{'.'.join(str(l) for l in err['loc'])}: {err['msg']}" for err in errors]
    return JSONResponse(
        status_code=422,
        content={"success": False, "error": f"Validation Error: {', '.join(error_msgs)}"}
    )

@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"success": False, "error": f"Internal Server Error: {str(exc)}"}
    )

# ----------------------------------------------------
# Core Rate Fetching Logic with fallback
# ----------------------------------------------------
async def fetch_rates_with_fallback(client: httpx.AsyncClient, base: str) -> dict:
    now = datetime.now()
    
    # 1. Check active cache
    if base in RATES_CACHE:
        cache_entry = RATES_CACHE[base]
        if now - cache_entry["timestamp"] < timedelta(seconds=CACHE_TTL_SECONDS):
            return {
                "base": base,
                "date": cache_entry["date"],
                "rates": cache_entry["rates"],
                "source": "cache"
            }
            
    # 2. Query Live API
    try:
        resp = await client.get(f"{FRANKFURTER_BASE_URL}/latest?base={base}")
        if resp.status_code == 200:
            data = resp.json()
            rates = data.get("rates", {})
            date_str = data.get("date", now.strftime("%Y-%m-%d"))
            
            # Cache successfully fetched rates
            RATES_CACHE[base] = {
                "timestamp": now,
                "rates": rates,
                "date": date_str
            }
            return {
                "base": base,
                "date": date_str,
                "rates": rates,
                "source": "api"
            }
        else:
            print(f"Frankfurter API returned status {resp.status_code} for base {base}")
    except Exception as e:
        print(f"Network error trying to contact Frankfurter API for base {base}: {e}")
        
    # 3. Fallback: expired cache
    if base in RATES_CACHE:
        cache_entry = RATES_CACHE[base]
        return {
            "base": base,
            "date": cache_entry["date"],
            "rates": cache_entry["rates"],
            "source": "expired_cache"
        }
        
    # 4. Fallback: hardcoded defaults
    if base in HARDCODED_DEFAULTS:
        default_data = HARDCODED_DEFAULTS[base]
        return {
            "base": base,
            "date": now.strftime("%Y-%m-%d"),
            "rates": default_data["rates"],
            "source": "hardcoded_defaults"
        }
        
    raise ValueError(f"Rates for currency '{base}' are currently unavailable.")

# ----------------------------------------------------
# Static Files & Views Routing
# ----------------------------------------------------
@app.get("/")
def get_index():
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "index.html")
    if os.path.exists(path):
        return FileResponse(path)
    raise HTTPException(status_code=404, detail="index.html not found")

@app.get("/landing")
def get_landing():
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "landing.html")
    if os.path.exists(path):
        return FileResponse(path)
    raise HTTPException(status_code=404, detail="landing.html not found")

@app.get("/style.css")
def get_css():
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "style.css")
    if os.path.exists(path):
        return FileResponse(path, media_type="text/css")
    raise HTTPException(status_code=404, detail="style.css not found")

@app.get("/app.js")
def get_js():
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "app.js")
    if os.path.exists(path):
        return FileResponse(path, media_type="application/javascript")
    raise HTTPException(status_code=404, detail="app.js not found")

# ----------------------------------------------------
# API Routes - Exchange Rates & Calculations
# ----------------------------------------------------
@app.get("/api/rates")
async def get_latest_rates(base: str = "EUR"):
    """
    Fetches latest currency rates relative to the specified base currency.
    """
    try:
        client = app.state.http_client
        rates_data = await fetch_rates_with_fallback(client, base)
        return {
            "success": True,
            "base": rates_data.get("base"),
            "date": rates_data.get("date"),
            "rates": rates_data.get("rates"),
            "source": rates_data.get("source")
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "rates": {}
        }

@app.get("/api/convert")
async def perform_conversion(
    from_currency: str = Query(..., alias="from"),
    to_currency: str = Query(..., alias="to"),
    amount: float = 100.0
):
    """
    Performs conversion calculations using real-time rates.
    """
    if from_currency == to_currency:
        return {
            "success": True,
            "from": from_currency,
            "to": to_currency,
            "amount": amount,
            "rate": 1.0,
            "result": amount
        }

    try:
        client = app.state.http_client
        rates_data = await fetch_rates_with_fallback(client, from_currency)
        rates = rates_data.get("rates", {})
        rate = rates.get(to_currency)
        
        if rate is not None:
            result = amount * rate
            return {
                "success": True,
                "from": from_currency,
                "to": to_currency,
                "amount": amount,
                "rate": rate,
                "result": result,
                "date": rates_data.get("date"),
                "source": rates_data.get("source")
            }
        raise HTTPException(status_code=400, detail=f"Target currency '{to_currency}' rate not found.")
    except HTTPException:
        raise
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"API conversion calculations error: {str(e)}")

@app.get("/api/chart")
async def get_chart_data(
    from_currency: str = Query(..., alias="from"),
    to_currency: str = Query(..., alias="to"),
    timeframe: str = "1M"
):
    """
    Retrieves historical rate details from Frankfurter to construct Chart.js trends.
    """
    end_date = datetime.now()
    if timeframe == "7D":
        start_date = end_date - timedelta(days=7)
    elif timeframe == "1M":
        start_date = end_date - timedelta(days=30)
    elif timeframe == "1Y":
        start_date = end_date - timedelta(days=365)
    else:
        start_date = end_date - timedelta(days=30)

    start_str = start_date.strftime("%Y-%m-%d")
    end_str = end_date.strftime("%Y-%m-%d")

    try:
        client = app.state.http_client
        url = f"{FRANKFURTER_BASE_URL}/{start_str}..{end_str}?base={from_currency}&symbols={to_currency}"
        resp = await client.get(url)
        if resp.status_code == 200:
            data = resp.json()
            rates_map = data.get("rates", {})
            
            # Sort dates chronologically
            sorted_dates = sorted(rates_map.keys())
            labels = []
            data_points = []

            if timeframe == "7D":
                for d in sorted_dates:
                    dt = datetime.strptime(d, "%Y-%m-%d")
                    labels.append(dt.strftime("%a"))
                    data_points.append(rates_map[d].get(to_currency))
            elif timeframe == "1M":
                # Sample every 3rd day to avoid crowding labels
                for idx, d in enumerate(sorted_dates):
                    if idx % 3 == 0 or idx == len(sorted_dates) - 1:
                        dt = datetime.strptime(d, "%Y-%m-%d")
                        labels.append(dt.strftime("%b %d"))
                        data_points.append(rates_map[d].get(to_currency))
            elif timeframe == "1Y":
                # Group by month
                month_data = {}
                for d in sorted_dates:
                    dt = datetime.strptime(d, "%Y-%m-%d")
                    month_key = dt.strftime("%b")
                    if month_key not in month_data:
                        month_data[month_key] = []
                    month_data[month_key].append(rates_map[d].get(to_currency))
                
                for m, vals in month_data.items():
                    labels.append(m)
                    data_points.append(sum(vals) / len(vals))

            return {
                "success": True,
                "labels": labels,
                "data": data_points
            }
        raise HTTPException(status_code=resp.status_code, detail="Failed to fetch historical chart data from Frankfurter API.")
    except Exception as e:
        # Safe fallback: generates mock dataset points to prevent client-side chart crashes
        mock_labels = []
        mock_data = []
        # Fallback values
        rate_val = 1.09
        length = 7 if timeframe == "7D" else (10 if timeframe == "1M" else 12)
        for i in range(length):
            mock_labels.append(f"Point {i+1}")
            mock_data.append(rate_val + (i * 0.002))
        return {
            "success": False,
            "error": str(e),
            "labels": mock_labels,
            "data": mock_data
        }

# ----------------------------------------------------
# API Routes - SQLite Transactions Logs
# ----------------------------------------------------
@app.get("/api/history")
def get_transaction_history():
    history = database.get_history()
    return {"success": True, "history": history}

@app.post("/api/history")
def add_transaction(data: dict = Body(...)):
    success = database.add_history_record(
        from_curr=data.get("from"),
        from_amt=data.get("fromAmt"),
        to_curr=data.get("to"),
        to_amt=data.get("toAmt"),
        rate=data.get("rate")
    )
    if success:
        return {"success": True}
    raise HTTPException(status_code=500, detail="Failed to save conversion transaction to SQLite database log.")

@app.delete("/api/history")
def clear_transaction_history():
    success = database.clear_history()
    if success:
        return {"success": True}
    raise HTTPException(status_code=500, detail="Failed to wipe conversion transactions log database.")
