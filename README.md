# ngx-signal-operators

Transform Angular signals with functional operators.

## Installation

```bash
npm install ngx-signal-operators
```

## 🔧 Requirements
* Angular >= 17.0.0
* TypeScript >= 5.2.0

## ✨ Features
* Purely written using Signals.
* Depends only on `@angular/core`.
* No dependency on `RxJS`.
* < 2KB minified.

## Motivation
**ngx-signal-operators** was created to provide **clean**, **simple**, and **readable** solutions to common and repeatable signals patterns.

### Examples

#### 1. Skip first `effect` callback:

This is common, as the first callback is usually with the initial signal values before the user interacts with the component.

Without **ngx-signal-operators**:
```typescript
const input = signal('');

let isFirst = true;

effect(() => {
  const value = input(); // Establish dependency.

  if (isFirst) {
    isFirst = false;
    return;
  }

  console.log(`Input changed to: ${value}`);
});
```

With **ngx-signal-operators**:
```typescript
import { effectWith } from 'ngx-signal-operators';

const input = signal('');

effectWith(input)
  .skip(1)
  .run(value => console.log(`Input changed to: ${value}`));
```

#### 2. Debounce `computed` value

This is common when working with APIs where user input needs to be debounced to avoid spamming the API:

Without **ngx-signal-operators**:
```typescript
const input = signal('');

const input$ = toObservable(input).pipe(
  debounceTime(500)
);

const debouncedInput = toSignal(input$, {
  initialValue: input()
});
```

With **ngx-signal-operators**:
```typescript
import { computedWith } from 'ngx-signal-operators';

const input = signal('');

const debouncedInput = computedWith(input).debounce(500);
```

### Comparison to RxJS
While both libraries have a similar pipe-able operators API, they operate on fundamentally different primitives:
* **Signals** are pull-based and always have a value.
* **Observables** are push-based streams.

**ngx-signal-operators** focuses on providing **simple** solutions to common signals patterns. While some functionality may overlap, the implementation is specifically optimised for Signals.

Use **ngx-signal-operators** when working primarily with Signals and simple transformations.

Use **RxJS** when dealing with complex async flows, event streams, error handling or when you need its rich operator ecosystem.

## Core Concepts

**ngx-signal-operators** provides two main functions built purely with Angular Signals:
- `effectWith`: For handling side effects based on signal changes.
- `computedWith`: For transforming signal values.

### Signals Reactivity Refresher
Signals reactivity works in two phases:
1. **Notifying Dependents Phase**

   When a signal's value changes, it immediately marks all its dependents (such as computed signals, effects or component template) as "dirty".  
   This notification means that any cached values are flagged for update, ensuring that dependent computations know they must refresh their value, but they are not re-evaluated immediately.

2. **Lazy Evaluation Phase**

   The value of dependents is lazily recalculated only when their value is actually accessed. This on-demand "pull" minimises unnecessary recomputation, enhancing performance by recalculating only when needed.

This is crucial for understanding how the various operators in this library work.

## `effectWith`

### Overview

`effectWith` creates an `effect` pipeline with one or more input signals.

### Basic Usage

```typescript
import { signal } from '@angular/core';
import { effectWith } from 'ngx-signal-operators';

const temperature = signal(20);

effectWith(temperature)
  .skip(1)             // Skip initial value
  .filter(t => t > 30) // Only high temps
  .debounce(1000)      // Avoid spam
  .run(t => {
    console.log(`Warning: High temperature ${t}°C`);
  });
```

