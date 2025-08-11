

import * as cheerio from "cheerio";
import {
  updateMovieMetadataCache,
} from "@/lib/movieMetadataCache";
import { devWithTimestamp, prodWithTimestamp } from "@/utils/logger";
import { HttpsProxyAgent } from "https-proxy-agent";
import axios from "axios";

// ==================================
// This file contains all the logic for fetching movie metadata from external sources.
// It is reused by various API routes.
// ==================================

const PROXY_URL = "http://127.0.0.1:9890";
const AGENT = new HttpsProxyAgent(PROXY_URL);

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

const GENRE_JA_TO_ZH: Record<string, string> = {
    "3P・4P": "3P/4P", "M女": "M女", "OL": "办公室女郎", "SF": "科幻", "SM": "SM", "Vシネマ": "V-影院", "おもちゃ": "玩具", "クスコ": "扩阴器", "お姉さん": "姐姐", "お姫様": "公主", "お嬢様・令嬢": "大小姐", "お風呂": "浴室", "くすぐり": "搔痒", "くノ一": "女忍者", "ごっくん": "吞精", "ふたなり": "扶他", "ぶっかけ": "颜射", "めがね": "眼镜", "アイドル・芸能人": "偶像/艺人", "アクション・格闘": "动作/格斗", "アクメ・オーガズム": "高潮/性高潮", "アスリート": "运动员", "アナル": "肛门", "アナルセックス": "肛交", "イタズラ": "恶作剧", "イラマチオ": "深喉", "インストラクター": "教练", "ウェイトレス": "女服务员", "エステ": "美容院", "オタク": "御宅族", "オナニー": "手淫", "カップル": "情侣", "カーセックス": "车内性爱", "キス・接吻": "吻", "キャバ嬢・風俗嬢": "夜总会女郎/风俗娘", "キャンギャル": "赛车女郎/车模", "ギャグ・コメディ": "搞笑喜剧", "クンニ": "舔阴", "ゲロ": "呕吐", "コスプレ": "角色扮演", "コンパニオン": "礼仪小姐", "ゴスロリ": "哥特洛丽塔", "サイコ・スリラー": "心理惊悚", "シスター": "修女", "シックスナイン": "69", "スカトロ": "嗜粪", "スチュワーデス": "空姐", "スパンキング": "打屁股", "スレンダー": "苗条", "スワッピング・夫婦交換": "换妻", "セクシー": "性感", "セレブ": "名人", "セーラー服": "水手服", "ダンス": "舞蹈", "チアガール": "啦啦队长", "チャイナドレス": "旗袍", "ツンデレ": "傲娇", "ディルド": "假阳具", "デカチン・巨根": "大鸡巴/巨根", "デビュー作品": "处女作", "ドキュメンタリー": "纪录片", "ドラマ": "戏剧", "ドール": "玩偶", "ナンパ": "搭讪", "ニーソックス": "过膝袜", "ネコミミ・獣系": "猫耳/兽系", "ノーパン": "不穿内裤", "ノーブラ": "不穿胸罩", "ハーレム": "后宫", "バイブ": "振动器", "バスガイド": "巴士导游", "バニーガール": "兔女郎", "パイズリ": "乳交", "パンスト・タイツ": "连裤袜/紧身裤", "パンチラ": "内裤走光", "ビジネススーツ": "商务套装", "ビッチ": "辣妹", "ファンタジー": "幻想", "フェラ": "口交", "ホテル": "酒店", "ボディコン": "紧身裙", "ボンテージ": "束缚", "ミニスカ": "超短裙", "ミニスカポリス": "迷你裙警察", "ミニ系": "娇小系", "メイド": "女仆", "ランジェリー": "内衣", "ルーズソックス": "泡泡袜", "レオタード": "紧身衣", "レースクィーン": "赛车皇后", "ローション・オイル": "润滑液/油", "不倫": "不伦", "中出し": "中出", "主観": "主观视角", "乱交": "乱交", "人妻・主婦": "人妻/主妇", "企画": "企划", "体操着・ブルマ": "体操服/运动短裤", "処女": "处女", "制服": "制服", "即ハメ": "立即性交", "受付嬢": "接待员", "和服・浴衣": "和服/浴衣", "変身ヒロイン": "变身女主角", "女上司": "女上司", "女医": "女医生", "女子アナ": "女主播", "女子大生": "女大学生", "女子校生": "女高中生", "女将・女主人": "老板娘/女主人", "女戦士": "女战士", "女捜査官": "女调查员", "女教師": "女教师", "女王様": "女王", "妄想": "妄想", "妊婦": "孕妇", "姉・妹": "姐妹", "娘・養女": "女儿/养女", "孕ませ": "令其怀孕", "学園もの": "校园", "学生服": "校服", "家庭教師": "家庭教师", "寝取り・寝取られ・NTR": "NTR", "小柄": "娇小", "尻フェチ": "臀部恋物癖", "局部アップ": "私处特写", "巨乳": "巨乳", "巨乳フェチ": "巨乳控", "巨尻": "巨尻", "巫女": "巫女", "幼なじみ": "青梅竹马", "復刻": "复刻", "恋愛": "恋爱", "手コキ": "手交", "拘束": "束缚", "拷問": "拷问", "指マン": "指交", "放尿・お漏らし": "放尿/失禁", "放置": "放置", "旅行": "旅行", "日焼け": "日晒", "早漏": "早泄", "時間停止": "时间停止", "未亡人": "寡妇", "格闘家": "格斗家", "極道・任侠": "黑道/侠义", "残虐表現": "残忍描写", "母乳": "母乳", "水着": "泳装", "汗だく": "汗流浃背", "浣腸": "灌肠", "淫乱・ハード系": "淫乱/重口", "淫語": "淫语", "温泉": "温泉", "潮吹き": "潮吹", "熟女": "熟女", "男の潮吹き": "男性潮吹", "異物挿入": "异物插入", "病院・クリニック": "医院/诊所", "痴女": "痴女", "白目・失神": "翻白眼/昏厥", "盗撮・のぞき": "偷拍/偷窥", "監禁": "监禁", "看護婦・ナース": "护士", "着エロ": "情趣内衣", "秘書": "秘书", "童貞": "童贞", "競泳・スクール水着": "竞速泳衣/校园泳衣", "筋肉": "肌肉", "素人": "素人", "縛り・緊縛": "捆绑/紧缚", "罵倒": "辱骂", "美乳": "美乳", "美少女": "美少女", "羞恥": "羞耻", "義母": "继母/婆婆", "脚フェチ": "恋足癖", "脱糞": "脱粪", "花嫁": "新娘", "若妻・幼妻": "少妻/幼妻", "蝋燭": "蜡烛", "裸エプロン": "裸体围裙", "覆面・マスク": "蒙面/面具", "触手": "触手", "貧乳・微乳": "贫乳", "超乳": "超乳", "足コキ": "足交", "軟体": "身体柔软", "辱め": "凌辱", "近親相姦": "近亲相奸", "逆ナン": "逆搭讪", "部下・同僚": "部下/同事", "部活・マネージャー": "社团活动/经理", "野外・露出": "户外/露出", "長身": "高个子", "電マ": "电动按摩器", "顔射": "颜射", "顔面騎乗": "坐脸", "飲尿": "饮尿", "騎乗位": "骑乘位", "鬼畜": "鬼畜", "魔法少女": "魔法少女", "黒人男優": "黑人演员", "鼻フック": "鼻钩"
};

