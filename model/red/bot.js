import { makeSendMsg, makeMessage } from './message.js'
import { setMsg, getMsg } from '../DataBase.js'
import { roleMap, upload } from './tool.js'
import { Config, Version } from '../../components/index.js'
import { findAll } from './memberList.js'

export class QQRedBot {
    constructor(bot) {
        this.bot = bot
        this.self_id = bot.self_id
        this.nickname = bot.nickname
        this.adapter = {
            id: "QQ",
            name: "chronocat"
        }
        this.avatar = `https://q1.qlogo.cn/g?b=qq&s=0&nk=${bot.uin}`
        this.ws = bot.ws
        this.sendApi = bot.sendApi
        this.uin = bot.self_id
        this.uid = bot.info.uid
        this.nickname = bot.nickname
        this.self_id = bot.self_id
        this.stat = {
            start_time: Date.now() / 1000,
            recv_msg_cnt: 0
        }
        this.version = {
            id: "QQ",
            name: "chronocat"
        }
        this.fl = new Map()
        this.gl = new Map()
        this.gml = new Map()
        this.getConfig = {}
        this.init()
    }

    async init() {
        await this.getFriendList()
        await this.getGroupList()
    }

    pickGroup(group_id) {
        group_id = Number(group_id)
        if (!this.getConfig[group_id]) {
            this.getGroupMemberList(group_id)
            this.getConfig[group_id] = true
        }
        const i = {
            ...this.gl.get(group_id),
            self_id: this.uin,
            bot: this.bot,
            group_id
        }
        return {
            ...i,
            sendMsg: msg => this.sendGroupMsg(group_id, msg),
            pickMember: user_id => this.pickMember(group_id, user_id),
            getMemberMap: () => this.getGroupMemberList(group_id),
            recallMsg: message_id => this.deleteMsg(message_id),
            sendFile: file => this.sendGroupMsg(group_id, [{ type: 'file', file }]),
            getChatHistory: (seq, count) => this.getChatHistory(seq, count, 'group', group_id),
            getInfo: () => this.getGroupInfo(group_id),
            muteMember: (user_id, duration) => this.setGroupBan(group_id, user_id, duration),
            muteAll: enable => this.setGroupWholeBan(group_id, enable),
            kickMember: (user_id, message, block) => this.setGroupKick(group_id, user_id, false, message),
            makeForwardMsg: msg => { return { type: "node", data: msg } },
            setName: name => this.setGroupName(group_id, name),
            setRemark: remark => this.setGroupRemark(group_id, remark),
            setCard: (user_id, card) => this.setGroupCard(group_id, user_id, card),
            setAdmin: (user_id, enable) => this.setGroupAdmin(group_id, user_id, enable),
            invite: user_id => this.inviteFriend(group_id, user_id),
            quit: () => this.setGroupLeave(group_id)
        }
    }

    pickFriend(user_id) {
        user_id = Number(user_id)
        const user = this.fl.get(user_id)
        const i = {
            ...user,
            self_id: this.uin,
            bot: this.bot,
            user_id,
        }
        const chatType = user?.isGroupMsg ? 100 : 1
        return {
            ...i,
            sendMsg: msg => this.sendPrivateMsg(user_id, msg, chatType),
            recallMsg: message_id => this.deleteMsg(message_id),
            sendFile: file => this.sendPrivateMsg(user_id, [{ type: 'file', file }], chatType),
            getChatHistory: (time, count) => this.getChatHistory(time, count, 'friend', user_id),
            getFileUrl: fid => `http://127.0.0.1:${Version.isTrss ? Config.bot.port : Config.wsPort}/ws-plugin?file=${fid}`,
            makeForwardMsg: msg => { return { type: "node", data: msg } },
            setFriendReq: (seq, yes, remark, block) => this.setFriendReq(seq, yes, remark, block, user_id),
            thumbUp: times => this.sendLike(user_id, times),
            delete: block => this.deleteFriend(user_id, block)
        }
    }

    pickMember(group_id, user_id) {
        if (!this.getConfig[group_id]) {
            this.getGroupMemberList(group_id)
            this.getConfig[group_id] = true
        }
        const info = this.gml.get(Number(group_id))?.get?.(Number(user_id))
        const i = {
            ...info,
            self_id: this.uin,
            bot: this.bot,
            group_id: group_id,
            user_id: user_id,
        }
        return {
            ...i,
            info: {
                ...info,
                ...i
            },
            ...this.pickFriend(user_id),
            kick: (message, block) => this.setGroupKick(group_id, user_id, false, message),
            mute: duration => this.setGroupBan(group_id, user_id, duration),
            getInfo: () => this.getGroupMemberInfo(group_id, user_id),
            getAvatarUrl: () => `https://q1.qlogo.cn/g?b=qq&s=0&nk=${user_id}`
        }
    }

