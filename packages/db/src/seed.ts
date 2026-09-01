import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL ?? "postgresql://seek:seek_dev_password@127.0.0.1:5432/seek");
await sql`
  insert into documents (id, title, project, block_json, markdown, plain_text)
  values ('model-deployment', '模型部署规范', '平台基础设施',
    '[{"id":"seed-model-title","type":"heading","props":{"level":1,"textColor":"default","isToggleable":false,"textAlignment":"left","backgroundColor":"default"},"content":[{"type":"text","text":"模型部署规范","styles":{}}],"children":[]},{"id":"seed-model-body","type":"paragraph","props":{"textColor":"default","textAlignment":"left","backgroundColor":"default"},"content":[{"type":"text","text":"记录模型从测试到生产的部署流程。","styles":{}}],"children":[]}]'::jsonb,
    '# 模型部署规范\n\n记录模型从测试到生产的部署流程。', '模型部署规范\n记录模型从测试到生产的部署流程。')
  on conflict (id) do nothing;
`;
await sql.end();
console.log("Seek database seeded");
