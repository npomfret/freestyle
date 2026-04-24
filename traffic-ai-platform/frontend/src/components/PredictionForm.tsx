import React, { useState } from 'react';
import { predictTraffic } from '../utils/api'; // Import API function
import { getTrafficPredictionPrompt } from '../utils/promptManager'; // Import prompt generator

// Define the structure for a single scenario input
interface ScenarioInput {
  id: number; // Unique ID for each scenario
  location: string;
  weather: string;
  event: string;
}

// Define the structure for backend prediction results (now expecting an array)
interface PredictionResult {
  message: string;
  analysis: {
    predicted_speed_kmh: number;
    predicted_volume_veh_per_hour: number;
    prediction_factors: { [key: string]: string };
    prediction_time: string;
    location: string;
    llm_prompt_used_for_sim?: string;
  };
  recommendations: string[];
}

interface MultiScenarioPredictionResponse {
  predictions: PredictionResult[]; // Backend now returns an array of predictions
}

const PredictionForm: React.FC = () => {
  // State for the target future time
  const [futureTime, setFutureTime] = useState<string>('');

  // State for managing multiple scenarios
  const [scenarios, setScenarios] = useState<ScenarioInput[]>([
    { id: Date.now(), location: 'Downtown Sector', weather: 'Clear', event: '' } // Initial scenario
  ]);
  
  // State for prediction results (now an array to hold multiple predictions)
  const [predictionResults, setPredictionResults] = useState<PredictionResult[] | null>(null);
  const [generatedPrompt, setGeneratedPrompt] = useState<string | null>(null); // To display the prompt
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddScenario = () => {
    setScenarios([
      ...scenarios,
      { id: Date.now(), location: '', weather: 'Clear', event: '' }
    ]);
  };

  const handleRemoveScenario = (id: number) => {
    setScenarios(scenarios.filter(scenario => scenario.id !== id));
  };

  const handleScenarioChange = (id: number, field: keyof ScenarioInput, value: string) => {
    setScenarios(scenarios.map(scenario => 
      scenario.id === id ? { ...scenario, [field]: value } : scenario
    ));
  };

  const handlePredict = async () => {
    setLoading(true);
    setError(null);
    setPredictionResults(null);
    setGeneratedPrompt(null); // Clear previous prompt

    if (!futureTime) {
      setError("Please select a future time for prediction.");
      setLoading(false);
      return;
    }

    // Construct a consolidated prompt for all scenarios
    const basePrompt = `Predict traffic for multiple scenarios.`;
    const scenarioDescriptions = scenarios.map(s => 
      `Location: ${s.location || 'default'}, Weather: ${s.weather}, Event: ${s.event || 'None'}`
    ).join('; ');
    const prompt = `${basePrompt} Consider the following scenarios: ${scenarioDescriptions}.`;

    console.log("Generated prediction prompt:", prompt); 
    setGeneratedPrompt(prompt); // Display the generated prompt

    const requestBody = {
      // Send all scenarios. Backend is now structured to handle this list.
      scenarios: scenarios.map(s => ({ 
        future_time: new Date(futureTime).toISOString(),
        location: s.location,
        factors: {
          weather_condition: s.weather,
          event: s.event,
        }
      })),
      prompt: prompt // Send the consolidated prompt
    };

    try {
      const data = await predictTraffic(requestBody); 
      setPredictionResults(data.predictions); 
    } catch (err) {
      setError("Failed to get traffic prediction.");
      console.error("Prediction error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handlePredict();
  };

  return (
    <div className="prediction-form">
      <h2>Predict Traffic</h2>
      <form onSubmit={handleSubmit}>
        <div className="input-section">
          <label>
            Predict for Time:
            <input
              type="datetime-local"
              value={futureTime}
              onChange={(e) => setFutureTime(e.target.value)}
              required
            />
          </label>
        </div>

        {scenarios.map((scenario, index) => (
          <div key={scenario.id} className="scenario-input">
            <h4>Scenario {scenarios.length > 1 ? `#${index + 1}` : ''}</h4>
            <label>
              Location:
              <input
                type="text"
                value={scenario.location}
                onChange={(e) => handleScenarioChange(scenario.id, 'location', e.target.value)}
                placeholder="e.g., Downtown Sector"
              />
            </label>
            <label>
              Weather:
              <select value={scenario.weather} onChange={(e) => handleScenarioChange(scenario.id, 'weather', e.target.value)}>
                <option value="Clear">Clear</option>
                <option value="Rain">Rain</option>
                <option value="Fog">Fog</option>
                <option value="Snow">Snow</option>
                <option value="Overcast">Overcast</option>
              </select>
            </label>
            <label>
              Upcoming Event (Optional):
              <input
                type="text"
                value={scenario.event}
                onChange={(e) => handleScenarioChange(scenario.id, 'event', e.target.value)}
                placeholder="e.g., Concert at Arena"
              />
            </label>
            {scenarios.length > 1 && ( 
              <button type="button" onClick={() => handleRemoveScenario(scenario.id)}>Remove</button>
            )}
          </div>
        ))}
        
        <button type="button" onClick={handleAddScenario}>Add Scenario</button>

        <button type="submit" disabled={loading || !futureTime || scenarios.length === 0}>
          {loading ? 'Predicting...' : 'Get Predictions'}
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

      {predictionResults && predictionResults.length > 0 && (
        <div className="results-section">
          <h3>Prediction Results</h3>
          {predictionResults.map((result, index) => (
            <div key={index} className="scenario-prediction">
              <h4>Scenario {scenarios.length > 1 ? `#${index + 1}` : ''}</h4>
              <p><strong>Message:</strong> {result.message}</p>
              {result.analysis && (
                <div>
                  <h5>Analysis</h5>
                  <p><strong>Predicted Speed:</strong> {result.analysis.predicted_speed_kmh} km/h</p>
                  <p><strong>Predicted Volume:</strong> {result.analysis.predicted_volume_veh_per_hour} veh/hr</p>
                  {result.analysis.prediction_factors && Object.keys(result.analysis.prediction_factors).length > 0 && (
                    <p><strong>Factors considered:</strong> {Object.entries(result.analysis.prediction_factors).map(([key, val]) => `${key}: ${val}`).join(', ')}</p>
                  )}
                  {/* Display simulated LLM prompt usage note if available */}
                  {result.analysis.llm_prompt_used_for_sim && (
                    <p><strong>LLM Simulation Note:</strong> {result.analysis.llm_prompt_used_for_sim}</p>
                  )}
                </div>
              )}
              {result.recommendations && result.recommendations.length > 0 && (
                <div>
                  <strong>Recommendations:</strong>
                  <ul>
                    {result.recommendations.map((rec, idx) => <li key={idx}>{rec}</li>)}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PredictionForm;
