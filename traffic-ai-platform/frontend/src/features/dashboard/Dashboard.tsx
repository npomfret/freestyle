import React, { useEffect, useState } from 'react';
import './Dashboard.css'; 
import { fetchTrafficData } from '../utils/api'; 

// Import charting library components
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// Define data structure for charts, matching backend response
interface TrafficDataPoint {
  timestamp: string; // ISO string from backend
  speed_kmh: number;
  volume_veh_per_hour: number;
  weather_condition: string;
  incident_reported: boolean;
}

const Dashboard: React.FC = () => {
  const [trafficData, setTrafficData] = useState<TrafficDataPoint[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Mock LLM insight for demonstration purposes
  const mockLLMInsight = {
    summary: "Traffic flow is currently moderate but expected to increase due to the evening commute and light rain. An incident on I-5 North is causing localized delays.",
    anomalies: ["Increased volume on I-5 North", "Sudden drop in speed near downtown"],
    recommendations: ["Consider alternate routes for I-5 Northbound.", "Allow extra travel time."]
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        const fetchedData = await fetchTrafficData(100); 
        const formattedData = fetchedData.map((item: TrafficDataPoint) => ({
          ...item,
        }));
        setTrafficData(formattedData);
      } catch (err) {
        setError("Failed to load traffic data for dashboard.");
        console.error("Dashboard data loading error:", err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  return (
    <div className="dashboard">
      <h2>Dashboard Overview</h2>
      {loading && <p>Loading dashboard data...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {!loading && !error && trafficData.length > 0 ? (
        <div>
          <h3>Traffic Metrics Over Time</h3>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart
                data={trafficData}
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="timestamp" 
                  tickFormatter={(tick) => new Date(tick).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} 
                  type="category" 
                />
                <YAxis yAxisId="left" label={{ value: 'Speed (km/h)', angle: -90, position: 'left' }} domain={[0, 'dataMax']} />
                <YAxis yAxisId="right" orientation="right" label={{ value: 'Volume (veh/hr)', angle: -90, position: 'right' }} domain={[0, 'dataMax']} />
                <Tooltip formatter={(value, name) => {
                  if (name === 'speed_kmh') return [value, 'Speed (km/h)'];
                  if (name === 'volume_veh_per_hour') return [value, 'Volume (veh/hr)'];
                  return [value, name];
                }} />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="speed_kmh" stroke="#8884d8" activeDot={{ r: 8 }} name="Speed" />
                <Line yAxisId="right" type="monotone" dataKey="volume_veh_per_hour" stroke="#82ca9d" activeDot={{ r: 8 }} name="Volume" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          
          <div className="key-metrics">
            <h4>Latest Metrics</h4>
            {trafficData.length > 0 && (
              <div>
                <p><strong>Timestamp:</strong> {new Date(trafficData[trafficData.length - 1].timestamp).toLocaleString()}</p>
                <p><strong>Speed:</strong> {trafficData[trafficData.length - 1].speed_kmh} km/h</p>
                <p><strong>Volume:</strong> {trafficData[trafficData.length - 1].volume_veh_per_hour} veh/hr</p>
                <p><strong>Weather:</strong> {trafficData[trafficData.length - 1].weather_condition}</p>
                <p><strong>Incident:</strong> {trafficData[trafficData.length - 1].incident_reported ? 'Yes' : 'No'}</p>
              </div>
            )}
          </div>

          {/* Section for LLM-driven insights summary */}
          <div className="llm-insights">
            <h4>LLM Insights Summary</h4>
            <p><strong>Summary:</strong> {mockLLMInsight.summary}</p>
            {mockLLMInsight.anomalies.length > 0 && (
              <div>
                <strong>Anomalies Detected:</strong>
                <ul>
                  {mockLLMInsight.anomalies.map((anomaly, idx) => <li key={idx}>{anomaly}</li>)}
                </ul>
              </div>
            )}
            {mockLLMInsight.recommendations.length > 0 && (
              <div>
                <strong>General Recommendations:</strong>
                <ul>
                  {mockLLMInsight.recommendations.map((rec, idx) => <li key={idx}>{rec}</li>)}
                </ul>
              </div>
            )}
          </div>
        </div>
      ) : (
        !loading && !error && <p>No dashboard data available.</p>
      )}
    </div>
  );
};

export default Dashboard;
