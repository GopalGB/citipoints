"""Async wrapper around the Claude Code CLI binary.

Used by the AI Chat endpoint so G's existing Claude Code subscription powers
the RAG Q&A without a separate Anthropic API key. The CLI is invoked in
non-interactive print mode with a model override; stdin receives the full
prompt (schema + sample rows + question).
"""

from __future__ import annotations

import asyncio
import json
import shlex
from dataclasses import dataclass

from citipoints_api.config import get_settings
from citipoints_api.logging_conf import get_logger

logger = get_logger(__name__)


class ClaudeCliError(RuntimeError):
    """Raised when the Claude CLI invocation fails."""


@dataclass(frozen=True)
class ClaudeResult:
    text: str
    model: str
    raw_stdout: str


async def run_claude(
    prompt: str,
    *,
    system: str | None = None,
    timeout_s: float | None = None,
) -> ClaudeResult:
    """Invoke the Claude Code CLI in non-interactive print mode.

    The binary is expected to support ``--print`` and ``--model``. Stdin carries
    the user prompt so we can pass multi-line content without quoting issues.

    Optional ``timeout_s`` lets hot paths (chat, banners) fail fast and
    surface a fallback answer; defaults to ``settings.claude_cli_timeout_seconds``.
    """
    settings = get_settings()
    cli = shlex.quote(settings.claude_cli_path)
    model = shlex.quote(settings.claude_cli_model)
    effective_timeout = float(timeout_s or settings.claude_cli_timeout_seconds)

    args = [settings.claude_cli_path, "--print", "--model", settings.claude_cli_model]
    if system:
        args.extend(["--append-system-prompt", system])

    logger.info(
        "claude_cli.invoke",
        cli=cli,
        model=model,
        bytes=len(prompt),
        timeout_s=effective_timeout,
    )
    try:
        proc = await asyncio.create_subprocess_exec(
            *args,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except FileNotFoundError as exc:
        raise ClaudeCliError(
            f"Claude CLI not found at `{settings.claude_cli_path}`. "
            "Set CLAUDE_CLI_PATH or install Claude Code.",
        ) from exc

    try:
        stdout, stderr = await asyncio.wait_for(
            proc.communicate(input=prompt.encode("utf-8")),
            timeout=effective_timeout,
        )
    except asyncio.TimeoutError as exc:
        proc.kill()
        raise ClaudeCliError(
            f"Claude CLI timed out after {effective_timeout:.0f}s",
        ) from exc

    if proc.returncode != 0:
        raise ClaudeCliError(
            f"Claude CLI exited {proc.returncode}: {stderr.decode('utf-8', 'ignore').strip()}",
        )

    text = stdout.decode("utf-8", "ignore").strip()
    return ClaudeResult(text=text, model=settings.claude_cli_model, raw_stdout=text)


def extract_json_block(text: str) -> dict[str, object] | None:
    """Best-effort JSON extraction from a Claude answer.

    The CLI sometimes wraps JSON in markdown code fences; peel them off.
    """
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        newline = cleaned.find("\n")
        if newline != -1:
            cleaned = cleaned[newline + 1 :]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
    try:
        parsed = json.loads(cleaned.strip())
    except json.JSONDecodeError:
        return None
    if isinstance(parsed, dict):
        return parsed
    return None
