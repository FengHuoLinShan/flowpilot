from __future__ import annotations

import logging
import signal
import time

from .config import Settings
from .services import Services


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    service = Services(Settings.from_env())
    stopping = False

    def stop(*_):
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    logging.info("FlowPilot durable worker started (engine=%s).", service.settings.engine)
    try:
        while not stopping:
            try:
                service.tick()
            except Exception:
                # Never log request bodies, credentials, PII, or upstream response text.
                logging.error("Worker tick failed; persisted leases remain recoverable. Inspect database availability.")
            time.sleep(service.settings.worker_poll_seconds)
    finally:
        service.close()
        logging.info("FlowPilot worker stopped.")


if __name__ == "__main__":
    main()
