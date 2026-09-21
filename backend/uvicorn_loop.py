import asyncio


def selector_loop_factory(*, use_subprocess: bool = False) -> asyncio.AbstractEventLoop:
    return asyncio.SelectorEventLoop()