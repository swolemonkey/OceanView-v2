import fetch from 'node-fetch';

async function setEquity(equity: number) {
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
    
    const result = await response.json();
    
    if (response.ok) {
      console.log(`Equity successfully updated to $${result.equity.toFixed(2)}`);
    } else {
      console.error('Error:', result.error || 'Failed to update equity');
      process.exit(1);
    }
    
    return result;
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