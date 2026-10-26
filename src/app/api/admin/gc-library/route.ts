import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { gcLibraryInputToRow, requireAdmin, type GcLibraryInput } from "@/lib/adminGcLibraryShared";

// Platform admin only: a master library of GC profiles, independent of any
// one organization, so a GC only has to be typed in once and then "enabled"
// (copied) into whichever accounts bill that GC — see
// supabase/067_gc_library.sql for the full rationale.
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const serviceRole = createServiceRoleClient();
  const { data, error } = await serviceRole.from("gc_library").select("*").order("name", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ gcs: data });
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as Partial<GcLibraryInput>;
  if (!body.name || !body.name.trim()) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }

  const serviceRole = createServiceRoleClient();
  const { data, error } = await serviceRole
    .from("gc_library")
    .insert(gcLibraryInputToRow(body as GcLibraryInput))
    .select()
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ gc: data });
}
