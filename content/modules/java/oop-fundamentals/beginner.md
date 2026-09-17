---
title: "OOP Fundamentals"
estimatedMinutes: 30
objectives:
  - "Explain encapsulation, polymorphism and composition in one sentence each"
  - "Read a small Java class and say what it hides and what it exposes"
  - "Decide when an interface, an abstract class, or plain composition is the right tool"
status: ready
---

Object-oriented programming is a way of organising code so that data and the rules about that data
live together, behind a boundary you control. Java is the language most of the bank's core
services are written in, and almost every design review you will sit in comes down to where those
boundaries were drawn. This lesson builds the vocabulary from nothing.

## Why objects exist

Imagine an account balance stored as a plain number that any part of the program can change. A bug
anywhere can set it negative; a rule like "no withdrawal beyond the overdraft limit" has to be
re-checked in every place that touches the number. Objects solve this by putting the number and the
rule in one place and letting the rest of the program talk only to the rule.

:::manager
The management version of this idea: **ownership**. A well-drawn object boundary is the same thing
as a well-drawn team boundary. When a review shows many classes reaching into each other's data, the
system will be as hard to change as an org chart where everyone reports to everyone.
:::

:::engineer
```java
public class Account {
    private long balanceCents;          // nobody outside can touch this directly
    private final long overdraftCents;

    public Account(long overdraftCents) { this.overdraftCents = overdraftCents; }

    public void withdraw(long cents) {
        if (balanceCents - cents < -overdraftCents) {
            throw new IllegalStateException("overdraft exceeded");
        }
        balanceCents -= cents;
    }

    public long balance() { return balanceCents; }
}
```
The rule lives next to the data. There is exactly one way to change the balance.
:::

## Classes, objects and encapsulation

A **class** is the blueprint; an **object** is one instance made from it. **Encapsulation** means
the fields are private and the only way in is through methods that enforce the rules. The set of
public methods is the class's **contract**.

Two habits make encapsulation real rather than ceremonial:

- Make fields `private` by default and expose the *smallest* set of methods that callers need.
- Do not write a getter and setter for every field. A setter on `balance` throws away the whole
  point of the `Account` example above.

:::manager
Review question that catches most encapsulation problems: **"Who else can change this?"** If the
answer is "anything with a reference", the class is a data bag, not an object, and its invariants
are unprotected.
:::

:::engineer
```java
// A data bag: encapsulation in name only
public class Customer {
    private String name;
    public String getName() { return name; }
    public void setName(String n) { name = n; }   // nothing is protected
}

// A real object: the invariant is enforced at construction and never violated after
public final class Customer {
    private final String name;
    public Customer(String name) {
        if (name == null || name.isBlank()) throw new IllegalArgumentException("name required");
        this.name = name;
    }
    public String name() { return name; }
}
```
:::

:::callout{kind=tip title="Immutable by default"}
If an object never changes after construction it cannot be in an invalid state later, can be shared
between threads safely, and is trivial to reason about. Reach for `final` fields and no setters
first; add mutability only when there is a reason.
:::

## Interfaces and polymorphism

An **interface** is a contract with no implementation: a list of method signatures. A class that
`implements` the interface promises to provide those methods. **Polymorphism** is what you get in
return: code written against the interface works with any implementation, including ones that do
not exist yet.

The classic bank example is a payment rail. Code that "sends a payment" should not care whether it
goes over SWIFT, Faster Payments or an internal ledger transfer.

:::engineer
```java
public interface PaymentRail {
    PaymentResult send(Payment payment);
}

public final class FasterPaymentsRail implements PaymentRail {
    public PaymentResult send(Payment p) { /* call the FPS gateway */ }
}

public final class LedgerTransferRail implements PaymentRail {
    public PaymentResult send(Payment p) { /* move money between internal accounts */ }
}

// The caller depends only on the interface:
public final class PaymentService {
    private final PaymentRail rail;
    public PaymentService(PaymentRail rail) { this.rail = rail; }
    public PaymentResult pay(Payment p) { return rail.send(p); }
}
```
Swapping rails, or using a fake rail in a test, needs no change to `PaymentService`.
:::

