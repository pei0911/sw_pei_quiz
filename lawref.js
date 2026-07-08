// ==================== 官方法規統計參考資料 ====================
// 來源：使用者提供之官方統計數據（近5年出題數、歷屆出題數、出現年度、最新修正日期）。
// sourceCategory 對應官方網站原本的分類（法律／命令／憲法），僅用於本頁面分組顯示。
// url：若使用者已提供全國法規資料庫正式連結（pcode），則直接使用；
//      若尚未提供（目前為「法律」類 56 部），暫以 Google 搜尋全國法規資料庫作為替代連結，
//      待使用者提供正式 pcode 連結後可再替換為直接全文頁面（urlIsFallback 標記為 true）。
function _lawSearchFallbackUrl(name) {
  return 'https://www.google.com/search?q=' + encodeURIComponent('全國法規資料庫 ' + name);
}

const LAW_REFERENCE = [
  // ---- 憲法（2部）----
  { name:'中華民國憲法', sourceCategory:'憲法', pcode:'A0000001',
    url:'https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=A0000001',
    recent5y:0, alltime:1, yearsAppeared:'106-106', lastAmended:'1947-01-01' },
  { name:'中華民國憲法增修條文', sourceCategory:'憲法', pcode:'A0000002',
    url:'https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=A0000002',
    recent5y:0, alltime:1, yearsAppeared:'106-106', lastAmended:'2005-06-10' },

  // ---- 命令／行政規則（8部）----
  { name:'社區發展工作綱要', sourceCategory:'命令', pcode:'D0050077',
    url:'https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=D0050077',
    recent5y:1, alltime:4, yearsAppeared:'108-111', lastAmended:'2025-07-01' },
  { name:'校園霸凌防制準則', sourceCategory:'命令', pcode:'H0020081',
    url:'https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=H0020081',
    recent5y:0, alltime:2, yearsAppeared:'105-107', lastAmended:'2024-04-17' },
  { name:'老人福利法施行細則', sourceCategory:'命令', pcode:'D0050038',
    url:'https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=D0050038',
    recent5y:0, alltime:1, yearsAppeared:'106-106', lastAmended:'2009-11-19' },
  { name:'協助積極自立脫離貧窮實施辦法', sourceCategory:'命令', pcode:'D0050199',
    url:'https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=D0050199',
    recent5y:0, alltime:1, yearsAppeared:'106-106', lastAmended:'2016-06-06' },
  { name:'社會福利公益信託許可及監督辦法', sourceCategory:'命令', pcode:'D0050192',
    url:'https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=D0050192',
    recent5y:0, alltime:1, yearsAppeared:'107-107', lastAmended:'2017-12-05' },
  { name:'長期照顧服務機構設立標準', sourceCategory:'命令', pcode:'L0070048',
    url:'https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=L0070048',
    recent5y:1, alltime:1, yearsAppeared:'113-113', lastAmended:'2023-06-01' },
  { name:'國民小學與國民中學未入學或中途輟學學生通報及復學輔導辦法', sourceCategory:'命令', pcode:'H0070015',
    url:'https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=H0070015',
    recent5y:1, alltime:1, yearsAppeared:'112-112', lastAmended:'2020-06-08' },
  { name:'專科社會工作師分科甄審及接受繼續教育辦法', sourceCategory:'命令', pcode:'D0050170',
    url:'https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=D0050170',
    recent5y:0, alltime:1, yearsAppeared:'104-104', lastAmended:'2020-01-03' },

  // ---- 法律（56部）---- 連結暫用 Google 搜尋替代，待提供正式 pcode 後更新
  { name:'身心障礙者權益保障法', sourceCategory:'法律', recent5y:24, alltime:76, yearsAppeared:'100-115', lastAmended:'2025-08-01' },
  { name:'社會救助法', sourceCategory:'法律', recent5y:18, alltime:72, yearsAppeared:'100-115', lastAmended:'2015-12-30' },
  { name:'兒童及少年福利與權益保障法', sourceCategory:'法律', recent5y:23, alltime:68, yearsAppeared:'103-115', lastAmended:'2021-01-20' },
  { name:'老人福利法', sourceCategory:'法律', recent5y:23, alltime:55, yearsAppeared:'103-115', lastAmended:'2025-08-01' },
  { name:'社會工作師法', sourceCategory:'法律', recent5y:15, alltime:53, yearsAppeared:'101-115', lastAmended:'2023-06-09' },
  { name:'家庭暴力防治法', sourceCategory:'法律', recent5y:23, alltime:50, yearsAppeared:'103-115', lastAmended:'2023-12-06' },
  { name:'性別平等工作法', sourceCategory:'法律', recent5y:4, alltime:29, yearsAppeared:'100-115', lastAmended:'2023-08-16' },
  { name:'長期照顧服務法', sourceCategory:'法律', recent5y:9, alltime:27, yearsAppeared:'104-115', lastAmended:'2021-06-09' },
  { name:'兒童及少年性剝削防制條例', sourceCategory:'法律', recent5y:9, alltime:26, yearsAppeared:'103-115', lastAmended:'2024-08-07' },
  { name:'保險法', sourceCategory:'法律', recent5y:2, alltime:24, yearsAppeared:'100-114', lastAmended:'2025-06-18' },
  { name:'性侵害犯罪防治法', sourceCategory:'法律', recent5y:12, alltime:23, yearsAppeared:'101-114', lastAmended:'2023-02-15' },
  { name:'特殊境遇家庭扶助條例', sourceCategory:'法律', recent5y:8, alltime:21, yearsAppeared:'103-115', lastAmended:'2021-01-20' },
  { name:'志願服務法', sourceCategory:'法律', recent5y:5, alltime:16, yearsAppeared:'102-115', lastAmended:'2020-01-15' },
  { name:'國民年金法', sourceCategory:'法律', recent5y:5, alltime:14, yearsAppeared:'104-115', lastAmended:'2020-06-03' },
  { name:'精神衛生法', sourceCategory:'法律', recent5y:5, alltime:14, yearsAppeared:'103-115', lastAmended:'2022-12-14' },
  { name:'全民健康保險法', sourceCategory:'法律', recent5y:1, alltime:11, yearsAppeared:'100-111', lastAmended:'2023-06-28' },
  { name:'公益勸募條例', sourceCategory:'法律', recent5y:4, alltime:10, yearsAppeared:'105-115', lastAmended:'2020-01-15' },
  { name:'長期照顧服務機構法人條例', sourceCategory:'法律', recent5y:8, alltime:10, yearsAppeared:'108-114', lastAmended:'2018-01-31' },
  { name:'就業保險法', sourceCategory:'法律', recent5y:1, alltime:10, yearsAppeared:'100-114', lastAmended:'2022-01-12' },
  { name:'兒童及少年未來教育與發展帳戶條例', sourceCategory:'法律', recent5y:4, alltime:9, yearsAppeared:'108-115', lastAmended:'2018-06-06' },
  { name:'原住民族工作權保障法', sourceCategory:'法律', recent5y:0, alltime:7, yearsAppeared:'100-107', lastAmended:'2015-02-04' },
  { name:'民法', sourceCategory:'法律', recent5y:2, alltime:6, yearsAppeared:'106-112', lastAmended:'2021-01-20' },
  { name:'性騷擾防治法', sourceCategory:'法律', recent5y:1, alltime:6, yearsAppeared:'101-114', lastAmended:'2023-08-16' },
  { name:'毒品危害防制條例', sourceCategory:'法律', recent5y:1, alltime:6, yearsAppeared:'104-115', lastAmended:'2022-05-04' },
  { name:'少年事件處理法', sourceCategory:'法律', recent5y:2, alltime:5, yearsAppeared:'106-111', lastAmended:'2023-06-21' },
  { name:'身心障礙者權利公約施行法', sourceCategory:'法律', recent5y:0, alltime:5, yearsAppeared:'104-107', lastAmended:'2014-08-20' },
  { name:'勞工保險條例', sourceCategory:'法律', recent5y:1, alltime:5, yearsAppeared:'104-114', lastAmended:'2026-01-21' },
  { name:'政府採購法', sourceCategory:'法律', recent5y:0, alltime:4, yearsAppeared:'101-109', lastAmended:'2019-05-22' },
  { name:'病人自主權利法', sourceCategory:'法律', recent5y:1, alltime:4, yearsAppeared:'107-111', lastAmended:'2021-01-20' },
  { name:'性別平等教育法', sourceCategory:'法律', recent5y:2, alltime:3, yearsAppeared:'105-114', lastAmended:'2023-08-16' },
  { name:'家事事件法', sourceCategory:'法律', recent5y:1, alltime:3, yearsAppeared:'105-111', lastAmended:'2023-06-21' },
  { name:'財政收支劃分法', sourceCategory:'法律', recent5y:1, alltime:3, yearsAppeared:'103-114', lastAmended:'2025-12-03' },
  { name:'學生輔導法', sourceCategory:'法律', recent5y:1, alltime:3, yearsAppeared:'108-111', lastAmended:'2024-12-18' },
  { name:'公教人員保險法', sourceCategory:'法律', recent5y:0, alltime:2, yearsAppeared:'101-102', lastAmended:'2024-01-03' },
  { name:'民事訴訟法', sourceCategory:'法律', recent5y:0, alltime:2, yearsAppeared:'107-109', lastAmended:'2023-11-29' },
  { name:'刑事訴訟法', sourceCategory:'法律', recent5y:1, alltime:2, yearsAppeared:'101-112', lastAmended:'2026-05-13' },
  { name:'兒童權利公約施行法', sourceCategory:'法律', recent5y:0, alltime:2, yearsAppeared:'106-106', lastAmended:'2019-06-19' },
  { name:'軍事審判法', sourceCategory:'法律', recent5y:1, alltime:2, yearsAppeared:'101-112', lastAmended:'2019-04-03' },
  { name:'勞動基準法', sourceCategory:'法律', recent5y:1, alltime:2, yearsAppeared:'110-114', lastAmended:'2024-07-31' },
  { name:'人民團體法', sourceCategory:'法律', recent5y:1, alltime:1, yearsAppeared:'111-111', lastAmended:'2023-02-08' },
  { name:'中央法規標準法', sourceCategory:'法律', recent5y:0, alltime:1, yearsAppeared:'102-102', lastAmended:'2004-05-19' },
  { name:'中華民國刑法', sourceCategory:'法律', recent5y:0, alltime:1, yearsAppeared:'109-109', lastAmended:'2026-03-13' },
  { name:'公益彩券發行條例', sourceCategory:'法律', recent5y:1, alltime:1, yearsAppeared:'114-114', lastAmended:'2016-11-09' },
  { name:'少年矯正學校設置及教育實施通則', sourceCategory:'法律', recent5y:0, alltime:1, yearsAppeared:'109-109', lastAmended:'2023-01-13' },
  { name:'老年農民福利津貼暫行條例', sourceCategory:'法律', recent5y:0, alltime:1, yearsAppeared:'104-104', lastAmended:'2018-06-13' },
  { name:'住宅法', sourceCategory:'法律', recent5y:0, alltime:1, yearsAppeared:'107-107', lastAmended:'2026-03-04' },
  { name:'所得稅法', sourceCategory:'法律', recent5y:1, alltime:1, yearsAppeared:'111-111', lastAmended:'2025-12-26' },
  { name:'社會秩序維護法', sourceCategory:'法律', recent5y:1, alltime:1, yearsAppeared:'111-111', lastAmended:'2025-06-11' },
  { name:'社會福利基本法', sourceCategory:'法律', recent5y:1, alltime:1, yearsAppeared:'113-113', lastAmended:'2023-05-24' },
  { name:'促進民間參與公共建設法', sourceCategory:'法律', recent5y:0, alltime:1, yearsAppeared:'109-109', lastAmended:'2022-12-21' },
  { name:'消除對婦女一切形式歧視公約施行法', sourceCategory:'法律', recent5y:0, alltime:1, yearsAppeared:'104-104', lastAmended:'2011-06-08' },
  { name:'偏遠地區學校教育發展條例', sourceCategory:'法律', recent5y:1, alltime:1, yearsAppeared:'111-111', lastAmended:'2017-12-06' },
  { name:'國民教育法', sourceCategory:'法律', recent5y:1, alltime:1, yearsAppeared:'111-111', lastAmended:'2023-06-21' },
  { name:'勞工職業災害保險及保護法', sourceCategory:'法律', recent5y:1, alltime:1, yearsAppeared:'114-114', lastAmended:'2021-04-30' },
  { name:'就業服務法', sourceCategory:'法律', recent5y:0, alltime:1, yearsAppeared:'107-107', lastAmended:'2025-01-20' },
  { name:'標準法', sourceCategory:'法律', recent5y:0, alltime:1, yearsAppeared:'102-102', lastAmended:'1997-11-26' },
];

// 幫「法律」類（尚無正式 pcode 連結）補上暫時的 Google 搜尋連結，並標記為 fallback
LAW_REFERENCE.forEach(r => {
  if (!r.url) {
    r.url = _lawSearchFallbackUrl(r.name);
    r.urlIsFallback = true;
  }
});

function findLawReference(name) {
  return LAW_REFERENCE.find(r => r.name === name) || null;
}
