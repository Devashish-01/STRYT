import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/apiClient";

interface QueryState<T> {
  data: T | undefined;
  loading: boolean;
  error: ApiError | null;
  refetch: () => void;
}

export function useQuery<T>(fn: () => Promise<T>, deps: unknown[] = []): QueryState<T> {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fnRef
      .current()
      .then((res) => {
        if (active) setData(res);
      })
      .catch((e) => {
        if (active) setError(e instanceof ApiError ? e : new ApiError(0, { code: "INTERNAL", message: String(e) }));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const cleanup = run();
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, refetch: run };
}

interface MutationState<TArgs, TResult> {
  mutate: (args: TArgs) => Promise<TResult | undefined>;
  pending: boolean;
  error: ApiError | null;
  reset: () => void;
}

export function useMutation<TArgs, TResult>(
  fn: (args: TArgs) => Promise<TResult>,
  opts?: { onSuccess?: (r: TResult) => void; onError?: (e: ApiError) => void }
): MutationState<TArgs, TResult> {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const mutate = useCallback(async (args: TArgs) => {
    setPending(true);
    setError(null);
    try {
      const r = await fnRef.current(args);
      optsRef.current?.onSuccess?.(r);
      return r;
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(0, { code: "INTERNAL", message: String(e) });
      setError(err);
      optsRef.current?.onError?.(err);
      return undefined;
    } finally {
      setPending(false);
    }
  }, []);

  return { mutate, pending, error, reset: () => setError(null) };
}
