from __future__ import annotations

import time
from unittest.mock import MagicMock

import pytest
import psycopg2

from app import db


class FakePool:
    def __init__(self, connections: list[MagicMock], **kwargs) -> None:
        self.available = connections
        self.returned: list[tuple[MagicMock, bool]] = []
        self.options = kwargs
        self.fail_checkout = False

    def getconn(self) -> MagicMock:
        if self.fail_checkout or not self.available:
            raise psycopg2.pool.PoolError("pool is exhausted")
        return self.available.pop(0)

    def putconn(self, connection: MagicMock, close: bool = False) -> None:
        self.returned.append((connection, close))
        if not close:
            self.available.append(connection)

    def closeall(self) -> None:
        return None


@pytest.fixture
def fake_pool(monkeypatch: pytest.MonkeyPatch) -> tuple[FakePool, MagicMock]:
    connection = MagicMock()
    connection.closed = 0
    connection.status = psycopg2.extensions.STATUS_READY
    pool = FakePool([connection])
    monkeypatch.setattr(db, "_connection_pool", None)
    monkeypatch.setattr(db, "_connection_last_returned_at", {})

    def create_pool(*args, **kwargs):
        pool.options = kwargs
        return pool

    monkeypatch.setattr(db, "ThreadedConnectionPool", create_pool)
    return pool, connection


def test_connection_pool_reuses_and_returns_connection(fake_pool: tuple[FakePool, MagicMock]) -> None:
    pool, native_connection = fake_pool

    with db.get_connection() as first:
        assert first._connection is native_connection
    with db.get_connection() as second:
        assert second._connection is native_connection

    assert len(pool.returned) == 2
    assert all(not discarded for _, discarded in pool.returned)
    assert native_connection.commit.call_count == 2


def test_connection_pool_rolls_back_and_returns_connection_on_error(fake_pool: tuple[FakePool, MagicMock]) -> None:
    pool, native_connection = fake_pool

    with pytest.raises(ValueError):
        with db.get_connection():
            raise ValueError("request failed")

    assert native_connection.rollback.call_count == 1
    assert pool.returned == [(native_connection, False)]


def test_connection_pool_discards_broken_connection(fake_pool: tuple[FakePool, MagicMock]) -> None:
    pool, native_connection = fake_pool

    with pytest.raises(db.DatabaseUnavailable):
        with db.get_connection():
            raise psycopg2.OperationalError("connection dropped")

    assert pool.returned == [(native_connection, True)]
    native_connection.rollback.assert_not_called()


def test_connection_pool_checks_idle_connection_and_uses_safe_limits(fake_pool: tuple[FakePool, MagicMock]) -> None:
    pool, native_connection = fake_pool
    with db.get_connection():
        pass
    db._connection_last_returned_at[id(native_connection)] = time.monotonic() - db._STALE_CONNECTION_CHECK_SECONDS - 1

    with db.get_connection():
        pass

    native_connection.cursor.return_value.__enter__.return_value.execute.assert_called_once_with("SELECT 1")
    assert pool.options["keepalives"] == 1
    assert pool.options["keepalives_idle"] == 30
    assert pool.options["keepalives_interval"] == 10
    assert pool.options["keepalives_count"] == 3


def test_connection_pool_exhaustion_fails_immediately(fake_pool: tuple[FakePool, MagicMock]) -> None:
    pool, _ = fake_pool
    pool.fail_checkout = True

    with pytest.raises(db.DatabasePoolExhausted):
        db.get_connection()