import type { PaymentSubscription, SubscriptionFrequency } from "./store";
export type SubscriptionForm = {
  name: string;
  amount: string;
  dueDate: string;
  frequency: SubscriptionFrequency;
  category: string;
  notes: string;
};
export function subscriptionValues(
  form: SubscriptionForm,
): Pick<
  PaymentSubscription,
  "name" | "amount" | "dueDate" | "frequency" | "category" | "notes"
> {
  const amount = Number(form.amount),
    date = new Date(form.dueDate + "T00:00:00Z");
  if (
    !form.name.trim() ||
    !form.amount.trim() ||
    !Number.isFinite(amount) ||
    amount < 0 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(form.dueDate) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== form.dueDate ||
    !["weekly", "monthly", "quarterly", "yearly"].includes(form.frequency)
  )
    throw new Error(
      "Enter a name, a valid date and an amount of zero or more.",
    );
  return {
    name: form.name.trim(),
    amount,
    dueDate: form.dueDate,
    frequency: form.frequency,
    category: form.category.trim() || "General",
    notes: form.notes.trim() || undefined,
  };
}
