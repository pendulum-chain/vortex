# Supabase Auth Implementation Guide

Complete step-by-step guide for implementing Supabase Auth in Pendulum Pay.

## Overview

This guide walks you through implementing email-based authentication (OTP/Magic Link) using Supabase Auth, linking users to existing entities, and integrating the auth flow into the widget.

**Related Documents:**
- [Backend Implementation](./supabase-auth-backend.md)
- [Frontend Implementation](./supabase-auth-frontend.md)
- [Main Architecture](./supabase-auth-integration.md)

---

## Implementation Phases

### Phase 1: Backend Foundation ✅

**Estimated Time**: 2-3 hours

#### 1.1 Install Dependencies

```bash
cd apps/api
bun add @supabase/supabase-js
```

#### 1.2 Configure Supabase Client

1. Create `apps/api/src/config/supabase.ts`
2. Update `apps/api/src/config/vars.ts` with Supabase env vars
3. Add to `.env`:
   ```
   SUPABASE_URL=your-url
   SUPABASE_ANON_KEY=your-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-key
   ```

#### 1.3 Create Database Migration

1. Create `apps/api/src/database/migrations/019-add-user-id-to-entities.ts`
2. Run migration: `bun run migrate`
3. Verify columns added: `psql -d your_db -c "\d+ quote_tickets"`

**Acceptance Criteria**:
- [x] Supabase SDK installed
- [x] Config file created
- [x] Migration runs without errors
- [x] All 4 tables have `user_id` column
- [x] Indexes created successfully

#### 1.4 Update Models

1. Update `apps/api/src/models/quoteTicket.model.ts`
2. Update `apps/api/src/models/rampState.model.ts`
3. Update `apps/api/src/models/taxId.model.ts`
4. Create `apps/api/src/models/kycLevel2.model.ts` (if not exists)
5. Update `apps/api/src/models/index.ts`

**Acceptance Criteria**:
- [x] All models have `userId` field
- [x] TypeScript types updated
- [x] KycLevel2 model created and exported

#### 1.5 Create Auth Service

1. Create `apps/api/src/api/services/auth/supabase.service.ts`
2. Create `apps/api/src/api/services/auth/index.ts`

**Acceptance Criteria**:
- [x] Service methods implemented
- [x] Error handling in place
- [x] TypeScript types correct

#### 1.6 Create Auth Controller

1. Create `apps/api/src/api/controllers/auth.controller.ts`
2. Implement all 5 endpoints

**Acceptance Criteria**:
- [x] All controller methods implemented
- [x] Input validation added
- [x] Error responses handled

#### 1.7 Create Auth Routes

1. Create `apps/api/src/api/routes/v1/auth.route.ts`
2. Update `apps/api/src/api/routes/v1/index.ts`

**Acceptance Criteria**:
- [x] Routes registered
- [x] All endpoints accessible

#### 1.8 Test Backend

```bash
# Start API server
bun run dev

# Test endpoints
curl -X GET "http://localhost:3000/api/v1/auth/check-email?email=test@example.com"
curl -X POST http://localhost:3000/api/v1/auth/request-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```

**Acceptance Criteria**:
- [x] Check email endpoint works
- [x] Request OTP sends email
- [x] Verify OTP returns tokens
- [x] Refresh token works
- [x] Verify token validates correctly

---

### Phase 2: Frontend Foundation ✅

**Estimated Time**: 2-3 hours

#### 2.1 Install Dependencies

```bash
cd apps/frontend
bun add @supabase/supabase-js
```

#### 2.2 Configure Supabase Client

1. Create `apps/frontend/src/config/supabase.ts`
2. Add to `.env`:
   ```
   VITE_SUPABASE_URL=your-url
   VITE_SUPABASE_ANON_KEY=your-key
   VITE_API_URL=http://localhost:3000/api/v1
   ```

**Acceptance Criteria**:
- [x] Supabase client configured
- [x] Environment variables set
- [x] Client initializes without errors

#### 2.3 Create Auth Service

1. Create `apps/frontend/src/services/auth.ts`
2. Implement token management methods

**Test**:
```typescript
import { AuthService } from './services/auth';

// Test token storage
const tokens = {
  access_token: 'test',
  refresh_token: 'test',
  user_id: 'test-id'
};
AuthService.storeTokens(tokens);
console.log(AuthService.getTokens()); // Should return tokens
AuthService.clearTokens();
console.log(AuthService.isAuthenticated()); // Should be false
```

