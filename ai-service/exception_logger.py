"""Redacted, asynchronous exception logging for the AI service."""
from __future__ import annotations

import json
import os
import queue
import re
import sys
import threading
import traceback
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

LEVELS = {"error": 0, "warn": 1, "info": 2}
TIMEZONE_NAME = os.getenv("LOG_TIMEZONE", "Asia/Karachi")
TIMEZONE_CONFIG_ERROR = False
try:
    LOCAL_TZ = ZoneInfo(TIMEZONE_NAME)
except Exception:
    TIMEZONE_CONFIG_ERROR = True
    LOCAL_TZ = ZoneInfo("UTC")
LOG_DIR = Path(os.getenv("LOG_DIR", Path(__file__).resolve().parent / "logs" / "exceptions"))
FILE_LOGGING_ENABLED = os.getenv("NODE_ENV", "development").lower() != "production"
RETENTION_DAYS = max(1, int(os.getenv("LOG_RETENTION_DAYS", "30")))
MIN_LEVEL = LEVELS.get(os.getenv("LOG_LEVEL", "info").lower(), 2)
BURST_LIMIT = max(1, int(os.getenv("LOG_BURST_LIMIT_PER_MINUTE", "10")))
ALLOWED_CONTEXT = {
    "requestId", "method", "url", "status", "role", "userId", "ip", "code", "name",
    "model", "action", "durationMs", "retry", "route", "provider", "recipientEmail",
}
QUEUE: queue.Queue = queue.Queue(maxsize=5000)
BURSTS: dict[str, dict] = {}
LOCK = threading.Lock()


def _mask_email(value: str) -> str:
    return re.sub(r"([A-Z0-9._%+-])[A-Z0-9._%+-]*@([A-Z0-9.-]+\.[A-Z]{2,})", r"\1***@\2", value, flags=re.I)


