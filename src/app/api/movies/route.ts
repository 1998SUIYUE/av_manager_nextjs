import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";
import {
  getCachedMovieMetadata,
  updateMovieMetadataCache,
} from "@/lib/movieMetadataCache";
import { writeFile, readFile } from "fs/promises";
import { devWithTimestamp, prodWithTimestamp } from "@/utils/logger";
import { parseMovieFilename as parseMovieFilenameShared } from "@/lib/movieCodeParser";
import { HttpsProxyAgent } from "https-proxy-agent"; // 导入代理模块

// 支持的视频文件扩展名列表
const VIDEO_EXTENSIONS = [".mp4", ".mkv", ".avi", ".mov", ".wmv", ".webm"];

// 文件大小阈值：只处理大于此大小的视频文件 (100MB = 100 * 1024 * 1024 字节)
const FILE_SIZE_THRESHOLD = 100 * 1024 * 1024;

// 新增：每个网络请求之间的延迟（毫秒），用于控制爬取速度
const SCRAPE_DELAY_MS = 0; // 0秒延迟

// 本地代理地址
const PROXY_URL = "http://127.0.0.1:9890";
const AGENT = new HttpsProxyAgent(PROXY_URL);

// =============== DMM 抓取所需常量与辅助函数（从 scraper 对齐） ===============
const DMM_SEARCH_TEMPLATE =
  "https://www.dmm.co.jp/mono/dvd/-/search/=/searchstr={code}/";

const DEFAULT_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7,ja;q=0.6",
  Connection: "keep-alive",
  Referer: "https://www.dmm.co.jp/",
  "Upgrade-Insecure-Requests": "1",
  "sec-ch-ua": '"Google Chrome";v="123", "Chromium";v="123", "Not/A)Brand";v="24"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "Accept-Encoding": "gzip, deflate, br",
};

const DEFAULT_COOKIES: Record<string, string> = {
  age_check_done: "1",
  ckcy: "1",
  is_adult: "1",
};

