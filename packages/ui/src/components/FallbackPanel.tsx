import { useEffect, useState } from 'react';

// Simulated bot data
const DEMO_BOTS = [
  { id: 1, name: 'Bot 1', equity: 1000, pnl: 50, history: Array(50).fill(0).map((_, i) => 1000 + Math.sin(i/5) * 50) },
  { id: 2, name: 'Bot 2', equity: 1500, pnl: 75, history: Array(50).fill(0).map((_, i) => 1500 + Math.cos(i/5) * 100) }
];

export default function FallbackPanel() {
  const [bots, setBots] = useState(DEMO_BOTS);
  const [status] = useState("Using fallback demo data");

  // Update demo data every 2 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setBots(currentBots => 
        currentBots.map(bot => ({
          ...bot,
          equity: Math.round(bot.equity + (Math.random() * 40 - 20)),
          pnl: Math.round(bot.pnl + (Math.random() * 10 - 5)),
          history: [...bot.history.slice(1), bot.equity + (Math.random() * 40 - 20)]
        }))
      );
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-4" style={{ background: "#f0f0f0", minHeight: "100vh" }}>
      <h1 className="text-2xl font-bold mb-4">Bot Dashboard (Demo Mode)</h1>
      
      <div className="p-4 border rounded bg-white mb-4">
        <p className="text-red-600 font-bold">WebSocket connection issue detected</p>
        <p className="mb-2">Showing simulated data instead of live metrics.</p>
        <p className="text-sm">{status}</p>
      </div>
      
      {bots.map(bot => (
        <div key={bot.id} className="mb-4 border p-3 rounded bg-white">
          <h2 className="font-bold">{bot.name}</h2>
          <p>Equity: ${bot.equity.toFixed(2)} – PnL today: ${bot.pnl.toFixed(2)}</p>
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
        </div>
      ))}
    </div>
  );
} 