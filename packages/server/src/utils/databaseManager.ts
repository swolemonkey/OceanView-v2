import { createLogger, type EnhancedLogger } from './logger.js';
import { prisma } from '../db.js';
import { executionMonitor } from '../monitoring/executionMonitor.js';
import { randomUUID } from 'crypto';

const logger = createLogger('databaseManager') as EnhancedLogger;

export interface DatabaseOperation<T = any> {
  operation: string;
  table: string;
  data?: any;
  where?: any;
  retries?: number;
}

export class DatabaseManager {
  private static instance: DatabaseManager;
  private maxRetries = 3;
  private retryDelay = 1000; // 1 second

  private constructor() {
    logger.info('🚀 DATABASE MANAGER: Initializing Database Manager');
  }

  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  /**
   * Verify database connection
   */
  public static async verifyConnection(): Promise<boolean> {
    const dbStartTime = Date.now();
    try {
      await prisma.$connect();
      // Test with a simple query
      await prisma.$queryRaw`SELECT 1`;
      
      logger.logDatabaseOperation({
        operation: 'connection_verify',
        success: true,
        executionTime: Date.now() - dbStartTime
      });
      
      return true;
    } catch (error) {
      logger.logDatabaseOperation({
        operation: 'connection_verify',
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - dbStartTime
      });
      return false;
    }
  }

