from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
import pandas as pd
import random
from datetime import datetime, timedelta
import os
import json
import httpx
import google.generativeai as genai # For Gemini
from openai import AsyncOpenAI # For OpenAI

# --- Import Simulator Logic ---
try:
    from simulator import generate_traffic_data
except ImportError:
    print("simulator.py not found, inlining simulator logic.")
    def generate_traffic_data(num_records=1000):
        """Generates synthetic traffic data including speed, volume, weather, and incidents."""
        data = []
        start_time = datetime.now() - timedelta(days=7)

        for i in range(num_records):
            timestamp = start_time + timedelta(minutes=i * 0.5) # Data points every 30 seconds
            
            avg_speed = random.uniform(20, 60) # km/h
            volume = random.uniform(100, 1000) # vehicles per hour
            weather_conditions = random.choice(["Clear", "Rain", "Fog", "Snow", "Overcast"])
            
            incident = False
            if random.random() < 0.05:
                incident = True
            if weather_conditions in ["Rain", "Fog", "Snow"]:
                if random.random() < 0.1:
                    incident = True

            if incident:
                avg_speed *= random.uniform(0.4, 0.7)
                volume *= random.uniform(0.8, 1.1)
            elif weather_conditions == "Rain":
                avg_speed *= random.uniform(0.8, 0.95)
            elif weather_conditions == "Fog":
                avg_speed *= random.uniform(0.7, 0.9)
            elif weather_conditions == "Snow":
                avg_speed *= random.uniform(0.5, 0.8)

            avg_speed += random.uniform(-5, 5)
            volume += random.uniform(-50, 50)

            data.append({
                "timestamp": timestamp,
                "speed_kmh": max(0, round(avg_speed)),
                "volume_veh_per_hour": max(0, round(volume)),
                "weather_condition": weather_conditions,
                "incident_reported": incident
            })

        df = pd.DataFrame(data)
        df['speed_kmh'] = df.apply(lambda row: 
            max(0, row['speed_kmh'] - 
                (row['volume_veh_per_hour'] * 0.01) - 
                (5 if row['incident_reported'] else 0) - 
                (10 if row['weather_condition'] in ['Fog', 'Snow'] else 0) -
                (5 if row['weather_condition'] == 'Rain' else 0)
               ), axis=1
        )
        df['speed_kmh'] = df['speed_kmh'].round(2)
        return df
# --- End of Simulator Logic ---

app = FastAPI(
    title="Urban Context Engine API",
    description="API for traffic analysis, explanation, and prediction, leveraging LLMs for contextual insights.",
    version="0.1.0",
)

TRAFFIC_DATA_FILE = "synthetic_traffic_data.csv"
traffic_df = None
DEFAULT_NUM_RECORDS = 2000

def load_or_generate_data():
    """Loads traffic data from CSV or generates it if the file doesn't exist."""
    global traffic_df
    if traffic_df is None:
        if os.path.exists(TRAFFIC_DATA_FILE):
            try:
                traffic_df = pd.read_csv(TRAFFIC_DATA_FILE)
                traffic_df['timestamp'] = pd.to_datetime(traffic_df['timestamp'])
                print(f"Loaded {len(traffic_df)} records from {TRAFFIC_DATA_FILE}")
            except Exception as e:
                print(f"Error loading {TRAFFIC_DATA_FILE}: {e}. Generating new data.")
                traffic_df = generate_traffic_data(num_records=DEFAULT_NUM_RECORDS)
                traffic_df.to_csv(TRAFFIC_DATA_FILE, index=False)
                print(f"Generated and saved {len(traffic_df)} records.")
        else:
            traffic_df = generate_traffic_data(num_records=DEFAULT_NUM_RECORDS)
            traffic_df.to_csv(TRAFFIC_DATA_FILE, index=False)
            print(f"Generated and saved {len(traffic_df)} records.")
    return traffic_df

# --- Pydantic Models ---
class TrafficRecord(BaseModel):
    timestamp: datetime
    speed_kmh: float
    volume_veh_per_hour: int
    weather_condition: str
    incident_reported: bool

