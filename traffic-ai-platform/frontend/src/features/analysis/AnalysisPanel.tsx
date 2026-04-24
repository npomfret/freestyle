import React, { useState } from 'react';
import { analyzeTraffic, explainTrafficAnomaly } from '../utils/api'; // Import API functions

interface AnalysisPanelProps {
  // Props to potentially pass down current selected data or filters
}

const AnalysisPanel: React.FC<AnalysisPanelProps> = () => {
  const [currentSpeed, setCurrentSpeed] = useState<number>(50);
  const [currentVolume, setCurrentVolume] = useState<number>(500);
  const [currentWeather, setCurrentWeather] = useState<string>('Clear');
  const [incident, setIncident] = useState<boolean>(false);

  const [analysisResults, setAnalysisResults] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    setAnalysisResults(null);

    const params = {
      speed_kmh: currentSpeed,
      volume_veh_per_hour: currentVolume,
      weather_condition: currentWeather,
      incident_reported: incident,
    };

    try {
      const data = await analyzeTraffic(params);
      setAnalysisResults(data);
    } catch (err) {
      setError("Failed to analyze traffic data.");
      console.error("Analysis error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="analysis-panel">
      <h2>Traffic Analysis</h2>
      <div className="input-section">
        <label>Speed (km/h): <input type="number" value={currentSpeed} onChange={(e) => setCurrentSpeed(parseFloat(e.target.value) || 0)} /></label>
        <label>Volume (veh/hr): <input type="number" value={currentVolume} onChange={(e) => setCurrentVolume(parseInt(e.target.value) || 0)} /></label>
        <label>Weather: 
          <select value={currentWeather} onChange={(e) => setCurrentWeather(e.target.value)}>
            <option value="Clear">Clear</option>
            <option value="Rain">Rain</option>
            <option value="Fog">Fog</option>
            <option value="Snow">Snow</option>
            <option value="Overcast">Overcast</option>
          </select>
        </label>
        <label>Incident: 
          <input type="checkbox" checked={incident} onChange={(e) => setIncident(e.target.checked)} />
        </label>
        <button onClick={handleAnalyze} disabled={loading}>
          {loading ? 'Analyzing...' : 'Analyze'}
        </button>
      </div>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      {analysisResults && (
        <div className="results-section">
          <h3>Analysis Results</h3>
          <p><strong>Message:</strong> {analysisResults.message}</p>
          <p><strong>Congestion Level:</strong> {analysisResults.analysis.congestion_level}</p>
          <p><strong>Influencing Factors:</strong> {analysisResults.analysis.factors_influencing_congestion.join(', ')}</p>
          {analysisResults.recommendations && analysisResults.recommendations.length > 0 && (
            <div>
              <strong>Recommendations:</strong>
              <ul>
                {analysisResults.recommendations.map((rec: string, idx: number) => <li key={idx}>{rec}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AnalysisPanel;
