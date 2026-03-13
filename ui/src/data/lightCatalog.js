export const LIGHT_CATALOG = [
  {
    category: 'speedlights',
    label: 'Speedlights',
    icon: '\u26A1',
    items: [
      // Godox
      { value: 'godox_v1',         vendor: 'Godox',      model: 'V1',         gearProfile: 'speedlight', qualityTier: 2 },
      { value: 'godox_v860iii',    vendor: 'Godox',      model: 'V860III',    gearProfile: 'speedlight', qualityTier: 2 },
      { value: 'godox_tt685ii',    vendor: 'Godox',      model: 'TT685II',    gearProfile: 'speedlight', qualityTier: 2 },
      { value: 'godox_tt600',      vendor: 'Godox',      model: 'TT600',      gearProfile: 'speedlight', qualityTier: 1 },
      // Profoto
      { value: 'profoto_a10',      vendor: 'Profoto',    model: 'A10',        gearProfile: 'speedlight', qualityTier: 3 },
      { value: 'profoto_a2',       vendor: 'Profoto',    model: 'A2',         gearProfile: 'speedlight', qualityTier: 3 },
      // Canon (current)
      { value: 'canon_el1',        vendor: 'Canon',      model: 'EL-1',       gearProfile: 'speedlight', qualityTier: 2 },
      { value: 'canon_600exii',    vendor: 'Canon',      model: '600EX II-RT', gearProfile: 'speedlight', qualityTier: 2 },
      // Canon (legacy)
      { value: 'canon_600ex',      vendor: 'Canon',      model: '600EX-RT',   gearProfile: 'speedlight', qualityTier: 2 },
      { value: 'canon_580exii',    vendor: 'Canon',      model: '580EX II',   gearProfile: 'speedlight', qualityTier: 2 },
      { value: 'canon_580ex',      vendor: 'Canon',      model: '580EX',      gearProfile: 'speedlight', qualityTier: 1 },
      { value: 'canon_430exiii',   vendor: 'Canon',      model: '430EX III-RT', gearProfile: 'speedlight', qualityTier: 1 },
      { value: 'canon_430exii',    vendor: 'Canon',      model: '430EX II',   gearProfile: 'speedlight', qualityTier: 1 },
      { value: 'canon_mr14exii',   vendor: 'Canon',      model: 'MR-14EX II', gearProfile: 'ring_light', qualityTier: 2 },
      // Nikon
      { value: 'nikon_sb5000',     vendor: 'Nikon',      model: 'SB-5000',    gearProfile: 'speedlight', qualityTier: 2 },
      { value: 'nikon_sb700',      vendor: 'Nikon',      model: 'SB-700',     gearProfile: 'speedlight', qualityTier: 2 },
      // Sony
      { value: 'sony_f60rm2',      vendor: 'Sony',       model: 'F60RM2',     gearProfile: 'speedlight', qualityTier: 2 },
      { value: 'sony_f46rm',       vendor: 'Sony',       model: 'F46RM',      gearProfile: 'speedlight', qualityTier: 2 },
      // Yongnuo
      { value: 'yongnuo_yn685ii',  vendor: 'Yongnuo',    model: 'YN685 II',   gearProfile: 'speedlight', qualityTier: 1 },
      { value: 'yongnuo_yn600exii',vendor: 'Yongnuo',    model: 'YN600EX-RT II', gearProfile: 'speedlight', qualityTier: 1 },
      { value: 'yongnuo_yn560iv',  vendor: 'Yongnuo',    model: 'YN560 IV',   gearProfile: 'speedlight', qualityTier: 1 },
      // Neewer
      { value: 'neewer_nw670',     vendor: 'Neewer',     model: 'NW-670',     gearProfile: 'speedlight', qualityTier: 1 },
      { value: 'neewer_q4',        vendor: 'Neewer',     model: 'Q4',         gearProfile: 'speedlight', qualityTier: 1 },
      // Flashpoint
      { value: 'flashpoint_zoom_lion', vendor: 'Flashpoint', model: 'Zoom Li-on R2', gearProfile: 'speedlight', qualityTier: 1 },
    ],
  },
  {
    category: 'portable_strobes',
    label: 'Portable Strobes',
    icon: '\u{1F50B}',
    items: [
      // Godox
      { value: 'godox_ad200',      vendor: 'Godox',      model: 'AD200',      gearProfile: 'strobe_mono', qualityTier: 2 },
      { value: 'godox_ad200pro',   vendor: 'Godox',      model: 'AD200 Pro',  gearProfile: 'strobe_mono', qualityTier: 2 },
      { value: 'godox_ad300',      vendor: 'Godox',      model: 'AD300 Pro',  gearProfile: 'strobe_mono', qualityTier: 3 },
      { value: 'godox_ad400',      vendor: 'Godox',      model: 'AD400 Pro',  gearProfile: 'strobe_mono', qualityTier: 3 },
      { value: 'godox_ad600',      vendor: 'Godox',      model: 'AD600 Pro',  gearProfile: 'strobe_mono', qualityTier: 3 },
      { value: 'godox_ad600bm2',   vendor: 'Godox',      model: 'AD600BM II', gearProfile: 'strobe_mono', qualityTier: 3 },
      // Profoto (current)
      { value: 'profoto_b10',      vendor: 'Profoto',    model: 'B10',        gearProfile: 'strobe_mono', qualityTier: 4 },
      { value: 'profoto_b10x',     vendor: 'Profoto',    model: 'B10X',       gearProfile: 'strobe_mono', qualityTier: 4 },
      { value: 'profoto_b1x',      vendor: 'Profoto',    model: 'B1X',        gearProfile: 'strobe_mono', qualityTier: 4 },
      { value: 'profoto_b2',       vendor: 'Profoto',    model: 'B2',         gearProfile: 'strobe_mono', qualityTier: 4 },
      // Profoto (legacy — Leibovitz, Heisler, Adler era)
      { value: 'profoto_b1',       vendor: 'Profoto',    model: 'B1',         gearProfile: 'strobe_mono', qualityTier: 4 },
      { value: 'profoto_acuteb',    vendor: 'Profoto',   model: 'AcuteB 600R', gearProfile: 'strobe_mono', qualityTier: 3 },
      // Flashpoint / Godox rebrand
      { value: 'flashpoint_xplor600', vendor: 'Flashpoint', model: 'XPLOR 600', gearProfile: 'strobe_mono', qualityTier: 2 },
      { value: 'flashpoint_xplor300', vendor: 'Flashpoint', model: 'XPLOR 300', gearProfile: 'strobe_mono', qualityTier: 2 },
      // Westcott
      { value: 'westcott_fj400',   vendor: 'Westcott',   model: 'FJ400',      gearProfile: 'strobe_mono', qualityTier: 3 },
      { value: 'westcott_fj200',   vendor: 'Westcott',   model: 'FJ200',      gearProfile: 'strobe_mono', qualityTier: 2 },
      // Elinchrom
      { value: 'elinchrom_five',   vendor: 'Elinchrom',  model: 'FIVE',       gearProfile: 'strobe_mono', qualityTier: 4 },
      { value: 'elinchrom_three',  vendor: 'Elinchrom',  model: 'THREE',      gearProfile: 'strobe_mono', qualityTier: 3 },
    ],
  },
  {
    category: 'studio_strobes',
    label: 'Studio Strobes',
    icon: '\u{1F50C}',
    items: [
      // Profoto (current)
      { value: 'profoto_d2',       vendor: 'Profoto',      model: 'D2',         gearProfile: 'strobe_pack', qualityTier: 5 },
      { value: 'profoto_d3',       vendor: 'Profoto',      model: 'D3',         gearProfile: 'strobe_pack', qualityTier: 5 },
      { value: 'profoto_pro11',    vendor: 'Profoto',      model: 'Pro-11',     gearProfile: 'strobe_pack', qualityTier: 5 },
      // Profoto (legacy — the workhorses behind Leibovitz, Heisler, Avedon)
      { value: 'profoto_pro7a',    vendor: 'Profoto',      model: 'Pro-7a',     gearProfile: 'strobe_pack', qualityTier: 4 },
      { value: 'profoto_pro8a',    vendor: 'Profoto',      model: 'Pro-8a',     gearProfile: 'strobe_pack', qualityTier: 5 },
      { value: 'profoto_pro10',    vendor: 'Profoto',      model: 'Pro-10',     gearProfile: 'strobe_pack', qualityTier: 5 },
      { value: 'profoto_d1',       vendor: 'Profoto',      model: 'D1',         gearProfile: 'strobe_pack', qualityTier: 4 },
      { value: 'profoto_d4',       vendor: 'Profoto',      model: 'D4',         gearProfile: 'strobe_pack', qualityTier: 4 },
      { value: 'profoto_acute600', vendor: 'Profoto',      model: 'Acute 600',  gearProfile: 'strobe_pack', qualityTier: 3 },
      { value: 'profoto_acute1200',vendor: 'Profoto',      model: 'Acute 1200', gearProfile: 'strobe_pack', qualityTier: 4 },
      { value: 'profoto_compact600',vendor:'Profoto',      model: 'ComPact 600', gearProfile: 'strobe_mono', qualityTier: 3 },
      // Elinchrom
      { value: 'elinchrom_elc',    vendor: 'Elinchrom',    model: 'ELC 500',    gearProfile: 'strobe_pack', qualityTier: 4 },
      { value: 'elinchrom_dlite',  vendor: 'Elinchrom',    model: 'D-Lite RX4', gearProfile: 'strobe_mono', qualityTier: 2 },
      // Broncolor
      { value: 'broncolor_siros',  vendor: 'Broncolor',    model: 'Siros 800',  gearProfile: 'strobe_pack', qualityTier: 5 },
      { value: 'broncolor_siros400',vendor:'Broncolor',    model: 'Siros 400',  gearProfile: 'strobe_pack', qualityTier: 5 },
      // Paul C. Buff
      { value: 'pcb_einstein',     vendor: 'Paul C. Buff', model: 'Einstein E640', gearProfile: 'strobe_mono', qualityTier: 3 },
      { value: 'pcb_digibee',      vendor: 'Paul C. Buff', model: 'DigiBee DB800', gearProfile: 'strobe_mono', qualityTier: 3 },
      { value: 'pcb_alienbee400',  vendor: 'Paul C. Buff', model: 'AlienBees B400',  gearProfile: 'strobe_mono', qualityTier: 1 },
      { value: 'pcb_alienbee',     vendor: 'Paul C. Buff', model: 'AlienBees B800', gearProfile: 'strobe_mono', qualityTier: 2 },
      { value: 'pcb_alienbee1600', vendor: 'Paul C. Buff', model: 'AlienBees B1600', gearProfile: 'strobe_mono', qualityTier: 2 },
      { value: 'pcb_whitelightning', vendor: 'Paul C. Buff', model: 'White Lightning X1600', gearProfile: 'strobe_mono', qualityTier: 2 },
      // Godox
      { value: 'godox_qt600iii',   vendor: 'Godox',        model: 'QT600III',   gearProfile: 'strobe_pack', qualityTier: 3 },
      { value: 'godox_sk400ii',    vendor: 'Godox',        model: 'SK400II',    gearProfile: 'strobe_mono', qualityTier: 2 },
      { value: 'godox_ms300',      vendor: 'Godox',        model: 'MS300',      gearProfile: 'strobe_mono', qualityTier: 2 },
      { value: 'godox_dp600iii',   vendor: 'Godox',        model: 'DP600III',   gearProfile: 'strobe_pack', qualityTier: 3 },
      // Bowens
      { value: 'bowens_gemini',    vendor: 'Bowens',       model: 'Gemini 500R', gearProfile: 'strobe_mono', qualityTier: 3 },
      // Hensel
      { value: 'hensel_expert_d',  vendor: 'Hensel',       model: 'Expert D 500', gearProfile: 'strobe_mono', qualityTier: 3 },
    ],
  },
  {
    category: 'led_continuous',
    label: 'LED Continuous',
    icon: '\u2600\uFE0F',
    items: [
      // Aputure
      { value: 'aputure_600d',      vendor: 'Aputure',   model: '600d Pro',    gearProfile: 'led_cob', qualityTier: 4 },
      { value: 'aputure_600x',      vendor: 'Aputure',   model: '600x Pro',    gearProfile: 'led_cob', qualityTier: 4 },
      { value: 'aputure_300d',      vendor: 'Aputure',   model: '300d II',     gearProfile: 'led_cob', qualityTier: 4 },
      { value: 'aputure_300x',      vendor: 'Aputure',   model: '300x',        gearProfile: 'led_cob', qualityTier: 4 },
      { value: 'aputure_120d',      vendor: 'Aputure',   model: '120d II',     gearProfile: 'led_cob', qualityTier: 3 },
      { value: 'aputure_60d',       vendor: 'Aputure',   model: 'Amaran 60d',  gearProfile: 'led_cob', qualityTier: 2 },
      { value: 'aputure_200d',      vendor: 'Aputure',   model: 'Amaran 200d', gearProfile: 'led_cob', qualityTier: 3 },
      // Nanlite
      { value: 'nanlite_forza720b', vendor: 'Nanlite',   model: 'Forza 720B',  gearProfile: 'led_cob', qualityTier: 4 },
      { value: 'nanlite_forza500',  vendor: 'Nanlite',   model: 'Forza 500',   gearProfile: 'led_cob', qualityTier: 3 },
      { value: 'nanlite_forza300b', vendor: 'Nanlite',   model: 'Forza 300B',  gearProfile: 'led_cob', qualityTier: 3 },
      { value: 'nanlite_forza300',  vendor: 'Nanlite',   model: 'Forza 300',   gearProfile: 'led_cob', qualityTier: 3 },
      { value: 'nanlite_forza150',  vendor: 'Nanlite',   model: 'Forza 150',   gearProfile: 'led_cob', qualityTier: 2 },
      { value: 'nanlite_forza60',   vendor: 'Nanlite',   model: 'Forza 60',    gearProfile: 'led_cob', qualityTier: 2 },
      // Godox
      { value: 'godox_sl300iii',    vendor: 'Godox',     model: 'SL300III',     gearProfile: 'led_cob', qualityTier: 3 },
      { value: 'godox_sl200iii',    vendor: 'Godox',     model: 'SL200III',     gearProfile: 'led_cob', qualityTier: 3 },
      { value: 'godox_sl150iii',    vendor: 'Godox',     model: 'SL150III',     gearProfile: 'led_cob', qualityTier: 2 },
      { value: 'godox_ml60bi',      vendor: 'Godox',     model: 'ML60Bi',       gearProfile: 'led_cob', qualityTier: 2 },
      // SmallRig
      { value: 'smallrig_rc350b',   vendor: 'SmallRig',  model: 'RC 350B',      gearProfile: 'led_cob', qualityTier: 2 },
      { value: 'smallrig_rc120b',   vendor: 'SmallRig',  model: 'RC 120B',      gearProfile: 'led_cob', qualityTier: 2 },
      // Neewer
      { value: 'neewer_cb200b',     vendor: 'Neewer',    model: 'CB200B',       gearProfile: 'led_cob', qualityTier: 2 },
      { value: 'neewer_cb100',      vendor: 'Neewer',    model: 'CB100',        gearProfile: 'led_cob', qualityTier: 1 },
    ],
  },
  {
    category: 'led_panels',
    label: 'LED Panels',
    icon: '\u{1F7E6}',
    items: [
      // Aputure
      { value: 'aputure_nova_p300c', vendor: 'Aputure',  model: 'Nova P300c',   gearProfile: 'led_panel', qualityTier: 4 },
      { value: 'aputure_nova_p600c', vendor: 'Aputure',  model: 'Nova P600c',   gearProfile: 'led_panel', qualityTier: 4 },
      { value: 'aputure_amaran_f22c',vendor: 'Aputure',  model: 'Amaran F22c',  gearProfile: 'led_panel', qualityTier: 3 },
      // Nanlite
      { value: 'nanlite_pavoslim',   vendor: 'Nanlite',  model: 'PavoSlim 120C', gearProfile: 'led_panel', qualityTier: 3 },
      { value: 'nanlite_mixpanel150',vendor: 'Nanlite',  model: 'MixPanel 150',  gearProfile: 'led_panel', qualityTier: 3 },
      // Westcott
      { value: 'westcott_flex',      vendor: 'Westcott', model: 'Flex Cine',     gearProfile: 'led_panel', qualityTier: 3 },
      { value: 'westcott_ice_light', vendor: 'Westcott', model: 'Ice Light',     gearProfile: 'led_panel', qualityTier: 2 },
      // Neewer
      { value: 'neewer_660',         vendor: 'Neewer',   model: '660 PRO II',    gearProfile: 'led_panel', qualityTier: 2 },
      { value: 'neewer_530',         vendor: 'Neewer',   model: 'NL-530',        gearProfile: 'led_panel', qualityTier: 2 },
      // Litepanels
      { value: 'litepanels_gemini',  vendor: 'Litepanels', model: 'Gemini 2x1',  gearProfile: 'led_panel', qualityTier: 4 },
      { value: 'litepanels_astra',   vendor: 'Litepanels', model: 'Astra 6X',    gearProfile: 'led_panel', qualityTier: 4 },
      // SmallRig
      { value: 'smallrig_p200',     vendor: 'SmallRig',  model: 'P200',          gearProfile: 'led_panel', qualityTier: 2 },
    ],
  },
  {
    category: 'specialty',
    label: 'Specialty',
    icon: '\u{1F52E}',
    items: [
      // Ring lights
      { value: 'ring_light',         vendor: 'Generic',   model: 'Ring Light',     gearProfile: 'ring_light', qualityTier: 1 },
      { value: 'godox_lr160',        vendor: 'Godox',     model: 'LR160 Ring',     gearProfile: 'ring_light', qualityTier: 2 },
      // Ellipsoidal / ERS (gobo & projection)
      { value: 'etc_source_four',    vendor: 'ETC',       model: 'Source Four',      gearProfile: 'ellipsoidal', qualityTier: 4 },
      { value: 'etc_source_four_led',vendor: 'ETC',       model: 'Source Four LED',  gearProfile: 'ellipsoidal', qualityTier: 5 },
      { value: 'etc_source_four_jr', vendor: 'ETC',       model: 'Source Four Jr',   gearProfile: 'ellipsoidal', qualityTier: 3 },
      { value: 'etc_colorsource',    vendor: 'ETC',       model: 'ColorSource Spot', gearProfile: 'ellipsoidal', qualityTier: 3 },
      // Tube lights
      { value: 'nanlite_pavotube',   vendor: 'Nanlite',   model: 'PavoTube II 30X', gearProfile: 'tube_light', qualityTier: 3 },
      { value: 'nanlite_pavotube6c', vendor: 'Nanlite',   model: 'PavoTube II 6C',  gearProfile: 'tube_light', qualityTier: 2 },
      { value: 'aputure_amaran_t4c', vendor: 'Aputure',   model: 'Amaran T4c',      gearProfile: 'tube_light', qualityTier: 3 },
      { value: 'aputure_amaran_t2c', vendor: 'Aputure',   model: 'Amaran T2c',      gearProfile: 'tube_light', qualityTier: 2 },
      { value: 'quasar_q50',         vendor: 'Quasar Science', model: 'Q50',         gearProfile: 'tube_light', qualityTier: 4 },
      // Flex / mat lights
      { value: 'westcott_flex_mat',  vendor: 'Westcott',  model: 'Flex Mat',        gearProfile: 'led_panel', qualityTier: 3 },
      { value: 'nanlite_compac200',  vendor: 'Nanlite',   model: 'Compac 200',      gearProfile: 'led_panel', qualityTier: 2 },
    ],
  },
  {
    category: 'triggers',
    label: 'Remote Triggers / Sync',
    icon: '\u{1F4E1}',
    section: 'accessories',
    items: [
      // Godox X system
      { value: 'godox_x2t',        vendor: 'Godox',         model: 'X2T',            gearProfile: 'trigger', qualityTier: 2 },
      { value: 'godox_xpro_ii',    vendor: 'Godox',         model: 'XPro II',        gearProfile: 'trigger', qualityTier: 3 },
      { value: 'godox_x1r',        vendor: 'Godox',         model: 'X1R (receiver)', gearProfile: 'trigger', qualityTier: 2 },
      // Profoto
      { value: 'profoto_connect',   vendor: 'Profoto',      model: 'Connect Pro',    gearProfile: 'trigger', qualityTier: 4 },
      { value: 'profoto_air_remote',vendor: 'Profoto',      model: 'Air Remote TTL', gearProfile: 'trigger', qualityTier: 4 },
      { value: 'profoto_air_sync',  vendor: 'Profoto',      model: 'Air Sync',       gearProfile: 'trigger', qualityTier: 3 },
      // PocketWizard
      { value: 'pw_plus_iv',        vendor: 'PocketWizard', model: 'Plus IV',        gearProfile: 'trigger', qualityTier: 4 },
      { value: 'pw_plus_iii',       vendor: 'PocketWizard', model: 'Plus III',       gearProfile: 'trigger', qualityTier: 3 },
      { value: 'pw_flextt5',        vendor: 'PocketWizard', model: 'FlexTT5',        gearProfile: 'trigger', qualityTier: 4 },
      { value: 'pw_minitt1',        vendor: 'PocketWizard', model: 'MiniTT1',        gearProfile: 'trigger', qualityTier: 3 },
      { value: 'pw_multimax_ii',    vendor: 'PocketWizard', model: 'MultiMAX II',    gearProfile: 'trigger', qualityTier: 5 },
      // Elinchrom
      { value: 'elinchrom_skyport',vendor: 'Elinchrom',     model: 'Skyport Plus HS', gearProfile: 'trigger', qualityTier: 3 },
      // Broncolor
      { value: 'broncolor_rfs2',   vendor: 'Broncolor',     model: 'RFS 2.2',       gearProfile: 'trigger', qualityTier: 4 },
      // Yongnuo
      { value: 'yongnuo_yn622ii',  vendor: 'Yongnuo',       model: 'YN-622C II',    gearProfile: 'trigger', qualityTier: 1 },
      { value: 'yongnuo_yn560tx',  vendor: 'Yongnuo',       model: 'YN560-TX Pro',  gearProfile: 'trigger', qualityTier: 1 },
      // Flashpoint / Godox R2
      { value: 'flashpoint_r2pro', vendor: 'Flashpoint',     model: 'R2 Pro II',     gearProfile: 'trigger', qualityTier: 2 },
    ],
  },
  {
    category: 'light_meters',
    label: 'Light Meters',
    icon: '\u{1F4CF}',
    section: 'accessories',
    items: [
      // Sekonic
      { value: 'sekonic_l858d',    vendor: 'Sekonic',  model: 'L-858D Speedmaster',  gearProfile: 'light_meter', qualityTier: 5 },
      { value: 'sekonic_l478d',    vendor: 'Sekonic',  model: 'L-478D LiteMaster Pro', gearProfile: 'light_meter', qualityTier: 4 },
      { value: 'sekonic_l308x',    vendor: 'Sekonic',  model: 'L-308X Flashmate',    gearProfile: 'light_meter', qualityTier: 3 },
      { value: 'sekonic_c800',     vendor: 'Sekonic',  model: 'C-800 SpectroMaster', gearProfile: 'light_meter', qualityTier: 5 },
      { value: 'sekonic_c700',     vendor: 'Sekonic',  model: 'C-700 SpectroMaster', gearProfile: 'light_meter', qualityTier: 4 },
      // Gossen
      { value: 'gossen_digipro_f2',vendor: 'Gossen',   model: 'Digipro F2',          gearProfile: 'light_meter', qualityTier: 3 },
      // Kenko
      { value: 'kenko_km8000',     vendor: 'Kenko',    model: 'KFM-8000',            gearProfile: 'light_meter', qualityTier: 3 },
      // App-based
      { value: 'lumu_power2',      vendor: 'Lumu',     model: 'Power 2',             gearProfile: 'light_meter', qualityTier: 2 },
    ],
  },
];

/** Build a reverse map from item value to gearProfile for payload building */
const PROFILE_MAP = {};
LIGHT_CATALOG.forEach(cat => {
  cat.items.forEach(item => {
    PROFILE_MAP[item.value] = item.gearProfile;
  });
});

export function getGearProfile(lightType) {
  return PROFILE_MAP[lightType] || lightType;
}

/** Look up a catalog item by its value key. Returns { value, vendor, model, gearProfile, qualityTier } or null. */
export function getLightDetails(lightType) {
  for (const cat of LIGHT_CATALOG) {
    const item = cat.items.find(i => i.value === lightType);
    if (item) return item;
  }
  return null;
}

/** Get quality tier (1-5) for a light type. Higher = better quality output. */
export function getQualityTier(lightType) {
  const item = getLightDetails(lightType);
  return item?.qualityTier ?? 1;
}
