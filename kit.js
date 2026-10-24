/** Drum Lab — personal kit, reference starting points for lug pitch (NOT center pitch). */
export const DRUMS = [
  {id:'tom12',label:'Tom · 12″',type:'tom',lugs:6,primary:true},
  {id:'tom16',label:'Floor Tom · 16″',type:'tom',lugs:8,primary:true},
  {id:'kick20',label:'Kick · 20″',type:'kick',lugs:8,primary:true},
  {id:'snare14',label:'Ludwig Snare · 14″ × 8″',type:'snare',lugs:10,primary:true},
  {id:'tom8',label:'Том · 8″',type:'tom',lugs:6},
  {id:'tom10',label:'Том · 10″',type:'tom',lugs:6},
  {id:'tom13',label:'Том · 13″',type:'tom',lugs:6},
  {id:'tom14',label:'Том · 14″',type:'tom',lugs:8},
  {id:'kick22',label:'Kick · 22″',type:'kick',lugs:10},
  {id:'other',label:'Другой барабан',type:'tom',lugs:8},
];

export const KIT_DRUM_IDS = Object.freeze(DRUMS.filter(d=>d.primary).map(d=>d.id));

export const PRESETS = Object.freeze([
  {
    id:'worship-deep',
    label:'Worship · Deep & Warm',
    description:'Низкий строй, тёплые и объёмные томы; стартовые значения с максимальным резонансом у томов.',
    source:'Авторская адаптация для комплекта 12″ + 16″ + 20″ + 14″×8″ по руководству tune-bot и примеру Worship Drummer.',
    values:{tom12:[185,185],tom16:[121,121],kick20:[64,96],snare14:[240,360]},
  },
  {
    id:'worship-balanced',
    label:'Worship · Balanced',
    description:'Более собранные томы, резонансный пластик выше ударного; значения из таблиц tune-bot.',
    source:'tune-bot Tuning Guide: High Resonance для 12″/16″, Kick 20″ и Snare 14″.',
    values:{tom12:[186,229],tom16:[110,136],kick20:[68,101],snare14:[252,378]},
  },
  {
    id:'elevation-inspired',
    label:'Elevation Worship · адаптация',
    description:'16″ том и snare — опубликованный строй Vincent Baynard; 12″ и 20″ адаптированы под твой комплект.',
    source:'Worship Drummer / Vincent Baynard (16″ и snare), tune-bot Tuning Guide (12″ и Kick 20″).',
    values:{tom12:[193,193],tom16:[121,121],kick20:[64,96],snare14:[250,380]},
  },
]);

/** Updates only desired lug targets. Preserves saved readings, drum configuration and unused profiles. */
export function applyPresetTargets(profiles, presetId) {
  if(!profiles || typeof profiles!=='object') throw new Error('Неверные данные профилей');
  const preset=PRESETS.find(p=>p.id===presetId);
  if(!preset) throw new Error('Неизвестный пресет');
  for(const drumId of KIT_DRUM_IDS){
    const drum=DRUMS.find(d=>d.id===drumId);
    const [batter,reso]=preset.values[drumId];
    const profile=profiles[drumId] ?? (profiles[drumId]={lugCount:drum.lugs,heads:{}});
    if(!profile.heads||typeof profile.heads!=='object')profile.heads={};
    for(const side of ['batter','reso']){
      if(!profile.heads[side]||typeof profile.heads[side]!=='object')profile.heads[side]={};
      if(!Array.isArray(profile.heads[side].lugs))profile.heads[side].lugs=[];
      if(!('center' in profile.heads[side]))profile.heads[side].center=null;
      if(!('centerTarget' in profile.heads[side]))profile.heads[side].centerTarget=null;
    }
    profile.heads.batter.target=batter;
    profile.heads.reso.target=reso;
  }
  return preset;
}
