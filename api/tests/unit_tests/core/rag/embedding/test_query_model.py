"""Compatible query overrides must preserve indexing and reject unsafe pairs."""

import base64
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import numpy as np
import pytest
from pydantic import ValidationError

from configs.feature.voyage_query_embedding import VoyageQueryEmbeddingProfile
from core.entities.embedding_type import EmbeddingInputType
from core.rag.datasource.vdb.vector_factory import _LazyEmbeddings
from core.rag.embedding import query_model
from core.rag.embedding.cached_embedding import CacheEmbedding
from models.dataset import Dataset
from services.dataset_service import DatasetService
from tests.unit_tests.config_override import apply_config_overrides


def dataset(**changes):
    values = {
        "id": "dataset-1",
        "tenant_id": "tenant-1",
        "name": "Voyage documents",
        "created_by": "user-1",
        "provider": "vendor",
        "indexing_technique": "high_quality",
        "is_multimodal": False,
        "embedding_model_provider": "voyage-provider",
        "embedding_model": "voyage/voyage-4",
        "query_embedding_model_provider": "voyage-provider",
        "query_embedding_model": "voyage/voyage-4-lite",
    }
    values.update(changes)
    return Dataset(**values)


@pytest.fixture
def approved(monkeypatch):
    profile = VoyageQueryEmbeddingProfile(
        tenant_id="tenant-1",
        provider="voyage-provider",
        document_model="voyage/voyage-4",
        query_model="voyage/voyage-4-lite",
        dimensions=256,
    )
    apply_config_overrides(monkeypatch, VOYAGE_QUERY_EMBEDDING_PROFILES=[profile])
    return profile


def test_default_keeps_existing_embedding_model():
    assert (
        query_model.validate_query_model(dataset(query_embedding_model=None, query_embedding_model_provider=None))
        is None
    )


@pytest.mark.parametrize(
    "changes",
    [
        {"query_embedding_model_provider": None},
        {"query_embedding_model": None},
        {"tenant_id": "another-tenant"},
        {"embedding_model": "voyage-3.5"},
        {"query_embedding_model": "text-embedding-3-small"},
        {"query_embedding_model_provider": "other-provider"},
        {"indexing_technique": "economy"},
        {"provider": "external"},
        {"is_multimodal": True},
    ],
)
@pytest.mark.usefixtures("approved")
def test_rejects_unsafe_pairs(changes):
    with pytest.raises(ValueError):
        query_model.validate_query_model(dataset(**changes))


@pytest.mark.parametrize("model", ["voyage-3.5", "voyage-3", "arbitrary-alias", "text-embedding-3-small"])
def test_profiles_cannot_approve_other_families(model):
    with pytest.raises(ValidationError):
        VoyageQueryEmbeddingProfile(tenant_id="t", provider="p", document_model="voyage-4", query_model=model)


def test_alias_name_alone_is_not_approval(monkeypatch):
    apply_config_overrides(monkeypatch, VOYAGE_QUERY_EMBEDDING_PROFILES=[])
    with pytest.raises(ValueError, match="approved"):
        query_model.validate_query_model(dataset())


def test_save_verifies_document_and_query_output_dimensions(approved):
    instance = MagicMock()
    instance.model_type_instance.get_model_schema.return_value = SimpleNamespace(features=[])
    instance.invoke_text_embedding.return_value = SimpleNamespace(embeddings=[[0.1] * 256])
    manager = MagicMock()
    manager.get_model_instance.return_value = instance
    with patch.object(query_model.ModelManager, "for_tenant", return_value=manager):
        assert query_model.validate_query_model(dataset(), check_models=True) == approved
        assert [c.kwargs["input_type"] for c in instance.invoke_text_embedding.call_args_list] == [
            EmbeddingInputType.DOCUMENT,
            EmbeddingInputType.QUERY,
        ]
        instance.invoke_text_embedding.return_value = SimpleNamespace(embeddings=[[0.1] * 512])
        with pytest.raises(ValueError, match="dimensions"):
            query_model.validate_query_model(dataset(), check_models=True)


def test_index_and_query_use_separate_models(approved):
    instances = {
        name: MagicMock(provider="voyage-provider", model_name=name)
        for name in (approved.document_model, approved.query_model)
    }
    for instance in instances.values():
        instance.invoke_text_embedding.return_value = SimpleNamespace(embeddings=[[0.1] * 256])
    manager = MagicMock()
    manager.get_model_instance.side_effect = lambda **kw: instances[kw["model"]]
    with (
        patch.object(query_model.ModelManager, "for_tenant", return_value=manager),
        patch("core.rag.embedding.cached_embedding.redis_client.get", return_value=None),
        patch("core.rag.embedding.cached_embedding.redis_client.setex"),
        patch.object(CacheEmbedding, "embed_documents", return_value=[[0.1] * 256]) as documents,
    ):
        proxy = _LazyEmbeddings(dataset())
        assert proxy.embed_documents(["document"])
        assert len(proxy.embed_query("question")) == 256
        documents.assert_called_once_with(["document"])
        assert [c.kwargs["model"] for c in manager.get_model_instance.call_args_list] == [
            approved.document_model,
            approved.query_model,
        ]
        instances[approved.document_model].invoke_text_embedding.assert_not_called()
        assert (
            instances[approved.query_model].invoke_text_embedding.call_args.kwargs["input_type"]
            == EmbeddingInputType.QUERY
        )


