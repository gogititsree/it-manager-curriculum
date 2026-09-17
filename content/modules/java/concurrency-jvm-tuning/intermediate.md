---
title: "Concurrency & JVM Tuning in Production"
estimatedMinutes: 45
objectives:
  - "Decide when virtual threads help and when they do not"
  - "Use structured concurrency to avoid leaked, fire-and-forget tasks"
  - "Choose a garbage collector and heap size based on the service's actual constraint"
  - "Read a thread dump and a GC log well enough to diagnose a stuck or thrashing service"
status: ready
---

You can submit tasks to an executor and you know shared mutable state is dangerous. This lesson is
about what happens when the naive version of that — a fixed thread pool, default heap settings,
diagnosis by restarting the service — meets real production traffic.

## Where the basics break down

A thread pool sized to "number of CPU cores" is right for CPU-bound work and wrong for the common
case in a bank's services: I/O-bound work that spends most of its time waiting on a database, a
downstream gateway, or another service. Size a pool at, say, 200 platform threads to get enough
concurrency for I/O-bound traffic, and each thread's ~1MB stack alone reserves 200MB before any
request-specific memory — and 200 concurrent requests is not a large number for a busy service. Push
past the pool's capacity under a traffic spike and requests queue, timeouts cascade into retries,
retries add more load, and the service falls over in a way that looks like a database problem until
someone reads a thread dump.

The second, quieter failure: tasks submitted to an executor with `submit()` and never awaited (a
"fire and forget" background task) do not stop when the caller finishes or fails. They leak — not
memory exactly, but responsibility: nothing owns their lifetime, cancels them on shutdown, or
propagates their failure anywhere a human will see it.

:::manager
"How was this pool size chosen?" is worth asking whenever a service reports thread-pool exhaustion
under load. A number copied from another service, or from a default, is a common root cause — the
right number depends on how much of a request's time is I/O wait versus CPU work, which is specific
to this service's dependencies.
:::

:::engineer
```java
// Fire-and-forget: nobody owns this task's lifetime or failure
executor.submit(() -> auditLog.record(event));   // if this throws, where does anyone find out?
```
:::

## Virtual threads: cheap enough to block

A **virtual thread** (finalised in Java 21, 2023, JEP 444) is a thread scheduled by the JVM rather
than the OS. Millions can exist at once because each one is cheap — no reserved OS stack, no OS
scheduler entry — and when a virtual thread blocks on I/O, the JVM unmounts it from its **carrier**
platform thread, freeing that platform thread to run other work, and remounts the virtual thread
when the I/O completes. The practical effect: you can write the same simple blocking code you
already know (`inputStream.read()`, a JDBC call) and run one virtual thread per request instead of
sizing a shared pool, because blocking no longer ties up a scarce resource.

:::engineer
```java
// One virtual thread per task; no pool sizing decision to get wrong
try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
    for (Request r : requests) {
        executor.submit(() -> process(r));   // process() can block freely; it's cheap now
    }
}
```
For a Spring Boot service, `spring.threads.virtual.enabled=true` (Boot 3.2+, needs Java 21) switches
the embedded server's request handling to virtual threads with no code change.
:::

:::callout{kind=decision title="When virtual threads do not help"}
CPU-bound work (encryption, serialisation, number crunching) is not faster on virtual threads — the
bottleneck is CPU, not thread scheduling, so a platform-thread pool sized to core count is still
right. Also watch for **pinning**: a virtual thread executing inside a `synchronized` block (as
opposed to a `java.util.concurrent.locks.ReentrantLock`) cannot be unmounted while blocked, which
defeats the point. Recent JDKs have reduced this, but `synchronized` around a blocking call is still
worth checking in a review of virtual-thread-heavy code.
:::

:::manager
Virtual threads remove a specific, historically expensive capacity-planning decision — thread pool
sizing for I/O-bound services — not concurrency risk in general. Shared mutable state is exactly as
dangerous with a million virtual threads as with ten platform threads.
:::

## Structured concurrency: one failure cancels the group

