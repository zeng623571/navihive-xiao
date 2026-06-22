import {
    NavigationAPI,
    type LoginRequest,
    type ExportData,
    type Group,
    type Site,
} from "../../src/API/http";

export async function onRequest(context: any) {
    const { request, env } = context;
    const url = new URL(request.url);
    const path = url.pathname.replace("/api/", "");
    const method = request.method;

    try {
        const api = new NavigationAPI(env);

        if (path === "login" && method === "POST") {
            const loginData = await request.json();
            const validation = validateLogin(loginData);
            if (!validation.valid) {
                return Response.json({ success: false, message: `验证失败: ${validation.errors?.join(", ")}` }, { status: 400 });
            }
            const result = await api.login(loginData);
            return Response.json(result);
        }

        if (path === "init" && method === "GET") {
            const initResult = await api.initDB();
            if (initResult.alreadyInitialized) {
                return new Response("数据库已经初始化过，无需重复初始化", { status: 200 });
            }
            return new Response("数据库初始化成功", { status: 200 });
        }

        if (api.isAuthEnabled()) {
            const authHeader = request.headers.get("Authorization");
            if (!authHeader) {
                return new Response("请先登录", { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
            }
            const [authType, token] = authHeader.split(" ");
            if (authType !== "Bearer" || !token) {
                return new Response("无效的认证信息", { status: 401 });
            }
            const verifyResult = await api.verifyToken(token);
            if (!verifyResult.valid) {
                return new Response("认证已过期或无效，请重新登录", { status: 401 });
            }
        }

        if (path === "groups" && method === "GET") {
            return Response.json(await api.getGroups());
        } else if (path.startsWith("groups/") && method === "GET") {
            const id = parseInt(path.split("/")[1]);
            if (isNaN(id)) return Response.json({ error: "无效的ID" }, { status: 400 });
            return Response.json(await api.getGroup(id));
        } else if (path === "groups" && method === "POST") {
            const data = await request.json();
            const validation = validateGroup(data);
            if (!validation.valid) return Response.json({ success: false, message: `验证失败: ${validation.errors?.join(", ")}` }, { status: 400 });
            return Response.json(await api.createGroup(validation.sanitizedData));
        } else if (path.startsWith("groups/") && method === "PUT") {
            const id = parseInt(path.split("/")[1]);
            if (isNaN(id)) return Response.json({ error: "无效的ID" }, { status: 400 });
            return Response.json(await api.updateGroup(id, await request.json()));
        } else if (path.startsWith("groups/") && method === "DELETE") {
            const id = parseInt(path.split("/")[1]);
            if (isNaN(id)) return Response.json({ error: "无效的ID" }, { status: 400 });
            return Response.json({ success: await api.deleteGroup(id) });
        } else if (path === "sites" && method === "GET") {
            const groupId = url.searchParams.get("groupId");
