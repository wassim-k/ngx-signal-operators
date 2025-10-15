import { CreateEffectOptions, effect, EffectCleanupRegisterFn, EffectRef, signal, untracked } from '@angular/core';
import { createFilterOperator, createPairOperator, createSkipOperator, createTakeOperator } from './operators';
import { ExcludeSkipped, SignalLike, SignalValues, SKIPPED } from './types';

type EffectPipeline<T, R> = (next: EffectPipelineNext<R>) => EffectPipelineNext<T>;

type EffectPipelineNext<T> = (value: T, ctx: EffectPipelineContext) => void;

export interface EffectRunOptions extends CreateEffectOptions {
  /**
   * Wrap effect pipeline with `untracked(() => ...)`
   */
  untracked?: boolean;
}

export interface EffectPipelineContext {
  onCleanup: EffectCleanupRegisterFn;
  effectRef: EffectRef;
}

const asAsync = <TFunc extends Function>(fn: TFunc) => Object.assign(fn, { __async: true });
const isAsync = <TFunc extends Function>(fn: TFunc) => '__async' in fn;

/**
 * Creates an `effect` pipeline that can be composed with various operators.
 */
export function effectWith<T>(signal: SignalLike<T>): EffectPipelineBuilder<ExcludeSkipped<T>>;
export function effectWith<Signals extends Array<SignalLike>>(...signals: Signals): EffectPipelineBuilder<SignalValues<Signals>>;
export function effectWith(...signals: Array<SignalLike>): any {
  const source = signals.length === 1 ? signals[0] : () => signals.map(s => s());
  return new EffectPipelineBuilder(source, [excludeSkipped]);
}

export class EffectPipelineBuilder<T> {
  public constructor(
    private readonly source: SignalLike<any>,
    private readonly operators: Array<EffectPipeline<any, any>>
  ) { }

  /**
   * Delay effect run by the specified milliseconds.
   */
  public debounce(delay: number): EffectPipelineBuilder<T> {
    return this.pipe(asAsync(next => (value, ctx) => {
      let timer: ReturnType<typeof setTimeout> | null = null;

      timer = setTimeout(() => {
        next(value, ctx);
        timer = null;
      }, delay);

      ctx.onCleanup(() => {
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
      });
    }));
  }

  /**
   * Conditionally run effect based on predicate.
   */
  public filter<S extends T>(predicate: (value: T) => value is S): EffectPipelineBuilder<S>;
  public filter(predicate: (value: T) => boolean): EffectPipelineBuilder<T>;
  public filter(predicate: (value: T) => boolean): EffectPipelineBuilder<T> {
    const filter = createFilterOperator(predicate);
    return this.pipe(next => (value, ctx) => {
      const result = filter(value);
      if (result !== SKIPPED) {
        next(result, ctx);
      }
    });
  }

  /**
   * Map values using a mapping function.
   */
  public map<R>(fn: (value: T) => R): EffectPipelineBuilder<R> {
    return this.pipe(next => (value, ctx) => next(fn(value), ctx));
  }

  /**
   * Pair each value with its previous value.
   *
   * The first value will be paired with `undefined` (since there is no previous value).
   */
  public pair(): EffectPipelineBuilder<[T, T | undefined]> {
    const pair = createPairOperator<T>();
    return this.pipe(next => (value, ctx) => next(pair(value), ctx));
  }

  /**
   * Skip the first N effect runs.
   */
  public skip(n: number): EffectPipelineBuilder<T> {
    const skip = createSkipOperator<T>(n);
    return this.pipe(next => (value, ctx) => {
      const result = skip(value);
      if (result !== SKIPPED) {
        next(result, ctx);
      }
    });
  }

  /**
   * Run effect N times before destroying it.
   */
  public take(n: number): EffectPipelineBuilder<T> {
    const take = createTakeOperator<T>(n);
    return this.pipe(next => (value, ctx) => {
      const result = take(value);
      if (result !== SKIPPED) {
        next(result, ctx);
      } else {
        ctx.effectRef.destroy();
      }
    });
  }

  /**
   * Run the effect with the configured operators.
   */
  public run(fn: EffectPipelineNext<T>, options?: EffectRunOptions): EffectRef {
    if (options?.untracked === true) {
      return this.runEffect([untrack, ...this.operators], fn, options);
    }

    const asyncIdx = this.operators.findIndex(isAsync);
    if (asyncIdx === -1) {
      return this.runEffect(this.operators, fn, options);
    } else {
      const bridge = signal<any>(SKIPPED as any, { equal: () => false });
      const effect1 = this.runEffect(this.operators.slice(0, asyncIdx + 1), value => bridge.set(value), options);
      const effect2 = new EffectPipelineBuilder<T>(bridge, [excludeSkipped, ...this.operators.slice(asyncIdx + 1)]).run(fn, options);
      return combineEffects(effect1, effect2);
    }
  }

  private runEffect(operators: Array<EffectPipeline<any, any>>, fn: EffectPipelineNext<any>, options?: CreateEffectOptions): EffectRef {
    const pipeline = operators.reduceRight((next, op) => op(next), fn);
    const effectRef = effect(onCleanup => pipeline(this.source(), { onCleanup, effectRef }), options);
    return effectRef;
  }

  private pipe<R>(operator: EffectPipeline<T, R>): EffectPipelineBuilder<R> {
    return new EffectPipelineBuilder<R>(this.source, [...this.operators, operator]);
  }
}

function excludeSkipped(next: EffectPipelineNext<any>): EffectPipelineNext<any> {
  return (value, ctx) => {
    if (value === SKIPPED) return;
    next(value, ctx);
  };
}

function untrack(next: EffectPipelineNext<any>): EffectPipelineNext<any> {
  return (value, ctx) => untracked(() => next(value, ctx));
}

function combineEffects(...effectRefs: Array<EffectRef>): EffectRef {
  return {
    destroy: () => {
      for (const effectRef of effectRefs) {
        effectRef.destroy();
      }
    }
  };
}
