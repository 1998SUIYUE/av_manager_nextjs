
import sys
import time
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import List, Tuple
import logging

import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin

DMM_SEARCH_TEMPLATE = "https://www.dmm.co.jp/mono/dvd/-/search/=/searchstr={code}/"

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7,ja;q=0.6",
    "Connection": "keep-alive",
    "Referer": "https://www.dmm.co.jp/",
    "Upgrade-Insecure-Requests": "1",
}

DEFAULT_COOKIES = {

    # 常见的成年确认相关 cookie（是否生效取决于站点当前策略）
    "age_check_done": "1",
    "ckcy": "1",
    "is_adult": "1",
}

# 日->中 常见“ジャンル”翻译表（可按需扩充）
GENRE_JA_TO_ZH = {
    "3P・4P": "3P/4P",
    "AV女優": "色情明星",
    "BL（ボーイズラブ）": "BL（男孩之爱）",
    "How To": "如何",
    "M女": "M女人",
    "M男": "M男人",
    "OL": "办公室女郎",
    "SF": "科幻小说",
    "SM": "SM",
    "Vシネマ": "V-影院",
    "おもちゃ": "玩具",
    "お姉さん": "姐姐",
    "お姫様": "公主",
    "お婆ちゃん": "奶奶",
    "お嬢様・令嬢": "年轻女士/年轻女士",
    "お母さん": "母亲",
    "お爺ちゃん": "爷爷",
    "お風呂": "洗澡",
    "くすぐり": "搔痒",
    "くノ一": "女忍者",
    "ごっくん": "Gulp",
    "そっくりさん": "长得像",
    "その他フェチ": "其他恋物癖",
    "ふたなり": "双成",
    "ぶっかけ": "群交",
    "ぽっちゃり": "胖乎乎的",
    "めがね": "眼镜",
    "アイドル・芸能人": "偶像和名人",
    "アクション": "行动",
    "アクション・格闘": "动作/格斗",
    "アクメ・オーガズム": "高潮/性高潮",
    "アジア女優": "亚洲女演员",
    "アスリート": "运动员",
    "アナル": "肛门",
    "アナルセックス": "肛交",
    "アニメ": "日本动画片",
    "アニメキャラクター": "动漫人物",
    "イタズラ": "恶作剧",
    "イメージビデオ": "图片视频",
    "イラマチオ": "深喉咙",
    "インストラクター": "讲师",
    "ウェイトレス": "女服务员",
    "エステ": "美容院",
    "オタク": "御宅族",
    "オナサポ": "Ona 支持",
    "オナニー": "手淫",
    "カップル": "夫妻",
    "カーセックス": "车内性爱",
    "キス・接吻": "吻",
    "キャバ嬢・風俗嬢": "女招待/妓女",
    "キャンギャル": "竞选女孩",
    "ギャグ・コメディ": "搞笑喜剧",
    "ギャル": "加尔",
    "クスコ": "库斯科",
    "クラシック": "经典的",
    "クンニ": "舔阴",
    "ゲイ": "同性恋",
    "ゲロ": "呕吐",
    "コスプレ": "角色扮演",
    "コラボ作品": "合作作品",
    "コンパニオン": "伴侣",
    "ゴスロリ": "哥特洛丽塔",
    "サイコ・スリラー": "心理惊悚片",
    "シスター": "姐姐",
    "シックスナイン": "69",
    "ショタ": "翔太",
    "スカトロ": "粪便",
    "スチュワーデス": "空中小姐",
    "スパンキング": "打屁股",
    "スポーツ": "运动的",
    "スレンダー": "苗条",
    "スワッピング・夫婦交換": "交换妻子",
    "セクシー": "性感",
    "セレブ": "名人",
    "セーラー服": "水手服",
    "ダンス": "舞蹈",
    "ダーク系": "黑暗的",
    "チアガール": "啦啦队长",
    "チャイナドレス": "中式礼服",
    "ツンデレ": "傲娇",
    "ディルド": "假阳具",
    "デカチン・巨根": "大屌/巨屌",
    "デビュー作品": "处女作",
    "デート": "日期",
    "ドキュメンタリー": "记录",
    "ドラッグ": "拖",
    "ドラマ": "戏剧",
    "ドール": "玩具娃娃",
    "ナンパ": "搭讪女孩",
    "ニューハーフ": "变性人",
    "ニーソックス": "及膝袜",
    "ネコミミ・獣系": "猫耳朵/动物",
    "ノーパン": "不穿内衣",
    "ノーブラ": "不戴胸罩",
    "ハメ撮り": "观点",
    "ハーレム": "后宫",
    "バイブ": "振动器",
    "バスガイド": "巴士指南",
    "バック": "后退",
    "バニーガール": "兔女郎",
    "パイズリ": "乳交",
    "パイパン": "剃光",
    "パンスト・タイツ": "连裤袜和紧身裤",
    "パンチラ": "内裤拍摄",
    "ビジネススーツ": "商务套装",
    "ビッチ": "贱人",
    "ファンタジー": "幻想",
    "ファン感謝・訪問": "粉丝欣赏/访问",
    "フィスト": "拳头",
    "フェラ": "口交",
    "ヘルス・ソープ": "健康香皂",
    "ベスト・総集編": "最佳/合辑",
    "ホテル": "酒店",
    "ホラー": "恐怖",
    "ボディコン": "紧身连衣裙",
    "ボンテージ": "束缚",
    "ポルチオ": "波蒂奥",
    "マッサージ・リフレ": "按摩和反射疗法",
    "ママ友": "妈妈的朋友",
    "ミニスカ": "超短裙",
    "ミニスカポリス": "迷你裙警察",
    "ミニ系": "迷你系列",
    "メイド": "女佣",
    "モデル": "模型",
    "ヨガ": "瑜伽",
    "ランジェリー": "内衣",
    "ルーズソックス": "宽松的袜子",
    "レオタード": "紧身衣",
    "レズキス": "女同之吻",
    "レズビアン": "女同性恋",
    "レースクィーン": "赛车皇后",
    "ローション・オイル": "乳液和油",
    "ローター": "转子",
    "不倫": "通奸",
    "中出し": "中出",
    "主観": "主观",
    "乱交": "狂欢",
    "人妻・主婦": "已婚女性/家庭主妇",
    "企画": "计划",
    "体操着・ブルマ": "运动服和灯笼裤",
    "体験告白": "经历告白",
    "処女": "处女",
    "制服": "制服",
    "単体作品": "个人作品",
    "即ハメ": "即时性爱",
    "原作コラボ": "原创合作",
    "叔母さん": "阿姨",
    "受付嬢": "接待员",
    "台湾モデル": "台湾模特",
    "和服・浴衣": "日式服装和浴衣",
    "変身ヒロイン": "变身女主角",
    "女上司": "女老板",
    "女優ベスト・総集編": "最佳女主角合辑",
    "女医": "女医生",
    "女子アナ": "女播音员",
    "女子大生": "女大学生",
    "女子校生": "女学生",
    "女将・女主人": "房东/女主人",
    "女性向け": "对女性来说",
    "女戦士": "女战士",
    "女捜査官": "女调查员",
    "女教師": "女教师",
    "女王様": "女王",
    "女装・男の娘": "异装癖/娘娘腔",
    "妄想": "妄想",
    "妊婦": "孕妇",
    "姉・妹": "姐姐/妹妹",
    "娘・養女": "女儿/养女",
    "孕ませ": "浸渍",
    "学園もの": "学校主题",
    "学生服": "校服",
    "家庭教師": "导师",
    "寝取り・寝取られ・NTR": "出轨，出轨，NTR",
    "小柄": "娇小",
    "尻フェチ": "臀部恋物癖",
    "局部アップ": "私密部位特写",
    "巨乳": "大乳房",
    "巨乳フェチ": "巨乳癖",
    "巨尻": "大屁股",
    "巫女": "巫女",
    "幼なじみ": "儿时的朋友",
    "復刻": "重印",
    "性転換・女体化": "性别变化/女性化",
    "恋愛": "恋情",
    "手コキ": "手淫",
    "拘束": "克制",
    "拷問": "酷刑",
    "指マン": "指法",
    "放尿・お漏らし": "排尿/小便",
    "放置": "弃",
    "旅行": "旅行",
    "日焼け": "晒斑",
    "早漏": "早泄",
    "時代劇": "历史剧",
    "時間停止": "时间停止",
    "未亡人": "寡妇",
    "格闘家": "战斗机",
    "極道・任侠": "黑帮/骑士精神",
    "残虐表現": "暴力",
    "母乳": "母乳",
    "水着": "泳装",
    "汗だく": "出汗",
    "洋ピン・海外輸入": "西式别针/海外进口",
    "浣腸": "灌肠剂",
    "淫乱・ハード系": "淫秽/硬核",
    "淫語": "脏话",
    "温泉": "温泉",
    "潮吹き": "喷出",
    "熟女": "成熟的女人",
    "特撮": "特殊效果",
    "男の潮吹き": "男性潮吹",
    "異物挿入": "异物插入",
    "病院・クリニック": "医院和诊所",
    "痴女": "荡妇",
    "白人女優": "白人女演员",
    "白目・失神": "眼白/昏厥",
    "盗撮・のぞき": "偷窥癖",
    "監禁": "监禁",
    "看護婦・ナース": "护士",
    "着エロ": "情趣服装",
    "秘書": "秘书",
    "童貞": "处女",
    "競泳・スクール水着": "竞技泳衣和学校泳衣",
    "筋肉": "肌肉",
    "素人": "业余",
    "縛り・緊縛": "束缚",
    "罵倒": "侮辱",
    "美乳": "美丽的乳房",
    "美少女": "美丽的女孩",
    "羞恥": "耻辱",
    "義母": "岳母",
    "職業色々": "各种职业",
    "胸チラ": "乳房闪光",
    "脚フェチ": "恋腿癖",
    "脱糞": "排便",
    "花嫁": "新娘",
    "若妻・幼妻": "年轻的妻子/年轻的妻子",
    "蝋燭": "蜡烛",
    "裸エプロン": "裸体围裙",
    "覆面・マスク": "面具",
    "触手": "触手",
    "貧乳・微乳": "乳房较小",
    "超乳": "巨大的乳房",
    "足コキ": "足交",
    "軟体": "软体动物",
    "辱め": "屈辱",
    "近親相姦": "乱伦",
    "逆ナン": "反向拾取",
    "部下・同僚": "下属和同事",
    "部活・マネージャー": "俱乐部/经理",
    "野外・露出": "户外/暴露",
    "長身": "高的",
    "電マ": "电动按摩器",
    "面接": "面试",
    "顔射": "面部的",
    "顔面騎乗": "颜面骑乘",
    "食糞": "食粪症",
    "飲み会・合コン": "饮酒聚会和集体约会",
    "飲尿": "喝尿",
    "騎乗位": "女牛仔式",
    "鬼畜": "残忍的",
    "魔法少女": "魔法少女",
    "黒人男優": "黑人男演员",
    "鼻フック": "鼻钩",
}


