/** Empty value */
declare type Empty = null | undefined;
/** Falsy value */
declare type Falsy = false | 0 | '' | null | undefined;
/** Object */
declare type Dict<T = unknown> = Record<string | number | symbol, T>;
/** Object value types */
declare type ValueOf<T> = T[keyof T];
/** Keys of type */
declare type KeysOf<T> = (keyof T)[];
/** Keys with values of given type */
declare type KeyOfType<T, U> = {
  [P in keyof T]-?: T[P] extends U ? P : never;
}[keyof T];

/** Value or undefined */
declare type Maybe<T> = T | undefined;
/** Value or null */
declare type Nullable<T> = T | null;
/** Partial or null object */
declare type PartialNull<T> = { [K in keyof T]: T[K] | null };
/** Deep partial object */
declare type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends Array<infer I> ? Array<DeepPartial<I>> : DeepPartial<T[P]>;
};

/** Any function */
declare type Fn = (...args: any[]) => any;
/** Required function */
declare type FnR<TF> = Exclude<TF, undefined>;
/** Is never */
declare type IsNever<T> = [T] extends [never] ? never : T;