class TrafficAnalysisResponse(BaseModel):
    message: str
    analysis: dict = {}
    recommendations: list = []

class LLMExplanationRequest(BaseModel):
    current_conditions: dict = Field(..., description="Current traffic parameters like speed, volume, weather, and incident status.")
    historical_context: dict = Field({}, description="Optional historical data or typical conditions for comparison.")
    external_factors: dict = Field({}, description="Other relevant factors like news events, public transit status, or social media sentiment.")
    prompt: str = Field(..., description="The LLM prompt to use for generating the explanation.")

class ScenarioPredictionInput(BaseModel):
    """Represents a single scenario for prediction."""
    future_time: datetime
    location: str = "default_area"
    factors: dict = Field({}, description="Factors to consider for prediction (e.g., upcoming event, weather forecast).")

class PredictionRequest(BaseModel):
    scenarios: list[ScenarioPredictionInput] # Accepts a list of scenarios
    prompt: str = Field(..., description="The LLM prompt to use for generating the prediction(s).")

class ReportRequest(BaseModel):
A
    start_date: datetime
    end_date: datetime
    region: str = "default_region"
    report_type: str = "summary" # e.g., 'summary', 'anomaly_report', 'detailed'
    prompt: str = Field(..., description="The LLM prompt to use for generating the report.")

class ReportResponse(BaseModel):
    message: str
    report: str # The generated report content

# --- LLM Configuration and Strategy ---
MOCK_LLM_PROVIDER = "mock_service" 
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "YOUR_GEMINI_API_KEY")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "YOUR_OPENAI_API_KEY")
LOCAL_LLM_URL = os.environ.get("LOCAL_LLM_URL", "http://localhost:12334")

LLM_PROVIDER_CHOICE = MOCK_LLM_PROVIDER # Currently uses mock service

# Initialize LLM clients (placeholders for real SDK initialization)
gemini_client = None
openai_client = None
local_llm_client = None

if GEMINI_API_KEY != "YOUR_GEMINI_API_KEY":
    try:
        # Initialize Gemini client if API key is set
        genai.configure(api_key=GEMINI_API_KEY)
        gemini_client = genai.GenerativeModel(model_name="gemini-1.5-flash-latest")
        print("Gemini LLM client initialized.")
    except Exception as e:
        print(f"Failed to initialize Gemini client: {e}")

if OPENAI_API_KEY != "YOUR_OPENAI_API_KEY":
    try:
        # Initialize OpenAI client if API key is set
        openai_client = AsyncOpenAI(api_key=OPENAI_API_KEY)
        print("OpenAI LLM client initialized.")
    except Exception as e:
        print(f"Failed to initialize OpenAI client: {e}")

if LOCAL_LLM_URL != "http://localhost:12334":
    try:
        # Initialize httpx client for local LLMs
        local_llm_client = httpx.AsyncClient(base_url=LOCAL_LLM_URL)
        print(f"Local LLM client initialized for {LOCAL_LLM_URL}.")
    except Exception as e:
        print(f"Failed to initialize local LLM client: {e}")

