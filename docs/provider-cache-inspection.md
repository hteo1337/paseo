# Cache-only provider inspection

`PaseoApi.providers.cachedSnapshot(options)` reuses the provider snapshot RPC with `cachedOnly: true`. The client requires `server_info.features.providerSnapshotCacheOnly` before sending and requires an explicit `cacheState` acknowledgment in the response. Missing support is an update-required error, never a fallback to discovery.

The manager reads only an existing target's published snapshot. An absent target returns empty records with `cacheState: missing`; it does not create a target, instantiate a client, warm providers, fetch catalogs, inspect credentials or invoke quota. Available cache may contain loading/error/stale entries. Cache availability does not prove a provider is ready, an account is authenticated or a profile/endpoint belongs to an intended owner. Callers should project public metadata and omit free-text errors/options.

Ordinary snapshot reads retain their existing lazy warmup behavior. This optional path does not stop unrelated background discovery, change provider configuration or claim full daemon isolation. Directory/profile/credential isolation remains separate from this cache read contract.

The wire request, response and feature fields are optional for protocol compatibility. Old clients continue using normal reads. New cache-only callers refuse old hosts before the RPC; unknown fields are not treated as a safe old-host fallback.
