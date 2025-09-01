# Ramp Components Refactoring

## Overview

This refactoring aims to improve the architecture of the RampForm and Swap components by following SOLID principles. The main goals are:

1. Extract state management into Zustand stores
2. Move business logic to custom hooks
3. Simplify components to focus on rendering and user interaction

## Directory Structure

The refactored code follows this structure:

```
/stores
  /ramp
    useQuoteStore.ts       # Manages quote data
    useQuoteFormStore.ts    # Manages form state
    useTokenStore.ts       # Manages token selection

/hooks
  /ramp
    useRampForm.ts         # Connects React Hook Form with store
    useQuoteService.ts     # Handles quote fetching logic
    useRampValidation.ts   # Handles form validation
    useRampSubmission.ts   # Handles submission process
    useRampNavigation.ts   # Handles navigation between states
    useTokenSelection.ts   # Handles token selection logic

/components
  /Swap
    RefactoredSwap.tsx     # Simplified Swap component

/pages
  /ramp-form
    RefactoredRampForm.tsx # Simplified RampForm component
```

## Key Components

### Stores

- **useQuoteStore**: Manages quote data, loading states, and errors
- **useQuoteFormStore**: Manages form values, token selection, and related state
- **useRampProcessStore** (existing): Enhanced to better handle ramp process flow

### Hooks

- **useRampForm**: Connects React Hook Form with the Zustand store
- **useQuoteService**: Handles quote fetching and processing
- **useRampValidation**: Provides form validation and error messages
- **useRampSubmission**: Handles the submission process
- **useRampNavigation**: Manages navigation between different states
- **useTokenSelection**: Handles token selection and modal state

### Components

- **RefactoredSwap**: Simplified component focused on rendering the swap form
- **RefactoredRampForm**: Top-level component that uses hooks and stores

## How to Use

### Using the Form Store and Hook

```tsx
// Get form state and methods
const { form, fromAmount, from, to } = useRampForm();

// Use form in your component
<FormProvider {...form}>
  <input {...form.register('fromAmount')} />
</FormProvider>
```

### Using the Quote Service

```tsx
// Get quote data
const { outputAmount, exchangeRate, loading, error } = useQuoteService(fromAmount, from, to);

// Display in your component
<div>{loading ? 'Loading...' : `Exchange rate: ${exchangeRate}`}</div>
```

### Using Validation

```tsx
// Get validation state
const { getCurrentErrorMessage, initializeFailedMessage } = useRampValidation();

// Display errors
<p className="error">{getCurrentErrorMessage()}</p>
```

### Handling Submission

```tsx
// Get submission handlers
const { onSwapConfirm, handleOfframpSubmit } = useRampSubmission();

// Use in your component
<button onClick={onSwapConfirm}>Confirm</button>
```

## Benefits of This Architecture

1. **Separation of Concerns**: Each piece of code has a clear responsibility
2. **Testability**: Business logic can be tested independently
3. **Reusability**: Hooks and stores can be reused across components
4. **Maintainability**: Smaller, focused modules are easier to understand and update
5. **Performance**: More granular updates to avoid unnecessary re-renders

## Migration Path

1. Create the stores and hooks
2. Create refactored components that use the new hooks and stores
3. Test the refactored components
4. Gradually replace the old components with the refactored ones
5. Remove the old code once the migration is complete

## Further Improvements

1. Add comprehensive tests for all hooks and stores
2. Enhance type safety for events and parameters
3. Add more detailed documentation for each hook and store
4. Consider splitting larger hooks into smaller, more focused ones