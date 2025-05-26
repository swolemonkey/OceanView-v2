import { loadConfig } from './config.js';
import { smcSignal } from './smc.js';
import { taSignal } from './ta.js';
export async function decide(perception, cfg) {
    if (!cfg) {
        cfg = await loadConfig();
    }
    // Skip if not enough data
    if (perception.last(2).length < 2) {
        return null;
    }
    const s = smcSignal(perception, cfg);
    const t = taSignal(perception, cfg);
    // Create detailed reason for logging
    let reason = "";
    if (s)
        reason += `SMC:${s.type} `;
    if (t)
        reason += `TA:${t.type}`;
    // If no signals, provide reason for holding
    if (!s && !t) {
        reason = "No signals detected";
    }
    else if (!s) {
        reason = `Missing SMC confirmation (${reason.trim()})`;
    }
    else if (!t) {
        reason = `Missing TA confirmation (${reason.trim()})`;
    }
    if (s && s.type === 'stop-hunt-long' && t && t.type === 'ta-long') {
        const last = perception.last(1)[0].c;
        return {
            symbol: cfg.symbol,
            side: 'buy',
            qty: 0.001,
            price: last,
            reason: `Buy signal: ${reason}`
        };
    }
    // Return null with reason property for logging
    return {
        symbol: cfg.symbol,
        action: 'hold',
        reason
    };
}
