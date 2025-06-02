import * as cron from 'node-cron';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { prisma } from '@/db.js';

interface NewsItem {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
}

interface NewsResponse {
  articles: NewsItem[];
  status: string;
}

interface SentimentResult {
  score: number;
  articles: number;
}

/**
 * Calculate sentiment score from a list of news items
 * This is a simple implementation that would be replaced with a more
 * sophisticated NLP model in a real-world scenario
 */
function analyzeSentiment(articles: NewsItem[]): SentimentResult {
  // Example implementation - in a real system, this would use NLP
  // For now, random score with slight bias towards positive
  const baseScore = Math.random() * 0.5 + 0.25; // Between 0.25 and 0.75
  
  return {
    score: baseScore,
    articles: articles.length
  };
}

/**
 * Fetch cryptocurrency news from a news API
 * In a real implementation, this would use a paid API service
 */
async function fetchCryptoNews(): Promise<NewsItem[]> {
  // In a real implementation, use a paid API like:
  // https://newsapi.org/v2/everything?q=cryptocurrency&apiKey=API_KEY
  
  // For this mock, return some simulated news items
  const mockNews: NewsItem[] = [
    {
      title: "Bitcoin reaches new monthly high amid market optimism",
      url: "https://example.com/bitcoin-high",
      source: "CryptoNews",
      publishedAt: new Date().toISOString()
    },
    {
      title: "Regulatory concerns grow as lawmakers discuss new crypto bills",
      url: "https://example.com/crypto-regulation",
      source: "FinanceDaily",
      publishedAt: new Date().toISOString()
    },
    {
      title: "Major institutional investment firm adds Bitcoin to portfolio",
      url: "https://example.com/institutional-btc",
      source: "InvestorWeekly",
      publishedAt: new Date().toISOString()
    }
  ];
  
  return mockNews;
}

/**
 * Fetches news, analyzes sentiment, and stores in the database
 */
export async function fetchNewsSentiment() {
  try {
    // Fetch news
    const news = await fetchCryptoNews();
    
    // Analyze sentiment
    const sentiment = analyzeSentiment(news);
    
    // Store in database
    await (prisma as any).newsSentiment.create({
      data: {
        source: 'news-api',
        score: sentiment.score,
        articles: sentiment.articles
      }
    });
    
    console.log(`[news] Sentiment score: ${sentiment.score.toFixed(2)} from ${sentiment.articles} articles`);
    
    return sentiment;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching news sentiment:', errorMessage);
  }
}

/**
 * Gets the last 24 hours of sentiment data
 */
async function getDailySentiment() {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const sentiments = await (prisma as any).newsSentiment.findMany({
      where: {
        ts: { gte: oneDayAgo }
      },
      orderBy: {
        ts: 'desc'
      }
    });
    
    return sentiments;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error getting daily sentiment:', errorMessage);
    return [];
  }
}

/**
 * Initialize news sentiment polling
 * Runs every 15 minutes
 */
export function initNewsSentimentPolling() {
  // Run initial fetch
  fetchNewsSentiment();
  
  // Schedule cron job every 15 minutes
  cron.schedule('*/15 * * * *', fetchNewsSentiment);
  
  console.log('[news] Sentiment polling initialized, running every 15 minutes');
} 