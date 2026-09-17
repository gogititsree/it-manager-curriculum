---
title: "Concurrency & JVM Tuning — refresher"
estimatedMinutes: 18
objectives:
  - "Re-anchor threads, executors and the memory model in ten minutes"
  - "Know what changed since Java 8: CompletableFuture, virtual threads, structured concurrency, GC defaults"
  - "Read a thread dump and a GC log without relearning the tools from scratch"
status: ready
---

You have debugged thread pools, `synchronized` blocks and `OutOfMemoryError`s before, most likely
against Java 6, 7 or 8 and probably CMS or Parallel GC. The concepts underneath have not changed.
The default tools and idioms have. This assumes you can read Java and spends its time on the delta.

## What you probably remember

| Concept | One-line anchor |
| --- | --- |
| Thread vs task | A thread is OS-scheduled and expensive; a task (Runnable/Callable) is work submitted to something else that manages threads. |
| ExecutorService | A managed thread pool; submit tasks, get Futures back, always shut it down. |
| Java Memory Model | No happens-before relationship between a write and a read on shared state means undefined behaviour, not just "slow." `volatile`/`synchronized` establish it. |
| `synchronized` | Mutual exclusion plus visibility; needed for anything beyond a single flag (read-modify-write is not atomic). |
| `-Xms` / `-Xmx` | Initial and maximum heap size; set equal to avoid resize pauses. |
| Thread dump | `jstack <pid>`; a snapshot of every thread's stack, shows BLOCKED threads and detects deadlocks. |
| CMS / Parallel GC | The collectors you tuned by hand; CMS for lower pauses, Parallel for throughput, both with real tuning pain. |

## What changed since

:::callout{kind=changed-since title="CompletableFuture (Java 8, 2014)"}
If your hands-on Java stopped around the Java 8 release, you may have missed this even though it
shipped in 8: a `Future` that composes. `thenApply`, `thenCompose`, `thenCombine`, `allOf` let you
build a pipeline of asynchronous steps without a callback pyramid, and without blocking a thread on
`.get()` at every step. This is still current idiom for composing async work where you are not using
virtual threads to just write blocking-looking code instead.
:::

:::callout{kind=changed-since title="Virtual threads (Java 21, 2023)"}
The biggest change to the concurrency model since your era. A virtual thread is JVM-scheduled, not
OS-scheduled; millions can exist; blocking one is cheap because the JVM unmounts it from its carrier
platform thread instead of parking an expensive OS thread. Practical effect: code that blocks on I/O
(a JDBC call, a REST call) can go back to being written as simple sequential blocking code,
`Executors.newVirtualThreadPerTaskExecutor()`, one virtual thread per request — no pool-sizing
tuning for I/O-bound workloads. CPU-bound work still wants a bounded platform-thread pool.
:::

:::callout{kind=changed-since title="Structured concurrency (preview from Java 21, 2023)"}
`StructuredTaskScope` scopes a group of subtasks to a block: the block does not exit until all
subtasks finish, and one subtask's failure cancels the others. This replaces the "submit and hope
something checks the Future later" pattern with a structure that cannot leak a task. Still a preview
API as of recent JDKs — check the exact shape against the JDK version in use.
:::

:::callout{kind=changed-since title="G1 default, ZGC for low pause (G1: Java 9 2017; ZGC: production-ready ~Java 15 2020)"}
G1 replaced Parallel GC as the default collector in Java 9. If you last tuned CMS by hand, most of
that flag knowledge is obsolete — CMS was deprecated in Java 9 and removed in Java 14. ZGC targets
very low pause times largely independent of heap size, at some throughput cost; a Generational mode
for ZGC arrived as an option in Java 21, improving its throughput characteristics. Default to G1;
move to ZGC only against a measured pause-time requirement it does not meet.
:::

:::callout{kind=changed-since title="Container-aware heap sizing (Java 10, 2018; backported to 8u191)"}
The JVM now reads cgroup memory/CPU limits automatically instead of sizing default heap off the
host's full memory. Before this, a JVM in a container with a memory limit could size its default
heap far above the container's actual limit and get OOM-killed with no `OutOfMemoryError` in its own
logs — a confusing failure mode you may have hit without a clean explanation at the time.
:::