> **💡 Performance Tip:** For optimal performance, add `{ untracked: true }` to the `run()` options unless you need to track additional signals inside your effect. See [Untracked Effects](#untracked-effects) for details.

### Under the Hood
`effectWith` is implemented using a single `effect` and a pipeline pattern, it roughly translates to this:

```typescript
effect(() => operator1(operator2(operator3(run))));
```

Each operator decides whether to call the next operator and so on, until the `run` callback is invoked.

### Timing
`effect`s called from an Angular component run during the change detection stage of the component's lifecycle.

`effect`s called from outside an Angular component run as a microtask.

`effectWith` operates on each one of those **effect runs**.

### Operators

#### filter
Conditionally run effect based on predicate.

```typescript
const input = signal(0);

effectWith(input)
  .filter(x => x % 2 === 0)
  .run(value => {
    console.log('Even number:', value);
  });
```

#### map
Map values using a mapping function.

```typescript
const input = signal(1);

effectWith(input)
  .map(x => x * 2)
  .run(value => console.log('Doubled value:', value));
```

#### skip
Skip the first N effect runs.

```typescript
const input = signal(0);

effectWith(input)
  .skip(1)
  .run(value => {
    console.log('After initial value:', value);
  });
```

#### distinct
Skip consecutive duplicate values based on a custom equality function.

`equal` comparator is **mandatory** because signal values are inherently distinct e.g. `distinct((a, b) => a === b)` is redundant.

```typescript
// Distinct by property
const source = signal({ id: 1, name: 'Alice' });

effectWith(source)
  .distinct((a, b) => a.id === b.id)
  .run(value => {
    console.log('New unique object:', value);
  });

// Deep equality
const coords = signal({ x: 1, y: 2 });

effectWith(coords)
  .distinct(deepEqual)
  .run(value => {
    console.log('Coordinates changed:', value);
  });
```

#### take
Run effect N times before destroying it.

```typescript
const input = signal(0);

effectWith(input)
  .take(1)
  .run(value => {
    console.log('Initial value:', value);
  });
```

#### pair
Pair each value with its previous value.

The first value will be paired with `undefined` (since there is no previous value).

```typescript
const counter = signal(0);

effectWith(counter)
  .pair()
  .run(([current, previous]) => {
    console.log(`Counter changed from ${previous ?? 'undefined'} to ${current}`);
  });
```

#### debounce
Delay effect run by the specified milliseconds.

```typescript
const input = signal('');

effectWith(input)
  .debounce(500)
  .run(value => {
    console.log('Debounced input:', value);
  });
```

#### run
Executes the effect with the configured pipeline.

```typescript
const input = signal('');

const effectRef = effectWith(input)
  .filter(value => value.length > 0)
  .run(
    (value, { onCleanup, effectRef }) => {
      // Register cleanup logic if needed
      onCleanup(() => {
        console.log('Cleaning up after:', value);
      });
    },
    { injector }
  );
```

Parameters:
- `fn`: Callback function that receives:
  - `value`: The current value(s) from the source signal(s)
  - `context`: An object with:
    - `onCleanup`: Function to register cleanup handlers
    - `effectRef`: Reference to the effect instance
- `options`:
  - extends [`CreateEffectOptions`](https://angular.dev/api/core/CreateEffectOptions)
  - `untracked?: boolean` - Wrap the effect pipeline with `untracked(() => ...).

Returns an `EffectRef` that can be used to destroy the effect manually.

### Untracked Effects

By default, Angular's `effect` tracks all signal reads within its callback. This means any signal accessed inside your effect will create a dependency, causing the effect to re-run whenever those signals change, even if you only want to react to changes in your input signal(s).

If you only want to react to changes in `effectWith` input signal(s) then set `untracked: true` option.

```typescript
// effect ONLY runs when input changes
effectWith(input)
  .run(
    value => console.log(value, other()), // Changes to `other` signal will not re-run the effect.
    { untracked: true }
  );
```

This automatically wraps the effect pipeline in Angular's `untracked()`, preventing unwanted reactive dependencies and improving performance.

#### Automatic Effect Splitting
When `untracked: true` `(default)` combining synchronous and asynchronous operators (like `debounce`), the library automatically splits the pipeline into two effects connected by a bridge signal. This maintains reactivity across async contexts:

```typescript
effectWith(input)
  .map(x => x * 2)      // Synchronous - runs in effect 1
  .debounce(500)        // Async boundary - automatic split
  .filter(x => x > 10)  // Synchronous - runs in effect 2
  .run(value => console.log(value, other())); // Changes to `other` signal re-runs the effect.
```

The split happens transparently, maintaining reactivity across async contexts.

## `computedWith`

### Overview

`computedWith` creates a `computed` signal pipeline with one or more input signals.

### Basic Usage

```typescript
import { signal } from '@angular/core';
import { computedWith } from 'ngx-signal-operators';

const input = signal('');

const normalisedInput = computedWith(input)
  .skip(1)                    // Skip initial empty value
  .filter(v => v.length > 0)  // Ignore empty strings
  .debounce(500)              // Wait for typing to stop
  .map(v => v.toLowerCase()); // Normalise case

input.set('HELLO'); // After 500ms: "hello"
```

### Under the Hood
`computedWith` is implemented by simply chaining multiple `computed` signals. It roughly translates to:

```typescript
const input =         signal(0);
const intermediate1 = computed(operator1(input));
const intermediate2 = computed(operator2(intermediate1));
const output =        computed(operator3(intermediate2));
```

Each operator applies a transformation to the value which in turn is pulled by the next `computed` value and so on...

### Timing
`computed` value **computation** is performed when the value is accessed. Then the value is cached until the next time one of its dependencies changes.

The timing of the **computation** depends on when the signal is accessed:
* If the `computed` value is accessed from a component's template, then it will run as part of the component's rendering cycle.
* If the `computed` value is accessed from an `effect`, then it follows the `effect` timing explained previously.

`computedWith` operates on each one of those value **computations**.

### Operators

#### map
Map values using a mapping function.

```typescript
const input = signal(1);
const doubled = computedWith(input).map(x => x * 2);
```

#### filter
Filter values based on a predicate.  
If the initial value is filtered then `SKIPPED` is returned.

```typescript
const input = signal(0);
const evenOnly = computedWith(input).filter(x => x % 2 === 0);
```

#### skip
Returns `SKIPPED` for the first N computations, then passes through subsequent values as-is.

```typescript
const input = signal(0);
const skipFirst = computedWith(input).skip(1);
```

#### distinct
Skip consecutive duplicate values based on a custom equality function.

`equal` comparator is **mandatory** because signal values are inherently distinct e.g. `distinct((a, b) => a === b)` is redundant.

```typescript
const source = signal({ id: 1, name: 'Alice' });
const uniqueById = computedWith(source)
  .distinct((a, b) => a.id === b.id);

source.set({ id: 1, name: 'Bob' });
uniqueById(); // { id: 1, name: 'Alice' }

source.set({ id: 2, name: 'Charlie' });
uniqueById(); // { id: 2, name: 'Charlie' }

// Deep equality
const coords = signal({ x: 1, y: 2 });
const uniqueCoords = computedWith(coords)
  .distinct(deepEqual);
```

#### take
Returns value as-is for the first N computations, then retains the N-th value for all subsequent computations.  
It also calls `destroy()` on the `ComputedWithSignal` instance to cleanup any internal effects.

```typescript
const input = signal(0);
const takeFirst = computedWith(input).take(1);
```

#### pair
Pair each value with its previous value.

The first value will be paired with `undefined` (since there is no previous value).

```typescript
const counter = signal(0);
const counterWithPrevious = computedWith(counter).pair();

// Initial value: [0, undefined]
counter.set(1); // Now: [1, 0]
counter.set(2); // Now: [2, 1]
```

#### debounce
Delay value computation by the specified milliseconds.

```typescript
const input = signal('');
const debouncedInput = computedWith(input).debounce(500);

input.set('a'); // Will emit after 500ms
input.set('ab'); // Resets the 500ms timer
```

Signals always have a value, using `debounce` with `computedWith` returns the initial signal value instantly, then debounces future value changes.

`debounce` uses an internal `effect` which is automatically cleaned up when the component is destroyed, but it can be done manually by calling `computedWithSignal.destroy()`.

#### default
Replace `SKIPPED` with the specified default value.

```typescript
const input = signal('');
const skipWithDefault = computedWith(input)
  .skip(1)            // This will produce SKIPPED initially
  .default('None');   // Replace SKIPPED with 'None'
```

### SKIPPED symbol
Since signals always have a value, if a computation results in a skipped value, then a special `SKIPPED` symbol is returned instead.

`SKIPPED` only applies to the **initial value** produced by **`computedWith`**. All subsequent skipped computations simply return the last known value, which in turn does not notify dependents of a value change, essentially, skipping that computation.

#### Working with SKIPPED symbol

In this example, we'd like to `debounce` search parameters that are entered by the user before making an API call:

```typescript
@Component({
  /* ... */
})
export class EmployeesComponent {
  private readonly employeeApiService = inject(EmployeeApiService);
 
  public readonly firstName = input<string>('');
  public readonly lastName = input<string>('');

  // ⚠️ Will trigger an immediate API call with empty values
  protected readonly employeesResource = rxResource({
    request: computedWith(this.firstName, this.lastName).debounce(500),
    loader: params => {
      const [firstName, lastName] = params.request;
      return this.employeeApiService.searchEmployees({ firstName, lastName });
    }
  });
}
```

In this example, because signals always have a value, the resource will immediately make an API call with empty strings.

If we want to make a request only after the user has entered search parameters, you can use `skip(1)` and handle the `SKIPPED` symbol:

```typescript
@Component({
  /* ... */
})
export class EmployeesComponent {
  private readonly employeeApiService = inject(EmployeeApiService);
 
  public readonly firstName = input<string>('');
  public readonly lastName = input<string>('');

  // ✅ No API call until user interaction
  protected readonly employeesResource = rxResource({
    request: computedWith(this.firstName, this.lastName)
      .skip(1) // <= Skip initial value
      .debounce(500),
    loader: params => {
      if (params.request === SKIPPED) {
        return EMPTY; // Prevent initial HTTP request
      }
      const [firstName, lastName] = params.request;
      return this.employeeApiService.searchEmployees({ firstName, lastName });
    }
  });
}
```

Or you can use the `default` operator:

```typescript
@Component({
  /* ... */
})
export class EmployeesComponent {
  private readonly employeeApiService = inject(EmployeeApiService);
 
  public readonly firstName = input<string>('');
  public readonly lastName = input<string>('');

  // ✅ No API call until user interaction
  protected readonly employeesResource = rxResource({
    request: computedWith(this.firstName, this.lastName)
      .skip(1) // <= Skip initial value
      .debounce(500)
      .default(), // <= Replace SKIPPED with `undefined`
    loader: params => {
      // rxResource does not invoke the loader function when request is `undefined`
      const [firstName, lastName] = params.request;
      return this.employeeApiService.searchEmployees({ firstName, lastName });
    }
  });
}
```

Similarly, `computedWith` works with `httpResource`:
```typescript
protected readonly employeesResource = httpResource<Array<Employee>>(
  computedWith(this.firstName, this.lastName)
    .debounce(500)
    .map(([firstName, lastName]): HttpResourceRequest => ({
      url: `https://api.dev/employees`,
      params: { firstName, lastName }
    }))
);
```

## Working with Multiple Signals

Both `computedWith` and `effectWith` support multiple input signals:

```typescript
const name = signal('John');
const age = signal(30);

// computedWith
computedWith(name, age)
  .map(([n, a]) => `${n} is ${a} years old`);

computedWith(() => [name(), age()])
  .map(([n, a]) => `${n} is ${a} years old`);

// effectWith
effectWith(name, age).run(([n, a]) => {
  console.log(`Update: ${n} is now ${a}`);
});

effectWith(() => [name(), age()]).run(([n, a]) => {
  console.log(`Update: ${n} is now ${a}`);
});
```

## Injection Context
Both `effectWith` and `computedWith` require an injection context. When used outside of constructor or field initialisation, you must provide an `Injector`:

```typescript
@Component({
  /* ... */
})
export class MyComponent implements OnInit {
  private readonly injector = inject(Injector);
  private readonly source = signal(0);
  
  // ✅ No injector needed - field initialisation has context
  private readonly doubled = computedWith(this.source)
    .map(x => x * 2);

  public ngOnInit() {
    // ❌ ngOnInit has no context, must provide injector
    effectWith(this.source)
      .run(
        value => console.log(value),
        { injector: this.injector }
      );
  }
}
```

## 🤝 Contributing

Contributions are welcome! You can start by [forking the repository](https://github.com/wassim-k/ngx-signal-operators/fork).

## 🐛 Issues

If you encounter any bugs, have a feature request, or a use case for a new operator, please [open an issue](https://github.com/wassim-k/ngx-signal-operators/issues).

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](https://github.com/wassim-k/ngx-signal-operators/blob/main/LICENSE) file for details.
