---
title: "Spring Boot in Production"
estimatedMinutes: 40
objectives:
  - "Layer a service so business logic is testable without a running container"
  - "Place transaction boundaries correctly and recognise the self-invocation trap"
  - "Choose the right test slice instead of always reaching for a full context"
  - "Read what Actuator and the security starter expose, and secure both deliberately"
status: ready
---

You can build a working controller wired to a service and a repository. This lesson is about what
breaks as that one service becomes ten, gets a second team of contributors, and goes through its
first production incident.

## Where the basics break down

The pattern from the Beginner lesson — controller calls service, service calls repository — holds up
fine until the service class becomes the place every rule lives, called from three controllers and
a scheduled batch job, with a growing number of `@Autowired` fields nobody wants to touch. At the
same time, tests written against `@SpringBootTest` (a full application context, real or embedded
database, the works) start taking twenty seconds each, so the suite that should run in under a
minute takes fifteen, and people stop running it locally before pushing.

Both problems have the same root cause: the ease of wiring anything to anything with an annotation
removes the friction that, in plain Java, would have made you think about where a class's
responsibility actually ends. Spring Boot does not enforce layering, transaction boundaries, or test
isolation — it makes all three easy to get right, and equally easy to ignore.

:::manager
A fifteen-second-per-test suite is not a performance nitpick; it is why a team stops running tests
before pushing and starts finding out from a failed pipeline twenty minutes later. Ask, in a status
update, how long the unit test suite takes locally. Anything over a few seconds for a small service
usually means most "unit" tests are secretly integration tests.
:::

:::engineer
```java
// Everything reachable from one @SpringBootTest: real context, real (embedded) DB, real beans
@SpringBootTest
class PaymentServiceTest {
    @Autowired PaymentService service;   // fine for a handful of true integration tests
}
```
This is not wrong to have; it is wrong to have as the *only* kind of test, for the reason covered in
the testing-slices section below.
:::

## Layering that earns its keep

Controller / service / repository is a default, not a law. For genuine CRUD with no business rule
beyond "save this record," a controller calling a repository directly is honest, and an empty
pass-through service adds a file without adding a decision. Layering earns its keep once there is a
rule to enforce, a transaction spanning more than one repository call, or a reason a controller
should not see the persistence model directly.

:::engineer
```java
// No rule, no transaction spanning calls: the service adds nothing
@RestController
class AuditLogController {
    private final AuditLogRepository repository;
    AuditLogController(AuditLogRepository repository) { this.repository = repository; }

    @GetMapping("/audit-log/{id}")
    AuditEntry get(@PathVariable String id) { return repository.findById(id).orElseThrow(); }
}

// A rule and a multi-step transaction: the service is doing real work
@Service
class PaymentService {
    private final PaymentRepository payments;
    private final LedgerRepository ledger;

    @Transactional
    PaymentResult submit(PaymentRequest request) {
        var instruction = payments.save(PaymentInstruction.pending(request));
        ledger.reserve(instruction.debtorAccount(), instruction.amount());
        return PaymentResult.accepted(instruction.id());
    }
}
```
:::

:::callout{kind=decision title="Skip the service layer, or keep it for consistency?"}
Skipping the service layer for trivial endpoints keeps the codebase honest about where complexity
actually lives. The cost is inconsistency: a new contributor cannot assume every controller follows
the same shape. Many teams accept that cost deliberately; a few mandate a service layer everywhere
purely for that consistency. Either is defensible — what is not defensible is a service layer that
exists everywhere but only does real work in a third of the places.
:::

:::manager
In review, a one-line pass-through service is not free: it is a file to read, a bean to wire, a
mock to configure in every controller test. Ask whether it is there because a rule genuinely lives
there, or out of habit.
:::

## Transactions: where the boundary lives

`@Transactional` starts a database transaction around the annotated method and commits it if the
method returns normally, or rolls it back if it throws. It belongs at the **service** layer, around
a use case that may touch more than one repository — not on the repository methods themselves
(which are typically already transactional per call) and not on the controller (which should not
know a database is involved).

Two mechanics that catch people who knew Spring before this became idiomatic:

:::engineer
```java
@Service
public class PaymentService {

    // BUG: calling this.submit(...) from another method on the same object
    // does NOT go through the transactional proxy. @Transactional is silently ignored.
    void batchSubmit(List<PaymentRequest> requests) {
        for (var r : requests) submit(r);      // self-invocation: no transaction here
    }

    @Transactional
    void submit(PaymentRequest r) { /* ... */ }
}
```
`@Transactional` works by wrapping the bean in a proxy. A call from outside the class goes through
the proxy; a call from *inside* the class, like `this.submit(r)` above, does not. The fix is usually
to move the looped call into a different bean, or restructure so the transactional method is the
entry point.

By default, `@Transactional` rolls back on unchecked exceptions only. A checked exception commits
the transaction unless you add `rollbackFor = Exception.class`. This surprises people who expect any
thrown exception to abort the transaction.
:::

:::callout{kind=gotcha title="Read-only transactions"}
`@Transactional(readOnly = true)` on a query method is not just documentation: it lets the
persistence provider skip dirty-checking and, on some databases, use a read replica. Mark queries
read-only; do not mark everything transactional "to be safe."
:::

:::manager
Self-invocation is the single most common Spring transaction bug, and it produces no error — the
code runs, the data is just not protected the way the annotation implies. It is worth one specific
question in review: "does any `@Transactional` method call another `@Transactional` method on
`this`?"
:::

## Testing slices: pick the smallest context that proves the behaviour

A "slice" test starts only the part of the Spring context relevant to what you are testing, which is
both faster and a better test of the boundary you actually care about.

