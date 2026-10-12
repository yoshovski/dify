"""Resolve a query override only for operator-verified Voyage 4 embedding spaces."""

from configs import dify_config
from configs.feature.voyage_query_embedding import VoyageQueryEmbeddingProfile, is_voyage_four_model
from core.entities.embedding_type import EmbeddingInputType
from core.model_manager import ModelManager
from core.rag.embedding.cached_embedding import CacheEmbedding
from core.rag.index_processor.constant.index_type import IndexTechniqueType
from graphon.model_runtime.entities.model_entities import ModelFeature, ModelType
from models.dataset import Dataset


def approved_profiles(tenant_id: str) -> list[VoyageQueryEmbeddingProfile]:
    return [p for p in dify_config.VOYAGE_QUERY_EMBEDDING_PROFILES if p.tenant_id == tenant_id]


def validate_query_model(dataset: Dataset, *, check_models: bool = False) -> VoyageQueryEmbeddingProfile | None:
    provider, model = dataset.query_embedding_model_provider, dataset.query_embedding_model
    if provider is None and model is None:
        return None
    if not provider or not model:
        raise ValueError("Query embedding provider and model must be set or cleared together")
    if dataset.provider != "vendor" or dataset.indexing_technique != IndexTechniqueType.HIGH_QUALITY:
        raise ValueError("Separate query models require an internal high-quality knowledge base")
    if dataset.is_multimodal:
        raise ValueError("Separate query models currently support text knowledge bases only")
    profile = next(
        (
            p
            for p in approved_profiles(dataset.tenant_id)
            if p.provider == dataset.embedding_model_provider == provider
            and p.document_model == dataset.embedding_model
            and p.query_model == model
        ),
        None,
    )
    if profile is None:
        if (
            not dify_config.VOYAGE_QUERY_EMBEDDING_PROFILES
            and dataset.embedding_model_provider == provider
            and is_voyage_four_model(dataset.embedding_model)
            and is_voyage_four_model(model)
        ):
            profile = VoyageQueryEmbeddingProfile(
                tenant_id=dataset.tenant_id,
                provider=provider,
                document_model=dataset.embedding_model,
                query_model=model,
                dimensions=1024,
                encoding="float",
            )
        else:
            raise ValueError("This document/query pair is not an approved Voyage 4 embedding space")
    if check_models:
        manager = ModelManager.for_tenant(tenant_id=dataset.tenant_id)
        doc_instance = manager.get_model_instance(
            tenant_id=dataset.tenant_id,
            provider=profile.provider,
            model_type=ModelType.TEXT_EMBEDDING,
            model=profile.document_model,
        )
        query_instance = manager.get_model_instance(
            tenant_id=dataset.tenant_id,
            provider=profile.provider,
            model_type=ModelType.TEXT_EMBEDDING,
            model=profile.query_model,
        )
        for instance, name in ((doc_instance, profile.document_model), (query_instance, profile.query_model)):
            schema = instance.model_type_instance.get_model_schema(name, instance.credentials)
            if schema is None or (schema.features and ModelFeature.VISION in schema.features):
                raise ValueError("Separate query models require available text-only embedding models")

        doc_result = doc_instance.invoke_text_embedding(
            texts=["Embedding compatibility validation"], input_type=EmbeddingInputType.DOCUMENT
        )
        query_result = query_instance.invoke_text_embedding(
            texts=["Embedding compatibility validation"], input_type=EmbeddingInputType.QUERY
        )
        if len(doc_result.embeddings) != 1 or len(query_result.embeddings) != 1:
            raise ValueError("Embedding compatibility validation failed")

        doc_dim = len(doc_result.embeddings[0])
        query_dim = len(query_result.embeddings[0])
        if doc_dim != query_dim:
            raise ValueError(
                f"Embedding dimensions must match: document model output {doc_dim} vs query model output {query_dim}"
            )

        is_explicit = any(
            p.provider == profile.provider
            and p.document_model == profile.document_model
            and p.query_model == profile.query_model
            for p in approved_profiles(dataset.tenant_id)
        )
        if is_explicit and doc_dim != profile.dimensions:
            raise ValueError("Embedding dimensions must match the approved Voyage 4 profile")

        if doc_dim in (256, 512, 1024, 2048) and doc_dim != profile.dimensions:
            profile = VoyageQueryEmbeddingProfile(
                tenant_id=profile.tenant_id,
                provider=profile.provider,
                document_model=profile.document_model,
                query_model=profile.query_model,
                dimensions=doc_dim,
                encoding=profile.encoding,
            )
    return profile


def query_embedding_override(dataset: Dataset) -> CacheEmbedding | None:
    profile = validate_query_model(dataset)
    if profile is None:
        return None
    manager = ModelManager.for_tenant(tenant_id=dataset.tenant_id)
    instance = manager.get_model_instance(
        tenant_id=dataset.tenant_id,
        provider=profile.provider,
        model_type=ModelType.TEXT_EMBEDDING,
        model=profile.query_model,
    )
    return CacheEmbedding(
        instance,
        query_cache_namespace=f"{profile.tenant_id}:voyage4:{profile.dimensions}:{profile.encoding}",
        query_dimensions=profile.dimensions,
    )
