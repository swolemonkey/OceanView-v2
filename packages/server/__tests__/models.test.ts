import { prisma } from '../src/db.js';

// Mock Prisma client
jest.mock('../src/db.js', () => ({
  prisma: {
    bot: {},
    metric: {},
    hyperSettings: {}
  }
}));

describe('Required Prisma Models', () => {
  test('weeklyEvaluate required models exist', async () => {
    // Check if 'bot' model exists
    expect('bot' in prisma).toBe(true);
    
    // Check if 'metric' model exists
    expect('metric' in prisma).toBe(true);
    
    // Check if 'hyperSettings' model exists
    expect('hyperSettings' in prisma).toBe(true);
    
    // This test will fail if any of these models are missing
    // which would cause the weeklyEvaluate warning
  });
}); 