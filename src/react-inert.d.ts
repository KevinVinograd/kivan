import 'react'

// `inert` is a standard HTML attribute — it removes a subtree from pointer/focus
// interaction and the tab order — but it is missing from React 18's JSX attribute
// types. Augment HTMLAttributes so a visually-dissolved region can be marked inert
// (the master-detail PageHeader dissolve; see clients / team / billing / cobranza /
// cuentas-corrientes pages).
//
// The type is `'' | undefined`, NOT `boolean`, and that is load-bearing. React 18
// has no notion of `inert` as a boolean attribute, so it takes the "non-boolean
// attribute" path: `inert={true}` is DROPPED from the DOM with a console warning
// ("Received `true` for a non-boolean attribute `inert`"), and only a string value
// is emitted. `inert=""` is the spec's own form for a valueless boolean attribute
// and is what the DOM honours. Typing this as `boolean` compiles the broken form
// silently — the dissolved header stays focusable and exposed to assistive tech
// while it is invisible. Narrowing to `'' | undefined` makes that a compile error.
// React 19 adds first-class `inert` support; drop this augmentation on that upgrade.
declare module 'react' {
  interface HTMLAttributes<T> {
    inert?: '' | undefined
  }
}
