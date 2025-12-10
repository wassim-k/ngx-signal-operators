import { SKIPPED } from './types';

export function createSkipOperator<V>(n: number): (value: V) => boolean {
  if (n <= 0) {
    throw new Error('The number of skipped signal values must be greater than 0.');
  }
  return (_value: V) => --n >= 0;
}

export function createTakeOperator<V>(n: number): (value: V) => boolean {
  if (n <= 0) {
    throw new Error('The number of taken signal values must be greater than 0.');
  }
  return (_value: V) => --n >= 0;
}

export function createPairOperator<V>(): (value: V) => [V, V | undefined] {
  let prev: V | undefined = undefined;
  return (value: V) => {
    const pair: [V, V | undefined] = [value, prev];
    prev = value;
    return pair;
  };
}

export function createDistinctOperator<V>(equal: (a: V, b: V) => boolean): (value: V) => boolean {
  let prev: V | typeof SKIPPED = SKIPPED;
  return (value: V) => {
    if (prev === SKIPPED || !equal(value, prev)) {
      prev = value;
      return true;
    }
    return false;
  };
}
