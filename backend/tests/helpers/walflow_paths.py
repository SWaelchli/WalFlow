"""Repository paths used by tests that read shipped files (examples, frontend data, docs)."""
import os

TESTS_DIR = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
REPO_ROOT = os.path.abspath(os.path.join(TESTS_DIR, "..", ".."))
FRONTEND_SRC = os.path.join(REPO_ROOT, "frontend", "src")
DATA_DIR = os.path.join(FRONTEND_SRC, "data")
EXAMPLES_DIR = os.path.join(DATA_DIR, "examples")
GOLDEN_FILE = os.path.join(TESTS_DIR, "data", "golden_examples.json")
