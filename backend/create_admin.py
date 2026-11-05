"""Backend module bridge to scripts.create_admin."""
import sys
from pathlib import Path

# Ensure project root is in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.create_admin import admin_exists, create_admin, main

__all__ = ["admin_exists", "create_admin", "main"]

if __name__ == "__main__":
    main()

