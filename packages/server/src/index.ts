import './db.js';
import { pollAndStore } from './services/marketData.js';

console.log("server up");

setInterval(pollAndStore, 5000);

export {}; 