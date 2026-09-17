---
title: "Spring Boot"
estimatedMinutes: 35
objectives:
  - "Explain dependency injection without using the word 'magic'"
  - "Say what a starter and auto-configuration actually do"
  - "Build and run a small REST controller with environment-specific configuration"
status: ready
---

You have written Java without Spring. This lesson assumes that and nothing else: not Spring 2,
not annotations, not "you'll remember it once you see it." If a team member says a bug is caused by
"the Spring magic," this lesson is what they mean, made literal.

## Why Spring Boot exists

A REST service needs, at minimum: an HTTP server, a way to turn incoming JSON into Java objects and
back, a way to wire your classes together (the controller needs the service, the service needs the
repository), and a way to change configuration between your laptop, a test environment and
production without editing code. Doing all of this by hand in plain Java is not hard, but it is the
same boilerplate in every service: a `main` method that constructs a `DataSource`, then a
repository that needs the `DataSource`, then a service that needs the repository, then a controller
that needs the service, then an HTTP server to register the controller with.

Spring Boot's job is to make that wiring automatic and the configuration external, so the code you
write is the part that is actually specific to this service. "Boot" is the important word: it is
Spring (a wiring framework, over twenty years old) plus an opinionated, batteries-included way to
start a runnable application from it, introduced in 2014. Before Boot, this wiring was written out
by hand in XML files; you will meet that history in the Rusty lesson if you have it. Here, you start
from zero.

:::manager
The business case for Boot is developer time: a new service goes from "empty folder" to "running
HTTP endpoint with health checks" in minutes instead of days, because the wiring and the ops
plumbing (health endpoint, metrics, structured startup logging) are provided, not built each time.
The cost is that the wiring happens by convention, which is invisible until it does something you
did not expect — which is most of what the rest of this lesson explains.
:::

:::engineer
```java
// The entire entry point of a Spring Boot application
@SpringBootApplication
public class BankApplication {
    public static void main(String[] args) {
        SpringApplication.run(BankApplication.class, args);
    }
}
```
This starts an embedded HTTP server (Tomcat, by default) and builds the wiring described below, all
from one annotation and one method call.
:::

## Dependency injection, actually

Start with the problem, not the framework. A `PaymentService` needs a `PaymentRepository` to do its
job. Without any framework, you write this:

```java
PaymentRepository repository = new JdbcPaymentRepository(dataSource);
PaymentService service = new PaymentService(repository);
```

`PaymentService` does not create its own `PaymentRepository` — it is handed one. That handing-over is
**dependency injection**: a class declares what it needs (usually as constructor parameters) and
something else supplies it. This is not a Spring idea; it is a design pattern you can and do use in
plain Java. Spring's contribution is doing the "something else supplies it" part automatically, for
every class in the application, based on annotations, so you never write the wiring code above by
hand.

:::engineer
```java
@Service
public class PaymentService {
    private final PaymentRepository repository;

    // Spring sees this constructor, sees it needs a PaymentRepository,
    // finds a bean of that type, and passes it in. You never call "new PaymentService(...)".
    public PaymentService(PaymentRepository repository) {
        this.repository = repository;
    }
}
```
:::

:::manager
"Dependency injection" is often introduced as a testing benefit, and it is one — a test can pass a
fake `PaymentRepository` into `PaymentService`'s constructor with no framework involved at all. But
the more direct benefit for a manager is that it is what makes the interface-based design from the
OOP lessons practical at the scale of a real application: nobody has to manually thread forty
objects together by hand every time one dependency changes.
:::

## Beans and the application context

A **bean** is just an object that Spring created and is managing — an instance in a registry called
the **application context**. At startup, Spring scans your code for classes annotated `@Component`
(and its more specific relatives `@Service`, `@Repository`, `@Controller`), constructs one instance
of each, works out what each one's constructor needs, and wires them together. This scan only looks
at the package your `@SpringBootApplication` class lives in, and packages below it — a class in a
sibling package will not be found.

You can also create beans explicitly for things you do not own the source of (a third-party client,
a `DataSource`):

:::engineer
```java
@Configuration
public class ClientConfig {
    @Bean
    public PaymentGatewayClient paymentGatewayClient(AppProperties props) {
        return new PaymentGatewayClient(props.gatewayUrl());
    }
}
```
`@Bean` methods are for objects you construct yourself, usually from a library. `@Component` and its
relatives are for your own classes, found by scanning.
:::

:::manager
"Where does this object come from?" is a legitimate onboarding question in a Spring codebase, and
the honest answer is often "Spring found it by scanning the classpath," which is exactly the kind of
implicit behaviour that is fast to write and slow to debug for someone new to the codebase. Expect a
week or two of unfamiliarity here for an experienced non-Spring engineer; it is not a sign of
weakness.
:::

## Starters and auto-configuration: the actual magic

A **starter** is a dependency (a single entry in your build file) that pulls in a curated bundle of
libraries for one job. `spring-boot-starter-web` brings in an embedded Tomcat, Jackson for
JSON, and Spring's MVC framework, all pinned to versions known to work together. You add one line;
you get a working HTTP stack.

**Auto-configuration** is what happens next: Spring Boot inspects what is on the classpath and
conditionally creates beans for it. If it sees Tomcat on the classpath and no `DataSource` bean
already defined, and it sees an embedded-database driver, it will configure an embedded database for
you. This is genuinely the "magic": nothing you wrote asked for a `DataSource` bean, and one exists
anyway. It is not arbitrary — every auto-configuration class has a condition (`@ConditionalOnClass`,
`@ConditionalOnMissingBean`) that you can read — but it is invisible until you go looking.