  /**
   * Execute operation with retry logic
   */
  public static async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries: number = 3,
    tradeId?: string
  ): Promise<T> {
    let lastError: any;
    
    // Verify connection before operations
    const isConnected = await this.verifyConnection();
    if (!isConnected) {
      throw new Error(`Database connection failed before ${operationName}`);
    }

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const operationStartTime = Date.now();
      try {
        const result = await operation();
        
        logger.logDatabaseOperation({
          operation: operationName,
          tradeId,
          attempt: attempt + 1,
          maxAttempts: maxRetries,
          success: true,
          executionTime: Date.now() - operationStartTime
        });
        
        return result;
      } catch (error) {
        lastError = error;
        
        logger.logDatabaseOperation({
          operation: operationName,
          tradeId,
          attempt: attempt + 1,
          maxAttempts: maxRetries,
          success: false,
          error: error instanceof Error ? error.message : String(error),
          executionTime: Date.now() - operationStartTime
        });

        if (attempt < maxRetries - 1) {
          // Exponential backoff with jitter
          const baseDelay = Math.pow(2, attempt) * 1000;
          const jitter = Math.random() * 500;
          const delay = baseDelay + jitter;
          
          logger.debug(`Retrying ${operationName} after ${delay}ms delay`, { tradeId, attempt: attempt + 1 });
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    logger.error(`All ${maxRetries} attempts failed for ${operationName}`, { lastError, tradeId });
    throw lastError;
  }

  /**
   * Execute transaction with retry logic
   */
  public static async withTransaction<T>(
    operations: (tx: any) => Promise<T>,
    operationName: string,
    tradeId?: string
  ): Promise<T> {
    const transactionId = `${operationName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return this.withRetry(async () => {
      const transactionStartTime = Date.now();
      
      return await prisma.$transaction(async (tx) => {
        logger.debug(`Starting transaction: ${operationName}`, { transactionId, tradeId });
        try {
          const result = await operations(tx);
          
          logger.logDatabaseOperation({
            operation: operationName,
            tradeId,
            transactionId,
            success: true,
            executionTime: Date.now() - transactionStartTime
          });
          
          return result;
        } catch (error) {
          logger.logDatabaseOperation({
            operation: operationName,
            tradeId,
            transactionId,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            executionTime: Date.now() - transactionStartTime
          });
          throw error;
        }
      });
    }, `transaction:${operationName}`, 3, tradeId);
  }

  /**
   * Execute a database operation with monitoring and retry logic
   */
  async execute<T>(operation: DatabaseOperation<T>): Promise<T> {
    const startTime = Date.now();
    const operationId = randomUUID();
    let lastError: Error | null = null;

    logger.debug('💾 DATABASE MANAGER: Starting operation', {
      operationId,
      operation: operation.operation,
      table: operation.table,
      retries: operation.retries || this.maxRetries
    });

    const maxRetries = operation.retries ?? this.maxRetries;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.executeOperation(operation);
        const latency = Date.now() - startTime;

        // Record successful operation
        executionMonitor.recordDatabaseOperation(
          operation.operation,
          true,
          latency,
          {
            operationId,
            table: operation.table,
            attempt,
            totalAttempts: maxRetries
          }
        );

        logger.debug('✅ DATABASE MANAGER: Operation successful', {
          operationId,
          operation: operation.operation,
          table: operation.table,
          latency: `${latency}ms`,
          attempt,
          totalAttempts: maxRetries
        });

        return result;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const latency = Date.now() - startTime;

        logger.warn('⚠️ DATABASE MANAGER: Operation failed', {
          operationId,
          operation: operation.operation,
          table: operation.table,
          attempt,
          totalAttempts: maxRetries,
          error: lastError.message,
          latency: `${latency}ms`
        });

        // If this is the last attempt, record as failed
        if (attempt === maxRetries) {
          executionMonitor.recordDatabaseOperation(
            operation.operation,
            false,
            latency,
            {
              operationId,
              table: operation.table,
              attempt,
              totalAttempts: maxRetries,
              error: lastError.message
            }
          );

          logger.error('❌ DATABASE MANAGER: Operation failed after all retries', {
            operationId,
            operation: operation.operation,
            table: operation.table,
            totalAttempts: maxRetries,
            error: lastError.message,
            totalLatency: `${latency}ms`
          });

          throw lastError;
        }

        // Wait before retry
        if (attempt < maxRetries) {
          const delay = this.retryDelay * attempt; // Exponential backoff
          logger.debug('⏳ DATABASE MANAGER: Retrying operation', {
            operationId,
            operation: operation.operation,
            nextAttempt: attempt + 1,
            delay: `${delay}ms`
          });
          
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Unknown database operation error');
  }

  /**
   * Execute the actual database operation
   */
  private async executeOperation<T>(operation: DatabaseOperation<T>): Promise<T> {
    const { operation: op, table, data, where } = operation;

    switch (op.toLowerCase()) {
      case 'create':
        return await this.executeCreate(table, data);
      
      case 'update':
        return await this.executeUpdate(table, data, where);
      
      case 'upsert':
        return await this.executeUpsert(table, data, where);
      
      case 'delete':
        return await this.executeDelete(table, where);
      
      case 'findunique':
        return await this.executeFindUnique(table, where);
      
      case 'findmany':
        return await this.executeFindMany(table, where);
      
      case 'findFirst':
        return await this.executeFindFirst(table, where);
      
      case 'count':
        return await this.executeCount(table, where);
      
      default:
        throw new Error(`Unsupported database operation: ${op}`);
    }
  }

  private async executeCreate(table: string, data: any): Promise<any> {
    switch (table.toLowerCase()) {
      case 'order':
        return await prisma.order.create({ data });
      case 'trade':
        return await prisma.trade.create({ data });
      case 'accountstate':
        return await prisma.accountState.create({ data });
      case 'rldataset':
        return await prisma.rLDataset.create({ data });
      case 'dailymetric':
        return await prisma.dailyMetric.create({ data });
      case 'metric':
        return await prisma.metric.create({ data });
      default:
        throw new Error(`Unsupported table for create: ${table}`);
    }
  }

  private async executeUpdate(table: string, data: any, where: any): Promise<any> {
    switch (table.toLowerCase()) {
      case 'order':
        return await prisma.order.update({ data, where });
      case 'trade':
        return await prisma.trade.update({ data, where });
      case 'accountstate':
        return await prisma.accountState.update({ data, where });
      case 'dailymetric':
        return await prisma.dailyMetric.update({ data, where });
      case 'metric':
        return await prisma.metric.update({ data, where });
      default:
        throw new Error(`Unsupported table for update: ${table}`);
    }
  }

  private async executeUpsert(table: string, data: any, where: any): Promise<any> {
    switch (table.toLowerCase()) {
      case 'order':
        return await prisma.order.upsert({ where, update: data, create: data });
      case 'trade':
        return await prisma.trade.upsert({ where, update: data, create: data });
      case 'accountstate':
        return await prisma.accountState.upsert({ where, update: data, create: data });
      case 'dailymetric':
        return await prisma.dailyMetric.upsert({ where, update: data, create: data });
      case 'metric':
        return await prisma.metric.upsert({ where, update: data, create: data });
      default:
        throw new Error(`Unsupported table for upsert: ${table}`);
    }
  }

  private async executeDelete(table: string, where: any): Promise<any> {
    switch (table.toLowerCase()) {
      case 'order':
        return await prisma.order.delete({ where });
      case 'trade':
        return await prisma.trade.delete({ where });
      case 'accountstate':
        return await prisma.accountState.delete({ where });
      case 'dailymetric':
        return await prisma.dailyMetric.delete({ where });
      case 'metric':
        return await prisma.metric.delete({ where });
      default:
        throw new Error(`Unsupported table for delete: ${table}`);
    }
  }

  private async executeFindUnique(table: string, where: any): Promise<any> {
    switch (table.toLowerCase()) {
      case 'order':
        return await prisma.order.findUnique({ where });
      case 'trade':
        return await prisma.trade.findUnique({ where });
      case 'accountstate':
        return await prisma.accountState.findUnique({ where });
      case 'dailymetric':
        return await prisma.dailyMetric.findUnique({ where });
      case 'metric':
        return await prisma.metric.findUnique({ where });
      default:
        throw new Error(`Unsupported table for findUnique: ${table}`);
    }
  }

  private async executeFindMany(table: string, where: any): Promise<any> {
    switch (table.toLowerCase()) {
      case 'order':
        return await prisma.order.findMany({ where });
      case 'trade':
        return await prisma.trade.findMany({ where });
      case 'accountstate':
        return await prisma.accountState.findMany({ where });
      case 'dailymetric':
        return await prisma.dailyMetric.findMany({ where });
      case 'metric':
        return await prisma.metric.findMany({ where });
      default:
        throw new Error(`Unsupported table for findMany: ${table}`);
    }
  }

  private async executeFindFirst(table: string, where: any): Promise<any> {
    switch (table.toLowerCase()) {
      case 'order':
        return await prisma.order.findFirst({ where });
      case 'trade':
        return await prisma.trade.findFirst({ where });
      case 'accountstate':
        return await prisma.accountState.findFirst({ where });
      case 'dailymetric':
        return await prisma.dailyMetric.findFirst({ where });
      case 'metric':
        return await prisma.metric.findFirst({ where });
      default:
        throw new Error(`Unsupported table for findFirst: ${table}`);
    }
  }

  private async executeCount(table: string, where: any): Promise<any> {
    switch (table.toLowerCase()) {
      case 'order':
        return await prisma.order.count({ where });
      case 'trade':
        return await prisma.trade.count({ where });
      case 'accountstate':
        return await prisma.accountState.count({ where });
      case 'dailymetric':
        return await prisma.dailyMetric.count({ where });
      case 'metric':
        return await prisma.metric.count({ where });
      default:
        throw new Error(`Unsupported table for count: ${table}`);
    }
  }

  /**
   * Execute a transaction with monitoring
   */
  async executeTransaction<T>(operations: DatabaseOperation[], callback?: () => Promise<T>): Promise<T> {
    const startTime = Date.now();
    const transactionId = randomUUID();

    logger.debug('💾 DATABASE MANAGER: Starting transaction', {
      transactionId,
      operationCount: operations.length,
      operations: operations.map(op => ({ operation: op.operation, table: op.table }))
    });

    try {
      const result = await prisma.$transaction(async (tx) => {
        // Execute each operation in the transaction
        for (const operation of operations) {
          await this.executeOperation(operation);
        }

        // Execute callback if provided
        if (callback) {
          return await callback();
        }

        return undefined as any;
      });

      const latency = Date.now() - startTime;

      // Record successful transaction
      executionMonitor.recordDatabaseOperation(
        'transaction',
        true,
        latency,
        {
          transactionId,
          operationCount: operations.length,
          operations: operations.map(op => ({ operation: op.operation, table: op.table }))
        }
      );

      logger.info('✅ DATABASE MANAGER: Transaction successful', {
        transactionId,
        operationCount: operations.length,
        latency: `${latency}ms`
      });

      return result;

    } catch (error) {
      const latency = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Record failed transaction
      executionMonitor.recordDatabaseOperation(
        'transaction',
        false,
        latency,
        {
          transactionId,
          operationCount: operations.length,
          operations: operations.map(op => ({ operation: op.operation, table: op.table })),
          error: errorMessage
        }
      );

      logger.error('❌ DATABASE MANAGER: Transaction failed', {
        transactionId,
        operationCount: operations.length,
        error: errorMessage,
        latency: `${latency}ms`
      });

      throw error;
    }
  }
}

// Singleton instance getter
export const databaseManager = DatabaseManager.getInstance(); 