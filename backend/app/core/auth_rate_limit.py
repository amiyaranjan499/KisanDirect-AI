from collections import defaultdict, deque
from math import ceil
from threading import Lock
from time import monotonic


class AuthRateLimiter:
    def __init__(self, max_requests: int, window_seconds: int) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._requests: dict[tuple[str, str], deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def check(self, endpoint: str, client_ip: str, now: float | None = None) -> int | None:
        current_time = monotonic() if now is None else now
        cutoff = current_time - self.window_seconds
        key = (endpoint, client_ip)
        with self._lock:
            requests = self._requests[key]
            while requests and requests[0] <= cutoff:
                requests.popleft()
            if len(requests) >= self.max_requests:
                return max(1, ceil(requests[0] + self.window_seconds - current_time))
            requests.append(current_time)
            return None