**Acceptance Criteria**:
- [x] Tokens stored in localStorage
- [x] Tokens retrieved correctly
- [x] isAuthenticated works
- [x] Clear tokens works

#### 2.4 Create API Service

1. Create `apps/frontend/src/services/api/auth.api.ts`
2. Implement all API methods

**Acceptance Criteria**:
- [x] All API methods implemented
- [x] Axios configured correctly
- [x] Error handling in place

#### 2.5 Test Frontend Services

```typescript
import { AuthAPI } from './services/api/auth.api';

// Test API calls
const result = await AuthAPI.checkEmail('test@example.com');
console.log(result); // { exists: false, action: 'signup' }
```

**Acceptance Criteria**:
- [x] API calls work
- [x] Responses parsed correctly
- [x] Errors handled gracefully

---

### Phase 3: State Machine Integration ✅

**Estimated Time**: 3-4 hours

#### 3.1 Update Context Types

1. Update `apps/frontend/src/machines/types.ts`
2. Add auth-related fields to `RampContext`

**Acceptance Criteria**:
- [x] TypeScript types updated
- [x] No type errors

#### 3.2 Update Initial Context

1. Update `apps/frontend/src/machines/ramp.machine.ts`
2. Add auth fields to `initialRampContext`

**Acceptance Criteria**:
- [x] Initial context includes auth fields
- [x] Default values set correctly

#### 3.3 Add Auth Events

1. Update `RampMachineEvents` type
2. Add all auth-related events

**Acceptance Criteria**:
- [x] All events typed correctly
- [x] No TypeScript errors

#### 3.4 Create Auth Actors

1. Create `apps/frontend/src/machines/actors/auth.actor.ts`
2. Implement `checkEmailActor`, `requestOTPActor`, `verifyOTPActor`

**Acceptance Criteria**:
- [x] All actors implemented
- [x] Error handling in place
- [x] Actors return correct types

#### 3.5 Add Auth States to Machine

1. Update state machine configuration
2. Add new auth states
3. Wire up transitions

**States to Add**:
- `CheckAuth`
- `EnterEmail`
- `CheckingEmail`
- `RequestingOTP`
- `EnterOTP`
- `VerifyingOTP`

**Acceptance Criteria**:
- [x] All states added
- [x] Transitions work correctly
- [x] Guards implemented
- [x] Actions assigned properly

#### 3.6 Test State Machine

```typescript
import { createActor } from 'xstate';
import { rampMachine } from './machines/ramp.machine';

const actor = createActor(rampMachine).start();

// Test auth flow
actor.send({ type: 'CONFIRM', input: { /* ... */ } });
console.log(actor.getSnapshot().value); // Should be 'CheckAuth'

actor.send({ type: 'ENTER_EMAIL', email: 'test@example.com' });
console.log(actor.getSnapshot().value); // Should be 'CheckingEmail'
```

**Acceptance Criteria**:
- [x] State transitions work
- [x] Context updates correctly
- [x] Guards function properly
- [x] Error states reachable

---

### Phase 4: UI Components ✅

**Estimated Time**: 3-4 hours

#### 4.1 Create AuthEmailStep Component

1. Create `apps/frontend/src/components/widget-steps/AuthEmailStep/index.tsx`
2. Add email validation
3. Connect to state machine

**Test**:
- Enter valid email → should proceed
- Enter invalid email → should show error
- Loading state should show while checking

**Acceptance Criteria**:
- [x] Component renders
- [x] Validation works
- [x] Sends events correctly
- [x] Loading states work

#### 4.2 Create AuthOTPStep Component

1. Create `apps/frontend/src/components/widget-steps/AuthOTPStep/index.tsx`
2. Implement 6-digit input
3. Add auto-focus and auto-submit
4. Add paste functionality

**Test**:
- Type 6 digits → auto-submits
- Paste 6 digits → auto-submits
- Invalid code → shows error
- Backspace navigation works

**Acceptance Criteria**:
- [x] Component renders
- [x] 6-digit input works
- [x] Auto-focus works
- [x] Auto-submit works
- [x] Paste works
- [x] Error handling works

#### 4.3 Add Styling

1. Create styles for AuthEmailStep
2. Create styles for AuthOTPStep
3. Ensure responsive design

