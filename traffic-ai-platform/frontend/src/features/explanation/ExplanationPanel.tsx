import React, { useState } from 'react';
import { explainTrafficAnomaly } from '../utils/api'; // Import API function
import { getTrafficExplanationPrompt } from '../utils/promptManager'; // Import prompt generator

const ExplanationPanel: React.FC = () => {
  // State for current conditions input
  const [currentSpeed, setCurrentSpeed] = useState<number>(50);
  const [currentVolume, setCurrentVolume] = useState<number>(500);
  const [currentWeather, setCurrentWeather] = useState<string>('Clear');
  const [incident, setIncident] = useState<boolean>(false);

  // State for external factors input
  const [event, setEvent] = useState<string>('');
  const [news, setNews] = useState<string>('');

  // State for historical context (simplified for now)
  const [historicalContext, setHistoricalContext] = useState<any>({}); // Placeholder

  // State for results and loading/error
  const [explanation, setExplanation] = useState<string | null>(null);
  const [correlatedFactors, setCorrelatedFactors] = useState<string[]>([]);
  const [recommendations, setRecommendations] = useState<string[]>([]);
  const [generatedPrompt, setGeneratedPrompt] = useState<string | null>(null); // State to display the prompt
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleExplain = async () => {
    setLoading(true);
    setError(null);
    setExplanation(null);
    setRecommendations([]);
    setCorrelatedFactors([]);
    setGeneratedPrompt(null); // Clear previous prompt

    const currentConditions = {
      speed_kmh: currentSpeed,
      volume_veh_per_hour: currentVolume,
      weather_condition: currentWeather,
      incident_reported: incident,
    };

    const externalFactors = {
      event: event,
      news: news,
    };

    // Construct the prompt using the manager
    const prompt = getTrafficExplanationPrompt(currentConditions, historicalContext, externalFactors);
    setGeneratedPrompt(prompt); // Display the generated prompt
    console.log("Generated explanation prompt:", prompt); 

    const requestBody = {
      current_conditions: currentConditions,
      external_factors: externalFactors,
      historical_context: historicalContext,
      prompt: prompt, // Send the generated prompt to the backend
    };

    try {
      const data = await explainTrafficAnomaly(requestBody);
      setExplanation(data.analysis.explanation || "No detailed explanation provided.");
      setCorrelatedFactors(data.analysis.correlated_factors || []);
      setRecommendations(data.recommendations || []);
    } catch (err) {
      setError("Failed to get LLM explanation.");
      console.error("LLM explanation error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleExplain();
  };

  return (
    <div className="explanation-panel">
      <h2>AI Explanation</h2>
      <form onSubmit={handleSubmit}>
        <div className="input-section">
          <label>
            Speed (km/h): <input type="number" value={currentSpeed} onChange={(e) => setCurrentSpeed(parseFloat(e.target.value) || 0)} />
          </label>
          <label>
            Volume (veh/hr): <input type="number" value={currentVolume} onChange={(e) => setCurrentVolume(parseInt(e.target.value) || 0)} />
          </label>
          <label>
            Weather: 
            <select value={currentWeather} onChange={(e) => setCurrentWeather(e.target.value)}>
              <option value="Clear">Clear</option>
              <option value="Rain">Rain</option>
              <option value="Fog">Fog</option>
              <option value="Snow">Snow</option>
              <option value="Overcast">Overcast</option>
            </select>
          </label>
          <label>
            Incident: <input type="checkbox" checked={incident} onChange={(e) => setIncident(e.target.checked)} />
          </label>
          <label>
            Event (Optional): <input type="text" value={event} onChange={(e) => setEvent(e.target.value)} placeholder="e.g., Concert at Arena" />
          </label>
          <label>
            News (Optional): <input type="text" value={news} onChange={(e) => setNews(e.target.value)} placeholder="e.g., Major accident reported" />
          </label>
        </div>
        <button type="submit" disabled={loading}>
          {loading ? 'Explaining...' : 'Get Explanation'}
        </button>
      </form>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      {/* Display generated prompt */}
      {generatedPrompt && (
        <div className="prompt-display">
          <h3>Generated LLM Prompt</h3>
          <pre>{generatedPrompt}</pre>
        </div>
      )}

      {(explanation || correlatedFactors.length > 0 || recommendations.length > 0) && (
        <div className="results-section">
          <h3>LLM Generated Insights</h3>
          {explanation && <p><strong>Explanation:</strong> {explanation}</p>}
          {correlatedFactors.length > 0 && (
            <div>
              <strong>Correlated Factors:</strong>
              <ul>
                {correlatedFactors.map((factor, idx) => <li key={idx}>{factor}</li>)}
              </ul>
            </div>
          )}
          {recommendations.length > 0 && (
            <div>
              <strong>Recommendations:</strong>
              <ul>
                {recommendations.map((rec, idx) => <li key={idx}>{rec}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ExplanationPanel;
