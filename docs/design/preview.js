const icons = {
  star:'<path d="m12 2 2.8 7.2L22 12l-7.2 2.8L12 22l-2.8-7.2L2 12l7.2-2.8Z"/><circle cx="12" cy="12" r="2"/>',
  collection:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 9v11"/>',
  repository:'<path d="M5 3h12a2 2 0 0 1 2 2v16H7a3 3 0 0 1 0-6h12M5 3v15M9 7h6"/>',
  settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="var(--rail)"/><circle cx="15" cy="17" r="3" fill="var(--rail)"/>',
  branch:'<path d="M7 6v11M7 10c0 4 10 0 10 5"/><circle cx="7" cy="4" r="2"/><circle cx="7" cy="19" r="2"/><circle cx="17" cy="17" r="2"/>',
  search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
  arrow:'<path d="m9 6 6 6-6 6"/>',
  spark:'<path d="m10 3 2.5 6.5L19 12l-6.5 2.5L10 21l-2.5-6.5L1 12l6.5-2.5ZM20 2v5m-2.5-2.5h5"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  cloud:'<path d="M6 18a4 4 0 0 1-1-7.8A7 7 0 0 1 18 8a5 5 0 0 1 0 10H6Z"/>',
  external:'<path d="M14 3h7v7m0-7L10 14M10 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.star}</svg>`;
const repos = [
  { owner:'langfuse', name:'langfuse', letter:'lf', group:'AI', language:'TypeScript', description:'把 LLM 应用的每一次调用，看得更清楚。', detail:'用于 LLM 应用的追踪、评估与提示词管理。把分散的调用过程整理成可观察的上下文，帮助理解应用的运行情况。' },
  { owner:'syncthing', name:'syncthing', letter:'S', group:'工具', language:'Go', description:'不经过中央云端，在自己的设备之间同步文件。', detail:'开源的持续文件同步工具。适合希望由自己掌握文件存储与设备连接方式的场景。' },
  { owner:'penpot', name:'penpot', letter:'P', group:'设计', language:'Clojure', description:'为设计与开发协作而生的开源设计平台。', detail:'面向产品团队的开源设计平台，连接界面设计、原型制作与协作流程。' },
  { owner:'Tencent', name:'WeKnora', letter:'W', group:'AI', language:'Go', description:'把散落的文档，整理成可以提问的知识库。', detail:'面向文档理解与检索的知识平台，用于组织资料与探索基于知识库的 AI 工作流。' },
  { owner:'open-webui', name:'open-webui', letter:'ow', group:'AI', language:'Python', description:'一个由自己掌控的 AI 对话工作台。', detail:'用于连接模型服务的开源 AI 界面，提供统一的交互入口和自部署的使用方式。' },
  { owner:'Stirling-Tools', name:'Stirling-PDF', letter:'SP', group:'工具', language:'Java', description:'将常用 PDF 操作，收进一个自己的工具箱。', detail:'集合常用 PDF 处理操作的应用，可用来探索本地或自部署的文档处理工作流。' },
];
let world='folio', mode='light', filter='全部', query='', selected=repos[0];
const media=matchMedia('(prefers-color-scheme: dark)');
const main=document.querySelector('#main');
const escape=value=>String(value).replace(/[&<>"']/g, char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const view=()=>['detail','settings'].includes(location.hash.slice(1))?location.hash.slice(1):'library';
const art=()=>`<div class="quiet-art world-symbol" aria-hidden="true"><svg viewBox="0 0 140 90"><g class="folio-lines"><path d="M19 24h32l15 9 15-9h32v45H81l-15 9-15-9H19Z"/><path d="M66 33v45M28 34h20M28 43h23M28 52h18M83 35h20M83 44h20M83 53h14"/><path d="m116 9 2 6 6 2-6 2-2 6-2-6-6-2 6-2Z"/></g><g class="orbital"><ellipse cx="73" cy="45" rx="54" ry="21" transform="rotate(-25 73 45)"/><ellipse cx="73" cy="45" rx="20" ry="35" transform="rotate(-25 73 45)"/><circle cx="73" cy="45" r="5" fill="currentColor"/><circle cx="24" cy="65" r="4" fill="var(--paper)"/><circle cx="94" cy="21" r="3" fill="currentColor"/></g></svg></div>`;
const header=(label)=>`<div class="page-line"><span>收藏工作区 / ${label}</span><span>${icon('lock')}仅此设备 · 视觉演示</span></div>`;
function library(){
  return `${header('全部收藏')}<div class="page-title"><div><h1>${world==='folio'?'让好项目，随手可得。':'收藏，不再迷航。'}</h1><p>不止存下一个 Star，更留住下一次想起它的理由。</p></div>${art()}</div><div class="search-row"><label class="search">${icon('search')}<input id="search" aria-label="搜索演示收藏" placeholder="搜索项目、描述，或用自然语言寻找…" value="${escape(query)}"><span class="key-hint">本地搜索演示</span></label><button class="outline-button" data-notice="AI 分类将在后续阶段接入，当前不会发送请求。">${icon('spark')}AI 整理</button></div><div class="filter-strip">${['全部','AI','设计','工具'].map(name=>`<button class="${filter===name?'active':''}" data-filter="${name}">${name==='全部'?'所有项目':name}</button>`).join('')}<span class="list-caption" id="result-count"></span></div><div class="library-columns"><div id="repo-list" class="repo-list"></div><aside class="side-note library-note"><h2>不只一种整理方式</h2><p>一个项目，可以有多个位置。用自己的维度，留下和它的关系。</p><div class="dimension"><h3>使用状态</h3><div class="tags"><span class="tag">正在使用</span><span class="tag">待探索</span></div></div><div class="dimension"><h3>部署方式</h3><div class="tags"><span class="tag">可自部署</span><span class="tag">本地优先</span></div></div><div class="dimension"><h3>项目用途</h3><div class="tags"><span class="tag">工作工具</span><span class="tag">灵感来源</span></div></div><div class="local-label">${icon('lock')}维度与标签仅保存在本地</div><div class="note-bottom">Less searching.<br>More discovering.</div></aside></div>`;
}
function renderRows(){
  const matches=repos.filter(repo=>(filter==='全部'||repo.group===filter)&&`${repo.owner} ${repo.name} ${repo.description}`.toLowerCase().includes(query.toLowerCase()));
  document.querySelector('#result-count').textContent=`${matches.length} 个演示项目`;
  document.querySelector('#repo-list').innerHTML=matches.length?matches.map(repo=>`<button class="repo-row" data-repo="${escape(repo.name)}" aria-label="查看 ${escape(repo.name)} 演示详情"><span class="repo-monogram">${repo.letter}</span><span class="repo-copy"><div class="repo-name"><span class="owner">${repo.owner} / </span>${repo.name}</div><div class="repo-description">${repo.description}</div><div class="repo-meta"><span><i class="language-dot"></i>${repo.language}</span><span>${repo.group}</span><span>演示元数据</span></div></span>${icon('arrow')}</button>`).join(''):'<p class="empty-results">没有找到匹配的演示项目。试试项目名称或描述中的关键词。</p>';
}
function detail(){
  return `${header('仓库详情')}<div class="page-title"><div class="detail-heading"><span class="repo-monogram">${selected.letter}</span><div><small>${selected.owner} /</small><h1>${selected.name}</h1></div></div><button class="outline-button" data-notice="此按钮展示未来的 GitHub 入口，本预览不打开外部网站。">${icon('external')}GitHub</button></div><p class="setting-note">${selected.description}</p><div class="view-tabs"><span class="active">收藏手册</span><span>项目概览</span><span>动态记录</span></div><div class="detail-columns"><article class="article"><h2>为什么收藏它</h2><p>${selected.detail}</p><h3>适合什么时候打开</h3><ul><li>为正在做的项目寻找成熟的开源方案。</li><li>研究实现方式，记录值得参考的产品细节。</li><li>与同类工具一起比较，找到更符合自己需求的选择。</li></ul><blockquote>给未来的自己：不急着研究完，先记下这次收藏的原因。</blockquote><h3>我的下一步</h3><p>阅读项目文档，了解部署条件，再决定是否放入“正在使用”。</p><div class="source-note">此手册为人工编写的视觉示例，未调用 AI，也不是对当前仓库状态的实时分析。</div></article><aside class="side-note"><h2>它在我的收藏里</h2><div class="dimension"><h3>GitHub 分类 · 演示</h3><div class="tags"><span class="tag">${selected.group}项目</span></div></div><div class="dimension"><h3>使用状态 · 本地</h3><div class="tags"><span class="tag">待探索</span></div></div><div class="dimension"><h3>关注理由 · 本地</h3><div class="tags"><span class="tag">值得研究</span><span class="tag">灵感来源</span></div></div><button class="small-link" style="background:none;border:0" data-notice="手册编辑与分类操作将在后续阶段接入。">编辑整理方式 ${icon('arrow')}</button><div class="local-label">${icon('lock')}私人手册不会自动公开</div></aside></div>`;
}
function settings(){
 return `${header('设置与偏好')}<div class="page-title"><div><h1>让工作区，更像你。</h1><p>自己的主题、自己的模型，自己的整理习惯。</p></div>${art()}</div><div class="settings-layout"><section class="setting-section"><div><h2>外观</h2><p class="caption">艺术主题与明暗模式<br>可以分别选择。</p></div><div><div class="theme-options"><button class="theme-option" data-world="folio" aria-pressed="${world==='folio'}"><span class="miniature"><i></i><b></b></span><strong>纸页收藏馆</strong></button><button class="theme-option" data-world="observatory" aria-pressed="${world==='observatory'}"><span class="miniature dark"><i></i><b></b></span><strong>轨道观测室</strong></button></div><div class="settings-modes">${[['system','跟随系统'],['light','亮色'],['dark','暗色']].map(([value,label])=>`<button data-mode="${value}" aria-pressed="${mode===value}">${label}</button>`).join('')}</div></div></section><section class="setting-section"><div><h2>GitHub 账号</h2><p class="caption">收藏与分类来自 GitHub。</p></div><div><div class="account-demo"><span class="avatar">A</span><div><strong>尚未连接</strong><small>预览页面不会读取真实账号</small></div></div><p class="setting-note">后续使用 GitHub Device Flow 授权，不需要在插件中放入 Client Secret。</p></div></section><section class="setting-section"><div><h2>AI 服务</h2><p class="caption">由你选择服务商。<br>未配置也能手动管理。</p></div><div><label>Base URL<input aria-label="Base URL 示例，不可编辑" readonly value="https://your-provider.example/v1"></label><label>模型名称<input aria-label="模型名称示例，不可编辑" readonly value="填写你自己的模型名称"></label><p class="setting-note">这是只读视觉示例，不采集 API Key。真实配置表单将在后续阶段接入。</p></div></section><section class="setting-section"><div><h2>管理规则</h2><p class="caption">自动管理也尊重你的决定。</p></div><p class="setting-note">优先使用已有分类；保留手动调整；新分类先确认。模型没有把握时，把决定留给你。</p></section></div>`;
}
function render(){
  const current=view();
  document.querySelectorAll('[data-view]').forEach(link=>{if(link.dataset.view===current)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
  document.querySelectorAll('.rail [data-filter]').forEach(button=>button.classList.toggle('selected',button.dataset.filter===filter));
  main.innerHTML=current==='settings'?settings():current==='detail'?detail():library();
  if(current==='library'){
    renderRows();
    document.querySelector('#search').addEventListener('input',event=>{query=event.target.value;renderRows();});
  }
}
function applyMode(){
 document.documentElement.dataset.mode=mode==='system'?(media.matches?'dark':'light'):mode;
 document.querySelector('#mode').value=mode;
 document.querySelectorAll('button[data-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mode===mode)));
}
function applyWorld(value){
 world=value;document.documentElement.dataset.world=world;
 document.querySelector('#direction-description').textContent=world==='folio'?'纸页收藏馆：暖纸、森林绿与编辑式排版。让整理收藏，像翻阅一本私人目录。':'轨道观测室：墨蓝、琥珀与清晰的几何秩序。让收藏像一个有坐标的探索空间。';
 document.querySelectorAll('button[data-world]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.world===world)));
 render();
}
let toastTimer;
document.addEventListener('click',event=>{
 const button=event.target.closest('button'); if(!button)return;
 if(button.dataset.world){applyWorld(button.dataset.world);return;}
 if(button.dataset.mode){mode=button.dataset.mode;applyMode();return;}
 if(button.dataset.filter){filter=button.dataset.filter;if(view()!=='library')location.hash='library';else render();return;}
 if(button.dataset.repo){selected=repos.find(repo=>repo.name===button.dataset.repo)||repos[0];location.hash='detail';return;}
 if(button.dataset.notice){const toast=document.querySelector('#toast');toast.textContent=button.dataset.notice;toast.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.hidden=true,4000);}
});
document.querySelectorAll('[data-icon]').forEach(element=>element.innerHTML=icon(element.dataset.icon));
document.querySelector('#mode').addEventListener('change',event=>{mode=event.target.value;applyMode();});
media.addEventListener('change',applyMode);
window.addEventListener('hashchange',render);
render();applyMode();