async def get_llm_response(prompt: str, model_name: str = "default", provider: str = LLM_PROVIDER_CHOICE) -> str:
    """
    Generic function to call LLM APIs. Currently uses mock service for all providers
    but includes placeholders for real API calls.
    """
    if provider == "mock_service":
        # Fallback to mock LLM service directly for now
        # The mock service can simulate different behaviors based on prompt content
        return await llm_service.generate_response(prompt) # Assuming mock service has this method

    # --- Real LLM Integration Logic ---
    # This section outlines how to call actual LLM APIs.
    # It's commented out to ensure the mock service is used by default.

    # if provider == "gemini" and gemini_client:
    #     try:
    #         response = await gemini_client.generate_content_async(prompt)
    #         return response.text
    #     except Exception as e:
    #         print(f"Gemini API error: {e}")
    #         return json.dumps({"error": "Gemini API call failed"})

    # elif provider == "openai" and openai_client:
    #     try:
    #         response = await openai_client.chat.completions.create(
    #             model=model_name if model_name != "default" else "gpt-4o-mini", # Use specified or default model
    #             messages=[{"role": "user", "content": prompt}]
    #         )
    #         return response.choices[0].message.content
    #     except Exception as e:
    #         print(f"OpenAI API error: {e}")
    #         return json.dumps({"error": "OpenAI API call failed"})

    # elif provider == "local" and local_llm_client:
    #     try:
    #         # Example for local LLM via OpenAI-compatible endpoint (Ollama, LM Studio, vLLM etc.)
    #         response = await local_llm_client.post("/v1/chat/completions", json={
    #             "model": model_name if model_name != "default" else "llama3", # Use specified or default model
    #             "messages": [{"role": "user", "content": prompt}]
    #         })
    #         response.raise_for_status() # Raise exception for bad status codes
    #         return response.json()['choices'][0]['message']['content']
    #     except Exception as e:
    #         print(f"Local LLM API error: {e}")
    #         return json.dumps({"error": "Local LLM API call failed"})
    
    # Default fallback if provider is not recognized or client is not initialized
    print(f"LLM Provider '{provider}' not configured or client not initialized. Using mock service.")
    return await llm_service.generate_response(prompt) # Fallback to mock

async def get_llm_explanation(request: LLMExplanationRequest) -> str:
    """
    Orchestrates LLM calls for traffic explanation.
    """
    # Construct a detailed prompt based on request data
    prompt_text = f"""
    Analyze the following traffic conditions and provide a concise, human-readable explanation of the traffic anomaly, detailing the contributing factors and offering actionable recommendations for drivers and city planners.

    Current Conditions:
    - Speed: {request.current_conditions.get('speed_kmh')} km/h
    - Volume: {request.current_conditions.get('volume_veh_per_hour')} veh/hour
    - Weather: {request.current_conditions.get('weather_condition')}
    - Incident: {request.current_conditions.get('incident_reported')}
    
    External Factors: {request.external_factors}
    Historical Context: {request.historical_context}

    Focus on correlating external factors (weather, incidents, volume, events, news) with the observed traffic speed and volume. Generate a clear explanation and practical recommendations.
    """
    # You could use request.prompt directly if it's already well-formed, or construct it here.
    # For mock service, we pass the whole request object for flexibility.
    return await llm_service.explain_traffic_anomaly(request.current_conditions, request.historical_context, request.external_factors, request.prompt)


async def get_llm_prediction(request: PredictionRequest) -> str:
    """
    Orchestrates LLM calls for traffic prediction.
    Handles multiple scenarios.
    """
    if LLM_PROVIDER_CHOICE == "mock_service":
        all_predictions = []
        for scenario in request.scenarios:
            future_time = scenario.future_time
            location = scenario.location
            factors = scenario.factors
            
            base_speed = 50
            base_volume = 500
            
            # Adjust based on time of day and weekday
            if future_time.hour >= 16 and future_time.weekday() < 5: # Afternoon peak hour on weekdays
                base_speed *= 0.7
                base_volume *= 1.5
            
            # Adjust based on scenario factors
            if factors.get("weather_condition") == "Rain":
                base_speed *= 0.85
            if factors.get("event"):
                base_speed *= 0.7
                base_volume *= 1.3

            predicted_speed = max(0, round(base_speed + random.uniform(-10, 10), 2))
            predicted_volume = max(0, round(base_volume + random.uniform(-100, 100)))

            # Simulate response influenced by prompt content and scenario factors
            prompt_analysis = f"LLM simulated analysis for scenario: Location='{location}', Weather='{factors.get('weather_condition')}', Event='{factors.get('event')}'. "
            if "event" in request.prompt.lower() and factors.get("event"):
                prompt_analysis += f" Specifically considering the '{factors.get('event')}' event. "
            if "weather" in request.prompt.lower() and factors.get("weather_condition") != "Clear":
                prompt_analysis += f" Detailed weather impact considered for {factors.get('weather_condition')}."
            if "predictive" in request.prompt.lower():
                 prompt_analysis += " The response is tailored for a prediction request."
            
            all_predictions.append({
                "message": "LLM-simulated traffic prediction for scenario.",
                "analysis": {
                    "predicted_speed_kmh": predicted_speed,
                    "predicted_volume_veh_per_hour": predicted_volume,
                    "prediction_factors": factors,
                    "prediction_time": future_time.isoformat(),
                    "location": location,
                    "llm_prompt_used_for_sim": prompt_analysis
                },
                "recommendations": ["Simulated prediction: Adjust travel times."]
            })
        return json.dumps({"predictions": all_predictions})

    # Placeholder for real LLM call for prediction with multiple scenarios
    return json.dumps({
        "message": "LLM prediction placeholder.",
        "predictions": [{"analysis": {"predicted_speed_kmh": 0, "predicted_volume_veh_per_hour": 0}, "recommendations": ["LLM prediction not yet implemented."]}]
    })

