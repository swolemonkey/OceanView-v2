import { describe, expect, it, jest, beforeEach } from '@jest/globals';

// Mock Prisma client
jest.mock('../src/db.js', () => ({
  prisma: {
    accountState: {
      upsert: jest.fn().mockResolvedValue({ equity: 15000 })
    }
  }
}));

// Import after mocking
import { FastifyInstance } from 'fastify';
import { registerControlsRoute } from '../src/routes/controls.js';

describe('Controls Controller', () => {
  let app: FastifyInstance;
  let mockReply;
  
  beforeEach(() => {
    // Mock Fastify instance
    app = {
      post: jest.fn((path, handler) => {
        // Store the handler for testing
        app.routes = app.routes || {};
        app.routes[path] = handler;
      }),
      routes: {}
    } as unknown as FastifyInstance;
    
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
    
    const handler = app.routes['/controls'];
    const mockRequest = {
      body: { equity: 15000 }
    };
    
    const result = await handler(mockRequest, mockReply);
    
    expect(result).toEqual({ equity: 15000 });
  });
  
  it('should return error when no valid parameters are provided', async () => {
    await registerControlsRoute(app);
    
    const handler = app.routes['/controls'];
    const mockRequest = {
      body: {}
    };
    
    const result = await handler(mockRequest, mockReply);
    
    expect(mockReply.code).toHaveBeenCalledWith(400);
    expect(result).toEqual({ error: 'No valid control parameters provided' });
  });
}); 