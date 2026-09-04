export function collaborationCacheName(documentId: string, scope = "anonymous") {
  // A browser profile can switch accounts; keep each user's local CRDT updates
  // in an isolated IndexedDB namespace instead of reusing a document-only key.
  return `seek:yjs:${scope}:${documentId}`;
}
