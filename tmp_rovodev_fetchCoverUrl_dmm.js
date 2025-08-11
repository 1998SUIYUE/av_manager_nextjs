/*
 临时测试文件：DMM 版本的 fetchCoverUrl（带调试信息）
 用法（自行在项目根目录执行）：
   node tmp_rovodev_fetchCoverUrl_dmm.js SSNI-123 http://localhost:3000
*/

const axios = require('axios');
const cheerio = require('cheerio');
const { HttpsProxyAgent } = require('https-proxy-agent');

// 如无需代理，可将 PROXY_URL 置空并移除 httpsAgent/httpAgent
const PROXY_URL = 'http://127.0.0.1:9890';
const AGENT = new HttpsProxyAgent(PROXY_URL);

const DMM_SEARCH_TEMPLATE = 'https://www.dmm.co.jp/mono/dvd/-/search/=/searchstr={code}/';

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7,ja;q=0.6',
  'Connection': 'keep-alive',
  'Referer': 'https://www.dmm.co.jp/',
  'Upgrade-Insecure-Requests': '1',
  'sec-ch-ua': '"Google Chrome";v="123", "Chromium";v="123", "Not/A)Brand";v="24"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'Accept-Encoding': 'gzip, deflate, br',
};

const DEFAULT_COOKIES = {
  age_check_done: '1',
  ckcy: '1',
  is_adult: '1',
  // cklg: 'ja', // 有需要可开启
};

