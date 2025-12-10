# Supabase Auth - Backend Implementation

This document details the backend implementation for Supabase Auth integration in Pendulum Pay API.

## Table of Contents
1. [Supabase Client Setup](#supabase-client-setup)
2. [Database Migrations](#database-migrations)
3. [Model Updates](#model-updates)
4. [Auth Service Layer](#auth-service-layer)
5. [API Controllers](#api-controllers)
6. [API Routes](#api-routes)
7. [Auth Middleware](#auth-middleware)

---

## 1. Supabase Client Setup

### Installation
```bash
# In apps/api
bun add @supabase/supabase-js
```

### Configuration

**File**: `apps/api/src/config/supabase.ts`

```typescript
import { createClient } from '@supabase/supabase-js';
import { env } from './vars';

export const supabaseAdmin = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

export const supabase = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_ANON_KEY
);
```

### Environment Variables

**Update**: `apps/api/src/config/vars.ts`

```typescript
export const env = {
  // ... existing vars
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
};
```

**Add to `.env.example`**:
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

---

## 2. Database Migrations

### Migration 019: Add user_id to Entities

**File**: `apps/api/src/database/migrations/019-add-user-id-to-entities.ts`

```typescript
import { DataTypes, QueryInterface } from "sequelize";
import { v4 as uuidv4 } from 'uuid';

export async function up(queryInterface: QueryInterface): Promise<void> {
  // Generate a dummy user ID for migration
  const DUMMY_USER_ID = uuidv4();
  
  console.log(`Using dummy user ID for migration: ${DUMMY_USER_ID}`);

  // Add user_id to kyc_level_2
  await queryInterface.addColumn('kyc_level_2', 'user_id', {
    type: DataTypes.UUID,
    allowNull: true,
  });

  await queryInterface.sequelize.query(
    `UPDATE kyc_level_2 SET user_id = '${DUMMY_USER_ID}' WHERE user_id IS NULL`
  );

  await queryInterface.changeColumn('kyc_level_2', 'user_id', {
    type: DataTypes.UUID,
    allowNull: false,
  });

  await queryInterface.addIndex('kyc_level_2', ['user_id'], {
    name: 'idx_kyc_level_2_user_id'
  });

  // Add user_id to quote_tickets
  await queryInterface.addColumn('quote_tickets', 'user_id', {
    type: DataTypes.UUID,
    allowNull: true,
  });

  await queryInterface.sequelize.query(
    `UPDATE quote_tickets SET user_id = '${DUMMY_USER_ID}' WHERE user_id IS NULL`
  );

  await queryInterface.changeColumn('quote_tickets', 'user_id', {
    type: DataTypes.UUID,
    allowNull: false,
  });

  await queryInterface.addIndex('quote_tickets', ['user_id'], {
    name: 'idx_quote_tickets_user_id'
  });

  // Add user_id to ramp_states
  await queryInterface.addColumn('ramp_states', 'user_id', {
    type: DataTypes.UUID,
    allowNull: true,
  });

  await queryInterface.sequelize.query(
    `UPDATE ramp_states SET user_id = '${DUMMY_USER_ID}' WHERE user_id IS NULL`
  );

  await queryInterface.changeColumn('ramp_states', 'user_id', {
    type: DataTypes.UUID,
    allowNull: false,
  });

  await queryInterface.addIndex('ramp_states', ['user_id'], {
    name: 'idx_ramp_states_user_id'
  });

  // Add user_id to tax_ids
  await queryInterface.addColumn('tax_ids', 'user_id', {
    type: DataTypes.UUID,
    allowNull: true,
  });

  await queryInterface.sequelize.query(
    `UPDATE tax_ids SET user_id = '${DUMMY_USER_ID}' WHERE user_id IS NULL`
  );

  await queryInterface.changeColumn('tax_ids', 'user_id', {
    type: DataTypes.UUID,
    allowNull: false,
  });

  await queryInterface.addIndex('tax_ids', ['user_id'], {
    name: 'idx_tax_ids_user_id'
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeIndex('kyc_level_2', 'idx_kyc_level_2_user_id');
  await queryInterface.removeIndex('quote_tickets', 'idx_quote_tickets_user_id');
  await queryInterface.removeIndex('ramp_states', 'idx_ramp_states_user_id');
  await queryInterface.removeIndex('tax_ids', 'idx_tax_ids_user_id');

  await queryInterface.removeColumn('kyc_level_2', 'user_id');
  await queryInterface.removeColumn('quote_tickets', 'user_id');
  await queryInterface.removeColumn('ramp_states', 'user_id');
  await queryInterface.removeColumn('tax_ids', 'user_id');
}
```

---

## 3. Model Updates

### QuoteTicket Model

**Update**: `apps/api/src/models/quoteTicket.model.ts`

```typescript
// Add to interface
export interface QuoteTicketAttributes {
  // ... existing fields
  userId: string; // UUID reference to Supabase Auth user
  // ... rest
}

// Add to model class
declare userId: string;

// Add to init()
userId: {
  allowNull: false,
  field: 'user_id',
  type: DataTypes.UUID
}
```

### RampState Model

**Update**: `apps/api/src/models/rampState.model.ts`

```typescript
// Add to interface
export interface RampStateAttributes {
  // ... existing fields
  userId: string;
  // ... rest
}

// Add to model class
declare userId: string;

// Add to init()
userId: {
  allowNull: false,
  field: 'user_id',
  type: DataTypes.UUID
}
```

### TaxId Model

**Update**: `apps/api/src/models/taxId.model.ts`

```typescript
// Add to interface
export interface TaxIdAttributes {
  // ... existing fields
  userId: string;
  // ... rest
}

// Add to model class
declare userId: string;

// Add to init()
userId: {
  allowNull: false,
  field: 'user_id',
  type: DataTypes.UUID
}
```

### KycLevel2 Model

**Create** (if not exists): `apps/api/src/models/kycLevel2.model.ts`

```typescript
import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export interface KycLevel2Attributes {
  id: string;
  userId: string;
  subaccountId: string;
  documentType: 'RG' | 'CNH';
  uploadData: any;
  status: 'Requested' | 'DataCollected' | 'BrlaValidating' | 'Rejected' | 'Accepted' | 'Cancelled';
  errorLogs: any[];
  createdAt: Date;
  updatedAt: Date;
}

type KycLevel2CreationAttributes = Optional<KycLevel2Attributes, 'id' | 'createdAt' | 'updatedAt' | 'errorLogs'>;

class KycLevel2 extends Model<KycLevel2Attributes, KycLevel2CreationAttributes> implements KycLevel2Attributes {
  declare id: string;
  declare userId: string;
  declare subaccountId: string;
  declare documentType: 'RG' | 'CNH';
  declare uploadData: any;
  declare status: 'Requested' | 'DataCollected' | 'BrlaValidating' | 'Rejected' | 'Accepted' | 'Cancelled';
  declare errorLogs: any[];
  declare createdAt: Date;
  declare updatedAt: Date;
}

KycLevel2.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id',
    },
    subaccountId: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'subaccount_id',
    },
    documentType: {
      type: DataTypes.ENUM('RG', 'CNH'),
      allowNull: false,
      field: 'document_type',
    },
    uploadData: {
      type: DataTypes.JSONB,
      allowNull: false,
      field: 'upload_data',
    },
    status: {
      type: DataTypes.ENUM('Requested', 'DataCollected', 'BrlaValidating', 'Rejected', 'Accepted', 'Cancelled'),
      allowNull: false,
      defaultValue: 'Requested',
      field: 'status',
    },
    errorLogs: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      field: 'error_logs',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at',
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'updated_at',
    },
  },
  {
    sequelize,
    tableName: 'kyc_level_2',
    modelName: 'KycLevel2',
    timestamps: true,
    indexes: [
      {
        name: 'idx_kyc_level_2_subaccount',
        fields: ['subaccount_id'],
      },
      {
        name: 'idx_kyc_level_2_status',
        fields: ['status'],
      },
      {
        name: 'idx_kyc_level_2_user_id',
        fields: ['user_id'],
      },
    ],
  }
);

export default KycLevel2;
```

**Update**: `apps/api/src/models/index.ts`

```typescript
import KycLevel2 from './kycLevel2.model';

// Add to exports
const models = {
  // ... existing
  KycLevel2,
  // ... rest
};
```

---

## 4. Auth Service Layer

**File**: `apps/api/src/api/services/auth/supabase.service.ts`

```typescript
import { supabase, supabaseAdmin } from '../../../config/supabase';

export class SupabaseAuthService {
  /**
   * Check if user exists by email
   */
  static async checkUserExists(email: string): Promise<boolean> {
    try {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers();
      
      if (error) {
        throw error;
      }

      const userExists = data.users.some(user => user.email === email);
      return userExists;
    } catch (error) {
      console.error('Error checking user existence:', error);
      throw error;
    }
  }

  /**
   * Send OTP to email
   */
  static async sendOTP(email: string): Promise<void> {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
      },
    });

    if (error) {
      throw error;
    }
  }

  /**
   * Verify OTP
   */
  static async verifyOTP(email: string, token: string): Promise<{
    access_token: string;
    refresh_token: string;
    user_id: string;
  }> {
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    });

    if (error) {
      throw error;
    }

    if (!data.session) {
      throw new Error('No session returned after OTP verification');
    }

    return {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      user_id: data.user.id,
    };
  }

  /**
   * Verify access token
   */
  static async verifyToken(accessToken: string): Promise<{
    valid: boolean;
    user_id?: string;
  }> {
    const { data, error } = await supabase.auth.getUser(accessToken);

    if (error || !data.user) {
      return { valid: false };
    }

    return {
      valid: true,
      user_id: data.user.id,
    };
  }

  /**
   * Refresh access token
   */
  static async refreshToken(refreshToken: string): Promise<{
    access_token: string;
    refresh_token: string;
  }> {
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error || !data.session) {
      throw new Error('Failed to refresh token');
    }

    return {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    };
  }

  /**
   * Get user profile from Supabase
   */
  static async getUserProfile(userId: string): Promise<any> {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);

    if (error) {
      throw error;
    }

    return data.user;
  }
}
```

**File**: `apps/api/src/api/services/auth/index.ts`

```typescript
export { SupabaseAuthService } from './supabase.service';
```

---

## 5. API Controllers

**File**: `apps/api/src/api/controllers/auth.controller.ts`

```typescript
import { Request, Response } from 'express';
import { SupabaseAuthService } from '../services/auth';

export class AuthController {
  /**
   * Check if email is registered
   * GET /api/v1/auth/check-email?email=user@example.com
   */
  static async checkEmail(req: Request, res: Response) {
    try {
      const { email } = req.query;

      if (!email || typeof email !== 'string') {
        return res.status(400).json({
          error: 'Email is required',
        });
      }

      const exists = await SupabaseAuthService.checkUserExists(email);

      return res.json({
        exists,
        action: exists ? 'signin' : 'signup',
      });
    } catch (error) {
      console.error('Error in checkEmail:', error);
      return res.status(500).json({
        error: 'Failed to check email',
      });
    }
  }

  /**
   * Request OTP
   * POST /api/v1/auth/request-otp
   */
  static async requestOTP(req: Request, res: Response) {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          error: 'Email is required',
        });
      }

      await SupabaseAuthService.sendOTP(email);

      return res.json({
        success: true,
        message: 'OTP sent to email',
      });
    } catch (error) {
      console.error('Error in requestOTP:', error);
      return res.status(500).json({
        error: 'Failed to send OTP',
      });
    }
  }

  /**
   * Verify OTP
   * POST /api/v1/auth/verify-otp
   */
  static async verifyOTP(req: Request, res: Response) {
    try {
      const { email, token } = req.body;

      if (!email || !token) {
        return res.status(400).json({
          error: 'Email and token are required',
        });
      }

      const result = await SupabaseAuthService.verifyOTP(email, token);

      return res.json({
        success: true,
        access_token: result.access_token,
        refresh_token: result.refresh_token,
        user_id: result.user_id,
      });
    } catch (error) {
      console.error('Error in verifyOTP:', error);
      return res.status(400).json({
        error: 'Invalid OTP or OTP expired',
      });
    }
  }

  /**
   * Refresh token
   * POST /api/v1/auth/refresh
   */
  static async refreshToken(req: Request, res: Response) {
    try {
      const { refresh_token } = req.body;

      if (!refresh_token) {
        return res.status(400).json({
          error: 'Refresh token is required',
        });
      }

      const result = await SupabaseAuthService.refreshToken(refresh_token);

      return res.json({
        success: true,
        access_token: result.access_token,
        refresh_token: result.refresh_token,
      });
    } catch (error) {
      console.error('Error in refreshToken:', error);
      return res.status(401).json({
        error: 'Invalid refresh token',
      });
    }
  }

  /**
   * Verify token
   * POST /api/v1/auth/verify
   */
  static async verifyToken(req: Request, res: Response) {
    try {
      const { access_token } = req.body;

      if (!access_token) {
        return res.status(400).json({
          error: 'Access token is required',
        });
      }

      const result = await SupabaseAuthService.verifyToken(access_token);

      if (!result.valid) {
        return res.status(401).json({
          valid: false,
          error: 'Invalid token',
        });
      }

      return res.json({
        valid: true,
        user_id: result.user_id,
      });
    } catch (error) {
      console.error('Error in verifyToken:', error);
      return res.status(401).json({
        valid: false,
        error: 'Token verification failed',
      });
    }
  }
}
```

---

## 6. API Routes

**File**: `apps/api/src/api/routes/v1/auth.route.ts`

```typescript
import { Router } from 'express';
import { AuthController } from '../../controllers/auth.controller';

const router = Router();

router.get('/check-email', AuthController.checkEmail);
router.post('/request-otp', AuthController.requestOTP);
router.post('/verify-otp', AuthController.verifyOTP);
router.post('/refresh', AuthController.refreshToken);
router.post('/verify', AuthController.verifyToken);

export default router;
```

**Update**: `apps/api/src/api/routes/v1/index.ts`

```typescript
import authRoutes from './auth.route';

// Add to router
router.use('/auth', authRoutes);
```

---

## 7. Auth Middleware

**File**: `apps/api/src/api/middlewares/supabaseAuth.ts`

```typescript
import { NextFunction, Request, Response } from 'express';
import { SupabaseAuthService } from '../services/auth';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/**
 * Middleware to verify Supabase auth token
 * Ready for future use when endpoints need protection
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Missing or invalid authorization header',
      });
    }

    const token = authHeader.substring(7);
    const result = await SupabaseAuthService.verifyToken(token);

    if (!result.valid) {
      return res.status(401).json({
        error: 'Invalid or expired token',
      });
    }

    req.userId = result.user_id;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({
      error: 'Authentication failed',
    });
  }
}

/**
 * Optional auth - attaches userId if token present
 */
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const result = await SupabaseAuthService.verifyToken(token);

      if (result.valid) {
        req.userId = result.user_id;
      }
    }

    next();
  } catch (error) {
    next();
  }
}
```

---

## API Endpoints Reference

### Check Email
```http
GET /api/v1/auth/check-email?email=user@example.com

Response:
{
  "exists": true,
  "action": "signin"
}
```

### Request OTP
```http
POST /api/v1/auth/request-otp
Content-Type: application/json

{
  "email": "user@example.com"
}

Response:
{
  "success": true,
  "message": "OTP sent to email"
}
```

### Verify OTP
```http
POST /api/v1/auth/verify-otp
Content-Type: application/json

{
  "email": "user@example.com",
  "token": "123456"
}

Response:
{
  "success": true,
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "user_id": "a1b2c3d4-..."
}
```

### Refresh Token
```http
POST /api/v1/auth/refresh
Content-Type: application/json

{
  "refresh_token": "eyJ..."
}

Response:
{
  "success": true,
  "access_token": "eyJ...",
  "refresh_token": "eyJ..."
}
```

### Verify Token
```http
POST /api/v1/auth/verify
Content-Type: application/json

{
  "access_token": "eyJ..."
}

Response:
{
  "valid": true,
  "user_id": "a1b2c3d4-..."
}
```

---

## Testing Backend Endpoints

### Using curl

```bash
# Check email
curl -X GET "http://localhost:3000/api/v1/auth/check-email?email=test@example.com"

# Request OTP
curl -X POST http://localhost:3000/api/v1/auth/request-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'

# Verify OTP
curl -X POST http://localhost:3000/api/v1/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","token":"123456"}'

# Refresh token
curl -X POST http://localhost:3000/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refresh_token":"your-refresh-token"}'
```

---

## Running Migrations

```bash
# In apps/api directory
bun run migrate

# Check migration status
bun run migrate:status

# Rollback if needed
bun run migrate:undo
```

---

## Next Steps

After implementing the backend:

1. Test all auth endpoints with Postman or curl
2. Verify database migrations completed successfully
3. Check that user_id columns exist in all target tables
4. Test OTP email delivery
5. Verify token generation and validation
6. Test token refresh mechanism
7. Prepare for frontend integration

For frontend implementation details, see [supabase-auth-frontend.md](./supabase-auth-frontend.md).

For complete implementation guide, see [supabase-auth-implementation-guide.md](./supabase-auth-implementation-guide.md).
