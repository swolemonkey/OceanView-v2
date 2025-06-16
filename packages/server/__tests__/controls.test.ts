import { describe, expect, it, jest, beforeEach } from '@jest/globals';

// Mock Prisma client - using a more direct approach with @ts-ignore
jest.mock('../src/db', () => ({
  prisma: {
    accountState: {
      // @ts-ignore - suppressing the TypeScript error about the mock return type
      upsert: jest.fn().mockResolvedValue({ equity: 15000 })
    }
  }
}));

// Import after mocking
import { FastifyInstance } from 'fastify';
import { registerControlsRoute } from '../src/routes/controls';

describe('Controls Controller', () => {
  let app: any; // Using any type to avoid TypeScript errors
  let mockReply: any;
  
  beforeEach(() => {
    // Mock Fastify instance
    app = {
      post: jest.fn((path, handler) => {
        // Store the handler for testing
        app.handlers = app.handlers || {};
        app.handlers[path] = handler;
      }),
      handlers: {}
    };
    
    // Mock reply
    mockReply = {
      code: jest.fn().mockReturnThis()
    };
  });
  
  it('should register the controls route', async () => {
    await registerControlsRoute(app);
    expect(app.post).toHaveBeenCalledWith('/controls', expect.any(Function));
  });
  
  it('should update equity when valid value is provided', async () => {
    await registerControlsRoute(app);
    
    const handler = app.handlers['/controls'];
    const mockRequest = {
      body: { equity: 15000 }
    };
    
    const result = await handler(mockRequest, mockReply);
    
    expect(result).toEqual({ equity: 15000 });
  });
  
  it('should return error when no valid parameters are provided', async () => {
    await registerControlsRoute(app);
    
    const handler = app.handlers['/controls'];
    const mockRequest = {
      body: {}
    };
    
    const result = await handler(mockRequest, mockReply);
    
    expect(mockReply.code).toHaveBeenCalledWith(400);
    expect(result).toEqual({ error: 'No valid control parameters provided' });
  });
}); 