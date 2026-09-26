import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { LoginCard } from "@/components/layout/LoginCard";

export default async function Home() {
  const session = await getServerSession(authOptions);
  if (session?.backendToken) redirect("/dashboard");
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4">
      <LoginCard error={session?.error} />
    </main>
  );
}