async def generate_llm_report(report_request: ReportRequest) -> str:
    """
    Generates a traffic report using LLM based on specified criteria.
    Currently uses mock logic.
    """
    if LLM_PROVIDER_CHOICE == "mock_service":
        df = load_or_generate_data()
        if df is None:
            return json.dumps({"message": "Error: Traffic data not available for report generation.", "report": ""})
        
        try:
            start_dt = pd.to_datetime(report_request.start_date)
            end_dt = pd.to_datetime(report_request.end_date)
        except Exception as e:
            return json.dumps({"message": f"Error parsing dates: {e}", "report": ""})
        
        filtered_df = df[(df['timestamp'] >= start_dt) & (df['timestamp'] <= end_dt)]
        
        summary_parts = []
        if filtered_df.empty:
            summary_parts.append("No traffic data found for the specified period and region.")
        else:
            avg_speed = filtered_df['speed_kmh'].mean()
            avg_volume = filtered_df['volume_veh_per_hour'].mean()
            incident_count = filtered_df['incident_reported'].sum()
            weather_counts = filtered_df['weather_condition'].value_counts().to_dict()

            summary_parts.append(f"Report for {report_request.region} from {start_dt.strftime('%Y-%m-%d')} to {end_dt.strftime('%Y-%m-%d')} ({report_request.report_type.capitalize()} Report).")
            summary_parts.append(f"Average Speed: {avg_speed:.2f} km/h")
            summary_parts.append(f"Average Volume: {avg_volume:.2f} veh/hour")
            summary_parts.append(f"Total Incidents: {incident_count}")
            summary_parts.append(f"Weather Conditions: {json.dumps(weather_counts)}")

            if report_request.report_type == "anomaly_report":
                anomalies = []
                if avg_speed < 30:
                    anomalies.append("Persistent high congestion detected (low average speed).")
                if incident_count > 5: # Arbitrary threshold
                    anomalies.append(f"High number of incidents ({incident_count}) during the period.")
                if "Rain" in weather_counts or "Fog" in weather_counts or "Snow" in weather_counts:
                    anomalies.append("Adverse weather conditions were prevalent.")
                
                if anomalies:
                    summary_parts.append("Detected Anomalies: " + "; ".join(anomalies))
            
        final_report_content = " ".join(summary_parts)
        
        # Simulate LLM prompt influence on report generation
        report_message = f"Report generated for {report_request.region}."
        if report_request.prompt:
            if "anomaly" in report_request.prompt.lower():
                 final_report_content += " (LLM report generation focused on anomalies as per prompt)."
            if "detailed" in report_request.report_type.lower():
                final_report_content += " (Detailed metrics included as requested by prompt)."
        else:
            final_report_content += " (General report generation)."
        
        return json.dumps({
            "message": report_message,
            "report": final_report_content
        })
    
    return json.dumps({
        "message": "Report generation placeholder.",
        "report": "LLM report generation not yet implemented."
    })

