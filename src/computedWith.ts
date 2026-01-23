import { computed, CreateComputedOptions, EffectRef, Injector, isSignal, linkedSignal, signal, Signal, untracked } from '@angular/core';
import { effectWith } from './effectWith';
import { createDistinctOperator, createPairOperator, createSkipOperator, createTakeOperator } from './operators';
import { ExcludeSkipped, SignalLike, SignalValues, SKIPPED } from './types';

export interface ComputedWithOptions {
  injector?: Injector;
  debugName?: string;
}

export type ComputedWithSignal<T> = Signal<T> & {
  /**
   * Filter values based on a predicate.
   *
   * If the initial value is filtered then `SKIPPED` is returned.
   */
  filter<S extends ExcludeSkipped<T>>(predicate: (value: ExcludeSkipped<T>) => value is S): ComputedWithSignal<S | typeof SKIPPED>;
  filter(predicate: (value: ExcludeSkipped<T>) => boolean): ComputedWithSignal<T | typeof SKIPPED>;

  /**
   * Delay value computation by the specified milliseconds.
   *
   * Returns the initial signal value instantly, then debounces future value changes.
   */
  debounce(delay: number): ComputedWithSignal<T>;

  /**
   * Returns `SKIPPED` for the first N computations, then passes through subsequent values as-is.
   */
  skip(n: number): ComputedWithSignal<T | typeof SKIPPED>;

  /**
   * Skip consecutive duplicate values based on a custom equality function.
   *
   * `equal` comparator is **mandatory** because signal values are inherently distinct e.g. `distinct((a, b) => a === b)` is redundant.
   */
  distinct(equal: (a: ExcludeSkipped<T>, b: ExcludeSkipped<T>) => boolean): ComputedWithSignal<T | Extract<T, typeof SKIPPED>>;

  /**
   * Returns value as-is for the first N computations, then retains the N-th value for all subsequent computations.
   */
  take(n: number): ComputedWithSignal<T>;

  /**
   * Map values using a mapping function.
   */
  map<R>(fn: (value: ExcludeSkipped<T>) => R, options?: CreateComputedOptions<R | Extract<T, typeof SKIPPED>>): ComputedWithSignal<R | Extract<T, typeof SKIPPED>>;

  /**
   * Pair each value with its previous value `[current, previous | undefined]`.
   *
   * The first value will be paired with `undefined` (since there is no previous value).
   */
  pair(): ComputedWithSignal<[ExcludeSkipped<T>, ExcludeSkipped<T> | undefined] | Extract<T, typeof SKIPPED>>;

  /**
   * Replace `SKIPPED` with the specified default value.
   *
   * Generally, `default` should be the last operator in the chain to allow for `SKIPPED` to propagate through the previous operators.
   *
   * @param [defaultValue] The value to return instead of `SKIPPED`, defaults to `undefined`.
   */
  default<D = undefined>(defaultValue?: D): ComputedWithSignal<ExcludeSkipped<T> | D>;

  /**
   * Cleanup any internal effects used by the operator chain.
   */
  destroy(): void;
};

/**
 * Creates a `computed` signal pipeline that can be composed with various operators.
 */
export function computedWith<T>(signal: SignalLike<T>): ComputedWithSignal<T>;
export function computedWith<T>(signal: SignalLike<T>, options: ComputedWithOptions): ComputedWithSignal<T>;
export function computedWith<Signals extends Array<SignalLike>>(...signals: Signals): ComputedWithSignal<SignalValues<Signals>>;
export function computedWith<Signals extends Array<SignalLike>>(...args: [...signals: Signals, options: ComputedWithOptions]): ComputedWithSignal<SignalValues<Signals>>;
export function computedWith(...args: Array<any>): ComputedWithSignal<any> {
  let options: ComputedWithOptions | undefined;
  let signals: Array<Signal<any>> = args;

  if (args.length > 1 && typeof args[args.length - 1] !== 'function') {
    options = args.pop();
    signals = args;
  }

  const source = signals.length === 1 ? signals[0] : () => signals.map(s => s());
  const signal = isSignal(source) ? source : computed(source);
  return lift(signal, options, []);
}

function lift<T>(
  source: Signal<T>,
  options: ComputedWithOptions | undefined,
  effectRefs: Array<EffectRef>
): ComputedWithSignal<T> {
  return Object.assign(
    source,
    {
      debounce(delay: number) {
        const output = linkedSignal(() => untracked(source)); // linkedSignal used for lazy evaluation
        effectRefs.push(effectWith(source)
          .debounce(delay)
          .run(value => output.set(value), { injector: options?.injector, untracked: true }));
        return lift(output, options, effectRefs);
      },
      filter(predicate: (value: ExcludeSkipped<T>) => boolean) {
        const output = pipe(source, value => predicate(value) ? value : SKIPPED, options);
        return lift(output, options, effectRefs);
      },
      skip(n: number) {
        const skip = createSkipOperator<T>(n);
        const output = pipe(source, value => skip(value) ? SKIPPED : value, options);
        return lift(output, options, effectRefs);
      },
      distinct(equal: (a: ExcludeSkipped<T>, b: ExcludeSkipped<T>) => boolean) {
        const distinct = createDistinctOperator(equal);
        const output = pipe(source, value => distinct(value) ? value : SKIPPED as Extract<T, typeof SKIPPED>, options);
        return lift(output, options, effectRefs);
      },
      take(n: number) {
        const take = createTakeOperator<T>(n);
        const output = pipe(source, value => {
          if (take(value)) {
            return value;
          } else {
            this.destroy();
            return SKIPPED;
          }
        }, options) as Signal<T>;
        return lift(output, options, effectRefs);
      },
      map<R>(fn: (value: ExcludeSkipped<T>) => R, computedOptions?: CreateComputedOptions<R | Extract<T, typeof SKIPPED>>) {
        const output = pipe(source, value => fn(value as ExcludeSkipped<T>), mergeOptions(options, computedOptions));
        return lift(output, options, effectRefs);
      },
      pair() {
        const pair = createPairOperator<ExcludeSkipped<T>>();
        const output = pipe(source, pair, options);
        return lift(output, options, effectRefs);
      },
      default<D = undefined>(defaultValue?: D) {
        const output = computed(() => {
          const value = source();
          return (value === SKIPPED ? defaultValue : value) as ExcludeSkipped<T> | D;
        }, options);
        return lift(output, options, effectRefs);
      },
      destroy() {
        for (const effectRef of effectRefs) {
          effectRef.destroy();
        }
      }
    }
  );
}

function pipe<T, R>(
  source: SignalLike<T>,
  fn: (value: ExcludeSkipped<T>) => R,
  options: CreateComputedOptions<R | Extract<T, typeof SKIPPED>> | undefined
): Signal<R | Extract<T, typeof SKIPPED>> {
  let lastValue: R | typeof SKIPPED = SKIPPED;
  return computed(() => {
    const value = source();
    if (value === SKIPPED) return lastValue as Extract<T, typeof SKIPPED>;
    const newValue = fn(value as ExcludeSkipped<T>);
    return (newValue === SKIPPED
      ? lastValue
      : (lastValue = newValue)) as R;
  }, options);
}

function mergeOptions<T, R>(
  options: ComputedWithOptions | undefined,
  computedOptions: CreateComputedOptions<Extract<T, typeof SKIPPED> | R> | undefined
): CreateComputedOptions<Extract<T, typeof SKIPPED> | R> | undefined {
  return options === undefined ? computedOptions : { ...options, ...computedOptions };
}
