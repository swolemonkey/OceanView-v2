import { useEffect, useState } from 'react';

interface Bot {
  id: number;
  name: string;
  equity: number;
  pnl: number;
  history: number[];
}

export default function DirectPanel() {
  const [bots, setBots] = useState<Record<number, Bot>>({});
  const [status, setStatus] = useState("Connecting to WebSocket...");
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (message: string) => {
    console.log(message);
    setLogs(prev => [...prev.slice(-9), message]);
  };

  useEffect(() => {
    addLog("DirectPanel mounted");
    
    // Connect directly to the WebSocket server
    // Use dynamic WebSocket URL that works in both local and Fly.io environments
    const wsUrl = (location.protocol === "https:" ? "wss://" : "ws://") + location.host;
    const ws = new WebSocket(wsUrl);
    
    addLog(`Attempting connection to ${wsUrl}`);
    
    ws.onopen = () => {
      addLog("WebSocket connection established");
      setStatus("Connected to WebSocket server");
      setConnected(true);
      setError(null);
    };
    
    ws.onerror = (error) => {
      addLog(`WebSocket error: ${error}`);
      setStatus("Error connecting to WebSocket");
      setError("Failed to connect to WebSocket server");
      setConnected(false);
    };
    
    ws.onclose = () => {
      addLog("WebSocket connection closed");
      setStatus("Connection closed");
      setConnected(false);
    };
    
    ws.onmessage = (event) => {
      addLog(`Received: ${event.data.substring(0, 50)}...`);
      try {
        const data = JSON.parse(event.data);
        
        // Handle promotion alert
        if (data.promotion) {
          alert(`Fork ${data.bot} promoted!`);
          return;
        }
        
        // Handle bot metrics
        if (data.botId && data.equity !== undefined) {
          setBots(current => {
            const botId = data.botId;
            const currentBot = current[botId] || { 
              id: botId, 
              name: `Bot ${botId}`, 
              equity: 0, 
              pnl: 0, 
              history: [] 
            };
            
            // Add new data to history
            const updatedHistory = [...currentBot.history.slice(-49), data.equity];
            
            return {
              ...current,
              [botId]: {
                ...currentBot,
                equity: data.equity,
                pnl: data.pnl,
                history: updatedHistory
              }
            };
          });
        }
      } catch (error) {
        addLog(`Error parsing message: ${error}`);
      }
    };
    
    // Clean up on unmount
    return () => {
      ws.close();
      addLog("WebSocket connection closed on unmount");
    };
  }, []);

  return (
    <div className="p-4" style={{ background: "#f0f0f0", minHeight: "100vh" }}>
      <h1 className="text-2xl font-bold mb-4">Bot Dashboard (Live)</h1>
      
      <div className={`p-4 border rounded mb-4 ${connected ? 'bg-green-50' : 'bg-red-50'}`}>
        <p className={`font-bold ${connected ? 'text-green-600' : 'text-red-600'}`}>
          {connected ? 'Connected to WebSocket server' : 'Connection Issue'}
        </p>
        <p className="mb-2">{status}</p>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        
        <details>
          <summary className="cursor-pointer text-sm text-gray-600">Debug Logs</summary>
          <ul className="text-xs text-gray-600 mt-2">
            {logs.map((log, i) => <li key={i}>{log}</li>)}
          </ul>
        </details>
      </div>
      
      {Object.keys(bots).length === 0 && (
        <div className="p-4 border rounded bg-white mb-4">
          <p>Waiting for bot metrics...</p>
        </div>
      )}
      
      {Object.values(bots).map(bot => (
        <div key={bot.id} className="mb-4 border p-3 rounded bg-white">
          <h2 className="font-bold">{bot.name}</h2>
          <p>Equity: ${bot.equity.toFixed(2)} – PnL today: ${bot.pnl.toFixed(2)}</p>
          {bot.history.length > 1 && (
            <svg width="200" height="60">
              {bot.history.map((v, i, arr) => i > 0 && (
                <line 
                  key={i} 
                  x1={(i-1)*4} 
                  y1={60-arr[i-1]/arr[0]*60}
                  x2={i*4} 
                  y2={60-v/arr[0]*60}
                  stroke="currentColor" 
                  strokeWidth="1"
                />
              ))}
            </svg>
          )}
        </div>
      ))}
    </div>
  );
} 