import postgres from "postgres";

export const db = postgres(process.env.DATABASE_URL ?? "postgresql://seek:seek_dev_password@127.0.0.1:5432/seek", { max: 5 });
