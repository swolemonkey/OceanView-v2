import { useEffect, useState } from 'react';
import { connectMetrics } from '../wsMetrics';
import { toast } from './ui/use-toast';
import { Toaster } from './ui/toaster';

export default function BotPanel() {
  const [bots, setBots] = useState<Record<number, {
    name: string, 
    equity: number, 
    pnl: number, 
    history: number[],
    enabled: boolean
  }>>({});
  
  const [debug, setDebug] = useState<string[]>([]);

  useEffect(() => {
    console.log("BotPanel mounted");
    setDebug(prev => [...prev, "Component mounted"]);
    
    const close = connectMetrics(m => {
      console.log("Received metric:", m);
      setDebug(prev => [...prev, `Received: ${JSON.stringify(m)}`]);
      
      // Handle promotion alerts
      if (m.promotion) {
        toast({
          title: "Bot Promotion",
          description: `Fork ${m.bot} has been promoted!`
        });
        return;
      }

      setBots(b => {
        const cur = b[m.botId] ?? { 
          name: `bot ${m.botId}`, 
          equity: 0, 
          pnl: 0, 
          history: [],
          enabled: true 
        };
        const hist = [...cur.history.slice(-49), m.equity];
        return { ...b, [m.botId]: { ...cur, equity: m.equity, pnl: m.pnl, history: hist, enabled: m.enabled ?? true }};
      });
    });
    
    return close;
  }, []);

  return (
    <div className="p-4" style={{ background: "#f0f0f0", minHeight: "100vh" }}>
      <h1 className="text-2xl font-bold mb-4">Bot Dashboard</h1>
      
      {Object.keys(bots).length === 0 && (
        <div className="p-4 border rounded bg-white mb-4">
          <p>No bot metrics received yet. Run test script to see data.</p>
          <details>
            <summary className="text-sm mt-2 cursor-pointer">Debug logs</summary>
            <ul className="text-xs text-gray-600">
              {debug.map((msg, i) => (
                <li key={i}>{msg}</li>
              ))}
            </ul>
          </details>
        </div>
      )}
      
      {Object.values(bots).map(bot => (
        <div 
          key={bot.name} 
          className={`mb-4 border p-3 rounded bg-white ${!bot.enabled ? 'opacity-40' : ''}`}
        >
          <h2 className="font-bold">{bot.name}{!bot.enabled ? ' (archived)' : ''}</h2>
          <p>Equity: ${bot.equity.toFixed(2)} – PnL today: ${bot.pnl.toFixed(2)}</p>
          <svg width="200" height="60">
            {bot.history.map((v, i, arr) => i > 0 && (
              <line 
                key={i} 
                x1={(i-1)*4} 
                y1={60-arr[i-1]/bot.history[0]*60}
                x2={i*4} 
                y2={60-v/bot.history[0]*60}
                stroke="currentColor" 
                strokeWidth="1"
              />
            ))}
          </svg>
        </div>
      ))}
      <Toaster />
    </div>
  );
} 