# --- Enhanced Mock LLM Service ---
class MockLLMService:
    async def explain_traffic_anomaly(self, current_conditions: dict, historical_context: dict, external_factors: dict, prompt: str = None) -> str:
        """
        Mock LLM explanation that uses input parameters and prompt hints to generate a dynamic response.
        Simulates tailoring response based on prompt content.
        """
        explanation_parts = []
        recommendations = []

        speed = current_conditions.get("speed_kmh", 50)
        volume = current_conditions.get("volume_veh_per_hour", 500)
        weather = current_conditions.get("weather_condition", "Clear")
        incident = current_conditions.get("incident_reported", False)

        explanation_parts.append(f"Analysis based on current conditions: Speed is {speed} km/h with a volume of {volume} vehicles/hour.")

        factors_found = []
        if weather != "Clear":
            factors_found.append(f"adverse weather conditions ({weather})")
            recommendations.append(f"Drivers should exercise caution due to '{weather}'.")
        
        if incident:
            factors_found.append("a reported traffic incident")
            recommendations.append("Expect significant delays and consider rerouting immediately.")
        
        if volume > 800:
            factors_found.append("high vehicle volume")
            recommendations.append("This may indicate peak hour demand or an unusual surge.")
        elif volume > 600:
            factors_found.append("elevated vehicle volume")
            
        if external_factors.get("event"):
            event_name = external_factors.get("event")
            factors_found.append(f"an upcoming event ('{event_name}')")
            recommendations.append(f"Traffic may remain heavy around '{event_name}' until its conclusion.")
        
        if external_factors.get("news"):
            news_item = external_factors.get("news")
            factors_found.append(f"related news ('{news_item}')")

        if factors_found:
            explanation_parts.append(f"Congestion is likely influenced by {', '.join(factors_found)}.")
        else:
            explanation_parts.append("Traffic conditions appear normal.")
            
        if speed < 30:
            explanation_parts.append("Observed low speeds indicate significant congestion.")

        final_explanation = " ".join(explanation_parts)
        
        # Simulate prompt influence on output more explicitly
        if prompt:
            if "correlating external factors" in prompt.lower():
                 final_explanation += " (LLM response prioritized correlation of external factors as per prompt)."
            if "incident" in prompt.lower() and incident:
                 final_explanation += " (LLM response highlighted incident impact due to prompt focus)."
            if "predictive" in prompt.lower():
                 final_explanation += " (LLM response considered predictive context from prompt)."
        else:
            final_explanation += " (No specific prompt provided, general analysis)."
        
        return json.dumps({
            "explanation": final_explanation,
            "correlated_factors": factors_found,
            "recommendations": recommendations
        })

# Instantiate the mock LLM service
llm_service = MockLLMService()

# --- FastAPI Routes ---
@app.on_event("startup")
async def startup_event():
    """Load or generate traffic data upon startup."""
    load_or_generate_data()
    print("Urban Context Engine API started. Traffic data loaded/generated.")

@app.get("/traffic/data", response_model=list[TrafficRecord])
async def get_traffic_data(limit: int = 100):
    """Returns the latest traffic data records."""
    df = load_or_generate_data()
    if df is None:
        raise HTTPException(status_code=500, detail="Traffic data not available")
    
    records_dict = df.tail(limit).to_dict('records')
    for record in records_dict:
        record['timestamp'] = record['timestamp'].isoformat()
    
    return records_dict

