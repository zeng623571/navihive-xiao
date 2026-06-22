import {
    NavigationAPI,
    type LoginRequest,
    type ExportData,
    type Group,
    type Site,
} from "../../src/API/http";

export async function onRequest(context: { request: Request; env: Env }) {
    const { request, env } = context;
    const url = new URL(request.url);
    const path = url.pathname.replace("/api/", "");
    const method = request.method;

    try {
        const api = new NavigationAPI(env);

        if (path === "login" && method === "POST") {
            const loginData = (await request.json()) as LoginInput;
            const validation = validateLogin(loginData);
            if (!validation.valid) {
                return Response.json({ success: false, message: `验证失败: ${validation.errors?.join(", ")}` }, { status: 400 });
            }
            const result = await api.login(loginData as LoginRequest);
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

        // 以下路由与原worker/index.ts完全一致，省略重复，直接复用原逻辑
        if (path === "groups" && method === "GET") {
            return Response.json(await api.getGroups());
        } else if (path.startsWith("groups/") && method === "GET") {
            const id = parseInt(path.split("/")[1]);
            if (isNaN(id)) return Response.json({ error: "无效的ID" }, { status: 400 });
            return Response.json(await api.getGroup(id));
        } else if (path === "groups" && method === "POST") {
            const data = (await request.json()) as GroupInput;
            const validation = validateGroup(data);
            if (!validation.valid) return Response.json({ success: false, message: `验证失败: ${validation.errors?.join(", ")}` }, { status: 400 });
            return Response.json(await api.createGroup(validation.sanitizedData as Group));
        } else if (path.startsWith("groups/") && method === "PUT") {
            const id = parseInt(path.split("/")[1]);
            if (isNaN(id)) return Response.json({ error: "无效的ID" }, { status: 400 });
            const data = (await request.json()) as Partial<Group>;
            return Response.json(await api.updateGroup(id, data));
        } else if (path.startsWith("groups/") && method === "DELETE") {
            const id = parseInt(path.split("/")[1]);
            if (isNaN(id)) return Response.json({ error: "无效的ID" }, { status: 400 });
            return Response.json({ success: await api.deleteGroup(id) });
        } else if (path === "sites" && method === "GET") {
            const groupId = url.searchParams.get("groupId");
            return Response.json(await api.getSites(groupId ? parseInt(groupId) : undefined));
        } else if (path.startsWith("sites/") && method === "GET") {
            const id = parseInt(path.split("/")[1]);
            if (isNaN(id)) return Response.json({ error: "无效的ID" }, { status: 400 });
            return Response.json(await api.getSite(id));
        } else if (path === "sites" && method === "POST") {
            const data = (await request.json()) as SiteInput;
            const validation = validateSite(data);
            if (!validation.valid) return Response.json({ success: false, message: `验证失败: ${validation.errors?.join(", ")}` }, { status: 400 });
            return Response.json(await api.createSite(validation.sanitizedData as Site));
        } else if (path.startsWith("sites/") && method === "PUT") {
            const id = parseInt(path.split("/")[1]);
            if (isNaN(id)) return Response.json({ error: "无效的ID" }, { status: 400 });
            return Response.json(await api.updateSite(id, await request.json() as Partial<Site>));
        } else if (path.startsWith("sites/") && method === "DELETE") {
            const id = parseInt(path.split("/")[1]);
            if (isNaN(id)) return Response.json({ error: "无效的ID" }, { status: 400 });
            return Response.json({ success: await api.deleteSite(id) });
        } else if (path === "group-orders" && method === "PUT") {
            return Response.json({ success: await api.updateGroupOrder(await request.json() as Array<{ id: number; order_num: number }>) });
        } else if (path === "site-orders" && method === "PUT") {
            return Response.json({ success: await api.updateSiteOrder(await request.json() as Array<{ id: number; order_num: number }>) });
        } else if (path === "configs" && method === "GET") {
            return Response.json(await api.getConfigs());
        } else if (path.startsWith("configs/") && method === "GET") {
            const key = path.substring("configs/".length);
            return Response.json({ key, value: await api.getConfig(key) });
        } else if (path.startsWith("configs/") && method === "PUT") {
            const key = path.substring("configs/".length);
            const data = (await request.json()) as ConfigInput;
            const validation = validateConfig(data);
            if (!validation.valid) return Response.json({ success: false, message: `验证失败: ${validation.errors?.join(", ")}` }, { status: 400 });
            return Response.json({ success: await api.setConfig(key, data.value!) });
        } else if (path.startsWith("configs/") && method === "DELETE") {
            const key = path.substring("configs/".length);
            return Response.json({ success: await api.deleteConfig(key) });
        } else if (path === "export" && method === "GET") {
            return Response.json(await api.exportData(), {
                headers: { "Content-Disposition": "attachment; filename=navhive-data.json", "Content-Type": "application/json" },
            });
        } else if (path === "import" && method === "POST") {
            const data = (await request.json()) as ExportData;
            return Response.json(await api.importData(data));
        }

        return new Response("API路径不存在", { status: 404 });
    } catch (error) {
        console.error(`API错误: ${error instanceof Error ? error.message : "未知错误"}`);
        return new Response("处理请求时发生错误", { status: 500 });
    }
}

// 以下类型和验证函数与原worker/index.ts相同
interface Env {
    DB: D1Database;
    AUTH_ENABLED?: string;
    AUTH_USERNAME?: string;
    AUTH_PASSWORD?: string;
    AUTH_SECRET?: string;
}
interface LoginInput { username?: string; password?: string; rememberMe?: boolean; }
interface GroupInput { name?: string; order_num?: number; }
interface SiteInput { group_id?: number; name?: string; url?: string; icon?: string; description?: string; notes?: string; order_num?: number; }
interface ConfigInput { value?: string; }

function validateLogin(data: LoginInput): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!data.username || typeof data.username !== "string") errors.push("用户名不能为空且必须是字符串");
    if (!data.password || typeof data.password !== "string") errors.push("密码不能为空且必须是字符串");
    return { valid: errors.length === 0, errors };
}
function validateGroup(data: GroupInput): { valid: boolean; errors?: string[]; sanitizedData?: Group } {
    const errors: string[] = [];
    const sanitizedData: Partial<Group> = {};
    if (!data.name || typeof data.name !== "string") errors.push("分组名称不能为空且必须是字符串");
    else sanitizedData.name = data.name.trim().slice(0, 100);
    if (data.order_num === undefined || typeof data.order_num !== "number") errors.push("排序号必须是数字");
    else sanitizedData.order_num = data.order_num;
    return { valid: errors.length === 0, errors, sanitizedData: errors.length === 0 ? sanitizedData as Group : undefined };
}
function validateSite(data: SiteInput): { valid: boolean; errors?: string[]; sanitizedData?: Site } {
    const errors: string[] = [];
    const sanitizedData: Partial<Site> = {};
    if (!data.group_id || typeof data.group_id !== "number") errors.push("分组ID必须是数字且不能为空");
    else sanitizedData.group_id = data.group_id;
    if (!data.name || typeof data.name !== "string") errors.push("站点名称不能为空且必须是字符串");
    else sanitizedData.name = data.name.trim().slice(0, 100);
    if (!data.url || typeof data.url !== "string") errors.push("URL不能为空且必须是字符串");
    else { try { new URL(data.url); sanitizedData.url = data.url.trim(); } catch { errors.push("无效的URL格式"); } }
    if (data.icon !== undefined) {
        if (typeof data.icon !== "string") errors.push("图标URL必须是字符串");
        else if (data.icon) { try { new URL(data.icon); sanitizedData.icon = data.icon.trim(); } catch { errors.push("无效的图标URL格式"); } }
        else sanitizedData.icon = "";
    }
    if (data.description !== undefined) sanitizedData.description = typeof data.description === "string" ? data.description.trim().slice(0, 500) : "";
    if (data.notes !== undefined) sanitizedData.notes = typeof data.notes === "string" ? data.notes.trim().slice(0, 1000) : "";
    if (data.order_num === undefined || typeof data.order_num