**Acceptance Criteria**:
- [x] Components styled
- [x] Responsive on mobile
- [x] Matches design system

#### 4.4 Update Widget Router

1. Update `apps/frontend/src/components/widget-steps/index.tsx`
2. Add routing for auth steps

**Acceptance Criteria**:
- [x] Auth steps routed correctly
- [x] Transitions smooth
- [x] No flashing/jumping

---

### Phase 5: Integration & Testing ✅

**Estimated Time**: 4-5 hours

#### 5.1 Create useAuthTokens Hook

1. Create `apps/frontend/src/hooks/useAuthTokens.ts`
2. Implement URL token handling
3. Implement auto-refresh
4. Implement session restoration

**Acceptance Criteria**:
- [x] Hook implemented
- [x] URL tokens handled
- [x] Auto-refresh works
- [x] Session restoration works

#### 5.2 Integrate Hook in App

1. Add hook to main widget component
2. Test with state machine

**Acceptance Criteria**:
- [x] Hook integrated
- [x] Tokens synced with machine
- [x] Sign out works

#### 5.3 Update Ramp Registration

Ensure `userId` is included when creating ramp states and quotes.

**Files to Update**:
- Registration actor
- Quote creation logic
- Ramp state creation

**Acceptance Criteria**:
- [x] userId included in registrations
- [x] userId included in quotes
- [x] Database constraints satisfied

#### 5.4 End-to-End Testing

**Test Scenarios**:

1. **New User Sign-Up Flow**:
   - [ ] User clicks "Continue" on quote
   - [ ] Email step shown
   - [ ] User enters email
   - [ ] OTP sent email received
   - [ ] User enters OTP
   - [ ] Tokens stored
   - [ ] User proceeds to transaction
   - [ ] Ramp created with correct user_id

2. **Existing User Sign-In Flow**:
   - [ ] User enters registered email
   - [ ] OTP sent
   - [ ] User verifies OTP
   - [ ] Session restored
   - [ ] Previous data accessible

3. **Session Persistence**:
   - [ ] User completes auth
   - [ ] Page reloaded
   - [ ] User still authenticated
   - [ ] Can continue transaction

4. **Token Refresh**:
   - [ ] Wait 55 minutes
   - [ ] Tokens refreshed automatically
   - [ ] No user interruption
   - [ ] New tokens stored

5. **Error Scenarios**:
   - [ ] Invalid email shows error
   - [ ] Invalid OTP shows error
   - [ ] Expired OTP handled
   - [ ] Network errors handled
   - [ ] User can retry

#### 5.5 Manual Testing Checklist

- [ ] Email input validation works
- [ ] OTP input auto-focuses
- [ ] OTP auto-submits on 6 digits
- [ ] Paste functionality works
- [ ] Error messages display correctly
- [ ] Loading states show appropriately
- [ ] Back button works
- [ ] Sign out clears session
- [ ] Mobile responsive
- [ ] Accessibility (keyboard navigation, screen readers)

---

## Troubleshooting

### Backend Issues

**Migration Fails**:
```bash
# Check current migration status
bun run migrate:status

# Rollback last migration
bun run migrate:undo

# Run again
bun run migrate
```

**Supabase Connection Error**:
- Verify environment variables set correctly
- Check Supabase project is active
- Verify API keys are valid
- Check network connectivity

**OTP Not Sending**:
- Check Supabase email settings
- Verify email templates configured
- Check SMTP settings in Supabase
- Look for errors in Supabase logs

### Frontend Issues

**Tokens Not Storing**:
```typescript
// Debug localStorage
console.log('Access Token:', localStorage.getItem('vortex_access_token'));
console.log('Refresh Token:', localStorage.getItem('vortex_refresh_token'));
console.log('User ID:', localStorage.getItem('vortex_user_id'));
```

**State Machine Not Transitioning**:
```typescript
// Debug state machine
const actor = createActor(rampMachine, {
  inspect: (event) => {
    console.log('Event:', event);
  }
}).start();
```

**OTP Input Not Working**:
- Check input refs are set correctly
- Verify event handlers attached
- Test paste event separately
- Check browser console for errors

---

## Performance Considerations

### Backend

1. **Rate Limiting** (Future):
   ```typescript
   // Limit OTP requests per email
   // Implement in auth controller
   const MAX_REQUESTS_PER_HOUR = 5;
   ```

