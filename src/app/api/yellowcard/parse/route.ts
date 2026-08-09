import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseYellowcard } from "@/lib/yellowcard/parse";

export async function POST(req: NextRequest) {
  // Require a signed-in user before touching any file content
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Could not read the upload." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "No file received." }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await (file as Blob).arrayBuffer());
    const result = parseYellowcard(buffer);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to parse the workbook.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
