import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { gcLibraryInputToRow, requireAdmin, type GcLibraryInput } from "@/lib/adminGcLibraryShared";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }
  const { id } = await params;

  const body = (await req.json().catch(() => ({}))) as Partial<GcLibraryInput>;
  if (!body.name || !body.name.trim()) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }

  const serviceRole = createServiceRoleClient();
  const { data, error } = await serviceRole
    .from("gc_library")
    .update({ ...gcLibraryInputToRow(body as GcLibraryInput), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ gc: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }
  const { id } = await params;

  const serviceRole = createServiceRoleClient();
  const { error } = await serviceRole.from("gc_library").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
