---
title: "OOP in Practice: Design That Survives Review"
estimatedMinutes: 40
objectives:
  - "Apply SOLID as review questions rather than slogans"
  - "Use generics, records and sealed types to make illegal states unrepresentable"
  - "Recognise the five design smells most likely to cause a production incident"
status: ready
---

You know what a class and an interface are. This lesson is about the decisions that separate a
codebase that is easy to change from one that everyone is afraid of.

## Where the basics break down

Encapsulation, interfaces and composition are easy to get right in a 200-line example. They fail at
scale in predictable ways. Rules migrate out of objects into "service" classes because it is easier
to add one more `if` to a 400-line service than to touch the object everyone else depends on.
Interfaces multiply without a second implementation, because someone read that interfaces are good
practice and stopped there. Class hierarchies form to share a utility method, not to model the
domain, and every future change has to be checked against every subclass.

None of this looks wrong in a single pull request. A method that grows from ten lines to thirty is a
normal diff. The damage is cumulative: eighteen months later the "simple" `OrderService` has forty
methods, half the domain's business rules live in it, and nobody can say with confidence what
happens when an order is cancelled after it has shipped. This is the point at which a bank calls it
a "legacy system" — usually about a service that is five years old, not twenty.

:::manager
Ask for the file size and method count of the three largest classes in a service before a design
review, not during it. A `Service` or `Manager` class with forty-plus methods and half the codebase's
`if` statements is a structural risk independent of who wrote it or how good the tests are. It is
also the single best predictor of how long the next feature will take.
:::

:::engineer
```java
// The class that starts simple and never gets refactored
public class OrderService {
    public void cancel(Order o) { /* ... */ }
    public void ship(Order o) { /* ... */ }
    public void applyDiscount(Order o, Discount d) { /* ... */ }
    public boolean canCancel(Order o) { /* logic that belongs on Order */ }
    // ...thirty-five more methods, most of them really Order's business
}
```
The tell is `canCancel(Order o)` living outside `Order`. If the rule needs only the order's own
fields, it belongs on `Order`. A service class should orchestrate collaborators (repository, payment
gateway, clock); it should not be where the domain's rules are hiding.
:::

## SOLID as review questions

SOLID as five nouns is not useful in a review. Restated as questions, each one catches a specific,
recurring smell.

| Principle | Ask in review | Smell it catches |
| --- | --- | --- |
| Single responsibility | "What would make this class change, for reasons that have nothing to do with each other?" | God classes; a `Customer` that changes for tax rules *and* UI formatting *and* persistence. |
| Open/closed | "To add a new case, do I edit existing code or add a new class?" | A `switch` on a type code that grows every quarter, instead of polymorphism or a sealed hierarchy. |
| Liskov substitution | "Does every subtype honour the parent's contract, including its exceptions and edge cases?" | A subclass that throws `UnsupportedOperationException` from an inherited method. |
| Interface segregation | "Does every implementer need every method on this interface?" | A fat interface where three of five implementations `throw new UnsupportedOperationException()`. |
| Dependency inversion | "Does this class depend on a concrete, framework-specific thing it could depend on an abstraction instead?" | Domain code importing a JPA or vendor SDK type directly. |

:::engineer
```java
// Open/closed violation: every new fee type means editing this method
double fee(String feeType, Order o) {
    if (feeType.equals("STANDARD")) return o.total() * 0.01;
    if (feeType.equals("EXPRESS"))  return o.total() * 0.03;
    // next quarter: another if
    throw new IllegalArgumentException("unknown fee type");
}

// Fixed: new fee types are new classes, existing code is untouched
sealed interface FeePolicy permits StandardFee, ExpressFee {}
record StandardFee() implements FeePolicy {}
record ExpressFee()  implements FeePolicy {}

double fee(FeePolicy policy, Order o) {
    return switch (policy) {
        case StandardFee s -> o.total() * 0.01;
        case ExpressFee e  -> o.total() * 0.03;
    };
}
```
:::

:::manager
SOLID violations are cheap to spot once you have the questions. They are expensive to fix later,
because fixing "single responsibility" after the fact means splitting a class that forty other
classes already call. The cost of asking these five questions in review is minutes; the cost of not
asking is a quarter of refactoring eighteen months from now.
:::

## Making illegal states unrepresentable

The strongest form of validation is the kind that does not need to run, because the compiler will
not accept the invalid state in the first place. Four tools do most of the work: records for
immutable data, sealed hierarchies for a closed set of outcomes, enums with behaviour instead of a
string plus a `switch` elsewhere, and typed identifiers so a debtor account id cannot be passed where
a creditor account id was expected.