@app.post("/traffic/analyze", response_model=TrafficAnalysisResponse)
async def analyze_traffic_conditions(analysis_params: dict):
    """
    Analyzes current traffic conditions based on provided parameters and returns insights.
    This endpoint simulates a basic analysis and recommendation engine.
    """
    df = load_or_generate_data()
    if df is None:
        raise HTTPException(status_code=500, detail="Traffic data not available for analysis")

    current_data = {}
    if analysis_params:
        current_data = analysis_params
    else:
        latest_record = df.iloc[-1]
        current_data = latest_record.to_dict()
        current_data['timestamp'] = current_data['timestamp'].isoformat()

    current_speed = current_data.get("speed_kmh", 50)
    current_volume = current_data.get("volume_veh_per_hour", 500)
    current_weather = current_data.get("weather_condition", "Clear")
    incident = current_data.get("incident_reported", False)

    message = "Analysis of current traffic conditions."
    analysis = {
        "congestion_level": "Moderate",
        "factors_influencing_congestion": []
    }
    recommendations = []

    if current_speed < 30:
        analysis["congestion_level"] = "High"
        analysis["factors_influencing_congestion"].append("Low speed detected")
        recommendations.append("Consider alternative routes or public transport.")
    elif current_speed < 45:
        analysis["congestion_level"] = "Moderate"
        analysis["factors_influencing_congestion"].append("Reduced speed detected")

    if current_volume > 800:
        analysis["congestion_level"] = "High" if analysis["congestion_level"] != "High" else "Very High"
        analysis["factors_influencing_congestion"].append("High volume")
        recommendations.append("Expect significant delays.")
    elif current_volume > 600:
        analysis["congestion_level"] = "Moderate" if analysis["congestion_level"] == "Moderate" else "Moderate to High"
        analysis["factors_influencing_congestion"].append("Elevated volume")

    if current_weather != "Clear":
        analysis["factors_influencing_congestion"].append(f"Weather: {current_weather}")
        recommendations.append(f"Drive with caution due to {current_weather}.")
    
    if incident:
        analysis["congestion_level"] = "Critical" if analysis["congestion_level"] != "Critical" else "Severe"
        analysis["factors_influencing_congestion"].append("Reported incident")
        recommendations.append("Major delays expected due to incident. Seek immediate alternative routes.")
        message = "Critical traffic conditions detected."

    if not analysis["factors_influencing_congestion"]:
        analysis["congestion_level"] = "Low"
        message = "Traffic conditions appear normal."

    return TrafficAnalysisResponse(message=message, analysis=analysis, recommendations=recommendations)

@app.post("/traffic/explain", response_model=TrafficAnalysisResponse)
async def explain_traffic_anomaly(explanation_request: LLMExplanationRequest):
    """
    Uses LLM service to explain traffic anomalies by correlating current conditions, 
    historical context, and external factors. Receives a prompt.
    """
    try:
        llm_output_str = await get_llm_explanation(explanation_request)
        llm_output = json.loads(llm_output_str)
        
        return TrafficAnalysisResponse(
            message="LLM-powered explanation of traffic conditions.",
            analysis={
                "explanation": llm_output.get("explanation", "Could not generate detailed explanation."),
                "correlated_factors": llm_output.get("correlated_factors", [])
            },
            recommendations=llm_output.get("recommendations", [])
        )
    except json.JSONDecodeError:
        print("Error: LLM output was not valid JSON.")
        raise HTTPException(status_code=500, detail="LLM returned invalid JSON response.")
    except Exception as e:
        print(f"Error during LLM explanation: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate LLM explanation.")

@app.post("/traffic/predict", response_model=TrafficAnalysisResponse)
async def predict_traffic(prediction_request: PredictionRequest):
    """
    Endpoint for traffic prediction. Uses LLM service for prediction with prompt.
    Handles multiple scenarios by processing them and returning consolidated results.
    """
    try:
        llm_prediction_str = await get_llm_prediction(prediction_request)
        llm_prediction_output = json.loads(llm_prediction_str)

        predictions_data = llm_prediction_output.get("predictions", [])
        
        consolidated_message = f"Prediction generated for {len(predictions_data)} scenario(s)."
        consolidated_analysis = {}
        consolidated_recommendations = []

        if predictions_data and len(predictions_data) > 0:
            # For simplicity, we'll use the first prediction's analysis and recommendations.
            # A more robust approach would aggregate or present all scenario results.
            first_prediction = predictions_data[0]
            consolidated_message = first_prediction.get("message", consolidated_message)
            consolidated_analysis = first_prediction.get("analysis", {})
            consolidated_recommendations = first_prediction.get("recommendations", [])
            
        return TrafficAnalysisResponse(
            message=consolidated_message,
            analysis=consolidated_analysis,
            recommendations=consolidated_recommendations
        )
    except json.JSONDecodeError:
        print("Error: LLM prediction output was not valid JSON.")
        raise HTTPException(status_code=500, detail="LLM prediction returned invalid JSON response.")
    except Exception as e:
        print(f"Error during traffic prediction: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate traffic prediction.")

