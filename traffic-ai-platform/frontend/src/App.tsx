import React, { useEffect, useState } from 'react';
import './App.css';
// Updated imports to reflect new component locations
import Dashboard from './features/dashboard/Dashboard';
import TrafficDataDisplay from './features/traffic_data/TrafficDataDisplay';
import AnalysisPanel from './features/analysis/AnalysisPanel';
import ExplanationPanel from './features/explanation/ExplanationPanel';
import PredictionForm from './features/prediction/PredictionForm';
import ReportGenerator from './features/reports/ReportGenerator';

// Define the shape of a single traffic record for state management
interface TrafficRecord {
  timestamp: string;
  speed_kmh: number;
  volume_veh_per_hour: number;
  weather_condition: string;
  incident_reported: boolean;
}

function App() {
  const [trafficData, setTrafficData] = useState<TrafficRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await fetchTrafficData(20); // Fetch last 20 records for display
        setTrafficData(data);
      } catch (err) {
        setError("Failed to load traffic data.");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []); // Empty dependency array means this runs once on mount

  return (
    <div className="App">
      <header className="App-header">
        <h1>Urban Context Engine</h1>
      </header>
      <main>
        <Dashboard />
        
        {loading && <p>Loading traffic data...</p>}
        {error && <p style={{ color: 'red' }}>{error}</p>}
        {!loading && !error && (
          <TrafficDataDisplay data={trafficData} />
        )}
        
        <AnalysisPanel />
        <ExplanationPanel />
        <PredictionForm />
        
        <ReportGenerator /> 
      </main>
    </div>
  );
}

export default App;