@pytest.mark.parametrize("cached", [False, True])
def test_dimension_mismatch_never_reaches_vector_search(cached):
    instance = MagicMock(provider="voyage", model_name="voyage-4-lite")
    instance.invoke_text_embedding.return_value = SimpleNamespace(embeddings=[[0.1] * 512])
    value = base64.b64encode(np.array([0.1] * 512).tobytes()) if cached else None
    with (
        patch("core.rag.embedding.cached_embedding.redis_client.get", return_value=value),
        patch("core.rag.embedding.cached_embedding.redis_client.setex") as save,
        patch("core.rag.embedding.cached_embedding.redis_client.expire"),
    ):
        with pytest.raises(ValueError, match="dimensions"):
            CacheEmbedding(instance, query_cache_namespace="tenant-1", query_dimensions=256).embed_query("test")
        save.assert_not_called()


def test_query_cache_is_tenant_scoped():
    instance = MagicMock(provider="voyage", model_name="voyage-4-lite")
    instance.invoke_text_embedding.return_value = SimpleNamespace(embeddings=[[0.1] * 256])
    with (
        patch("core.rag.embedding.cached_embedding.redis_client.get", return_value=None) as get,
        patch("core.rag.embedding.cached_embedding.redis_client.setex"),
    ):
        for tenant in ("tenant-1", "tenant-2"):
            CacheEmbedding(instance, query_cache_namespace=tenant, query_dimensions=256).embed_query("same query")
        assert get.call_args_list[0].args[0] != get.call_args_list[1].args[0]


def test_set_and_clear_override_do_not_reindex(approved, sqlite_session):
    row = dataset(query_embedding_model=None, query_embedding_model_provider=None)
    sqlite_session.add(row)
    sqlite_session.commit()
    instance = MagicMock()
    instance.model_type_instance.get_model_schema.return_value = SimpleNamespace(features=[])
    instance.invoke_text_embedding.return_value = SimpleNamespace(embeddings=[[0.1] * 256])
    manager = MagicMock()
    manager.get_model_instance.return_value = instance
    with (
        patch.object(query_model.ModelManager, "for_tenant", return_value=manager),
        patch.object(DatasetService, "_update_pipeline_knowledge_base_node_data"),
        patch("services.dataset_service.deal_dataset_vector_index_task.delay") as index,
        patch("services.dataset_service.regenerate_summary_index_task.delay") as summaries,
    ):
        for model, provider in ((approved.query_model, approved.provider), (None, None)):
            DatasetService._update_internal_dataset(
                row,
                {
                    "query_embedding_model": model,
                    "query_embedding_model_provider": provider,
                },
                SimpleNamespace(id="user-1"),
                sqlite_session,
            )
            assert row.query_embedding_model == model
            assert row.embedding_model == approved.document_model
        index.assert_not_called()
        summaries.assert_not_called()


def test_weighted_scoring_uses_query_override_without_document_model():
    from core.rag.models.document import Document
    from core.rag.rerank.entity.weight import Weights
    from core.rag.rerank.weight_rerank import WeightRerankRunner

    weights = Weights(
        vector_setting={"vector_weight": 0.7, "embedding_provider_name": "voyage", "embedding_model_name": "voyage-4"},
        keyword_setting={"keyword_weight": 0.3},
    )
    query_embedding = MagicMock()
    query_embedding.embed_query.return_value = [1.0, 0.0]
    documents = [Document(page_content="document", vector=[1.0, 0.0], metadata={"doc_id": "1"}, provider="dify")]
    with patch("core.rag.rerank.weight_rerank.ModelManager.for_tenant") as manager:
        runner = WeightRerankRunner("tenant-1", weights, query_embedding=query_embedding)
        assert runner._calculate_cosine("tenant-1", "query", documents, weights.vector_setting) == [1.0]
        query_embedding.embed_query.assert_called_once_with("query")
        manager.assert_not_called()


def test_document_model_change_rejects_retained_query_override(approved, sqlite_session):
    row = dataset()
    sqlite_session.add(row)
    sqlite_session.commit()
    with (
        patch("services.dataset_service.deal_dataset_vector_index_task.delay") as index,
        pytest.raises(ValueError, match="approved"),
    ):
        DatasetService._update_internal_dataset(
            row, {"embedding_model": "voyage-3.5"}, SimpleNamespace(id="user-1"), sqlite_session
        )
    sqlite_session.refresh(row)
    assert row.embedding_model == approved.document_model
    assert row.query_embedding_model == approved.query_model
    index.assert_not_called()
