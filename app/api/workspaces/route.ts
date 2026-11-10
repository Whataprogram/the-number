import { createWorkspace, listWorkspaces } from "../../../lib/cloud-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = listWorkspaces;
export const POST = createWorkspace;