def _redact(value: object, limit: int) -> str:
    text = str(value or "")
    text = re.sub(r"\bBearer\s+[^\s,;]+", "Bearer [REDACTED]", text, flags=re.I)
    text = re.sub(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b", "[TOKEN_REDACTED]", text)
    text = re.sub(r"\btbl:[A-Za-z0-9:%_-]+", "[TABLE_TOKEN_REDACTED]", text, flags=re.I)
    text = re.sub(r"\b\d{6}\b", "[CODE_REDACTED]", text)
    text = re.sub(r"((?:otp|token|secret|password|authorization|cookie|api[_-]?key)\s*[:=]\s*)([^\s,;]+)", r"\1[REDACTED]", text, flags=re.I)
    text = _mask_email(text)
    text = re.sub(r"(?<!\w)(?:\+?\d[\d ()-]{8,}\d)(?!\w)", "[PHONE_REDACTED]", text)
    for key, secret in os.environ.items():
        if secret and len(secret) >= 5 and re.search(r"SECRET|TOKEN|KEY|PASSWORD|DATABASE_URL|REDIS_URL|SMTP_PASS|SUPABASE", key, re.I):
            text = text.replace(secret, "[REDACTED]")
    return text[:limit]


def _context(context: dict | None) -> dict:
    safe = {}
    for key, value in (context or {}).items():
        if key not in ALLOWED_CONTEXT or value is None:
            continue
        if key == "recipientEmail":
            safe[key] = _mask_email(str(value))
        elif key == "ip":
            ip = str(value)
            safe[key] = re.sub(r"\.\d+$", ".0", ip) if "." in ip else ("::".join(ip.split(":")[:4]) + "::" if ":" in ip else "[IP_REDACTED]")
        elif key == "url":
            url = _redact(value, 300)
            url = re.sub(r"(/api/sessions/)(?!start(?:/|$)|transfer-table(?:/|$))[^/?#]+", r"\1[ID_REDACTED]", url, flags=re.I)
            url = re.sub(r"(/api/orders/track/)[^/?#]+", r"\1[TOKEN_REDACTED]", url, flags=re.I)
            url = re.sub(r"(/customer/table/)[^/?#]+", r"\1[TOKEN_REDACTED]", url, flags=re.I)
            safe[key] = url
        elif isinstance(value, (int, float, bool)):
            safe[key] = value
        else:
            safe[key] = _redact(value, 300)
    return safe


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _entry_line(entry: dict) -> str:
    stamp = entry["date"].astimezone(LOCAL_TZ)
    fields = [f"[{stamp.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]} {stamp.strftime('%z')} | {entry['date'].isoformat(timespec='milliseconds')}]",
              f"LEVEL={entry['level']}", f"SOURCE={entry['source']}"]
    context = entry["context"]
    for key in ("requestId", "method", "url", "status", "role", "userId", "ip", "code", "name"):
        if key in context:
            fields.append(f"{key}={context[key]}")
    fields.append(entry["message"])
    if entry.get("stack"):
        fields.append(f"stack={entry['stack']}")
    if context:
        fields.append(f"context={json.dumps(context, ensure_ascii=False, separators=(',', ':'))}")
    return " / ".join(fields) + "\n" + "-" * 80 + "\n"


def _cleanup(day: str) -> None:
    if not FILE_LOGGING_ENABLED:
        return
    try:
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        cutoff = datetime.strptime(day, "%Y-%m-%d").date() - timedelta(days=RETENTION_DAYS)
        for file in LOG_DIR.iterdir():
            if file.is_file() and re.fullmatch(r"\d{4}-\d{2}-\d{2}\.txt", file.name):
                if datetime.strptime(file.name[:10], "%Y-%m-%d").date() < cutoff:
                    file.unlink(missing_ok=True)
    except Exception:
        pass


def _writer() -> None:
    current_day = None
    _cleanup(_now().astimezone(LOCAL_TZ).strftime("%Y-%m-%d"))
    while True:
        try:
            entry = QUEUE.get(timeout=60)
        except queue.Empty:
            now = _now()
            day = now.astimezone(LOCAL_TZ).strftime("%Y-%m-%d")
            if day != current_day:
                _cleanup(day)
                current_day = day
            minute = int(now.timestamp() // 60)
            with LOCK:
                for state in BURSTS.values():
                    if state["minute"] < minute:
                        if state["suppressed"] and state.get("sample"):
                            summary = {**state["sample"], "date": now, "timestamp": now.isoformat(timespec="milliseconds"),
                                       "localTime": now.astimezone(LOCAL_TZ).isoformat(timespec="milliseconds"),
                                       "message": f"{state['suppressed']} similar errors suppressed during the previous minute", "stack": None}
                            try:
                                QUEUE.put_nowait(summary)
                                sys.stdout.write(json.dumps({k: v for k, v in summary.items() if k != "date"}, ensure_ascii=False) + "\n")
                            except queue.Full:
                                pass
                        state.update({"minute": minute, "count": 0, "suppressed": 0, "sample": None})
            continue
        if entry is None:
            return
        try:
            day = entry["date"].astimezone(LOCAL_TZ).strftime("%Y-%m-%d")
            if day != current_day:
                _cleanup(day)
                current_day = day
            with (LOG_DIR / f"{day}.txt").open("a", encoding="utf-8") as output:
                output.write(_entry_line(entry))
        except Exception:
            # The JSON stdout copy remains available when the dyno filesystem fails.
            pass
        finally:
            QUEUE.task_done()


if FILE_LOGGING_ENABLED:
    threading.Thread(target=_writer, name="exception-log-writer", daemon=True).start()


def log(level: str, source: str, message: object, *, context: dict | None = None, exc: BaseException | None = None) -> None:
    if LEVELS.get(level, 0) > MIN_LEVEL:
        return
    try:
        date = _now()
        safe = _context(context)
        message = _redact(message, 2048)
        stack = _redact("".join(traceback.format_exception(type(exc), exc, exc.__traceback__)), 8192) if exc else ""
        entry = {"timestamp": date.isoformat(timespec="milliseconds"), "localTime": date.astimezone(LOCAL_TZ).isoformat(timespec="milliseconds"),
                 "level": level, "source": _redact(source, 120).replace(" ", "_"), **safe, "message": message,
                 "context": safe, "stack": stack or None, "date": date}
        fingerprint = f"{level}:{entry['source']}:{message[:160]}"
        minute = int(date.timestamp() // 60)
        with LOCK:
            state = BURSTS.get(fingerprint)
            if not state or state["minute"] != minute:
                if state and state["suppressed"]:
                    summary = {**entry, "message": f"{state['suppressed']} similar errors suppressed during the previous minute", "stack": None}
                    sys.stdout.write(json.dumps({k: v for k, v in summary.items() if k != "date"}, ensure_ascii=False) + "\n")
                    if FILE_LOGGING_ENABLED:
                        try:
                            QUEUE.put_nowait(summary)
                        except queue.Full:
                            pass
                state = {"minute": minute, "count": 0, "suppressed": 0, "sample": entry}
                if len(BURSTS) >= 5000 and fingerprint not in BURSTS:
                    BURSTS.pop(next(iter(BURSTS)))
                BURSTS[fingerprint] = state
            if state["count"] >= BURST_LIMIT:
                state["suppressed"] += 1
                return
            state["count"] += 1
            state["sample"] = entry
        sys.stdout.write(json.dumps({k: v for k, v in entry.items() if k != "date"}, ensure_ascii=False) + "\n")
        if FILE_LOGGING_ENABLED:
            try:
                QUEUE.put_nowait(entry)
            except queue.Full:
                pass
    except Exception:
        # Logger failures must not escape into application code.
        pass


def exception(source: str, exc: BaseException, *, context: dict | None = None, level: str = "error") -> None:
    log(level, source, str(exc), context=context, exc=exc)


def fatal_sync(source: str, exc: BaseException, *, context: dict | None = None) -> None:
    """Best-effort synchronous write for a process that is about to terminate."""
    try:
        date = _now()
        safe = _context(context)
        entry = {"timestamp": date.isoformat(timespec="milliseconds"), "localTime": date.astimezone(LOCAL_TZ).isoformat(timespec="milliseconds"),
                 "level": "error", "source": _redact(source, 120), **safe,
                 "message": _redact(str(exc), 2048),
                 "stack": _redact("".join(traceback.format_exception(type(exc), exc, exc.__traceback__)), 8192),
                 "context": safe, "date": date}
        sys.stdout.write(json.dumps({key: value for key, value in entry.items() if key != "date"}, ensure_ascii=False) + "\n")
        if FILE_LOGGING_ENABLED:
            LOG_DIR.mkdir(parents=True, exist_ok=True)
            day = date.astimezone(LOCAL_TZ).strftime("%Y-%m-%d")
            with (LOG_DIR / f"{day}.txt").open("a", encoding="utf-8") as output:
                output.write(_entry_line(entry))
    except Exception:
        pass


def flush(timeout: float = 2.0) -> None:
    # A bounded wait for shutdown hooks and tests.
    done = threading.Event()
    def waiter():
        QUEUE.join()
        done.set()
    threading.Thread(target=waiter, daemon=True).start()
    done.wait(timeout)


def validate_config() -> None:
    if TIMEZONE_CONFIG_ERROR:
        raise ValueError("LOG_TIMEZONE must be a valid IANA timezone")
    try:
        ZoneInfo(TIMEZONE_NAME)
    except Exception as error:
        raise ValueError("LOG_TIMEZONE must be a valid IANA timezone") from error
    if os.getenv("LOG_RETENTION_DAYS") is not None and (not os.getenv("LOG_RETENTION_DAYS", "").isdigit() or int(os.getenv("LOG_RETENTION_DAYS", "0")) < 1):
        raise ValueError("LOG_RETENTION_DAYS must be a positive integer")
    if os.getenv("LOG_BURST_LIMIT_PER_MINUTE") is not None and (not os.getenv("LOG_BURST_LIMIT_PER_MINUTE", "").isdigit() or int(os.getenv("LOG_BURST_LIMIT_PER_MINUTE", "0")) < 1):
        raise ValueError("LOG_BURST_LIMIT_PER_MINUTE must be a positive integer")
    if os.getenv("LOG_LEVEL") is not None and os.getenv("LOG_LEVEL", "").lower() not in LEVELS:
        raise ValueError("LOG_LEVEL must be error, warn, or info")
    log("info", "logging.mode", "Exception logging mode: file+stdout" if FILE_LOGGING_ENABLED else "Exception logging mode: stdout-only")
