// llmConfig.ts
// Configuration for LLM providers and API strategies

export const LLM_PROVIDER_STRATEGIES = {
  // Strategy for using Gemini API
  gemini: {
    providerName: "Gemini",
    apiKeyEnvVar: "GEMINI_API_KEY", // Environment variable for API key
    modelCascade: ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-3-flash-preview", "gemini-2.5-pro"], // Cost-effective models first
    freeTierUsage: "Generous free tier available, monitor usage.",
    costPerRequest: "Variable, depends on model and token count. Aim to stay within budget.",
    promptEngineeringFocus: "Optimize for cost and response time.",
  },
  // Strategy for using OpenAI API
  openai: {
    providerName: "OpenAI",
    apiKeyEnvVar: "OPENAI_API_KEY",
    model: "gpt-4o-mini", // Cost-effective model for initial use
    freeTierUsage: "Limited free trial or tier may be available.",
    costPerRequest: "Pay-as-you-go, significant cost potential for high volume.",
    promptEngineeringFocus: "Cost optimization, balancing quality and expense.",
  },
  // Strategy for using a local LLM (e.g., via Ollama or LM Studio)
  local: {
    providerName: "Local LLM (Ollama/LM Studio)",
    apiUrlEnvVar: "LOCAL_LLM_URL", // e.g., http://localhost:12334
    modelName: "qwen2:7b", // Example model name
    freeTierUsage: "Free and offline.",
    costPerRequest: "Zero, beyond hardware costs.",
    promptEngineeringFocus: "Model capability and inference speed.",
  },
  // Add other providers as needed (e.g., Anthropic)
};

export const DEFAULT_LLM_PROVIDER = "gemini"; // Default to a cost-effective provider

export const BUDGET_CONSTRAINT = {
  yearly: 5000, // USD
  monthly: 5000 / 12,
};

export const LLM_API_STRATEGIES = {
  // Details on how to use the LLM APIs, including prompt strategies
  explanation: {
    provider: DEFAULT_LLM_PROVIDER, // Use default provider
    modelChoice: "cost_effective", // 'cost_effective', 'balanced', 'high_quality'
    promptTemplate: "traffic_explanation_template", // Reference to a prompt template
    maxTokens: 500, // Example limit
    temperature: 0.7, // For creativity vs. determinism
  },
  prediction: {
    provider: DEFAULT_LLM_PROVIDER,
    modelChoice: "cost_effective",
    promptTemplate: "traffic_prediction_template",
    maxTokens: 300,
    temperature: 0.5,
  },
  // Add other strategies for reporting, querying, etc.
};

// Function to get prompt template from a registry (could be imported from promptManager.ts)
export const getPromptTemplate = (templateName: string): string => {
  // In a real application, this would fetch prompts from a more robust system
  // For now, we'll use hardcoded examples or refer to promptManager.ts
  if (templateName === "traffic_explanation_template") {
    return "Analyze traffic data to explain anomalies and provide recommendations.";
  } else if (templateName === "traffic_prediction_template") {
    return "Predict future traffic based on given factors.";
  }
  return "Default prompt for unknown task.";
};