function cookieHeaderFromObject(obj: Record<string, string>): string {
  return Object.entries(obj)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

// 日->中 “ジャンル”映射（完整从 scraper.py 迁移）
const GENRE_JA_TO_ZH: Record<string, string> = {
  "3P・4P": "3P/4P",
  "M女": "M女",
  "OL": "办公室女郎",
  "SF": "科幻",
  "SM": "SM",
  "Vシネマ": "V-影院",
  "おもちゃ": "玩具",
  "クスコ": "扩阴器",
  "お姉さん": "姐姐",
  "お姫様": "公主",
  "お嬢様・令嬢": "大小姐",
  "お風呂": "浴室",
  "くすぐり": "搔痒",
  "くノ一": "女忍者",
  "ごっくん": "吞精",
  "ふたなり": "扶他",
  "ぶっかけ": "颜射",
  "めがね": "眼镜",
  "アイドル・芸能人": "偶像/艺人",
  "アクション・格闘": "动作/格斗",
  "アクメ・オーガズム": "高潮/性高潮",
  "アスリート": "运动员",
  "アナル": "肛门",
  "アナルセックス": "肛交",
  "イタズラ": "恶作剧",
  "イラマチオ": "深喉",
  "インストラクター": "教练",
  "ウェイトレス": "女服务员",
  "エステ": "美容院",
  "オタク": "御宅族",
  "オナニー": "手淫",
  "カップル": "情侣",
  "カーセックス": "车内性爱",
  "キス・接吻": "吻",
  "キャバ嬢・風俗嬢": "夜总会女郎/风俗娘",
  "キャンギャル": "赛车女郎/车模",
  "ギャグ・コメディ": "搞笑喜剧",
  "クンニ": "舔阴",
  "ゲロ": "呕吐",
  "コスプレ": "角色扮演",
  "コンパニオン": "礼仪小姐",
  "ゴスロリ": "哥特洛丽塔",
  "サイコ・スリラー": "心理惊悚",
  "シスター": "修女",
  "シックスナイン": "69",
  "スカトロ": "嗜粪",
  "スチュワーデス": "空姐",
  "スパンキング": "打屁股",
  "スレンダー": "苗条",
  "スワッピング・夫婦交換": "换妻",
  "セクシー": "性感",
  "セレブ": "名人",
  "セーラー服": "水手服",
  "ダンス": "舞蹈",
  "チアガール": "啦啦队长",
  "チャイナドレス": "旗袍",
  "ツンデレ": "傲娇",
  "ディルド": "假阳具",
  "デカチン・巨根": "大鸡巴/巨根",
  "デビュー作品": "处女作",
  "ドキュメンタリー": "纪录片",
  "ドラマ": "戏剧",
  "ドール": "玩偶",
  "ナンパ": "搭讪",
  "ニーソックス": "过膝袜",
  "ネコミミ・獣系": "猫耳/兽系",
  "ノーパン": "不穿内裤",
  "ノーブラ": "不穿胸罩",
  "ハーレム": "后宫",
  "バイブ": "振动器",
  "バスガイド": "巴士导游",
  "バニーガール": "兔女郎",
  "パイズリ": "乳交",
  "パンスト・タイツ": "连裤袜/紧身裤",
  "パンチラ": "内裤走光",
  "ビジネススーツ": "商务套装",
  "ビッチ": "辣妹",
  "ファンタジー": "幻想",
  "フェラ": "口交",
  "ホテル": "酒店",
  "ボディコン": "紧身裙",
  "ボンテージ": "束缚",
  "ミニスカ": "超短裙",
  "ミニスカポリス": "迷你裙警察",
  "ミニ系": "娇小系",
  "メイド": "女仆",
  "ランジェリー": "内衣",
  "ルーズソックス": "泡泡袜",
  "レオタード": "紧身衣",
  "レースクィーン": "赛车皇后",
  "ローション・オイル": "润滑液/油",
  "不倫": "不伦",
  "中出し": "中出",
  "主観": "主观视角",
  "乱交": "乱交",
  "人妻・主婦": "人妻/主妇",
  "企画": "企划",
  "体操着・ブルマ": "体操服/运动短裤",
  "処女": "处女",
  "制服": "制服",
  "即ハメ": "立即性交",
  "受付嬢": "接待员",
  "和服・浴衣": "和服/浴衣",
  "変身ヒロイン": "变身女主角",
  "女上司": "女上司",
  "女医": "女医生",
  "女子アナ": "女主播",
  "女子大生": "女大学生",
  "女子校生": "女高中生",
  "女将・女主人": "老板娘/女主人",
  "女戦士": "女战士",
  "女捜査官": "女调查员",
  "女教師": "女教师",
  "女王様": "女王",
  "妄想": "妄想",
  "妊婦": "孕妇",
  "姉・妹": "姐妹",
  "娘・養女": "女儿/养女",
  "孕ませ": "令其怀孕",
  "学園もの": "校园",
  "学生服": "校服",
  "家庭教師": "家庭教师",
  "寝取り・寝取られ・NTR": "NTR",
  "小柄": "娇小",
  "尻フェチ": "臀部恋物癖",
  "局部アップ": "私处特写",
  "巨乳": "巨乳",
  "巨乳フェチ": "巨乳控",
  "巨尻": "巨尻",
  "巫女": "巫女",
  "幼なじみ": "青梅竹马",
  "復刻": "复刻",
  "恋愛": "恋爱",
  "手コキ": "手交",
  "拘束": "束缚",
  "拷問": "拷问",
  "指マン": "指交",
  "放尿・お漏らし": "放尿/失禁",
  "放置": "放置",
  "旅行": "旅行",
  "日焼け": "日晒",
  "早漏": "早泄",
  "時間停止": "时间停止",
  "未亡人": "寡妇",
  "格闘家": "格斗家",
  "極道・任侠": "黑道/侠义",
  "残虐表現": "残忍描写",
  "母乳": "母乳",
  "水着": "泳装",
  "汗だく": "汗流浃背",
  "浣腸": "灌肠",
  "淫乱・ハード系": "淫乱/重口",
  "淫語": "淫语",
  "温泉": "温泉",
  "潮吹き": "潮吹",
  "熟女": "熟女",
  "男の潮吹き": "男性潮吹",
  "異物挿入": "异物插入",
  "病院・クリニック": "医院/诊所",
  "痴女": "痴女",
  "白目・失神": "翻白眼/昏厥",
  "盗撮・のぞき": "偷拍/偷窥",
  "監禁": "监禁",
  "看護婦・ナース": "护士",
  "着エロ": "情趣内衣",
  "秘書": "秘书",
  "童貞": "童贞",
  "競泳・スクール水着": "竞速泳衣/校园泳衣",
  "筋肉": "肌肉",
  "素人": "素人",
  "縛り・緊縛": "捆绑/紧缚",
  "罵倒": "辱骂",
  "美乳": "美乳",
  "美少女": "美少女",
  "羞恥": "羞耻",
  "義母": "继母/婆婆",
  "脚フェチ": "恋足癖",
  "脱糞": "脱粪",
  "花嫁": "新娘",
  "若妻・幼妻": "少妻/幼妻",
  "蝋燭": "蜡烛",
  "裸エプロン": "裸体围裙",
  "覆面・マスク": "蒙面/面具",
  "触手": "触手",
  "貧乳・微乳": "贫乳",
  "超乳": "超乳",
  "足コキ": "足交",
  "軟体": "身体柔软",
  "辱め": "凌辱",
  "近親相姦": "近亲相奸",
  "逆ナン": "逆搭讪",
  "部下・同僚": "部下/同事",
  "部活・マネージャー": "社团活动/经理",
  "野外・露出": "户外/露出",
  "長身": "高个子",
  "電マ": "电动按摩器",
  "顔射": "颜射",
  "顔面騎乗": "坐脸",
  "飲尿": "饮尿",
  "騎乗位": "骑乘位",
  "鬼畜": "鬼畜",
  "魔法少女": "魔法少女",
  "黒人男優": "黑人演员",
  "鼻フック": "鼻钩",
}
function normalizeGenreKey(s: string): string {
  return (s || "")
    .trim()
    .replace(/\u3000/g, "") // 去除全角空格
    .replace(/\s+/g, "") // 去除所有半角空白
    .replace(/[\(\)]/g, (m) => (m === '(' ? '（' : '）')) // 半角括号 -> 全角括号
    .replace(/[･]/g, "・") // 半角中点 -> 全角中点
    .replace(/[：:]/g, ":"); // 统一冒号
}

const GENRE_JA_TO_ZH_NORMALIZED: Record<string, string> = Object.fromEntries(
  Object.entries(GENRE_JA_TO_ZH).map(([k, v]) => [normalizeGenreKey(k), v])
);

function translateGenresToZh(genres: string[]): string[] {
  const mapped = genres
    .map((g) => GENRE_JA_TO_ZH_NORMALIZED[normalizeGenreKey(g)])
    .filter((v): v is string => Boolean(v)); // 仅保留有映射的条目
  // 去重，保持顺序
  const seen = new Set<string>();
  return mapped.filter((c) => (seen.has(c) ? false : (seen.add(c), true)));
}

function makeSearchUrl(code: string): string {
  return DMM_SEARCH_TEMPLATE.replace(
    "{code}",
    String(code || "").trim().replace(/\s+/g, "")
  );
}

function absUrl(u: string, base: string): string {
  try {
    return new URL(u, base).toString();
  } catch {
    return u || "";
  }
}

function pickCover(urls: string[]): string {
  if (!urls || urls.length === 0) return "";
  const pref1 = urls.find(
    (u) => /[\\\/]pl\./.test(u) || /[_-]pl\./.test(u) || u.endsWith("pl.jpg") || u.endsWith("pl.png")
  );
  if (pref1) return pref1;
  const pref2 = urls.find(
    (u) => /[\\\/]ps\./.test(u) || /[_-]ps\./.test(u) || u.endsWith("ps.jpg") || u.endsWith("ps.png")
  );
  if (pref2) return pref2;
  const pref3 = urls.find(
    (u) => !u.toLowerCase().endsWith(".gif") && !/loading/i.test(u)
  );
  if (pref3) return pref3;
  return urls[0];
}

function isAdultGateHtml(html: string): boolean {
  const low = (html || "").toLowerCase();
  return (
    low.includes("adult") ||
    low.includes("r18") ||
    low.includes("年齢確認") ||
    low.includes("このサイトはアダルト")
  );
}

function getFirstDetailLink($: cheerio.CheerioAPI, base: string): string {
  let a = $("#list > li:nth-child(1) > div > p.tmb > a");
  if (!a || a.length === 0) a = $("#list li div p.tmb a").first();
  if (!a || a.length === 0) a = $("p.tmb a").first();
  const href = a && a.attr("href");
  if (!href) return "";
  return absUrl(href.trim(), base);
}


// 定义电影文件接口
interface MovieFile {
  filename: string;
  path: string;
  absolutePath: string;
  size: number;
  sizeInGB: number;
  extension: string;
  title: string;
  displayTitle?: string;
  kinds?: string[];
  year?: string;
  modifiedAt: number;
  code?: string;
  coverUrl?: string | null;
  actress?: string | null;
}

/**
 * 解析电影文件名
 */
function parseMovieFilename(filename: string): {
  title: string;
  year?: string;
  code?: string;
} {
  return parseMovieFilenameShared(filename);
}

async function fetchCoverUrlFromJavbus(code: string, baseUrl: string) {
  prodWithTimestamp(
    `[fetchCoverUrl] [Javbus] 开始处理番号: ${code}`
  );
  try {
    const res = await axios.get(`https://www.javbus.com/search/${code}`, {
      headers: {
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "accept-encoding": "gzip, deflate, br, zstd",
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
        "cache-control": "max-age=0",
        cookie: "existmag=mag",
        priority: "u=0, i",
        referer: "https://www.javbus.com/",
        "sec-ch-ua":
          '"Google Chrome";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "same-origin",
        "sec-fetch-user": "?1",
        "upgrade-insecure-requests": "1",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
      },
      timeout: 15000,
      httpsAgent: AGENT,
      httpAgent: AGENT,
    });

    const $0 = cheerio.load(res.data);
    const nexturl = $0("#waterfall > div > a").attr('href') || ""
    if (!nexturl) {
        prodWithTimestamp(`[fetchCoverUrl] [Javbus] 未找到详情链接: ${code}`);
        return { coverUrl: null, title: null, actress: null, kinds: [] };
    }

    const res1 = await axios.get(nexturl, {
      headers: {
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "accept-encoding": "gzip, deflate, br, zstd",
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
        "cache-control": "max-age=0",
        cookie: "existmag=mag",
        priority: "u=0, i",
        referer: "https://www.javbus.com/",
        "sec-ch-ua":
          '"Google Chrome";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "same-origin",
        "sec-fetch-user": "?1",
        "upgrade-insecure-requests": "1",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
      },
      timeout: 15000,
      httpsAgent: AGENT,
      httpAgent: AGENT,
    });
    const $ = cheerio.load(res1.data);
    let coverUrl =
      "https://www.javbus.com" +
        $(
          "body > div.container > div.row.movie > div.col-md-9.screencap > a > img"
        ).attr("src") || "";
    let title = $("body > div.container > h3").text() || "";
    let actress =
      $(
        "body > div.container > div.row.movie > div.col-md-3.info > p:last-child > span > a"
      ).text() || "";
    let blocked = [
      "高畫質",
      "DMM獨家",
      "單體作品",
      "數位馬賽克",
      "多選提交",
      "4K",
      "フルハイビジョン(FHD)",
      "MGSだけのおまけ映像付き",
      "アクメ・オーガズム",
    ];

    let kinds_index = $(
      "body > div.container > div.row.movie > div.col-md-3.info > p.header"
    );
    let kinds = kinds_index
      .next("p")
      .text()
      .trim()
      .split(/\s+/)
      .map((tag) => tag.trim())
      .filter(
        (tag) => tag && !blocked.includes(tag) && !/[\u30A0-\u30FF]/.test(tag)
      );

    if (coverUrl) {
      devWithTimestamp(`[fetchCoverUrl] [Javbus] 原始封面URL: ${coverUrl}`);
      try {
        const proxyApiUrl = `${baseUrl}/api/image-proxy?url=${encodeURIComponent(
          coverUrl
        )}&code=${encodeURIComponent(code)}`;
        devWithTimestamp(
          `[fetchCoverUrl] [Javbus] 调用 image-proxy: ${proxyApiUrl}`
        );
        const imageProxyResponse = await fetch(proxyApiUrl);
        if (imageProxyResponse.ok) {
          const proxyData = await imageProxyResponse.json();
          if (
            proxyData.imageUrl &&
            !proxyData.imageUrl.includes("placeholder-image.svg")
          ) {
            coverUrl = proxyData.imageUrl;
            devWithTimestamp(
              `[fetchCoverUrl] [Javbus] 封面已通过 image-proxy 缓存到本地: ${coverUrl}`
            );
          } else {
            devWithTimestamp(
              `[fetchCoverUrl] [Javbus] image-proxy 返回占位符或无效图片，保持原始URL: ${coverUrl}`
            );
            coverUrl = "";
          }
        } else {
          devWithTimestamp(
            `[fetchCoverUrl] [Javbus] 调用 image-proxy 失败: ${imageProxyResponse.statusText}`
          );
        }
      } catch (proxyError) {
        devWithTimestamp(
          `[fetchCoverUrl] [Javbus] 调用 image-proxy 发生错误: ${proxyError}`
        );
      }
    }

    if (coverUrl || title || actress) {
      const finalCoverUrl =
        coverUrl && !coverUrl.includes("placeholder-image.svg")
          ? coverUrl
          : null;
      prodWithTimestamp(
        `[fetchCoverUrl] [Javbus] 番号 ${code} 处理完成 - 封面: ${finalCoverUrl}, 标题: ${title}, 女优: ${actress}`
      );
      await updateMovieMetadataCache(
        code,
        finalCoverUrl,
        title,
        actress,
        kinds
      );
      return { coverUrl: finalCoverUrl, title, actress, kinds };
    } else {
      prodWithTimestamp(
        `[fetchCoverUrl] [Javbus] 番号 ${code} 处理失败 - 未获取到任何元数据`
      );
       return { coverUrl: null, title: null, actress: null, kinds: [] };
    }
  } catch (e) {
    prodWithTimestamp(`[fetchCoverUrl] [Javbus] 处理番号: ${code}, 失败${e}`);
    return { coverUrl: null, title: null, actress: null, kinds: [] };
  }
}

/**
 * 使用 DMM 抓取电影封面和元数据（对齐 scraper 逻辑）。
 * @param code - 番号/关键字
 * @returns { coverUrl, title, actress, kinds }
 */
async function fetchCoverUrl(code: string, baseUrl: string) {
  prodWithTimestamp(`[fetchCoverUrl] [DMM] 开始处理番号: ${code}`);
  try {
    const searchUrl = makeSearchUrl(code);
    const headers = { ...DEFAULT_HEADERS, Cookie: cookieHeaderFromObject(DEFAULT_COOKIES) };

    // 1) 搜索页
    const res = await axios.get(searchUrl, {
      headers,
      timeout: 15000,
      httpsAgent: AGENT,
      httpAgent: AGENT,
      maxRedirects: 5,
      validateStatus: (s) => s >= 200 && s < 400,
    });
    const html = res.data || "";
    if (isAdultGateHtml(html)) {
      devWithTimestamp(`[fetchCoverUrl] [DMM] 搜索页可能命中成年确认页，需要更好的 Cookie 或代理`);
    }

    const $ = cheerio.load(html);
    const detailUrl = getFirstDetailLink($, searchUrl);
    if (!detailUrl) {
      // No detail link found, throw to fallback
      throw new Error(`[DMM] 未找到详情链接: ${code}`);
    }

    // 2) 详情页
    const resDetail = await axios.get(detailUrl, {
      headers,
      timeout: 15000,
      httpsAgent: AGENT,
      httpAgent: AGENT,
      maxRedirects: 5,
      validateStatus: (s) => s >= 200 && s < 400,
    });
    const dhtml = resDetail.data || "";
    if (isAdultGateHtml(dhtml)) {
      devWithTimestamp(`[fetchCoverUrl] [DMM] 详情页可能命中成年确认页`);
    }

    const d$ = cheerio.load(dhtml);

    // 标题与女优
    const title = (d$("#title").text() || "").trim();
    const actress = (d$("#performer").text() || "").trim();

    // If no title, it's a failure, so fallback.
    if (!title) {
        throw new Error(`[DMM] 未找到标题: ${code}`);
    }

    // ジャンル -> kinds（中文）
    let kinds: string[] = [];
    const tds = d$("td.nw");
    let labelTd: any | null = null;
    tds.each((i, el) => {
      const txt = d$(el).text().trim().replace("：", ":");
      if (txt.includes("ジャンル")) {
        labelTd = el as any;
        return false;
      }
    });
    if (labelTd) {
      const valueTd = d$(labelTd).next("td");
      if (valueTd && valueTd.length > 0) {
        const raw = valueTd
          .find("a")
          .map((i, a) => d$(a).text().trim())
          .get();
        const dedup = Array.from(new Set(raw.filter(Boolean)));
        kinds = translateGenresToZh(dedup);
      }
    }

    // 封面候选
    const coverCandidates: string[] = [];
    const metaOg = d$('meta[property="og:image"]').attr('content');
    if (metaOg) coverCandidates.push(absUrl(metaOg.trim(), detailUrl));

    const coverEl = d$("#fn-modalSampleImage__image");
    if (coverEl && coverEl.length) {
      const attrs = ["data-src", "data-original", "data-lazy", "data-srcset", "src"] as const;
      for (const attr of attrs) {
        const val = coverEl.attr(attr);
        if (val) {
          let v = val.trim();
          if (attr === "data-srcset") v = v.split(/\s+/)[0].replace(/,+$/, "");
          coverCandidates.push(absUrl(v, detailUrl));
        }
      }
      const parentA = coverEl.parent("a");
      if (parentA && parentA.length) {
        const href = parentA.attr("href");
        if (href) coverCandidates.push(absUrl(href.trim(), detailUrl));
      }
    }

    d$("img").each((i, img) => {
      const attrs = ["data-src", "data-original", "src"] as const;
      for (const attr of attrs) {
        const val = d$(img).attr(attr);
        if (!val) continue;
        const low = val.toLowerCase();
        if ((low.includes("pics.dmm.co.jp") || low.includes("p.dmm.co.jp")) &&
            (low.includes("/mono/movie/") || low.includes("/digital/")) &&
            !(low.includes("loading") && low.endsWith(".gif"))) {
          coverCandidates.push(absUrl(val.trim(), detailUrl));
        }
      }
    });

    const uniq = Array.from(new Set(coverCandidates.filter(Boolean)));
    let coverUrl = pickCover(uniq);

    // 处理封面图片代理
    if (coverUrl) {
      try {
        const proxyApiUrl = `${baseUrl}/api/image-proxy?url=${encodeURIComponent(coverUrl)}&code=${encodeURIComponent(code)}`;
        const imageProxyResponse = await fetch(proxyApiUrl);
        if (imageProxyResponse.ok) {
          const proxyData = await imageProxyResponse.json();
          if (proxyData.imageUrl && !proxyData.imageUrl.includes("placeholder-image.svg")) {
            coverUrl = proxyData.imageUrl;
          }
        }
      } catch (proxyError) {
        devWithTimestamp(`[fetchCoverUrl] [DMM] 调用 image-proxy 发生错误: ${proxyError}`);
      }
    }

    const finalCoverUrl = coverUrl && !coverUrl.includes("placeholder-image.svg") ? coverUrl : null;

    // 更新缓存并返回
    await updateMovieMetadataCache(code, finalCoverUrl, title || null, actress || null, kinds);
    prodWithTimestamp(
      `[fetchCoverUrl] [DMM] 番号 ${code} 完成 - 封面: ${finalCoverUrl}, 标题: ${title}, 女优: ${actress}, 标签数: ${kinds.length}`
    );
    return { coverUrl: finalCoverUrl, title, actress, kinds };
  } catch (e) {
    prodWithTimestamp(`[fetchCoverUrl] [DMM] 处理番号 ${code} 失败: ${e}. 尝试备用源 Javbus.`);
    return await fetchCoverUrlFromJavbus(code, baseUrl);
  }
}

/**
 * 处理扫描到的电影文件列表，获取其封面信息并检测重复文件。
 * @param movieFiles 扫描到的原始电影文件数组。
 * @param baseUrl 当前请求的基础URL，用于构建image-proxy的绝对路径。
 * @returns 包含封面信息和去重后的电影文件数组。
 */
async function processMovieFiles(movieFiles: MovieFile[], baseUrl: string) {
  const startTime = Date.now(); // 开始计时

  // 内存监控函数
  function checkMemoryUsage() {
    const memUsage = process.memoryUsage();
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
    const rssMB = memUsage.rss / 1024 / 1024;

    devWithTimestamp(
      `[processMovieFiles] 内存使用 - Heap: ${heapUsedMB.toFixed(
        2
      )}MB, RSS: ${rssMB.toFixed(2)}MB`
    );

    // 如果内存使用超过800MB，触发垃圾回收
    if (rssMB > 4000) {
      devWithTimestamp(
        `[processMovieFiles] 警告: 内存使用过高 (${rssMB.toFixed(
          2
        )}MB)，触发垃圾回收`
      );
      if (global.gc) {
        global.gc();
      }
      return false; // 返回false表示内存压力大
    }
    return true;
  }

  // 根据文件最后修改时间降序排序电影文件 (最新的在前)
  const sortedMovies = movieFiles.sort((a, b) => b.modifiedAt - a.modifiedAt);

  // 限制处理文件数量，避免一次性处理过多文件导致系统崩溃
  const maxFilesToProcess = 99999; // 合理的处理数量
  const limitedMovies = sortedMovies.slice(0, maxFilesToProcess);

  if (sortedMovies.length > maxFilesToProcess) {
    devWithTimestamp(
      `[processMovieFiles] 警告: 发现 ${sortedMovies.length} 个文件，但只处理前 ${maxFilesToProcess} 个以避免系统过载`
    );
  }

  // 使用信号量 (Semaphore) 控制并发的网络请求数量，避免同时发送过多请求
  const concurrencyLimit = 50; // 降低并发数到3，减少被屏蔽风险
  const semaphore = new Semaphore(concurrencyLimit);

  // 启动内存监控
  const memoryCheckInterval = setInterval(checkMemoryUsage, 5000);

  // 批处理大小
  const batchSize = 50;

  // 分批处理电影文件，避免一次性处理过多导致内存溢出
  const processedMovies: MovieFile[] = [];

  // 按照用户逻辑：检查meta缓存，所有信息都不为null才算完整缓存
  const cachedMovies: MovieFile[] = [];
  const needsFetchMovies: MovieFile[] = [];

  for (const movie of limitedMovies) {
    if (movie.code) {
      try {
        const cachedMetadata = await getCachedMovieMetadata(
          movie.code
        );

        // 检查缓存是否完整：所有关键信息都不为null
        const hasCompleteCache =
          cachedMetadata &&
          cachedMetadata.coverUrl !== null &&
          cachedMetadata.title !== "";

        if (hasCompleteCache) {
          // 缓存完整，直接使用缓存数据
          // devWithTimestamp("缓存完整，直接使用缓存数据")
          const eloData =
            cachedMetadata.elo !== undefined
              ? {
                  elo: cachedMetadata.elo,
                  matchCount: cachedMetadata.matchCount || 0,
                  winCount: cachedMetadata.winCount || 0,
                  drawCount: cachedMetadata.drawCount || 0,
                  lossCount: cachedMetadata.lossCount || 0,
                  winRate: cachedMetadata.matchCount
                    ? (cachedMetadata.winCount || 0) / cachedMetadata.matchCount
                    : 0,
                }
              : {};

          cachedMovies.push({
            ...movie,
            coverUrl: cachedMetadata.coverUrl,
            displayTitle: cachedMetadata.title || undefined,
            actress: cachedMetadata.actress,
            kinds: cachedMetadata.kinds,
            ...eloData,
          });

          // devWithTimestamp(`[processMovieFiles] ✅ ${movie.code} 缓存完整，直接使用`);
        } else {
          // 缓存不存在或信息不完整，需要网络请求
          needsFetchMovies.push(movie);
          // devWithTimestamp(`[processMovieFiles] 🔄 ${movie.code} 缓存不完整，需要网络请求`);
        }
      } catch {
        needsFetchMovies.push(movie);
        devWithTimestamp(
          `[processMovieFiles] ❌ ${movie.code} 缓存读取失败，需要网络请求`
        );
      }
    } else {
      // 没有番号的电影直接添加
      cachedMovies.push(movie);
    }
  }

  // 先添加缓存的电影
  processedMovies.push(...cachedMovies);

  // 按照用户逻辑：不需要快速返回策略，直接处理所有电影
  prodWithTimestamp(
    `[processMovieFiles] 缓存命中 ${cachedMovies.length}个, 需要网络获取 ${needsFetchMovies.length}个`
  );

  try {
    // 只处理需要网络请求的文件
    for (let i = 0; i < needsFetchMovies.length; i += batchSize) {
      const batch = needsFetchMovies.slice(i, i + batchSize);
      devWithTimestamp(
        `[processMovieFiles] 处理网络请求批次 ${
          Math.floor(i / batchSize) + 1
        }/${Math.ceil(needsFetchMovies.length / batchSize)}, 文件数: ${
          batch.length
        }`
      );

      // 检查内存使用情况
      if (!checkMemoryUsage()) {
        devWithTimestamp(`[processMovieFiles] 内存压力过大，暂停处理`);
        break;
      }

      // 处理当前批次
      const batchResults = await Promise.allSettled(
        batch.map(async (movie) => {
          // 在发送网络请求前，先通过信号量获取许可，控制并发
          return semaphore.acquire().then(async (release) => {
            try {
              let coverUrl = null;
              let title = null;
              let actress = null;
              let eloData: {
                elo: number;
                matchCount: number;
                winCount: number;
                drawCount: number;
                lossCount: number;
                winRate: number;
              } | null = null;

              // 如果电影文件有番号，则尝试获取其封面和标题
              if (movie.code) {
                try {
                  // 在发送网络请求前增加延迟，防止请求过快被网站屏蔽
                  await new Promise((resolve) =>
                    setTimeout(resolve, SCRAPE_DELAY_MS)
                  );

                  const result = await retryWithTimeout(
                    () => fetchCoverUrl(movie.code!, baseUrl), // 直接网络请求
                    1, // 减少重试次数从2次到1次
                    30000 // 减少超时时间从5秒到1秒
                  );
                  if (result) {
                    coverUrl = result.coverUrl;
                    title = result.title;
                    actress = result.actress;
                    // 合并kinds数据
                    movie.kinds = result.kinds || []; // 将获取到的kinds合并到movie对象中
                  }

                  // 网络请求完成后，从缓存中获取评分数据（因为updateMovieMetadataCache可能包含评分信息）
                  try {
                    const updatedCachedMetadata = await getCachedMovieMetadata(
                      movie.code!
                    );
                    if (
                      updatedCachedMetadata &&
                      updatedCachedMetadata.elo !== undefined
                    ) {
                      eloData = {
                        elo: updatedCachedMetadata.elo,
                        matchCount: updatedCachedMetadata.matchCount || 0,
                        winCount: updatedCachedMetadata.winCount || 0,
                        drawCount: updatedCachedMetadata.drawCount || 0,
                        lossCount: updatedCachedMetadata.lossCount || 0,
                        winRate: updatedCachedMetadata.matchCount
                          ? (updatedCachedMetadata.winCount || 0) /
                            updatedCachedMetadata.matchCount
                          : 0,
                      };
                      devWithTimestamp(
                        `[processMovieFiles] ✅ ${movie.code} 获取到评分数据: Elo=${eloData.elo}`
                      );
                    }
                  } catch (eloError) {
                    devWithTimestamp(
                      `[processMovieFiles] ⚠️ ${movie.code} 获取评分数据失败:`,
                      eloError
                    );
                  }
                } catch (error) {
                  devWithTimestamp(
                    `处理电影 ${movie.filename} 时发生错误:`,
                    error
                  );
                }
              }

              // 返回包含所有元数据的电影对象（包括评分数据）
              return {
                ...movie,
                coverUrl,
                displayTitle: title || movie.title || movie.filename,
                actress,
                // kinds数据已在上面合并到movie对象中，这里不再需要单独添加
                // 添加评分数据
                ...(eloData && {
                  elo: eloData.elo,
                  matchCount: eloData.matchCount,
                  winCount: eloData.winCount,
                  drawCount: eloData.drawCount,
                  lossCount: eloData.lossCount,
                  winRate: eloData.winRate,
                }),
              };
            } finally {
              release(); // 释放信号量，允许下一个请求执行
            }
          });
        })
      );

      // 收集成功的结果
      batchResults.forEach((result, index) => {
        if (result.status === "fulfilled") {
          processedMovies.push(result.value);
        } else {
          devWithTimestamp(`[processMovieFiles] 处理失败:`, result.reason);
          processedMovies.push(batch[index]); // 添加原始数据作为后备
        }
      });
    }
  } finally {
    // 清理内存监控
    clearInterval(memoryCheckInterval);
  }

  // 检测并记录重复的电影文件 (基于电影番号)
  const duplicateMovies: MovieFile[] = [];
  const seenPaths = new Set<string>(); // 用于存储已处理过的电影番号 (小写)

  movieFiles.forEach((movie) => {
    if (movie.code) {
      if (seenPaths.has(movie.code.toLocaleLowerCase())) {
        duplicateMovies.push(movie);
      } else {
        seenPaths.add(movie.code.toLocaleLowerCase());
      }
    }
  });

  // 打印重复文件信息
  if (duplicateMovies.length > 0) {
    console.log("检测到重复文件:");
    duplicateMovies.forEach((movie) => {
      console.log(
        `重复文件: \n  - 文件名: ${movie.filename}\n  - 路径: ${movie.path}\n  - 大小: ${movie.sizeInGB}GB;\n`
      );
    });
    console.log(`总共检测到 ${duplicateMovies.length} 个重复文件`);
  } else {
    console.log("没有检测到重复文件");
  }
  // 性能统计
  const endTime = Date.now();
  const totalTime = (endTime - startTime) / 1000; // 转换为秒
  const avgTimePerMovie = totalTime / processedMovies.length;

  devWithTimestamp(`[processMovieFiles] 🎯 性能统计:`);
  devWithTimestamp(`  ⏱️  总处理时间: ${totalTime.toFixed(2)}秒`);
  devWithTimestamp(`  📊 处理文件数: ${processedMovies.length}个`);
  devWithTimestamp(`  ⚡ 平均每个文件: ${avgTimePerMovie.toFixed(2)}秒`);
  devWithTimestamp(
    `  💾 缓存命中率: ${Math.round(
      (cachedMovies.length / limitedMovies.length) * 100
    )}%`
  );
  devWithTimestamp(`  🌐 网络请求数: ${needsFetchMovies.length}个`);

  console.log("项目路径: http://localhost:3000");
  return processedMovies;
}

/**
 * 信号量类，用于控制异步操作的并发数量。
 * @param permits 允许同时进行的并发操作数量。
 */
class Semaphore {
  private permits: number; // 当前可用的许可数量
  private queue: Array<() => void>; // 等待获取许可的 Promise 队列

  constructor(permits: number) {
    this.permits = permits;
    this.queue = [];
  }

  /**
   * 尝试获取一个许可。如果当前没有可用许可，则将请求加入队列等待。
   * @returns 一个 Promise，在获取到许可后 resolve 一个释放函数。
   */
  acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      // 释放函数，用于在操作完成后归还许可
      const release = () => {
        this.permits++; // 归还一个许可
        this.checkQueue(); // 检查队列中是否有等待的请求
      };

      if (this.permits > 0) {
        this.permits--; // 消耗一个许可
        resolve(release); // 立即解决 Promise 并提供释放函数
      } else {
        // 如果没有可用许可，将当前请求的 resolve 函数加入队列
        this.queue.push(() => {
          this.permits--; // 获取许可
          resolve(release); // 解决 Promise
        });
      }
    });
  }

  /**
   * 检查队列并执行等待中的请求（如果有可用许可）。
   */
  private checkQueue() {
    try {
      // 如果队列中有等待的请求且有可用许可，则执行队列中的下一个请求
      if (this.queue.length > 0 && this.permits > 0) {
        const next = this.queue.shift(); // 取出队列中的第一个请求
        if (next) {
          next(); // 执行请求
        } else {
          devWithTimestamp(
            "checkQueue: Retrieved null or undefined from queue"
          );
        }
      }
    } catch (error) {
      devWithTimestamp(
        "checkQueue: Error occurred while processing queue",
        error
      );
    }
  }
}

