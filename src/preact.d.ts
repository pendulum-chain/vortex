import JSX = preact.JSX;

type SetStateAction<S> = S | ((prevState: S) => S);

type Dispatch<A> = (action: A) => void;

type ReactText = string | number;
type ReactChild = ReactElement | ReactText;

type ReactNodeArray = Array<ReactNode>;
type ReactFragment = object | ReactNodeArray;

type ReactNode = ReactChild | ReactFragment | ReactPortal | boolean | null | undefined;

type Dict<T = unknown> = Record<string | number | symbol, T>;
type AnyFn = (...args: any) => any;
