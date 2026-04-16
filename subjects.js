// ==================== 科目定義 ====================
const SUBJECTS = [
  { id:'sw', name:'社會工作', desc:'專業歷史、本質角色、理論應用、哲學倫理、實務領域',
    categories:[
      { id:'sw_history', name:'社會工作專業發展歷史', desc:'臺灣與國際社工專業化歷程、意涵演變',
        subcategories:[
          {id:'sw_history_intl',  name:'國際社工發展歷史', desc:'COS、睦鄰運動、專業化里程碑'},
          {id:'sw_history_tw',    name:'臺灣社工發展歷史', desc:'日治至今的臺灣社工發展脈絡'},
          {id:'sw_history_meaning', name:'社會工作意涵演變', desc:'社工定義與意涵的歷史演變'},
        ]
      },
      { id:'sw_nature', name:'社會工作的本質、特性與角色功能', desc:'社工定義、功能、角色',
        subcategories:[
          {id:'sw_nature_def',   name:'社會工作本質與特性', desc:'社工的藝術性、科學性、專業性'},
          {id:'sw_nature_role',  name:'社會工作角色與功能', desc:'使能者、仲介者、倡導者、調停者等各角色'},
          {id:'sw_nature_generalist', name:'綜融式社會工作', desc:'通才社工、整合實務'},
          {id:'sw_nature_professional', name:'專業關係與專業化', desc:'專業形成、關係取向、專業角色發展'},
        ]
      },
      { id:'sw_theory', name:'社會工作理論與應用', desc:'各主要理論派別',
        subcategories:[
          {id:'sw_theory_psychosocial', name:'心理暨社會派', desc:'人在情境中、Richmond、診斷學派'},
          {id:'sw_theory_cbt',          name:'認知行為理論', desc:'認知行為治療、理性情緒行為治療'},
          {id:'sw_theory_problem',      name:'問題解決派', desc:'危機處遇、任務中心、焦點解決'},
          {id:'sw_theory_eco',          name:'生態系統理論', desc:'生態觀點、系統理論、社會支持網絡'},
          {id:'sw_theory_empower',      name:'增權與倡導取向', desc:'增權三層面、優勢觀點、倡導'},
          {id:'sw_theory_feminist',     name:'女性主義與批判視角', desc:'自由、激進、社會主義、後現代女性主義'},
          {id:'sw_theory_other',        name:'其他新興理論', desc:'復原力、靈性、文化敏銳、社會建構、敘事'},
        ]
      },
      { id:'sw_ethics', name:'社會工作哲學與倫理', desc:'價值體系、倫理規範、倫理兩難',
        subcategories:[
          {id:'sw_ethics_value',    name:'社會工作價值體系', desc:'NASW六大核心價值、倫理學派'},
          {id:'sw_ethics_code',     name:'專業倫理規範與業務過失', desc:'Reamer三類型、業務過失'},
          {id:'sw_ethics_dilemma',  name:'倫理兩難與抉擇', desc:'倫理優先順序、專業關係與界線、保密'},
        ]
      },
      { id:'sw_practice', name:'社會工作實務領域', desc:'各實務領域核心取向',
        subcategories:[
          {id:'sw_practice_family',    name:'家庭與兒童社會工作', desc:'以家庭為中心、兒童最佳利益、家庭維繫'},
          {id:'sw_practice_youth',     name:'青少年社會工作', desc:'外展工作、優勢觀點、青少年發展'},
          {id:'sw_practice_women',     name:'婦女社會工作', desc:'充能取向、意識化、性別平等'},
          {id:'sw_practice_elderly',   name:'老人社會工作', desc:'在地老化、長照、成功老化'},
          {id:'sw_practice_disability',name:'身心障礙者社會工作', desc:'社會模式、CRPD、去機構化'},
          {id:'sw_practice_medical',   name:'醫務與精神照護社會工作', desc:'心理社會調適、復元、個案管理'},
          {id:'sw_practice_school',    name:'學校與職業社會工作', desc:'生態系統整合、勞工權益'},
          {id:'sw_practice_justice',   name:'司法與多元文化社會工作', desc:'修復式司法、文化謙遜、文化能力'},
          {id:'sw_practice_work',      name:'職業社會工作', desc:'勞工權益、職災服務、友善職場'},
          {id:'sw_practice_other',     name:'多元文化與其他實務議題', desc:'文化能力、成年監護、跨領域服務'},
        ]
      },
    ]
  },

  { id:'ds', name:'社會工作直接服務', desc:'個案工作、團體工作、社區工作',
    categories:[
      { id:'ds_casework', name:'個案工作', desc:'個案工作理論、過程、技術與倫理',
        subcategories:[
          {id:'ds_case_concept', name:'個案工作基本概念', desc:'定義、發展歷史、基本假設'},
          {id:'ds_case_theory',  name:'個案工作實施理論', desc:'Biestek七原則、各派理論'},
          {id:'ds_case_process', name:'個案工作過程', desc:'接案、預估、計畫、介入、評估、結案'},
          {id:'ds_case_skill',   name:'個案工作技術', desc:'面談技巧、同理心、澄清、對質、再框架'},
          {id:'ds_case_ethics',  name:'個案工作倫理', desc:'保密、自決、雙重關係'},
        ]
      },
      { id:'ds_group', name:'團體工作', desc:'團體工作理論、過程、技術與倫理',
        subcategories:[
          {id:'ds_group_concept', name:'團體工作基本概念', desc:'團體類型、團體動力'},
          {id:'ds_group_theory',  name:'團體工作實施理論', desc:'各理論取向'},
          {id:'ds_group_process', name:'團體工作過程與階段', desc:'Garland等五階段、各階段任務'},
          {id:'ds_group_skill',   name:'團體工作技術', desc:'領導者角色、連結、阻斷、催化'},
          {id:'ds_group_ethics',  name:'團體工作倫理', desc:'保密、知情同意、成員保護'},
        ]
      },
      { id:'ds_community', name:'社區工作', desc:'社區工作模式、過程、技術與議題',
        subcategories:[
          {id:'ds_comm_concept', name:'社區工作基本概念', desc:'社區定義、社會資本、社區能力'},
          {id:'ds_comm_model',   name:'社區工作實施模式', desc:'Rothman三模式、其他模式'},
          {id:'ds_comm_process', name:'社區工作過程與技術', desc:'社區分析、需求評估、組織動員'},
          {id:'ds_comm_issue',   name:'社區工作實施議題', desc:'社區發展、社區照顧、社區充能'},
        ]
      },
    ]
  },

  { id:'sp', name:'社會政策與立法', desc:'社會政策理論、主要六法、其餘各法',
    categories:[
      { id:'sp_policy', name:'社會政策', desc:'意識形態、福利模式、政策過程',
        subcategories:[
          {id:'sp_policy_ideology', name:'福利意識形態與模式', desc:'Titmuss、Esping-Andersen、社會民主vs新自由主義vs第三條路'},
          {id:'sp_policy_process',  name:'政策過程與輸送', desc:'政策制訂、福利輸送、給付方式'},
          {id:'sp_policy_org',      name:'福利組織與資源', desc:'公私部門、NPO、新管理主義、契約外包'},
        ]
      },
      { id:'sp_main6', name:'主要六個立法', desc:'六大社福核心法規',
        subcategories:[
          {id:'sp_law_elderly',    name:'老人福利法', desc:'老人定義、機構類型、家庭照顧者支持'},
          {id:'sp_law_children',   name:'兒童及少年福利與權益保障法', desc:'收出養、托育、安置'},
          {id:'sp_law_disability', name:'身心障礙者權益保障法', desc:'CRPD、保護安置、定額進用'},
          {id:'sp_law_dv',         name:'家庭暴力防治法', desc:'保護令類型、社工職責、通報'},
          {id:'sp_law_welfare',    name:'社會救助法', desc:'低收入戶、中低收入戶、補充性原則'},
          {id:'sp_law_sw',         name:'社會工作師法', desc:'執照、事務所、執業規範'},
        ]
      },
      { id:'sp_other', name:'其餘各法', desc:'長照、國民年金、志願服務等各法',
        subcategories:[
          {id:'sp_law_ltc',        name:'長期照顧服務法', desc:'長照財源、服務類型、機構規範'},
          {id:'sp_law_pension',    name:'國民年金法', desc:'投保對象、給付項目、費率調整'},
          {id:'sp_law_volunteer',  name:'志願服務法', desc:'志工權利義務、運用單位責任'},
          {id:'sp_law_sexual',     name:'性別相關法規', desc:'性別工作平等法、性侵害犯罪防治法'},
          {id:'sp_law_child2',     name:'兒少相關法規', desc:'兒少性剝削、特殊境遇家庭、兒少未來帳戶'},
          {id:'sp_law_other2',     name:'其他各法', desc:'精神衛生法、公益勸募條例'},
        ]
      },
    ]
  },

  { id:'hb', name:'人類行為與社會環境', desc:'發展理論、人生階段、多元議題',
    categories:[
      { id:'hb_theory', name:'人類行為發展理論', desc:'個人、家庭、社會結構理論',
        subcategories:[
          {id:'hb_theory_cognitive',  name:'認知與道德發展理論', desc:'Piaget四階段、Kohlberg道德發展、Vygotsky'},
          {id:'hb_theory_psycho',     name:'心理動力理論', desc:'Freud人格結構、Erikson八階段、依附理論'},
          {id:'hb_theory_family',     name:'家庭理論', desc:'家庭系統、家庭生命週期、管教風格'},
          {id:'hb_theory_social',     name:'社會結構理論', desc:'生態系統論、一般系統理論、女性主義理論'},
        ]
      },
      { id:'hb_stages', name:'人生發展階段任務與課題', desc:'各生命階段特徵與任務',
        subcategories:[
          {id:'hb_stage_early',  name:'嬰幼兒期與兒童期', desc:'依附、語言、認知、社會化發展'},
          {id:'hb_stage_youth',  name:'青少年期', desc:'認同發展、同儕關係、個人神話'},
          {id:'hb_stage_adult',  name:'成年期與中年期', desc:'親密關係、生產性、三明治世代'},
          {id:'hb_stage_elder',  name:'老年期', desc:'成功老化、退休、喪慟、死亡恐懼'},
        ]
      },
      { id:'hb_diversity', name:'性別、多元化及新興社會議題', desc:'多元文化、社會階層、家庭議題',
        subcategories:[
          {id:'hb_div_gender',  name:'性別與性取向', desc:'性別認同、LGBTQ、恐同症'},
          {id:'hb_div_race',    name:'種族、族群與社會階層', desc:'種族主義、貧窮理論、社會排除'},
          {id:'hb_div_family',  name:'家庭多元議題', desc:'單親、跨國婚姻、新移民家庭'},
        ]
      },
    ]
  },

  { id:'rm', name:'社會工作研究法', desc:'研究理論、設計、方法、分析與倫理',
    categories:[
      { id:'rm_theory', name:'理論與研究的關連', desc:'概念、變項、因果模型',
        subcategories:[
          {id:'rm_theory_concept', name:'理論、概念與變項', desc:'概念化、操作化、假設、命題'},
          {id:'rm_theory_logic',   name:'歸納法與演繹法', desc:'兩種研究邏輯模式比較'},
          {id:'rm_theory_causal',  name:'因果模型', desc:'自變項、依變項、中介變項、干擾變項'},
        ]
      },
      { id:'rm_design', name:'研究設計', desc:'測量、抽樣、資料蒐集、效度',
        subcategories:[
          {id:'rm_design_measure',  name:'測量與信效度', desc:'測量層次、信度、效度類型'},
          {id:'rm_design_sampling', name:'抽樣方法', desc:'機率抽樣與非機率抽樣各類型'},
          {id:'rm_design_data',     name:'資料蒐集方法', desc:'問卷、訪談、觀察、次級資料'},
        ]
      },
      { id:'rm_methods', name:'研究方法', desc:'調查、質性、評估、行動研究',
        subcategories:[
          {id:'rm_method_survey',  name:'調查研究法', desc:'問卷設計、郵寄調查、電話調查'},
          {id:'rm_method_qual',    name:'質性研究方法', desc:'深度訪談、焦點團體、民族誌、紮根理論'},
          {id:'rm_method_eval',    name:'評估研究', desc:'實驗設計、準實驗、單案研究設計'},
          {id:'rm_method_action',  name:'行動研究', desc:'參與式行動研究、社區本位研究'},
        ]
      },
      { id:'rm_analysis', name:'研究結果判讀、分析與研究倫理', desc:'量化質性分析、研究倫理',
        subcategories:[
          {id:'rm_analysis_quant', name:'量化資料分析', desc:'描述統計、推論統計、顯著性檢定'},
          {id:'rm_analysis_qual',  name:'質性資料分析', desc:'編碼、主題分析、紮根理論分析'},
          {id:'rm_analysis_ethics',name:'研究倫理', desc:'知情同意、保密、研究傷害、IRB'},
        ]
      },
    ]
  },
];
