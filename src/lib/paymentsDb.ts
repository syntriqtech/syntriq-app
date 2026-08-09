import { createClient } from "@/lib/supabase/client";

export type Payment = {
  id: string;
  jobId: string;
  amount: number;
  paymentDate: string;
};

type PaymentRow = {
  id: string;
  job_id: string;
  amount: number;
  payment_date: string;
};

function rowToPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    jobId: row.job_id,
    amount: Number(row.amount),
    paymentDate: row.payment_date,
  };
}

export async function recordPayment(jobId: string, amount: number, paymentDate: string): Promise<Payment> {
  const supabase = createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const userId = userData.user?.id;
  if (!userId) throw new Error("Not signed in.");

  const { data, error } = await supabase
    .from("payments")
    .insert({
      job_id: jobId,
      user_id: userId,
      amount,
      payment_date: paymentDate,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToPayment(data);
}

export async function fetchAllPayments(): Promise<Payment[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .order("payment_date", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rowToPayment);
}
