---
title: "Spring Boot — mapping from XML-era Spring"
estimatedMinutes: 18
objectives:
  - "Map applicationContext.xml and web.xml concepts onto Spring Boot equivalents"
  - "Know what changed and roughly when, so unfamiliar code is dateable"
  - "Spot the gotchas that survive from your era, and the new ones"
status: ready
---

You configured Spring with XML: `<bean>` definitions, `applicationContext.xml`, a `web.xml` mapping
`DispatcherServlet` to a URL pattern, a WAR dropped into Tomcat. That Spring still exists underneath
everything described below. Boot did not replace it; Boot removed the need to write most of the
wiring by hand and packaged the result as a runnable jar. This assumes you can read Java and spends
its time on the delta.

## What you probably remember

| Your era | Still called this in Boot | Notes |
| --- | --- | --- |
| `<bean id="..." class="...">` in `applicationContext.xml` | `@Component` / `@Bean`, found by classpath scanning | Same `ApplicationContext` and bean lifecycle underneath. |
| `<constructor-arg>` / `<property>` wiring | Constructor injection via `@Autowired`-eligible constructor (no annotation needed if there is only one) | Autowiring by type, same as your era's `autowire="byType"`. |
| `web.xml` mapping `DispatcherServlet` | Not written at all; an embedded Tomcat/Jetty/Undertow is started in `main()` | No WAR, no external container, unless you explicitly opt back in. |
| `@Controller` + `@RequestMapping` returning a view name | `@RestController` (`@Controller` + `@ResponseBody`), `@GetMapping`/`@PostMapping` | JSON APIs are now the default assumption, not JSPs. |
| Deploying a WAR to a Tomcat instance someone else manages | Running (or containerising) an executable jar with the server inside it | Ops model shift, not just a code shift — see below. |
| `<context:property-placeholder location="..."/>` | `application.yml`/`.properties`, profiles, `@ConfigurationProperties` | Layered, profile-aware, typed. |

## What changed since

:::callout{kind=changed-since title="Spring Boot itself (1.0, 2014)"}
The headline change. Auto-configuration plus starters plus an embedded server means most XML `<bean>`
wiring for common infrastructure (a `DataSource`, a `DispatcherServlet`, a JSON mapper) is no longer
written by anyone — Boot infers it from what is on the classpath. Your `applicationContext.xml`
instincts still apply to your *own* beans; they mostly do not need to be written for the framework's.
:::

:::callout{kind=changed-since title="Java config over XML (predates Boot, now near-universal)"}
`@Configuration` classes with `@Bean` methods replaced XML `<bean>` definitions as the idiomatic way
to configure anything Boot does not auto-configure for you. If you see an XML `applicationContext`
file in a modern codebase, it is either a very old module or a deliberate legacy-interop choice —
worth asking which.
:::

:::callout{kind=changed-since title="javax.* to jakarta.* (Spring Boot 3.0, 2022)"}
Spring Boot 3 moved off the `javax.servlet`, `javax.persistence` etc. packages to `jakarta.*`,
following the wider Java EE → Jakarta EE renaming, and requires Java 17 as a floor. This is a
mechanical but real breaking change: old code with `javax.persistence.Entity` will not compile
against Boot 3 without a namespace migration. If you are told "we're stuck on Boot 2," this is
usually why.
:::

:::callout{kind=changed-since title="WebSecurityConfigurerAdapter removed (Spring Security 5.7, 2022; gone in 6.0)"}
The class-extension style of security config (`extends WebSecurityConfigurerAdapter`, override
`configure(HttpSecurity)`) is gone. Security config is now a `@Bean` returning a `SecurityFilterChain`,
built with a lambda-based DSL. If a tutorial or a codebase still extends
`WebSecurityConfigurerAdapter`, it predates 2022 and will not compile against current Spring Security.
:::

:::callout{kind=changed-since title="Virtual threads (Spring Boot 3.2, 2023, needs Java 21)"}
Setting `spring.threads.virtual.enabled=true` runs the embedded server's request-handling on virtual
threads instead of a fixed platform-thread pool. For typical blocking I/O-bound controllers (a call
to a database or another service per request) this can absorb far more concurrent requests per
instance. See the concurrency-jvm-tuning topic for what a virtual thread actually is.
:::