    pickUser(user_id) {
        return {
            ...this.pickFriend(user_id),
            setGroupInvite: (group_id, seq, yes, block) => this.setGroupInvite(group_id, seq, yes, block)
        }
    }

    async sendGroupMsg(group_id, message) {
        const data = {
            bot: this.bot,
            self_id: this.uin,
            group_id
        }
        const { msg: elements, log, message_id: id, rand, seq, time } = await makeSendMsg(data, message)
        if (id) return { message_id: id, rand, seq, time }
        if (elements.length == 0) {
            throw '[ws-plugin] 发送消息错误: message is empty'
        }
        const result = await this.bot.sendApi('POST', 'message/send', JSON.stringify({
            peer: {
                chatType: 2,
                peerUin: String(group_id)
            },
            elements
        }))
        if (result.error) {
            throw result.error
        } else {
            logger.info(`${logger.blue(`[${this.uin} => ${group_id}]`)} 发送群消息：${log}`)
        }
        const sendRet = {
            message_id: result.msgId,
            seq: Number(result.msgSeq),
            rand: Number(result.msgRandom),
            time: Number(result.msgTime),
            group_id: Number(group_id),
            onebot_id: Math.floor(Math.random() * Math.pow(2, 32)) | 0,
        }
        setMsg(sendRet)
        sendRet.md5 = elements.filter((i) => i.elementType === 2)
        return sendRet
    }

    async sendPrivateMsg(user_id, message, chatType = 1) {
        if ([1, 100].indexOf(chatType) == -1) chatType = 1
        const data = {
            bot: this.bot,
            self_id: this.uin,
            user_id
        }
        const { msg: elements, log, message_id: id, rand, seq, time } = await makeSendMsg(data, message)
        if (id) return { message_id: id, rand, seq, time }
        if (elements.length == 0) {
            throw '[ws-plugin] 发送消息错误: message is empty'
        }
        const result = await this.bot.sendApi('POST', 'message/send', JSON.stringify({
            peer: {
                chatType,
                peerUin: String(user_id)
            },
            elements
        }))
        if (result.error) {
            throw result.error
        } else {
            logger.info(`${logger.blue(`[${this.uin} => ${user_id}]`)} 发送好友消息：${log}`)
        }
        const sendRet = {
            message_id: result.msgId,
            seq: Number(result.msgSeq),
            rand: Number(result.msgRandom),
            user_id: Number(user_id),
            time: Number(result.msgTime),
            onebot_id: Math.floor(Math.random() * Math.pow(2, 32)) | 0,
        }
        setMsg(sendRet)
        sendRet.md5 = elements.filter((i) => i.elementType === 2)
        return sendRet
    }

    async inviteFriend(group_id, user_id) {
        const result = await this.bot.sendApi('POST', 'group/invite', JSON.stringify({
            group: Number(group_id),
            uins: [String(user_id)]
        }))
        if (result.error) {
            throw result.error
        }
        return true
    }

    async deleteMsg(message_id) {
        const msg = await getMsg({ message_id })
        if (msg) {
            await this.bot.sendApi('POST', 'message/recall', JSON.stringify({
                peer: {
                    chatType: msg.group_id ? 2 : 1,
                    peerUin: String(msg.group_id || msg.user_id),
                    guildId: null
                },
                msgIds: [msg.message_id]
            }))
        }
    }

    async deleteFriend(user_id, block = true) {
        const result = await this.bot.sendApi('POST', 'friend/delete', JSON.stringify({
            uin: Number(user_id),
            Block: block
        }))
        if (result.error) {
            throw result.error
        }
        this.getFriendList()
        return true
    }

    async getMsg(message_id) {
        const retult = await this.getChatHistory(message_id, 1)
        if (retult.length > 0) {
            return retult[0]
        } else {
            return null
        }
    }

