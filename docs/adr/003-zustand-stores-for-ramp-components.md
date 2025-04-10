# ADR 003: Refactoring RampForm and Swap Components to Use Zustand Stores and Custom Hooks

## Status

Proposed

## Context

The current implementation of the RampForm and Swap components has several issues:

1. **High Component Complexity**: Both components contain too much business logic, state management, and UI rendering.
2. **Tangled Concerns**: State management, business logic, and UI rendering are intertwined, making the code difficult to maintain.
3. **Limited Reusability**: The current structure makes it difficult to reuse logic across different components.
4. **Testing Challenges**: Complex components with multiple responsibilities are difficult to test properly.
5. **Lack of Clear Interfaces**: Components communicate through a mix of props, context, and direct store access without clear interfaces.

## Decision

We will refactor the RampForm and Swap components by:

1. **Extracting State Management into Zustand Stores**:
   - Create separate stores for different concerns (quotes, form state, token selection, process management)
   - Use Zustand for state management due to its simplicity and flexibility

2. **Moving Business Logic to Custom Hooks**:
   - Create hooks that encapsulate related business logic (validation, submission, navigation)
   - Ensure hooks have clear interfaces and single responsibilities

3. **Simplifying Components**:
   - Reduce component responsibilities to primarily rendering and composition
   - Use hooks for business logic and stores for state management

## Stores Structure

1. **Quote Store** (`useQuoteStore.ts`)
   - Manages quote data, loading states, and errors
   - Provides methods for fetching quotes

2. **Ramp Form Store** (`useRampFormStore.ts`)
   - Manages form values and state
   - Handles token selection and form validation

3. **Ramp Process Store** (`useRampProcessStore.ts`)
   - Manages the ramp process flow
   - Handles the different phases of the ramp process

## Hooks Structure

1. **Quote Service Hook** (`useQuoteService.ts`)
   - Encapsulates quote fetching and processing logic
   - Handles quote-related event tracking

2. **Ramp Validation Hook** (`useRampValidation.ts`)
   - Provides form validation logic
   - Returns validation errors and validation state

3. **Ramp Submission Hook** (`useRampSubmission.ts`)
   - Handles submission process logic
   - Prepares execution input and manages submission state

4. **Ramp Navigation Hook** (`useRampNavigation.ts`)
   - Manages navigation between different ramp stages
   - Returns the appropriate component based on the current phase

## Components Structure

1. **RampForm Component**
   - Top-level component that composes other components
   - Uses hooks for business logic and stores for state

2. **Swap Component**
   - Simplified component focused on rendering the swap form
   - Receives props from parent component and calls provided callbacks

## Consequences

### Positive

1. **Improved Maintainability**: Smaller, focused components, hooks, and stores are easier to understand and maintain.
2. **Enhanced Testability**: Business logic in hooks and state in stores can be tested independently.
3. **Better Reusability**: Hooks and stores can be reused across different components and features.
4. **Clearer Responsibilities**: Each piece of code has a well-defined responsibility.
5. **Easier Onboarding**: New team members can understand the codebase more quickly with clear separation of concerns.
6. **More Robust Error Handling**: Centralized error handling in hooks and stores improves user experience.
7. **Optimized Performance**: State updates can be more targeted, reducing unnecessary re-renders.

### Negative

1. **Initial Development Overhead**: The refactoring process requires significant time and effort upfront.
2. **Learning Curve**: Team members will need to understand the new architecture pattern.
3. **Potential for Over-abstraction**: We must be careful not to create unnecessary abstractions.

## Alternatives Considered

1. **Redux/RTK**: More boilerplate than Zustand, but offers more structured approach. Rejected due to complexity.
2. **Context API Only**: Simpler but less performant and harder to test than Zustand. Rejected for performance reasons.
3. **MobX**: Provides reactive state management but has steeper learning curve. Rejected for simplicity reasons.
4. **Jotai/Recoil**: Atom-based state management which is good for fine-grained updates but more complex for our needs.

## Implementation Plan

1. Create the store files and implement basic state and actions
2. Create hooks that encapsulate business logic
3. Refactor the RampForm component to use the new stores and hooks
4. Refactor the Swap component to be a simpler presentation component
5. Write tests for the new stores and hooks
6. Update documentation to reflect the new architecture