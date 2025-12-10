import { Injector, runInInjectionContext, signal } from '@angular/core';
import { fakeAsync, flushMicrotasks, TestBed, tick } from '@angular/core/testing';
import { computedWith, SKIPPED } from 'ngx-signal-operators';

describe('computedWith', () => {
  let injector: Injector;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    injector = TestBed.inject(Injector);
  });

  it('should return a computed signal that reflects the source signal', fakeAsync(() => {
    runInInjectionContext(injector, () => {
      const source = signal(1);
      const output = computedWith(source);
      expect(output()).toBe(1);

      source.set(2);
      expect(output()).toBe(2);
    });
  }));

  it('should support .map to transform the value', fakeAsync(() => {
    runInInjectionContext(injector, () => {
      const source = signal<number | typeof SKIPPED>(2);
      const output = computedWith(source).map(value => value * 2);
      expect(output()).toBe(4);

      source.set(4);
      expect(output()).toBe(8);

      source.set(SKIPPED);
      expect(output()).toBe(8);
    });
  }));

  it('should use the equal function provided in map options', fakeAsync(() => {
    runInInjectionContext(injector, () => {
      const source = signal({ id: 1, value: 'first' });

      const output = computedWith(source).map(
        v => ({ ...v }), // Create a new object instance on each map
        { equal: (a, b) => a.id === b.id } // Compare only by id
      );

      // Initial value
      const initialValue = output();
      expect(initialValue).toEqual({ id: 1, value: 'first' });

      // Update source with a new object having the same id but different value
      source.set({ id: 1, value: 'second' });
      flushMicrotasks();

      // Since the 'id' is the same, the equal function returns true,
      // and the computed signal should not update its value reference.
      expect(output()).toBe(initialValue); // Check for reference equality
      expect(output()).toEqual({ id: 1, value: 'first' }); // Value remains the initial one

      // Update source with a new object having a different id
      source.set({ id: 2, value: 'third' });
      flushMicrotasks();

      // Since the 'id' is different, the equal function returns false,
      // and the computed signal updates its value.
      expect(output()).not.toBe(initialValue); // Check reference inequality
      expect(output()).toEqual({ id: 2, value: 'third' }); // Value is updated
    });
  }));

  it('should support .skip to ignore the first emission', fakeAsync(() => {
    runInInjectionContext(injector, () => {
      const source = signal(10);
      const output = computedWith(source).skip(1);

      // Initially, the computed signal is set to SKIPPED.
      flushMicrotasks();
      expect(output()).toBe(SKIPPED);

      // First update is still skipped.
      source.set(20);
      flushMicrotasks();
      expect(output()).toBe(20);

      // Second update should pass through.
      source.set(30);
      flushMicrotasks();
      expect(output()).toBe(30);
    });
  }));

  it('should support .take to take only the specified number of emissions', fakeAsync(() => {
    runInInjectionContext(injector, () => {
      const source = signal(0);
      const output = computedWith(source).take(3);

      // After the initial emission.
      flushMicrotasks();
      expect(output()).toBe(0);

      // First update.
      source.set(1);
      flushMicrotasks();
      expect(output()).toBe(1);

      // Second update.
      source.set(2);
      flushMicrotasks();
      expect(output()).toBe(2);

      // Further updates are ignored; computed value remains at the last taken value.
      source.set(3);
      flushMicrotasks();
      expect(output()).toBe(2);

      source.set(4);
      flushMicrotasks();
      expect(output()).toBe(2);
    });
  }));

  it('should support .debounce to delay updates', fakeAsync(() => {
    runInInjectionContext(injector, () => {
      const source = signal(100);
      const output = computedWith(source).debounce(1000);

      // Initially, the computed value is the source value.
      expect(output()).toBe(100);

      // Update the source; the debounced signal will not update immediately.
      source.set(200);
      expect(output()).toBe(100);

      // Advance time partially.
      tick(500);
      expect(output()).toBe(100);

      // Advance time to complete the debounce period.
      tick(500);
      expect(output()).toBe(200);
    });
  }));

  it('should work with multiple signals and aggregate their values', fakeAsync(() => {
    runInInjectionContext(injector, () => {
      const a = signal(1);
      const b = signal(2);

      const output = computedWith(a, b).map((values: [number, number]) => values[0] + values[1]);
      expect(output()).toBe(3);

      const cp2 = computedWith(() => [a(), b()] as const).map((values: readonly [number, number]) => values[0] + values[1]);
      expect(cp2()).toBe(3);

      a.set(3);
      b.set(4);
      expect(output()).toBe(7);
      expect(cp2()).toBe(7);
    });
  }));

  it('should accept options with an injector without errors', fakeAsync(() => {
    const source = signal(5);
    const output = computedWith(source, { injector });
    expect(output()).toBe(5);

    source.set(10);
    expect(output()).toBe(10);
  }));

  it('should chain .skip(2).skip(2) correctly', fakeAsync(() => {
    runInInjectionContext(injector, () => {
      const source = signal(1);
      // Chain two skip operators, each set to skip 2 emissions.
      const output = computedWith(source).skip(2).skip(2);

      // (skip: 1, skip: 0)
      flushMicrotasks();
      expect(output()).toBe(SKIPPED);

      // (skip: 2, skip: 0)
      source.set(2);
      flushMicrotasks();
      expect(output()).toBe(SKIPPED);

      // (skip: 2, skip: 1)
      source.set(3);
      flushMicrotasks();
      expect(output()).toBe(SKIPPED);

      // (skip: 2, skip: 2)
      source.set(4);
      flushMicrotasks();
      expect(output()).toBe(SKIPPED);

      source.set(5);
      flushMicrotasks();
      expect(output()).toBe(5);
    });
  }));

  it('should chain .skip(1).debounce correctly', fakeAsync(() => {
    runInInjectionContext(injector, () => {
      const source = signal(10);
      const output = computedWith(source).skip(1).debounce(1000);

      // Initially, output() is SKIPPED.
      expect(output()).toBe(SKIPPED);

      source.set(20);
      tick(1000);
      expect(output()).toBe(20);

      // Debounced
      source.set(30);
      expect(output()).toBe(20);

      // Advance time to flush the debounce timer.
      tick(1000);
      expect(output()).toBe(30);
    });
  }));

  it('should only update when the predicate is true', fakeAsync(() => {
    runInInjectionContext(injector, () => {
      const source = signal(1);
      // Filter to only allow even numbers.
      const output = computedWith(source).filter(value => value % 2 === 0);

      // Starts with the initial value, even if it doesn't pass the predicate.
      expect(output()).toBe(SKIPPED);

      source.set(3); // Odd, should be ignored.
      flushMicrotasks();
      expect(output()).toBe(SKIPPED);

      source.set(4); // Even, should update.
      flushMicrotasks();
      expect(output()).toBe(4);

      source.set(5); // Odd, ignored.
      flushMicrotasks();
      expect(output()).toBe(4);
    });
  }));

  it('should narrow types using filter correctly', fakeAsync(() => {
    runInInjectionContext(injector, () => {
      const source = signal<number | string>(1);

      const output = computedWith(source)
        .filter((value): value is number => typeof value === 'number')
        .default(0);

      expect(output() + 1).toBe(2);
    });
  }));

  it('should replace SKIPPED with the provided default value using default(defaultValue)', fakeAsync(() => {
    runInInjectionContext(injector, () => {
      const source = signal<number>(0);
      const output = computedWith(source).skip(1).default(42);

      // Initially the source is SKIPPED, so default returns provided value.
      expect(output()).toBe(42);

      // When source emits a valid value, it propagates.
      source.set(10);
      flushMicrotasks();
      expect(output()).toBe(10);
    });
  }));

  it('should replace SKIPPED with undefined using default() overload without arguments', fakeAsync(() => {
    runInInjectionContext(injector, () => {
      const source = signal<number>(0);
      const output = computedWith(source).skip(1).default();

      // With no default provided, SKIPPED is replaced by undefined.
      expect(output()).toBeUndefined();

      // When source emits a valid value, it propagates.
      source.set(5);
      flushMicrotasks();
      expect(output()).toBe(5);
    });
  }));

  it('should work in a chain with other operators', fakeAsync(() => {
    runInInjectionContext(injector, () => {
      const source = signal(2);
      // Chain: first filter even numbers, then double the value.
      const output = computedWith(source)
        .filter(value => value % 2 === 0)
        .map(value => value * 2);

      // Initial value 2 passes filter, mapped to 4.
      flushMicrotasks();
      expect(output()).toBe(4);

      source.set(3); // Fails filter, remains 4.
      flushMicrotasks();
      expect(output()).toBe(4);

      source.set(6); // Passes filter, mapped to 12.
      flushMicrotasks();
      expect(output()).toBe(12);
    });
  }));

  it('should stop propagating changes after destroy is called', fakeAsync(() => {
    runInInjectionContext(injector, () => {
      const source = signal(1);
      // Use skip(1) to register an internal effect
      const output = computedWith(source).debounce(10);

      // Flush initial tasks: the computed value should be SKIPPED due to skip(1)
      expect(output()).toBe(1);

      // Update the source to trigger the effect
      source.set(2);
      tick(10);
      expect(output()).toBe(2);

      // Now destroy all nested effects
      output.destroy();

      // Update the source again. With the effects cleaned up, the computed signal should no longer update.
      source.set(3);
      tick(10);
      expect(output()).toBe(2);
    });
  }));

  it('should pair each value with its previous value', fakeAsync(() => {
    runInInjectionContext(injector, () => {
      const source = signal(1);
      const output = computedWith(source).pair();

      expect(output()).toEqual([1, undefined]);

      source.set(2);
      flushMicrotasks();
      expect(output()).toEqual([2, 1]);

      source.set(3);
      flushMicrotasks();
      expect(output()).toEqual([3, 2]);

      source.set(4);
      flushMicrotasks();
      expect(output()).toEqual([4, 3]);
    });
  }));

  it('should support pair with skipped values', fakeAsync(() => {
    runInInjectionContext(injector, () => {
      const source = signal(0);

      const evenPairs = computedWith(source)
        .filter(value => value % 2 === 0)
        .pair();

      flushMicrotasks();
      expect(evenPairs()).toEqual([0, undefined]);

      source.set(1);
      flushMicrotasks();
      expect(evenPairs()).toEqual([0, undefined]);

      source.set(2);
      flushMicrotasks();
      expect(evenPairs()).toEqual([2, 0]);

      source.set(3);
      flushMicrotasks();
      expect(evenPairs()).toEqual([2, 0]);

      source.set(4);
      flushMicrotasks();
      expect(evenPairs()).toEqual([4, 2]);
    });
  }));

  it('should use custom equality for objects with distinct', fakeAsync(() => {
    runInInjectionContext(injector, () => {
      const source = signal<{ id: number, name: string } | typeof SKIPPED>(SKIPPED);
      const result = computedWith(source)
        .distinct((a, b) => a.id === b.id);

      expect(result()).toEqual(SKIPPED);

      source.set({ id: 1, name: 'Alice' });
      expect(result()).toEqual({ id: 1, name: 'Alice' });

      // Same id, different name - retains previous value
      source.set({ id: 1, name: 'Bob' });
      expect(result()).toEqual({ id: 1, name: 'Alice' });

      // Different id - updates
      source.set({ id: 2, name: 'Charlie' });
      expect(result()).toEqual({ id: 2, name: 'Charlie' });

      // Set to SKIPPED - retains previous value
      source.set(SKIPPED);
      expect(result()).toEqual({ id: 2, name: 'Charlie' });
    });
  }));
});