    async getChatHistory(message_id, count, target, target_id) {
        let data = {}
        if (target === 'group') {
            if (!message_id) message_id = (await getMsg({ group_id: target_id }, [['seq', 'DESC']])).seq
            data = {
                seq: message_id,
                group_id: target_id,
            }
        } else if (target === 'friend') {
            if (!message_id) message_id = (await getMsg({ user_id: target_id }, [['time', 'DESC']])).time
            data = {
                time: message_id,
                user_id: target_id,
            }
        } else {
            data = {
                message_id,
            }
        }
        let msg = await getMsg(data)
        // time有可能有误差
        if (!msg && target == 'friend') {
            for (let i = -3; i < 4; i++) {
                data = {
                    time: message_id + i,
                    user_id: target_id,
                }
                msg = await getMsg(data)
                if (msg) break
            }
        }
        if (msg) {
            const result = await this.bot.sendApi('POST', 'message/getHistory', JSON.stringify({
                peer: {
                    chatType: msg.group_id ? 2 : 1,
                    peerUin: String(msg.group_id || msg.user_id),
                    guildId: null
                },
                offsetMsgId: msg.message_id,
                count: count || 20
            }))
            if (result.error) {
                throw result.error
            }
            if (result.msgList) {
                const msgList = []
                for (const i of result.msgList) {
                    const message = await makeMessage(this.uin, i)
                    if (message.bot) delete message.bot
                    msgList.push(message)
                }
                return msgList
            }
        }
        return []
    }

    async getFriendList() {
        this.fl.clear()
        for (const i of (await this.bot.sendApi('get', 'bot/friends')) || []) {
            this.fl.set(Number(i.uin), {
                ...i,
                bot_id: this.uin,
                user_id: i.uin,
                nickname: i.nick
            })
        }
        return this.fl
    }

    async getGroupList() {
        for (const i of (await this.bot.sendApi('get', 'bot/groups')) || []) {
            const data = {
                ...i,
                bot_id: this.uin,
                group_id: i.groupCode,
                group_name: i.groupName,
                max_member_count: i.maxMember,
                member_count: i.memberCount,
            }
            switch (i.memberRole) {
                case 3:
                    data.is_admin = true
                    break
                case 4:
                    data.is_owner = true
                    break
                default:
                    break;
            }
            this.gl.set(Number(i.groupCode), data)
            if (!this.gml.has(Number(i.groupCode))) {
                this.gml.set(Number(i.groupCode), new Map())
            }
        }
        return this.gl
    }

    async getGroupMemberList(group_id) {
        group_id = Number(group_id)
        const body = {
            group: group_id,
            size: 9999
        }
        if (!this.gml.has(group_id)) {
            this.gml.set(group_id, new Map())
        }
        let memberList = await this.bot.sendApi('POST', 'group/getMemberList', JSON.stringify(body))
        if (memberList.error) throw memberList.error
        // 如果是0就去数据库中找一下
        if (memberList.length === 0) {
            memberList = await findAll(group_id)
        }
        for (const i of memberList) {
            this.gml.get(group_id).set(Number(i.detail.uin), {
                ...i.detail,
                card: i.detail.cardName || i.detail.nick,
                nickname: i.detail.nick,
                group_id,
                user_id: i.detail.uin,
                role: roleMap[i.detail.role],
                shutup_time: i.detail.shutUpTime,
                sex: 'unknown'
            })
        }

        return this.gml.get(group_id)
    }

    async getGroupMemberInfo(group_id, user_id) {
        if (!this.getConfig[group_id]) {
            await this.getGroupMemberList(group_id)
            this.getConfig[group_id] = true
        }
        return this.gl.get(Number(group_id))?.get?.(Number(user_id)) || {}
    }

    async getGroupInfo(group_id) {
        return this.gl.get(Number(group_id))
    }

    async setAvatar(file) {
        const data = await upload(this.bot, file, 'image/png')
        if (data?.ntFilePath) {
            const result = await this.bot.sendApi('POST', 'bot/setAvatar', JSON.stringify({
                paath: data.ntFilePath
            }))
            if (result.error) {
                throw result.error
            }
            return true
        }
        return false
    }

    async setNickname(nickname) {
        const result = await this.bot.sendApi('POST', 'bot/setMiniProfile', JSON.stringify({
            nick: nickname
        }))
        if (result.error) {
            throw result.error
        }
        return true
    }

    async setSignature(signature) {
        const result = await this.bot.sendApi('POST', 'bot/setMiniProfile', JSON.stringify({
            longNick: signature
        }))
        if (result.error) {
            throw result.error
        }
        return true
    }

    async setBirthday(birthday) {
        if (typeof birthday === 'number') {
            birthday = String(birthday)
        }
        const numbers = birthday.match(/\d+/g);
        if (numbers) {
            birthday = numbers.join('')
        } else {
            return false
        }
        const year = Number(birthday.substring(0, 4) || 1999)
        const month = Number(birthday.substring(4, 6) || 1)
        const day = Number(birthday.substring(6, 8) || 1)
        const result = await this.bot.sendApi('POST', 'bot/setMiniProfile', JSON.stringify({
            birthday: {
                year,
                month,
                day
            }
        }))
        if (result.error) {
            throw result.error
        }
        return true
    }

