import { Image, ImageManager } from "./image";
import { ConfigManager } from "../config/config";
import { log } from "../utils/utils";
import { sendChatRequest } from "./service";
import { Context } from "./context";
import { Memory } from "./memory";
import { handleMessages } from "../utils/utils_message";
import { handleReply } from "../utils/utils_reply";
import { ToolManager } from "../tool/tool";

export interface Privilege {
    limit: number,
    counter: number,
    timer: number,
    prob: number,
    standby: boolean
}

export class AI {
    id: string;
    context: Context;
    tool: ToolManager;
    memory: Memory;
    image: ImageManager;
    privilege: Privilege;
    listen: {
        status: boolean,
        content: string
    }
    isChatting: boolean;
    isGettingAct: boolean;

    constructor(id: string) {
        this.id = id;
        this.context = new Context();
        this.tool = new ToolManager();
        this.memory = new Memory();
        this.image = new ImageManager();
        this.privilege = {
            limit: 100,
            counter: -1,
            timer: -1,
            prob: -1,
            standby: false
        };
        this.listen = { // 监听调用函数发送的内容
            status: false,
            content: ''
        };
        this.isChatting = false;
        this.isGettingAct = false;
    }

    static reviver(value: any, id: string): AI {
        const ai = new AI(id);
        const validKeys = ['context', 'tool', 'memory', 'image', 'privilege'];

        for (const k of validKeys) {
            if (value.hasOwnProperty(k)) {
                ai[k] = value[k];
            }
        }

        return ai;
    }

    clearData() {
        clearTimeout(this.context.timer);
        this.context.timer = null;
        this.context.counter = 0;
    }

    async getReply(ctx: seal.MsgContext, msg: seal.Message, retry = 0): Promise<{ s: string, reply: string, images: Image[] }> {
        // 处理messages
        const messages = handleMessages(ctx, this);

        //获取处理后的回复
        const raw_reply = await sendChatRequest(ctx, msg, this, messages, "auto");
        const { s, isRepeat, reply, images } = await handleReply(ctx, msg, raw_reply, this.context);

        //禁止AI复读
        if (isRepeat && reply !== '') {
            if (retry == 3) {
                log(`发现复读，已达到最大重试次数，清除AI上下文`);
                this.context.messages = this.context.messages.filter(item => item.role !== 'assistant' && item.role !== 'tool');
                return { s: '', reply: '', images: [] };
            }

            retry++;
            log(`发现复读，一秒后进行重试:[${retry}/3]`);

            //等待一秒后进行重试
            await new Promise(resolve => setTimeout(resolve, 1000));
            return await this.getReply(ctx, msg, retry);
        }

        return { s, reply, images };
    }

    async chat(ctx: seal.MsgContext, msg: seal.Message): Promise<void> {
        if (this.isChatting) {
            log(this.id, `正在处理消息，跳过`);
            return;
        }
        this.isChatting = true;
        const timeout = setTimeout(() => {
            this.isChatting = false;
            log(this.id, `处理消息超时`);
        }, 60 * 1000);

        //清空数据
        this.clearData();

        let { s, reply, images } = await this.getReply(ctx, msg);
        this.context.lastReply = reply;
        await this.context.iteration(ctx, s, images, 'assistant');

        // 发送回复
        seal.replyToSender(ctx, msg, reply);

        //发送偷来的图片
        const { p } = ConfigManager.image;
        if (Math.random() * 100 <= p) {
            const file = await this.image.drawImageFile();
            if (file) {
                seal.replyToSender(ctx, msg, `[CQ:image,file=${file}]`);
            }
        }

        clearTimeout(timeout);
        this.isChatting = false;
    }
}

export class AIManager {
    static cache: { [key: string]: AI } = {};

    static clearCache() {
        this.cache = {};
    }

    static getAI(id: string) {
        if (!this.cache.hasOwnProperty(id)) {
            let data = new AI(id);

            try {
                data = JSON.parse(ConfigManager.ext.storageGet(`AI_${id}`) || '{}', (key, value) => {
                    if (key === "") {
                        return AI.reviver(value, id);
                    }

                    if (key === "context") {
                        return Context.reviver(value);
                    }
                    if (key === "tool") {
                        return ToolManager.reviver(value);
                    }
                    if (key === "memory") {
                        return Memory.reviver(value);
                    }
                    if (key === "image") {
                        return ImageManager.reviver(value);
                    }

                    return value;
                });
            } catch (error) {
                console.error(`从数据库中获取${`AI_${id}`}失败:`, error);
            }

            this.cache[id] = data;
        }

        return this.cache[id];
    }

    static saveAI(id: string) {
        if (this.cache.hasOwnProperty(id)) {
            ConfigManager.ext.storageSet(`AI_${id}`, JSON.stringify(this.cache[id]));
        }
    }
}