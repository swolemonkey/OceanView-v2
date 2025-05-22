export function connectMetrics(on: (m: any) => void) {
  console.log("Connecting to WebSocket...");
  
  // Always use explicit localhost:3334 connection for metrics
  const serverUrl = 'ws://localhost:3334';
  console.log(`Connecting to ${serverUrl}/ws/metrics`);
  
  const ws = new WebSocket(`${serverUrl}/ws/metrics`);
  
  ws.onopen = () => {
    console.log("WebSocket connection established");
  };
  
  ws.onerror = (error) => {
    console.error("WebSocket error:", error);
  };
  
  ws.onclose = () => {
    console.log("WebSocket connection closed");
  };
  
  ws.onmessage = e => {
    console.log("WebSocket message received:", e.data);
    try {
      const data = JSON.parse(e.data);
      on(data);
    } catch (error) {
      console.error("Error parsing WebSocket message:", error);
    }
  };
  
  return () => ws.close();
} 