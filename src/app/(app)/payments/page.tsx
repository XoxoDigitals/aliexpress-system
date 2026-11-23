import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { PaymentsClient } from "@/components/PaymentsClient";

export default async function Page() {
  const user = await getCurrentUser();
  if (!user || user.role === "TEAM") redirect("/");
  return <PaymentsClient />;
}
