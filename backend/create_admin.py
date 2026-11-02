"""Backend module bridge to scripts.create_admin."""
import sys
from pathlib import Path

# Ensure project root is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.create_admin import admin_exists, create_admin, main

__all__ = ["admin_exists", "create_admin", "main"]

if __name__ == "__main__":
    main()

