import { Workspace } from "@/components/workspace";
import { readWorkspace } from "@/lib/workspace-server";

export const dynamic = "force-dynamic";

export default async function Home() {
  return <Workspace initialWorkspace={await readWorkspace()} />;
}
