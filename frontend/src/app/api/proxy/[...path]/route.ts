import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL || "http://backend:8000";

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const path = params.path.join("/");
  const search = request.nextUrl.search;
  const targetUrl = `${BACKEND_URL}/api/${path}${search}`;

  try {
    const res = await fetch(targetUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
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
      // Multipart/form-data for files
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
