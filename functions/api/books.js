const OBJECT_KEY = "kindle-web-library.csv";

export async function onRequestGet(context) {
  const object = await context.env.BOOKS_BUCKET.get(OBJECT_KEY);

  if (object === null) {
    return new Response("Kindle library CSV was not found.", {
      status: 404,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("content-type", "text/csv; charset=utf-8");
  headers.set("cache-control", "private, no-cache");
  headers.set("etag", object.httpEtag);
  headers.set("x-content-type-options", "nosniff");

  return new Response(object.body, { headers });
}

export function onRequest() {
  return new Response("Method not allowed.", {
    status: 405,
    headers: { allow: "GET" },
  });
}