@app.post("/traffic/report", response_model=TrafficAnalysisResponse)
async def generate_traffic_report(report_request: ReportRequest):
    """
    Generates a traffic report using LLM based on specified criteria.
    """
    try:
        llm_report_str = await get_llm_report(report_request) 
        llm_report_output = json.loads(llm_report_str)

        return TrafficAnalysisResponse(
            message=llm_report_output.get("message", "Traffic report generated."),
            analysis={
                "report_content": llm_report_output.get("report", "No report content available.")
            },
            recommendations=[] 
        )
    except json.JSONDecodeError:
        print("Error: LLM report output was not valid JSON.")
        raise HTTPException(status_code=500, detail="LLM returned invalid JSON response for report.")
    except Exception as e:
        print(f"Error during report generation: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate traffic report.")

# --- Mock LLM Report Generation ---
async def get_llm_report(report_request: ReportRequest) -> str:
    """
    Generates a traffic report using LLM based on specified criteria.
    Currently uses mock logic.
    """
    if LLM_PROVIDER_CHOICE == "mock_service":
        df = load_or_generate_data()
        if df is None:
            return json.dumps({"message": "Error: Traffic data not available for report generation.", "report": ""})
        
        try:
            start_dt = pd.to_datetime(report_request.start_date)
            end_dt = pd.to_datetime(report_request.end_date)
        except Exception as e:
            return json.dumps({"message": f"Error parsing dates: {e}", "report": ""})
        
        filtered_df = df[(df['timestamp'] >= start_dt) & (df['timestamp'] <= end_dt)]
        
        summary_parts = []
        if filtered_df.empty:
            summary_parts.append("No traffic data found for the specified period and region.")
        else:
            avg_speed = filtered_df['speed_kmh'].mean()
            avg_volume = filtered_df['volume_veh_per_hour'].mean()
            incident_count = filtered_df['incident_reported'].sum()
            weather_counts = filtered_df['weather_condition'].value_counts().to_dict()

            summary_parts.append(f"Report for {report_request.region} from {start_dt.strftime('%Y-%m-%d')} to {end_dt.strftime('%Y-%m-%d')} ({report_request.report_type.capitalize()} Report).")
            summary_parts.append(f"Average Speed: {avg_speed:.2f} km/h")
            summary_parts.append(f"Average Volume: {avg_volume:.2f} veh/hour")
            summary_parts.append(f"Total Incidents: {incident_count}")
            summary_parts.append(f"Weather Conditions: {json.dumps(weather_counts)}")

            if report_request.report_type == "anomaly_report":
                anomalies = []
                if avg_speed < 30:
                    anomalies.append("Persistent high congestion detected (low average speed).")
                if incident_count > 5: # Arbitrary threshold
                    anomalies.append(f"High number of incidents ({incident_count}) during the period.")
                if "Rain" in weather_counts or "Fog" in weather_counts or "Snow" in weather_counts:
                    anomalies.append("Adverse weather conditions were prevalent.")
                
                if anomalies:
                    summary_parts.append("Detected Anomalies: " + "; ".join(anomalies))
            
        final_report_content = " ".join(summary_parts)
        
        # Simulate LLM prompt influence on report generation
        report_message = f"Report generated for {report_request.region}."
        if report_request.prompt:
            if "anomaly" in report_request.prompt.lower():
                 final_report_content += " (LLM report generation focused on anomalies as per prompt)."
            if "detailed" in report_request.report_type.lower():
                final_report_content += " (Detailed metrics included as requested by prompt)."
        else:
            final_report_content += " (General report generation)."
        
        return json.dumps({
            "message": report_message,
            "report": final_report_content
        })
    
    return json.dumps({
        "message": "Report generation placeholder.",
        "report": "LLM report generation not yet implemented."
    })

if __name__ == "__main__":
    import uvicorn
    print("Starting Uvicorn server...")
    uvicorn.run(app, host="127.0.0.1", port=8000)