:::engineer
```java
// Two identifiers that are both "just a String": the compiler will not stop you
void transfer(String debtorId, String creditorId, long cents) { ... }
transfer(creditorId, debtorId, cents);          // compiles, silently wrong

// Typed identifiers: the compiler catches the swap
record AccountId(String value) {}
record DebtorId(AccountId id) {}
record CreditorId(AccountId id) {}
void transfer(DebtorId debtor, CreditorId creditor, long cents) { ... }
transfer(creditorAsDebtor, debtorAsCreditor, cents);   // does not compile
```
The `AccountId` wrapper also stops a `String` meant to be an account id from being concatenated,
logged unmasked by accident, or compared to an unrelated `String` such as a currency code.
:::

:::callout{kind=decision title="How far to take typed wrappers"}
Wrap identifiers and money; both cause real production bugs when confused with a bare `String` or
`long`. Do not wrap every primitive — a `record Age(int value)` around a field used nowhere else
is ceremony without a corresponding bug class it prevents. Wrap what has been, or plausibly will be,
mixed up with something else.
:::

:::manager
This is where "clean code" earns its keep financially: a debtor/creditor swap caught at compile time
costs nothing. The same bug caught in UAT costs a test cycle. Caught in production, on a payment
service, it costs an incident report and possibly a regulatory conversation. Ask whether the team's
identifiers and money types are distinct types or interchangeable primitives.
:::

## Generics without the pain

Generics exist so a container or algorithm can be written once and used with any type, without
casting. `Repository<T, ID>` is the shape you will see constantly: `T` is the entity, `ID` is its key
type, and the interface is written once for every repository in the system.

Bounded types restrict what a generic parameter can be: `<T extends Comparable<T>>` means "any type
that can compare itself to another of the same type." Wildcards describe variance at the call site:
`List<? extends Number>` can be *read* as numbers but not written to (you do not know the exact
type); `List<? super Integer>` can be *written* to with an `Integer` but read only as `Object`. The
mnemonic is PECS: **P**roducer **E**xtends, **C**onsumer **S**uper.

:::engineer
```java
public interface Repository<T, ID> {
    Optional<T> findById(ID id);
    T save(T entity);
}

public interface AccountRepository extends Repository<Account, AccountId> {
    List<Account> findByCustomer(CustomerId id);
}

// PECS in practice: this method only reads from the list, so "extends"
double sum(List<? extends Number> values) {
    double total = 0;
    for (Number n : values) total += n.doubleValue();
    return total;
}
```
:::

:::manager
Generics are worth their complexity in shared, reusable code: a `Repository<T, ID>` used by thirty
entity types earns the abstraction back thirty times over. A one-off generic parameter on a class
with a single caller is usually solving a problem nobody has yet. In hiring and review terms:
expect engineers to read `<T extends Comparable<T>>` fluently; do not expect, or reward, inventing
new generic abstractions where a concrete type would do.
:::

## Dependency direction

Dependency inversion, applied: the domain package should not import the framework. `Account` and
`PaymentInstruction` should have no `org.springframework` or `jakarta.persistence` import anywhere.
The domain defines interfaces for what it needs (`AccountRepository`, `Clock`); infrastructure code
implements them. This is "ports and adapters" without needing the full hexagonal-architecture
vocabulary to justify it: the port is the interface the domain owns, the adapter is the
framework-specific class that implements it elsewhere.

:::engineer
```java
// domain package: no framework imports
package bank.domain;
public interface AccountRepository {
    Optional<Account> findById(AccountId id);
    void save(Account account);
}

// infrastructure package: depends inward on the domain interface
package bank.infra.persistence;
@Repository
class JpaAccountRepository implements bank.domain.AccountRepository {
    private final SpringDataAccountRepository jpa;
    public Optional<Account> findById(AccountId id) { return jpa.findById(id.value()).map(this::toDomain); }
    public void save(Account account) { jpa.save(toEntity(account)); }
}
```
Spring wires the interface to the implementation at startup. The domain never knows Spring exists.
:::

:::callout{kind=decision title="Full hexagonal architecture, or just this?"}
Full ports-and-adapters with separate modules and mapping layers pays off in a large domain with
multiple delivery mechanisms (REST, batch, messaging) or a genuine chance of swapping persistence.
For a small service with one database and one API, the lightweight version — domain interfaces,
framework-specific implementations, no framework imports in the domain package — gets most of the
benefit for a fraction of the ceremony. Reach for the heavier structure when the seams are real, not
by default.
:::

