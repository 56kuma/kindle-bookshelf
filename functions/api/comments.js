const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  if (!env.COMMENTS_DB) {
    return jsonResponse({ error: "Database not configured." }, 503);
  }

  try {
    switch (request.method) {
      case "GET":    return await handleGet(env.COMMENTS_DB);
      case "POST":   return await handlePost(request, env.COMMENTS_DB);
      case "PUT":    return await handlePut(request, env.COMMENTS_DB);
      case "DELETE": return await handleDelete(request, env.COMMENTS_DB);
      default:
        return new Response("Method not allowed.", {
          status: 405,
          headers: { allow: "GET, POST, PUT, DELETE" },
        });
    }
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500);
  }
}

async function handleGet(db) {
  const { results } = await db
    .prepare("SELECT id, book_key, text, created_at, updated_at FROM comments ORDER BY created_at ASC")
    .all();

  const grouped = {};
  for (const row of results) {
    if (!grouped[row.book_key]) grouped[row.book_key] = [];
    grouped[row.book_key].push({
      id: row.id,
      text: row.text,
      created_at: row.created_at,
      updated_at: row.updated_at || "",
    });
  }
  return jsonResponse(grouped);
}

async function handlePost(request, db) {
  const body = await request.json().catch(() => null);
  const key = typeof body?.key === "string" ? body.key.trim() : "";
  const text = typeof body?.text === "string" ? body.text.trim() : "";

  if (!key) return jsonResponse({ error: "key is required." }, 400);
  if (!text) return jsonResponse({ error: "text is required." }, 400);
  if (text.length > 1000) return jsonResponse({ error: "text is too long (max 1000)." }, 400);

  const id = crypto.randomUUID();
  const created_at = new Date().toISOString();

  await db
    .prepare("INSERT INTO comments (id, book_key, text, created_at, updated_at) VALUES (?, ?, ?, ?, '')")
    .bind(id, key.slice(0, 200), text, created_at)
    .run();

  return jsonResponse({ id, text, created_at, updated_at: "" }, 201);
}

async function handlePut(request, db) {
  const body = await request.json().catch(() => null);
  const key  = typeof body?.key  === "string" ? body.key.trim()  : "";
  const id   = typeof body?.id   === "string" ? body.id.trim()   : "";
  const text = typeof body?.text === "string" ? body.text.trim() : "";

  if (!key || !id) return jsonResponse({ error: "key and id are required." }, 400);
  if (!text)       return jsonResponse({ error: "text is required." }, 400);
  if (text.length > 1000) return jsonResponse({ error: "text is too long (max 1000)." }, 400);

  const updated_at = new Date().toISOString();
  const result = await db
    .prepare("UPDATE comments SET text = ?, updated_at = ? WHERE id = ? AND book_key = ?")
    .bind(text, updated_at, id, key)
    .run();

  if (result.meta.changes === 0) return jsonResponse({ error: "Comment not found." }, 404);

  const row = await db
    .prepare("SELECT id, text, created_at, updated_at FROM comments WHERE id = ?")
    .bind(id)
    .first();

  return jsonResponse(row);
}

async function handleDelete(request, db) {
  const body = await request.json().catch(() => null);
  const key = typeof body?.key === "string" ? body.key.trim() : "";
  const id  = typeof body?.id  === "string" ? body.id.trim()  : "";

  if (!key || !id) return jsonResponse({ error: "key and id are required." }, 400);

  const result = await db
    .prepare("DELETE FROM comments WHERE id = ? AND book_key = ?")
    .bind(id, key)
    .run();

  if (result.meta.changes === 0) return jsonResponse({ error: "Comment not found." }, 404);

  return jsonResponse({ ok: true });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}
