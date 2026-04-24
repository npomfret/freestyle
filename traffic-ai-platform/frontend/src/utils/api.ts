import axios from 'axios'; // Assuming axios is installed or will be installed

const API_BASE_URL = 'http://localhost:8000'; // Default backend URL

export const fetchTrafficData = async (limit: number = 100) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/traffic/data?limit=${limit}`);
    return response.data;
  } catch (error) {
    console.error("Error fetching traffic data:", error);
    throw error;
  }
};

export const analyzeTraffic = async (params: any) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/traffic/analyze`, params);
    return response.data;
  } catch (error) {
    console.error("Error analyzing traffic:", error);
    throw error;
  }
};

export const explainTrafficAnomaly = async (requestBody: any) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/traffic/explain`, requestBody);
    return response.data;
  } catch (error) {
    console.error("Error explaining traffic anomaly:", error);
    throw error;
  }
};

export const predictTraffic = async (requestBody: any) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/traffic/predict`, requestBody);
    return response.data;
  } catch (error) {
    console.error("Error predicting traffic:", error);
    throw error;
  }
};

// New function for report generation
export const generateReport = async (reportParams: any) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/traffic/report`, reportParams);
    return response.data;
  } catch (error) {
    console.error("Error generating report:", error);
    throw error;
  }
};