:::manager
"Does the domain package import Spring or JPA?" is a review question you can ask without reading
every line of a diff — it is a single `grep`. A yes is not automatically wrong for a small service,
but it means the team has made a decision, consciously or not, that this domain logic cannot be
tested or reused without a Spring context. Worth knowing which it was.
:::

## What good looks like

A one-page checklist for reviewing a Java service, in the order it is usually worth checking:

- **Boundaries.** Public methods on domain classes are the smallest set callers need. Fields are
  private. Nothing outside the aggregate can put it in an invalid state.
- **Immutability by default.** Value objects (`Money`, `AccountId`, `PaymentInstruction`'s
  non-status fields) are immutable. Mutable state is deliberate, not incidental.
- **Error modelling.** Failure is a return type (`sealed interface Result`, or a checked/documented
  exception), not a `null`, a boolean flag, or a logged-and-swallowed exception.
- **Dependency direction.** Domain code does not import the framework. Tests of business rules do
  not need a Spring context or a database.
- **Tests describe rules, not implementation.** A test named `shouldReturnTrue` tells you nothing;
  `withdrawalBeyondOverdraftIsRejected` tells you what broke when it fails.

:::manager
This checklist is deliberately short enough to actually use. In a review meeting, pick one item and
ask the team to defend the current design against it, rather than trying to cover all five on every
PR. Consistency over exhaustiveness catches more problems over a quarter.
:::

:::engineer
```java
// Error modelling: a sealed Result instead of a thrown exception for an expected failure
sealed interface WithdrawResult permits Approved, Declined {}
record Approved(long newBalanceCents) implements WithdrawResult {}
record Declined(String reason) implements WithdrawResult {}

WithdrawResult withdraw(long cents) {
    if (cents > balanceCents + overdraftCents) return new Declined("overdraft exceeded");
    balanceCents -= cents;
    return new Approved(balanceCents);
}
```
Exceptions are still right for genuinely exceptional, programmer-error conditions (a null argument,
a broken invariant). A declined withdrawal is an expected outcome, not an exception.
:::

## Exercises

::::exercise{id=ex-review-scenario type=scenario title="The team proposes a base entity class"}
The team proposes `abstract class BaseEntity` with `id`, `createdAt`, `updatedAt`, `version` and
audit fields, which every domain class will extend. What do you ask, and what would you accept?
:::solution
What to ask first: **what is actually shared?** `id`, `createdAt`/`updatedAt` and `version` are
persistence concerns (JPA optimistic locking uses `@Version`; the timestamps are usually set by
`@PrePersist`/`@PreUpdate` or auditing infrastructure). They are not domain rules, and every unrelated
aggregate — `Account`, `Customer`, `PaymentInstruction` — extending one base class couples them all to
one shape for reasons that have nothing to do with the domain. That is inheritance for reuse, the
smell from the first section of this lesson: change the base class's `equals`, and every entity in
the system is affected at once.

Two follow-up questions that usually settle it:

- **Identity vs value equality.** Entities are usually compared by identity (same `id` means same
  entity, even if other fields differ) while records default to value equality. A shared
  `BaseEntity.equals()` based on `id` is reasonable *if* every subclass genuinely wants identity
  semantics — but a base class is the wrong place to discover that one entity actually wants value
  semantics, because by then it is one `equals()` override away from a bug that only shows up in a
  `HashSet`.
- **Does this leak into the domain?** If `BaseEntity` lives in a package the domain has to import to
  compile, every aggregate now depends on a persistence-flavoured type (`@Version` is a JPA
  annotation) even in code that has nothing to do with the database.

What to accept: a composed `Audit` value object (`record Audit(Instant createdAt, Instant updatedAt)`)
that entities hold as a field, not a class they extend, plus a persistence-layer convention — a JPA
`@MappedSuperclass` used only inside the infrastructure/persistence package, never imported by domain
code — for `id` and `@Version`. This keeps the genuinely shared *mechanism* (versioning, timestamps)
without forcing every unrelated aggregate into one inheritance tree, and keeps the domain package free
of persistence annotations. If the team pushes back that this is more typing: it is — a handful of
extra lines per entity, once, versus an inheritance dependency every future change to `BaseEntity`
has to consider across the whole domain.
:::
::::
