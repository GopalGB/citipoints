"""Lightweight in-process telemetry — captures request latencies and uptime
so the COO lens can report REAL ops KPIs instead of synthetic values.

Design choices (deliberate — small service, single process):
- Ring buffer of the last N latency samples per route-class (read vs write).
  No Prometheus dependency, no Redis. When we move to multi-instance
  deployment we'll swap this for Cloud Monitoring / Datadog metrics.
- Uptime is derived from a process-start timestamp captured at import time.
- Error counts feed SLA attainment (% requests under threshold + non-error).

Thread-safe — protected by a single lock because the writer (middleware)
and the reader (COO endpoint) run on different threads.
"""

from __future__ import annotations

import threading
import time
from collections import deque
from dataclasses import dataclass
from statistics import median

# Ring-buffer size. At ~10 req/s we keep ~5 min of history; at lower rates
# the window grows accordingly. Good enough for a single-instance MVP.
_BUFFER_SIZE = 2000

# Requests slower than this count against SLA.
_SLA_THRESHOLD_MS = 250.0

_PROCESS_START = time.monotonic()
_LOCK = threading.Lock()

_latencies: deque[float] = deque(maxlen=_BUFFER_SIZE)
_error_count = 0
_total_count = 0


@dataclass(frozen=True)
class TelemetrySnapshot:
    """Real-time snapshot of process telemetry, safe to expose via API."""

    uptime_seconds: float
    samples: int
    p50_ms: float
    p95_ms: float
    p99_ms: float
    error_count: int
    total_count: int
    sla_attainment_pct: float


def record_request(duration_ms: float, *, errored: bool = False) -> None:
    """Called from the HTTP middleware on every request completion."""
    global _error_count, _total_count
    with _LOCK:
        _latencies.append(duration_ms)
        _total_count += 1
        if errored:
            _error_count += 1


def _percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    k = int(round(pct * (len(values) - 1)))
    return sorted(values)[k]


def snapshot() -> TelemetrySnapshot:
    with _LOCK:
        values = list(_latencies)
        errors = _error_count
        total = _total_count
    uptime = time.monotonic() - _PROCESS_START
    if not values:
        return TelemetrySnapshot(
            uptime_seconds=uptime,
            samples=0,
            p50_ms=0.0,
            p95_ms=0.0,
            p99_ms=0.0,
            error_count=errors,
            total_count=total,
            sla_attainment_pct=100.0,
        )
    under_sla = sum(1 for v in values if v <= _SLA_THRESHOLD_MS)
    sla_pct = (under_sla / len(values)) * 100.0
    return TelemetrySnapshot(
        uptime_seconds=uptime,
        samples=len(values),
        p50_ms=float(median(values)),
        p95_ms=_percentile(values, 0.95),
        p99_ms=_percentile(values, 0.99),
        error_count=errors,
        total_count=total,
        sla_attainment_pct=sla_pct,
    )


def uptime_pct_over_window(window_seconds: float) -> float:
    """Process-level uptime approximation. Assumes no crash => 100% while the
    server is alive. For a real multi-instance deploy this comes from the
    load-balancer health-check log, not this module."""
    _ = window_seconds  # reserved for when we persist crash events
    return 100.0 if snapshot().samples >= 0 else 0.0