function cookieHeaderFromObject(obj) {
  return Object.entries(obj)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

// 日->中 “ジャンル”映射（截取并可按需扩充）
const GENRE_JA_TO_ZH = {
  '3P・4P': '3P/4P',
  'AV女優': '色情明星',
  'How To': '如何',
  'M女': 'M女人',
  'M男': 'M男人',
  'OL': '办公室女郎',
  'SF': '科幻小说',
  'SM': 'SM',
  'おもちゃ': '玩具',
  'お姉さん': '姐姐',
  'お母さん': '母亲',
  'お風呂': '洗澡',
  'ぶっかけ': '群交',
  'めがね': '眼镜',
  'アイドル・芸能人': '偶像和名人',
  'アクション': '行动',
  'アクション・格闘': '动作/格斗',
  'アクメ・オーガズム': '高潮/性高潮',
  'アジア女優': '亚洲女演员',
  'アスリート': '运动员',
  'アナル': '肛门',
  'アナルセックス': '肛交',
  'アニメ': '日本动画片',
  'アニメキャラクター': '动漫人物',
  'イタズラ': '恶作剧',
  'イメージビデオ': '图片视频',
  'イラマチオ': '深喉咙',
  'インストラクター': '讲师',
  'ウェイトレス': '女服务员',
  'エステ': '美容院',
  'オタク': '御宅族',
  'オナニー': '手淫',
  'カップル': '夫妻',
  'カーセックス': '车内性爱',
  'キス・接吻': '吻',
  'キャバ嬢・風俗嬢': '女招待/妓女',
  'キャンギャル': '竞选女孩',
  'ギャグ・コメディ': '搞笑喜剧',
  'ギャル': '加尔',
  'クンニ': '舔阴',
  'コスプレ': '角色扮演',
  'コラボ作品': '合作作品',
  'コンパニオン': '伴侣',
  'ゴスロリ': '哥特洛丽塔',
  'サイコ・スリラー': '心理惊悚片',
  'シスター': '姐姐',
  'シックスナイン': '69',
  'ショタ': '翔太',
  'スカトロ': '粪便',
  'スチュワーデス': '空中小姐',
  'スパンキング': '打屁股',
  'スポーツ': '运动的',
  'スレンダー': '苗条',
  'スワッピング・夫婦交換': '交换妻子',
  'セクシー': '性感',
  'セレブ': '名人',
  'セーラー服': '水手服',
  'ダンス': '舞蹈',
  'ダーク系': '黑暗的',
  'チアガール': '啦啦队长',
  'チャイナドレス': '中式礼服',
  'ツンデレ': '傲娇',
  'ディルド': '假阳具',
  'デカチン・巨根': '大屌/巨屌',
  'デビュー作品': '处女作',
  'デート': '日期',
  'ドキュメンタリー': '记录',
  'ドラマ': '戏剧',
  'ドール': '玩具娃娃',
  'ナンパ': '搭讪女孩',
  'ニューハーフ': '变性人',
  'ニーソックス': '及膝袜',
  'ネコミミ・獣系': '猫耳朵/动物',
  'ノーパン': '不穿内衣',
  'ノーブラ': '不戴胸罩',
  'ハメ撮り': '观点',
  'ハーレム': '后宫',
  'バイブ': '振动器',
  'バスガイド': '巴士指南',
  'バック': '后退',
  'バニーガール': '兔女郎',
  'パイズリ': '乳交',
  'パイパン': '剃光',
  'パンスト・タイツ': '连裤袜和紧身裤',
  'パンチラ': '内裤拍摄',
  'ビジネススーツ': '商务套装',
  'ビッチ': '贱人',
  'ファンタジー': '幻想',
  'ファン感謝・訪問': '粉丝欣赏/访问',
  'フィスト': '拳头',
  'フェラ': '口交',
  'ヘルス・ソープ': '健康香皂',
  'ベスト・総集編': '最佳/合辑',
  'ホテル': '酒店',
  'ホラー': '恐怖',
  'ボディコン': '紧身连衣裙',
  'ボンテージ': '束缚',
  'ポルチオ': '波蒂奥',
  'マッサージ・リフレ': '按摩和反射疗法',
  'ママ友': '妈妈的朋友',
  'ミニスカ': '超短裙',
  'ミニスカポリス': '迷你裙警察',
  'ミニ系': '迷你系列',
  'メイド': '女佣',
  'モデル': '模型',
  'ヨガ': '瑜伽',
  'ランジェリー': '内衣',
  'ルーズソックス': '宽松的袜子',
  'レオタード': '紧身衣',
  'レズキス': '女同之吻',
  'レズビアン': '女同性恋',
  'レースクィーン': '赛车皇后',
  'ローション・オイル': '乳液和油',
  'ローター': '转子',
  '不倫': '通奸',
  '中出し': '中出',
  '主観': '主观',
  '乱交': '狂欢',
  '人妻・主婦': '已婚女性/家庭主妇',
  '企画': '计划',
  '体操着・ブルマ': '运动服和灯笼裤',
  '体験告白': '经历告白',
  '処女': '处女',
  '制服': '制服',
  '単体作品': '个人作品',
  '即ハメ': '即时性爱',
  '原作コラボ': '原创合作',
  '叔母さん': '阿姨',
  '受付嬢': '接待员',
  '台湾モデル': '台湾模特',
  '和服・浴衣': '日式服装和浴衣',
  '変身ヒロイン': '变身女主角',
  '女上司': '女老板',
  '女優ベスト・総集編': '最佳女主角合辑',
  '女医': '女医生',
  '女子アナ': '女播音员',
  '女子大生': '女大学生',
  '女子校生': '女学生',
  '女将・女主人': '房东/女主人',
  '女性向け': '对女性来说',
  '女戦士': '女战士',
  '女捜査官': '女调查员',
  '女教師': '女教师',
  '女王様': '女王',
  '女装・男の娘': '异装癖/娘娘腔',
  '妄想': '妄想',
  '妊婦': '孕妇',
  '姉・妹': '姐姐/妹妹',
  '娘・養女': '女儿/养女',
  '孕ませ': '浸渍',
  '学園もの': '学校主题',
  '学生服': '校服',
  '家庭教師': '导师',
  '寝取り・寝取られ・NTR': '出轨，出轨，NTR',
  '小柄': '娇小',
  '尻フェチ': '臀部恋物癖',
  '局部アップ': '私密部位特写',
  '巨乳': '大乳房',
  '巨乳フェチ': '巨乳癖',
  '巨尻': '大屁股',
  '巫女': '巫女',
  '幼なじみ': '儿时的朋友',
  '復刻': '重印',
  '性転換・女体化': '性别变化/女性化',
  '恋愛': '恋情',
  '手コキ': '手淫',
  '拘束': '克制',
  '拷問': '酷刑',
  '指マン': '指法',
  '放尿・お漏らし': '排尿/小便',
  '放置': '弃',
  '旅行': '旅行',
  '日焼け': '晒斑',
  '早漏': '早泄',
  '時代劇': '历史剧',
  '時間停止': '时间停止',
  '未亡人': '寡妇',
  '格闘家': '战斗机',
  '極道・任侠': '黑帮/骑士精神',
  '残虐表現': '暴力',
  '母乳': '母乳',
  '水着': '泳装',
  '汗だく': '出汗',
  '洋ピン・海外輸入': '西式别针/海外进口',
  '浣腸': '灌肠剂',
  '淫乱・ハード系': '淫秽/硬核',
  '淫語': '脏话',
  '温泉': '温泉',
  '潮吹き': '喷出',
  '熟女': '成熟的女人',
  '特撮': '特殊效果',
  '男の潮吹き': '男性潮吹',
  '異物挿入': '异物插入',
  '病院・クリニック': '医院和诊所',
  '痴女': '荡妇',
  '白人女優': '白人女演员',
  '白目・失神': '眼白/昏厥',
  '盗撮・のぞき': '偷窥癖',
  '監禁': '监禁',
  '看護婦・ナース': '护士',
  '着エロ': '情趣服装',
  '秘書': '秘书',
  '童貞': '处女',
  '競泳・スクール水着': '竞技泳衣和学校泳衣',
  '筋肉': '肌肉',
  '素人': '业余',
  '縛り・緊縛': '束缚',
  '罵倒': '侮辱',
  '美乳': '美丽的乳房',
  '美少女': '美丽的女孩',
  '羞恥': '耻辱',
  '義母': '岳母',
  '職業色々': '各种职业',
  '胸チラ': '乳房闪光',
  '脚フェチ': '恋腿癖',
  '脱糞': '排便',
  '花嫁': '新娘',
  '若妻・幼妻': '年轻的妻子/年轻的妻子',
  '蝋燭': '蜡烛',
  '裸エプロン': '裸体围裙',
  '覆面・マスク': '面具',
  '触手': '触手',
  '貧乳・微乳': '乳房较小',
  '超乳': '巨大的乳房',
  '足コキ': '足交',
  '軟体': '软体动物',
  '辱め': '屈辱',
  '近親相姦': '乱伦',
  '逆ナン': '反向拾取',
  '部下・同僚': '下属和同事',
  '部活・マネージャー': '俱乐部/经理',
  '野外・露出': '户外/暴露',
  '長身': '高的',
  '電マ': '电动按摩器',
  '面接': '面试',
  '顔射': '面部的',
  '顔面騎乗': '颜面骑乘',
  '食糞': '食粪症',
  '飲み会・合コン': '饮酒聚会和集体约会',
  '飲尿': '喝尿',
  '騎乗位': '女牛仔式',
  '鬼畜': '残忍的',
  '魔法少女': '魔法少女',
  '黒人男優': '黑人男演员',
  '鼻フック': '鼻钩',
};

function translateGenresToZh(genres) {
  return genres.map((g) => GENRE_JA_TO_ZH[g] || g);
}

function makeSearchUrl(code) {
  return DMM_SEARCH_TEMPLATE.replace('{code}', String(code || '').trim().replace(/\s+/g, ''));
}

function absUrl(u, base) {
  try {
    return new URL(u, base).toString();
  } catch (_) {
    return u || '';
  }
}

function pickCover(urls) {
  if (!urls || urls.length === 0) return '';
  const pref1 = urls.find((u) => /[\\\/]pl\./.test(u) || /[_-]pl\./.test(u) || u.endsWith('pl.jpg') || u.endsWith('pl.png'));
  if (pref1) return pref1;
  const pref2 = urls.find((u) => /[\\\/]ps\./.test(u) || /[_-]ps\./.test(u) || u.endsWith('ps.jpg') || u.endsWith('ps.png'));
  if (pref2) return pref2;
  const pref3 = urls.find((u) => !u.toLowerCase().endsWith('.gif') && !/loading/i.test(u));
  if (pref3) return pref3;
  return urls[0];
}

function isAdultGateHtml(html) {
  const low = (html || '').toLowerCase();
  return low.includes('adult') || low.includes('r18') || low.includes('年齢確認') || low.includes('このサイトはアダルト');
}

function getFirstDetailLink($, base) {
  let a = $('#list > li:nth-child(1) > div > p.tmb > a');
  if (!a || a.length === 0) a = $('#list li div p.tmb a').first();
  if (!a || a.length === 0) a = $('p.tmb a').first();
  const href = a && a.attr('href');
  if (!href) return '';
  return absUrl(href.trim(), base);
}

async function fetchCoverUrlDmm(code, baseUrl) {
  const searchUrl = makeSearchUrl(code);
  try {
    const headers = { ...DEFAULT_HEADERS, Cookie: cookieHeaderFromObject(DEFAULT_COOKIES) };
    const res = await axios.get(searchUrl, {
      headers,
      timeout: 15000,
      httpsAgent: AGENT,
      httpAgent: AGENT,
      maxRedirects: 5,
      validateStatus: (s) => s >= 200 && s < 400, // 允许 3xx
    });
    const html = res.data || '';
    if (isAdultGateHtml(html)) {
      console.log('[DEBUG] 可能命中成年确认页面，请检查 Cookie。');
    }

    const $ = cheerio.load(html);
    const detailUrl = getFirstDetailLink($, searchUrl);
    console.log('[DEBUG] search status:', res.status, 'detailUrl:', detailUrl);
    if (!detailUrl) {
      return { coverUrl: null, title: null, actress: null, kinds: [] };
    }

    const resDetail = await axios.get(detailUrl, {
      headers,
      timeout: 15000,
      httpsAgent: AGENT,
      httpAgent: AGENT,
      maxRedirects: 5,
      validateStatus: (s) => s >= 200 && s < 400,
    });

    const dhtml = resDetail.data || '';
    if (isAdultGateHtml(dhtml)) {
      console.log('[DEBUG] 详情页可能仍在成年确认页。');
    }

    const d$ = cheerio.load(dhtml);

    // 标题与女优
    const title = (d$('#title').text() || '').trim();
    const actress = (d$('#performer').text() || '').trim();

    // ジャンル
    let kinds = [];
    const tds = d$('td.nw');
    let labelTd = null;
    tds.each((i, el) => {
      const txt = d$(el).text().trim().replace('：', ':');
      if (txt.includes('ジャンル')) { labelTd = el; return false; }
    });
    if (labelTd) {
      const valueTd = d$(labelTd).next('td');
      if (valueTd && valueTd.length > 0) {
        const raw = valueTd.find('a').map((i, a) => d$(a).text().trim()).get();
        const dedup = Array.from(new Set(raw.filter(Boolean)));
        kinds = translateGenresToZh(dedup);
      }
    }

    // 封面候选
    const coverCandidates = [];
    const metaOg = d$('meta[property="og:image"]').attr('content');
    if (metaOg) coverCandidates.push(absUrl(metaOg.trim(), detailUrl));

    const coverEl = d$('#fn-modalSampleImage__image');
    if (coverEl && coverEl.length) {
      const attrs = ['data-src', 'data-original', 'data-lazy', 'data-srcset', 'src'];
      for (const attr of attrs) {
        const val = coverEl.attr(attr);
        if (val) {
          let v = val.trim();
          if (attr === 'data-srcset') v = v.split(/\s+/)[0].replace(/,+$/, '');
          coverCandidates.push(absUrl(v, detailUrl));
        }
      }
      const parentA = coverEl.parent('a');
      if (parentA && parentA.length) {
        const href = parentA.attr('href');
        if (href) coverCandidates.push(absUrl(href.trim(), detailUrl));
      }
    }

    d$('img').each((i, img) => {
      const attrs = ['data-src', 'data-original', 'src'];
      for (const attr of attrs) {
        const val = d$(img).attr(attr);
        if (!val) continue;
        const low = val.toLowerCase();
        if ((low.includes('pics.dmm.co.jp') || low.includes('p.dmm.co.jp')) &&
            (low.includes('/mono/movie/') || low.includes('/digital/')) &&
            !(low.includes('loading') && low.endsWith('.gif'))) {
          coverCandidates.push(absUrl(val.trim(), detailUrl));
        }
      }
    });

    const uniq = Array.from(new Set(coverCandidates.filter(Boolean)));
    let coverUrl = pickCover(uniq);

    // 调用本地 image-proxy 缓存（如果提供 baseUrl）
    if (coverUrl && baseUrl) {
      try {
        const proxyApiUrl = `${baseUrl}/api/image-proxy?url=${encodeURIComponent(coverUrl)}&code=${encodeURIComponent(code)}`;
        const proxyResp = await fetch(proxyApiUrl);
        if (proxyResp && proxyResp.ok) {
          const data = await proxyResp.json();
          if (data && data.imageUrl && !String(data.imageUrl).includes('placeholder-image.svg')) {
            coverUrl = data.imageUrl;
          }
        }
      } catch (_) { /* ignore */ }
    }

    console.log('[DEBUG] detail status:', resDetail.status, 'title:', title, 'actress:', actress, 'kinds:', kinds);

    return {
      coverUrl: coverUrl || null,
      title: title || null,
      actress: actress || null,
      kinds: kinds || [],
    };
  } catch (e) {
    console.log('[DEBUG] fetch error:', e && e.message ? e.message : e);
    return { coverUrl: null, title: null, actress: null, kinds: [] };
  }
}

module.exports = { fetchCoverUrlDmm };

if (require.main === module) {
  (async () => {
    const code = process.argv[2] || 'cawd-848';
    const base = process.argv[3] || '';
    const res = await fetchCoverUrlDmm(code, base);
    console.log('RESULT:', res);
  })();
}
