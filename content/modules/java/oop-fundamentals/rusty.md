---
title: "OOP Fundamentals — refresher"
estimatedMinutes: 15
objectives:
  - "Re-anchor the core OOP vocabulary in ten minutes"
  - "Know which Java language features changed the idioms since Java 8"
  - "Spot the three design smells that still get past experienced reviewers"
status: ready
---

You have written Java objects before, probably a lot of them, probably in the Java 6 to 8 era.
The concepts have not changed. The idioms have. This refresher assumes you can read Java and spends
its time on what is different now.

## What you probably remember

| Concept | One-line anchor |
| --- | --- |
| Encapsulation | Private fields; the public methods are the contract; invariants enforced inside. |
| Interface | A contract without implementation; the seam for polymorphism, test doubles and vendor swaps. |
| Abstract class | Shared implementation plus abstract methods; use sparingly, keep hierarchies shallow. |
| Inheritance vs composition | Composition by default; inheritance only for a true, stable is-a. |
| Immutability | `final` fields, no setters, return new objects; thread-safe for free. |
| `equals` / `hashCode` | Value objects need both, consistently; collections depend on it. |
| SOLID | Single responsibility, open/closed, Liskov, interface segregation, dependency inversion. Still the review vocabulary. |

## What changed since

:::callout{kind=changed-since title="Records (Java 16, 2021)"}
Immutable value classes in one line. `record Money(long cents, String currency) {}` generates the
constructor, accessors (`money.cents()`, not `getCents()`), `equals`, `hashCode` and `toString`.
Validation goes in a compact constructor. This replaces the hand-written value object boilerplate
and most Lombok `@Value` usage. If a new codebase still writes 40-line POJOs for values, ask why.
:::

:::callout{kind=changed-since title="Sealed classes and interfaces (Java 17, 2021)"}
`sealed interface PaymentResult permits Accepted, Rejected {}` lists the only allowed
implementations. Combined with pattern-matching `switch`, the compiler checks that every case is
handled. This is how the modern codebase models "one of a fixed set of outcomes", where you may
have used an enum with a payload or an abstract class hierarchy.
:::

:::callout{kind=changed-since title="Pattern matching (Java 16–21)"}
`if (obj instanceof Money m)` binds the cast for you. `switch` can match on type and destructure
records: `case Rejected(String reason) -> ...`. Visitor patterns and `instanceof`-then-cast chains
are being replaced by this.
:::

:::callout{kind=changed-since title="Smaller things you will see in every file"}
- `var x = new HashMap<String, Account>();` local type inference (Java 10).
- Text blocks with `"""` for multi-line strings (Java 15).
- `Optional<T>` as a return type to mean "may be absent"; not as a field or parameter.
- `List.of(...)`, `Map.of(...)` immutable collection factories (Java 9).
- Streams and lambdas (Java 8) are now the default idiom for collection processing, not a novelty.
- Interfaces can have `default` and `static` methods (Java 8); "abstract class for shared code" is
  needed less often.
:::

:::engineer
```java
public sealed interface PaymentResult permits Accepted, Rejected {}
public record Accepted(String reference) implements PaymentResult {}
public record Rejected(String reason) implements PaymentResult {}

public record Money(long cents, String currency) {
    public Money {                                      // compact constructor: validation
        if (cents < 0) throw new IllegalArgumentException("negative");
        currency = currency.toUpperCase();
    }
}

String describe(PaymentResult r) {
    return switch (r) {                                 // exhaustive: compiler checks all cases
        case Accepted(String ref)   -> "ok " + ref;
        case Rejected(String why)   -> "rejected: " + why;
    };
}
```
:::

:::manager
What this means in a review: a modern Java service should have *fewer* classes than you remember,
with more of them being records and sealed hierarchies. Long getter/setter classes, `instanceof`
chains and visitor boilerplate are signs of a team that has not adopted the last five years of the
language, which usually correlates with an older Spring and JVM version too. Worth asking.
:::

## Gotchas that still bite

- **Records are shallowly immutable.** A record holding a `List` still exposes a mutable list.
  Copy on the way in (`List.copyOf(items)`).
- **`equals` on entities.** Records give value equality; database entities usually want identity
  equality. Mixing them corrupts sets and maps in subtle ways.
- **Inheritance for reuse** still shows up, now often via base classes in frameworks. Composition
  is still the answer.
- **Optional misuse.** `Optional` fields, `Optional` parameters and `optional.get()` without a
  check are all smells. It is a return type.
- **Anaemic domain.** Every rule in a `@Service`, every object a data bag. The language got better
  at expressing rules inside objects; the habit did not always follow.

:::callout{kind=bank-context}
Sealed types plus exhaustive `switch` are a compliance win: adding a new outcome (say, a new
sanctions-screening result) fails compilation everywhere it is not handled, instead of silently
falling through to a default branch. That is an argument you can make to a risk committee.
:::

## Ten-minute drill

::::exercise{id=ex-modernise type=code title="Modernise a value class"}
Rewrite this Java 8 class using current idioms. Then say what you would check in a review of the
result.

```java
public class Money {
    private final long cents;
    private final String currency;
    public Money(long cents, String currency) { this.cents = cents; this.currency = currency; }
    public long getCents() { return cents; }
    public String getCurrency() { return currency; }
    @Override public boolean equals(Object o) {
        if (!(o instanceof Money)) return false;
        Money m = (Money) o;
        return cents == m.cents && currency.equals(m.currency);
    }
    @Override public int hashCode() { return Objects.hash(cents, currency); }
    @Override public String toString() { return cents + " " + currency; }
}
```
:::solution
```java
public record Money(long cents, String currency) {
    public Money {
        Objects.requireNonNull(currency, "currency");
        if (cents < 0) throw new IllegalArgumentException("negative amount");
    }
}
```
Fourteen lines become five, and the validation the original silently lacked is now present. In
review: is `currency` normalised (ISO code, upper case)? Should this be a `Currency` type instead of
a `String`? Do any callers rely on `getCents()` naming (records use `cents()`)?
:::
::::
