// Hennessey Design — ui.js

(function () {
	'use strict';

	var SLIDE_COUNT = 16;   // cover + 14 content slides + outro

	// Bar categories, in display order, mapped to keys in the SLIDES data.
	var CATEGORIES = [
		{ label: 'Agency',  key: 'agency' },
		{ label: 'Client',  key: 'client' },
		{ label: 'Project', key: 'project' },
		{ label: 'Roles',   key: 'roles' }
	];

	// Per-content-slide copy (from info.txt). '\n' marks an intentional line
	// return that must be honored in the rendered bar. SLIDES[k] feeds content
	// slide k+1 (the cover has no data). 14 entries for 14 content slides.
	var SLIDES = [
		{ agency: 'Cinco Design', client: 'EA Sports',    project: 'FIFA 22',                                             roles: 'digital asset and styleguide production, automation, file management, final packaging' },
		{ agency: 'Cinco Design', client: 'EA Sports',    project: 'Madden NFL 22',                                       roles: 'digital asset and styleguide production, automation, file management, final packaging' },
		{ agency: 'Cinco Design', client: 'Under Armour', project: 'FW21 UA Curry Flow 9 Retail',                         roles: 'print and styleguide production, automation, file management, final packaging' },
		{ agency: 'Cinco Design', client: 'Under Armour', project: 'FW22 UA Curry Flow 10 Retail',                        roles: 'print and styleguide production, automation, file management, final packaging' },
		{ agency: 'Cinco Design', client: 'Under Armour', project: 'FW22 UA Meridian Retail',                             roles: 'print and styleguide production, automation, file management, final packaging' },
		{ agency: 'Cinco Design', client: 'adidas',       project: '2024 Running Event',                                  roles: 'graphic production management, automation, file management, final packaging' },
		{ agency: 'Cinco Design', client: 'adidas',       project: 'COPA 2026',                                           roles: 'file and asset production management, image retouching, automation, file management, final packaging' },
		{ agency: 'Cinco Design', client: 'adidas',       project: 'MLS’24 Pre-Match jerseys',                            roles: 'file and asset production management, automation, \nfinal packaging' },
		{ agency: 'Fiction',      client: 'adidas',       project: 'NBA/NCAA \nmulti-media campaign',                     roles: 'layout, print and digital production, automation, file management, final packaging' },
		{ agency: 'Fiction',      client: 'adidas',       project: 'NBA New Orleans Pelicans\nTeam Shop and stadium signage', roles: 'layout, print and digital production, automation, file management, final packaging' },
		{ agency: 'Fiction',      client: 'adidas',       project: 'Factory Outlet windows',                              roles: 'production management, layout, print production, automation, file management, final packaging' },
		{ agency: 'Fiction',      client: 'adidas',       project: 'Factory Outlet graphics',                             roles: 'architectural measurements, production management, styleguide production' },
		{ agency: 'Fiction',      client: 'Reebok',       project: 'Activ-Chill window displays, fixtures, and print ads', roles: 'layout, print production, \nfile management, final packaging' },
		{ agency: 'Fiction',      client: 'Apple',        project: 'iPhone, iPad, and iPod product launches for US Retail Marcom', roles: 'layout, file management, print and documentation production' }
	];

	var frame = document.getElementById('frame');
	var prevBtn = document.getElementById('prev');
	var nextBtn = document.getElementById('next');

	var current = 0;           // toggle state: index of the current slide
	var slideEls = [];         // all slides, index 0..14, persistent in the DOM


	// --- Build slides -----------------------------------------------------

	// Escape HTML, then turn intentional line returns into <br> so they render.
	function multiline(s) {
		return String(s)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/\n/g, '<br>');
	}

	function buildSlide(i) {
		// The first and last slides are full-yellow "bookends" (intro + outro).
		var isAccent = (i === 0 || i === SLIDE_COUNT - 1);

		var slide = document.createElement('div');
		slide.className = 'slide' + (isAccent ? ' slide--accent' : '');
		slide.dataset.index = i;

		// Bookend slide: full-yellow, NO sidebar div, no image, no seam — just
		// the wordmark + a subtitle placed directly on the slide.
		if (isAccent) {
			var subtitle = (i === 0)
				? 'Production Design &amp;<br>Automation Systems'
				: 'p.hennessey@yahoo.com';
			var cover = document.createElement('div');
			cover.className = 'cover-content';
			cover.innerHTML =
				'<h1 class="wordmark">' +
				'<span class="wm-first">Patrick</span>' +
				'<span class="wm-last">Hennessey</span>' +
				'</h1>' +
				'<p class="wm-sub">' + subtitle + '</p>';
			slide.appendChild(cover);
			return slide;
		}

		// Content slides: left bar (name, title, categories) + right image.
		var bar = document.createElement('div');
		bar.className = 'slide-bar';

		var top = document.createElement('div');
		top.className = 'bar-top';
		top.innerHTML =
			'<div class="slide-name">Patrick Hennessey</div>' +
			'<h2 class="slide-title"><span>Production</span><span>Design</span></h2>';
		bar.appendChild(top);

		var data = SLIDES[i - 1] || {};
		var bottom = document.createElement('div');
		bottom.className = 'bar-bottom';
		bottom.innerHTML = CATEGORIES.map(function (c) {
			var value = data[c.key];
			var body = value ? multiline(value) : 'Content goes here';
			return '<div class="cat">' +
				'<div class="cat-h">' + c.label + '</div>' +
				'<div class="cat-b">' + body + '</div>' +
				'</div>';
		}).join('');
		bar.appendChild(bottom);

		slide.appendChild(bar);

		// Right column: the pre-made JPG. Content slide 1 -> img/slide.jpg,
		// then img/slide2.jpg .. img/slide14.jpg for the rest.
		var n = (i === 1) ? '' : String(i);
		var image = document.createElement('img');
		image.className = 'slide-image';
		image.src = 'img/slide' + n + '.jpg';
		image.alt = '';
		slide.appendChild(image);

		return slide;
	}

	// --- State / navigation ----------------------------------------------
	//
	// At rest, exactly ONE slide is visible (`current`) — nothing sits behind
	// it. A move touches only two slides and cleans up after itself:
	//   * forward  (from < current): `current` fades IN on top of `from`, which
	//     holds at full opacity as an opaque base (so identical text never
	//     lightens); when the fade ends, `from` is hidden.
	//   * backward (from > current): `from` fades OUT on top, revealing `current`
	//     held at full opacity beneath; when the fade ends, `from` is hidden.
	// Slides stack by index (higher index paints on top), so the higher-index
	// slide of the pair is always the one whose opacity animates. Opacity is set
	// inline; a settle step (transitionend, with a timeout fallback) drops every
	// non-current slide to 0 so only `current` remains. No lock — a newer move
	// supersedes an older one via `navToken`, and rapid moves keep at most the
	// two slides they touch on screen.

	var TRANSITION_MS = 100;   // must match the CSS opacity transition
	var navToken = 0;

	// Set opacity with NO animation (disable the transition for one commit).
	function setInstant(el, value) {
		el.style.transition = 'none';
		el.style.opacity = value;
		void el.offsetWidth;           // commit without transitioning
		el.style.transition = '';      // restore the CSS transition
	}

	// Set opacity and let the CSS transition animate it.
	function setAnimated(el, value) {
		el.style.opacity = value;
	}

	function updateArrows() {
		prevBtn.classList.toggle('is-hidden', current === 0);
		nextBtn.classList.toggle('is-hidden', current === SLIDE_COUNT - 1);
	}

	// Only the current slide is interactive — so its bar text can be selected,
	// while the hidden slides (stacked on top at opacity 0) never intercept.
	function applyPointerEvents() {
		for (var i = 0; i < slideEls.length; i++) {
			slideEls[i].style.pointerEvents = (i === current) ? 'auto' : 'none';
		}
	}

	function navigate(target) {
		if (target < 0 || target >= SLIDE_COUNT || target === current) return;

		var from = current;
		current = target;

		var top = Math.max(from, current);      // higher index -> on top -> animates
		var bottom = Math.min(from, current);   // lower index  -> opaque base beneath
		var forward = current > from;
		var topEl = slideEls[top];
		var token = ++navToken;

		// Any slide not part of this move: gone instantly.
		for (var i = 0; i < slideEls.length; i++) {
			if (i !== top && i !== bottom) setInstant(slideEls[i], 0);
		}
		// Opaque base holds beneath the fade.
		setInstant(slideEls[bottom], 1);
		// Top slide fades in (forward) or out (backward).
		setAnimated(topEl, forward ? 1 : 0);

		updateArrows();
		applyPointerEvents();

		// When the fade settles (and only if not superseded), keep ONLY current.
		var settled = false;
		function settle() {
			if (settled || token !== navToken) return;
			settled = true;
			for (var j = 0; j < slideEls.length; j++) {
				if (j !== current) setInstant(slideEls[j], 0);
			}
		}
		function onEnd(e) { if (e.target === topEl) settle(); }
		topEl.addEventListener('transitionend', onEnd, { once: true });
		setTimeout(settle, TRANSITION_MS + 80);   // fallback if transitionend is missed
	}

	function go(delta) {
		navigate(current + delta);
	}

	prevBtn.addEventListener('click', function () { go(-1); });
	nextBtn.addEventListener('click', function () { go(1); });

	document.addEventListener('keydown', function (e) {
		if (e.key === 'ArrowRight' || e.key === 'ArrowDown') go(1);
		else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') go(-1);
	});

	// Mouse wheel / trackpad: advance one slide the instant a scroll is detected,
	// then ignore further wheel input for WHEEL_COOLDOWN ms. No accumulation and
	// no backlog, so a stream of high-resolution / momentum events can't pile up
	// or keep flipping after you stop. Down (+) advances, up (-) goes back.
	var WHEEL_COOLDOWN = 200;   // ms between wheel-driven advances
	var wheelLocked = false;
	window.addEventListener('wheel', function (e) {
		if (Math.abs(e.deltaY) < 1) return;   // ignore noise / horizontal scroll
		if (wheelLocked) return;
		wheelLocked = true;
		setTimeout(function () { wheelLocked = false; }, WHEEL_COOLDOWN);
		go(e.deltaY > 0 ? 1 : -1);
	}, { passive: true });


	// --- Fit the frame to the viewport (>=5% margin, top & sides) ---------

	function fit() {
		var vw = window.innerWidth;
		var scale = Math.min(
			(vw * 0.9) / 1152,
			(window.innerHeight * 0.9) / 648
		);
		frame.style.setProperty('--s', scale);
		// Margin outside the scaled frame → the nav-arrow hover/click zones.
		var marginX = (vw - 1152 * scale) / 2;
		document.documentElement.style.setProperty('--margin-x', marginX + 'px');
	}

	window.addEventListener('resize', fit, { passive: true });

	// Build every slide once; they persist in the DOM, stacked by index.
	for (var i = 0; i < SLIDE_COUNT; i++) {
		var el = buildSlide(i);
		slideEls.push(el);
		frame.appendChild(el);
	}

	// Initial paint: show the cover instantly; every other slide hidden.
	slideEls.forEach(function (el, i) { setInstant(el, i === 0 ? 1 : 0); });
	updateArrows();
	applyPointerEvents();

	fit();
})();
