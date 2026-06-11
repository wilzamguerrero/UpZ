import { json, listChildren, type Env } from "../../_shared/notion";

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { NOTION_SECRET, NOTION_ID_PAGE } = context.env;

  let body: { password?: string };
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Cuerpo de solicitud inválido" }, 400);
  }

  const { password } = body;
  if (!password) {
    return json({ error: "La contraseña es obligatoria" }, 400);
  }

  if (!NOTION_SECRET || !NOTION_ID_PAGE) {
    return json(
      { error: "Notion no está configurado en el servidor con NOTION_SECRET y NOTION_ID_PAGE." },
      400
    );
  }

  try {
    const data = await listChildren(NOTION_ID_PAGE, NOTION_SECRET);

    const quoteBlock = data.results?.find((b: any) => b.type === "quote");
    if (!quoteBlock || !quoteBlock.quote?.rich_text) {
      return json(
        {
          error:
            "No se encontró ningún bloque de Cita (Quote/Cita con la barra vertical izquierda) en la página matriz de Notion. " +
            "Por favor crea un bloque Cita en Notion con tu contraseña (ej: 123456) en la parte superior y vuelve a intentar.",
        },
        400
      );
    }

    const notionPassword = quoteBlock.quote.rich_text
      .map((rt: any) => rt.plain_text)
      .join("")
      .trim();

    if (password.trim() === notionPassword) {
      return json({ success: true });
    } else {
      return json({ error: "Contraseña incorrecta." }, 401);
    }
  } catch (err: any) {
    return json(
      { error: `Fallo al conectar con Notion para leer contraseña: ${err.message || "Error desconocido"}` },
      500
    );
  }
};
