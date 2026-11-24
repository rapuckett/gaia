# Copyright(C) 2025-2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT

"""--fake-embeddings lets documents finish indexing on the dev backend."""

import math
import os

import pytest
from fastapi.testclient import TestClient

from gaia.llm.lemonade_client import DEFAULT_EMBEDDING_MODEL, DEFAULT_MODEL_NAME
from gaia.rag.sdk import RAGSDK
from gaia.testing import dev_backend


@pytest.fixture(autouse=True)
def _main_never_serves(monkeypatch):
    def refuse(*_args, **_kwargs):
        raise AssertionError("main() reached run(); it would serve until killed")

    monkeypatch.setattr(dev_backend, "run", refuse)


def _client(fake_embeddings=True):
    app = dev_backend.build_fake_llm(
        [], DEFAULT_MODEL_NAME, [], fake_embeddings=fake_embeddings
    )
    return TestClient(app)


def test_fake_embedding_is_a_deterministic_unit_vector():
    a = dev_backend.fake_embedding("fox")

    assert len(a) == dev_backend.FAKE_EMBEDDING_DIM
    assert a == dev_backend.fake_embedding("fox")
    assert a != dev_backend.fake_embedding("dog")
    assert math.isclose(sum(v * v for v in a), 1.0, rel_tol=1e-6)


def test_endpoint_answers_the_request_the_indexer_sends():
    texts = ["alpha", "beta", "alpha"]
    # The body LemonadeClient._embeddings_once posts: model + input list.
    res = _client().post(
        "/api/v1/embeddings", json={"model": DEFAULT_EMBEDDING_MODEL, "input": texts}
    )

    assert res.status_code == 200
    body = res.json()
    vectors = RAGSDK._vectors_from_response(body, texts, 1, None)
    assert [len(v) for v in vectors] == [dev_backend.FAKE_EMBEDDING_DIM] * 3
    assert vectors[0] == vectors[2] != vectors[1]
    assert [d["index"] for d in body["data"]] == [0, 1, 2]


def test_a_single_string_input_is_one_vector():
    res = _client().post("/api/v1/embeddings", json={"model": "m", "input": "just one"})

    assert len(res.json()["data"]) == 1


def test_bad_input_is_a_400_not_a_crash():
    res = _client().post("/api/v1/embeddings", json={"model": "m", "input": [1]})

    assert res.status_code == 400


def test_endpoint_is_absent_without_the_flag():
    res = _client(fake_embeddings=False).post(
        "/api/v1/embeddings", json={"model": "m", "input": ["x"]}
    )

    assert res.status_code in (404, 405)


@pytest.mark.parametrize("raw", ["1", "true", "YES", " on "])
def test_parse_flag_true(raw):
    assert dev_backend.parse_flag(raw, "x") is True


@pytest.mark.parametrize("raw", ["0", "false", "No", "off"])
def test_parse_flag_false(raw):
    assert dev_backend.parse_flag(raw, "x") is False


@pytest.mark.parametrize("raw", ["maybe", "", "2"])
def test_invalid_env_value_is_a_startup_error_naming_the_variable(
    raw, monkeypatch, tmp_path, capsys
):
    monkeypatch.setattr(os, "environ", dict(os.environ))
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("GAIA_HOME", str(tmp_path / "home"))
    monkeypatch.setenv(dev_backend.FAKE_EMBEDDINGS_ENV, raw)

    code = dev_backend.main(["--port", "4299", "--home", str(tmp_path / "home")])

    assert code == dev_backend.EX_USAGE
    assert dev_backend.FAKE_EMBEDDINGS_ENV in capsys.readouterr().err


def test_flag_and_env_both_turn_it_on(monkeypatch, tmp_path):
    monkeypatch.setattr(os, "environ", dict(os.environ))
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setenv("GAIA_HOME", str(tmp_path / "home"))
    monkeypatch.delenv(dev_backend.FAKE_EMBEDDINGS_ENV, raising=False)
    seen = []
    monkeypatch.setattr(dev_backend, "run", lambda *a: seen.append(a[-1]) or 0)
    base = ["--port", "4299", "--home", str(tmp_path / "home")]

    assert dev_backend.main(base) == 0
    assert dev_backend.main([*base, "--fake-embeddings"]) == 0
    monkeypatch.setenv(dev_backend.FAKE_EMBEDDINGS_ENV, "1")
    assert dev_backend.main(base) == 0

    assert seen == [False, True, True]
