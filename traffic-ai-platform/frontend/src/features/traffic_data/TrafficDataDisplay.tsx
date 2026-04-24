import React from 'react';
import './TrafficDataDisplay.css'; // Assuming a CSS file for styling

// Define the shape of a single traffic record based on backend model
interface TrafficRecord {
  timestamp: string;
  speed_kmh: number;
  volume_veh_per_hour: number;
  weather_condition: string;
  incident_reported: boolean;
}

interface TrafficDataDisplayProps {
  data: TrafficRecord[];
}

const TrafficDataDisplay: React.FC<TrafficDataDisplayProps> = ({ data }) => {
  if (!data || data.length === 0) {
    return <div className="traffic-data-display">No traffic data available.</div>;
  }

  return (
    <div className="traffic-data-display">
      <h2>Latest Traffic Data</h2>
      <table>
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Speed (km/h)</th>
            <th>Volume (veh/hr)</th>
            <th>Weather</th>
            <th>Incident</th>
          </tr>
        </thead>
        <tbody>
          {data.map((record, index) => (
            <tr key={index}>
              <td>{new Date(record.timestamp).toLocaleString()}</td>
              <td>{record.speed_kmh}</td>
              <td>{record.volume_veh_per_hour}</td>
              <td>{record.weather_condition}</td>
              <td>{record.incident_reported ? 'Yes' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default TrafficDataDisplay;
