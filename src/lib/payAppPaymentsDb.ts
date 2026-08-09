import { createClient } from "@/lib/supabase/client";

export type PayAppPayment = {
  id: string;
  payAppId: string;
  paymentDate: string;
  amountPaid: number;
  referenceNumber: string;
  notes: string;
  createdBy: string;
  createdAt: string;
  deletedAt: string | null;
};

type PayAppPaymentRow = {
  id: string;
  pay_app_id: string;
  payment_date: string;
  amount_paid: number;
  reference_number: string;
  notes: string;
  created_by: string;
  created_at: string;
  deleted_at: string | null;
};

function rowToPayAppPayment(row: PayAppPaymentRow): PayAppPayment {
  return {
    id: row.id,
    payAppId: row.pay_app_id,
    paymentDate: row.payment_date,
    amountPaid: Number(row.amount_paid),
    referenceNumber: row.reference_number,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
  };
}

export async function recordPayment(
  payAppId: string,
  paymentDate: string,
  amountPaid: number,
  referenceNumber: string,
  notes: string
): Promise<PayAppPayment> {
  const supabase = createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(userError.message);
  const userId = userData.user?.id;
  if (!userId) throw new Error("Not signed in.");

  const { data, error } = await supabase
    .from("pay_app_payments")
    .insert({
      pay_app_id: payAppId,
      user_id: userId,
      payment_date: paymentDate,
      amount_paid: amountPaid,
      reference_number: referenceNumber,
      notes: notes,
      created_by: userId,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToPayAppPayment(data);
}

export async function fetchPayAppPayments(payAppId: string): Promise<PayAppPayment[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("pay_app_payments")
    .select("*")
    .eq("pay_app_id", payAppId)
    .is("deleted_at", null)
    .order("payment_date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToPayAppPayment);
}

export async function fetchDeletedPayAppPayments(payAppId: string): Promise<PayAppPayment[]> {
  const supabase = createClient();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const { data, error } = await supabase
    .from("pay_app_payments")
    .select("*")
    .eq("pay_app_id", payAppId)
    .not("deleted_at", "is", null)
    .gte("deleted_at", thirtyDaysAgo.toISOString())
    .order("deleted_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToPayAppPayment);
}

export async function deletePayment(id: string): Promise<PayAppPayment> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("pay_app_payments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToPayAppPayment(data);
}

export async function restorePayment(id: string): Promise<PayAppPayment> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("pay_app_payments")
    .update({ deleted_at: null })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToPayAppPayment(data);
}

export async function permanentlyDeletePayment(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("pay_app_payments")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// Fetches all non-deleted payments with their job_id and pay_app_id (joined from pay_applications).
// Used by the dashboard aging calculations.
export async function fetchAllPaymentsForDashboard(): Promise<
  Array<{ id: string; payAppId: string; jobId: string; amount: number; paymentDate: string }>
> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("pay_app_payments")
    .select("id, pay_app_id, payment_date, amount_paid, pay_applications!inner(job_id)")
    .is("deleted_at", null)
    .order("payment_date", { ascending: true });
  if (error) throw new Error(error.message);
  type JoinRow = {
    id: string;
    pay_app_id: string;
    payment_date: string;
    amount_paid: string | number;
    pay_applications: { job_id: string };
  };
  return ((data ?? []) as unknown as JoinRow[]).map((row) => ({
    id: row.id,
    payAppId: row.pay_app_id,
    jobId: row.pay_applications.job_id,
    amount: Number(row.amount_paid),
    paymentDate: row.payment_date,
  }));
}

export async function permanentlyDeleteOldPayments(): Promise<void> {
  const supabase = createClient();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const { error } = await supabase
    .from("pay_app_payments")
    .delete()
    .lt("deleted_at", thirtyDaysAgo.toISOString());
  if (error) throw new Error(error.message);
}
