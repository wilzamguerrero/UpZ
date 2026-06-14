import { json, type Env } from "../_shared/notion";

/**
 * PATCH /api/submission-grade
 * Body: { submissionId, controlValues }
 * Persists grading/control values (nota, estado, comentarios...) for a submission
 * in the no-database mode, stored in KV alongside the submissions log.
 */
export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const { SUBMISSIONS_KV } = context.env;

  if (!SUBMISSIONS_KV) {
    return json({ error: "Almacenamiento KV no configurado." }, 500);
  }

  let body: { submissionId?: string; controlValues?: Record<string, string> };
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Cuerpo de solicitud inválido" }, 400);
  }

  const { submissionId, controlValues = {} } = body;
  if (!submissionId) return json({ error: "submissionId es obligatorio." }, 400);

  try {
    const raw = await SUBMISSIONS_KV.get("submissions");
    const list = raw ? JSON.parse(raw) : [];
    let updated = false;
    for (const sub of list) {
      if (sub.id === submissionId) {
        sub.controlValues = { ...(sub.controlValues || {}), ...controlValues };
        updated = true;
        break;
      }
    }
    if (updated) {
      await SUBMISSIONS_KV.put("submissions", JSON.stringify(list));
    }
    return json({ success: true });
  } catch (err: any) {
    return json(
      { error: `No se pudo guardar la calificación: ${err.message || "Error desconocido"}.` },
      500
    );
  }
};