:::manager
Interfaces are where **vendor risk** and **testability** are decided. A service written against a
`PaymentRail` interface can change gateway providers in one class. A service that calls the vendor
SDK from twenty places cannot. When a team says "we are tightly coupled to vendor X", this is
usually the concrete thing they mean.
:::

## Inheritance versus composition

**Inheritance** (`class SavingsAccount extends Account`) lets a class reuse and specialise another.
It is the feature most associated with OOP and the one most often misused. The problem: a subclass
depends on the private details of its parent, so changing the parent can silently break children.
Deep inheritance trees become impossible to change.

**Composition** means building an object *out of* other objects: `Account` *has a* `InterestPolicy`
rather than *is a* `InterestBearingAccount`. The rule of thumb that has held up for thirty years:
**prefer composition; use inheritance only for a true "is-a" relationship with a stable parent.**

:::engineer
```java
// Inheritance: fragile as soon as Account changes how it applies fees
public class SavingsAccount extends Account {
    @Override public void withdraw(long cents) { super.withdraw(cents + FEE); }
}

// Composition: behaviour is a pluggable part
public final class Account {
    private final WithdrawalPolicy policy;
    public Account(WithdrawalPolicy policy) { this.policy = policy; }
    public void withdraw(long cents) { policy.check(this, cents); /* ... */ }
}
```
Modern Java also lets you *forbid* inheritance where it would be dangerous: mark the class `final`,
or use `sealed` to list exactly which subclasses are allowed.
:::

:::callout{kind=decision title="Interface, abstract class, or composition?"}
- Several unrelated classes must offer the same operations → **interface**.
- Several closely related classes share real implementation and a stable base → **abstract class**
  (rare; think twice).
- You want to vary behaviour at runtime or in tests → **composition** with an interface.
:::

:::manager
In a design review, a class hierarchy more than two levels deep is a yellow flag. Ask what happens
when the base class needs to change, and whether the levels exist to model the domain or to share
code. Sharing code is what composition is for.
:::

## Common mistakes

- **Anaemic objects**: every field has a getter and setter, and the rules live in a "service" class
  elsewhere. The object protects nothing.
- **Inheritance for reuse**: extending a class to borrow one method. Use composition.
- **Interfaces with one implementation and no test double**: often ceremony; sometimes fine as a
  seam. Ask what it is for.
- **Mutable shared state**: objects passed around and modified by several callers. Prefer immutable
  values and return new objects.
- **God classes**: one class with dozens of methods and every field. Split by responsibility.

:::callout{kind=bank-context}
Regulators care about *who can change what* and *whether the record is tamper-evident*. Immutable
value objects and narrow contracts are not just clean code; they are how you can answer an audit
question with a class name instead of a search across the codebase.
:::

## Putting it together

::::exercise{id=ex-model-payment type=design title="Model a payment instruction"}
A payment instruction has a debtor account, a creditor account, an amount, a currency and a
status that moves from `PENDING` to `SENT` or `REJECTED`, never backwards. Sketch (in prose or Java)
the classes you would create. Decide: which fields are immutable? Where does the "never backwards"
rule live? What is the interface between this and the payment rail?
:::solution
- `Money` (amount + currency): immutable value object; two `Money` with the same fields are equal.
- `AccountId`: immutable wrapper around the identifier, so an account id cannot be confused with
  any other string.
- `PaymentInstruction`: immutable except for status. Either make it fully immutable and return a
  new instance on each transition (`instruction.sent()` returns a new object with status `SENT`),
  or keep a private status field with `markSent()` / `reject(reason)` methods that throw if the
  transition is illegal. The rule lives **inside** the class, not in a service.
- `PaymentRail` interface with `send(PaymentInstruction)`, so the instruction never knows which
  network carries it.
- A manager reviewing this asks: can any code set status directly? If yes, the design has failed
  at the one thing it was for.
:::
::::
