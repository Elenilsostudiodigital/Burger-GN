---
name: useRef TypeScript Initial Value
description: useRef with non-undefined types requires explicit initial value in strict TypeScript
---

In strict TypeScript (tsconfig with strictNullChecks), `useRef<T>()` fails because T is not undefined. Always use: `useRef<T | undefined>(undefined)`.

**Why:** TS2554 "Expected 1 arguments, but got 0" error. The React `useRef` overloads require an initial value when the type is not `undefined`.

**How to apply:** Any time a ref holds a timer, DOM element, or optional value, write `useRef<NodeJS.Timeout | undefined>(undefined)` or `useRef<HTMLElement | null>(null)`.
