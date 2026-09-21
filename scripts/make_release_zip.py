"""Create a source release containing tracked files only."""
from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "release.zip"
EXCLUDES = [
    ":(exclude)backend/.env",
    ":(exclude).env",
    ":(exclude)**/.env",
    ":(exclude)venv/**",
    ":(exclude)**/venv/**",
    ":(exclude)node_modules/**",
    ":(exclude)**/node_modules/**",
    ":(exclude)backend/storage/uploads/**",
]


def main() -> None:
    if not (ROOT / ".git").is_dir():
        raise SystemExit("Run this script from a Git checkout; git archive requires .git")
    command = ["git", "-C", str(ROOT), "archive", "--format=zip", f"--output={OUTPUT}", "HEAD", *EXCLUDES]
    subprocess.run(command, check=True)
    print(f"Created {OUTPUT}")


if __name__ == "__main__":
    sys.exit(main())
