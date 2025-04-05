# Refactoring Plan for RampForm and Swap Components

## Current State Analysis

The current implementation has several issues:

1. **High Component Complexity**: The RampForm component (`frontend/src/pages/ramp-form/index.tsx`) and Swap component (`frontend/src/components/Swap/index.tsx`) contain too much business logic, state management, and UI rendering.

2. **Tangled Concerns**: State management, business logic, and UI rendering are intertwined, making the code difficult to maintain.

3. **Limited Reusability**: The current structure makes it difficult to reuse logic across different components.

4. **Testing Challenges**: Complex components with multiple responsibilities are difficult to test properly.

5. **Lack of Clear Interfaces**: Components communicate through a mix of props, context, and direct store access without clear interfaces.

## SOLID Principles Application

### Single Responsibility Principle (SRP)
- Each store should manage a single aspect of the application state
- Each hook should handle a single piece of business logic
- Components should focus on rendering and user interaction

### Open/Closed Principle (OCP)
- Stores and hooks should be designed to be extended without modifying existing code
- Use composition to add new behavior rather than modifying existing code

### Liskov Substitution Principle (LSP)
- Ensure consistent interfaces for related hooks and stores
- Child components should be able to substitute parent components without breaking the application

### Interface Segregation Principle (ISP)
- Create small, focused interfaces for hooks and stores
- Avoid forcing components to depend on methods they don't use

### Dependency Inversion Principle (DIP)
- Components should depend on abstractions, not concrete implementations
- Use dependency injection to provide implementations

## Proposed Zustand Store Structure

### 1. Quote Store (`useQuoteStore.ts`)
```typescript
interface QuoteState {
  quote: QuoteEndpoints.QuoteResponse | undefined;
  loading: boolean;
  error: string | null;
  fetchQuote: (params: QuoteParams) => Promise<void>;
  reset: () => void;
}
```

### 2. Ramp Form Store (`useRampFormStore.ts`)
```typescript
interface RampFormState {
  form: UseFormReturn<SwapFormValues>;
  fromAmount: Big.Big | undefined;
  fromAmountString: string;
  from: OnChainToken;
  to: FiatToken;
  taxId: string | undefined;
  pixId: string | undefined;
  setFrom: (token: OnChainToken) => void;
  setTo: (token: FiatToken) => void;
  onFromChange: (amount: string) => void;
  onToChange: (amount: string) => void;
  reset: () => void;
}
```

### 3. Token Selection Store (`useTokenStore.ts`)
```typescript
interface TokenSelectionState {
  isTokenSelectModalVisible: boolean;
  tokenSelectModalType: 'from' | 'to' | null;
  openTokenSelectModal: (type: 'from' | 'to') => void;
  closeTokenSelectModal: () => void;
}
```

### 4. Ramp Process Store (`useRampProcessStore.ts`) - Already exists, may need enhancements
```typescript
interface RampProcessState {
  currentPhase: 'init' | 'quote' | 'validation' | 'summary' | 'executing' | 'complete' | 'failed';
  executionInput: RampExecutionInput | null;
  isOfframpSummaryDialogVisible: boolean;
  setCurrentPhase: (phase: string) => void;
  setRampExecutionInput: (input: RampExecutionInput) => void;
  setRampSummaryVisible: (visible: boolean) => void;
  reset: () => void;
}
```

## Proposed Custom Hooks Structure

### 1. Quote Service Hook (`useQuoteService.ts`)
```typescript
const useQuoteService = () => {
  const { fetchQuote } = useQuoteStore();

  const getQuote = useCallback(async (params) => {
    // Logic for preparing quote request and handling response
  }, [fetchQuote]);

  return { getQuote };
};
```

### 2. Ramp Validation Hook (`useRampValidation.ts`)
```typescript
const useRampValidation = () => {
  const { fromAmount } = useRampFormStore();
  const { quote } = useQuoteStore();
  const { address } = useVortexAccount();
  const userInputTokenBalance = useOnchainTokenBalance({ token: fromToken });

  const getCurrentErrorMessage = useCallback(() => {
    // Validation logic extracted from RampForm
  }, [fromAmount, quote, address, userInputTokenBalance]);

  return { getCurrentErrorMessage, isValid: !getCurrentErrorMessage() };
};
```

### 3. Token Selection Hook (`useTokenSelection.ts`)
```typescript
const useTokenSelection = () => {
  const { from, to, setFrom, setTo } = useRampFormStore();
  const { openTokenSelectModal } = useTokenStore();

  const handleTokenSelect = useCallback((type, token) => {
    if (type === 'from') setFrom(token);
    else setTo(token);
  }, [setFrom, setTo]);

  return { from, to, handleTokenSelect, openTokenSelectModal };
};
```