Structured concurrency (introduced as a preview API starting in Java 21, 2023, still evolving in
subsequent JDKs) fixes the fire-and-forget problem directly: subtasks are scoped to a block, and the
block does not exit until every subtask has completed, failed, or been cancelled together. If one
subtask fails, the others are cancelled — you cannot lose track of a task the way a bare `submit()`
allows.

:::engineer
```java
try (var scope = new StructuredTaskScope.ShutdownOnFailure()) {
    Subtask<Balance> balance = scope.fork(() -> accountService.balance(id));
    Subtask<History> history = scope.fork(() -> accountService.history(id));

    scope.join();            // wait for both; if either throws, the other is cancelled
    scope.throwIfFailed();   // propagate the failure instead of silently continuing

    return new AccountView(balance.get(), history.get());
}   // scope is guaranteed closed: no leaked subtask outlives this block
```
Note the API is a preview feature and its exact shape has changed between JDK releases; check the
docs for the JDK version actually in use before committing code to it.
:::

:::manager
This is the concurrency equivalent of the ownership argument from the OOP lessons: a task with no
owner is a task nobody is accountable for when it fails. Structured concurrency makes "who is
responsible for this background call finishing or being cancelled" a compiler-enforced structure
rather than a convention.
:::

## Choosing a garbage collector

The default collector, **G1** (default since Java 9, 2017), balances throughput and pause time for
most services and is the right starting point. **ZGC** targets very low, sub-millisecond-to-low-
millisecond pause times largely independent of heap size, at some cost in throughput and memory
overhead — worth it for latency-sensitive services (real-time pricing, anything with a tight SLA on
p99 latency) where an occasional G1 pause of tens of milliseconds is unacceptable, not worth it for
a batch job where throughput matters more than pause time.

:::engineer
```
-XX:+UseG1GC        # default on current LTS releases; explicit for clarity in scripts
-XX:+UseZGC          # low-pause alternative; measure before switching
-Xlog:gc             # minimal GC logging; see the "reading a GC log" section below
```
:::

:::callout{kind=decision title="G1 or ZGC?"}
Default to G1 and only move to ZGC with a measured pause-time problem G1 does not solve — switching
collectors is a real operational change (different tuning flags, different log format) and is not
justified by "ZGC sounds faster." Measure your actual pause times and your actual SLA before
switching.
:::

:::manager
A GC collector change is a capacity-planning decision wearing a technical costume: it trades
throughput for latency or vice versa, and it changes what "normal" looks like in monitoring. Treat a
proposal to switch collectors the same as any other capacity change — ask for the measured problem,
the expected effect, and how the team will confirm it worked in production, not just in a benchmark.
:::

## Heap sizing and container awareness

`-Xmx` caps heap size; `-Xms` sets the initial size. Setting them equal avoids the (usually minor)
pauses caused by the heap resizing under load. Since JDK 10 (backported to 8u191), the JVM detects
container memory limits (cgroup limits) automatically rather than seeing the host's full memory —
critical if your service runs in a container with a memory limit, since an older JVM that ignored
the container limit would size its default heap off the *host's* memory and get OOM-killed.
`-XX:MaxRAMPercentage` sets heap as a percentage of the detected limit, which scales sanely across
environments instead of a fixed `-Xmx` value that is wrong the moment the container size changes.

:::engineer
```
-Xms2g -Xmx2g                          # fixed, equal: no resize pauses
-XX:MaxRAMPercentage=75.0              # scales with the container's memory limit instead
```
:::

:::manager
An OOM-killed container with no JVM `OutOfMemoryError` in the logs is a strong sign the JVM's heap is
not aware of the container's actual memory limit, or `-Xmx` is set higher than the container allows
once thread stacks, metaspace and native memory are accounted for. This is a common, quickly
diagnosable incident once you know to look for it.
:::

## Reading a thread dump and a GC log

