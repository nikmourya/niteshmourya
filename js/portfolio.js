(function () {
  'use strict';

  const DEFAULT_CITATION_DATA = {
    googleScholar: { citations: 0, hIndex: 0, i10Index: 0 },
    researchGate: { reads: 0, citations: 0, recommendations: 0 },
  };

  const NAV_ITEMS = [
    { id: 'home', label: 'Home' },
    { id: 'about', label: 'About' },
    { id: 'publications', label: 'Publications' },
    { id: 'experience', label: 'Experience' },
    { id: 'education', label: 'Education' },
    { id: 'skills', label: 'Skills' },
    { id: 'contact', label: 'Contact' },
  ];

  const state = {
    activeSection: 'home',
    mobileMenuOpen: false,
    scrolled: false,
    data: null,
    loadError: null,
    formStatus: { submitting: false, success: false, error: false, message: '' },
  };

  let scrollSpyObserver = null;

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function mergeCitationData(incoming) {
    const gs = incoming?.googleScholar || {};
    const rg = incoming?.researchGate || {};
    return {
      googleScholar: {
        citations: Number.isFinite(gs.citations) ? gs.citations : DEFAULT_CITATION_DATA.googleScholar.citations,
        hIndex: Number.isFinite(gs.hIndex) ? gs.hIndex : DEFAULT_CITATION_DATA.googleScholar.hIndex,
        i10Index: Number.isFinite(gs.i10Index) ? gs.i10Index : DEFAULT_CITATION_DATA.googleScholar.i10Index,
      },
      researchGate: {
        reads: Number.isFinite(rg.reads) ? rg.reads : DEFAULT_CITATION_DATA.researchGate.reads,
        citations: Number.isFinite(rg.citations) ? rg.citations : DEFAULT_CITATION_DATA.researchGate.citations,
        recommendations: Number.isFinite(rg.recommendations) ? rg.recommendations : DEFAULT_CITATION_DATA.researchGate.recommendations,
      },
    };
  }

  function getShortName(fullName) {
    if (!fullName) return 'NM';
    const parts = String(fullName).trim().split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0];
    const last = parts[parts.length - 1];
    const firstInitial = parts[0][0] ? parts[0][0].toUpperCase() + '.' : '';
    const secondInitial = parts.length > 2 && parts[1][0] ? parts[1][0].toUpperCase() + '.' : '';
    const initials = `${firstInitial}${secondInitial}`.trim();
    return initials ? `${initials} ${last}` : last;
  }

  function setMetaBySelector(selector, content) {
    const el = document.querySelector(selector);
    if (!el || content === undefined || content === null || content === '') return;
    el.setAttribute('content', String(content));
  }

  function setLinkHref(selector, href) {
    const el = document.querySelector(selector);
    if (!el || href === undefined || href === null || href === '') return;
    el.setAttribute('href', String(href));
  }

  function applySiteMeta(data) {
    const profile = data?.profile || {};
    const site = data?.site || {};
    const title = site.title || [profile.name, profile.title].filter(Boolean).join(' | ') || 'Portfolio';

    document.title = title;
    setMetaBySelector('meta[name="description"]', site.description);
    setMetaBySelector('meta[name="keywords"]', site.keywords);
    setMetaBySelector('meta[name="author"]', profile.name || site.author);
    setLinkHref('link[rel="canonical"]', site.canonical);
    setMetaBySelector('meta[property="og:url"]', site.canonical);
    setMetaBySelector('meta[property="og:title"]', title);
    setMetaBySelector('meta[property="og:description"]', site.description);
    setMetaBySelector('meta[property="og:image"]', site.ogImage);
    setMetaBySelector('meta[property="og:site_name"]', site.siteName);
    setMetaBySelector('meta[name="twitter:title"]', title);
    setMetaBySelector('meta[name="twitter:description"]', site.description);
    setMetaBySelector('meta[name="twitter:image"]', site.ogImage);

    const jsonld = {
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: profile.name || undefined,
      jobTitle: profile.title || undefined,
      url: site.canonical || undefined,
      image: site.ogImage || profile.photo || undefined,
      email: profile.email || undefined,
      address: profile.location || undefined,
      sameAs: profile.links ? Object.values(profile.links).filter(Boolean) : undefined,
    };

    const jsonldEl = document.getElementById('person-jsonld');
    if (jsonldEl) jsonldEl.textContent = JSON.stringify(jsonld, null, 2);
  }

  function digitsOnly(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function getWhatsAppLink(phone, message) {
    const digits = digitsOnly(phone);
    if (!digits) return null;
    const base = `https://wa.me/${digits}`;
    const text = (message || '').trim();
    return text ? `${base}?text=${encodeURIComponent(text)}` : base;
  }

  function getDoiUrl(doi) {
    if (!doi) return null;
    const value = String(doi).trim();
    if (/^https?:\/\//i.test(value)) return value;
    return `https://doi.org/${value}`;
  }

  function renderLoading() {
    return `
      <div class="min-h-screen flex flex-col items-center justify-center gap-4">
        <div class="loading-spinner" role="status" aria-label="Loading"></div>
        <p class="text-gray-400 text-sm">Loading portfolio data...</p>
      </div>
    `;
  }

  function renderError(message) {
    return `
      <div class="min-h-screen flex items-center justify-center px-4">
        <div class="card text-center max-w-md">
          <h2 class="text-xl font-bold text-cyan mb-2">Failed to Load Portfolio Data</h2>
          <p class="text-gray-400 text-sm mb-4">${escapeHtml(message)}</p>
          <p class="text-gray-500 text-xs">
            Make sure <code class="text-cyan">portfolio-data.json</code> is in the same directory as
            <code class="text-cyan">index.html</code>, or serve the site via a local web server.
          </p>
          <button type="button" id="retry-load" class="btn-primary mt-6 text-sm">Retry</button>
        </div>
      </div>
    `;
  }

  function renderNav(profile) {
    const mobileMenuClass = state.mobileMenuOpen ? '' : 'hidden';
    const navClass = state.scrolled ? 'scrolled' : '';

    return `
      <nav class="sticky top-0 left-0 right-0 w-full z-50 transition-all duration-300 ${navClass}" role="navigation" aria-label="Main navigation">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div class="flex justify-between items-center">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
                <img src="${escapeHtml(profile.photo || './assets/Photo.jpg')}" alt="${escapeHtml(profile.name)}" class="w-full h-full object-cover" width="40" height="40" loading="eager">
              </div>
              <span class="text-xl font-bold text-cyan hidden sm:block">${escapeHtml(getShortName(profile.name))}</span>
            </div>

            <div class="hidden md:flex items-center gap-8">
              ${NAV_ITEMS.map((item) => `
                <button type="button" data-nav="${item.id}" class="nav-link text-sm font-medium transition-all ${state.activeSection === item.id ? 'active text-cyan' : 'text-gray-400 hover:text-cyan'}">
                  ${escapeHtml(item.label)}
                </button>
              `).join('')}
              <button type="button" data-nav="contact" class="btn-primary text-sm">Hire Me</button>
            </div>

            <button type="button" id="mobile-menu-toggle" class="md:hidden text-cyan p-2" aria-expanded="${state.mobileMenuOpen}" aria-controls="mobile-menu">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                ${state.mobileMenuOpen
                  ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>'
                  : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>'}
              </svg>
            </button>
          </div>

          <div id="mobile-menu" class="${mobileMenuClass} md:hidden mt-4 pb-4 space-y-1 border-t border-cyan/10 pt-4">
            ${NAV_ITEMS.map((item) => `
              <button type="button" data-nav="${item.id}" class="nav-link block w-full text-left px-4 py-2 text-gray-400 hover:text-cyan hover:bg-dark-card rounded-lg transition-all ${state.activeSection === item.id ? 'active text-cyan' : ''}">
                ${escapeHtml(item.label)}
              </button>
            `).join('')}
          </div>
        </div>
      </nav>
    `;
  }

  function renderHero(data, profile, citations, publications) {
    const slogans = data.hero?.slogans || [];
    const yearsExp = data.hero?.stats?.yearsExperience ?? 0;
    const whatsappLink = getWhatsAppLink(profile.phone, `Hi ${profile.name}, I found your portfolio and would like to connect.`);

    return `
      <section class="hero-section pt-16 sm:pt-20" aria-label="Introduction">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div class="grid md:grid-cols-2 gap-8 md:gap-12 items-center">
            <div class="fade-in">
              <h1 class="hero-title">
                <span class="block text-gray-300 text-base sm:text-lg font-medium mb-2">Hello, I'm</span>
                <span class="block">${escapeHtml(profile.name)}</span>
                <span class="block text-cyan text-lg sm:text-xl md:text-2xl font-semibold mt-3">${escapeHtml(profile.title)}</span>
              </h1>

              ${slogans.length ? `
                <div class="space-y-3 mb-4">
                  ${slogans.map((text, i) => `
                    <blockquote class="border-l-2 ${i === 0 ? 'border-cyan/50' : 'border-cyan/30'} pl-4">
                      <p class="${i === 0 ? 'text-base sm:text-lg text-gray-300' : 'text-sm text-gray-400'} italic leading-relaxed">
                        &ldquo;${escapeHtml(text)}&rdquo;
                      </p>
                    </blockquote>
                  `).join('')}
                </div>
              ` : ''}

              <div class="flex flex-wrap gap-3 sm:gap-4 mt-6 sm:mt-8">
                <button type="button" data-nav="contact" class="btn-primary flex-1 sm:flex-initial min-w-[120px]">Get in Touch</button>
                ${whatsappLink ? `
                  <a href="${escapeHtml(whatsappLink)}" target="_blank" rel="noopener noreferrer" class="btn-secondary flex-1 sm:flex-initial min-w-[120px]" aria-label="Chat on WhatsApp">
                    <svg class="w-5 h-5" viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
                      <path d="M16 3C9.383 3 4 8.383 4 15c0 2.338.675 4.574 1.955 6.5L4 29l7.699-1.897A11.92 11.92 0 0 0 16 27c6.617 0 12-5.383 12-12S22.617 3 16 3zm0 21.818c-1.96 0-3.871-.537-5.528-1.552l-.397-.238-4.57 1.127 1.219-4.45-.259-.414A9.765 9.765 0 0 1 6.235 15c0-5.39 4.375-9.765 9.765-9.765S25.765 9.61 25.765 15 21.39 24.818 16 24.818zm5.68-7.294c-.309-.155-1.83-.902-2.114-1.004-.284-.103-.491-.155-.698.155-.207.309-.803 1.004-.985 1.211-.181.207-.362.232-.671.078-.309-.155-1.305-.481-2.485-1.535-.918-.819-1.538-1.83-1.718-2.14-.181-.309-.02-.476.135-.63.139-.138.309-.362.464-.542.155-.181.207-.31.309-.516.103-.207.052-.387-.026-.542-.077-.155-.698-1.684-.955-2.31-.25-.601-.504-.52-.698-.53l-.595-.01c-.207 0-.542.078-.826.387-.284.31-1.084 1.06-1.084 2.588 0 1.528 1.11 3.006 1.265 3.212.155.207 2.183 3.337 5.288 4.678.739.319 1.315.51 1.764.652.741.236 1.414.203 1.947.123.594-.089 1.83-.749 2.089-1.47.258-.723.258-1.341.181-1.47-.078-.13-.284-.207-.593-.362z"/>
                    </svg>
                    <span>WhatsApp</span>
                  </a>
                ` : ''}
              </div>

              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-8 sm:mt-12">
                <div class="text-center"><div class="stat-value">${yearsExp}+</div><div class="text-sm text-gray-400 mt-1">Years Exp</div></div>
                <div class="text-center"><div class="stat-value">${publications.length}</div><div class="text-sm text-gray-400 mt-1">Publications</div></div>
                <div class="text-center"><div class="stat-value">${citations.googleScholar.citations}</div><div class="text-sm text-gray-400 mt-1">Citations</div></div>
                <div class="text-center"><div class="stat-value">${citations.googleScholar.hIndex}</div><div class="text-sm text-gray-400 mt-1">h-index</div></div>
              </div>
            </div>

            <div class="flex justify-center fade-in">
              <div class="flex flex-col items-center justify-center gap-6">
                <img src="${escapeHtml(profile.photo || './assets/Photo.jpg')}" alt="${escapeHtml(profile.name)} - ${escapeHtml(profile.title)}" class="profile-image" width="340" height="380" loading="eager">
                <div class="flex items-center justify-center gap-2">
                  ${profile.links?.linkedin ? `<a href="${escapeHtml(profile.links.linkedin)}" target="_blank" rel="noopener noreferrer" class="social-link" aria-label="LinkedIn"><svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg></a>` : ''}
                  ${profile.links?.scholar ? `<a href="${escapeHtml(profile.links.scholar)}" target="_blank" rel="noopener noreferrer" class="social-link" aria-label="Google Scholar"><svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M5.242 13.769L0 9.5 12 0l12 9.5-5.242 4.269C17.548 11.249 14.978 9.5 12 9.5c-2.977 0-5.548 1.748-6.758 4.269zM12 10a7 7 0 1 0 0 14 7 7 0 0 0 0-14z"/></svg></a>` : ''}
                  ${profile.links?.researchgate ? `<a href="${escapeHtml(profile.links.researchgate)}" target="_blank" rel="noopener noreferrer" class="social-link" aria-label="ResearchGate"><svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0zm5.894 8.221l-1.97-.345-.346-1.971a.3.3 0 0 0-.57 0l-.346 1.97-1.971.346a.3.3 0 0 0 0 .57l1.97.346.346 1.971a.3.3 0 0 0 .57 0l.346-1.97 1.971-.346a.3.3 0 0 0 0-.57z"/></svg></a>` : ''}
                  ${profile.email ? `<a href="mailto:${escapeHtml(profile.email)}" class="social-link" aria-label="Email"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg></a>` : ''}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function renderAbout(data, researchInterests) {
    const about = data.about || {};
    return `
      <section id="section-about" class="section-padding">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 class="section-header text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-8 sm:mb-12">About Me</h2>

          <div class="grid md:grid-cols-2 gap-6 sm:gap-8 mb-10 sm:mb-16">
            <div class="card fade-in">
              <h3 class="text-2xl font-bold text-cyan mb-4">${escapeHtml(about.mission?.title || 'Mission')}</h3>
              <p class="text-gray-300 leading-relaxed">${escapeHtml(about.mission?.text || '')}</p>
            </div>
            <div class="card fade-in">
              <h3 class="text-2xl font-bold text-cyan mb-4">${escapeHtml(about.vision?.title || 'Vision')}</h3>
              <p class="text-gray-300 leading-relaxed">${escapeHtml(about.vision?.text || '')}</p>
            </div>
          </div>

          <div class="card mb-10 sm:mb-16">
            ${Array.isArray(about.summary) ? about.summary.map((text) => `
              <p class="text-base sm:text-lg text-gray-300 leading-relaxed mb-4 last:mb-0">${escapeHtml(text)}</p>
            `).join('') : ''}
            ${about.quote ? `
              <p class="text-base sm:text-lg text-cyan italic font-medium mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-cyan/20">
                &ldquo;${escapeHtml(about.quote)}&rdquo;
              </p>
            ` : ''}
          </div>

          <h3 class="text-2xl sm:text-3xl font-bold text-white mb-6 sm:mb-8">Research Interests</h3>
          <div class="grid sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
            ${researchInterests.map((area) => `
              <div class="card fade-in">
                <h4 class="text-xl font-bold text-cyan mb-4">${escapeHtml(area.title)}</h4>
                <ul class="space-y-2">
                  ${(area.topics || []).map((topic) => `
                    <li class="flex items-start gap-2 text-gray-300">
                      <span class="text-cyan mt-1">&#9655;</span>
                      <span>${escapeHtml(topic)}</span>
                    </li>
                  `).join('')}
                </ul>
              </div>
            `).join('')}
          </div>
        </div>
      </section>
    `;
  }

  function renderPublications(publications, citations, journalPositions) {
    return `
      <section id="section-publications" class="section-padding bg-dark-lighter/30">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-6 mb-8 sm:mb-12">
            <h2 class="section-header text-3xl sm:text-4xl md:text-5xl font-bold text-white">Publications &amp; Research</h2>
            <div class="flex gap-3 sm:gap-4 flex-shrink-0">
              <div class="stat-card flex-1 sm:flex-initial min-w-0">
                <div class="stat-value">${publications.length}</div>
                <div class="text-xs sm:text-sm text-gray-400 mt-1">Papers</div>
              </div>
              <div class="stat-card flex-1 sm:flex-initial min-w-0">
                <div class="stat-value">${citations.googleScholar.citations}</div>
                <div class="text-xs sm:text-sm text-gray-400 mt-1">Citations</div>
              </div>
            </div>
          </div>

          <div class="timeline">
            ${publications.map((pub) => `
              <div class="timeline-item">
                <div class="card">
                  <div class="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 sm:gap-4 mb-3">
                    <h3 class="text-lg sm:text-xl font-semibold text-white flex-1 min-w-0 break-words">${escapeHtml(pub.title)}</h3>
                    <span class="tag font-mono flex-shrink-0 self-start">${escapeHtml(pub.year)}</span>
                  </div>
                  <p class="text-cyan font-medium mb-3">${escapeHtml(pub.journal)}</p>
                  ${pub.doi ? `<a href="${escapeHtml(getDoiUrl(pub.doi))}" target="_blank" rel="noopener noreferrer" class="text-sm text-gray-400 hover:text-cyan transition-colors break-all">DOI: ${escapeHtml(pub.doi)}</a>` : ''}
                  ${pub.doiLink ? `<a href="${escapeHtml(pub.doiLink)}" target="_blank" rel="noopener noreferrer" class="text-sm text-gray-400 hover:text-cyan transition-colors block mt-1">View Publication &rarr;</a>` : ''}
                  ${pub.status ? `<div class="mt-3"><span class="inline-block px-3 py-1 bg-yellow-500/10 text-yellow-500 rounded-md text-sm font-medium border border-yellow-500/20">${escapeHtml(pub.status)}</span></div>` : ''}
                </div>
              </div>
            `).join('')}
          </div>

          ${journalPositions.length ? `
            <div class="mt-12 sm:mt-16">
              <h3 class="text-2xl sm:text-3xl font-bold text-white mb-6 sm:mb-8">Journal Positions</h3>
              <div class="grid sm:grid-cols-2 gap-4 sm:gap-6">
                ${journalPositions.map((pos) => `
                  <div class="card">
                    <div class="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 sm:gap-4">
                      <div class="min-w-0">
                        <h4 class="text-lg sm:text-xl font-semibold text-cyan mb-2">${escapeHtml(pos.title)}</h4>
                        ${pos.link
                          ? `<a href="${escapeHtml(pos.link)}" target="_blank" rel="noopener noreferrer" class="text-gray-300 hover:text-cyan transition-colors">${escapeHtml(pos.journal)} &rarr;</a>`
                          : `<p class="text-gray-300">${escapeHtml(pos.journal)}</p>`}
                      </div>
                      <span class="text-xs sm:text-sm text-gray-400 whitespace-nowrap flex-shrink-0">${escapeHtml(pos.period)}</span>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
        </div>
      </section>
    `;
  }

  function renderExperience(experience) {
    return `
      <section id="section-experience" class="section-padding">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 class="section-header text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-8 sm:mb-12">Professional Experience</h2>
          <div class="timeline">
            ${experience.map((exp) => `
              <div class="timeline-item">
                <div class="card">
                  <div class="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 sm:gap-4 mb-4">
                    <div class="min-w-0">
                      <h3 class="text-xl sm:text-2xl font-bold text-white mb-2 break-words">${escapeHtml(exp.role)}</h3>
                      <p class="text-cyan font-medium text-sm sm:text-base break-words">${escapeHtml(exp.org)}</p>
                    </div>
                    <span class="tag font-mono whitespace-nowrap flex-shrink-0 self-start">${escapeHtml(exp.period)}</span>
                  </div>
                  ${exp.project ? `
                    <div class="mb-4 p-3 sm:p-4 bg-cyan/10 border-l-4 border-cyan rounded-r overflow-hidden">
                      <p class="text-sm text-gray-300 break-words"><span class="font-semibold text-cyan">Project:</span> ${escapeHtml(exp.project)}</p>
                    </div>
                  ` : ''}
                  <ul class="space-y-3">
                    ${(exp.details || []).map((detail) => `
                      <li class="flex items-start gap-3">
                        <span class="text-cyan mt-1">&#9655;</span>
                        <span class="text-gray-300">${escapeHtml(detail)}</span>
                      </li>
                    `).join('')}
                  </ul>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </section>
    `;
  }

  function renderEducation(education, certifications) {
    return `
      <section id="section-education" class="section-padding bg-dark-lighter/30">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 class="section-header text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-8 sm:mb-12">Education &amp; Certifications</h2>

          <div class="mb-10 sm:mb-16">
            <h3 class="text-2xl sm:text-3xl font-bold text-white mb-6 sm:mb-8">Academic Background</h3>
            <div class="timeline">
              ${education.map((edu) => `
                <div class="timeline-item">
                  <div class="card">
                    <div class="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 sm:gap-4 mb-4">
                      <div class="min-w-0">
                        <h4 class="text-xl sm:text-2xl font-bold text-white mb-2 break-words">${escapeHtml(edu.degree)}</h4>
                        <p class="text-cyan font-medium text-sm sm:text-base break-words">${escapeHtml(edu.institution)}</p>
                      </div>
                      <span class="tag font-mono whitespace-nowrap flex-shrink-0 self-start">${escapeHtml(edu.period)}</span>
                    </div>
                    ${edu.grade ? `<div class="mb-3"><span class="inline-block px-3 py-1 bg-cyan/10 text-cyan rounded-md text-sm font-medium border border-cyan/20">Grade: ${escapeHtml(edu.grade)}</span></div>` : ''}
                    ${edu.expertise ? `<p class="text-sm text-cyan mb-3"><span class="font-semibold">Expertise:</span> ${escapeHtml(edu.expertise)}</p>` : ''}
                    <p class="text-gray-300 leading-relaxed">${escapeHtml(edu.description)}</p>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <div>
            <h3 class="text-2xl sm:text-3xl font-bold text-white mb-6 sm:mb-8">Certifications</h3>
            <div class="grid sm:grid-cols-2 gap-4 sm:gap-6">
              ${certifications.map((cert) => `
                <div class="card">
                  <div class="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1 sm:gap-4 mb-3">
                    <h4 class="text-base sm:text-lg font-semibold text-white break-words">${escapeHtml(cert.title)}</h4>
                    <span class="text-xs sm:text-sm text-gray-400 whitespace-nowrap flex-shrink-0">${escapeHtml(cert.date)}</span>
                  </div>
                  <p class="text-cyan font-medium mb-3 text-sm sm:text-base">${escapeHtml(cert.institution)}</p>
                  <p class="text-sm text-gray-300">${escapeHtml(cert.description)}</p>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function renderSkills(skills) {
    return `
      <section id="section-skills" class="section-padding">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 class="section-header text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-8 sm:mb-12">Technical Expertise</h2>
          <div class="grid sm:grid-cols-2 gap-4 sm:gap-6">
            ${skills.map((skillSet) => `
              <div class="card">
                <h3 class="text-xl sm:text-2xl font-bold text-cyan mb-4 sm:mb-6">${escapeHtml(skillSet.category)}</h3>
                <ul class="space-y-4">
                  ${(skillSet.tools || []).map((tool) => `
                    <li class="flex items-start gap-3">
                      <span class="text-cyan mt-1">&#9655;</span>
                      <span class="text-gray-300">${escapeHtml(tool)}</span>
                    </li>
                  `).join('')}
                </ul>
              </div>
            `).join('')}
          </div>
        </div>
      </section>
    `;
  }

  function renderContact(profile) {
    const whatsappLink = getWhatsAppLink(profile.phone, `Hi ${profile.name}, I found your portfolio and would like to connect.`);
    const status = state.formStatus;

    return `
      <section id="section-contact" class="section-padding bg-dark-lighter/30">
        <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="text-center mb-8 sm:mb-12">
            <h2 class="section-header text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-3 sm:mb-4">Let's Work Together</h2>
            <p class="text-base sm:text-xl text-gray-400 px-2">Have a project in mind? Let's discuss how GeoAI can solve your challenges.</p>
          </div>

          <div class="card mb-8 sm:mb-12">
            <h3 class="text-xl sm:text-2xl font-bold text-cyan mb-4 sm:mb-6">Contact &amp; Connect</h3>
            <div class="grid md:grid-cols-2 gap-6 sm:gap-8 items-start">
              <div>
                <p class="text-sm text-gray-400 mb-1">Email</p>
                <a href="mailto:${escapeHtml(profile.email)}" class="text-gray-300 hover:text-cyan transition-colors break-words">${escapeHtml(profile.email)}</a>
              </div>
              <div>
                <p class="text-sm text-gray-400 mb-1">Phone</p>
                <a href="tel:${escapeHtml(digitsOnly(profile.phone))}" class="text-gray-300 hover:text-cyan transition-colors break-words">${escapeHtml(profile.phone)}</a>
              </div>
              ${whatsappLink ? `
                <div>
                  <p class="text-sm text-gray-400 mb-1">WhatsApp</p>
                  <a href="${escapeHtml(whatsappLink)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-2 text-gray-300 hover:text-cyan transition-colors break-words">
                    <span class="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-[#25D366]/10 border border-[#25D366]/30 text-[#25D366] flex-shrink-0">
                      <svg class="w-5 h-5" viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
                        <path d="M16 3C9.383 3 4 8.383 4 15c0 2.338.675 4.574 1.955 6.5L4 29l7.699-1.897A11.92 11.92 0 0 0 16 27c6.617 0 12-5.383 12-12S22.617 3 16 3zm0 21.818c-1.96 0-3.871-.537-5.528-1.552l-.397-.238-4.57 1.127 1.219-4.45-.259-.414A9.765 9.765 0 0 1 6.235 15c0-5.39 4.375-9.765 9.765-9.765S25.765 9.61 25.765 15 21.39 24.818 16 24.818zm5.68-7.294c-.309-.155-1.83-.902-2.114-1.004-.284-.103-.491-.155-.698.155-.207.309-.803 1.004-.985 1.211-.181.207-.362.232-.671.078-.309-.155-1.305-.481-2.485-1.535-.918-.819-1.538-1.83-1.718-2.14-.181-.309-.02-.476.135-.63.139-.138.309-.362.464-.542.155-.181.207-.31.309-.516.103-.207.052-.387-.026-.542-.077-.155-.698-1.684-.955-2.31-.25-.601-.504-.52-.698-.53l-.595-.01c-.207 0-.542.078-.826.387-.284.31-1.084 1.06-1.084 2.588 0 1.528 1.11 3.006 1.265 3.212.155.207 2.183 3.337 5.288 4.678.739.319 1.315.51 1.764.652.741.236 1.414.203 1.947.123.594-.089 1.83-.749 2.089-1.47.258-.723.258-1.341.181-1.47-.078-.13-.284-.207-.593-.362z"/>
                      </svg>
                    </span>
                    <span>Message on WhatsApp</span>
                  </a>
                </div>
              ` : ''}
              <div>
                <p class="text-sm text-gray-400 mb-1">Location</p>
                <p class="text-gray-300">Jaipur, Rajasthan, India</p>
              </div>
            </div>
          </div>

          <div class="card">
            <h3 class="text-2xl font-bold text-cyan mb-6">Send a Message</h3>
            <form id="contact-form" class="space-y-4 sm:space-y-6" novalidate>
              <div class="grid md:grid-cols-2 gap-4 sm:gap-6">
                <div>
                  <label for="name" class="block text-sm font-medium text-gray-400 mb-2">Name *</label>
                  <input type="text" id="name" name="name" required placeholder="Your Name" autocomplete="name">
                </div>
                <div>
                  <label for="email" class="block text-sm font-medium text-gray-400 mb-2">Email *</label>
                  <input type="email" id="email" name="email" required placeholder="your.email@example.com" autocomplete="email">
                </div>
              </div>
              <div>
                <label for="subject" class="block text-sm font-medium text-gray-400 mb-2">Subject *</label>
                <input type="text" id="subject" name="subject" required placeholder="Message Subject">
              </div>
              <div>
                <label for="message" class="block text-sm font-medium text-gray-400 mb-2">Message *</label>
                <textarea id="message" name="message" required rows="6" placeholder="Your message here..."></textarea>
              </div>

              ${status.message ? `
                <div class="p-4 rounded-lg border ${status.success ? 'bg-green-500/10 border-green-500/30 text-green-400' : status.error ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-cyan/10 border-cyan/30 text-cyan'}" role="status">
                  ${escapeHtml(status.message)}
                </div>
              ` : ''}

              <button type="submit" class="btn-primary w-full" ${status.submitting ? 'disabled' : ''}>
                ${status.submitting ? '<span class="loading-spinner"></span><span>Sending...</span>' : '<span>Send Message</span><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>'}
              </button>
            </form>
          </div>
        </div>
      </section>
    `;
  }

  function renderFooter(profile) {
    const year = new Date().getFullYear();
    return `
      <footer class="py-8 sm:py-12 px-4 sm:px-6 border-t border-cyan/10" role="contentinfo">
        <div class="max-w-7xl mx-auto">
          <div class="flex flex-col md:flex-row justify-between items-center gap-6 text-center md:text-left">
            <div>
              <p class="text-sm sm:text-base text-gray-400">&copy; ${year} ${escapeHtml(profile.name)}. All rights reserved.</p>
              <p class="text-xs sm:text-sm text-gray-500 mt-1">${escapeHtml(profile.title)}</p>
            </div>
            <div class="flex flex-wrap justify-center gap-3 sm:gap-4">
              ${profile.links?.linkedin ? `<a href="${escapeHtml(profile.links.linkedin)}" target="_blank" rel="noopener noreferrer" class="text-gray-400 hover:text-cyan transition-colors">LinkedIn</a>` : ''}
              ${profile.links?.scholar ? `<a href="${escapeHtml(profile.links.scholar)}" target="_blank" rel="noopener noreferrer" class="text-gray-400 hover:text-cyan transition-colors">Scholar</a>` : ''}
              ${profile.links?.researchgate ? `<a href="${escapeHtml(profile.links.researchgate)}" target="_blank" rel="noopener noreferrer" class="text-gray-400 hover:text-cyan transition-colors">ResearchGate</a>` : ''}
              ${profile.links?.orcid ? `<a href="${escapeHtml(profile.links.orcid)}" target="_blank" rel="noopener noreferrer" class="text-gray-400 hover:text-cyan transition-colors">ORCID</a>` : ''}
            </div>
          </div>
        </div>
      </footer>
    `;
  }

  function renderWhatsAppFab(profile) {
    const whatsappLink = getWhatsAppLink(profile.phone, `Hi ${profile.name}, I found your portfolio and would like to connect.`);
    if (!whatsappLink) return '';
    return `
      <a class="whatsapp-fab" href="${escapeHtml(whatsappLink)}" target="_blank" rel="noopener noreferrer" aria-label="Chat on WhatsApp" title="Chat on WhatsApp">
        <svg class="w-7 h-7" viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
          <path d="M16 3C9.383 3 4 8.383 4 15c0 2.338.675 4.574 1.955 6.5L4 29l7.699-1.897A11.92 11.92 0 0 0 16 27c6.617 0 12-5.383 12-12S22.617 3 16 3zm0 21.818c-1.96 0-3.871-.537-5.528-1.552l-.397-.238-4.57 1.127 1.219-4.45-.259-.414A9.765 9.765 0 0 1 6.235 15c0-5.39 4.375-9.765 9.765-9.765S25.765 9.61 25.765 15 21.39 24.818 16 24.818zm5.68-7.294c-.309-.155-1.83-.902-2.114-1.004-.284-.103-.491-.155-.698.155-.207.309-.803 1.004-.985 1.211-.181.207-.362.232-.671.078-.309-.155-1.305-.481-2.485-1.535-.918-.819-1.538-1.83-1.718-2.14-.181-.309-.02-.476.135-.63.139-.138.309-.362.464-.542.155-.181.207-.31.309-.516.103-.207.052-.387-.026-.542-.077-.155-.698-1.684-.955-2.31-.25-.601-.504-.52-.698-.53l-.595-.01c-.207 0-.542.078-.826.387-.284.31-1.084 1.06-1.084 2.588 0 1.528 1.11 3.006 1.265 3.212.155.207 2.183 3.337 5.288 4.678.739.319 1.315.51 1.764.652.741.236 1.414.203 1.947.123.594-.089 1.83-.749 2.089-1.47.258-.723.258-1.341.181-1.47-.078-.13-.284-.207-.593-.362z"/>
        </svg>
      </a>
    `;
  }

  function renderApp() {
    const data = state.data;
    const profile = data.profile;
    const citations = mergeCitationData(data.citationData);
    const publications = data.publications || [];
    const experience = data.experience || [];
    const journalPositions = data.journalPositions || [];
    const skills = data.skills || [];
    const education = data.education || [];
    const certifications = data.certifications || [];
    const researchInterests = data.researchInterests || [];

    return `
      <div class="min-h-screen" role="document">
        <a href="#main-content" class="skip-link">Skip to main content</a>
        ${renderNav(profile)}
        <main id="main-content" role="main">
          ${renderHero(data, profile, citations, publications)}
          ${renderAbout(data, researchInterests)}
          ${renderPublications(publications, citations, journalPositions)}
          ${renderExperience(experience)}
          ${renderEducation(education, certifications)}
          ${renderSkills(skills)}
          ${renderContact(profile)}
        </main>
        ${renderFooter(profile)}
        ${renderWhatsAppFab(profile)}
      </div>
    `;
  }

  function updateNavUI() {
    document.querySelectorAll('.nav-link').forEach((btn) => {
      const sectionId = btn.getAttribute('data-nav');
      const isActive = sectionId === state.activeSection;
      btn.classList.toggle('active', isActive);
      btn.classList.toggle('text-cyan', isActive);
      btn.classList.toggle('text-gray-400', !isActive);
    });

    const nav = document.querySelector('nav');
    if (nav) nav.classList.toggle('scrolled', state.scrolled);

    const mobileMenu = document.getElementById('mobile-menu');
    if (mobileMenu) mobileMenu.classList.toggle('hidden', !state.mobileMenuOpen);

    const toggle = document.getElementById('mobile-menu-toggle');
    if (toggle) toggle.setAttribute('aria-expanded', String(state.mobileMenuOpen));
  }

  function scrollToSection(sectionId) {
    state.activeSection = sectionId;
    state.mobileMenuOpen = false;
    updateNavUI();

    if (sectionId === 'home') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const element = document.getElementById(`section-${sectionId}`);
    if (element) {
      const navHeight = 80;
      const offset = element.getBoundingClientRect().top + window.pageYOffset - navHeight;
      window.scrollTo({ top: offset, behavior: 'smooth' });
    }
  }

  function setupScrollListener() {
    window.addEventListener('scroll', () => {
      const scrolled = window.scrollY > 50;
      if (scrolled !== state.scrolled) {
        state.scrolled = scrolled;
        const nav = document.querySelector('nav');
        if (nav) nav.classList.toggle('scrolled', scrolled);
      }
    }, { passive: true });
  }

  function setupScrollSpy() {
    if (scrollSpyObserver) scrollSpyObserver.disconnect();

    const sections = NAV_ITEMS
      .filter((item) => item.id !== 'home')
      .map((item) => document.getElementById(`section-${item.id}`))
      .filter(Boolean);

    if (!sections.length || !('IntersectionObserver' in window)) return;

    scrollSpyObserver = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

      if (visible.length) {
        const id = visible[0].target.id.replace('section-', '');
        if (id !== state.activeSection) {
          state.activeSection = id;
          updateNavUI();
        }
      } else if (window.scrollY < 200 && state.activeSection !== 'home') {
        state.activeSection = 'home';
        updateNavUI();
      }
    }, { rootMargin: '-40% 0px -50% 0px', threshold: [0, 0.25, 0.5] });

    sections.forEach((section) => scrollSpyObserver.observe(section));
  }

  async function handleFormSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const profile = state.data?.profile;
    if (!profile?.email) return;

    const formData = new FormData(form);
    const payload = {
      name: String(formData.get('name') || '').trim(),
      email: String(formData.get('email') || '').trim(),
      subject: String(formData.get('subject') || '').trim(),
      message: String(formData.get('message') || '').trim(),
    };

    state.formStatus = { submitting: true, success: false, error: false, message: '' };
    render();

    try {
      const response = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(profile.email)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          ...payload,
          _captcha: false,
          _template: 'table',
          _subject: payload.subject,
        }),
      });

      const data = await response.json();
      if (response.ok && data.success) {
        state.formStatus = {
          submitting: false,
          success: true,
          error: false,
          message: `Thank you! Your message has been sent successfully to ${profile.email}`,
        };
        form.reset();
      } else {
        throw new Error(data.message || 'Form submission failed');
      }
    } catch (error) {
      console.error('Form submission error:', error);
      state.formStatus = {
        submitting: false,
        success: false,
        error: true,
        message: `Sorry, there was an error. Please email directly at ${profile.email}`,
      };
    }

    render();
  }

  function bindEvents() {
    const app = document.getElementById('app');
    if (!app) return;

    app.addEventListener('click', (event) => {
      const navButton = event.target.closest('[data-nav]');
      if (navButton) {
        event.preventDefault();
        scrollToSection(navButton.getAttribute('data-nav'));
        return;
      }

      if (event.target.closest('#mobile-menu-toggle')) {
        state.mobileMenuOpen = !state.mobileMenuOpen;
        updateNavUI();
        return;
      }

      if (event.target.closest('#retry-load')) {
        loadPortfolioData();
      }
    });

    const form = document.getElementById('contact-form');
    if (form) form.addEventListener('submit', handleFormSubmit);
  }

  function render() {
    const app = document.getElementById('app');
    if (!app) return;

    if (state.loadError) {
      app.innerHTML = renderError(state.loadError);
    } else if (!state.data?.profile) {
      app.innerHTML = renderLoading();
    } else {
      app.innerHTML = renderApp();
    }

    bindEvents();
    if (state.data?.profile) {
      setupScrollListener();
      setupScrollSpy();
    }
  }

  async function loadPortfolioData() {
    state.loadError = null;
    state.data = null;
    render();

    try {
      const response = await fetch('./portfolio-data.json', {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      state.data = data;
      applySiteMeta(data);
      render();
    } catch (error) {
      console.error('Failed to load portfolio-data.json:', error);
      state.loadError = "Couldn't load portfolio-data.json. If you're opening index.html directly, most browsers block fetch() for local files. Please run this folder with a local web server (e.g., VS Code Live Server).";
      render();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadPortfolioData);
  } else {
    loadPortfolioData();
  }
})();