def translate_genres_to_zh(genres: List[str]) -> List[str]:
    return [GENRE_JA_TO_ZH.get(g, g) for g in genres]


thread_local = threading.local()

# 配置：在此处直接设置参数而非命令行
CONFIG = {
    "codes": ["ssni-123"],  # 在此填入要测试的番号列表
    "codes_file": None,      # 或者给出一个文本文件路径（每行一个番号）
    "repeat": 10,            # 每个番号重复请求次数
    "interval": 0.0,         # 串行模式下两次请求的间隔（秒）
    "workers": 10,            # 并发线程数；>1 时忽略 interval
    "timeout": 15.0,         # 单次请求超时（秒）
    "log_file": "scraper.log",  # 所有输出写入该日志文件
    "also_stdout": False,    # 是否同时输出到控制台
    # 可选：附加 cookies（可来自浏览器导出），注意隐私安全，日志中不会打印具体值
    "extra_cookies": [
        {"name": "_dd_s", "value": "logs=1&id=d55c0d5c-ba74-483e-ac3e-1ea65102522c&created=1754614421974&expire=1754616015810",
            "domain": "www.dmm.co.jp", "path": "/"},
        {"name": "adpf_uid", "value": "TawcFGWRTXtAVtpt",
            "domain": ".dmm.com", "path": "/"},
        {"name": "adpf_uid", "value": "jwiimZHcYUoGGTQC",
            "domain": ".dmm.co.jp", "path": "/"},
        {"name": "age_check_done", "value": "1",
            "domain": ".dmm.com", "path": "/"},
        {"name": "age_check_done", "value": "1",
            "domain": ".dmm.co.jp", "path": "/"},
        {"name": "ckcy", "value": "1", "domain": ".dmm.com", "path": "/"},
        {"name": "ckcy", "value": "1", "domain": ".dmm.co.jp", "path": "/"},
        {"name": "digital[play_muted]", "value": "0",
            "domain": ".dmm.com", "path": "/"},
        {"name": "digital[play_muted]", "value": "0",
            "domain": ".dmm.co.jp", "path": "/"},
        {"name": "digital[play_volume]", "value": "0.5",
            "domain": ".dmm.com", "path": "/"},
        {"name": "digital[play_volume]", "value": "0.5",
            "domain": ".dmm.co.jp", "path": "/"},
    ],
    "extract_first_result": True,
}


