import WorkspaceApp from "@/components/WorkspaceApp";
import { connection } from "next/server";

export default async function Page() {
  await connection();
  return <WorkspaceApp />;
}