/**
 * 带重试和超时的函数装饰器。
 * @param fn 要执行的异步函数。
 * @param maxRetries 最大重试次数 (默认: 1)。
 * @param timeout 每次尝试的超时时间 (毫秒，默认: 3000)。
 * @returns 原始函数的 Promise 结果。
 * @throws 如果所有重试都失败，则抛出最后一个错误。
 */
async function retryWithTimeout<T>(
  fn: () => Promise<T>,
  maxRetries: number = 1, // 减少重试次数
  timeout: number = 3000 // 减少超时时间
): Promise<T> {
  let lastError: Error | null = null;

  // 循环进行重试
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // 使用 Promise.race 实现超时逻辑：fn() 和一个超时 Promise 竞争
      return await Promise.race([
        fn(),
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error("请求超时")), timeout)
        ),
      ]);
    } catch (error) {
      devWithTimestamp(`第 ${attempt} 次尝试失败:`, error);
      lastError = error as Error;

      // 如果是网络错误或超时，快速失败

      // 检查是否是403错误，如果是则立即停止
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("BLOCKED_403")) {
        devWithTimestamp(`检测到403屏蔽，立即停止重试: ${errorMessage}`);
        break; // 立即停止，不再重试
      }

      // 短暂延迟后重试
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 1000)); // 增加重试延迟
      }
    }
  }

  // 所有重试尝试均失败，抛出最后一个错误
  throw lastError || new Error("请求失败");
}

