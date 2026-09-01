type CollaborationUrlOptions = {
  pageUrl: string;
  port?: string;
  explicitUrl?: string;
};

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

export function resolveCollaborationUrl({ pageUrl, port, explicitUrl }: CollaborationUrlOptions): string | null {
  let page: URL;
  try {
    page = new URL(pageUrl);
  } catch {
    return null;
  }
  const runtimeHostname = page.hostname;

  if (explicitUrl) {
    try {
      const collaboration = new URL(explicitUrl);
      if (collaboration.protocol !== "ws:" && collaboration.protocol !== "wss:") return null;

      if (LOOPBACK_HOSTNAMES.has(collaboration.hostname) && collaboration.hostname !== runtimeHostname) {
        collaboration.hostname = runtimeHostname;
      }
      return collaboration.toString();
    } catch {
      return null;
    }
  }

  const collaborationPort = normalizePort(port);
  if (!collaborationPort) return null;

  page.protocol = page.protocol === "https:" ? "wss:" : "ws:";
  page.hostname = runtimeHostname;
  page.port = collaborationPort;
  page.pathname = "/";
  page.search = "";
  page.hash = "";
  return page.toString();
}

function normalizePort(value: string | undefined): string | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65_535 ? String(port) : null;
}
