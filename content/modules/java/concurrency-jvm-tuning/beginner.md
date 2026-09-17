---
title: "Concurrency & JVM Tuning"
estimatedMinutes: 35
objectives:
  - "Explain the difference between a thread and a task"
  - "Use an ExecutorService instead of creating Threads by hand"
  - "State, in one page, why shared mutable state between threads is dangerous and what fixes it"
status: ready
---

A Java application handling many requests at once needs to do more than one thing at a time. This
lesson builds, from nothing, the vocabulary for how the JVM does that, and the single idea —
uncontrolled shared state — behind almost every concurrency bug you will ever be asked to review.

## Why this exists

A single-threaded program does one thing at a time. A bank's payment service needs to handle
thousands of requests arriving concurrently, each one mostly waiting — for a database, for a
downstream gateway, for a lock. If every request waited for the previous one to finish completely,
the service would be idle almost all the time while technically "busy." Concurrency lets the program
start the next piece of work while earlier work is still waiting on something slow, using the CPU
that would otherwise sit idle.

The cost is that concurrent code is harder to reason about: two pieces of work can now interact in
ways that never happen when there is only one thing running. Most of this lesson is about that cost
and how to keep it under control.

:::manager
The business reason to care: throughput. A service that handles one request at a time, however
fast each request is, has a hard ceiling on requests per second. Concurrency is how the same
hardware serves more traffic — and it is also where a disproportionate share of "it worked in
testing, it failed under load" incidents come from.
:::

:::engineer
```java
// Sequential: request 2 does not start until request 1 (including its slow I/O) finishes
for (Request r : requests) { process(r); }

// Concurrent: many requests are in flight, each mostly waiting on I/O, not CPU
for (Request r : requests) { executor.submit(() -> process(r)); }
```
:::

## Threads vs tasks

A **thread** is an operating-system-scheduled unit of execution — something the CPU can run. In
plain Java, `new Thread(runnable).start()` creates one. Threads are relatively expensive: each one
reserves a chunk of memory (its stack, by default around 512KB–1MB) and the OS scheduler has real
overhead managing thousands of them.

A **task** is a unit of *work* — a `Runnable` (no return value) or a `Callable<T>` (returns a value,
can throw a checked exception). A task is not, by itself, a thread. This distinction matters because
almost all production code should submit tasks to something that manages a pool of threads for you,
rather than creating a `Thread` per unit of work.

:::engineer
```java
Runnable task = () -> System.out.println("processing");
Callable<PaymentResult> callable = () -> gateway.send(payment);

// Direct thread creation: one OS thread per task, rarely what you want in a service
new Thread(task).start();
```
:::

:::manager
"How many threads does this service create?" is a fair review question. Code that calls
`new Thread(...)` per incoming request, rather than submitting to a bounded pool, has no ceiling on
resource usage under load — it will function correctly at low traffic and fail under a traffic
spike, which is the worst time to discover it.
:::

## Executors: the pool that runs your tasks

An `ExecutorService` is a managed pool of threads that tasks are submitted to. It decouples "how
much work is there" from "how many threads exist," and it is the standard way to run concurrent work
in Java. `submit()` returns a `Future<T>`, a handle to a result that may not exist yet.

:::engineer
```java
ExecutorService pool = Executors.newFixedThreadPool(8);

Future<PaymentResult> future = pool.submit(() -> gateway.send(payment));
PaymentResult result = future.get();       // blocks until the task completes (or times out)

pool.shutdown();                            // stop accepting new tasks, let running ones finish
```
A fixed pool caps concurrency: at most 8 tasks run at once, others queue. Forgetting to call
`shutdown()` is a real bug: the pool's threads are non-daemon by default, and a program that never
shuts down its executor never exits.
:::

:::callout{kind=warning title="Executors.newCachedThreadPool has no bound"}
It creates a new thread for every task if none are free, with no queue and no upper limit. Under a
traffic spike this can create thousands of threads and exhaust memory. For anything internet- or
request-facing, prefer a bounded pool (`newFixedThreadPool`, or `ThreadPoolExecutor` configured
explicitly) so the failure mode under load is a full queue, not an unbounded number of threads.
:::