### 4. Ramp Submission Hook (`useRampSubmission.ts`)
```typescript
const useRampSubmission = () => {
  const { fromAmount, from, to, taxId, pixId } = useRampFormStore();
  const { quote } = useQuoteStore();
  const { address } = useVortexAccount();
  const { selectedNetwork } = useNetwork();
  const { setRampExecutionInput, setRampSummaryVisible } = useRampProcessStore();

  const prepareSubmission = useCallback(() => {
    // Logic for preparing submission data
    // Creates ephemerals, prepares execution input
  }, [fromAmount, from, to, quote, address, selectedNetwork, taxId, pixId]);

  const onSwapConfirm = useCallback(() => {
    const executionInput = prepareSubmission();
    setRampExecutionInput(executionInput);
    setRampSummaryVisible(true);
    // Additional logic
  }, [prepareSubmission, setRampExecutionInput, setRampSummaryVisible]);

  return { onSwapConfirm };
};
```

### 5. Ramp Navigation Hook (`useRampNavigation.ts`)
```typescript
const useRampNavigation = () => {
  const { currentPhase } = useRampProcessStore();

  const getComponent = useCallback(() => {
    switch (currentPhase) {
      case 'complete':
        return <SuccessPage />;
      case 'failed':
        return <FailurePage />;
      case 'executing':
        return <ProgressPage />;
      default:
        return <RampForm />;
    }
  }, [currentPhase]);

  return { getComponent };
};
```

## Refactored Component Structure

### 1. RampForm Component (Simplified)
```typescript
export const RampForm = () => {
  const { getCurrentErrorMessage } = useRampValidation();
  const { onSwapConfirm } = useRampSubmission();
  const { from, to } = useTokenSelection();
  const { quote, loading: quoteLoading } = useQuoteStore();
  const { fromAmount, form } = useRampFormStore();
  const { isOfframpSummaryDialogVisible } = useRampProcessStore();

  // Minimal component logic, mostly delegated to hooks

  return (
    <main>
      <OfframpSummaryDialog />
      <SigningBox />
      {offrampKycStarted ? (
        <PIXKYCForm />
      ) : (
        <Swap
          form={form}
          from={from}
          to={to}
          fromAmount={fromAmount}
          toAmount={quote?.outputAmount ? Big(quote.outputAmount) : undefined}
          exchangeRate={quote ? Number(quote.outputAmount) / Number(quote.inputAmount) : 0}
          getCurrentErrorMessage={getCurrentErrorMessage}
          onSwapConfirm={onSwapConfirm}
        />
      )}
    </main>
  );
};
```

### 2. Swap Component (Simplified)
```typescript
export const Swap = (props) => {
  // Significantly reduced props and internal state
  // Focus on rendering and user interaction

  return (
    <FormProvider {...props.form}>
      <motion.form>
        <h1>Sell Crypto</h1>
        <LabeledInput label="You sell" Input={WithdrawNumericInput} />
        <LabeledInput label="You receive" Input={ReceiveNumericInput} />
        <ErrorDisplay message={props.getCurrentErrorMessage()} />
        <FeeCollapse />
        <BenefitsList />
        <TermsAndConditions />
        <ActionButtons onConfirm={props.onSwapConfirm} />
        <PoweredBy />
      </motion.form>
    </FormProvider>
  );
};
```

## Implementation Steps

1. **Create Zustand Stores**
   - Start by creating the store files with basic state and actions
   - Ensure proper typings for all state and actions

2. **Extract Business Logic to Hooks**
   - Move logic from components to corresponding hooks
   - Ensure hooks have clear interfaces and single responsibilities

3. **Refactor Component Props**
   - Simplify component props interfaces
   - Use composition to reduce prop drilling

4. **Update Component Logic**
   - Remove logic that's been moved to hooks and stores
   - Connect components to hooks and stores

5. **Testing**
   - Write unit tests for hooks and stores
   - Add integration tests for key user flows

6. **Documentation**
   - Document the purpose of each store and hook
   - Add comments explaining complex logic

## Benefits of the Refactored Architecture

1. **Improved Maintainability**: Smaller, focused components, hooks, and stores are easier to understand and maintain.

2. **Enhanced Testability**: Business logic in hooks and state in stores can be tested independently.

3. **Better Reusability**: Hooks and stores can be reused across different components and features.

4. **Clearer Responsibilities**: Each piece of code has a well-defined responsibility.

5. **Easier Onboarding**: New team members can understand the codebase more quickly with clear separation of concerns.

6. **More Robust Error Handling**: Centralized error handling in hooks and stores improves user experience.

7. **Optimized Performance**: State updates can be more targeted, reducing unnecessary re-renders.

## Potential Challenges

1. **Initial Complexity**: The refactoring process adds initial complexity before simplification.

2. **Learning Curve**: Team members need to understand the new architecture pattern.

3. **Migration Strategy**: Determining how to gradually refactor without breaking existing functionality.

4. **Testing Coverage**: Ensuring all edge cases are still covered in the refactored code.

## Conclusion

This refactoring plan provides a comprehensive approach to restructuring the RampForm and Swap components to follow SOLID principles. By extracting state management to Zustand stores and business logic to custom hooks, we create a more maintainable, testable, and flexible codebase.