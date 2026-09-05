import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL ?? "postgresql://seek:seek_dev_password@127.0.0.1:5432/seek");
const SCRYPT_COST = 16_384;

function scryptKey(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, 64, { N: SCRYPT_COST, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, derived) => {
      if (error) reject(error);
      else resolve(Buffer.from(derived));
    });
  });
}

async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = await scryptKey(password, salt);
  return `scrypt$${SCRYPT_COST}$8$1$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

const workspaceId = "seek-development-workspace";
const users = [
  ["seek-dev-owner", "owner@seek.local", "测试 Owner", "SeekDev-Owner-2026!", "owner"],
  ["seek-dev-admin", "admin@seek.local", "测试 Admin", "SeekDev-Admin-2026!", "admin"],
  ["seek-dev-platform-editor", "platform.editor@seek.local", "平台编辑", "SeekDev-Platform-2026!", "member"],
  ["seek-dev-algorithm-editor", "algorithm.editor@seek.local", "算法编辑", "SeekDev-Algorithm-2026!", "member"],
  ["seek-dev-commenter", "commenter@seek.local", "评论者", "SeekDev-Comment-2026!", "member"],
  ["seek-dev-viewer", "viewer@seek.local", "查看者", "SeekDev-Viewer-2026!", "member"],
  ["seek-dev-guest", "guest@seek.local", "访客", "SeekDev-Guest-2026!", "guest"],
] as const;

await sql.begin(async (tx) => {
  await tx`insert into workspaces (id, name) values (${workspaceId}, 'Seek 开发 Workspace') on conflict (id) do nothing`;
  for (const [id, email, displayName, password, workspaceRole] of users) {
    const passwordHash = await hashPassword(password);
    await tx`
      insert into users (id, email, display_name, password_hash)
      values (${id}, ${email}, ${displayName}, ${passwordHash})
      on conflict (email) do update set display_name = excluded.display_name, password_hash = excluded.password_hash, updated_at = now()
    `;
    const [stored] = await tx`select id from users where email = ${email}`;
    await tx`
      insert into workspace_members (workspace_id, user_id, role)
      values (${workspaceId}, ${stored.id}, ${workspaceRole})
      on conflict (workspace_id, user_id) do update set role = excluded.role
    `;
  }

  await tx`
    insert into documents (id, title, project, block_json, markdown, plain_text)
    values ('model-deployment', '模型部署规范', '平台基础设施',
      '[{"id":"seed-model-title","type":"heading","props":{"level":1,"textColor":"default","isToggleable":false,"textAlignment":"left","backgroundColor":"default"},"content":[{"type":"text","text":"模型部署规范","styles":{}}],"children":[]},{"id":"seed-model-body","type":"paragraph","props":{"textColor":"default","textAlignment":"left","backgroundColor":"default"},"content":[{"type":"text","text":"记录模型从测试到生产的部署流程。","styles":{}}],"children":[]}]'::jsonb,
      '# 模型部署规范\n\n记录模型从测试到生产的部署流程。', '模型部署规范\n记录模型从测试到生产的部署流程。'),
      ('production-secret-rotation', '生产密钥轮换', '平台基础设施', '[]'::jsonb, '# 生产密钥轮换', '生产密钥轮换'),
      ('external-review-draft', '外部评审草案', '算法研究', '[]'::jsonb, '# 外部评审草案', '外部评审草案'),
      ('collaboration-lock-test', '协作锁测试', '平台基础设施', '[]'::jsonb, '# 协作锁测试', '协作锁测试')
    on conflict (id) do update set title = excluded.title, project = excluded.project
  `;

  const ids = Object.fromEntries(await Promise.all(users.map(async ([, email]) => {
    const [user] = await tx`select id from users where email = ${email}`;
    return [email, user.id] as const;
  })));
  const projectMemberships = [
    ["平台基础设施", ids["owner@seek.local"], "admin"], ["算法研究", ids["owner@seek.local"], "admin"], ["客户端", ids["owner@seek.local"], "admin"],
    ["平台基础设施", ids["admin@seek.local"], "admin"], ["算法研究", ids["admin@seek.local"], "admin"], ["客户端", ids["admin@seek.local"], "viewer"],
    ["平台基础设施", ids["platform.editor@seek.local"], "editor"], ["算法研究", ids["platform.editor@seek.local"], "viewer"],
    ["平台基础设施", ids["algorithm.editor@seek.local"], "viewer"], ["算法研究", ids["algorithm.editor@seek.local"], "editor"],
    ["平台基础设施", ids["commenter@seek.local"], "commenter"],
    ["平台基础设施", ids["viewer@seek.local"], "viewer"],
    ["算法研究", ids["guest@seek.local"], "viewer"],
  ] as const;
  for (const [project, userId, role] of projectMemberships) {
    await tx`
      insert into project_members (project_name, user_id, role) values (${project}, ${userId}, ${role})
      on conflict (project_name, user_id) do update set role = excluded.role
    `;
  }
  await tx`
    insert into document_acl (document_id, user_id, action, effect)
    values
      ('production-secret-rotation', ${ids["viewer@seek.local"]}, 'document:read', 'deny'),
      ('external-review-draft', ${ids["guest@seek.local"]}, 'document:comment', 'allow')
    on conflict (document_id, user_id, action) do update set effect = excluded.effect, updated_at = now()
  `;
});

await sql.end();
console.log("Seek development database seeded with the Phase 1 permission matrix");
