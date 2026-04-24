import pandas as pd
import numpy as np
import random
from datetime import datetime, timedelta

def generate_traffic_data(num_records=1000):
    """Generates synthetic traffic data including speed, volume, weather, and incidents."""
    data = []
    start_time = datetime.now() - timedelta(days=7)

    for i in range(num_records):
        timestamp = start_time + timedelta(minutes=i * 0.5) # Data points every 30 seconds
        
        # Simulate variations in conditions
        avg_speed = random.uniform(20, 60) # km/h
        volume = random.uniform(100, 1000) # vehicles per hour
        weather_conditions = random.choice(["Clear", "Rain", "Fog", "Snow", "Overcast"])
        
        # Simulate incidents - increase probability during peak hours or bad weather
        incident = False
        if random.random() < 0.05: # Base incident chance
            incident = True
        if weather_conditions in ["Rain", "Fog", "Snow"]:
            if random.random() < 0.1:
                incident = True
        # Peak hours might have more incidents, but not strictly enforced here for simplicity

        # Adjust speed based on volume, weather, and incidents
        if incident:
            avg_speed *= random.uniform(0.4, 0.7)
            volume *= random.uniform(0.8, 1.1)
        elif weather_conditions == "Rain":
            avg_speed *= random.uniform(0.8, 0.95)
        elif weather_conditions == "Fog":
            avg_speed *= random.uniform(0.7, 0.9)
        elif weather_conditions == "Snow":
            avg_speed *= random.uniform(0.5, 0.8)

        # Add some noise
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
    # Simulate correlation: higher volume/incidents/bad weather leads to lower speed
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

if __name__ == "__main__":
    traffic_df = generate_traffic_data(num_records=2000)
    print(traffic_df.head())
    print(f"Generated {len(traffic_df)} records.")
    # Example: Save to CSV for inspection or later use
    # traffic_df.to_csv("synthetic_traffic_data.csv", index=False)
