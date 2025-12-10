import { Injector, runInInjectionContext, signal } from '@angular/core';
import { fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { effectWith, SKIPPED } from 'ngx-signal-operators';

describe('effectWith', () => {
  let injector: Injector;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    injector = TestBed.inject(Injector);
  });

  it('should run the effect with the aggregated signal value', fakeAsync(() => {
    runInInjectionContext(injector, () => {
      const source = signal(0);
      const mockFn = vitest.fn();

      // Create an effect with no intermediate operators.
      effectWith(source).run(value => {
        mockFn(value);
      });

      // The effect should run immediately with the initial value.
      flush();
      expect(mockFn).toHaveBeenCalledWith(0);

      // Update the source; the effect re-runs.
      source.set(5);
      flush();
      expect(mockFn).toHaveBeenCalledWith(5);
    });
  }));

  it('should support the skip operator to ignore the first emission', fakeAsync(() => {
    runInInjectionContext(injector, () => {
      const source = signal(1);
      const mockFn = vitest.fn();

      // With skip(1), the first emission after registration is skipped.
      effectWith(source).skip(1).run(value => {
        mockFn(value);
      });

      flush();

      // On initial run, the value (1) is skipped.
      expect(mockFn).not.toHaveBeenCalled();

      // First update: this update passes through.
      source.set(2);

      flush();

      expect(mockFn).toHaveBeenCalledWith(2);
    });
  }));

  it('should support the debounce operator to delay effect execution', fakeAsync(() => {
    runInInjectionContext(injector, () => {
      const source = signal(10);
      const mockFn = vitest.fn();

      effectWith(source).debounce(1000).run(value => {
        mockFn(value);
      });

      // The effect is scheduled but not immediately executed.
      expect(mockFn).not.toHaveBeenCalled();

      // Advance time partially.
      tick(500);
      expect(mockFn).not.toHaveBeenCalled();

      // Advance time to complete the debounce period.
      tick(500);
      expect(mockFn).toHaveBeenCalledWith(10);

      // Update the source to trigger a new debounced effect.
      source.set(20);
      tick(1000);
      expect(mockFn).toHaveBeenCalledWith(20);
    });
  }));

  for (const untracked of [true, false]) {
    it(`should support ${untracked ? 'untracked' : 'reactive'} run block when using debounce`, fakeAsync(() => {
      runInInjectionContext(injector, () => {
        const source = signal(10);
        const other = signal(0);
        const mockFn = vitest.fn();

        effectWith(source)
          .map(value => value + other())
          .debounce(500)
          .map(value => value + other())
          .debounce(500)
          .map(value => value + other())
          .run(value => mockFn(value + other()), { untracked });

        // The effect is scheduled but not immediately executed.
        expect(mockFn).not.toHaveBeenCalled();

        // Advance time partially.
        tick(500);
        expect(mockFn).not.toHaveBeenCalled();

        // Advance time to complete the debounce period.
        tick(500);
        expect(mockFn).toHaveBeenCalledWith(10);

        // Update the source to trigger a new debounced effect.
        source.set(20);
        tick(1000);
        expect(mockFn).toHaveBeenCalledWith(20);

        // Update the other signal to see if it's tracked or not.
        other.set(1);
        flush();
        expect(mockFn).toHaveBeenCalledWith(untracked ? 20 : 24);
      });
    }));
  }

  it(`should run effect across async context even if transformed value has not changed`, fakeAsync(() => {
    runInInjectionContext(injector, () => {
      const source = signal(1);
      const mockFn = vitest.fn();

      effectWith(source)
        .map(() => 1 /* Always return the same value */)
        .debounce(500)
        .run(value => mockFn(value));

      // The effect is scheduled but not immediately executed.
      expect(mockFn).not.toHaveBeenCalled();

      // Advance time to complete the debounce period.
      tick(500);
      expect(mockFn).toHaveBeenCalledWith(1);

      // Update the source to trigger a new debounced effect.
      source.set(2);
      tick(500);
      expect(mockFn).toHaveBeenCalledWith(1);

      expect(mockFn).toHaveBeenCalledTimes(2);
    });
  }));

  it('should pair each value with its previous value', fakeAsync(() => {
    runInInjectionContext(injector, () => {
      const source = signal(1);
      const mockFn = vitest.fn();

      effectWith(source)
        .pair()
        .run(value => mockFn(value));

      flush();
      expect(mockFn).toHaveBeenCalledWith([1, undefined]);

      source.set(2);
      flush();
      expect(mockFn).toHaveBeenCalledWith([2, 1]);

      source.set(3);
      flush();
      expect(mockFn).toHaveBeenCalledWith([3, 2]);

      source.set(4);
      flush();
      expect(mockFn).toHaveBeenCalledWith([4, 3]);
    });
  }));

  it('should support map operator to map values', fakeAsync(() => {
    runInInjectionContext(injector, () => {
      const source = signal(1);
      const mockFn = vitest.fn();

      effectWith(source)
        .map(value => value * 2)
        .run(value => mockFn(value));

      flush();
      expect(mockFn).toHaveBeenCalledWith(2);

      source.set(5);
      flush();
      expect(mockFn).toHaveBeenCalledWith(10);

      source.set(10);
      flush();
      expect(mockFn).toHaveBeenCalledWith(20);
    });
  }));

  it('should run even if map operator returns the same value', fakeAsync(() => {
    runInInjectionContext(injector, () => {
      const source = signal(1);
      const mockFn = vitest.fn();

      effectWith(source)
        .map(value => value)
        .run(value => mockFn(value));

      flush();
      expect(mockFn).toHaveBeenCalledWith(1);

      source.set(2);
      flush();
      expect(mockFn).toHaveBeenCalledWith(1);
    });
  }));

  it('should work with multiple signals and aggregate their values', fakeAsync(() => {
    runInInjectionContext(injector, () => {
      const a = signal(1);
      const b = signal(2);
      const directSignalsMock = vitest.fn();
      const derivedSignalMock = vitest.fn();

      effectWith(a, b).run((values: [number, number]) => directSignalsMock(values));
      effectWith(() => [a(), b()] as const).run((values: readonly [number, number]) => derivedSignalMock(values));

      const testCases = [
        { description: 'Initial values', update: () => { }, expected: [1, 2] },
        { description: 'After updating a', update: () => a.set(3), expected: [3, 2] },
        { description: 'After updating b', update: () => b.set(4), expected: [3, 4] }
      ];

      for (const { update, expected } of testCases) {
        update();
        flush();
        expect(directSignalsMock).toHaveBeenCalledWith(expected);
        expect(derivedSignalMock).toHaveBeenCalledWith(expected);
      }
    });
  }));

  it('should work outside an injection context', fakeAsync(() => {
    const source = signal(100);
    const mockFn = vitest.fn();

    // Pass the dummy injector in the options.
    effectWith(source).run(
      value => {
        mockFn(value);
      },
      { injector }
    );

    // Update the signal and verify the effect still runs.
    source.set(200);

    flush();

    expect(mockFn).toHaveBeenCalledWith(200);
  }));

  it('should only call the effect callback when the predicate is true', fakeAsync(() => {
    runInInjectionContext(injector, () => {
      const source = signal(0);
      const mockFn = vitest.fn();

      // Filter: only pass even numbers.
      effectWith(source)
        .filter(value => value % 2 === 0)
        .run(value => {
          mockFn(value);
        });

      // Initial call with 0 (even) should be called.
      flush();
      expect(mockFn).toHaveBeenCalledWith(0);

      // Update with 1 (odd) should not trigger the callback.
      source.set(1);
      flush();
      expect(mockFn).toHaveBeenCalledTimes(1);

      // Update with 2 (even) should trigger.
      source.set(2);
      flush();
      expect(mockFn).toHaveBeenCalledWith(2);
      expect(mockFn).toHaveBeenCalledTimes(2);
    });
  }));

  it('should narrow types using filter correctly', fakeAsync(() => {
    runInInjectionContext(injector, () => {
      const source = signal<number | string>(1);
      const mockFn = vitest.fn();

      effectWith(source)
        .filter((value): value is number => typeof value === 'number')
        .run(n => mockFn(n + 1));

      flush();
      expect(mockFn).toHaveBeenCalledWith(2);
    });
  }));

  it('should work with an operator pipeline', fakeAsync(() => {
    runInInjectionContext(injector, () => {
      const source = signal(5);
      const mockFn = vitest.fn();

      // Chain: first filter out odd numbers, then debounce.
      effectWith(source)
        .filter(value => value % 2 === 0)
        .debounce(500)
        .run(value => {
          mockFn(value);
        });

      // Initial value 5 is odd: callback should not be called.
      expect(mockFn).not.toHaveBeenCalled();

      source.set(6); // Even, but debounce delays the call.
      tick(500);
      expect(mockFn).toHaveBeenCalledWith(6);

      source.set(7); // Odd, ignored.
      tick(500);
      expect(mockFn).toHaveBeenCalledTimes(1);

      source.set(8); // Even.
      tick(500);
      expect(mockFn).toHaveBeenCalledWith(8);
      expect(mockFn).toHaveBeenCalledTimes(2);
    });
  }));

  it('should call the cleanup function when the effect is destroyed', fakeAsync(() => {
    runInInjectionContext(injector, () => {
      const source = signal(1);
      const cleanupFn = vitest.fn();

      const effectRef = effectWith(source).run((value, { onCleanup }) => {
        onCleanup(cleanupFn);
      });

      // Allow any pending tasks to complete.
      flush();

      // Destroy the effect, which should trigger the cleanup.
      effectRef.destroy();

      expect(cleanupFn).toHaveBeenCalled();
    });
  }));

  it('should take only the specified number of emissions and then stop the effect', fakeAsync(() => {
    runInInjectionContext(injector, () => {
      const source = signal(0);
      const mockFn = vitest.fn();

      // Allow only 3 emissions
      effectWith(source)
        .take(3)
        .run(value => {
          mockFn(value);
        });

      // Initial emission
      flush();
      expect(mockFn).toHaveBeenCalledWith(0);

      // First update (second emission)
      source.set(1);
      flush();
      expect(mockFn).toHaveBeenCalledWith(1);

      // Second update (third emission)
      source.set(2);
      flush();
      expect(mockFn).toHaveBeenCalledWith(2);

      // Further updates should not trigger the callback since effect is destroyed.
      source.set(3);
      flush();
      expect(mockFn).toHaveBeenCalledTimes(3);

      // Optional: further emissions do not call the callback.
      source.set(4);
      flush();
      expect(mockFn).toHaveBeenCalledTimes(3);
    });
  }));

  it('should not execute effect for SKIPPED values', fakeAsync(() => {
    runInInjectionContext(injector, () => {
      const source = signal<number | typeof SKIPPED>(1);
      const mockFn = vitest.fn();

      // Create an effect that should only run for non-SKIPPED values
      effectWith(source).run(value => {
        mockFn(value);
      });

      // Initial value should trigger the effect
      flush();
      expect(mockFn).toHaveBeenCalledWith(1);
      expect(mockFn).toHaveBeenCalledTimes(1);

      // Setting SKIPPED should not trigger the effect
      source.set(SKIPPED);
      flush();
      expect(mockFn).toHaveBeenCalledTimes(1); // Count remains the same

      // Setting a normal value should trigger the effect again
      source.set(2);
      flush();
      expect(mockFn).toHaveBeenCalledWith(2);
      expect(mockFn).toHaveBeenCalledTimes(2);

      // Another SKIPPED value should not trigger
      source.set(SKIPPED);
      flush();
      expect(mockFn).toHaveBeenCalledTimes(2); // Count still remains the same
    });
  }));
});
