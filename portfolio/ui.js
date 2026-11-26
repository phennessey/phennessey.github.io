// Patrick Hennessey — ui.js
//
// Data + behavior only. Markup lives in index.html (the page shell and the
// #project template); visual constants live in styles.css.

(function () {
	'use strict';

	// Agencies, in page order. Each heads a section of its projects below.
	var AGENCIES = [
		{ name: 'Cinco Design', dates: '2019–2026' },
		{ name: 'Fiction',      dates: '2013–2019' }
	];

	// Projects, in page order. image is the file in img/ (WebP, quality 85,
	// made from the max-quality JPEGs alongside it; 2400px wide, 2x the
	// 1200px it displays at; 1784px tall unless height says otherwise, which
	// the page uses to reserve the right space before the image loads).
	// agency matches a name above and decides which section it appears in.
	var PROJECTS = [
		{ image: 'slide.webp',   agency: 'Cinco Design', client: 'EA SPORTS',    project: 'FIFA 22',                                             roles: 'digital asset and styleguide production, photo retouching, automation, file management & delivery' },
		{ image: 'slide2.webp',  agency: 'Cinco Design', client: 'EA SPORTS',    project: 'Madden NFL 22',                                       roles: 'digital asset and styleguide production, photo retouching, automation, file management & delivery' },
		{ image: 'slide3.webp',  agency: 'Cinco Design', client: 'Under Armour', project: 'UA Curry Flow 9',                    roles: 'print and styleguide production, automation, file management & delivery' },
		{ image: 'slide4.webp',  agency: 'Cinco Design', client: 'Under Armour', project: 'UA Curry Flow 10',                   roles: 'print and styleguide production, automation, file management & delivery' },
		{ image: 'slide5.webp',  agency: 'Cinco Design', client: 'Under Armour', project: 'UA Meridian Retail',                             roles: 'print and styleguide production, automation, file management & delivery' },
		{ image: 'slide6.webp',  agency: 'Cinco Design', client: 'adidas',       project: '2024 Running Event',                                  roles: 'graphic production management, automation, file management & delivery' },
		{ image: 'slide7.webp',  agency: 'Cinco Design', client: 'adidas',       project: 'COPA 2026',                                           roles: 'file and asset production management, image retouching, automation, file management & delivery' },
		{ image: 'slide8.webp',  agency: 'Cinco Design', client: 'adidas',       project: 'MLS 2024 Pre-Match jerseys',                            roles: 'file and asset production management, automation, delivery' },
		{ image: 'slide9.webp',  agency: 'Fiction',      client: 'adidas',       project: 'NBA + NCAA campaign',                                 roles: 'layout, print and digital production, automation, file management & delivery' },
		{ image: 'slide10.webp', agency: 'Fiction',      client: 'adidas',       project: 'NOLA Pelicans Stadium',            roles: 'layout, print and digital production, automation, file management & delivery' },
		{ image: 'slide11.webp', agency: 'Fiction',      client: 'adidas',       project: 'Factory Outlet windows',                              roles: 'production management, layout, print production, automation, delivery' },
		{ image: 'slide12.webp', height: 1277, agency: 'Fiction',      client: 'adidas',       project: 'Factory Outlet graphics',                             roles: 'architectural measurements, production management, styleguide production' },
		{ image: 'slide13.webp', agency: 'Fiction',      client: 'Reebok',       project: 'Activ-Chill retail',                                  roles: 'layout, print production, file management & delivery' },
		{ image: 'slide14.webp', agency: 'Fiction',      client: 'Apple',        project: 'iPhone, iPad, iPod launches',                          roles: 'layout, file management, print and documentation production' }
	];

	// --- Build the project list ------------------------------------------

	var agencyTemplate = document.getElementById('agency');
	var projectTemplate = document.getElementById('project');
	var list = document.getElementById('projects');

	function fill(el, data) {
		var fields = el.querySelectorAll('[data-field]');
		for (var i = 0; i < fields.length; i++) {
			fields[i].textContent = data[fields[i].dataset.field] || '';
		}
	}

	AGENCIES.forEach(function (agency) {
		var section = agencyTemplate.content.firstElementChild.cloneNode(true);
		fill(section, agency);
		var holder = section.querySelector('.agency-projects');

		PROJECTS.forEach(function (data) {
			if (data.agency !== agency.name) return;
			var el = projectTemplate.content.firstElementChild.cloneNode(true);
			fill(el, data);
			var image = el.querySelector('.project-image');
			if (data.height) image.height = data.height;
			image.src = 'img/' + data.image + '?v=2400';   // version tag: bump when the slide files are re-exported (2400px, Nov 26)
			image.alt = data.client + ': ' + data.project;
			holder.appendChild(el);
		});

		list.appendChild(section);
	});


	// --- Views: Case Studies (default), Gallery and About ------------------
	//
	// The URL hash picks the view (#case-studies, #gallery, #about), so the
	// back button and shared links work. Anything else, including no hash,
	// shows Case Studies (old #tools links land here too).

	var views = document.querySelectorAll('.view');
	var navLinks = document.querySelectorAll('.nav-link');

	function showView() {
		// Old names still work: #brand-work, #production and #work (Gallery); #automation
		// and #tools fall through to Case Studies, the default. Internally Gallery is
		// still data-view="production"
		var name = (location.hash === '#gallery' || location.hash === '#brand-work' || location.hash === '#production' || location.hash === '#work') ? 'production'
			: location.hash === '#about' ? 'about'
			: 'automation';
		var i;
		for (i = 0; i < views.length; i++) views[i].hidden = views[i].dataset.view !== name;
		for (i = 0; i < navLinks.length; i++) {
			if (navLinks[i].dataset.view === name) navLinks[i].setAttribute('aria-current', 'page');
			else navLinks[i].removeAttribute('aria-current');
		}
	}

	// Switching views fades the new page's content in (--fade-ms in
	// styles.css, 100ms), like the old slides. Only the content fades, never
	// the header, so the nav keeps its pointer cursor through the switch.
	// Instant with reduced motion (styles.css).
	var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

	function switchView() {
		showView();
		fitCaptions();
		window.scrollTo(0, 0);
		var shown = document.querySelector('.view:not([hidden])');
		if (shown) {
			shown.classList.remove('view-enter');
			void shown.offsetWidth;          // restart the fade
			shown.classList.add('view-enter');
		}
	}

	window.addEventListener('hashchange', switchView);


	// --- Whole-pixel nav ---------------------------------------------------
	//
	// The nav is right-aligned, so each link's left edge depends on the width
	// of the words, which is a fraction of a pixel. Text on a fractional edge
	// shimmers in the pinned header while scrolling, so round each link's
	// width up to a whole pixel. Re-run once the web font arrives and on resize.

	function snapNav() {
		for (var i = 0; i < navLinks.length; i++) {
			navLinks[i].style.width = '';
			navLinks[i].style.width = Math.ceil(navLinks[i].getBoundingClientRect().width) + 'px';
		}
	}

	if (document.fonts && document.fonts.ready) document.fonts.ready.then(snapNav);
	window.addEventListener('resize', snapNav);
	snapNav();


	// --- Captions: one line, or two when the widest won't fit -------------
	//
	// Each caption normally runs on one line: client, project / roles. If
	// the widest of them is wider than the page, every caption switches to
	// two lines together (roles on the second, no slash), so they all match.

	var captions = list.querySelectorAll('.caption');

	function fitCaptions() {
		if (list.offsetParent === null) return;   // Work view hidden; redo on show
		list.classList.remove('captions-stacked');
		list.classList.add('captions-measure');
		var widest = 0;
		for (var i = 0; i < captions.length; i++) {
			widest = Math.max(widest, captions[i].getBoundingClientRect().width);
		}
		list.classList.remove('captions-measure');
		list.classList.toggle('captions-stacked', widest > list.clientWidth);
	}

	if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitCaptions);
	window.addEventListener('resize', fitCaptions);


	// --- Header height for the scroll detents (styles.css) ----------------

	var root = document.documentElement;
	var header = document.querySelector('.site-header');

	function measureHeader() {
		root.style.setProperty('--header-h', header.offsetHeight + 'px');
	}

	if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureHeader);
	window.addEventListener('resize', measureHeader);


	// --- Smooth scrolling with detents (desktop) ---------------------------
	//
	// Works like Lenis, the smooth-scroll library cinco.design uses: the
	// wheel / trackpad moves an invisible target, and the page glides toward
	// it, closing a fixed share of the gap every frame, so quick flicks stay
	// fluid instead of stepping tick by tick.
	// Each project's resting spot (caption just under the header) is a
	// detent:
	//  - Catch: as a scroll's momentum dies out (slower than CATCH_SPEED),
	//    the next project ahead within CATCH_RANGE takes over and a firm
	//    spring pulls the page into it, instead of drifting past. The rest
	//    of that momentum is absorbed.
	//  - Snap back: a small nudge (under SNAPBACK) away from a project
	//    springs back into it. A bigger move, like one mouse-wheel click,
	//    leaves freely.
	//  - Any new scroll gesture, or speeding up past RELEASE_SPEED, breaks
	//    free of a catch.
	// Keyboard and scrollbar scrolling stay native, and settle into a nearby
	// detent once they stop. Off on phones and with reduced motion.
	//   GLIDE:            how fast the page catches up to the target, per
	//                     second (Lenis default ~6.3). Lower = smoother/heavier.
	//   DETENT_STIFFNESS: spring pull; higher is harder and faster.
	//   DETENT_DAMPING:   below 1 overshoots; lower bounces more. 1 = none.

	var GLIDE = 6.3;
	var CATCH_SPEED = 1200;      // px/s: momentum slower than this can be caught
	var CATCH_RANGE = 300;       // px: how far ahead the next project can catch
	var SNAPBACK = 60;           // px: nudges smaller than this spring back
	var RELEASE_SPEED = 2400;    // px/s: speeding up past this breaks free
	var DETENT_STIFFNESS = 130;
	var DETENT_DAMPING = 0.75;
	var GESTURE_GAP = 150;       // ms between wheel events that starts a new gesture
	var INPUT_GAP = 80;          // ms without wheel input = the input let go
	var NATIVE_IDLE = 110;       // ms after a native scroll stops, then settle

	var desktopMQ = window.matchMedia('(min-width: 875px)');
	var target = window.scrollY; // where the input says the page should be
	var x = window.scrollY;      // where the page is drawn (glides to target)
	var tv = 0;                  // target velocity while springing
	var inputV = 0;              // current gesture's speed, px per second
	var gestureEvents = 0;
	var dir = 0;                 // +1 down, -1 up: the current gesture's direction
	var lastWheel = -1e9;
	var springTo = null;         // detent being pulled into, if any
	var caught = false;          // caught mid-gesture: absorb the momentum
	var armed = false;           // check for a detent when input lets go
	var running = null;
	var lastFrame = null;
	var lastSet = null;          // last scroll position this code set
	var nativeTimer = null;

	function physicsOn() {
		return desktopMQ.matches && !reduceMotion.matches && list.offsetParent !== null;
	}

	function clamp(v) {
		return Math.max(0, Math.min(document.documentElement.scrollHeight - window.innerHeight, v));
	}

	// Resting spots of every project, in page coordinates
	function detents() {
		var offset = parseFloat(getComputedStyle(root).scrollPaddingTop) || 0;
		var projects = list.querySelectorAll('.project'), out = [];
		for (var i = 0; i < projects.length; i++) {
			out.push(projects[i].getBoundingClientRect().top + window.scrollY - offset);
		}
		return out;
	}

	// Nearest detent ahead of pos in direction d (within range), or null.
	// The spot pos is sitting on doesn't count as ahead.
	function detentAhead(pos, d, range) {
		var all = detents(), best = null;
		for (var i = 0; i < all.length; i++) {
			var dist = (all[i] - pos) * d;
			if (dist > 1 && dist <= range && (best === null || dist < (best - pos) * d)) best = all[i];
		}
		return best;
	}

	// Nearest detent within range in either direction, or null
	function detentNear(pos, range) {
		var all = detents(), best = null;
		for (var i = 0; i < all.length; i++) {
			if (Math.abs(all[i] - pos) <= range &&
			    (best === null || Math.abs(all[i] - pos) < Math.abs(best - pos))) best = all[i];
		}
		return best;
	}

	function catchInto(d, speed) {
		springTo = d;
		tv = speed;
	}

	function stop() {
		if (running) cancelAnimationFrame(running);
		running = null;
		lastFrame = null;
		springTo = null;
		caught = false;
		tv = 0;
	}

	function frame(now) {
		var dt = lastFrame === null ? 1 / 60 : Math.min(0.05, (now - lastFrame) / 1000);
		lastFrame = now;
		var inputActive = now - lastWheel <= INPUT_GAP;

		// Input let go without a catch: the next project ahead (if close),
		// else snap back into one we barely left
		if (!inputActive && armed) {
			armed = false;
			if (springTo === null && dir) {
				var d = detentAhead(target, dir, CATCH_RANGE);
				if (d === null) d = detentNear(target, SNAPBACK);
				if (d !== null) catchInto(d, inputV);
			}
		}

		if (springTo !== null) {
			var friction = 2 * Math.sqrt(DETENT_STIFFNESS) * DETENT_DAMPING;
			tv += (-DETENT_STIFFNESS * (target - springTo) - friction * tv) * dt;
			target += tv * dt;
			if (Math.abs(target - springTo) < 0.5 && Math.abs(tv) < 5) {
				target = springTo;
				tv = 0;
				springTo = null;
			}
		}
		target = clamp(target);

		// The page glides toward the target
		x += (target - x) * (1 - Math.exp(-GLIDE * dt));
		if (Math.abs(target - x) < 0.5 && !inputActive && springTo === null) x = target;
		lastSet = Math.round(x);
		window.scrollTo(0, x);

		if (inputActive || armed || springTo !== null || x !== target) {
			running = requestAnimationFrame(frame);
		} else {
			running = null;
			lastFrame = null;
		}
	}

	function run() {
		if (!running) running = requestAnimationFrame(frame);
	}

	window.addEventListener('wheel', function (e) {
		if (!physicsOn() || e.ctrlKey) return;   // ctrl+wheel = zoom, leave it
		if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;   // sideways
		e.preventDefault();
		var unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
		var delta = e.deltaY * unit;
		if (!delta) return;
		var now = performance.now();
		var gap = now - lastWheel;
		lastWheel = now;
		if (!running) { target = x = window.scrollY; }
		armed = true;

		// A new gesture: break free of any catch and start measuring afresh
		if (gap > GESTURE_GAP || (delta > 0 ? 1 : -1) !== dir) {
			gestureEvents = 0;
			inputV = 0;
			caught = false;
			springTo = null;
			tv = 0;
			dir = delta > 0 ? 1 : -1;
		}
		gestureEvents++;
		if (gestureEvents > 1) {
			var instant = delta / (Math.max(8, gap) / 1000);
			inputV = gestureEvents === 2 ? instant : inputV * 0.6 + instant * 0.4;
		}

		if (caught) {
			// Momentum is being absorbed, unless the user speeds up again
			if (Math.abs(inputV) > RELEASE_SPEED) { caught = false; springTo = null; tv = 0; }
			else { run(); return; }
		}

		target = clamp(target + delta);

		// Momentum dying out: the next project ahead catches it
		if (gestureEvents >= 3 && Math.abs(inputV) < CATCH_SPEED) {
			var d = detentAhead(target, dir, CATCH_RANGE);
			if (d !== null) { caught = true; catchInto(d, inputV); }
		}
		run();
	}, { passive: false });

	// Native scrolling (keys, scrollbar, view switches): keep in step, then
	// settle into a nearby detent once it stops.
	window.addEventListener('scroll', function () {
		if (lastSet !== null && Math.abs(window.scrollY - lastSet) <= 1) return;   // ours
		stop();
		target = x = window.scrollY;
		lastSet = null;
		clearTimeout(nativeTimer);
		nativeTimer = setTimeout(function () {
			if (!physicsOn()) return;
			var d = detentNear(target, SNAPBACK * 2);
			if (d !== null) { catchInto(d, 0); run(); }
		}, NATIVE_IDLE);
	}, { passive: true });

	// A click or key press stops any motion where it is
	['mousedown', 'keydown', 'touchstart'].forEach(function (type) {
		window.addEventListener(type, function () {
			if (running) { stop(); target = x = window.scrollY; }
		}, { passive: true });
	});


	// --- Automation: tool lists ---------------------------------------------
	//
	// From the Cinco tool inventory (2020-2026). Featured tools first, then
	// the rest in a compact list. Left out on purpose: the Pantone lookup
	// sheet (it embeds Pantone data) and tools that went unused or are
	// unfinished (Crop Keynote Video Assets, Image Selects Tracker, Workplan
	// Budget Tracker).

	// Featured tools. name fills the big headline slot and resultNum the small line under it (the process each tool
	// reimagined, in one sentence); story is one paragraph on what changed;
	// stats sit in the side column. A stat containing XX is a placeholder, shown dashed,
	// until the real number is in. All copy here is
	// drafted from the inventory;
	// visual describes the image or short loop to capture. Set image to a
	// file in img/ to replace a placeholder.
	var TOOLS_FEATURED = [
		{ name: 'Retail Deliverables Spreadsheet', client: 'Under Armour', application: 'Retail graphic management', tools: 'Google Sheets, Apps Script',
		  resultNum: 'A shared dropdown system to build and maintain retail graphic campaigns',
		  stats: [ { num: '2000+', label: 'retail graphics produced' }, { num: '100+', label: 'campaigns planned' } ],
		  story: 'Under Armour briefed retail campaigns in static Excel files. I proposed and built a shared Google Sheets system where UA picked graphics from smart dropdowns and sizes filled in automatically. The system supported UA\'s global retail campaigns for four years.' },
		{ name: 'Crop Template System', client: 'EA Sports', application: 'Key art crop production', tools: 'AppleScript, Photoshop, InDesign',
		  resultNum: 'Multi-crop production, simplified',
		  stats: [ { num: '1000+', label: 'unique crops produced' }, { num: '15', label: 'franchise titles' } ],
		  story: 'EA Sports key art needed dozens of sized crops, each exported, named and placed on an all-up sheet by hand. A shared crop template sized every crop at once, and one click exported them all while the InDesign sheet updated itself. So when athlete photography changed late, several days of rework became a one-hour re-export.' },
		{ name: 'Master Campaign Calendar', client: 'Cinco Design', application: 'Campaign scheduling and planning', tools: 'Google Sheets',
		  resultNum: 'A shared horizontal calendar for planning every milestone',
		  stats: [ { num: '1000+', label: 'campaign milestones scheduled' }, { num: '4', label: 'years of retail planned' } ],
		  story: 'Campaign scheduling used to live in a week-by-week grid calendar, which made it hard to see how campaigns overlapped. I proposed a replacement, then built and managed it in Google Sheets: one continuous timeline per year, with a row for every campaign. The team switched and never looked back.' },
		{ name: 'LED Panel Asset\u00a0Generator', client: 'adidas', application: 'Video asset slicing for LED panels', tools: 'AppleScript, FFmpeg',
		  resultNum: 'Production slashed from hours to\u00a0seconds',
		  stats: [ { num: '360', label: 'times faster' }, { num: '100', label: 'hours saved' } ],
		  story: 'Video for adidas LED windows had to go through a supplied After Effects template, which took hours to set up when dozens of assets had to be produced. This tool took the MP4 directly and re-encoded it into the slices each window needed \u2013 no After Effects required.' },
		{ name: 'Box Link Tools for\u00a0Slack', client: 'Cinco Design', application: 'Box file link sharing and opening in Slack', tools: 'AppleScript, Bash, Claude Code',
		  resultNum: 'Finally: One-click Box path sharing in\u00a0macOS',
		  stats: [ { num: '140+', label: 'hours saved per year' }, { num: '40', label: 'daily users' } ],
		  story: 'Sharing cloud-based links across teams has always been difficult. Links only open directly in the user\u2019s browser \u2014 rather than their local cloud storage directory \u2014 requiring manual navigation every time. I created a tool that handled link generation and opening which allowed our entire studio to generate sharable links that open the file or folder path directly in their Finder with one click.' },
		{ name: 'Campaign Image Upscaling', client: 'Under Armour, adidas', application: 'Cross-campaign image upscaling', tools: 'AppleScript, Photoshop',
		  resultNum: 'Foolproof upscaling for any campaign',
		  stats: [ { num: '4000+', label: 'images upscaled' }, { num: '230+', label: 'hours saved' } ],
		  story: 'Low-res images are the bane of modern print production. Checking and upscaling every placement by hand is slow, tedious, and error-prone. This tool scanned an entire campaign, identified every image below the resolution target, upscaled, processed, and relinked them all automatically, saving days of production work per season.' },
		{ name: 'RGB-to-Pantone Picker', client: 'Cinco Design', application: 'RGB and hex to Pantone matching', tools: 'JavaScript, CodePen',
		  resultNum: 'Pantone selection made easy',
		  stats: [ { num: '1000+', label: 'likes on CodePen' }, { num: '100+', label: 'development hours' } ],
		  story: 'Matching a screen color to Pantone meant flipping through swatch books, or using clunky, inaccurate online tools. I built a tool for our design and product teams, allowing them to instantly convert an RGB input to an interactive rainbow of closest-matching swatches across multiple books at once. The tool received rave reviews from both design and product teams. Today, I\u2019m working on its successor, and I can\u2019t wait to show it to the world!' }
	];

	// Groups for the other projects, in grid order: each group is a
	// labeled region two tiles wide, its tiles in its color. The four
	// 4-tile groups pair up in rows; the 2-tile group comes last
	var TOOLS_GROUPS = [
		{ title: 'Production Setup', color: '#7a5ab5' },
		{ title: 'Image and Video Processing', color: '#1f7a70' },
		{ title: 'Asset Tracking and Review', color: '#c03a4d' },
		{ title: 'File Management and Delivery', color: '#4f7a38' },
		{ title: 'Project Management', color: '#3d6bbf' }
	];

	// The other projects, most impressive first within each group. group
	// names a TOOLS_GROUPS title
	var TOOLS_MORE = [
		{ group: 'Project Management', name: 'Budget Estimator', apps: 'Google Sheets', desc: 'Redesigned studio budgeting tool for project managers, integrating client rates, agency roles, and employee list into a beautiful, easy-to-use, adjustable round calculator.' },
		{ group: 'Project Management', name: 'Project Resourcing Tool', apps: 'Google Sheets', desc: 'Tracks designers\' hours across campaigns to prevent overbooking on large campaigns.' },
		{ group: 'Production Setup', name: 'Print Slug Setup', apps: 'InDesign', desc: 'Reads from any data source and generates 100s of print templates of any size with your custom print slug filled in perfectly each time.' },
		{ group: 'Production Setup', name: 'Weave Pattern Separator', apps: 'Illustrator', desc: 'Turns textile-based multicolor artwork into color-separated layers for factory production.' },
		{ group: 'Asset Tracking and Review', name: 'Extract Assets', apps: 'Finder', desc: 'Converts any collection of image, document, or video assets and processes them with retraceable filenames for use in Figma mood boards and research.' },
		{ group: 'File Management and Delivery', name: 'Keynote File Size Reducer', apps: 'Keynote', desc: 'Keynote files are notorious for bloat. This tool extracts the assets inside and compresses them far beyond what Keynote itself is capable of.' },
		{ group: 'Asset Tracking and Review', name: 'Image Stamper', apps: 'Finder', desc: 'Stamps ID codes onto copies of image assets for tracking so that photo selects can be made collaboratively in Figma without losing file provenance.' },
		{ group: 'Asset Tracking and Review', name: 'List All Links', apps: 'InDesign', desc: 'Lists every image used across open InDesign layouts, providing an exact punch list of campaign assets used in final graphics.' },
		{ group: 'Production Setup', name: 'Make Crop Template From Clipboard', apps: 'Photoshop', desc: 'Builds a new crop template from a pasted list of names and sizes.' },
		{ group: 'Asset Tracking and Review', name: 'Make Contact Sheet', apps: 'InDesign', desc: 'Builds labeled, multi-page contact sheets from folders of images almost instantly.' },
		{ group: 'File Management and Delivery', name: 'Package INDD files', apps: 'Finder', desc: 'Batch packages selected InDesign files with their links and fonts, plus any custom step your workflow requires.' },
		{ group: 'File Management and Delivery', name: 'Batch Zip', apps: 'Finder', desc: 'Finder can\'t natively zip multiple folders without grouping them together into one. This tool makes one archive per selection with one click.' },
		{ group: 'Image and Video Processing', name: 'Downres Images', apps: 'InDesign, Photoshop', desc: 'Downscales every image in an InDesign package to shrink it.' },
		{ group: 'Image and Video Processing', name: 'Video Thumbnail Generator', apps: 'Finder', desc: 'Downscales batches of MP4s by percentage, max size, format\u2026 you name it!' },
		{ group: 'Production Setup', name: 'Logo sheet prep tool', apps: 'Illustrator', desc: 'Renames and resizes artboards for EA Sports logo delivery.' },
		{ group: 'Image and Video Processing', name: 'raw2jpg', apps: 'Finder', desc: 'Extracts sized JPGs from RAW files across nested folders at lightning speed.' },
		{ group: 'Image and Video Processing', name: 'Export INDD files to JPG', apps: 'InDesign', desc: 'Batch-exports layouts as JPGs at a chosen resolution and quality. 20 users.' },
		{ group: 'File Management and Delivery', name: 'Count all files in directory', apps: 'Finder', desc: 'Counts every file in a folder tree; used by Under Armour\'s own production team.' }
	];

	function buildTools(listId, templateId, data) {
		var holder = document.getElementById(listId);
		var tpl = document.getElementById(templateId);
		data.forEach(function (item) {
			var el = tpl.content.firstElementChild.cloneNode(true);
			fill(el, item);
			var link = el.querySelector('.tool-link');
			if (link) {
				if (item.link) { link.href = item.link; link.textContent = item.linkText + ' \u2192'; }
				else link.remove();
			}
			// Client / Application / Tools used: each column shows only when the
			// tool has a value for it; the row goes entirely when it has none
			var meta = el.querySelector('.tool-meta');
			// Tools used: keep each multi-word app name together on one line
			var toolsField = el.querySelector('[data-field="tools"]');
			if (toolsField) toolsField.textContent = toolsField.textContent.split(', ').map(function (t) { return t.replace(/ /g, '\u00a0'); }).join(', ');
			if (meta) {
				meta.querySelectorAll('p').forEach(function (p) {
					if (!p.querySelector('[data-field]').textContent) p.remove();
				});
				if (!meta.children.length) meta.remove();
			}

			// Stats under the paragraph; XX marks a number still to fill in
			var statList = el.querySelector('.tool-stats');
			if (statList) {
				var statTpl = document.getElementById('tool-stat');
				(item.stats || []).forEach(function (st) {
					var li = statTpl.content.firstElementChild.cloneNode(true);
					fill(li, st);
					if (st.num.indexOf('XX') !== -1) li.classList.add('is-placeholder');
					statList.appendChild(li);
				});
				if (!statList.children.length) statList.remove();
			}

			holder.appendChild(el);
		});
	}

	buildTools('tools-featured', 'tool-featured', TOOLS_FEATURED);
	// Each group's tiles go in their own region (a two-column block in the
	// grid) under the group's label
	var regionTpl = document.getElementById('tool-region');
	var groupGrid = document.getElementById('tools-more');

	// Every tile takes the height of the tallest one, so the grid reads as
	// even blocks. Measured, not fixed, so it follows any copy change: clear
	// the old height, find the tallest tile, apply it to all (--tile-h).
	// Reruns when the grid's width changes (resize, or the view appearing)
	// and once the web fonts have loaded.
	function equalizeTiles() {
		groupGrid.style.removeProperty('--tile-h');
		var tallest = 0;
		groupGrid.querySelectorAll('.tile').forEach(function (tile) {
			if (tile.offsetParent) tallest = Math.max(tallest, tile.offsetHeight);
		});
		if (tallest) groupGrid.style.setProperty('--tile-h', tallest + 'px');
	}

	var gridWidth = 0;
	new ResizeObserver(function (entries) {
		var w = Math.round(entries[0].contentRect.width);
		if (w && w !== gridWidth) { gridWidth = w; equalizeTiles(); }
	}).observe(groupGrid);
	if (document.fonts) document.fonts.ready.then(equalizeTiles);

	TOOLS_GROUPS.forEach(function (group, i) {
		var tools = TOOLS_MORE.filter(function (tool) { return tool.group === group.title; });
		var region = regionTpl.content.firstElementChild.cloneNode(true);
		fill(region, group);
		region.id = 'tools-region-' + i;
		region.style.setProperty('--group-color', group.color);
		region.style.setProperty('--region-rows', Math.ceil(tools.length / 2) + 1);   // + the label row
		groupGrid.appendChild(region);
		buildTools(region.id, 'tool-row', tools);
	});

	// Stat numbers: each "+" goes into its own span so CSS can make it
	// smaller and raised (.plus), and each "1" into one so CSS can trim the
	// extra space this font's narrow 1 carries on both sides (.one)
	function renderNum(num, text) {
		num.textContent = '';
		var run = '';
		text.split('').forEach(function (ch) {
			if (ch !== '+' && ch !== '1') { run += ch; return; }
			if (run) { num.appendChild(document.createTextNode(run)); run = ''; }
			var span = document.createElement('span');
			span.className = ch === '+' ? 'plus' : 'one';
			span.textContent = ch;
			num.appendChild(span);
		});
		if (run) num.appendChild(document.createTextNode(run));
	}
	document.querySelectorAll('.stat-num, .tstat-num').forEach(function (num) {
		renderNum(num, num.textContent);
	});

	// Stat animation: when a stat scrolls into view (or the page opens with
	// it in view), its orange bar grows from the bottom like a small chart
	// while every number in it counts up from 0, like a rolling counter;
	// both use the same timing and easing, so the bar tracks the count. A
	// "+" stays hidden while the number rolls, then fades in (0.2s).
	// Stats that come into view together start a beat apart, left to right
	// and top to bottom. Each stat runs once. Off with reduced motion.
	var STAT_COUNT_MS = 800;     // number count-up and bar rise, together, the same for every number
	var STAT_STAGGER_MS = 100;   // delay between story stats that appear together
	var OPENER_STAGGER_MS = 200; // delay between the four opener stats
	var statItems = document.querySelectorAll('.tstat, .tools-stats > li');

	function countUp(num) {
		var finalText = num.textContent;
		var targets = finalText.match(/\d+/g);
		if (!targets) return;
		var start = null;
		function frame(now) {
			if (start === null) start = now;
			var t = Math.min(1, (now - start) / STAT_COUNT_MS);
			var eased = 1 - Math.pow(1 - t, 3);   // fast start, gentle landing
			var i = 0;
			renderNum(num, finalText.replace(/\d+/g, function () {
				return String(Math.round(targets[i++] * eased));
			}));
			if (t < 1) requestAnimationFrame(frame);
			else requestAnimationFrame(function () { num.classList.remove('is-rolling'); });   // then the + fades in
		}
		num.classList.add('is-rolling');
		renderNum(num, finalText.replace(/\d+/g, '0'));
		requestAnimationFrame(frame);
	}

	function playStat(item, delay) {
		item.style.setProperty('--stat-delay', delay + 'ms');
		item.classList.add('is-counted');
		var num = item.querySelector('.stat-num, .tstat-num');
		if (num) setTimeout(function () { num.classList.add('is-live'); countUp(num); }, delay);   // numbers stay hidden until their count starts
	}

	// The page head turns the animation on (.stats-anim) before the first
	// paint. If this script arrived too late, the head's fallback has
	// already turned it off and shown the stats as they are: leave them.
	window.statsReady = true;
	if (document.documentElement.classList.contains('stats-anim')) {
		document.documentElement.style.setProperty('--stat-bar-ms', STAT_COUNT_MS + 'ms');   // the bar grows with the count
		// Numbers wait at 0 until their stat is shown
		statItems.forEach(function (item) {
			var num = item.querySelector('.stat-num, .tstat-num');
			if (num && /\d/.test(num.textContent)) {
				var finalText = num.textContent;
				renderNum(num, finalText.replace(/\d+/g, '0'));
				num.classList.add('is-rolling');   // the + stays hidden until the count ends
				num.dataset.final = finalText;
			}
		});
		// Settle the flat (0 height) bars before anything can grow them, so
		// the first stats on screen grow too instead of appearing at full height
		statItems.forEach(function (item) { getComputedStyle(item, '::before').transform; });
		var statObserver = new IntersectionObserver(function (entries) {
			var shown = entries.filter(function (e) { return e.isIntersecting; })
				.map(function (e) { return e.target; })
				.sort(function (a, b) {
					var ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
					return (ra.top - rb.top) || (ra.left - rb.left);
				});
			var opener = 0, story = 0;
			shown.forEach(function (item) {
				statObserver.unobserve(item);
				var num = item.querySelector('.stat-num, .tstat-num');
				if (num && num.dataset.final) renderNum(num, num.dataset.final);
				var isOpener = item.parentNode.classList.contains('tools-stats');
				playStat(item, isOpener ? opener++ * OPENER_STAGGER_MS : story++ * STAT_STAGGER_MS);
			});
		}, { rootMargin: '0px 0px -10% 0px' });   // starts once a stat is a little way into the window
		statItems.forEach(function (item) { statObserver.observe(item); });
	}


	// --- Init -------------------------------------------------------------

	showView();
	fitCaptions();
	measureHeader();
})();
