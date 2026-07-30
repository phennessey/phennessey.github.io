// Hennessey Design — ui.js
//
// Data + behavior only. Markup lives in index.html (the two bookend slides and
// the #content-slide template); visual constants live in styles.css and are
// read from there, so no value is maintained in two files.

(function () {
	'use strict';

	// Copy for the 14 generated content slides, in order. Newlines are
	// intentional line breaks — .cat-b sets `white-space: pre-line`, so they
	// render as authored without any markup in this file.
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

	var root = document.documentElement;
	var stage = document.getElementById('stage');
	var frame = document.getElementById('frame');
	var prevBtn = document.getElementById('prev');
	var nextBtn = document.getElementById('next');
	var template = document.getElementById('content-slide');
	var coverEl = document.getElementById('slide-cover');
	var outroEl = document.getElementById('slide-outro');

	var VISIBLE = 'is-visible';

	var slideEls = [];   // every slide, in index order, persistent in the DOM
	var current = 0;     // index of the slide currently on screen


	// --- Visual constants, read from styles.css ---------------------------

	var cssVars = getComputedStyle(root);

	function cssNumber(name, fallback) {
		var value = parseFloat(cssVars.getPropertyValue(name));
		return isNaN(value) ? fallback : value;
	}

	var FADE_MS = cssNumber('--fade-ms', 100);
	var FRAME_W = cssNumber('--frame-w', 1152);
	var FRAME_H = cssNumber('--frame-h', 648);
	var FIT = cssNumber('--fit', 0.9);


	// --- Build the content slides ----------------------------------------

	function buildSlide(data, index) {
		var slide = template.content.firstElementChild.cloneNode(true);

		var fields = slide.querySelectorAll('[data-field]');
		for (var i = 0; i < fields.length; i++) {
			fields[i].textContent = data[fields[i].dataset.field] || '';
		}

		// Content slide 1 -> img/slide.jpg, then img/slide2.jpg .. slide14.jpg.
		// Held in data-src until the slide is near (see loadNearby).
		var image = slide.querySelector('.slide-image');
		image.dataset.src = 'img/slide' + (index === 1 ? '' : index) + '.jpg';
		image.alt = data.client + ' — ' + data.project.replace(/\n/g, ' ');

		return slide;
	}

	// The 14 JPGs total ~7.7 MB, so they are fetched as you approach them
	// rather than all at once on first paint. Neighbours are pulled in too, so
	// a move never waits on the network.
	var PRELOAD_RADIUS = 2;

	function loadImage(i) {
		var el = slideEls[i];
		if (!el) return;
		var image = el.querySelector('.slide-image');
		if (image && image.dataset.src) {
			image.src = image.dataset.src;
			delete image.dataset.src;
		}
	}

	function loadNearby() {
		for (var i = current - PRELOAD_RADIUS; i <= current + PRELOAD_RADIUS; i++) {
			loadImage(i);
		}
	}


	// --- Navigation -------------------------------------------------------
	//
	// Exactly one slide is visible at rest. A move animates exactly ONE slide,
	// and always over a fully opaque slide beneath it — fading both at once
	// would blend their text and wash it out mid-move:
	//   forward  — the incoming (higher) slide fades in over the outgoing one,
	//              which holds at full opacity until the fade lands.
	//   backward — the incoming (lower) slide is revealed instantly beneath,
	//              then the outgoing (higher) slide fades away above it.
	// Cleanup after the fade is guarded by navToken, so a newer move simply
	// supersedes an older one's cleanup.

	var navToken = 0;
	var inFlight = null;   // slide whose fade hasn't landed yet, if any

	// Apply a visibility change to a batch of slides with no animation: fades
	// are suppressed until the change has been committed. One forced reflow for
	// the whole batch, however many slides it covers.
	function withoutFade(els, mutate) {
		if (!els.length) return;             // nothing to do, so no reflow
		var i;
		for (i = 0; i < els.length; i++) els[i].classList.add('no-fade');
		for (i = 0; i < els.length; i++) mutate(els[i]);
		void frame.offsetWidth;              // commit before the fades return
		for (i = 0; i < els.length; i++) els[i].classList.remove('no-fade');
	}

	function show(el) { el.classList.add(VISIBLE); }
	function hide(el) { el.classList.remove(VISIBLE); }

	// Slides still painted that aren't in `keep` — i.e. leftovers from a move
	// that has been superseded, or the outgoing slide once its fade has landed.
	function stragglers(keep) {
		var found = [];
		for (var i = 0; i < slideEls.length; i++) {
			var el = slideEls[i];
			if (keep.indexOf(el) === -1 && el.classList.contains(VISIBLE)) found.push(el);
		}
		return found;
	}

	function whenFadeEnds(el, done) {
		var fired = false;
		function finish(e) {
			if (fired || (e && e.target !== el)) return;
			fired = true;
			el.removeEventListener('transitionend', finish);
			done();
		}
		el.addEventListener('transitionend', finish);
		setTimeout(finish, FADE_MS + 80);   // fallback if transitionend is missed
	}

	// Only the current slide is interactive. `inert` keeps the hidden slides out
	// of the tab order and the accessibility tree, so the outro's resume link
	// can't be reached from the cover.
	function updateInteractivity() {
		for (var i = 0; i < slideEls.length; i++) {
			if (i === current) slideEls[i].removeAttribute('inert');
			else slideEls[i].setAttribute('inert', '');
		}
	}

	function updateArrows() {
		prevBtn.classList.toggle('is-hidden', current === 0);
		nextBtn.classList.toggle('is-hidden', current === slideEls.length - 1);
	}

	function navigate(target) {
		if (target < 0 || target >= slideEls.length || target === current) return;

		var fromEl = slideEls[current];
		var toEl = slideEls[target];
		var forward = target > current;
		current = target;

		// Only these two take part in the move; anything else still painted is a
		// leftover from a superseded move and is cut now, so stale fades can't
		// stack up underneath.
		withoutFade(stragglers([fromEl, toEl]), hide);

		var animating;
		if (forward) {
			// If the previous move is still running, `fromEl` may only be
			// part-way faded in. Snap it to full opacity first, so the incoming
			// slide always has a genuinely opaque base under it.
			if (inFlight) withoutFade([fromEl], show);
			show(toEl);                       // fades in over fromEl
			animating = toEl;
		} else {
			withoutFade([toEl], show);        // opaque base, revealed beneath
			hide(fromEl);                     // fades away above it
			animating = fromEl;
		}

		updateArrows();
		updateInteractivity();
		loadNearby();

		// Once the fade lands, cut the outgoing slide — instantly, so nothing
		// lingers half-painted behind the slide that's now on screen.
		var token = ++navToken;
		inFlight = animating;
		whenFadeEnds(animating, function () {
			if (token !== navToken) return;
			inFlight = null;
			withoutFade(stragglers([slideEls[current]]), hide);
		});
	}

	function go(delta) {
		navigate(current + delta);
	}


	// --- Input ------------------------------------------------------------

	prevBtn.addEventListener('click', function () { go(-1); });
	nextBtn.addEventListener('click', function () { go(1); });

	document.addEventListener('keydown', function (e) {
		if (e.key === 'ArrowRight' || e.key === 'ArrowDown') go(1);
		else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') go(-1);
		else if (e.key === 'Home') navigate(0);
		else if (e.key === 'End') navigate(slideEls.length - 1);
	});

	// Mouse wheel / trackpad: advance one slide the instant a scroll is
	// detected, then ignore further wheel input for WHEEL_COOLDOWN ms. No
	// accumulation and no backlog, so a stream of high-resolution / momentum
	// events can't pile up or keep flipping after you stop. Down (+) advances.
	var WHEEL_COOLDOWN = 200;
	var wheelLocked = false;
	window.addEventListener('wheel', function (e) {
		if (Math.abs(e.deltaY) < 1) return;   // ignore noise / horizontal scroll
		if (wheelLocked) return;
		wheelLocked = true;
		setTimeout(function () { wheelLocked = false; }, WHEEL_COOLDOWN);
		go(e.deltaY > 0 ? 1 : -1);
	}, { passive: true });

	// Touch/pen: a horizontal swipe advances, matching the arrow direction.
	// Mouse drags are deliberately ignored so click-dragging to select the bar
	// text still works.
	var SWIPE_MIN = 40;   // px of travel before it counts as a swipe
	var swipeFrom = null;

	stage.addEventListener('pointerdown', function (e) {
		swipeFrom = (e.pointerType === 'mouse') ? null : e.clientX;
	});

	stage.addEventListener('pointercancel', function () { swipeFrom = null; });

	stage.addEventListener('pointerup', function (e) {
		if (swipeFrom === null) return;
		var dx = e.clientX - swipeFrom;
		swipeFrom = null;
		if (Math.abs(dx) >= SWIPE_MIN) go(dx < 0 ? 1 : -1);
	});


	// --- Fit the frame to the viewport ------------------------------------
	//
	// --s is the only thing set from here; styles.css derives the frame box and
	// the nav-arrow margin (--margin-x) from it.

	function fit() {
		root.style.setProperty('--s', Math.min(
			(window.innerWidth * FIT) / FRAME_W,
			(window.innerHeight * FIT) / FRAME_H
		));
	}

	var fitQueued = false;
	window.addEventListener('resize', function () {
		if (fitQueued) return;
		fitQueued = true;
		requestAnimationFrame(function () {
			fitQueued = false;
			fit();
		});
	}, { passive: true });


	// --- Init -------------------------------------------------------------

	slideEls.push(coverEl);
	SLIDES.forEach(function (data, i) {
		var el = buildSlide(data, i + 1);
		slideEls.push(el);
		frame.insertBefore(el, outroEl);
	});
	slideEls.push(outroEl);

	withoutFade([coverEl], show);   // cover is up immediately, with no fade-in
	updateArrows();
	updateInteractivity();
	loadNearby();
	fit();
})();
