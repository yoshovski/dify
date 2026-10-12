"""Explicit operator approval for compatible Voyage aliases; no credentials belong here."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, field_validator


class VoyageQueryEmbeddingProfile(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    tenant_id: str
    provider: str
    document_model: str
    query_model: str
    dimensions: Literal[256, 512, 1024, 2048] = 1024
    encoding: Literal["float"] = "float"

    @field_validator("document_model", "query_model")
    @classmethod
    def voyage_four_only(cls, value: str) -> str:
        canonical = value.removeprefix("voyage/")
        if canonical not in {"voyage-4", "voyage-4-lite", "voyage-4-large"}:
            raise ValueError("Split query embeddings require a verified Voyage 4-family model")
        return value

    @field_validator("tenant_id", "provider")
    @classmethod
    def nonempty_scope(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("A tenant and provider are required for compatibility approval")
        return value
