export const getTrafficExplanationPrompt = (currentConditions: any, historicalContext: any, externalFactors: any): string => {
  let prompt = `
Analyze the following traffic conditions and provide a concise, human-readable explanation of the traffic anomaly, detailing the contributing factors and offering actionable recommendations for drivers and city planners.

Current Conditions:
- Speed: ${currentConditions.speed_kmh} km/h
- Volume: ${currentConditions.volume_veh_per_hour} veh/hour
- Weather: ${currentConditions.weather_condition}
- Incident: ${currentConditions.incident_reported ? 'Yes' : 'No'}
`;

  if (historicalContext && Object.keys(historicalContext).length > 0) {
    prompt += `
Historical Context:
- Average Speed: ${historicalContext.avg_speed_kmh} km/h
- Typical Volume: ${historicalContext.typical_volume_veh_per_hour} veh/hour
- Usual Weather: ${historicalContext.usual_weather}
`;
  }

  if (externalFactors && Object.keys(externalFactors).length > 0) {
    prompt += "
External Factors:
";
    if (externalFactors.event) {
      prompt += `- Event: ${externalFactors.event}
`;
    }
    if (externalFactors.news) {
      prompt += `- News: ${externalFactors.news}
`;
    }
    // Add more external factors as they become available
  }

  prompt += `
Focus on correlating external factors (weather, incidents, volume, events, news) with the observed traffic speed and volume. Generate a clear explanation and practical recommendations.
`;
  return prompt;
};

export const getTrafficPredictionPrompt = (predictionParams: any): string => {
  const { future_time, location, factors } = predictionParams;
  
  let prompt = `
Predict future traffic conditions for ${location} at ${new Date(future_time).toLocaleString()}.
Consider the following factors:
- Predicted Weather: ${factors.weather_condition}
`;

  if (factors.event) {
    prompt += `- Upcoming Event: ${factors.event}
`;
  }
  // Add more factors as needed

  prompt += `
Provide a concise prediction of speed and volume, along with any relevant recommendations.
`;
  return prompt;
};
