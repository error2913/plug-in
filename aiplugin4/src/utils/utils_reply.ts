import { Context } from "../AI/context";
import { Image, ImageManager } from "../AI/image";
import { ConfigManager } from "../config/config";
import { log } from "./utils";
import { calculateSimilarity } from "./utils_string";

export async function handleReply(ctx: seal.MsgContext, msg: seal.Message, s: string, context: Context): Promise<{ s: string, isRepeat: boolean, reply: string, images: Image[] }> {
    const { maxChar, replymsg, filterContextTemplate, filterReplyTemplate } = ConfigManager.reply;

    // 分离AI臆想出来的多轮对话
    const segments = s
        .split(/<[\|｜]from.*?[\|｜]?>/)
        .filter(item => item.trim() !== '');
    if (segments.length === 0) {
        return { s: '', reply: '', isRepeat: false, images: [] };
    }

    s = segments[0]
        .replace(/<br>/g, '\n') // 我又不是浏览器，为什么要帮你替换这个
        .slice(0, maxChar)
        .trim();

    let reply = s; // 回复消息和上下文在此分开处理

    // 应用过滤上下文正则表达式
    filterContextTemplate.forEach(item => {
        try {
            const regex = new RegExp(item, 'g');
            s = s.replace(regex, '');
        } catch (error) {
            console.error('Error in RegExp:', error);
        }
    })

    // 检查复读
    const isRepeat = checkRepeat(context, s);

    reply = await replaceMentions(ctx, context, reply);
    const { result, images } = await replaceImages(context, reply);
    reply = result;

    // 应用过滤回复正则表达式
    filterReplyTemplate.forEach(item => {
        try {
            const regex = new RegExp(item, 'g');
            reply = reply.replace(regex, '');
        } catch (error) {
            console.error('Error in RegExp:', error);
        }
    })

    const prefix = replymsg ? `[CQ:reply,id=${msg.rawId}][CQ:at,qq=${ctx.player.userId.replace(/\D+/g, "")}] ` : ``;
    reply = prefix + reply.trim();

    return { s, isRepeat, reply, images };
}

function checkRepeat(context: Context, s: string) {
    const { stopRepeat, similarityLimit } = ConfigManager.reply;

    if (!stopRepeat) {
        return false;
    }

    const messages = context.messages;
    for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];
        // 寻找最后一条文本消息
        if (message.role === 'assistant' && !message?.tool_calls) {
            const content = message.content;
            const similarity = calculateSimilarity(content.trim(), s.trim());
            log(`复读相似度：${similarity}`);

            if (similarity > similarityLimit) {
                // 找到最近的一块assistant消息全部删除，防止触发tool相关的bug
                let start = i;
                let count = 1;
                for (let j = i - 1; j >= 0; j--) {
                    const message = messages[j];
                    if (message.role === 'tool' || (message.role === 'assistant' && message?.tool_calls)) {
                        start = j;
                        count++;
                    } else {
                        break;
                    }
                }

                messages.splice(start, count);

                return true;
            }

            break;
        }
    }
    return false;
}

/**
 * 替换艾特提及为CQ码
 * @param context 
 * @param reply 
 * @returns 
 */
async function replaceMentions(ctx: seal.MsgContext, context: Context, reply: string) {
    const match = reply.match(/<@(.+?)>/g);
    if (match) {
        for (let i = 0; i < match.length; i++) {
            const name = match[i].replace(/^<@|>$/g, '');
            const uid = await context.findUserId(ctx, name);
            if (uid!== null) {
                reply = reply.replace(match[i], `[CQ:at,qq=${uid.replace(/\D+/g, "")}]`);
            } else {
                reply = reply.replace(match[i], ` @${name} `);
            }
        }
    }

    return reply;
}

/**
 * 替换图片占位符为CQ码
 * @param context 
 * @param reply 
 * @returns 
 */
async function replaceImages(context: Context, reply: string) {
    let result = reply;
    const images = [];

    const match = reply.match(/<[\|｜]图片.+?[\|｜]?>/g);
    if (match) {
        for (let i = 0; i < match.length; i++) {
            const id = match[i].match(/<[\|｜]图片(.+?)[\|｜]?>/)[1];
            const image = context.findImage(id);

            if (image) {
                const file = image.file;
                images.push(image);

                if (!image.isUrl || (image.isUrl && await ImageManager.checkImageUrl(file))) {
                    result = result.replace(match[i], `[CQ:image,file=${file}]`);
                    continue;
                }
            }

            result = result.replace(match[i], ``);
        }
    }

    return { result, images };
}
