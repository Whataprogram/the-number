import { deleteWorkspace, getWorkspace, updateWorkspace } from "../../../../lib/cloud-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: RouteContext) { return getWorkspace(request, (await context.params).id); }
export async function PATCH(request: Request, context: RouteContext) { return updateWorkspace(request, (await context.params).id); }
export async function DELETE(request: Request, context: RouteContext) { return deleteWorkspace(request, (await context.params).id); }
