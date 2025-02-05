import { getMsg, getCtx } from "../utils/utils";
import { Tool, ToolInfo, ToolManager } from "./tool";

export function registerAttrShow() {
    const info: ToolInfo = {
        type: 'function',
        function: {
            name: 'attr_show',
            description: '展示指定玩家的全部个人属性',
            parameters: {
                type: 'object',
                properties: {
                    name: {
                        type: 'string',
                        description: '玩家名称'
                    }
                },
                required: ['name']
            }
        }
    }

    const tool = new Tool(info);
    tool.cmdInfo = {
        ext: 'coc7',
        name: 'st',
        fixedArgs: ['show']
    }
    tool.solve = async (ctx, msg, ai, name) => {
        const uid = ai.context.findUid(name);
        if (uid === null) {
            console.log(`未找到<${name}>`);
            return `未找到<${name}>`;
        }

        msg = getMsg(msg.messageType, uid, ctx.group.groupId);
        ctx = getCtx(ctx.endPoint.userId, msg);

        if (uid === ctx.endPoint.userId) {
            ctx.player.name = name;
        }

        const [s, success] = await ToolManager.extensionSolve(ctx, msg, ai, tool.cmdInfo);
        if (!success) {
            return '展示完成';
        }

        return s;
    }
    
    ToolManager.toolMap[info.function.name] = tool;
}

export function registerAttrGet() {
    const info: ToolInfo = {
        type: 'function',
        function: {
            name: 'attr_get',
            description: '获取指定玩家的指定属性',
            parameters: {
                type: 'object',
                properties: {
                    name: {
                        type: 'string',
                        description: '玩家名称'
                    },
                    attr: {
                        type:'string',
                        description: '属性名称'
                    }
                },
                required: ['name', 'attr']
            }
        }
    }

    const tool = new Tool(info);
    tool.solve = async (ctx, msg, ai, name, attr) => {
        const uid = ai.context.findUid(name);
        if (uid === null) {
            console.log(`未找到<${name}>`);
            return `未找到<${name}>`;
        }

        msg = getMsg(msg.messageType, uid, ctx.group.groupId);
        ctx = getCtx(ctx.endPoint.userId, msg);

        if (uid === ctx.endPoint.userId) {
            ctx.player.name = name;
        }

        const value = seal.vars.intGet(ctx, attr)[0];
        return `${attr}: ${value}`;
    }
    
    ToolManager.toolMap[info.function.name] = tool;
}

export function registerAttrSet() {
    const info: ToolInfo = {
        type: 'function',
        function: {
            name: 'attr_set',
            description: '修改指定玩家的指定属性',
            parameters: {
                type: 'object',
                properties: {
                    name: {
                        type: 'string',
                        description: '玩家名称'
                    },
                    expression: {
                        type:'string',
                        description: '修改表达式，例如`hp=hp+1d6`就是将hp的值修改为hp+1d6'
                    }
                },
                required: ['name', 'expression']
            }
        }
    }

    const tool = new Tool(info);
    tool.solve = async (ctx, msg, ai, name, expression) => {
        const uid = ai.context.findUid(name);
        if (uid === null) {
            console.log(`未找到<${name}>`);
            return `未找到<${name}>`;
        }

        msg = getMsg(msg.messageType, uid, ctx.group.groupId);
        ctx = getCtx(ctx.endPoint.userId, msg);

        if (uid === ctx.endPoint.userId) {
            ctx.player.name = name;
        }

        const [attr, expr] = expression.split('=');
        if (expr === undefined) {
            return `修改失败，表达式 ${expression} 格式错误`;
        }

        const value = seal.vars.intGet(ctx, attr)[0];

        const attrs = expr.split(/[\s\dDd+\-*/=]+/).filter(item => item !== '');
        const values = attrs.map(item => seal.vars.intGet(ctx, item)[0]);

        let s = expr;
        for (let i = 0; i < attrs.length; i++) {
            s = s.replace(attrs[i], values[i].toString());
        }

        const result = parseInt(seal.format(ctx, `{${s}}`));

        if (isNaN(result)) {
            return `修改失败，表达式 ${expression} 格式化错误`;
        }

        seal.vars.intSet(ctx, attr, result);

        seal.replyToSender(ctx, msg, `进行了 ${expression} 修改\n${attr}: ${value}=>${result}`);
        return `进行了 ${expression} 修改\n${attr}: ${value}=>${result}`;
    }
    
    ToolManager.toolMap[info.function.name] = tool;
}