export function connectMetrics(on: (m: any) => void) {
  console.log("Connecting to WebSocket...");
  
  // Use dynamic WebSocket URL that works in both local and Fly.io environments
  const wsUrl = (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws/metrics";
  console.log(`Connecting to ${wsUrl}`);
  
  const ws = new WebSocket(wsUrl);
  
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