:::manager
Pool size is a capacity decision, not an implementation detail: too small and the service under-uses
the hardware; too large and threads compete for CPU and the database connection pool behind them.
Ask what the pool size is based on — a number picked from a blog post is a common, avoidable root
cause of a capacity incident.
:::

## Shared state and the memory model, in one page

The one idea that causes most concurrency bugs: **when two threads read and write the same mutable
variable without coordination, the behaviour is undefined** — not "occasionally slow," genuinely
undefined, including a thread never seeing another thread's write at all. This is the **Java Memory
Model**: without a *happens-before* relationship between a write and a read (established by
`synchronized`, `volatile`, or a small number of other constructs), the compiler and CPU are free to
reorder, cache, or delay operations in ways that are invisible on one thread and disastrous across
two.

:::engineer
```java
// Two threads, one shared field: broken, and it may "work" in testing anyway
class Flag {
    private boolean done = false;               // no visibility guarantee across threads
    void finish() { done = true; }
    void await() { while (!done) { /* spin */ } }  // may spin forever: the write may never become visible
}

// Fixed: volatile establishes a happens-before relationship
class Flag {
    private volatile boolean done = false;
    void finish() { done = true; }
    void await() { while (!done) { /* spin */ } }  // guaranteed to observe the write eventually
}
```
`synchronized` provides the same visibility guarantee, plus mutual exclusion (only one thread inside
a synchronized block on the same lock at a time) — needed whenever more than a single flag write is
involved, such as incrementing a counter (read-modify-write is not atomic even with `volatile`).
:::

:::callout{kind=gotcha title="'It worked on my machine' is not evidence"}
A memory-visibility bug is a race: it depends on CPU caching behaviour, JIT optimisation decisions
and scheduling, none of which are guaranteed to reproduce the same way twice, or on a different core
count, or under production load versus a quiet laptop. Passing tests locally proves nothing about a
race condition's absence.
:::

:::manager
When a bug report says "intermittent" and "only in production, only under load," treat unsynchronised
shared mutable state as a leading hypothesis before anything more exotic. It is far more common than
its reputation as an advanced topic suggests, precisely because it does not reliably show up in
testing.
:::

## Common mistakes

- **`new Thread()` per unit of work** instead of submitting to a bounded executor.
- **Unbounded thread pools or queues** (`newCachedThreadPool`, an unbounded `LinkedBlockingQueue`)
  with no ceiling, which convert a load spike into an out-of-memory error.
- **Forgetting to shut down an `ExecutorService`**, leaving the JVM unable to exit, or leaking pools
  created per-request instead of once and reused.
- **Mutable shared state with no `synchronized`/`volatile`/concurrent collection**, assumed safe
  because it "worked in testing."
- **Calling `.get()` on a `Future` with no timeout**, turning a slow downstream call into an
  indefinitely blocked thread.

## Putting it together

::::exercise{id=ex-bounded-pool type=design title="Process a batch of payments concurrently, safely"}
Design (in prose or Java) how you would process a list of 500 payment instructions concurrently,
capped at 10 at a time, collecting a count of successes and failures, without unbounded resource
use and without a shared-state bug. What executor would you use, how would you bound concurrency,
and where would the success/failure count live?
:::solution
- `ExecutorService pool = Executors.newFixedThreadPool(10);` bounds concurrency directly — never
  submit all 500 with an unbounded pool.
- Submit each payment as a `Callable<PaymentResult>`, collect the returned `Future`s in a `List`.
- Do **not** increment a shared `int successCount` from inside each task without synchronisation —
  that is exactly the race condition from the previous section. Use `AtomicInteger` (an
  atomic-read-modify-write counter designed for exactly this) or, simpler here, do not share mutable
  state across tasks at all: let each task return a `PaymentResult`, and count successes and
  failures once, sequentially, after collecting every `Future` with `.get()`.
- Always call `.get(timeout, unit)`, not the no-argument `.get()`, so one stuck downstream call
  cannot block the whole batch indefinitely.
- Call `pool.shutdown()` once all tasks are submitted and results collected.
- A manager reviewing this asks: is the concurrency cap a real number based on downstream capacity
  (the payment gateway's own limits), or an arbitrary constant? That number is the actual capacity
  decision, not an implementation detail.
:::
::::
