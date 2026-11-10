function retired() { return Response.json({ error: "Bank connections are not part of this release. Import a CSV from the workspace." }, { status: 410 }); }
export { retired as GET, retired as POST };