:::callout{kind=changed-since title="Smaller things"}
- JUnit 4 to JUnit 5 as the default test dependency (Boot 2.2, 2019). `@Test` now comes from
  `org.junit.jupiter.api`, not `org.junit`.
- `application.properties` is joined, not replaced, by `application.yml` as the common convention —
  either works; most newer projects default to YAML for hierarchical config and profile documents.
- Spring WebFlux (Spring 5, 2017) offers a fully reactive, non-blocking alternative stack to
  Spring MVC. Most bank back-office services you will review are still MVC (blocking, one thread
  per request or one virtual thread per request); WebFlux is a deliberate choice, not a default.
:::

:::engineer
```java
// Modern equivalent of a hand-wired applicationContext.xml DataSource bean, plus current security config
@Configuration
class InfraConfig {
    @Bean
    DataSource dataSource(DataSourceProperties props) {
        return props.initializeDataSourceBuilder().build();
    }
}

@Configuration
class SecurityConfig {
    @Bean
    SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http.authorizeHttpRequests(a -> a.requestMatchers("/actuator/health").permitAll().anyRequest().authenticated());
        return http.build();               // no more "extends WebSecurityConfigurerAdapter"
    }
}
```
:::

## Gotchas that still bite

- **Classpath component scanning is package-rooted.** Same rule as your era's `<context:component-scan
  base-package="...">` — a bean outside the scanned package tree is silently not found. The
  difference is Boot infers the root from where `@SpringBootApplication` sits, so a misplaced class
  fails silently rather than via a visible XML omission.
- **`@Transactional` self-invocation still does not work**, for the same proxy reason it did not
  work in Spring 2/3. This predates Boot entirely and still catches people.
- **Auto-configuration surprises.** A dependency added for one reason (an in-memory database for a
  test) can silently auto-configure a bean in production if the dependency scope is wrong. There is
  no XML file to grep for "what beans exist" any more — `--debug` or the Actuator `/beans` endpoint
  is the equivalent.
- **Constructor injection hides nothing, which is the point** — but a class with twelve constructor
  parameters is exactly as bad a sign as a `<bean>` with twelve `<property>` elements was. The
  framework changed; "too many dependencies" is still too many dependencies.
- **Executable jar changes the ops model.** No shared Tomcat to restart, no WAR hot-deploy. Deployment,
  logs, and process management are now per-instance (or per-container) concerns — relevant if you
  are assessing a team's operational readiness, not just their code.

:::callout{kind=bank-context}
The `javax` → `jakarta` migration (Boot 3) is a real, mechanical, non-optional piece of work for any
service still on Boot 2 that wants current CVE patches. It is a reasonable line item to budget for
rather than something a team can quietly defer indefinitely — Boot 2 reached end of open-source
support in 2023.
:::

## Ten-minute drill

::::exercise{id=ex-xml-to-boot type=code title="Translate an XML bean wiring to Boot"}
Given this fragment of `applicationContext.xml`, write the equivalent modern Spring Boot Java
configuration.

```xml
<bean id="paymentGatewayClient" class="bank.infra.PaymentGatewayClient">
    <constructor-arg value="${gateway.url}"/>
    <constructor-arg value="${gateway.timeoutMs}"/>
</bean>
<bean id="paymentService" class="bank.service.PaymentService">
    <constructor-arg ref="paymentGatewayClient"/>
</bean>
```
:::solution
```java
@ConfigurationProperties(prefix = "gateway")
record GatewayProperties(String url, int timeoutMs) {}

@Configuration
class GatewayConfig {
    @Bean
    PaymentGatewayClient paymentGatewayClient(GatewayProperties props) {
        return new PaymentGatewayClient(props.url(), props.timeoutMs());
    }
}

@Service   // found by component scan; no XML bean declaration needed at all
class PaymentService {
    private final PaymentGatewayClient client;
    PaymentService(PaymentGatewayClient client) { this.client = client; }   // autowired by type
}
```
Two differences worth naming out loud: `PaymentService` needs no explicit bean declaration anywhere
(component scanning finds it), and the property placeholders (`${gateway.url}`) become a typed,
validated `GatewayProperties` record rather than string substitution resolved at runtime with no
compile-time check.
:::
::::