def _get_session() -> requests.Session:
    if not hasattr(thread_local, "session"):
        s = requests.Session()
        s.headers.update(DEFAULT_HEADERS)
        # 预置 cookie（域为 .dmm.co.jp，子域名通用）
        for k, v in DEFAULT_COOKIES.items():
            s.cookies.set(k, v, domain=".dmm.co.jp")
        # 附加用户提供的 cookies
        extra = CONFIG.get("extra_cookies") or []
        for c in extra:
            try:
                name = c.get("name")
                value = c.get("value")
                domain = c.get("domain", ".dmm.co.jp")
                path = c.get("path", "/")
                if name is not None and value is not None:
                    s.cookies.set(name, value, domain=domain, path=path)
            except Exception:
                # 忽略无效条目，避免中断
                pass
        thread_local.session = s
    return thread_local.session


def _make_url(code: str) -> str:
    code = code.strip().replace(" ", "")
    return DMM_SEARCH_TEMPLATE.format(code=code)


def fetch_once(code: str, idx: int, timeout: float = 15.0) -> Tuple[str, int, str, str]:
    """
    发起一次请求并返回 (content, status_code, url, error)
    - content: 成功时为完整页面文本；失败时为空字符串
    - status_code: HTTP 状态码（失败时为 0）
    - url: 实际请求的 URL
    - error: 失败时的错误信息（成功时为空字符串）
    """
    url = _make_url(code)
    session = _get_session()
    try:
        resp = session.get(url, timeout=timeout)
        status = resp.status_code
        # 尽量正确解码
        if resp.encoding is None:
            resp.encoding = resp.apparent_encoding or "utf-8"
        content = resp.text
        return content, status, url, ""
    except requests.RequestException as e:
        return "", 0, url, str(e)