2. **Caching**:
   - Cache user existence checks (short TTL)
   - Cache Supabase user lookups

3. **Database Indexes**:
   - Verify indexes created for user_id columns
   - Monitor query performance

### Frontend

1. **Token Refresh**:
   - Refresh 5 minutes before expiry
   - Use debouncing for refresh requests

2. **Component Optimization**:
   - Memoize expensive computations
   - Use React.memo for auth components

3. **Bundle Size**:
   - Supabase SDK adds ~50KB gzipped
   - Consider code splitting if needed

---

## Security Best Practices

### Backend

1. **Environment Variables**:
   - Never commit `.env` file
   - Use different keys for dev/prod
   - Rotate keys periodically

2. **Rate Limiting**:
   - Implement rate limiting on OTP endpoints
   - Prevent brute force attacks

3. **Input Validation**:
   - Validate email format
   - Sanitize all inputs
   - Use TypeScript for type safety

### Frontend

1. **Token Storage**:
   - localStorage is appropriate for implicit flow
   - Clear tokens on sign out
   - Handle token expiry gracefully

2. **XSS Protection**:
   - Sanitize user inputs
   - Use proper Content Security Policy
   - Avoid dangerouslySetInnerHTML

3. **HTTPS Only**:
   - Enforce HTTPS in production
   - Set secure cookie flags

---

## Monitoring & Logging

### Backend Logs to Track

```typescript
// Key events to log
- User sign-up attempts
- OTP send requests
- OTP verification attempts (success/failure)
- Token refresh requests
- Authentication errors
```

### Frontend Analytics

```typescript
// Track user journey
- Email step viewed
- Email submitted
- OTP step viewed
- OTP submitted
- Authentication successful
- Authentication failed
- Session restored
```

---

## Deployment Checklist

### Backend

- [ ] Environment variables set in production
- [ ] Database migrations run
- [ ] Supabase project configured
- [ ] Email templates tested
- [ ] API endpoints tested
- [ ] Error logging configured
- [ ] Rate limiting enabled (if implemented)

### Frontend

- [ ] Environment variables set
- [ ] Build optimized
- [ ] Source maps configured
- [ ] Error tracking enabled (Sentry)
- [ ] Analytics tracking added
- [ ] Mobile testing completed
- [ ] Accessibility testing completed

---

## Rollback Plan

If issues arise in production:

### Immediate Steps

1. **Disable Auth Requirement**:
   ```typescript
   // Temporarily skip auth in state machine
   CheckAuth: {
     always: [{ target: "RampRequested" }]
   }
   ```

2. **Rollback Migration**:
   ```bash
   bun run migrate:undo
   ```

3. **Monitor Errors**:
   - Check Sentry for frontend errors
   - Check backend logs for API errors
   - Check Supabase logs

### Communication

- Notify users of authentication issues
- Provide alternative contact method
- Estimate resolution time

---

## Post-Launch Tasks

1. **Monitor Metrics**:
   - Sign-up conversion rate
   - OTP delivery success rate
   - Token refresh success rate
   - Error rates

2. **Gather Feedback**:
   - User survey on auth experience
   - Support ticket review
   - Session recording analysis

3. **Optimize**:
   - Improve error messages based on user feedback
   - Optimize OTP input UX
   - Reduce friction in auth flow

4. **Future Enhancements**:
   - Magic link alternative to OTP
   - Social login options
   - Biometric authentication
   - Remember device feature

---

## Support Resources

- [Supabase Auth Docs](https://supabase.com/docs/guides/auth)
- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript/auth-signinwithotp)
- [XState Documentation](https://xstate.js.org/docs/)
- Internal: [Backend Docs](./supabase-auth-backend.md)
- Internal: [Frontend Docs](./supabase-auth-frontend.md)

---

## Success Criteria

The implementation is successful when:

- [ ] Users can sign up with email + OTP
- [ ] Users can sign in with email + OTP
- [ ] Sessions persist across page reloads
- [ ] Tokens refresh automatically
- [ ] All entities link to users correctly
- [ ] No data loss during migration
- [ ] Error handling works gracefully
- [ ] Mobile experience is smooth
- [ ] Performance is acceptable (< 500ms for auth actions)
- [ ] Zero critical bugs in production

**Congratulations!** You've successfully implemented Supabase Auth in Pendulum Pay. 🎉