:::engineer
```java
// CompletableFuture: compose without blocking at each step
CompletableFuture<PaymentResult> result = fetchAccount(id)
    .thenCompose(account -> validate(account, amount))
    .thenApply(v -> gateway.send(v))
    .exceptionally(ex -> PaymentResult.failed(ex.getMessage()));

// Virtual threads: back to simple blocking code, cheaply
try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
    executor.submit(() -> process(request));   // blocking I/O inside is fine
}
```
:::

:::manager
The practical read for a manager: a service still hand-tuning CMS flags, or sizing thread pools by
guesswork for I/O-bound traffic, is running on a mental model from before 2017–2023 depending on the
specific change. None of these upgrades are mandatory, but each one removes a category of tuning
work and a category of incident that used to require a specialist to diagnose.
:::

## Gotchas that still bite

- **Read-modify-write is still not atomic**, `volatile` or not. `volatile int count; count++;` is
  still a race. `AtomicInteger` or a lock, exactly as before.
- **`synchronized` around a blocking call now costs more than it used to** in a virtual-thread
  world: it pins the virtual thread to its carrier for the duration, defeating the point. Prefer
  `ReentrantLock` in new virtual-thread-heavy code where blocking happens inside the critical
  section.
- **Fire-and-forget `executor.submit()` with no `Future` checked** was a bad habit before and is
  still a bad habit; structured concurrency exists specifically because this was common enough to
  need a language-level answer.
- **Unbounded pools or queues under a traffic spike** turn a load problem into an OutOfMemoryError,
  regardless of collector or thread model.
- **A GC log or thread dump you have never actually read before an incident** costs you the incident
  itself as the learning exercise. Pull one from a healthy service now, so the format is familiar
  under pressure.

:::callout{kind=bank-context}
"Why did the JVM use 8GB" is answerable from a GC log in minutes if you know what a Full GC pattern
with small reclaims looks like, and unanswerable without one. Insisting a service ships with GC
logging enabled by default is a cheap, durable piece of operational risk reduction to ask for.
:::

## Ten-minute drill

::::exercise{id=ex-read-the-evidence type=scenario title="Diagnose from a thread dump and a GC log excerpt"}
A payment service is reported as "slow, intermittently." You are handed two artifacts.

Thread dump excerpt (twelve threads show this pattern):
```
"http-nio-8080-exec-19" BLOCKED on lock <0x0000000...> owned by "http-nio-8080-exec-3"
    at bank.service.LedgerService.reserve(LedgerService.java:88)
"http-nio-8080-exec-3" RUNNABLE
    at bank.gateway.SlowLegacyClient.call(SlowLegacyClient.java:41)
```
GC log excerpt:
```
[gc] Pause Young 180M->40M(512M) 4.2ms
[gc] Pause Young 175M->38M(512M) 3.9ms
```
What is the likely cause, and where do you look next? Is this a GC problem?
:::solution
It is not a GC problem: the GC log shows short, healthy young-generation pauses reclaiming most of
the heap each time (180M down to 40M) — that is a garbage collector doing fine, not a heap under
pressure. Ignore GC tuning as a hypothesis here; the evidence does not support it.

The thread dump is the actual finding: twelve threads are `BLOCKED` waiting on a lock held by one
thread (`exec-3`), and that thread's own stack shows it `RUNNABLE` inside `SlowLegacyClient.call` —
it is not deadlocked, it is just slow, and it is holding a lock (inside `LedgerService.reserve`)
for the duration of a slow external call. Every other thread that needs the same lock queues behind
it, which is what "intermittently slow" under load looks like: fine until enough requests contend
for that one lock at once, then a pile-up.

Next steps: find out why the lock in `LedgerService.reserve` is held across a call to
`SlowLegacyClient` at all — a lock should typically be held only around the in-memory state change,
not around a network call to a slow legacy system. Narrowing the critical section (do the slow call
outside the lock, or restructure so the lock is not needed around it) is the likely fix, not a
different garbage collector or a bigger heap.
:::
::::
