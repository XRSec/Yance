#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
清洗 ~/Library/Application Support/Yance/imports/wechat_export/ 聊天记录：
去掉冗余 XML 卡包、媒体元数据，输出到同级 wechat_export_cleaned/，原目录不动。

规则:
- text          -> 去掉发送者(wxid)前缀,保留原样
- system        -> 保留文本
- 富媒体        -> 占位文本 [图片]/[表情包]/[语音]/[视频]/[位置]/[名片]
- appmsg 卡包   -> 尽量提取 title/des 生成简短文本;系统/版本过低/无可提信息则丢弃或占位
"""
import json, glob, os, re, sys
from xml.etree import ElementTree as ET

IMPORTS = os.path.expanduser("~/Library/Application Support/Yance/imports")
SRC = os.path.join(IMPORTS, "wechat_export")
DST = os.path.join(IMPORTS, "wechat_export_cleaned")

# 富媒体 -> 占位标签
MEDIA_LABEL = {
    "image": "[图片]",
    "video": "[视频]",
    "voice": "[语音]",
    "location": "[位置]",
    "card": "[名片]",
    "sticker": "[表情包]",
    "emoji": "[表情包]",
}

# 未知的外层高数字 type -> 中文标签
# 这些是微信导出的内部业务 MsgType 硬编码,无法从 appmsg.type 推断
TYPE_LABEL = {
    "244813135921": "引用",   # appmsg type=57 引用消息卡(内容即被引用文本)
    "21474836529": "卡包",      # 商品/链接分享
    "266287972401": "拍了拍",
    "50": "语音通话",            # VoIP 通话气泡
    "219043332145": "系统提示",  # 版本过低
    "81604378673": "聊天记录",   # 群聊记录转发
    "141733920817": "直播",
    "25769803825": "文件",
    "8589934592049": "转账",
    "17179" "869233": "分享",  # 小视频（拼接后为内部 MsgType）
    "34359738417": "分享",       # 空卡片
    "8594229559345": "红包",
    "154618822705": "商品卡",
    "270582939697": "系统提示",  # 版本过低
    "532575944753": "礼物",
    "12884901937": "音乐",
    "227633266737": "音乐",
    "373662154801": "系统",
    "103079215153": "商品卡",
    "4294967345": "链接",
    "395136991281": "红包",
    "73014444081": "位置共享",
    "66": "名片",              # 企业微信名片/头像
    "292057776177": "游戏",
    "214748364849": "系统提示",  # 版本过低
    "30064771121": "游戏",
    "201863462961": "系统提示",
    "171798691889": "聊天记录",
    "476741369905": "系统提示",  # 版本过低
    "352187318321": "系统提示",  # 版本过低
    "8602819493937": "红包封面",
}

# 版本过低这一类,直接丢弃
SYS_PROMPT_MARKERS = ("当前微信版本", "当前版本不支持", "升级至最新版本", "请升级至最新版本")

# 按外层 type 归类的,不再走 appmsg 提取,直接打标签
TYPE_DIRECT_LABEL = {"50": "[语音通话]", "73014444081": "[位置共享]", "66": "[名片]"}

def extract_appmsg(content):
    """从 XML 提取 appmsg 的 title/des/type,返回 (title, des, apptype) 或 None。"""
    c = re.sub(r"^[A-Za-z0-9_\-]+:\n?", "", content, count=1)
    if not (c.startswith("<?xml") or c.startswith("<msg")):
        return None
    try:
        root = ET.fromstring(c)
    except Exception:
        return None
    def txt(tag):
        el = root.find(f".//{tag}")
        if el is not None and el.text and el.text.strip():
            return el.text.strip()
        return ""
    title = txt("title")
    des = txt("des")
    apptype = ""
    el = root.find(".//appmsg/type")
    if el is not None and el.text and el.text.strip():
        apptype = el.text.strip()
    return (title, des, apptype)

def clean_one(m):
    """清洗单条消息,返回处理后的 content 文本,None 表示丢弃。"""
    typ = m.get("type", "<none>")
    content = m.get("content", "")

    # 富媒体占位
    if typ in MEDIA_LABEL:
        return MEDIA_LABEL[typ]

    # 已知可直接打标签的外层类型(内容无文本价值,只留标记)
    if typ in TYPE_DIRECT_LABEL:
        return TYPE_DIRECT_LABEL[typ]

    # 纯文本:去掉 wxid 发送者前缀
    if typ == "text":
        # 形如 "wxid_xxx:\n正文"; 也可能带自增标记,保留正文
        m2 = re.match(r"^[A-Za-z0-9_\-]+:\n?(.*)$", content, re.S)
        return m2.group(1) if m2 else content

    # system:保留纯文本(可能含html标签,清理掉)
    if typ == "system":
        txt = re.sub(r"<[^>]+>", "", content)
        if txt:
            return txt
        return None

    # 版本过低 / 系统不可用 -> 丢弃
    if any(mk in content for mk in SYS_PROMPT_MARKERS):
        return None

    # 其余:作为 appmsg 卡包解析
    ext = extract_appmsg(content)
    if ext:
        title, des, apptype = ext
        text = title or des
        if not text:
            # 完全无可提取内容 -> 用外层type标签,若无则丢弃
            label = TYPE_LABEL.get(typ)
            return None if not label else f"[{label}]"
        # 外层 type 已有明确语义的,优先用外层标签;否则用 apptype
        label = TYPE_LABEL.get(typ, _type_label(apptype) if apptype else "分享")
        return f"[{label}] {text}"

    # 无法解析:优先用外层type标签
    label = TYPE_LABEL.get(typ)
    if label:
        firstline = content.splitlines()[0].strip()[:40] if content.strip() else ""
        tail = f" {firstline}" if firstline else ""
        return f"[{label}]{tail}"
    # 仍未知:保留 type 名
    firstline = content.splitlines()[0].strip()[:40] if content.strip() else ""
    return f"[{typ}] {firstline}".strip()

def _type_label(apptype):
    """根据 appmsg.type 编号给出中文标签。"""
    return {
        "3": "音乐", "4": "分享", "5": "分享", "8": "消息",
        "13": "位置", "17": "位置共享", "24": "商品",
        "47": "系统提示", "51": "系统", "53": "音乐",
        "57": "引用", "62": "拍了拍", "63": "系统提示",
        "87": "系统", "111": "系统提示", "124": "系统提示",
        "2002": "亲属卡",
    }.get(apptype, "分享")

def process_file(path):
    source_path = os.path.realpath(path)
    source_root = os.path.realpath(SRC) + os.sep
    if not source_path.startswith(source_root):
        raise ValueError(f"输入文件不在导入目录内: {path}")
    try:
        with open(source_path, "r", encoding="utf-8") as source_file:
            data = json.load(source_file)
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"无法读取 {source_path}: {error}") from error
    kept = []
    dropped = 0
    for m in data.get("messages", []):
        try:
            out = clean_one(m)
        except Exception:
            out = ""
        if out is None:
            dropped += 1
            continue
        kept.append({"time": m.get("time"), "sender": m.get("sender"),
                     "type": m.get("type"), "content": out})
    data["messages"] = kept
    return data, kept, dropped

def main():
    files = sorted(glob.glob(os.path.join(SRC, "*.json")))
    # 支持部分文件参数用于小样本测试
    if len(sys.argv) > 1:
        sel = set(sys.argv[1:])
        files = [f for f in files if os.path.basename(f) in sel]
    try:
        os.makedirs(DST, exist_ok=True)
    except OSError as error:
        print(f"!! 无法创建输出目录 {DST}: {error}", file=sys.stderr)
        sys.exit(1)
    total_in = total_out = 0
    size_in = size_out = 0
    name_seen = {}  # user_name -> 出现次数,处理同名冲突
    for f in files:
        try:
            data, kept, dropped = process_file(f)
        except Exception as e:
            print(f"!! 失败: {os.path.basename(f)}: {e}", file=sys.stderr)
            continue
        # 输出文件名 = user_name(+冲突序号)。user_name 为空则退回原文件名
        uname = (data.get("user_name") or "").strip()
        safe_uname = re.sub(r"[^A-Za-z0-9_@.一-鿿-]", "_", uname)
        base = safe_uname or os.path.splitext(os.path.basename(f))[0]
        name_seen[base] = name_seen.get(base, 0) + 1
        outname = f"{base}.json" if name_seen[base] == 1 else f"{base}__{name_seen[base]}.json"
        out = os.path.realpath(os.path.join(DST, outname))
        if os.path.dirname(out) != os.path.realpath(DST):
            print(f"!! 非法输出路径: {out}", file=sys.stderr)
            continue
        try:
            with open(out, "w", encoding="utf-8") as fh:
                json.dump(data, fh, ensure_ascii=False, indent=1)
        except Exception as e:
            print(f"!! 写出失败: {os.path.basename(f)}: {e}", file=sys.stderr)
            continue
        total_in += data["message_count"]
        total_out += len(kept)
        size_in += os.path.getsize(f)
        size_out += os.path.getsize(out)
    print(f"处理文件 {len(files)} 个")
    print(f"消息: {total_in} -> {total_out} (保留 {total_out/total_in*100:.1f}%)")
    print(f"大小: {size_in/1024/1024:.1f} MB -> {size_out/1024/1024:.1f} MB (压缩 {size_out/size_in*100:.1f}%)")

if __name__ == "__main__":
    main()