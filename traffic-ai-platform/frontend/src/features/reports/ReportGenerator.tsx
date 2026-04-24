import React, { useState } from 'react';
import { generateReport } from '../utils/api'; // Import API function
// Import prompt generator if needed for report prompts, or define here
// import { getReportPrompt } from '../utils/promptManager'; 

const ReportGenerator: React.FC = () => {
  // State for report parameters
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [region, setRegion] = useState<string>('default_region');
  const [reportType, setReportType] = useState<string>('summary');
  
  // State for report results
  const [reportContent, setReportContent] = useState<string | null>(null);
  const [generatedPrompt, setGeneratedPrompt] = useState<string | null>(null); // To display the prompt
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerateReport = async () => {
    setLoading(true);
    setError(null);
    setReportContent(null);
    setGeneratedPrompt(null); // Clear previous prompt

    if (!startDate || !endDate) {
      setError("Please select both start and end dates for the report.");
      setLoading(false);
      return;
    }

    const reportParams = {
      start_date: new Date(startDate).toISOString(),
      end_date: new Date(endDate).toISOString(),
      region: region,
      report_type: reportType,
    };

    // Construct prompt for report generation
    const prompt = `Generate a ${reportType} report for ${region} covering the period from ${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()}. Focus on key traffic metrics, anomalies, and recommendations.`;
    console.log("Generated report prompt:", prompt);
    setGeneratedPrompt(prompt);

    const requestBody = {
      ...reportParams,
      prompt: prompt, // Send the generated prompt to the backend
    };

    try {
      const data = await generateReport(requestBody);
      setReportContent(data.report || "No report content available.");
    } catch (err) {
      setError("Failed to generate report.");
      console.error("Report generation error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleGenerateReport();
  };

  return (
    <div className="report-generator">
      <h2>Generate Report</h2>
      <form onSubmit={handleSubmit}>
        <div className="input-section">
          <label>
            Start Date:
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </label>
          <label>
            End Date:
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
          </label>
          <label>
            Region:
            <input
              type="text"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="e.g., Downtown Sector"
            />
          </label>
          <label>
            Report Type:
            <select value={reportType} onChange={(e) => setReportType(e.target.value)}>
              <option value="summary">Summary</option>
              <option value="anomaly_report">Anomaly Report</option>
              <option value="detailed">Detailed</option>
            </select>
          </label>
        </div>
        <button type="submit" disabled={loading || !startDate || !endDate}>
          {loading ? 'Generating...' : 'Generate Report'}
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

      {reportContent && (
        <div className="results-section">
          <h3>Generated Report</h3>
          <pre>{reportContent}</pre>
        </div>
      )}
    </div>
  );
};

export default ReportGenerator;