:::engineer
```java
// Controller behaviour, service mocked: no database, no real HTTP port, fast
@WebMvcTest(PaymentController.class)
class PaymentControllerTest {
    @Autowired MockMvc mvc;
    @MockBean PaymentService service;
}

// Repository behaviour against a real (embedded) database, nothing else started
@DataJpaTest
class PaymentRepositoryTest {
    @Autowired PaymentRepository repository;
}

// Business rules with no Spring at all: fastest, and the majority of your tests should look like this
class PaymentInstructionTest {
    @Test void cannotMoveBackwardsFromSent() { /* new PaymentInstruction(...).sent().reject(...) throws */ }
}
```
:::

:::callout{kind=decision title="Which test for which layer"}
Plain unit tests (no Spring annotation at all) for business rules on domain objects — fastest,
should be the majority. `@WebMvcTest` for controller request/response shape and status codes.
`@DataJpaTest` for query correctness against a real schema. `@SpringBootTest` sparingly, for the
handful of true end-to-end paths worth the cost. A suite that is mostly `@SpringBootTest` is testing
Spring, not your code.
:::

:::manager
Test slice choice is a leading indicator of design quality: a service that is hard to test without
`@SpringBootTest` is usually a service with framework concerns leaking into business logic. If a
team says "we can't unit test this without starting the whole context," that is itself the finding.
:::

## Actuator and the security starter: read the defaults

`spring-boot-starter-actuator` adds operational endpoints — `/actuator/health`, `/actuator/metrics`,
`/actuator/info` — that a load balancer or monitoring system can poll. Add
`spring-boot-starter-security` alongside it (or on its own) and Boot locks everything down by
default: every endpoint requires authentication, and actuator endpoints beyond `/health` are not
exposed over the web at all unless you explicitly say so.

:::engineer
```yaml
management:
  endpoints:
    web:
      exposure:
        include: health, info, metrics   # explicit allow-list, not "*"
  endpoint:
    health:
      show-details: when-authorized
```
```java
@Configuration
public class SecurityConfig {
    @Bean
    SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http.authorizeHttpRequests(auth -> auth
                .requestMatchers("/actuator/health").permitAll()
                .anyRequest().authenticated())
            .csrf(csrf -> csrf.disable());   // fine for a stateless JSON API; know why before copying this line
        return http.build();
    }
}
```
:::

:::callout{kind=bank-context}
An unauthenticated `/actuator/env` endpoint on a production service is a real finding in a real pen
test: it can expose environment variables, including ones that look like secrets. "We added
actuator for health checks" is not the same statement as "we reviewed what actuator exposes."
:::

:::manager
Two review questions that take thirty seconds: what does `management.endpoints.web.exposure.include`
say, and is `csrf().disable()` present with a comment explaining why. Both are one grep, and both are
common findings in a first security review of a new Boot service.
:::

## What good looks like

- **Layering matches complexity.** A service class exists because a rule or a multi-step transaction
  lives there, not by convention alone.
- **`@Transactional` is at the service boundary**, on methods called from outside the class, with
  `rollbackFor` set deliberately if checked exceptions must roll back.
- **Most tests need no Spring context.** Slices (`@WebMvcTest`, `@DataJpaTest`) are used for the
  boundary they test; `@SpringBootTest` is the exception, not the default.
- **Actuator exposure is an explicit allow-list**, and sensitive endpoints require authentication.
- **Security configuration is a bean you can read**, not a default nobody looked at, and any
  disabled protection (`csrf`, CORS) has a comment saying why it is safe here.

:::manager
This checklist doubles as an onboarding tool: a new engineer who can find the `SecurityConfig`
class, name the one or two `@SpringBootTest`s and say why the rest are slices, and point at where
`@Transactional` boundaries are, understands the service. If they cannot, the design — not the
engineer — is probably the problem.
:::

:::engineer
Five checks you can run from a terminal in a minute, before reading a single line of business logic:
```
grep -r "@Transactional" --include=*.java src/main | grep -v Service   # boundary in the wrong layer?
grep -rc "@SpringBootTest\|@WebMvcTest\|@DataJpaTest" src/test          # test slice mix
grep -rn "exposure" src/main/resources/application.yml                 # actuator allow-list?
grep -rn "csrf" src/main/java                                          # disabled and explained?
```
:::

## Exercises

::::exercise{id=ex-transactional-controller type=scenario title="Transactional on the controller"}
A pull request puts `@Transactional` directly on a `@RestController` method, wrapping a call to two
repositories, "to keep it simple — one less class." What do you ask, and what would you accept?
:::solution
What is actually wrong: `@Transactional` on a controller works — the proxy mechanism does not care
which stereotype annotation is on the class — but it puts a persistence concern (transaction
boundaries) in the layer meant to know nothing about persistence, and it means the transaction
boundary is now defined by whatever the controller method happens to call, rather than by a
named business operation. The next controller that needs the same two repository calls, in the same
transaction, will either duplicate the logic or call this controller method, which is worse.

Questions to ask: is this genuinely the only caller of this operation, now and plausibly in future
(a scheduled job, another controller, a message listener)? If yes, and the operation truly has no
rule beyond "save two things together," the objection softens — but "one less class" is not by
itself a reason to relocate a transaction boundary into the HTTP layer.

What to accept: move the two repository calls and the `@Transactional` annotation into a small
`@Service` method named after the business operation (`submitPayment`, not `handleRequest`). This
is not "adding a class for the sake of it" — it is putting the transaction boundary where a second
caller can reach it, and where a test can exercise it without `MockMvc` or an HTTP layer at all. If
the team's real objection is boilerplate, the answer is a smaller service, not persistence logic
in the controller.
:::
::::
