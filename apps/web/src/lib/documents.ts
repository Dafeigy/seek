import { nanoid } from "nanoid/non-secure";

export const TEAM_PROJECTS = ["平台基础设施", "算法研究", "客户端"] as const;
export const PRIVATE_PROJECTS = ["个人工作台"] as const;

export const DEFAULT_PROJECT = TEAM_PROJECTS[0];

export type ProjectSummary = {
  name: string;
  isPrivate: boolean;
};

export type DocumentSummary = {
  id: string;
  title: string;
  project: string;
  updatedAt: string;
  createdAt: string;
};

export type DocumentBootstrap = {
  id: string;
  title: string;
  project: string;
  blockJson: unknown[];
  markdown: string;
  plainText: string;
  contentVersion: number;
  updatedAt: string;
  collaborationCacheScope?: string;
};

export function normalizeTitle(value: unknown, fallback = "未命名文档") {
  if (typeof value !== "string") return fallback;
  const title = value.trim().replace(/\s+/g, " ").slice(0, 120);
  return title || fallback;
}

export function normalizeProject(value: unknown, fallback: string = DEFAULT_PROJECT) {
  if (typeof value !== "string") return fallback;
  const project = value.trim().replace(/\s+/g, " ").slice(0, 60);
  return project || fallback;
}

export function createDocumentId() {
  // Document IDs are identifiers, not credentials. The non-secure generator also
  // works when the development site is opened over HTTP through a LAN IP.
  return `document-${nanoid()}`;
}
