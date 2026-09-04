import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL ?? "postgresql://seek:seek_dev_password@127.0.0.1:5432/seek");
await sql`create extension if not exists pg_trgm`;
await sql`
  create table if not exists workspaces (
    id text primary key,
    name text not null,
    created_at timestamptz not null default now()
  )
`;
await sql`
  create table if not exists users (
    id text primary key,
    email text not null,
    display_name text not null,
    password_hash text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (email)
  )
`;
await sql`
  create table if not exists workspace_members (
    workspace_id text not null references workspaces(id) on delete cascade,
    user_id text not null references users(id) on delete cascade,
    role text not null check (role in ('owner', 'admin', 'member', 'guest')),
    created_at timestamptz not null default now(),
    primary key (workspace_id, user_id)
  )
`;
await sql`
  create table if not exists auth_sessions (
    id text primary key,
    user_id text not null references users(id) on delete cascade,
    token_digest text not null unique,
    expires_at timestamptz not null,
    created_at timestamptz not null default now(),
    last_seen_at timestamptz not null default now()
  )
`;
await sql`
  create table if not exists workspace_invitations (
    id text primary key,
    workspace_id text not null references workspaces(id) on delete cascade,
    email text not null,
    role text not null check (role in ('admin', 'member', 'guest')),
    token_digest text not null unique,
    invited_by_user_id text not null references users(id) on delete cascade,
    expires_at timestamptz not null,
    accepted_at timestamptz,
    created_at timestamptz not null default now()
  )
`;
await sql`create index if not exists auth_sessions_token_digest_idx on auth_sessions(token_digest)`;
await sql`create index if not exists workspace_invitations_token_digest_idx on workspace_invitations(token_digest)`;
await sql`
  create table if not exists projects (
    name text primary key, is_private boolean not null default false,
    created_at timestamptz not null default now()
  )
`;
await sql`
  insert into projects (name, is_private)
  values ('平台基础设施', false), ('算法研究', false), ('客户端', false), ('个人工作台', true)
  on conflict (name) do nothing
`;
await sql`
  create table if not exists documents (
    id text primary key, title text not null, project text not null default '未分类',
    ydoc_state bytea, block_json jsonb not null default '[]'::jsonb,
    markdown text not null default '', plain_text text not null default '',
    content_version integer not null default 0,
    ydoc_initialized_at timestamptz, projected_at timestamptz,
    deleted_at timestamptz,
    updated_at timestamptz not null default now(), created_at timestamptz not null default now()
  )
`;
await sql`alter table documents add column if not exists ydoc_initialized_at timestamptz`;
await sql`alter table documents add column if not exists projected_at timestamptz`;
await sql`alter table documents add column if not exists deleted_at timestamptz`;
await sql`
  update documents
  set ydoc_initialized_at = coalesce(ydoc_initialized_at, updated_at)
  where ydoc_state is not null and ydoc_initialized_at is null
`;
await sql`
  insert into projects (name)
  select distinct project from documents
  where project <> ''
  on conflict (name) do nothing
`;
await sql`
  create table if not exists document_versions (
    id bigserial primary key, document_id text not null references documents(id) on delete cascade,
    version integer not null, block_json jsonb not null, markdown text not null, ydoc_state bytea,
    reason text not null default 'manual', created_at timestamptz not null default now(), unique (document_id, version)
  )
`;
await sql.end();
console.log("Seek database migrated");
