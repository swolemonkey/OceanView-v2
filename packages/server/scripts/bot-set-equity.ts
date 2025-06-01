import fetch from 'node-fetch';

// Define response types
interface EquityResponse {
  equity: number;
}

interface ErrorResponse {
  error: string;
}

type ControlsResponse = EquityResponse | ErrorResponse;

async function setEquity(equity: number): Promise<EquityResponse> {
  try {
    if (isNaN(equity) || equity <= 0) {
      console.error('Error: Equity must be a positive number');
      process.exit(1);
    }
    
    const response = await fetch('http://localhost:3334/controls', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ equity }),
    });
    
    const result = await response.json() as ControlsResponse;
    
    if (response.ok) {
      const equityResult = result as EquityResponse;
      console.log(`Equity successfully updated to $${equityResult.equity.toFixed(2)}`);
      return equityResult;
    } else {
      const errorResult = result as ErrorResponse;
      console.error('Error:', errorResult.error || 'Failed to update equity');
      process.exit(1);
    }
  } catch (error) {
    console.error('Failed to set equity:', error);
    process.exit(1);
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  
  if (args.length !== 1) {
    console.error('Usage: pnpm run bot:set-equity -- <amount>');
    process.exit(1);
  }
  
  const equity = parseFloat(args[0]);
  return equity;
}

// Execute if called directly
if (require.main === module) {
  const equity = parseArgs();
  setEquity(equity);
}

export { setEquity }; 