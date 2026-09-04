export type TreeDocument = {
  id: string;
  parentId: string | null;
  sortOrder: number;
};

export function descendantsOf(documents: TreeDocument[], rootId: string) {
  const children = new Map<string, string[]>();
  for (const document of documents) {
    if (!document.parentId) continue;
    const siblings = children.get(document.parentId) ?? [];
    siblings.push(document.id);
    children.set(document.parentId, siblings);
  }
  const descendants = new Set<string>();
  const pending = [rootId];
  while (pending.length) {
    const id = pending.pop()!;
    for (const child of children.get(id) ?? []) {
      if (!descendants.has(child)) {
        descendants.add(child);
        pending.push(child);
      }
    }
  }
  return descendants;
}

export function isValidParent(documents: TreeDocument[], documentId: string, parentId: string | null) {
  if (parentId === documentId) return false;
  if (!parentId) return true;
  return !descendantsOf(documents, documentId).has(parentId);
}

export function nextSortOrder(siblings: TreeDocument[]) {
  return siblings.length ? Math.max(...siblings.map((document) => document.sortOrder)) + 1 : 1;
}