def run_sequential(codes: List[str], repeat: int, interval: float, timeout: float):
    total = len(codes) * max(1, repeat)
    counter = 0
    for code in codes:
        for i in range(repeat):
            counter += 1
            start = time.perf_counter()
            content, status, url, err = fetch_once(code, i, timeout=timeout)
            elapsed = time.perf_counter() - start
            if CONFIG.get("extract_first_result", False) and not err and status == 200:
                result = _extract_detail_fields(content, url)
                _print_extract_block(counter, total, code,
                                     status, url, elapsed, result)
            else:
                _print_response_block(
                    counter, total, code, status, url, elapsed, content, err)
            if interval > 0 and not (i == repeat - 1 and code == codes[-1]):
                time.sleep(interval)


def run_parallel(codes: List[str], repeat: int, workers: int, timeout: float):
    tasks = []
    for code in codes:
        for i in range(repeat):
            tasks.append((code, i))

    total = len(tasks)
    counter = 0
    with ThreadPoolExecutor(max_workers=max(1, workers)) as ex:
        future_map = {ex.submit(_timed_fetch, code, i, timeout): (
            code, i) for code, i in tasks}
        for fut in as_completed(future_map):
            code, i = future_map[fut]
            counter += 1
            content, status, url, err, elapsed = fut.result()
            if CONFIG.get("extract_first_result", False) and not err and status == 200:
                result = _extract_detail_fields(content, url)
                _print_extract_block(counter, total, code,
                                     status, url, elapsed, result)
            else:
                _print_response_block(
                    counter, total, code, status, url, elapsed, content, err)


