import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL || "http://backend:8000";

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const path = params.path.join("/");
  const search = request.nextUrl.search;
  const targetUrl = path.startsWith("media/")
    ? `${BACKEND_URL}/${path}${search}`
    : `${BACKEND_URL}/api/${path}${search}`;

  try {
    const res = await fetch(targetUrl, {
      method: "GET",
      cache: "no-store",
    });

    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    }

    // Binary media streaming (images, audio, PDF, etc.)
    const buffer = await res.arrayBuffer();
    return new NextResponse(buffer, {
      status: res.status,
      headers: {
        "Content-Type": contentType || "application/octet-stream",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const path = params.path.join("/");
  const targetUrl = `${BACKEND_URL}/api/${path}`;

  try {
    const contentType = request.headers.get("content-type") || "";
    let body: any;
    let headers: Record<string, string> = { Accept: "application/json" };

    if (contentType.includes("application/json")) {
      body = JSON.stringify(await request.json());
      headers["Content-Type"] = "application/json";
    } else {
      body = await request.formData();
    }

    const res = await fetch(targetUrl, {
      method: "POST",
      headers: contentType.includes("application/json") ? headers : undefined,
      body,
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const path = params.path.join("/");
  const targetUrl = `${BACKEND_URL}/api/${path}`;

  try {
    const res = await fetch(targetUrl, {
      method: "DELETE",
      headers: {
        Accept: "application/json",
      },
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }
}
