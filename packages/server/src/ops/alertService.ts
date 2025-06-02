import { WebClient } from '@slack/web-api';
const slack = new WebClient(process.env.SLACK_TOKEN);

export async function notify(msg: string) {
  if (process.env.NODE_ENV !== 'production') return;
  try { 
    await slack.chat.postMessage({ channel: '#alerts', text: msg }); 
  }
  catch (e) { 
    console.error('Slack alert failed', e); 
  }
} 