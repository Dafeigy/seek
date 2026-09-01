import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL ?? "postgresql://seek:seek_dev_password@127.0.0.1:5432/seek");
await sql`create extension if not exists pg_trgm`;
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
    content_version integer not null default 0, updated_at timestamptz not null default now(), created_at timestamptz not null default now()
  )
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
