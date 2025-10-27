export const convertISBN10to13 = (isbn10: string): string => {
    if (isbn10.length !== 10) return isbn10;
    
    const core = `978${isbn10.slice(0, 9)}`;
    let sum = 0;

    for (let i = 0; i < core.length; i++) {
        sum += parseInt(core[i]!) * (i % 2 === 0 ? 1 : 3);
    }

    const checkDigit = (10 - (sum % 10)) % 10;
    return `${core}${checkDigit}`;
};

export const NDLsearch = async (isbn: string ): Promise<NdlItem[] | null> => {
  const response = await fetch(`https://ndlsearch.ndl.go.jp/api/opensearch?isbn=${isbn}`);
  return parseNdlOpenSearch(await response.text()).items || null;
}

// parse-ndl-opensearch.ts
import { XMLParser } from 'fast-xml-parser';

export type NdlItem = {
  title: string | null;
  titleKana: string | null;
  link: string | null;
  creators: string[];           // 著者名の配列（dc:creator）
  creatorsKana: string[];       // フリガナ（dcndl:creatorTranscription）
  publisher: string | null;     // dc:publisher
  pubYear: string | null;       // dc:date（年だけ揃える）
  issued: string | null;        // dcterms:issued（"YYYY.M" 等）
  extent: string | null;        // 頁数等（dc:extent）
  price: string | null;         // 価格（dcndl:price）
  categories: string[];         // RSS item の <category>
  isbn13: string | null;        // dc:identifier[@type=ISBN]
  ndlBibId: string | null;      // dc:identifier[@type=NDLBibID]
  jpno: string | null;          // dc:identifier[@type=JPNO]
  tohanMarcNo: string | null;   // dc:identifier[@type=TOHANMARCNO]
  ndc10: string | null;         // dc:subject[@type=NDC10]
  ndlc: string | null;          // dc:subject[@type=NDLC]
  subjects: string[];           // それ以外の件名（dc:subject）
  descriptionHtml: string | null; // item/description のHTML（必要なら後で整形）
  seeAlso: string[];            // rdfs:seeAlso/@resource のURL群
};

type NdlFeed = {
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
  items: NdlItem[];
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',     // 属性は @_attr
  removeNSPrefix: true,          // dc:, dcndl:, dcterms: → 取り除く
  // CDATAを文字列として取得
  cdataPropName: '#cdata',
  parseTagValue: true,
  trimValues: true,
});

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function stripHyphens(s: string) { return s.replace(/-/g, ''); }

function firstNonEmpty(...vals: (string | null | undefined)[]) {
  for (const v of vals) if (typeof v === 'string' && v.trim()) return v.trim();
  return null;
}

function textOf(node: any): string | null {
  if (node == null) return null;
  if (typeof node === 'string') return node;
  if (typeof node === 'number' || typeof node === 'boolean') return String(node);
  // fast-xml-parser の CDATA は #cdata に入る設定
  if (typeof node === 'object' && typeof node['#cdata'] === 'string') return node['#cdata'];
  // それ以外はテキストノードがない前提でnull
  return null;
}

export function parseNdlOpenSearch(xml: string): NdlFeed {
  const root = parser.parse(xml);

  // ルート: rss.channel
  const ch = root?.rss?.channel ?? {};
  const get = (k: string) => ch?.[k];

  const totalResults = Number(get('totalResults') ?? 0);
  const startIndex   = Number(get('startIndex') ?? 1);
  const itemsPerPage = Number(get('itemsPerPage') ?? 0);

  const rawItems = asArray(get('item'));

  const items: NdlItem[] = rawItems.map((it: any) => {
    // 基本
    const title  = textOf(it.title) ?? textOf(it['dc:title']) ?? null;
    const titleKana = textOf(it['titleTranscription']) ?? textOf(it['dcndl:titleTranscription']) ?? null;
    const link   = textOf(it.link) ?? textOf(it.guid) ?? null;

    // creators
    const creators = asArray(it['creator'] ?? it['dc:creator'] ?? it['dc']?.creator).map((x) => textOf(x)).filter(Boolean) as string[];
    const creatorsKana = asArray(it['creatorTranscription'] ?? it['dcndl:creatorTranscription']).map((x)=>textOf(x)).filter(Boolean) as string[];

    const publisher = textOf(it['publisher']) ?? null;

    // 年は dc:date（xsi:typeが付いてても値はテキスト）
    let pubYear = textOf(it['date']) ?? null;
    if (pubYear) {
      // "2021.2" みたいなのは年だけに寄せる（必要に応じて調整）
      const m = pubYear.match(/\d{4}/);
      pubYear = m ? m[0] : pubYear;
    }

    const issued = textOf(it['issued']) ?? null;
    const extent = textOf(it['extent']) ?? null;
    const price  = textOf(it['price']) ?? null;

    // 識別子（type属性で振り分け）
    let isbn13: string | null = null, ndlBibId: string | null = null, jpno: string | null = null, tohan: string | null = null;

    for (const idNode of asArray(it['identifier'])) {
      const t = idNode?.['@_type'] || idNode?.['@_xsi:type'] || idNode?.['@_dcndl:ISBN']; // 念のため
      const val = textOf(idNode);
      if (!val) continue;
      if (String(t).toUpperCase().includes('ISBN')) isbn13 = stripHyphens(val);
      else if (String(t).toUpperCase().includes('NDLBIBID')) ndlBibId = val;
      else if (String(t).toUpperCase().includes('JPNO')) jpno = val;
      else if (String(t).toUpperCase().includes('TOHAN')) tohan = val;
    }

    // 件名（NDC/NDLCとそれ以外）
    let ndc10: string | null = null;
    let ndlc: string | null = null;
    const subjects: string[] = [];

    for (const sNode of asArray(it['subject'])) {
      const t = String(sNode?.['@_type'] ?? '').toUpperCase();
      const val = textOf(sNode);
      if (!val) continue;
      if (t.includes('NDC10')) ndc10 = val;
      else if (t.includes('NDLC')) ndlc = val;
      else subjects.push(val);
    }

    // カテゴリ
    const categories = asArray(it['category']).map((x)=>textOf(x)).filter(Boolean) as string[];

    // seeAlso
    const seeAlso = asArray(it['seeAlso']).map((x)=>x?.['@_resource']).filter(Boolean) as string[];

    // description（HTML）
    const descriptionHtml = textOf(it['description']);

    return {
      title,
      titleKana,
      link,
      creators,
      creatorsKana,
      publisher,
      pubYear,
      issued,
      extent,
      price,
      categories,
      isbn13: isbn13 ?? null,
      ndlBibId: ndlBibId ?? null,
      jpno: jpno ?? null,
      tohanMarcNo: tohan ?? null,
      ndc10: ndc10 ?? null,
      ndlc: ndlc ?? null,
      subjects,
      descriptionHtml: descriptionHtml ?? null,
      seeAlso,
    };
  });

  return { totalResults, startIndex, itemsPerPage, items };
}
