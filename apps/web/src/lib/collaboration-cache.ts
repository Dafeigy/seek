export function collaborationCacheName(documentId: string) {
  // Phase 1.1 replaces the bootstrap identities with authenticated IDs. The
  // namespaced format prevents returning to a document-only browser cache key.
  return `seek:yjs:bootstrap-user:bootstrap-workspace:${documentId}`;
}