/**
 * 遍历指定目录下的所有文件，找到满足条件的视频文件，提取视频文件的元数据。
 * @param directoryPath 目录的绝对路径。
 * @returns 一个 Promise，resolve 时携带一个 MovieFile 数组。
 */
async function scanMovieDirectory(directoryPath: string, baseUrl: string) {
  devWithTimestamp(`[scanMovieDirectory] 开始扫描目录: ${directoryPath}`);

  // 添加详细的目录扫描调试信息
  devWithTimestamp(`[scanMovieDirectory] 详细调试信息:`);
  devWithTimestamp(`[scanMovieDirectory] - 原始路径: "${directoryPath}"`);
  devWithTimestamp(`[scanMovieDirectory] - 路径长度: ${directoryPath.length}`);
  devWithTimestamp(`[scanMovieDirectory] - 路径类型: ${typeof directoryPath}`);
  devWithTimestamp(
    `[scanMovieDirectory] - 原始路径是否存在: ${fs.existsSync(directoryPath)}`
  );

  // 处理路径中的引号和反斜杠，确保路径格式正确
  const cleanPath = directoryPath.replace(/['"]/g, "").replace(/\\/g, "/");
  devWithTimestamp("[scanMovieDirectory] 清理后的路径:", cleanPath);
  devWithTimestamp(
    `[scanMovieDirectory] - 清理后路径长度: ${cleanPath.length}`
  );
  devWithTimestamp(
    `[scanMovieDirectory] - 清理后路径是否存在: ${fs.existsSync(cleanPath)}`
  );

  // 尝试不同的路径格式
  const alternativePaths = [
    directoryPath,
    cleanPath,
    directoryPath.replace(/\\/g, "/"),
    directoryPath.replace(/\//g, "\\"),
    path.normalize(directoryPath),
    path.resolve(directoryPath),
  ];

  devWithTimestamp(`[scanMovieDirectory] 尝试不同路径格式:`);
  alternativePaths.forEach((altPath, index) => {
    devWithTimestamp(
      `[scanMovieDirectory] - 格式${
        index + 1
      }: "${altPath}" 存在: ${fs.existsSync(altPath)}`
    );
  });
  const movieFiles: MovieFile[] = []; // 用于存储扫描到的电影文件信息

  /**
   * 递归遍历目录的内部函数。
   * @param currentPath 当前要扫描的目录的绝对路径。
   */
  async function scanDirectory(currentPath: string) {
    devWithTimestamp(`[scanDirectory] 开始扫描子目录: ${currentPath}`);

    // 规范化当前路径，确保跨平台兼容性
    const normalizedPath = path.normalize(currentPath);

    try {
      // 读取当前目录的内容 (文件和子目录)
      devWithTimestamp(`[scanDirectory] 读取目录内容: ${normalizedPath}`);
      const files = await fs.promises.readdir(normalizedPath);
      devWithTimestamp(
        `[scanDirectory] 目录 ${normalizedPath} 中发现 ${files.length} 个条目`
      );

      // 遍历目录中的每个条目
      for (const file of files) {
        const fullPath = path.join(normalizedPath, file);
        // devWithTimestamp(`[scanDirectory] 处理文件/目录: ${fullPath}`);

        try {
          // 获取文件或目录的统计信息 (例如：是否是目录，文件大小，修改时间等)
          // devWithTimestamp(`[scanDirectory] 获取文件/目录 stat: ${fullPath}`);
          const stats = await fs.promises.stat(fullPath);
          // devWithTimestamp(`[scanDirectory] 完成 stat: ${fullPath}, isDirectory: ${stats.isDirectory()}`);

          if (stats.isDirectory()) {
            // 如果是目录，则递归调用自身，继续扫描子目录
            devWithTimestamp(
              `[scanDirectory] 发现子目录，开始递归扫描: ${fullPath}`
            );
            await scanDirectory(fullPath);
          } else {
            // 如果是文件，则检查其是否为视频文件且大小符合要求
            // console.log(`发现文件 ${fullPath}`);

            const ext = path.extname(file).toLowerCase(); // 获取文件扩展名并转为小写
            // 检查文件扩展名是否在支持的视频扩展名列表中，并且文件大小是否大于阈值
            if (
              VIDEO_EXTENSIONS.includes(ext) &&
              stats.size >= FILE_SIZE_THRESHOLD
            ) {
              // devWithTimestamp(`[scanDirectory] 发现符合条件的视频文件: ${file} (大小: ${(stats.size / (1024 * 1024 * 1024)).toFixed(2)}GB)`);
              // 解析电影文件名以提取元数据
              const parsedInfo = parseMovieFilename(file);
              // 构建 MovieFile 对象
              const movieFile: MovieFile = {
                filename: file,
                path: fullPath,
                absolutePath: path.resolve(fullPath),
                size: stats.size,
                sizeInGB: Number(
                  (stats.size / (1024 * 1024 * 1024)).toFixed(2)
                ),
                extension: ext,
                title: parsedInfo.title,
                year: parsedInfo.year,
                code: parsedInfo.code,
                modifiedAt: stats.mtimeMs,
              };

              // console.log(
              //   `大文件: ${movieFile.filename} - ${movieFile.sizeInGB}GB, 标题: ${movieFile.title}`
              // );

              movieFiles.push(movieFile); // 将电影文件添加到列表中
              // devWithTimestamp(`[scanDirectory] 添加电影文件到列表: ${movieFile.filename}`);
            } else {
              // 记录跳过的文件及原因
              if (!VIDEO_EXTENSIONS.includes(ext)) {
                // devWithTimestamp(`[scanDirectory] 跳过文件 (不支持的格式): ${file} (扩展名: ${ext})`);
              } else if (stats.size < FILE_SIZE_THRESHOLD) {
                devWithTimestamp(
                  `[scanDirectory] 跳过文件 (文件太小): ${file} (大小: ${(
                    stats.size /
                    (1024 * 1024 * 1024)
                  ).toFixed(2)}GB, 阈值: ${(
                    FILE_SIZE_THRESHOLD /
                    (1024 * 1024 * 1024)
                  ).toFixed(2)}GB)`
                );
              }
            }
          }
        } catch (fileError) {
          devWithTimestamp(
            `[scanDirectory] 处理文件 ${file} 时发生错误:`,
            fileError
          );
        }
      }
    } catch (dirError) {
      devWithTimestamp(
        `[scanDirectory] 扫描目录 ${currentPath} 时发生错误:`,
        dirError
      );
    }
  }

  // 开始递归扫描干净路径
  await scanDirectory(cleanPath);
  // devWithTimestamp(`[scanMovieDirectory] 扫描完成，发现 ${movieFiles.length} 个电影文件`);
  // 对扫描到的电影文件进行进一步处理，例如获取封面等
  return processMovieFiles(movieFiles, baseUrl);
}

import { getMovieDirectoryPath } from "@/utils/paths";
import axios from "axios";

// 存储电影目录路径的文件
const STORAGE_PATH = getMovieDirectoryPath();

/**
 * 从文件中获取存储的电影目录路径。
 * @returns 存储的目录路径字符串，如果文件不存在或读取失败则返回空字符串。
 */
async function getStoredDirectory(): Promise<string> {
  devWithTimestamp(`[getStoredDirectory] 尝试从 ${STORAGE_PATH} 读取存储目录`);

  // 添加详细的路径调试信息
  devWithTimestamp(`[getStoredDirectory] 详细调试信息:`);
  devWithTimestamp(`[getStoredDirectory] - 原始路径: "${STORAGE_PATH}"`);
  devWithTimestamp(`[getStoredDirectory] - 路径长度: ${STORAGE_PATH.length}`);
  devWithTimestamp(`[getStoredDirectory] - 路径类型: ${typeof STORAGE_PATH}`);
  devWithTimestamp(
    `[getStoredDirectory] - 原始路径是否存在: ${fs.existsSync(STORAGE_PATH)}`
  );

  // 检查环境变量和路径计算
  devWithTimestamp(`[getStoredDirectory] - process.cwd(): ${process.cwd()}`);
  devWithTimestamp(
    `[getStoredDirectory] - process.execPath: ${process.execPath}`
  );

  try {
    // 尝试读取文件内容
    const data = await readFile(STORAGE_PATH, "utf-8");
    devWithTimestamp(`[getStoredDirectory] 成功读取目录: "${data}"`); // 修复未终止的模板字符串
    devWithTimestamp(`[getStoredDirectory] 内容长度: ${data.length}`);
    devWithTimestamp(`[getStoredDirectory] 去空格后: "${data.trim()}"`);
    devWithTimestamp(
      `[getStoredDirectory] 去空格后长度: ${data.trim().length}`
    );
    return data.trim(); // 确保函数有返回值
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch {
    devWithTimestamp(`[getStoredDirectory] 未找到存储目录文件或读取失败:`);

    return ""; // 读取失败或文件不存在时返回空字符串
  }
}

/**
 * 将电影目录路径存储到文件中。
 * @param directory 要存储的目录路径。
 */
async function storeDirectory(directory: string): Promise<void> {
  devWithTimestamp(
    `[storeDirectory] 尝试将目录 ${directory} 存储到 ${STORAGE_PATH}`
  );
  try {
    // 写入文件内容
    await writeFile(STORAGE_PATH, directory, "utf-8");
    devWithTimestamp(`[storeDirectory] 成功存储目录: ${directory}`);
  } catch (error) {
    devWithTimestamp(`[storeDirectory] 存储目录失败:`, error);
  }
}

/**
 * GET 请求处理函数，用于获取电影列表数据。
 * 这是前端页面请求电影数据的入口。
 * @returns NextApiResponse 包含电影数据或错误信息。
 */
export async function GET(request: Request) {
  devWithTimestamp(`[GET] 接收到 GET 请求`);
  try {
    const baseUrl = new URL(request.url).origin; // 获取请求的协议和域名
    // 获取存储的电影目录
    devWithTimestamp(`[GET] 开始获取存储的电影目录`);
    const movieDirectory = await getStoredDirectory();
    devWithTimestamp(`[GET] 获取到的电影目录: "${movieDirectory}"`);
    devWithTimestamp(`[GET] 目录是否为空: ${!movieDirectory}`);
    devWithTimestamp(
      `[GET] 目录长度: ${movieDirectory ? movieDirectory.length : 0}`
    );

    if (!movieDirectory) {
      devWithTimestamp(`[GET] 未设置电影目录，返回 400 错误`);
      return NextResponse.json({ error: "No directory set" }, { status: 400 });
    }
    // 使用原始目录路径，不进行斜杠转换
    devWithTimestamp(`[GET] 开始扫描电影目录`);
    devWithTimestamp(`[GET] 原始目录路径: "${movieDirectory}"`);
    devWithTimestamp(
      `[GET] 原始路径是否存在: ${fs.existsSync(movieDirectory)}`
    );

    // 尝试不同的路径格式来兼容各种情况
    const pathVariants = [
      movieDirectory, // 原始路径
      movieDirectory.replace(/['"]/g, "").trim(), // 只清理引号
      movieDirectory.replace(/\\/g, "/"),
      movieDirectory.replace(/\//g, "\\"),
      path.normalize(movieDirectory),
      path.resolve(movieDirectory),
    ];

    devWithTimestamp(`[GET] 尝试不同路径格式:`);
    let validPath = null;
    for (let i = 0; i < pathVariants.length; i++) {
      const variant = pathVariants[i];
      const exists = fs.existsSync(variant);
      devWithTimestamp(`[GET] - 格式${i + 1}: "${variant}" 存在: ${exists}`);
      if (exists && !validPath) {
        validPath = variant;
        devWithTimestamp(`[GET] - 选择有效路径: "${validPath}"`);
      }
    }

    if (!validPath) {
      devWithTimestamp(`[GET] 所有路径格式都无效，返回错误`);
      return NextResponse.json(
        { error: "Directory not found", path: movieDirectory },
        { status: 404 }
      );
    }

    // 扫描电影目录并获取所有电影数据（scanMovieDirectory内部已经调用了processMovieFiles）
    const processedMovies = await scanMovieDirectory(validPath, baseUrl);
    devWithTimestamp(
      `[GET] 完成电影扫描和处理，返回 ${processedMovies.length} 条电影数据`
    );

    // 对 finalMovies 进行额外的检查和警告
    processedMovies.forEach((movie) => {
      if (movie.code) {
        // 检查标题是否仍然只是番号
        if (movie.title.toLowerCase() === movie.code.toLowerCase()) {
          devWithTimestamp(
            `[GET /api/movies] 警告: 电影 ${movie.filename} (番号: ${movie.code}) 缺少描述性标题。请检查JavDB抓取是否成功或文件名是否包含描述性信息。`
          );
        }
      }
      // 检查女优是否缺失或为"unknow"
      if (!movie.actress || movie.actress.toLowerCase() === "unknow") {
        // devWithTimestamp(`[GET /api/movies] 警告: 电影 ${movie.filename} (番号: ${movie.code || 'N/A'}) 缺少女优信息。`);
      }
    });

    const moviesToSend = processedMovies;
    devWithTimestamp(
      `[GET /api/movies] 返回 ${moviesToSend.length} 部电影数据。`
    );

    return NextResponse.json({
      movies: moviesToSend,
      total: processedMovies.length,
    });
  } catch (error) {
    devWithTimestamp("[GET /api/movies] 获取电影列表时发生错误:", error);
    return NextResponse.json({ error: "无法获取电影列表" }, { status: 500 });
  }
}

/**
 * PUT 请求处理函数，用于设置电影目录（如果尚未设置）。
 * @returns NextApiResponse 包含成功或错误信息。
 */
export async function PUT() {
  devWithTimestamp(`[PUT] 接收到 PUT 请求`);
  try {
    // 获取当前存储的目录
    const directory = await getStoredDirectory();
    if (directory !== "") {
      devWithTimestamp(`[PUT] 目录已设置，返回 200 状态`);
      return NextResponse.json(
        { error: "Directory already set" },
        { status: 200 }
      );
    }
    devWithTimestamp(`[PUT] 目录未设置，返回 500 状态 (待实现具体设置逻辑)`);
    return NextResponse.json({ message: "Directory jaged" }, { status: 500 });
  } catch (error) {
    devWithTimestamp("[PUT] Error scanning movies:", error);
    return NextResponse.json(
      { error: "PUTFailed to scan movies" },
      { status: 500 }
    );
  }
}

/**
 * POST 请求处理函数，用于接收并存储新的电影目录路径。
 * @param request NextApiRequest 对象，包含请求体 (folderPath)。
 * @returns NextApiResponse 包含成功或错误信息。
 */
export async function POST(request: Request) {
  devWithTimestamp(`[POST] 接收到 POST 请求`);
  try {
    // 从请求体中解析 folderPath
    const { folderPath } = await request.json();
    devWithTimestamp("[POST] 接收到的原始路径:", folderPath);
    devWithTimestamp("[POST] 路径类型:", typeof folderPath);
    devWithTimestamp("[POST] 路径长度:", folderPath.length);

    // 只清理引号，保持原始路径格式（Windows路径需要保持反斜杠）
    const cleanPath = folderPath.replace(/['"]/g, "").trim();
    devWithTimestamp("[POST] 处理后的路径:", cleanPath);
    devWithTimestamp("[POST] 处理后路径是否存在:", fs.existsSync(cleanPath));

    // 存储原始路径到文件（不进行斜杠转换）
    devWithTimestamp(`[POST] 尝试存储目录: ${cleanPath}`);
    await storeDirectory(cleanPath);
    devWithTimestamp(`[POST] 目录存储成功`);

    return NextResponse.json({ message: "扫描请求已接收", path: cleanPath });
  } catch (error) {
    devWithTimestamp("[POST] Error scanning movies:", error);
    return NextResponse.json(
      { error: "POSTFailed to scan movies" },
      { status: 500 }
    );
  }
}

/**
 * DELETE 请求处理函数，用于清除存储的电影目录路径。
 * @returns NextApiResponse 包含成功或错误信息。
 */
export async function DELETE() {
  devWithTimestamp(`[DELETE] 接收到 DELETE 请求`);
  try {
    devWithTimestamp(`[DELETE] 尝试清空 movie-directory.txt 文件`);
    // 将 movie-directory.txt 文件内容清空
    await writeFile(STORAGE_PATH, "");
    devWithTimestamp(`[DELETE] movie-directory.txt 文件已清空`);
    return NextResponse.json({ message: "Movie directory cleared" });
  } catch (error) {
    devWithTimestamp("[DELETE] Error clearing movie directory:", error);
    return NextResponse.json(
      { error: "Failed to clear movie directory" },
      { status: 500 }
    );
  }
}

