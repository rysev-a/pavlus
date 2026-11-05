/**
 * Standard Schema (https://standardschema.dev) types, plus conversion of its
 * issues to form paths. Any library that implements `~standard` works:
 * Zod, Valibot, ArkType, ...
 *
 * @module
 */
import { joinPath } from "./paths.ts";

export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly "~standard": StandardSchemaV1.Props<Input, Output>;
}

export declare namespace StandardSchemaV1 {
  interface Props<Input = unknown, Output = Input> {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (
      value: unknown,
    ) => Result<Output> | Promise<Result<Output>>;
    readonly types?: Types<Input, Output> | undefined;
  }
  type Result<Output> = SuccessResult<Output> | FailureResult;
  interface SuccessResult<Output> {
    readonly value: Output;
    readonly issues?: undefined;
  }
  interface FailureResult {
    readonly issues: ReadonlyArray<Issue>;
  }
  interface Issue {
    readonly message: string;
    readonly path?: ReadonlyArray<PropertyKey | PathSegment> | undefined;
  }
  interface PathSegment {
    readonly key: PropertyKey;
  }
  interface Types<Input = unknown, Output = Input> {
    readonly input: Input;
    readonly output: Output;
  }
}

export function isStandardSchema(x: unknown): x is StandardSchemaV1 {
  return (
    typeof x === "object" &&
    x !== null &&
    typeof (x as StandardSchemaV1)["~standard"]?.validate === "function"
  );
}

/** A plain function schema: returns `{ path: message(s) }` (an empty path is a form-level error), or nothing when valid. */
export type SchemaFn<T> = (
  values: T,
) => SchemaFnResult | Promise<SchemaFnResult>;
export type SchemaFnResult =
  | Readonly<Record<string, string | readonly string[]>>
  | null
  | undefined
  | void;

export function issuePath(issue: StandardSchemaV1.Issue): string {
  return joinPath(
    (issue.path ?? []).map((p) => {
      const k = typeof p === "object" ? p.key : p;
      return typeof k === "symbol" ? String(k) : (k as string | number);
    }),
  );
}
