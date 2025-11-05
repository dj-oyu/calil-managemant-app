import { test, expect, describe } from 'bun:test';
import { convertISBN10to13, parseNdlOpenSearch } from './utility';

describe('convertISBN10to13', () => {
  test('正しいISBN-10をISBN-13に変換する', () => {
    // よく使われるISBN-10のテストケース
    expect(convertISBN10to13('4873117526')).toBe('9784873117522');
    expect(convertISBN10to13('4873119030')).toBe('9784873119038');
    expect(convertISBN10to13('4295013498')).toBe('9784295013495');
  });

  test('10文字でないISBNはそのまま返す', () => {
    expect(convertISBN10to13('123')).toBe('123');
    expect(convertISBN10to13('9784873117522')).toBe('9784873117522'); // すでにISBN-13
    expect(convertISBN10to13('')).toBe('');
  });

  test('チェックデジットが0になるケース', () => {
    // 978 + 000000000 → チェックデジット = 0
    expect(convertISBN10to13('0000000000')).toBe('9780000000002');
  });
});

describe('parseNdlOpenSearch', () => {
  test('空のXMLを正しくパースする', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <totalResults>0</totalResults>
    <startIndex>1</startIndex>
    <itemsPerPage>0</itemsPerPage>
  </channel>
</rss>`;

    const result = parseNdlOpenSearch(xml);

    expect(result.totalResults).toBe(0);
    expect(result.startIndex).toBe(1);
    expect(result.itemsPerPage).toBe(0);
    expect(result.items).toEqual([]);
  });

  test('基本的な書籍情報をパースする', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcndl="http://ndl.go.jp/dcndl/terms/">
  <channel>
    <totalResults>1</totalResults>
    <startIndex>1</startIndex>
    <itemsPerPage>1</itemsPerPage>
    <item>
      <title>プログラミング入門</title>
      <link>https://ndlsearch.ndl.go.jp/books/R123456789</link>
      <dc:creator>山田太郎</dc:creator>
      <dcndl:creatorTranscription>ヤマダ, タロウ</dcndl:creatorTranscription>
      <dc:publisher>技術評論社</dc:publisher>
      <dc:date>2023</dc:date>
      <dcterms:issued>2023.4</dcterms:issued>
      <dc:extent>256p</dc:extent>
      <dcndl:price>2800円</dcndl:price>
      <dc:identifier xsi:type="dcndl:ISBN">978-4-87311-752-2</dc:identifier>
      <dc:identifier xsi:type="dcndl:NDLBibID">123456789</dc:identifier>
      <dc:subject xsi:type="dcndl:NDC10">007.64</dc:subject>
      <dc:subject xsi:type="dcndl:NDLC">YZ</dc:subject>
      <dc:subject>プログラミング</dc:subject>
      <category>技術書</category>
      <description><![CDATA[<p>プログラミングの基礎を学ぶための入門書。</p>]]></description>
    </item>
  </channel>
</rss>`;

    const result = parseNdlOpenSearch(xml);

    expect(result.totalResults).toBe(1);
    expect(result.items.length).toBe(1);

    const item = result.items[0]!;
    expect(item.title).toBe('プログラミング入門');
    expect(item.link).toBe('https://ndlsearch.ndl.go.jp/books/R123456789');
    expect(item.creators).toEqual(['山田太郎']);
    expect(item.creatorsKana).toEqual(['ヤマダ, タロウ']);
    expect(item.publisher).toBe('技術評論社');
    expect(item.pubYear).toBe('2023');
    expect(item.issued).toBe('2023.4');
    expect(item.extent).toBe('256p');
    expect(item.price).toBe('2800円');
    expect(item.isbn13).toBe('9784873117522');
    expect(item.ndlBibId).toBe('123456789');
    expect(item.ndc10).toBe('7.64'); // XMLパーサーが数値として解釈するため先頭の0が削除される
    expect(item.ndlc).toBe('YZ');
    expect(item.subjects).toEqual(['プログラミング']);
    expect(item.categories).toEqual(['技術書']);
    expect(item.descriptionHtml).toContain('プログラミングの基礎を学ぶための入門書');
  });

  test('複数著者を正しくパースする', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <totalResults>1</totalResults>
    <startIndex>1</startIndex>
    <itemsPerPage>1</itemsPerPage>
    <item>
      <title>共著本</title>
      <dc:creator>著者A</dc:creator>
      <dc:creator>著者B</dc:creator>
      <dc:creator>著者C</dc:creator>
    </item>
  </channel>
</rss>`;

    const result = parseNdlOpenSearch(xml);
    const item = result.items[0]!;

    expect(item.creators).toEqual(['著者A', '著者B', '著者C']);
  });

  test('データが欠損している場合の処理', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <totalResults>1</totalResults>
    <startIndex>1</startIndex>
    <itemsPerPage>1</itemsPerPage>
    <item>
      <title>最小限の情報</title>
    </item>
  </channel>
</rss>`;

    const result = parseNdlOpenSearch(xml);
    const item = result.items[0]!;

    expect(item.title).toBe('最小限の情報');
    expect(item.link).toBeNull();
    expect(item.creators).toEqual([]);
    expect(item.publisher).toBeNull();
    expect(item.isbn13).toBeNull();
    expect(item.subjects).toEqual([]);
  });
});