A thread dump (`jcmd <pid> Thread.print`, or `jstack <pid>`) is a snapshot of every thread's stack.
For a "service is stuck" incident, look for many threads `BLOCKED` waiting on the same lock — that
is contention, and the dump names the lock and the thread currently holding it. The JVM also detects
and reports genuine deadlocks directly in the dump output.

:::engineer
```
"http-nio-8080-exec-7" #45 BLOCKED on lock <0x000000076ab2b2a0> owned by "http-nio-8080-exec-3"
    at bank.service.PaymentService.submit(PaymentService.java:42)
```
Many threads blocked on the same lock, owned by one thread, means that one thread — check what
*it* is doing in its own stack trace — is the actual bottleneck.
:::

A GC log (`-Xlog:gc:file=gc.log`) records each collection: how long it paused the application, how
much memory was reclaimed, how often it runs. Frequent, long pauses with little memory reclaimed
each time is heap pressure — the heap is too small for the live data, not a GC tuning problem.

:::manager
Before asking to "tune the GC," ask for a GC log covering the incident window. Frequent Full GCs
with small reclaims usually mean "increase the heap" or "find the memory leak," not "try different
flags." Flag-tuning without that evidence is guessing.
:::

## What good looks like

- **Executor choice matches the workload.** Virtual threads (or a pool sized for the actual I/O/CPU
  ratio) for I/O-bound request handling; a bounded platform-thread pool sized to cores for CPU-bound
  work.
- **No fire-and-forget tasks.** Every submitted task's completion or failure is owned somewhere —
  structured concurrency, or at minimum a `Future` that is checked.
- **GC and heap choices are backed by a measured constraint** (a pause-time SLA, an observed OOM),
  not a default copied from another service.
- **The team can produce a thread dump and a GC log on request** and has read one before, not just
  during, an incident.

:::manager
This is the concurrency equivalent of the OOP review checklist: short enough to actually use. In a
capacity or incident review, "show me the GC log" and "show me the thread dump" are two requests
that separate a team with real operational visibility from one that restarts the service and hopes.
:::

:::engineer
Minimum viable production flags for a service you want to be diagnosable later, not just fast now:
```
-Xms2g -Xmx2g
-XX:MaxRAMPercentage=75.0
-Xlog:gc:file=/var/log/app/gc.log:time,level,tags
-XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/var/log/app/
```
None of these change behaviour under normal load; all of them turn an incident into something you
can diagnose from evidence instead of a restart and a guess.
:::

## Exercises

::::exercise{id=ex-virtual-thread-migration type=scenario title="Migrating a bounded pool to virtual threads"}
A team proposes replacing a `newFixedThreadPool(200)` used for handling incoming requests with
`Executors.newVirtualThreadPerTaskExecutor()`, removing the pool-size limit entirely, "since virtual
threads are basically free." What do you ask before approving this?
:::solution
What virtual threads fix here: if the workload is genuinely I/O-bound (waiting on a database or a
downstream call for most of a request's time), the fixed pool of 200 was capping throughput below
what the hardware could sustain, purely because platform threads are expensive to hold. Removing
that artificial cap is the correct instinct.

What to ask before approving "no limit at all":

- **Is the downstream actually unbounded?** The database connection pool, the payment gateway's own
  rate limits, another service's capacity — none of those became infinite because the calling
  service's thread pool did. Uncapped concurrency on this side can still overwhelm a bounded
  resource on the other side; a connection pool exhaustion incident is a very plausible outcome of
  "unlimited virtual threads, fixed-size database pool."
- **Any `synchronized` blocks around blocking calls in this code path?** That is a pinning risk that
  would silently reduce or eliminate the benefit for those requests.
- **Is any CPU-bound work mixed into this path** (serialisation, encryption)? Virtual threads do not
  help there, and if it dominates a request's time, this change may not move the needle the team
  expects.

What to accept: the migration, with a semaphore or a rate limiter sized to the *actual* downstream
capacity (the database pool size, the gateway's documented rate limit) placed at the point where the
call leaves this service — replacing an accidental limit (thread pool size) with a deliberate one,
rather than removing the limit altogether.
:::
::::