    async setGender(gender) {
        const result = await this.bot.sendApi('POST', 'bot/setMiniProfile', JSON.stringify({
            sex: Number(gender) || 1
        }))
        if (result.error) {
            throw result.error
        }
        return true
    }

    async setOnlineStatus(status) {
        const code = {
            31: 30, // '离开'
            50: 50, // '忙碌'
            70: 70, // '请勿打扰'
            41: 40, // '隐身'
            11: 10, // '我在线上'
            60: 60, // 'Q我吧'
        }
        const result = await this.bot.sendApi('POST', 'bot/setOnlineStatus', JSON.stringify({
            status: code[status] || status
        }))
        if (result.error) {
            throw result.error
        }
        return true
    }

    async setGroupInvite(group_id, seq, yes = true, block = false) {
        const result = await this.bot.sendApi('POST', 'group/approval', JSON.stringify({
            operateType: yes ? 1 : 2,
            group: Number(group_id),
            seq
        }))
        if (result.error) {
            throw result.error
        }
        if (yes) {
            this.getGroupList()
        }
        return true
    }

    async setGroupBan(group_id, user_id, duration) {
        const result = this.bot.sendApi('POST', 'group/muteMember', JSON.stringify({
            group: String(group_id),
            memList: [{
                uin: String(user_id),
                timeStamp: duration
            }]
        }))
        if (result.error) {
            throw result.error
        }
    }

    async setGroupWholeBan(group_id, enable = true) {
        const result = await this.bot.sendApi('POST', 'group/muteEveryone', JSON.stringify({
            group: String(group_id),
            enable
        }))
        if (result.error) {
            throw result.error
        }
    }

    async setGroupKick(group_id, user_id, reject_add_request = false, message = '') {
        const result = await this.bot.sendApi('POST', 'group/kick', JSON.stringify({
            uidList: [String(user_id)],
            group: String(group_id),
            refuseForever: reject_add_request,
            reason: message
        }))
        if (result.error) {
            throw result.error
        }
        return true
    }

    async setGroupLeave(group_id) {
        group_id = Number(group_id)
        // 缓存没有这个群的话就先获取一遍
        if (!this.gl.has(group_id)) await this.getGroupList()
        // 还是没有的话就是没有这个群了
        if (!this.gl.has(group_id)) return false
        // 是群主就是解散,不是就退群
        const api = this.gl.get(group_id).is_owner ? 'destroy' : 'quit'
        const result = await this.bot.sendApi('POST', `group/${api}`, JSON.stringify({
            group: group_id,
        }))
        if (result.error) {
            throw result.error
        }
        return true
    }

    async setGroupName(group_id, name) {
        const result = await this.bot.sendApi('POST', 'group/setName', JSON.stringify({
            group: Number(group_id),
            Name: name
        }))
        if (result.error) {
            throw result.error
        }
        return true
    }

    async setGroupRemark(group_id, remark) {
        const result = await this.bot.sendApi('POST', 'group/setRemark', JSON.stringify({
            group: Number(group_id),
            Remark: remark
        }))
        if (result.error) {
            throw result.error
        }
        return true
    }

    async setGroupCard(group_id, user_id, card) {
        const result = await this.bot.sendApi('POST', 'group/setCard', JSON.stringify({
            group: Number(group_id),
            uin: Number(user_id),
            Name: card
        }))
        if (result.error) {
            throw result.error
        }
        return true
    }

    async setGroupAdmin(group_id, user_id, enable = true) {
        const result = await this.bot.sendApi('POST', 'group/setAdmin', JSON.stringify({
            group: Number(group_id),
            uin: Number(user_id),
            role: enable ? 3 : 2
        }))
        if (result.error) {
            throw result.error
        }
        return true
    }

    async setFriendReq(seq, yes = true, remark = "", block = false, user_id) {
        const result = await this.bot.sendApi('post', 'friend/approval', JSON.stringify({
            uin: String(user_id),
            accept: yes
        }))
        if (result.error) {
            throw result.error
        }
        if (yes) {
            this.getFriendList()
        }
        return true
    }

    async sendLike(user_id, times = 1) {
        const result = await this.bot.sendApi('post', 'friend/doLike', JSON.stringify({
            uin: String(user_id),
            times
        }))
        if (result.error) {
            throw Error('非icqq无法进行点赞')
        }
        return { code: result.result, msg: result.errMsg }
    }
}