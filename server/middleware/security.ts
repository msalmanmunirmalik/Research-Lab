import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { Request, Response, NextFunction } from 'express';

/** Local / loopback clients — never IP rate-limit during development. */
function isLocalhostIp(ip?: string | null): boolean {
  if (!ip) return false;
  const normalized = String(ip).replace(/^::ffff:/i, '').toLowerCase();
  return (
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === 'localhost' ||
    normalized === '0:0:0:0:0:0:0:1'
  );
}

function shouldSkipRateLimit(req: Request): boolean {
  if (process.env.DISABLE_RATE_LIMIT === '1' || process.env.DISABLE_RATE_LIMIT === 'true') {
    return true;
  }
  // Non-production: skip entirely so Vite/dev reloads never hit 429
  if (process.env.NODE_ENV !== 'production') {
    return true;
  }
  return isLocalhostIp(req.ip) || isLocalhostIp(req.socket?.remoteAddress);
}

// Rate limiting configuration
export const createRateLimit = (windowMs: number, max: number, message: string) => {
  return rateLimit({
    windowMs,
    max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => shouldSkipRateLimit(req),
    handler: (req: Request, res: Response) => {
      console.log(`🚨 Rate limit exceeded for IP: ${req.ip}`);
      res.status(429).json({ error: message });
    }
  });
};

// Writing Studio polls collab-state/presence often — exclude from the shared budget
const isHighFrequencyCollabPath = (path: string) =>
  /\/writing\/documents\/[^/]+\/(collab-state|presence|locks)\b/.test(path) ||
  /\/writing\/documents\/[^/]+\/locks\//.test(path);

// General API rate limiting (higher ceiling; collab poll paths + localhost are skipped)
export const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:
    process.env.NODE_ENV === 'production'
      ? Number(process.env.API_RATE_LIMIT_MAX || 600)
      : Number(process.env.API_RATE_LIMIT_MAX || 5000),
  message: { error: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) =>
    shouldSkipRateLimit(req) ||
    isHighFrequencyCollabPath(req.path || req.originalUrl || ''),
  handler: (req: Request, res: Response) => {
    console.log(`🚨 Rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: 'Too many requests from this IP, please try again later.',
      retryAfterSec: 60,
    });
  },
});

// Helmet security configuration (API server - CSP less critical than HSTS/frame guards)
export const securityHeaders = helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
});

// Auth endpoints rate limiting (stricter in production; looser for local/E2E)
const authWindowMs = 15 * 60 * 1000;
const authMax =
  process.env.NODE_ENV === 'production'
    ? 10
    : Number(process.env.AUTH_RATE_LIMIT_MAX || 80);

export const authRateLimit = createRateLimit(
  authWindowMs,
  authMax,
  'Too many authentication attempts, please try again later.'
);

// File upload rate limiting
export const uploadRateLimit = createRateLimit(
  15 * 60 * 1000,
  10,
  'Too many file uploads, please try again later.'
);

// Input validation middleware
export const validateInput = (req: Request, res: Response, next: NextFunction) => {
  // Sanitize string inputs
  const sanitizeString = (str: string): string => {
    return str
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+\s*=/gi, '') // Remove event handlers
      .trim();
  };

  // Recursively sanitize object
  const sanitizeObject = (obj: any): any => {
    if (typeof obj === 'string') {
      return sanitizeString(obj);
    } else if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    } else if (obj && typeof obj === 'object') {
      const sanitized: any = {};
      for (const key in obj) {
        sanitized[key] = sanitizeObject(obj[key]);
      }
      return sanitized;
    }
    return obj;
  };

  // Sanitize request body
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }

  // Sanitize query parameters
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }

  next();
};

// Request logging middleware
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    };
    
    if (res.statusCode >= 400) {
      console.log('🚨 Error Request:', logData);
    } else {
      console.log('📝 Request:', logData);
    }
  });
  
  next();
};

// Error handling middleware
export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('💥 Server Error:', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    timestamp: new Date().toISOString()
  });

  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation Error',
      details: isDevelopment ? err.message : 'Invalid input data'
    });
  }
  
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      error: 'Unauthorized',
      details: isDevelopment ? err.message : 'Authentication required'
    });
  }
  
  if (err.name === 'ForbiddenError') {
    return res.status(403).json({
      error: 'Forbidden',
      details: isDevelopment ? err.message : 'Access denied'
    });
  }
  
  // Default error response
  res.status(500).json({
    error: 'Internal Server Error',
    details: isDevelopment ? err.message : 'Something went wrong'
  });
};

// CORS configuration
export const corsOptions = {
  origin: (origin: string | undefined, callback: Function) => {
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:3000',
      'http://localhost:5174',
      'http://localhost:5175',
      process.env.FRONTEND_URL
    ].filter(Boolean);
    
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('🚨 CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

// Health check endpoint
export const healthCheck = (req: Request, res: Response) => {
  const healthData = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  };
  
  res.status(200).json(healthData);
};