def _extract_detail_fields(html: str, base_url: str):
    """
    解析搜索页 HTML，找到第一个结果链接，再抓取详情页并解析所需字段。
    返回字典：{"detail_url": str, "title": str, "performer": str, "category": str, "error": str}
    注意：仅使用用户提供的 CSS 选择器。
    """
    try:
        soup = BeautifulSoup(html, "html.parser")
        # 从搜索页找到第一个结果详情链接
        a = soup.select_one("#list > li:nth-child(1) > div > p.tmb > a")
        if not a or not a.get("href"):
            return {"detail_url": "", "title": "", "performer": "", "category": "", "error": "未找到第一个结果链接"}
        detail_href = a.get("href").strip()
        detail_url = urljoin(base_url, detail_href)
    except Exception as e:
        return {"detail_url": "", "title": "", "performer": "", "category": "", "error": f"搜索页解析失败: {e}"}

    # 请求详情页
    session = _get_session()
    try:
        resp = session.get(detail_url, timeout=CONFIG.get("timeout", 15.0))
        if resp.encoding is None:
            resp.encoding = resp.apparent_encoding or "utf-8"
        detail_html = resp.text
    except requests.RequestException as e:
        return {"detail_url": detail_url, "title": "", "performer": "", "category": "", "error": f"详情页请求失败: {e}"}

    # 解析详情页字段
    try:
        dsoup = BeautifulSoup(detail_html, "html.parser")
        title_el = dsoup.select_one("#title")
        performer_el = dsoup.select_one("#performer")
        # 分类（ジャンル）：根据左侧标签单元格寻找右侧兄弟单元格中的所有 a 文本
        title = title_el.get_text(strip=True) if title_el else ""
        performer = performer_el.get_text(strip=True) if performer_el else ""

        def is_genre_td(td):
            txt = td.get_text(strip=True) if td else ""
            txt = txt.replace("：", ":")  # 归一化全角冒号
            return "ジャンル" in txt

        category = ""
        label_td = None
        for td in dsoup.find_all("td", class_="nw"):
            if is_genre_td(td):
                label_td = td
                break
        if label_td:
            value_td = label_td.find_next_sibling("td")
            if value_td:
                cats = [a.get_text(strip=True) for a in value_td.find_all("a")]
                cats = [c for c in cats if c]
                # 去重保持顺序（可选）
                seen = set()
                cats_unique = []
                for c in cats:
                    if c not in seen:
                        seen.add(c)
                        cats_unique.append(c)
                # 翻译为中文
                cats_zh = translate_genres_to_zh(cats_unique)
                category = " / ".join(cats_zh)

        # 封面图片：优先 og:image；再尝试 modal 节点的 data-src/src；再全局扫描候选
        cover_url = ""
        candidates = []
        # 1) meta og:image
        meta_og = dsoup.find("meta", attrs={"property": "og:image"})
        if meta_og and meta_og.get("content"):
            candidates.append(meta_og.get("content").strip())
        # 2) modal 大图节点
        cover_el = dsoup.select_one("#fn-modalSampleImage__image")
        if cover_el:
            # 常见懒加载属性优先
            for attr in ("data-src", "data-original", "data-lazy", "data-srcset", "src"):
                val = cover_el.get(attr)
                if val:
                    val = val.strip()
                    # 处理 srcset: 取第一段 URL
                    if attr == "data-srcset":
                        val = val.split()[0].strip(", ")
                    candidates.append(val)
            # 父级 a 的 href 也可能是大图
            parent_a = cover_el.find_parent("a")
            if parent_a and parent_a.get("href"):
                candidates.append(parent_a.get("href").strip())
        # 3) 全局扫描 img，挑选 pics.dmm.co.jp/mono/movie 路径，过滤 loading gif
        for img in dsoup.find_all("img"):
            for attr in ("data-src", "data-original", "src"):
                val = img.get(attr)
                if not val:
                    continue
                val_low = val.lower()
                if ("pics.dmm.co.jp" in val_low or "p.dmm.co.jp" in val_low) and \
                   ("/mono/movie/" in val_low or "/digital/" in val_low):
                    if "loading" in val_low and val_low.endswith(".gif"):
                        continue
                    candidates.append(val.strip())
        # 去重并补全为绝对 URL
        normed = []
        seen = set()
        for u in candidates:
            if not u:
                continue
            abs_u = urljoin(detail_url, u)
            if abs_u not in seen:
                seen.add(abs_u)
                normed.append(abs_u)
        # 偏好规则：优先 pl（大图）> ps > 非 gif

        def pick(urls):
            if not urls:
                return ""
            pref = [u for u in urls if "/pl." in u or u.endswith(
                "pl.jpg") or u.endswith("pl.png") or "_pl" in u]
            if pref:
                return pref[0]
            pref = [u for u in urls if "/ps." in u or u.endswith(
                "ps.jpg") or u.endswith("ps.png") or "_ps" in u]
            if pref:
                return pref[0]
            pref = [u for u in urls if not u.lower().endswith(
                ".gif") and "loading" not in u.lower()]
            if pref:
                return pref[0]
            return urls[0]
        cover_url = pick(normed)

        return {"detail_url": detail_url, "title": title, "performer": performer, "category": category, "cover": cover_url, "error": ""}
    except Exception as e:
        return {"detail_url": detail_url, "title": "", "performer": "", "category": "", "error": f"详情页解析失败: {e}"}


