# Separate Voyage query embeddings

Knowledge settings now distinguish **Document embedding model** (indexing) from **Query embedding model** (retrieval). The query default is **Same as document model**, preserving existing behavior. Choose an approved Voyage 4 Lite query model to search an existing Voyage 4 document index without rebuilding it. Clearing the query setting restores the document model.

## Compatibility approval

The first version supports text-only internal high-quality datasets and Voyage 4-family pairs (`voyage-4`, `voyage-4-lite`, `voyage-4-large`). Voyage 3/3.5 and other embedding families cannot use an independent query model. Equal vector dimensions alone do not imply a compatible embedding space.

When the document embedding model belongs to the Voyage 4 family, active Voyage 4 models configured under the same provider in the workspace are automatically discovered and selectable in the UI without requiring server-level configuration.

For multi-tenant environments or explicit operator constraints, a tenant-scoped, credential-free JSON profile can optionally be configured through `VOYAGE_QUERY_EMBEDDING_PROFILES`, available to API and worker services:

```json
[
  {
    "tenant_id": "your-dify-workspace-id",
    "provider": "langgenius/openai_api_compatible/openai_api_compatible",
    "document_model": "voyage/voyage-4",
    "query_model": "voyage/voyage-4-lite",
    "dimensions": 1024,
    "encoding": "float"
  }
]
```

Use the actual indexed dimensions, not the example value. Allowed sizes are 256, 512, 1024 and 2048. Native provider model names without the `voyage/` prefix are also accepted. When operator profiles are specified, they enforce strict tenant and provider restrictions. When `VOYAGE_QUERY_EMBEDDING_PROFILES` is empty (the default), active Voyage 4 models under the same provider are automatically permitted. Reverify approval after changing provider endpoint mappings or output options. Do not include credentials in profiles.

After installing the additive database migration, deploy API/worker and web together. Register both models as active text embedding models in the target workspace. The UI presents available Voyage 4 choices from the workspace's active model list. Unsupported configurations keep the document default; an existing override that becomes unavailable remains visible with an error until explicitly cleared. APIs enforce approval independently of the UI.

On save, Dify checks available model schemas and actual output dimensions with fixed non-customer validation text. This produces two small embedding requests when validating an override. Retrieval also checks query dimensions, including cached vectors, before sending a vector to the database. Query caches use tenant/provider/model/dimensions/encoding identity; document cache and collection identity are unchanged.

## API usage

Dataset create/update accept `query_embedding_model_provider` and `query_embedding_model`. Both must be supplied for an override. On updates, omission preserves the saved selection; setting both to `null` clears it. Changing a document model to an incompatible pair is rejected until the query override is cleared. Query-only changes schedule neither vector reindexing nor summary regeneration.

Semantic/hybrid, API and workflow retrieval use the selected query model through the shared vector embedding owner. Weighted hybrid scoring also uses the override. Multi-dataset weighted scoring requires matching document and query model selections; use a reranking model for mixed selections. Multimodal datasets retain their existing same-model behavior.

## Verification and rollout

Pilot a Voyage 4 dataset after verifying its existing index dimensions. Compare an identical set of uncached questions using the document default and Voyage 4 Lite: relevant passages, evidence quality, embedding/end-to-end p50 and p95 latency, error rate, cache behavior and cost. Earlier small production probes showed mixed latency, so do not assume Lite will be faster for this deployment.

Keep document embeddings unchanged. Leave Voyage 3.5 datasets on their own model. Roll back by clearing both query fields; no index rebuild is needed. This source change does not itself configure profiles, activate Lite in production, or rebuild any dataset.
