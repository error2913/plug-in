import { AIManager } from "../AI/AI";
import { ConfigManager } from "../config/config";
import { handleMessages } from "../utils/utils_message";
import { createCtx, createMsg } from "../utils/utils_seal";
import { Tool, ToolInfo, ToolManager } from "./tool";

export function registerGetContext() {
    const info: ToolInfo = {
        type: "function",
        function: {
            name: "get_context",
            description: `查看指定私聊或群聊的上下文`,
            parameters: {
                type: "object",
                properties: {
                    ctx_type: {
                        type: "string",
                        description: "上下文类型，私聊或群聊",
                        enum: ["private", "group"]
                    },
                    name: {
                        type: 'string',
                        description: '用户名称或群聊名称' + (ConfigManager.message.showNumber ? '或纯数字QQ号、群号' : '') + '，实际使用时与上下文类型对应'
                    }
                },
                required: ["ctx_type", "name"]
            }
        }
    }

    const tool = new Tool(info);
    tool.solve = async (ctx, msg, ai, args) => {
        const { ctx_type, name } = args;

        if (ctx_type === "private") {
            const uid = await ai.context.findUserId(ctx, name, true);
            if (uid === null) {
                return `未找到<${name}>`;
            }
            if (uid === ctx.player.userId && ctx.isPrivate) {
                return `向当前私聊发送消息无需调用函数`;
            }
            if (uid === ctx.endPoint.userId) {
                return `禁止向自己发送消息`;
            }
    
            msg = createMsg('private', uid, '');
            ctx = createCtx(ctx.endPoint.userId, msg);
    
            ai = AIManager.getAI(uid);
        } else if (ctx_type === "group") {
            const gid = await ai.context.findGroupId(ctx, name);
            if (gid === null) {
                return `未找到<${name}>`;
            }
            if (gid === ctx.group.groupId) {
                return `向当前群聊发送消息无需调用函数`;
            }
    
            msg = createMsg('group', ctx.player.userId, gid);
            ctx = createCtx(ctx.endPoint.userId, msg);
    
            ai = AIManager.getAI(gid);
        } else {
            return `未知的上下文类型<${ctx_type}>`;
        }

        const messages = handleMessages(ctx, ai);
        const s = messages.map(item => {
            if (item.role === 'system') {
                return '';
            }
            if (item.role === 'assistant' && item?.tool_calls) {
                return `[function_call]: ${item.tool_calls.map((tool_call, index) => `${index + 1}. ${JSON.stringify(tool_call.function, null, 2)}`).join('\n')}`;
            }
            return `[${item.role}]: ${item.content}`;
        }).join('\n');

        return s;
    }

    ToolManager.toolMap[info.function.name] = tool;
}