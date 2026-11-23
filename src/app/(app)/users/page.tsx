import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { UsersClient } from "@/components/UsersClient";

export default async function Page() {
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") redirect("/");
  return <UsersClient currentUserId={user.id} />;
}