function normalizeGenreKey(s: string): string {
  return (s || "")
    .trim()
    .replace(/\u3000/g, "")
    .replace(/\s+/g, "")
    .replace(/[\(\)]/g, (m) => (m === '(' ? '（' : '）'))
    .replace(/[･]/g, "・")
    .replace(/[：:]/g, ":");
}

const GENRE_JA_TO_ZH_NORMALIZED: Record<string, string> = Object.fromEntries(
  Object.entries(GENRE_JA_TO_ZH).map(([k, v]) => [normalizeGenreKey(k), v])
);

function translateGenresToZh(genres: string[]): string[] {
  const mapped = genres
    .map((g) => GENRE_JA_TO_ZH_NORMALIZED[normalizeGenreKey(g)])
    .filter((v): v is string => Boolean(v));
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
    (u) => /[\/\\]pl\./.test(u) || /[_-]pl\./.test(u) || u.endsWith("pl.jpg") || u.endsWith("pl.png")
  );
  if (pref1) return pref1;
  const pref2 = urls.find(
    (u) => /[\/\\]ps\./.test(u) || /[_-]ps\./.test(u) || u.endsWith("ps.jpg") || u.endsWith("ps.png")
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

async function fetchCoverUrlFromJavbus(code: string, baseUrl: string) {
    prodWithTimestamp(`[fetchCoverUrl] [Javbus] 开始处理番号: ${code}`);
    try {
        const res = await axios.get(`https://www.javbus.com/search/${code}`, { headers: { accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7", "accept-encoding": "gzip, deflate, br, zstd", "accept-language": "zh-CN,zh;q=0.9,en;q=0.8", "cache-control": "max-age=0", cookie: "existmag=mag", priority: "u=0, i", referer: "https://www.javbus.com/", "sec-ch-ua": '"Google Chrome";v="137", "Chromium";v="137", "Not/A)Brand";v="24"', "sec-ch-ua-mobile": "?0", "sec-ch-ua-platform": '"Windows"', "sec-fetch-dest": "document", "sec-fetch-mode": "navigate", "sec-fetch-site": "same-origin", "sec-fetch-user": "?1", "upgrade-insecure-requests": "1", "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36" }, timeout: 15000, httpsAgent: AGENT, httpAgent: AGENT });
        const $0 = cheerio.load(res.data);
        const nexturl = $0("#waterfall > div > a").attr('href') || "";
        if (!nexturl) {
            prodWithTimestamp(`[fetchCoverUrl] [Javbus] 未找到详情链接: ${code}`);
            return { coverUrl: null, title: null, actress: null, kinds: [] };
        }
        const res1 = await axios.get(nexturl, { headers: { accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7", "accept-encoding": "gzip, deflate, br, zstd", "accept-language": "zh-CN,zh;q=0.9,en;q=0.8", "cache-control": "max-age=0", cookie: "existmag=mag", priority: "u=0, i", referer: "https://www.javbus.com/", "sec-ch-ua": '"Google Chrome";v="137", "Chromium";v="137", "Not/A)Brand";v="24"', "sec-ch-ua-mobile": "?0", "sec-ch-ua-platform": '"Windows"', "sec-fetch-dest": "document", "sec-fetch-mode": "navigate", "sec-fetch-site": "same-origin", "sec-fetch-user": "?1", "upgrade-insecure-requests": "1", "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36" }, timeout: 15000, httpsAgent: AGENT, httpAgent: AGENT });
        const $ = cheerio.load(res1.data);
        let coverUrl = "https://www.javbus.com" + $("body > div.container > div.row.movie > div.col-md-9.screencap > a > img").attr("src") || "";
        let title = $("body > div.container > h3").text() || "";
        let actress = $("body > div.container > div.row.movie > div.col-md-3.info > p:last-child > span > a").text() || "";
        let blocked = ["高畫質", "DMM獨家", "單體作品", "數位馬賽克", "多選提交", "4K", "フルハイビジョン(FHD)", "MGSだけのおまけ映像付き", "アクメ・オーガズム"];
        let kinds_index = $("body > div.container > div.row.movie > div.col-md-3.info > p.header");
        let kinds = kinds_index.next("p").text().trim().split(/\s+/).map((tag) => tag.trim()).filter((tag) => tag && !blocked.includes(tag) && !/[\u30A0-\u30FF]/.test(tag));
        if (coverUrl) {
            devWithTimestamp(`[fetchCoverUrl] [Javbus] 原始封面URL: ${coverUrl}`);
            try {
                const proxyApiUrl = `${baseUrl}/api/image-proxy?url=${encodeURIComponent(coverUrl)}&code=${encodeURIComponent(code)}`;
                devWithTimestamp(`[fetchCoverUrl] [Javbus] 调用 image-proxy: ${proxyApiUrl}`);
                const imageProxyResponse = await fetch(proxyApiUrl);
                if (imageProxyResponse.ok) {
                    const proxyData = await imageProxyResponse.json();
                    if (proxyData.imageUrl && !proxyData.imageUrl.includes("placeholder-image.svg")) {
                        coverUrl = proxyData.imageUrl;
                        devWithTimestamp(`[fetchCoverUrl] [Javbus] 封面已通过 image-proxy 缓存到本地: ${coverUrl}`);
                    } else {
                        devWithTimestamp(`[fetchCoverUrl] [Javbus] image-proxy 返回占位符或无效图片，保持原始URL: ${coverUrl}`);
                        coverUrl = "";
                    }
                } else {
                    devWithTimestamp(`[fetchCoverUrl] [Javbus] 调用 image-proxy 失败: ${imageProxyResponse.statusText}`);
                }
            } catch (proxyError) {
                devWithTimestamp(`[fetchCoverUrl] [Javbus] 调用 image-proxy 发生错误: ${proxyError}`);
            }
        }
        if (coverUrl || title || actress) {
            const finalCoverUrl = coverUrl && !coverUrl.includes("placeholder-image.svg") ? coverUrl : null;
            prodWithTimestamp(`[fetchCoverUrl] [Javbus] 番号 ${code} 处理完成 - 封面: ${finalCoverUrl}, 标题: ${title}, 女优: ${actress}`);
            await updateMovieMetadataCache(code, finalCoverUrl, title, actress, kinds);
            return { coverUrl: finalCoverUrl, title, actress, kinds };
        } else {
            prodWithTimestamp(`[fetchCoverUrl] [Javbus] 番号 ${code} 处理失败 - 未获取到任何元数据`);
            return { coverUrl: null, title: null, actress: null, kinds: [] };
        }
    } catch (e) {
        prodWithTimestamp(`[fetchCoverUrl] [Javbus] 处理番号: ${code}, 失败${e}`);
        return { coverUrl: null, title: null, actress: null, kinds: [] };
    }
}

export async function fetchCoverUrl(code: string, baseUrl: string) {
  prodWithTimestamp(`[fetchCoverUrl] [DMM] 开始处理番号: ${code}`);
  try {
    const searchUrl = makeSearchUrl(code);
    const headers = { ...DEFAULT_HEADERS, Cookie: cookieHeaderFromObject(DEFAULT_COOKIES) };
    const res = await axios.get(searchUrl, { headers, timeout: 15000, httpsAgent: AGENT, httpAgent: AGENT, maxRedirects: 5, validateStatus: (s) => s >= 200 && s < 400 });
    const html = res.data || "";
    if (isAdultGateHtml(html)) {
      devWithTimestamp(`[fetchCoverUrl] [DMM] 搜索页可能命中成年确认页，需要更好的 Cookie 或代理`);
    }
    const $ = cheerio.load(html);
    const detailUrl = getFirstDetailLink($, searchUrl);
    if (!detailUrl) {
      throw new Error(`[DMM] 未找到详情链接: ${code}`);
    }
    const resDetail = await axios.get(detailUrl, { headers, timeout: 15000, httpsAgent: AGENT, httpAgent: AGENT, maxRedirects: 5, validateStatus: (s) => s >= 200 && s < 400 });
    const dhtml = resDetail.data || "";
    if (isAdultGateHtml(dhtml)) {
      devWithTimestamp(`[fetchCoverUrl] [DMM] 详情页可能命中成年确认页`);
    }
    const d$ = cheerio.load(dhtml);
    const title = (d$("#title").text() || "").trim();
    const actress = (d$("#performer").text() || "").trim();
    if (!title) {
        throw new Error(`[DMM] 未找到标题: ${code}`);
    }
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
        const raw = valueTd.find("a").map((i, a) => d$(a).text().trim()).get();
        const dedup = Array.from(new Set(raw.filter(Boolean)));
        kinds = translateGenresToZh(dedup);
      }
    }
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
        if ((low.includes("pics.dmm.co.jp") || low.includes("p.dmm.co.jp")) && (low.includes("/mono/movie/") || low.includes("/digital/")) && !(low.includes("loading") && low.endsWith(".gif"))) {
          coverCandidates.push(absUrl(val.trim(), detailUrl));
        }
      }
    });
    const uniq = Array.from(new Set(coverCandidates.filter(Boolean)));
    let coverUrl = pickCover(uniq);
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
    await updateMovieMetadataCache(code, finalCoverUrl, title || null, actress || null, kinds);
    prodWithTimestamp(`[fetchCoverUrl] [DMM] 番号 ${code} 完成 - 封面: ${finalCoverUrl}, 标题: ${title}, 女优: ${actress}, 标签数: ${kinds.length}`);
    return { coverUrl: finalCoverUrl, title, actress, kinds };
  } catch (e) {
    prodWithTimestamp(`[fetchCoverUrl] [DMM] 处理番号 ${code} 失败: ${e}. 尝试备用源 Javbus.`);
    return await fetchCoverUrlFromJavbus(code, baseUrl);
  }
}

