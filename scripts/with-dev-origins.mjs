#!/usr/bin/env node
import os from "node:os";
import { spawn } from "node:child_process";

// Interface-name prefixes that indicate a virtual/container bridge rather than
// a physical NIC. Mirrors the filter previously done by with-dev-origins.sh
// (docker, br-*, veth*, virbr*, podman*, cni*, flannel*) and adds the common
// Windows virtual adapters (Hyper-V / WSL "vEthernet ...").
const VIRTUAL_INTERFACE =
  /^(docker|br-|veth|virbr|podman|cni|flannel|vethernet|loopback|hyper-v|wsl)/i;

function detectLanOrigins() {
  const origins = new Set();
  for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
    if (VIRTUAL_INTERFACE.test(name)) continue;
    for (const address of addresses ?? []) {
      if (address.internal) continue; // loopback
      if (address.family !== "IPv4" && address.family !== 4) continue;
      if (address.address.startsWith("169.254.")) continue; // link-local
      origins.add(address.address);
    }
  }
  return [...origins].sort();
}

const detected = detectLanOrigins();
process.env.SEEK_DETECTED_DEV_ORIGINS = detected.join(",");

console.log(
  detected.length > 0
    ? `Next.js LAN development origins: ${detected.join(",")}`
    : "Next.js LAN development origins: none detected",
);

const [command, ...args] = process.argv.slice(2);

if (command === "--print") {
  process.exit(0);
}

if (!command) {
  console.error(`usage: ${process.argv[1]} COMMAND [ARGUMENT ...]`);
  process.exit(2);
}

// Run the wrapped command (e.g. `next dev`) in the foreground so it shares
// stdio with the terminal. `shell: true` lets Windows resolve the `next` shim
// (next.cmd) on PATH; on POSIX it runs via /bin/sh.
const child = spawn([command, ...args].join(" "), {
  stdio: "inherit",
  shell: true,
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (!child.killed) child.kill(signal);
  });
}

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});
