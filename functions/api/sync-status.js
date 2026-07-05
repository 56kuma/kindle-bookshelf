const OBJECT_KEY = "sync-status.json";

export async function onRequestGet(context) {
  const object = await context.env.BOOKS_BUCKET.get(OBJECT_KEY);

  if (object === null) {
    return new Response(JSON.stringify({ updated_at: "", runs: [] }), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  return new Response(object.body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-cache",
      "x-content-type-options": "nosniff",
    },
  });
}

export function onRequest() {
  return new Response("Method not allowed.", {
    status: 405,
    headers: { allow: "GET" },
  });
}