:::callout{kind=gotcha title="Why is there a DataSource I never configured?"}
The most common "how did that get there" question from someone new to Boot. Adding an in-memory
database dependency (H2, for example) to a project, even accidentally via a transitive dependency,
is enough for Boot to auto-configure a `DataSource` bean pointing at it. Check `mvn dependency:tree`
or your build tool's equivalent before assuming a bean was configured deliberately.
:::

:::engineer
You can see exactly what Boot decided and why with one flag:
```
--debug
```
run at startup, prints an auto-configuration report: which configuration classes matched, and
which did not, with the condition that decided it.
:::

:::manager
"Which dependency pulled that in?" is a fair, common question in a codebase you did not build from
scratch, and the honest answer is often "nobody decided it, it followed from what is on the
classpath." This is a real cost of the convenience: a dependency added for one reason can silently
change what runs, including in production. Ask a new team to run with `--debug` once, on purpose,
so the report is not a surprise the first time it matters.
:::

## A REST controller

The class that receives HTTP requests. `@RestController` combines `@Controller` (this is a
Spring-managed bean that handles requests) with `@ResponseBody` (return values are serialised to
JSON, not treated as a view name).

:::engineer
```java
@RestController
@RequestMapping("/payments")
public class PaymentController {
    private final PaymentService service;

    public PaymentController(PaymentService service) {   // constructor injection, same as before
        this.service = service;
    }

    @GetMapping("/{id}")
    public PaymentView get(@PathVariable String id) {
        return service.find(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    @PostMapping
    public PaymentView create(@RequestBody CreatePaymentRequest request) {
        return service.create(request);
    }
}
```
Return a plain object; Jackson (pulled in by `spring-boot-starter-web`) turns it into JSON. Accept a
plain object annotated `@RequestBody`; Jackson turns the incoming JSON into it. No serialisation
code is written by you.
:::

:::manager
The controller is the one place in this list of classes that should stay thin: it translates HTTP in
and out, and calls the service. A controller with business logic in it (checking balances, applying
rules) is a design smell independent of Spring — it is the "rules live in the wrong place" problem
from the OOP lessons, just with an `@RestController` annotation on it.
:::

## Configuration and profiles

Configuration lives in `application.yml` (or `.properties`), not in code, so the same jar can behave
differently in dev, test and production. `@ConfigurationProperties` binds a block of that file to a
typed Java object, which is preferable to scattering `@Value("${...}")` through the codebase because
it is one place to see everything the service is configured with, and it fails fast at startup if a
required value is missing.

:::engineer
```yaml
# application.yml
gateway:
  url: https://gateway.example.internal
  timeout-ms: 2000
---
spring:
  config:
    activate:
      on-profile: prod
gateway:
  url: https://gateway.prod.internal
  timeout-ms: 500
```
```java
@ConfigurationProperties(prefix = "gateway")
public record GatewayProperties(String url, int timeoutMs) {}
```
Run with `-Dspring.profiles.active=prod` (or the `SPRING_PROFILES_ACTIVE` environment variable) and
the `prod` block overrides the defaults above it. No code change, no rebuild.
:::

:::callout{kind=bank-context}
Externalised, profile-based configuration is what makes "the same artefact was promoted from test to
production unchanged" a true statement you can hand to a change-control process. If configuration is
baked into code, that claim is false no matter what the deployment ticket says.
:::

:::manager
Ask, for any service, how many profiles exist and who can change what in each. A `prod` profile a
developer can edit and deploy without review is a control gap regardless of how good the code is;
the review question is not "is Spring configured correctly" but "who can change production
configuration, and through what process."
:::

## Common mistakes

- **Field injection.** `@Autowired private PaymentRepository repository;` works, but hides the
  dependency from the constructor, makes the class impossible to construct in a plain unit test
  without Spring, and allows circular dependencies that constructor injection would catch at
  startup. Use constructor injection; for one dependency it is barely more typing.
- **Business logic in the controller.** Symptoms and cause described above.
- **Treating auto-configuration as unconfigurable.** Almost everything Boot auto-configures can be
  overridden by defining your own bean of the same type, or turned off explicitly.
- **`@Component` on everything, including things that are not services.** A plain value object or
  utility class does not need to be a Spring bean.
- **Hardcoding an environment-specific value** instead of using a profile, "temporarily," which
  outlives the person who wrote it.

## Putting it together

::::exercise{id=ex-hello-config type=design title="A configured hello endpoint"}
Design (in prose or Java) a REST endpoint `GET /greeting` that returns a greeting message read from
configuration, where the message differs between a `dev` profile and a `prod` profile. Name the
classes you would create, what annotates each one, and where the profile-specific value lives.
:::solution
- `GreetingProperties` — a record annotated `@ConfigurationProperties(prefix = "greeting")` with one
  field, `message`. This is the typed, fail-fast way to bind configuration, in preference to a bare
  `@Value("${greeting.message}")` scattered in the controller.
- `application.yml` with a default `greeting.message` and a `---` document activated
  `on-profile: dev` (and another for `prod`) overriding it.
- `GreetingController` — `@RestController`, constructor takes `GreetingProperties`, one
  `@GetMapping("/greeting")` method returning a small response object built from
  `properties.message()`.
- No `@Service` is really needed for logic this small; a manager reviewing this should not expect
  an artificial service layer wrapping one field read. (The Intermediate lesson covers when layering
  earns its keep.)
- Running with `SPRING_PROFILES_ACTIVE=dev` vs `SPRING_PROFILES_ACTIVE=prod` changes the response
  with no code change and no rebuild — the property to check in a review of this design.
:::
::::
