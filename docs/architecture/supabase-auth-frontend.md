# Supabase Auth - Frontend Implementation

This document details the frontend implementation for Supabase Auth integration in Pendulum Pay.

## Table of Contents
1. [Supabase Client Setup](#supabase-client-setup)
2. [Auth Service Layer](#auth-service-layer)
3. [API Service](#api-service)
4. [State Machine Updates](#state-machine-updates)
5. [UI Components](#ui-components)
6. [Token Management Hook](#token-management-hook)

---

## 1. Supabase Client Setup

### Installation
```bash
# In apps/frontend
bun add @supabase/supabase-js
```

### Configuration

**File**: `apps/frontend/src/config/supabase.ts`

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
```

### Environment Variables

**Add to `.env.example`**:
```bash
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
VITE_API_URL=http://localhost:3000/api/v1
```

---

## 2. Auth Service Layer

**File**: `apps/frontend/src/services/auth.ts`

```typescript
import { supabase } from '../config/supabase';

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  user_id: string;
}

export class AuthService {
  private static readonly ACCESS_TOKEN_KEY = 'vortex_access_token';
  private static readonly REFRESH_TOKEN_KEY = 'vortex_refresh_token';
  private static readonly USER_ID_KEY = 'vortex_user_id';

  /**
   * Store tokens in localStorage
   */
  static storeTokens(tokens: AuthTokens): void {
    localStorage.setItem(this.ACCESS_TOKEN_KEY, tokens.access_token);
    localStorage.setItem(this.REFRESH_TOKEN_KEY, tokens.refresh_token);
    localStorage.setItem(this.USER_ID_KEY, tokens.user_id);
  }

  /**
   * Get tokens from localStorage
   */
  static getTokens(): AuthTokens | null {
    const access_token = localStorage.getItem(this.ACCESS_TOKEN_KEY);
    const refresh_token = localStorage.getItem(this.REFRESH_TOKEN_KEY);
    const user_id = localStorage.getItem(this.USER_ID_KEY);

    if (!access_token || !refresh_token || !user_id) {
      return null;
    }

    return { access_token, refresh_token, user_id };
  }

  /**
   * Clear tokens from localStorage
   */
  static clearTokens(): void {
    localStorage.removeItem(this.ACCESS_TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_TOKEN_KEY);
    localStorage.removeItem(this.USER_ID_KEY);
  }

  /**
   * Check if user is authenticated
   */
  static isAuthenticated(): boolean {
    return this.getTokens() !== null;
  }

  /**
   * Get user ID
   */
  static getUserId(): string | null {
    return localStorage.getItem(this.USER_ID_KEY);
  }

  /**
   * Handle tokens from URL (for magic link callback)
   */
  static handleUrlTokens(): AuthTokens | null {
    const params = new URLSearchParams(window.location.hash.substring(1));
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');

    if (access_token && refresh_token) {
      return { access_token, refresh_token, user_id: '' };
    }

    return null;
  }

  /**
   * Refresh access token
   */
  static async refreshAccessToken(): Promise<AuthTokens | null> {
    const tokens = this.getTokens();
    if (!tokens) {
      return null;
    }

    try {
      const { data, error } = await supabase.auth.refreshSession({
        refresh_token: tokens.refresh_token,
      });

      if (error || !data.session) {
        this.clearTokens();
        return null;
      }

      const newTokens: AuthTokens = {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        user_id: data.user.id,
      };

      this.storeTokens(newTokens);
      return newTokens;
    } catch (error) {
      console.error('Token refresh failed:', error);
      this.clearTokens();
      return null;
    }
  }

  /**
   * Setup auto-refresh (refresh 5 minutes before expiry)
   */
  static setupAutoRefresh(): () => void {
    const REFRESH_INTERVAL = 55 * 60 * 1000; // 55 minutes

    const intervalId = setInterval(async () => {
      if (this.isAuthenticated()) {
        await this.refreshAccessToken();
      }
    }, REFRESH_INTERVAL);

    return () => clearInterval(intervalId);
  }

  /**
   * Sign out
   */
  static async signOut(): Promise<void> {
    await supabase.auth.signOut();
    this.clearTokens();
  }
}
```

---

## 3. API Service

**File**: `apps/frontend/src/services/api/auth.api.ts`

```typescript
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

export interface CheckEmailResponse {
  exists: boolean;
  action: 'signin' | 'signup';
}

export interface VerifyOTPResponse {
  success: boolean;
  access_token: string;
  refresh_token: string;
  user_id: string;
}

export class AuthAPI {
  /**
   * Check if email exists
   */
  static async checkEmail(email: string): Promise<CheckEmailResponse> {
    const response = await axios.get(`${API_BASE_URL}/auth/check-email`, {
      params: { email },
    });
    return response.data;
  }

  /**
   * Request OTP
   */
  static async requestOTP(email: string): Promise<void> {
    await axios.post(`${API_BASE_URL}/auth/request-otp`, {
      email,
    });
  }

  /**
   * Verify OTP
   */
  static async verifyOTP(email: string, token: string): Promise<VerifyOTPResponse> {
    const response = await axios.post(`${API_BASE_URL}/auth/verify-otp`, {
      email,
      token,
    });
    return response.data;
  }

  /**
   * Refresh token
   */
  static async refreshToken(refreshToken: string): Promise<VerifyOTPResponse> {
    const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
      refresh_token: refreshToken,
    });
    return response.data;
  }
}
```

---

## 4. State Machine Updates

### Update RampContext

**File**: `apps/frontend/src/machines/types.ts`

```typescript
export interface RampContext {
  // ... existing fields
  
  // New auth-related fields
  userEmail?: string;
  userId?: string;
  isAuthenticated: boolean;
  authTokens?: {
    access_token: string;
    refresh_token: string;
  };
  
  // ... rest of fields
}
```

### Update Initial Context

**File**: `apps/frontend/src/machines/ramp.machine.ts`

```typescript
const initialRampContext: RampContext = {
  // ... existing fields
  userEmail: undefined,
  userId: undefined,
  isAuthenticated: false,
  authTokens: undefined,
  // ... rest
};
```

### Add Auth Events

**File**: `apps/frontend/src/machines/ramp.machine.ts`

```typescript
export type RampMachineEvents =
  // ... existing events
  | { type: "ENTER_EMAIL"; email: string }
  | { type: "EMAIL_VERIFIED" }
  | { type: "OTP_SENT" }
  | { type: "VERIFY_OTP"; code: string }
  | { type: "AUTH_SUCCESS"; tokens: { access_token: string; refresh_token: string; user_id: string } }
  | { type: "AUTH_ERROR"; error: string }
  // ... rest of events
```

### Create Auth Actors

**File**: `apps/frontend/src/machines/actors/auth.actor.ts`

```typescript
import { AuthAPI } from '../../services/api/auth.api';
import { RampContext } from '../types';

export const checkEmailActor = async ({ context }: { context: RampContext }) => {
  if (!context.userEmail) {
    throw new Error('Email is required');
  }

  const result = await AuthAPI.checkEmail(context.userEmail);
  return result;
};

export const requestOTPActor = async ({ context }: { context: RampContext }) => {
  if (!context.userEmail) {
    throw new Error('Email is required');
  }

  await AuthAPI.requestOTP(context.userEmail);
  return { success: true };
};

export const verifyOTPActor = async ({
  input,
}: {
  input: { email: string; code: string };
}) => {
  const result = await AuthAPI.verifyOTP(input.email, input.code);
  return result;
};
```

### Add Auth States to Machine

**File**: `apps/frontend/src/machines/ramp.machine.ts`

```typescript
export const rampMachine = setup({
  // ... existing setup
  actors: {
    // ... existing actors
    checkEmail: fromPromise(checkEmailActor),
    requestOTP: fromPromise(requestOTPActor),
    verifyOTP: fromPromise(verifyOTPActor),
  },
}).createMachine({
  // ... existing config
  states: {
    // ... existing states
    
    QuoteReady: {
      on: {
        CONFIRM: {
          actions: assign({
            chainId: ({ event }) => event.input.chainId,
            executionInput: ({ event }) => event.input.executionInput,
            initializeFailedMessage: undefined,
            rampDirection: ({ event }) => event.input.rampDirection
          }),
          target: "CheckAuth"
        }
      }
    },
    
    CheckAuth: {
      always: [
        {
          guard: ({ context }) => context.isAuthenticated,
          target: "RampRequested"
        },
        {
          target: "EnterEmail"
        }
      ]
    },
    
    EnterEmail: {
      on: {
        ENTER_EMAIL: {
          actions: assign({
            userEmail: ({ event }) => event.email
          }),
          target: "CheckingEmail"
        }
      }
    },
    
    CheckingEmail: {
      invoke: {
        src: "checkEmail",
        input: ({ context }) => ({ context }),
        onDone: {
          target: "RequestingOTP"
        },
        onError: {
          target: "EnterEmail"
        }
      }
    },
    
    RequestingOTP: {
      invoke: {
        src: "requestOTP",
        input: ({ context }) => ({ context }),
        onDone: {
          target: "EnterOTP"
        },
        onError: {
          target: "EnterEmail"
        }
      }
    },
    
    EnterOTP: {
      on: {
        VERIFY_OTP: {
          target: "VerifyingOTP"
        }
      }
    },
    
    VerifyingOTP: {
      invoke: {
        src: "verifyOTP",
        input: ({ context, event }) => ({
          email: context.userEmail!,
          code: (event as any).code
        }),
        onDone: {
          actions: assign({
            authTokens: ({ event }) => ({
              access_token: event.output.access_token,
              refresh_token: event.output.refresh_token
            }),
            userId: ({ event }) => event.output.user_id,
            isAuthenticated: true
          }),
          target: "RampRequested"
        },
        onError: {
          target: "EnterOTP"
        }
      }
    },
    
    // ... rest of states
  }
});
```

---

## 5. UI Components

### Email Entry Step

**File**: `apps/frontend/src/components/widget-steps/AuthEmailStep/index.tsx`

```typescript
import React, { useState } from 'react';
import { useActor } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import type { rampMachine } from '../../../machines/ramp.machine';

interface AuthEmailStepProps {
  actorRef: ActorRefFrom<typeof rampMachine>;
}

export function AuthEmailStep({ actorRef }: AuthEmailStepProps) {
  const [state, send] = useActor(actorRef);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    setError('');
    send({ type: 'ENTER_EMAIL', email });
  };

  const isLoading = state.matches('CheckingEmail') || state.matches('RequestingOTP');

  return (
    <div className="auth-email-step">
      <h2>Enter Your Email</h2>
      <p>We'll send you a one-time code to verify your identity</p>
      
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="email">Email Address</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="input"
            autoFocus
            disabled={isLoading}
          />
          {error && <p className="error">{error}</p>}
        </div>
        
        <button type="submit" className="btn btn-primary" disabled={isLoading}>
          {isLoading ? 'Sending...' : 'Continue'}
        </button>
      </form>
    </div>
  );
}
```

### OTP Entry Step

**File**: `apps/frontend/src/components/widget-steps/AuthOTPStep/index.tsx`

```typescript
import React, { useState, useEffect, useRef } from 'react';
import { useActor } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import type { rampMachine } from '../../../machines/ramp.machine';

interface AuthOTPStepProps {
  actorRef: ActorRefFrom<typeof rampMachine>;
}

export function AuthOTPStep({ actorRef }: AuthOTPStepProps) {
  const [state, send] = useActor(actorRef);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleChange = (index: number, value: string) => {
    if (value && !/^\d$/.test(value)) {
      return;
    }

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits entered
    if (newOtp.every(digit => digit !== '') && index === 5) {
      const code = newOtp.join('');
      send({ type: 'VERIFY_OTP', code });
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text');
    const digits = pastedData.match(/\d/g);
    
    if (digits && digits.length === 6) {
      setOtp(digits);
      inputRefs.current[5]?.focus();
      send({ type: 'VERIFY_OTP', code: digits.join('') });
    }
  };

  useEffect(() => {
    if (state.matches('EnterOTP') && state.context.errorMessage) {
      setError(state.context.errorMessage);
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    }
  }, [state]);

  const isVerifying = state.matches('VerifyingOTP');

  return (
    <div className="auth-otp-step">
      <h2>Enter Verification Code</h2>
      <p>We sent a 6-digit code to {state.context.userEmail}</p>
      
      <div className="otp-inputs" onPaste={handlePaste}>
        {otp.map((digit, index) => (
          <input
            key={index}
            ref={el => inputRefs.current[index] = el}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            className="otp-input"
            autoFocus={index === 0}
            disabled={isVerifying}
          />
        ))}
      </div>
      
      {error && <p className="error">{error}</p>}
      
      {isVerifying && <p className="verifying">Verifying...</p>}
      
      <button
        onClick={() => send({ type: 'ENTER_EMAIL', email: state.context.userEmail! })}
        className="btn btn-link"
        disabled={isVerifying}
      >
        Use a different email
      </button>
    </div>
  );
}
```

### Styling (Optional)

**File**: `apps/frontend/src/components/widget-steps/AuthEmailStep/styles.css`

```css
.auth-email-step {
  max-width: 400px;
  margin: 0 auto;
  padding: 2rem;
}

.auth-email-step h2 {
  margin-bottom: 0.5rem;
  font-size: 1.5rem;
  font-weight: 600;
}

.auth-email-step p {
  color: #666;
  margin-bottom: 1.5rem;
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
}

.form-group .input {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 0.5rem;
  font-size: 1rem;
}

.form-group .input:focus {
  outline: none;
  border-color: #007bff;
}

.form-group .error {
  color: #dc3545;
  font-size: 0.875rem;
  margin-top: 0.5rem;
}
```

**File**: `apps/frontend/src/components/widget-steps/AuthOTPStep/styles.css`

```css
.auth-otp-step {
  max-width: 400px;
  margin: 0 auto;
  padding: 2rem;
  text-align: center;
}

.auth-otp-step h2 {
  margin-bottom: 0.5rem;
  font-size: 1.5rem;
  font-weight: 600;
}

.auth-otp-step p {
  color: #666;
  margin-bottom: 1.5rem;
}

.otp-inputs {
  display: flex;
  gap: 0.5rem;
  justify-content: center;
  margin-bottom: 1rem;
}

.otp-input {
  width: 3rem;
  height: 3rem;
  text-align: center;
  font-size: 1.5rem;
  font-weight: 600;
  border: 2px solid #ddd;
  border-radius: 0.5rem;
  transition: border-color 0.2s;
}

.otp-input:focus {
  outline: none;
  border-color: #007bff;
}

.otp-input:disabled {
  background-color: #f5f5f5;
  cursor: not-allowed;
}

.error {
  color: #dc3545;
  font-size: 0.875rem;
  margin-bottom: 1rem;
}

.verifying {
  color: #007bff;
  font-size: 0.875rem;
  margin-bottom: 1rem;
}

.btn-link {
  background: none;
  border: none;
  color: #007bff;
  text-decoration: underline;
  cursor: pointer;
  font-size: 0.875rem;
}

.btn-link:hover {
  color: #0056b3;
}

.btn-link:disabled {
  color: #999;
  cursor: not-allowed;
}
```

### Update Widget Step Router

**File**: `apps/frontend/src/components/widget-steps/index.tsx`

```typescript
import { useActor } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import type { rampMachine } from '../../machines/ramp.machine';
import { AuthEmailStep } from './AuthEmailStep';
import { AuthOTPStep } from './AuthOTPStep';
// ... other imports

export function WidgetStepRouter({ actorRef }: { actorRef: ActorRefFrom<typeof rampMachine> }) {
  const [state] = useActor(actorRef);
  
  if (state.matches('EnterEmail') || state.matches('CheckingEmail') || state.matches('RequestingOTP')) {
    return <AuthEmailStep actorRef={actorRef} />;
  }
  
  if (state.matches('EnterOTP') || state.matches('VerifyingOTP')) {
    return <AuthOTPStep actorRef={actorRef} />;
  }
  
  // ... rest of step routing
}
```

---

## 6. Token Management Hook

**File**: `apps/frontend/src/hooks/useAuthTokens.ts`

```typescript
import { useEffect, useCallback } from 'react';
import { AuthService } from '../services/auth';
import { useActor } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import type { rampMachine } from '../machines/ramp.machine';

export function useAuthTokens(actorRef: ActorRefFrom<typeof rampMachine>) {
  const [state, send] = useActor(actorRef);

  // Check for tokens in URL on mount (magic link callback)
  useEffect(() => {
    const urlTokens = AuthService.handleUrlTokens();
    if (urlTokens) {
      import('../config/supabase').then(({ supabase }) => {
        supabase.auth.getSession().then(({ data }) => {
          if (data.session) {
            const tokens = {
              access_token: data.session.access_token,
              refresh_token: data.session.refresh_token,
              user_id: data.session.user.id,
            };
            
            AuthService.storeTokens(tokens);
            send({ type: 'AUTH_SUCCESS', tokens });
            
            // Clean URL
            window.history.replaceState({}, '', window.location.pathname);
          }
        });
      });
    }
  }, [send]);

  // Setup auto-refresh on mount
  useEffect(() => {
    const cleanup = AuthService.setupAutoRefresh();
    return cleanup;
  }, []);

  // Restore session from localStorage on mount
  useEffect(() => {
    const tokens = AuthService.getTokens();
    if (tokens && !state.context.isAuthenticated) {
      send({
        type: 'AUTH_SUCCESS',
        tokens: {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          user_id: tokens.user_id,
        },
      });
    }
  }, [send, state.context.isAuthenticated]);

  const signOut = useCallback(async () => {
    await AuthService.signOut();
    send({ type: 'RESET_RAMP' });
  }, [send]);

  return {
    isAuthenticated: state.context.isAuthenticated,
    userId: state.context.userId,
    userEmail: state.context.userEmail,
    signOut,
  };
}
```

### Usage in Main App

**File**: `apps/frontend/src/App.tsx` or `apps/frontend/src/components/Widget.tsx`

```typescript
import { useAuthTokens } from './hooks/useAuthTokens';

function Widget() {
  const actorRef = useRampMachine(); // Your existing machine setup
  const { isAuthenticated, userId, signOut } = useAuthTokens(actorRef);

  return (
    <div className="widget">
      {isAuthenticated && (
        <div className="user-info">
          <span>User ID: {userId}</span>
          <button onClick={signOut}>Sign Out</button>
        </div>
      )}
      
      <WidgetStepRouter actorRef={actorRef} />
    </div>
  );
}
```

---

## Testing Frontend Components

### Unit Tests Example

**File**: `apps/frontend/src/components/widget-steps/AuthEmailStep/AuthEmailStep.test.tsx`

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { AuthEmailStep } from './index';
import { createActor } from 'xstate';
import { rampMachine } from '../../../machines/ramp.machine';

describe('AuthEmailStep', () => {
  it('renders email input', () => {
    const actor = createActor(rampMachine).start();
    render(<AuthEmailStep actorRef={actor} />);
    
    expect(screen.getByLabelText('Email Address')).toBeInTheDocument();
  });

  it('shows error for invalid email', () => {
    const actor = createActor(rampMachine).start();
    render(<AuthEmailStep actorRef={actor} />);
    
    const input = screen.getByLabelText('Email Address');
    const button = screen.getByRole('button', { name: /continue/i });
    
    fireEvent.change(input, { target: { value: 'invalid' } });
    fireEvent.click(button);
    
    expect(screen.getByText('Please enter a valid email address')).toBeInTheDocument();
  });

  it('submits valid email', () => {
    const actor = createActor(rampMachine).start();
    const sendSpy = jest.spyOn(actor, 'send');
    
    render(<AuthEmailStep actorRef={actor} />);
    
    const input = screen.getByLabelText('Email Address');
    const button = screen.getByRole('button', { name: /continue/i });
    
    fireEvent.change(input, { target: { value: 'test@example.com' } });
    fireEvent.click(button);
    
    expect(sendSpy).toHaveBeenCalledWith({
      type: 'ENTER_EMAIL',
      email: 'test@example.com',
    });
  });
});
```

---

## Next Steps

After implementing the frontend components:

1. Test email entry and OTP verification flows
2. Verify token storage in localStorage
3. Test auto-refresh mechanism
4. Ensure session persists across page reloads
5. Test error scenarios (invalid OTP, expired code, etc.)
6. Add loading states and user feedback
7. Integrate with backend API endpoints

For backend implementation details, see [supabase-auth-backend.md](./supabase-auth-backend.md).

For step-by-step implementation guide, see [supabase-auth-implementation-guide.md](./supabase-auth-implementation-guide.md).
