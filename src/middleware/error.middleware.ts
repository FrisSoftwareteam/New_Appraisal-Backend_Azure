import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';

// Custom error class for database errors
export class DatabaseError extends Error {
  statusCode: number;
  
  constructor(message: string, statusCode: number = 503) {
    super(message);
    this.name = 'DatabaseError';
    this.statusCode = statusCode;
  }
}

// Global error handler middleware
export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Log the error for debugging
  console.error('Error caught by global handler:', {
    name: err.name,
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method
  });

  // Handle MongoDB/Mongoose specific errors
  if (err.name === 'MongooseError' || err.name === 'MongoError' || err.name === 'MongoServerError') {
    return res.status(503).json({
      error: 'Database service temporarily unavailable',
      message: 'Please try again in a moment',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }

  // Handle MongoDB timeout errors
  if (err.message && err.message.includes('buffering timed out')) {
    return res.status(503).json({
      error: 'Database connection timeout',
      message: 'The database is not responding. Please try again later.',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }

  // Handle MongoDB server selection errors
  if (err.name === 'MongoServerSelectionError' || err.name === 'MongoNetworkError' || err.name === 'MongoNetworkTimeoutError') {
    return res.status(503).json({
      error: 'Database connection failed',
      message: 'Unable to connect to the database. Please try again later.',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }

  // Handle validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation error',
      message: err.message,
      details: err.errors
    });
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'Authentication failed',
      message: err.message
    });
  }

  // Handle custom database errors
  if (err instanceof DatabaseError) {
    return res.status(err.statusCode).json({
      error: 'Database error',
      message: err.message
    });
  }

  // Default error response
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred',
    details: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
};

// Async handler wrapper to catch promise rejections
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Database health check helper
export const checkDatabaseConnection = (): boolean => {
  return mongoose.connection.readyState === 1; // 1 = connected
};

// Timeout wrapper for database queries to prevent hanging
export const withTimeout = <T>(promise: Promise<T>, timeoutMs: number = 10000): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error('Database query timeout')), timeoutMs)
    )
  ]);
};
