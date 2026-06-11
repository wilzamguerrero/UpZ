import { json, type Env } from "../../_shared/notion";

/** POST /api/config/clear – removes KV credential override */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { SUBMISSIONS_KV } = context.env;

  if (SUBMISSIONS_KV) {
    await SUBMISSIONS_KV.delete("config");
  }

  return json({ success: true, message: "Configuración eliminada" });
};
