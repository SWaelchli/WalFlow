"""Guard: repo paths named in the LLM instruction documents must exist.

These docs went stale before (renamed files, moved folders). A failure lists every `doc:line -> path` that is
missing; fix the doc (or the move), never loosen the extractor. Only run-time or git-ignored outputs are allowlisted.
"""
import glob
import os
import re

from helpers.walflow_paths import REPO_ROOT

ROOT_PREFIXES = ("backend/", "frontend/", "docs/", "design-system/", ".claude/", ".agents/", ".github/", "deploy/")
SKIP_CHARS = ("<", ">", "*", "{", "}", "[", "]", "$", "...", "…", " ")

# Paths created at run time or git-ignored, so absent from a clean checkout. Add an entry only when a doc must name
# such a path, with a one-line reason.
ALLOWED_MISSING = {
    "backend/tests/bench/performance_findings.md",  # temporary performance findings file, git-ignored
}

_LINK_RE = re.compile(r"\[[^\]\n]*\]\(([^)\s]+)\)")
_CODE_RE = re.compile(r"(?<!`)`([^`\n]+)`(?!`)")
_SCHEME_RE = re.compile(r"^[A-Za-z][A-Za-z0-9+.\-]*:")


def _doc_files():
    files = [os.path.join(REPO_ROOT, p) for p in (
        "AGENTS.md", "CLAUDE.md", "DEVELOPMENT.md",
        os.path.join("frontend", "AGENTS.md"),
        os.path.join("design-system", "walflow", "MASTER.md"),
    )]
    files += glob.glob(os.path.join(REPO_ROOT, ".agents", "rules", "*.md"))
    files += glob.glob(os.path.join(REPO_ROOT, ".claude", "agents", "*.md"))
    skills = os.path.join(REPO_ROOT, ".claude", "skills")
    generic = (os.path.join(skills, "ux-audit") + os.sep, os.path.join(skills, "ui-ux-pro-max") + os.sep)
    walflow_ref = os.path.join(skills, "ux-audit", "references", "walflow.md")
    for f in glob.glob(os.path.join(skills, "**", "*.md"), recursive=True):
        if f == walflow_ref or not f.startswith(generic):
            files.append(f)
    return sorted(set(files))


def _skipped(candidate):
    return any(c in candidate for c in SKIP_CHARS) or re.search(r"X\.X", candidate) is not None


def extract_paths(text, doc_dir):
    """Yield (line number, absolute candidate path, as written) for paths the rules count."""
    in_fence = False
    for no, line in enumerate(text.splitlines(), 1):
        if line.lstrip().startswith("```"):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        for target in _LINK_RE.findall(line):
            if target.startswith("#") or target.startswith("mailto:") or _SCHEME_RE.match(target):
                continue
            target = target.split("#", 1)[0]
            if target and not _skipped(target):
                yield no, os.path.normpath(os.path.join(doc_dir, target)), target
        for span in _CODE_RE.findall(line):
            if not span.startswith(ROOT_PREFIXES) or _skipped(span):
                continue
            span = re.sub(r":\d+(-\d+)?$", "", span)
            yield no, os.path.normpath(os.path.join(REPO_ROOT, span)), span


def _inside_repo(path):
    root = os.path.normcase(REPO_ROOT)
    return os.path.normcase(path) == root or os.path.normcase(path).startswith(root + os.sep)


def missing_paths(text, doc_dir):
    out = []
    for no, absolute, written in extract_paths(text, doc_dir):
        if not _inside_repo(absolute) or os.path.exists(absolute):
            continue
        rel = os.path.relpath(absolute, REPO_ROOT).replace(os.sep, "/")
        if rel.rstrip("/") in ALLOWED_MISSING or written.rstrip("/") in ALLOWED_MISSING:
            continue
        out.append((no, written))
    return out


def test_extractor_flags_a_missing_path_and_ignores_placeholders():
    text = (
        "see [x](no/such/file.md#a) and `backend/does_not_exist.py:12-20`\n"
        "ok `backend/tests/helpers/walflow_paths.py` `backend/<name>.py` [w](https://x.y/z) [t](#top)\n"
        "```\n`backend/in_fence.py`\n```\n"
    )
    found = missing_paths(text, REPO_ROOT)
    assert found == [(1, "no/such/file.md"), (1, "backend/does_not_exist.py")]


def test_instruction_docs_name_only_existing_paths():
    docs = _doc_files()
    assert len(docs) > 10, "instruction documents not found; check REPO_ROOT"
    problems = []
    for doc in docs:
        with open(doc, encoding="utf-8") as fh:
            text = fh.read()
        rel_doc = os.path.relpath(doc, REPO_ROOT).replace(os.sep, "/")
        problems += [f"{rel_doc}:{no} -> {p}" for no, p in missing_paths(text, os.path.dirname(doc))]
    assert not problems, "Instruction docs name paths that do not exist:\n" + "\n".join(problems)