def _timed_fetch(code: str, idx: int, timeout: float):
    start = time.perf_counter()
    content, status, url, err = fetch_once(code, idx, timeout=timeout)
    elapsed = time.perf_counter() - start
    return content, status, url, err, elapsed


def setup_logging(log_file: str, also_stdout: bool = False):
    # 按你的需求：每次运行覆盖旧日志，而不是追加
    handlers = [logging.FileHandler(log_file, mode="w", encoding="utf-8")]
    if also_stdout:
        handlers.append(logging.StreamHandler(sys.stdout))
    logging.basicConfig(
        level=logging.INFO,
        format="%(message)s",
        handlers=handlers,
        force=True,  # 覆盖已有配置，保证写入我们指定的文件
    )


def _print_response_block(counter: int, total: int, code: str, status: int, url: str, elapsed: float, content: str, err: str):
    timestamp = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    header = (
        f"\n===== BEGIN RESPONSE [{counter}/{total}] code={code} status={status} time={elapsed:.3f}s at {timestamp} UTC =====\n"
        f"URL: {url}\n"
    )
    footer = f"\n===== END RESPONSE [{counter}/{total}] code={code} =====\n"
    if err:
        block = header + f"ERROR: {err}\n" + footer
    else:
        block = header + content + footer
    # 使用 logging 输出，FileHandler/StreamHandler 自带锁，线程安全
    logging.info(block)


def _print_extract_block(counter: int, total: int, code: str, status: int, url: str, elapsed: float, result: dict):
    timestamp = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    header = (
        f"\n===== BEGIN EXTRACT [{counter}/{total}] code={code} status={status} time={elapsed:.3f}s at {timestamp} UTC =====\n"
        f"Search URL: {url}\n"
    )
    detail_url = result.get("detail_url", "")
    title = result.get("title", "")
    performer = result.get("performer", "")
    category = result.get("category", "")
    cover = result.get("cover", "")
    error = result.get("error", "")
    body = (
        f"Detail URL: {detail_url}\n"
        f"Title: {title}\n"
        f"Performer: {performer}\n"
        f"Category: {category}\n"
        f"Cover: {cover}\n"
    )
    if error:
        body += f"ERROR: {error}\n"
    footer = f"===== END EXTRACT [{counter}/{total}] code={code} =====\n"
    logging.info(header + body + footer)


def load_codes_from_config(cfg) -> List[str]:
    codes: List[str] = []
    # 1) 直接从配置中的列表读取
    if isinstance(cfg.get("codes"), list):
        for c in cfg.get("codes"):
            s = str(c).strip()
            if s:
                codes.append(s)
    # 2) 可选：从文件读取
    codes_file = cfg.get("codes_file")
    if codes_file:
        try:
            with open(codes_file, "r", encoding="utf-8") as f:
                for line in f:
                    s = line.strip()
                    if s:
                        codes.append(s)
        except OSError as e:
            print(f"读取 codes 文件失败: {e}", file=sys.stderr)
    # 去重并保持顺序
    seen = set()
    deduped = []
    for c in codes:
        if c not in seen:
            seen.add(c)
            deduped.append(c)
    if not deduped:
        deduped = ["ABF-243"]
    return deduped


def main():
    cfg = CONFIG
    # 初始化日志
    log_file = cfg.get("log_file", "scraper.log")
    also_stdout = bool(cfg.get("also_stdout", False))
    setup_logging(log_file, also_stdout)
    logging.info("=== Scraper started ===")
    logging.info(f"CONFIG: {cfg}")

    codes = load_codes_from_config(cfg)
    repeat = int(cfg.get("repeat", 1))
    interval = float(cfg.get("interval", 0.0))
    workers = int(cfg.get("workers", 1))
    timeout = float(cfg.get("timeout", 15.0))

    if workers > 1:
        run_parallel(codes, repeat=max(1, repeat),
                     workers=workers, timeout=timeout)
    else:
        run_sequential(codes, repeat=max(1, repeat),
                       interval=max(0.0, interval), timeout=timeout)

    logging.info("=== Scraper finished ===")


if __name__ == "__main__":
    main()
