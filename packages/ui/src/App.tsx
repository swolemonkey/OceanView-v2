import { useState, useEffect } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'

function App() {
  const [count, setCount] = useState(0)
  const [connected, setConnected] = useState(false)
  const [prices, setPrices] = useState<Record<string, number>>({})
  const [lastUpdate, setLastUpdate] = useState<string | null>(null)

  useEffect(() => {
    // Initial price fetch
    const fetchInitialPrices = async () => {
      try {
        const btcResponse = await fetch('http://localhost:3334/api/prices/latest?symbol=bitcoin')
        const btcData = await btcResponse.json()
        console.log('Bitcoin API response:', btcData)
        
        const ethResponse = await fetch('http://localhost:3334/api/prices/latest?symbol=ethereum')
        const ethData = await ethResponse.json()
        console.log('Ethereum API response:', ethData)
        
        const initialPrices: Record<string, number> = {}
        if (btcData.price) initialPrices['bitcoin'] = btcData.price
        if (ethData.price) initialPrices['ethereum'] = ethData.price
        
        console.log('Initial prices set:', initialPrices)
        setPrices(initialPrices)
      } catch (error) {
        console.error('Error fetching prices:', error)
      }
    }

    fetchInitialPrices()

    // Try fetching Bitcoin data again after a short delay if it failed initially
    const retryBitcoinTimeout = setTimeout(async () => {
      if (!prices.bitcoin) {
        try {
          console.log('Retrying Bitcoin price fetch...')
          const btcResponse = await fetch('http://localhost:3334/api/prices/latest?symbol=bitcoin')
          const btcData = await btcResponse.json()
          console.log('Bitcoin retry response:', btcData)
          
          if (btcData.price) {
            setPrices(prev => ({...prev, bitcoin: btcData.price}))
          }
        } catch (error) {
          console.error('Error in Bitcoin retry:', error)
        }
      }
    }, 3000) // Retry after 3 seconds

    // WebSocket connection for real-time updates
    const ws = new WebSocket('ws://localhost:3334/ws/ticks')
    
    ws.onopen = () => {
      console.log('WebSocket connected')
      setConnected(true)
    }
    
    ws.onclose = () => {
      console.log('WebSocket disconnected')
      setConnected(false)
    }
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        console.log('WebSocket message received:', data)
        console.log('WebSocket raw data:', JSON.stringify(data))
        
        if (data.prices) {
          const newPrices: Record<string, number> = {}
          
          console.log('Bitcoin data structure:', JSON.stringify(data.prices.bitcoin))
          console.log('Ethereum data structure:', JSON.stringify(data.prices.ethereum))
          
          // Handle Bitcoin price - supports multiple formats
          const btcData = data.prices.bitcoin
          if (btcData?.usd) {
            // Standard format {bitcoin: {usd: 123}}
            newPrices.bitcoin = btcData.usd
            console.log('Setting Bitcoin price from WS (nested format):', btcData.usd)
          } else if (typeof btcData === 'number') {
            // Alternative format {bitcoin: 123}
            newPrices.bitcoin = btcData
            console.log('Setting Bitcoin price from WS (direct number):', btcData)
          } else if (btcData) {
            // Try to find any usable price format
            const keys = Object.keys(btcData)
            console.log('Bitcoin object keys:', keys)
            if (keys.length > 0 && typeof btcData[keys[0]] === 'number') {
              newPrices.bitcoin = btcData[keys[0]]
              console.log('Setting Bitcoin price from first available key:', keys[0], btcData[keys[0]])
            }
          }
          
          // Handle Ethereum price - supports multiple formats
          const ethData = data.prices.ethereum
          if (ethData?.usd) {
            // Standard format {ethereum: {usd: 123}}
            newPrices.ethereum = ethData.usd
            console.log('Setting Ethereum price from WS (nested format):', ethData.usd)
          } else if (typeof ethData === 'number') {
            // Alternative format {ethereum: 123}
            newPrices.ethereum = ethData
            console.log('Setting Ethereum price from WS (direct number):', ethData)
          } else if (ethData) {
            // Try to find any usable price format
            const keys = Object.keys(ethData)
            console.log('Ethereum object keys:', keys)
            if (keys.length > 0 && typeof ethData[keys[0]] === 'number') {
              newPrices.ethereum = ethData[keys[0]]
              console.log('Setting Ethereum price from first available key:', keys[0], ethData[keys[0]])
            }
          }
          
          console.log('Updating prices from WebSocket:', newPrices)
          if (Object.keys(newPrices).length > 0) {
            setPrices(prevPrices => ({...prevPrices, ...newPrices}))
            setLastUpdate(new Date().toLocaleTimeString())
          } else {
            console.warn('No valid price data found in WebSocket message')
          }
        }
      } catch (error) {
        console.error('Error parsing WebSocket data:', error)
      }
    }
    
    return () => {
      ws.close()
      clearTimeout(retryBitcoinTimeout)
    }
  }, [])

  return (
    <>
      <div>
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>OceanView Dashboard</h1>
      
      {/* Connection Status */}
      <div className="connection-status">
        <span>Connection Status: </span>
        <span style={{ color: connected ? 'green' : 'red' }}>
          {connected ? 'Connected' : 'Disconnected'}
        </span>
      </div>
      
      {/* Price Data */}
      <div className="price-container">
        <h2>Latest Prices</h2>
        <div className="price-item">
          <span>Bitcoin: </span>
          <span>${typeof prices.bitcoin === 'number' ? prices.bitcoin.toLocaleString() : 'Loading...'}</span>
        </div>
        <div className="price-item">
          <span>Ethereum: </span>
          <span>${typeof prices.ethereum === 'number' ? prices.ethereum.toLocaleString() : 'Loading...'}</span>
        </div>
        {lastUpdate && <div className="update-time">Last updated: {lastUpdate}</div>}
      </div>
      
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          count is {count}
        </button>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </>
  )
}

export default App
