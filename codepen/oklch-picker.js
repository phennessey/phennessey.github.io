"use strict";
(() => {
  // node_modules/culori/src/rgb/parseNumber.js
  var parseNumber = (color, len) => {
    if (typeof color !== "number") return;
    if (len === 3) {
      return {
        mode: "rgb",
        r: (color >> 8 & 15 | color >> 4 & 240) / 255,
        g: (color >> 4 & 15 | color & 240) / 255,
        b: (color & 15 | color << 4 & 240) / 255
      };
    }
    if (len === 4) {
      return {
        mode: "rgb",
        r: (color >> 12 & 15 | color >> 8 & 240) / 255,
        g: (color >> 8 & 15 | color >> 4 & 240) / 255,
        b: (color >> 4 & 15 | color & 240) / 255,
        alpha: (color & 15 | color << 4 & 240) / 255
      };
    }
    if (len === 6) {
      return {
        mode: "rgb",
        r: (color >> 16 & 255) / 255,
        g: (color >> 8 & 255) / 255,
        b: (color & 255) / 255
      };
    }
    if (len === 8) {
      return {
        mode: "rgb",
        r: (color >> 24 & 255) / 255,
        g: (color >> 16 & 255) / 255,
        b: (color >> 8 & 255) / 255,
        alpha: (color & 255) / 255
      };
    }
  };
  var parseNumber_default = parseNumber;

  // node_modules/culori/src/colors/named.js
  var named = {
    aliceblue: 15792383,
    antiquewhite: 16444375,
    aqua: 65535,
    aquamarine: 8388564,
    azure: 15794175,
    beige: 16119260,
    bisque: 16770244,
    black: 0,
    blanchedalmond: 16772045,
    blue: 255,
    blueviolet: 9055202,
    brown: 10824234,
    burlywood: 14596231,
    cadetblue: 6266528,
    chartreuse: 8388352,
    chocolate: 13789470,
    coral: 16744272,
    cornflowerblue: 6591981,
    cornsilk: 16775388,
    crimson: 14423100,
    cyan: 65535,
    darkblue: 139,
    darkcyan: 35723,
    darkgoldenrod: 12092939,
    darkgray: 11119017,
    darkgreen: 25600,
    darkgrey: 11119017,
    darkkhaki: 12433259,
    darkmagenta: 9109643,
    darkolivegreen: 5597999,
    darkorange: 16747520,
    darkorchid: 10040012,
    darkred: 9109504,
    darksalmon: 15308410,
    darkseagreen: 9419919,
    darkslateblue: 4734347,
    darkslategray: 3100495,
    darkslategrey: 3100495,
    darkturquoise: 52945,
    darkviolet: 9699539,
    deeppink: 16716947,
    deepskyblue: 49151,
    dimgray: 6908265,
    dimgrey: 6908265,
    dodgerblue: 2003199,
    firebrick: 11674146,
    floralwhite: 16775920,
    forestgreen: 2263842,
    fuchsia: 16711935,
    gainsboro: 14474460,
    ghostwhite: 16316671,
    gold: 16766720,
    goldenrod: 14329120,
    gray: 8421504,
    green: 32768,
    greenyellow: 11403055,
    grey: 8421504,
    honeydew: 15794160,
    hotpink: 16738740,
    indianred: 13458524,
    indigo: 4915330,
    ivory: 16777200,
    khaki: 15787660,
    lavender: 15132410,
    lavenderblush: 16773365,
    lawngreen: 8190976,
    lemonchiffon: 16775885,
    lightblue: 11393254,
    lightcoral: 15761536,
    lightcyan: 14745599,
    lightgoldenrodyellow: 16448210,
    lightgray: 13882323,
    lightgreen: 9498256,
    lightgrey: 13882323,
    lightpink: 16758465,
    lightsalmon: 16752762,
    lightseagreen: 2142890,
    lightskyblue: 8900346,
    lightslategray: 7833753,
    lightslategrey: 7833753,
    lightsteelblue: 11584734,
    lightyellow: 16777184,
    lime: 65280,
    limegreen: 3329330,
    linen: 16445670,
    magenta: 16711935,
    maroon: 8388608,
    mediumaquamarine: 6737322,
    mediumblue: 205,
    mediumorchid: 12211667,
    mediumpurple: 9662683,
    mediumseagreen: 3978097,
    mediumslateblue: 8087790,
    mediumspringgreen: 64154,
    mediumturquoise: 4772300,
    mediumvioletred: 13047173,
    midnightblue: 1644912,
    mintcream: 16121850,
    mistyrose: 16770273,
    moccasin: 16770229,
    navajowhite: 16768685,
    navy: 128,
    oldlace: 16643558,
    olive: 8421376,
    olivedrab: 7048739,
    orange: 16753920,
    orangered: 16729344,
    orchid: 14315734,
    palegoldenrod: 15657130,
    palegreen: 10025880,
    paleturquoise: 11529966,
    palevioletred: 14381203,
    papayawhip: 16773077,
    peachpuff: 16767673,
    peru: 13468991,
    pink: 16761035,
    plum: 14524637,
    powderblue: 11591910,
    purple: 8388736,
    // Added in CSS Colors Level 4:
    // https://drafts.csswg.org/css-color/#changes-from-3
    rebeccapurple: 6697881,
    red: 16711680,
    rosybrown: 12357519,
    royalblue: 4286945,
    saddlebrown: 9127187,
    salmon: 16416882,
    sandybrown: 16032864,
    seagreen: 3050327,
    seashell: 16774638,
    sienna: 10506797,
    silver: 12632256,
    skyblue: 8900331,
    slateblue: 6970061,
    slategray: 7372944,
    slategrey: 7372944,
    snow: 16775930,
    springgreen: 65407,
    steelblue: 4620980,
    tan: 13808780,
    teal: 32896,
    thistle: 14204888,
    tomato: 16737095,
    turquoise: 4251856,
    violet: 15631086,
    wheat: 16113331,
    white: 16777215,
    whitesmoke: 16119285,
    yellow: 16776960,
    yellowgreen: 10145074
  };
  var named_default = named;

  // node_modules/culori/src/rgb/parseNamed.js
  var parseNamed = (color) => {
    return parseNumber_default(named_default[color.toLowerCase()], 6);
  };
  var parseNamed_default = parseNamed;

  // node_modules/culori/src/rgb/parseHex.js
  var hex = /^#?([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})$/i;
  var parseHex = (color) => {
    let match;
    return (match = color.match(hex)) ? parseNumber_default(parseInt(match[1], 16), match[1].length) : void 0;
  };
  var parseHex_default = parseHex;

  // node_modules/culori/src/util/regex.js
  var num = "([+-]?\\d*\\.?\\d+(?:[eE][+-]?\\d+)?)";
  var num_none = `(?:${num}|none)`;
  var per = `${num}%`;
  var per_none = `(?:${num}%|none)`;
  var num_per = `(?:${num}%|${num})`;
  var num_per_none = `(?:${num}%|${num}|none)`;
  var hue = `(?:${num}(deg|grad|rad|turn)|${num})`;
  var hue_none = `(?:${num}(deg|grad|rad|turn)|${num}|none)`;
  var c = `\\s*,\\s*`;
  var rx_num_per_none = new RegExp("^" + num_per_none + "$");

  // node_modules/culori/src/rgb/parseRgbLegacy.js
  var rgb_num_old = new RegExp(
    `^rgba?\\(\\s*${num}${c}${num}${c}${num}\\s*(?:,\\s*${num_per}\\s*)?\\)$`
  );
  var rgb_per_old = new RegExp(
    `^rgba?\\(\\s*${per}${c}${per}${c}${per}\\s*(?:,\\s*${num_per}\\s*)?\\)$`
  );
  var parseRgbLegacy = (color) => {
    let res = { mode: "rgb" };
    let match;
    if (match = color.match(rgb_num_old)) {
      if (match[1] !== void 0) {
        res.r = match[1] / 255;
      }
      if (match[2] !== void 0) {
        res.g = match[2] / 255;
      }
      if (match[3] !== void 0) {
        res.b = match[3] / 255;
      }
    } else if (match = color.match(rgb_per_old)) {
      if (match[1] !== void 0) {
        res.r = match[1] / 100;
      }
      if (match[2] !== void 0) {
        res.g = match[2] / 100;
      }
      if (match[3] !== void 0) {
        res.b = match[3] / 100;
      }
    } else {
      return void 0;
    }
    if (match[4] !== void 0) {
      res.alpha = Math.max(0, Math.min(1, match[4] / 100));
    } else if (match[5] !== void 0) {
      res.alpha = Math.max(0, Math.min(1, +match[5]));
    }
    return res;
  };
  var parseRgbLegacy_default = parseRgbLegacy;

  // node_modules/culori/src/_prepare.js
  var prepare = (color, mode) => color === void 0 ? void 0 : typeof color !== "object" ? parse_default(color) : color.mode !== void 0 ? color : mode ? { ...color, mode } : void 0;
  var prepare_default = prepare;

  // node_modules/culori/src/converter.js
  var converter = (target_mode = "rgb") => (color) => (color = prepare_default(color, target_mode)) !== void 0 ? (
    // if the color's mode corresponds to our target mode
    color.mode === target_mode ? (
      // then just return the color
      color
    ) : (
      // otherwise check to see if we have a dedicated
      // converter for the target mode
      converters[color.mode][target_mode] ? (
        // and return its result...
        converters[color.mode][target_mode](color)
      ) : (
        // ...otherwise pass through RGB as an intermediary step.
        // if the target mode is RGB...
        target_mode === "rgb" ? (
          // just return the RGB
          converters[color.mode].rgb(color)
        ) : (
          // otherwise convert color.mode -> RGB -> target_mode
          converters.rgb[target_mode](converters[color.mode].rgb(color))
        )
      )
    )
  ) : void 0;
  var converter_default = converter;

  // node_modules/culori/src/modes.js
  var converters = {};
  var modes = {};
  var parsers = [];
  var colorProfiles = {};
  var identity = (v) => v;
  var useMode = (definition11) => {
    converters[definition11.mode] = {
      ...converters[definition11.mode],
      ...definition11.toMode
    };
    Object.keys(definition11.fromMode || {}).forEach((k3) => {
      if (!converters[k3]) {
        converters[k3] = {};
      }
      converters[k3][definition11.mode] = definition11.fromMode[k3];
    });
    if (!definition11.ranges) {
      definition11.ranges = {};
    }
    if (!definition11.difference) {
      definition11.difference = {};
    }
    definition11.channels.forEach((channel) => {
      if (definition11.ranges[channel] === void 0) {
        definition11.ranges[channel] = [0, 1];
      }
      if (!definition11.interpolate[channel]) {
        throw new Error(`Missing interpolator for: ${channel}`);
      }
      if (typeof definition11.interpolate[channel] === "function") {
        definition11.interpolate[channel] = {
          use: definition11.interpolate[channel]
        };
      }
      if (!definition11.interpolate[channel].fixup) {
        definition11.interpolate[channel].fixup = identity;
      }
    });
    modes[definition11.mode] = definition11;
    (definition11.parse || []).forEach((parser) => {
      useParser(parser, definition11.mode);
    });
    return converter_default(definition11.mode);
  };
  var getMode = (mode) => modes[mode];
  var useParser = (parser, mode) => {
    if (typeof parser === "string") {
      if (!mode) {
        throw new Error(`'mode' required when 'parser' is a string`);
      }
      colorProfiles[parser] = mode;
    } else if (typeof parser === "function") {
      if (parsers.indexOf(parser) < 0) {
        parsers.push(parser);
      }
    }
  };

  // node_modules/culori/src/parse.js
  var IdentStartCodePoint = /[^\x00-\x7F]|[a-zA-Z_]/;
  var IdentCodePoint = /[^\x00-\x7F]|[-\w]/;
  var Tok = {
    Function: "function",
    Ident: "ident",
    Number: "number",
    Percentage: "percentage",
    ParenClose: ")",
    None: "none",
    Hue: "hue",
    Alpha: "alpha"
  };
  var _i = 0;
  function is_num(chars) {
    let ch = chars[_i];
    let ch1 = chars[_i + 1];
    if (ch === "-" || ch === "+") {
      return /\d/.test(ch1) || ch1 === "." && /\d/.test(chars[_i + 2]);
    }
    if (ch === ".") {
      return /\d/.test(ch1);
    }
    return /\d/.test(ch);
  }
  function is_ident(chars) {
    if (_i >= chars.length) {
      return false;
    }
    let ch = chars[_i];
    if (IdentStartCodePoint.test(ch)) {
      return true;
    }
    if (ch === "-") {
      if (chars.length - _i < 2) {
        return false;
      }
      let ch1 = chars[_i + 1];
      if (ch1 === "-" || IdentStartCodePoint.test(ch1)) {
        return true;
      }
      return false;
    }
    return false;
  }
  var huenits = {
    deg: 1,
    rad: 180 / Math.PI,
    grad: 9 / 10,
    turn: 360
  };
  function num2(chars) {
    let value = "";
    if (chars[_i] === "-" || chars[_i] === "+") {
      value += chars[_i++];
    }
    value += digits(chars);
    if (chars[_i] === "." && /\d/.test(chars[_i + 1])) {
      value += chars[_i++] + digits(chars);
    }
    if (chars[_i] === "e" || chars[_i] === "E") {
      if ((chars[_i + 1] === "-" || chars[_i + 1] === "+") && /\d/.test(chars[_i + 2])) {
        value += chars[_i++] + chars[_i++] + digits(chars);
      } else if (/\d/.test(chars[_i + 1])) {
        value += chars[_i++] + digits(chars);
      }
    }
    if (is_ident(chars)) {
      let id = ident(chars);
      if (id === "deg" || id === "rad" || id === "turn" || id === "grad") {
        return { type: Tok.Hue, value: value * huenits[id] };
      }
      return void 0;
    }
    if (chars[_i] === "%") {
      _i++;
      return { type: Tok.Percentage, value: +value };
    }
    return { type: Tok.Number, value: +value };
  }
  function digits(chars) {
    let v = "";
    while (/\d/.test(chars[_i])) {
      v += chars[_i++];
    }
    return v;
  }
  function ident(chars) {
    let v = "";
    while (_i < chars.length && IdentCodePoint.test(chars[_i])) {
      v += chars[_i++];
    }
    return v;
  }
  function identlike(chars) {
    let v = ident(chars);
    if (chars[_i] === "(") {
      _i++;
      return { type: Tok.Function, value: v };
    }
    if (v === "none") {
      return { type: Tok.None, value: void 0 };
    }
    return { type: Tok.Ident, value: v };
  }
  function tokenize(str = "") {
    let chars = str.trim();
    let tokens = [];
    let ch;
    _i = 0;
    while (_i < chars.length) {
      ch = chars[_i++];
      if (ch === "\n" || ch === "	" || ch === " ") {
        while (_i < chars.length && (chars[_i] === "\n" || chars[_i] === "	" || chars[_i] === " ")) {
          _i++;
        }
        continue;
      }
      if (ch === ",") {
        return void 0;
      }
      if (ch === ")") {
        tokens.push({ type: Tok.ParenClose });
        continue;
      }
      if (ch === "+") {
        _i--;
        if (is_num(chars)) {
          tokens.push(num2(chars));
          continue;
        }
        return void 0;
      }
      if (ch === "-") {
        _i--;
        if (is_num(chars)) {
          tokens.push(num2(chars));
          continue;
        }
        if (is_ident(chars)) {
          tokens.push({ type: Tok.Ident, value: ident(chars) });
          continue;
        }
        return void 0;
      }
      if (ch === ".") {
        _i--;
        if (is_num(chars)) {
          tokens.push(num2(chars));
          continue;
        }
        return void 0;
      }
      if (ch === "/") {
        while (_i < chars.length && (chars[_i] === "\n" || chars[_i] === "	" || chars[_i] === " ")) {
          _i++;
        }
        let alpha;
        if (is_num(chars)) {
          alpha = num2(chars);
          if (alpha.type !== Tok.Hue) {
            tokens.push({ type: Tok.Alpha, value: alpha });
            continue;
          }
        }
        if (is_ident(chars)) {
          if (ident(chars) === "none") {
            tokens.push({
              type: Tok.Alpha,
              value: { type: Tok.None, value: void 0 }
            });
            continue;
          }
        }
        return void 0;
      }
      if (/\d/.test(ch)) {
        _i--;
        tokens.push(num2(chars));
        continue;
      }
      if (IdentStartCodePoint.test(ch)) {
        _i--;
        tokens.push(identlike(chars));
        continue;
      }
      return void 0;
    }
    return tokens;
  }
  function parseColorSyntax(tokens) {
    tokens._i = 0;
    let token = tokens[tokens._i++];
    if (!token || token.type !== Tok.Function || token.value !== "color") {
      return void 0;
    }
    token = tokens[tokens._i++];
    if (token.type !== Tok.Ident) {
      return void 0;
    }
    const mode = colorProfiles[token.value];
    if (!mode) {
      return void 0;
    }
    const res = { mode };
    const coords = consumeCoords(tokens, false);
    if (!coords) {
      return void 0;
    }
    const channels = getMode(mode).channels;
    for (let ii = 0, c2, ch; ii < channels.length; ii++) {
      c2 = coords[ii];
      ch = channels[ii];
      if (c2.type !== Tok.None) {
        res[ch] = c2.type === Tok.Number ? c2.value : c2.value / 100;
        if (ch === "alpha") {
          res[ch] = Math.max(0, Math.min(1, res[ch]));
        }
      }
    }
    return res;
  }
  function consumeCoords(tokens, includeHue) {
    const coords = [];
    let token;
    while (tokens._i < tokens.length) {
      token = tokens[tokens._i++];
      if (token.type === Tok.None || token.type === Tok.Number || token.type === Tok.Alpha || token.type === Tok.Percentage || includeHue && token.type === Tok.Hue) {
        coords.push(token);
        continue;
      }
      if (token.type === Tok.ParenClose) {
        if (tokens._i < tokens.length) {
          return void 0;
        }
        continue;
      }
      return void 0;
    }
    if (coords.length < 3 || coords.length > 4) {
      return void 0;
    }
    if (coords.length === 4) {
      if (coords[3].type !== Tok.Alpha) {
        return void 0;
      }
      coords[3] = coords[3].value;
    }
    if (coords.length === 3) {
      coords.push({ type: Tok.None, value: void 0 });
    }
    return coords.every((c2) => c2.type !== Tok.Alpha) ? coords : void 0;
  }
  function parseModernSyntax(tokens, includeHue) {
    tokens._i = 0;
    let token = tokens[tokens._i++];
    if (!token || token.type !== Tok.Function) {
      return void 0;
    }
    let coords = consumeCoords(tokens, includeHue);
    if (!coords) {
      return void 0;
    }
    coords.unshift(token.value);
    return coords;
  }
  var parse = (color) => {
    if (typeof color !== "string") {
      return void 0;
    }
    const tokens = tokenize(color);
    const parsed = tokens ? parseModernSyntax(tokens, true) : void 0;
    let result = void 0;
    let i = 0;
    let len = parsers.length;
    while (i < len) {
      if ((result = parsers[i++](color, parsed)) !== void 0) {
        return result;
      }
    }
    return tokens ? parseColorSyntax(tokens) : void 0;
  };
  var parse_default = parse;

  // node_modules/culori/src/rgb/parseRgb.js
  function parseRgb(color, parsed) {
    if (!parsed || parsed[0] !== "rgb" && parsed[0] !== "rgba") {
      return void 0;
    }
    const res = { mode: "rgb" };
    const [, r2, g, b, alpha] = parsed;
    if (r2.type === Tok.Hue || g.type === Tok.Hue || b.type === Tok.Hue) {
      return void 0;
    }
    if (r2.type !== Tok.None) {
      res.r = r2.type === Tok.Number ? r2.value / 255 : r2.value / 100;
    }
    if (g.type !== Tok.None) {
      res.g = g.type === Tok.Number ? g.value / 255 : g.value / 100;
    }
    if (b.type !== Tok.None) {
      res.b = b.type === Tok.Number ? b.value / 255 : b.value / 100;
    }
    if (alpha.type !== Tok.None) {
      res.alpha = Math.min(
        1,
        Math.max(
          0,
          alpha.type === Tok.Number ? alpha.value : alpha.value / 100
        )
      );
    }
    return res;
  }
  var parseRgb_default = parseRgb;

  // node_modules/culori/src/rgb/parseTransparent.js
  var parseTransparent = (c2) => c2 === "transparent" ? { mode: "rgb", r: 0, g: 0, b: 0, alpha: 0 } : void 0;
  var parseTransparent_default = parseTransparent;

  // node_modules/culori/src/interpolate/lerp.js
  var lerp = (a, b, t) => a + t * (b - a);

  // node_modules/culori/src/interpolate/piecewise.js
  var get_classes = (arr) => {
    let classes = [];
    for (let i = 0; i < arr.length - 1; i++) {
      let a = arr[i];
      let b = arr[i + 1];
      if (a === void 0 && b === void 0) {
        classes.push(void 0);
      } else if (a !== void 0 && b !== void 0) {
        classes.push([a, b]);
      } else {
        classes.push(a !== void 0 ? [a, a] : [b, b]);
      }
    }
    return classes;
  };
  var interpolatorPiecewise = (interpolator) => (arr) => {
    let classes = get_classes(arr);
    return (t) => {
      let cls = t * classes.length;
      let idx = t >= 1 ? classes.length - 1 : Math.max(Math.floor(cls), 0);
      let pair = classes[idx];
      return pair === void 0 ? void 0 : interpolator(pair[0], pair[1], cls - idx);
    };
  };

  // node_modules/culori/src/interpolate/linear.js
  var interpolatorLinear = interpolatorPiecewise(lerp);

  // node_modules/culori/src/fixup/alpha.js
  var fixupAlpha = (arr) => {
    let some_defined = false;
    let res = arr.map((v) => {
      if (v !== void 0) {
        some_defined = true;
        return v;
      }
      return 1;
    });
    return some_defined ? res : arr;
  };

  // node_modules/culori/src/rgb/definition.js
  var definition = {
    mode: "rgb",
    channels: ["r", "g", "b", "alpha"],
    parse: [
      parseRgb_default,
      parseHex_default,
      parseRgbLegacy_default,
      parseNamed_default,
      parseTransparent_default,
      "srgb"
    ],
    serialize: "srgb",
    interpolate: {
      r: interpolatorLinear,
      g: interpolatorLinear,
      b: interpolatorLinear,
      alpha: { use: interpolatorLinear, fixup: fixupAlpha }
    },
    gamut: true,
    white: { r: 1, g: 1, b: 1 },
    black: { r: 0, g: 0, b: 0 }
  };
  var definition_default = definition;

  // node_modules/culori/src/lrgb/convertRgbToLrgb.js
  var fn = (c2 = 0) => {
    const abs = Math.abs(c2);
    if (abs <= 0.04045) {
      return c2 / 12.92;
    }
    return (Math.sign(c2) || 1) * Math.pow((abs + 0.055) / 1.055, 2.4);
  };
  var convertRgbToLrgb = ({ r: r2, g, b, alpha }) => {
    let res = {
      mode: "lrgb",
      r: fn(r2),
      g: fn(g),
      b: fn(b)
    };
    if (alpha !== void 0) res.alpha = alpha;
    return res;
  };
  var convertRgbToLrgb_default = convertRgbToLrgb;

  // node_modules/culori/src/xyz65/convertRgbToXyz65.js
  var convertRgbToXyz65 = (rgb4) => {
    let { r: r2, g, b, alpha } = convertRgbToLrgb_default(rgb4);
    let res = {
      mode: "xyz65",
      x: 0.4123907992659593 * r2 + 0.357584339383878 * g + 0.1804807884018343 * b,
      y: 0.2126390058715102 * r2 + 0.715168678767756 * g + 0.0721923153607337 * b,
      z: 0.0193308187155918 * r2 + 0.119194779794626 * g + 0.9505321522496607 * b
    };
    if (alpha !== void 0) {
      res.alpha = alpha;
    }
    return res;
  };
  var convertRgbToXyz65_default = convertRgbToXyz65;

  // node_modules/culori/src/lrgb/convertLrgbToRgb.js
  var fn2 = (c2 = 0) => {
    const abs = Math.abs(c2);
    if (abs > 31308e-7) {
      return (Math.sign(c2) || 1) * (1.055 * Math.pow(abs, 1 / 2.4) - 0.055);
    }
    return c2 * 12.92;
  };
  var convertLrgbToRgb = ({ r: r2, g, b, alpha }, mode = "rgb") => {
    let res = {
      mode,
      r: fn2(r2),
      g: fn2(g),
      b: fn2(b)
    };
    if (alpha !== void 0) res.alpha = alpha;
    return res;
  };
  var convertLrgbToRgb_default = convertLrgbToRgb;

  // node_modules/culori/src/xyz65/convertXyz65ToRgb.js
  var convertXyz65ToRgb = ({ x, y, z, alpha }) => {
    if (x === void 0) x = 0;
    if (y === void 0) y = 0;
    if (z === void 0) z = 0;
    let res = convertLrgbToRgb_default({
      r: x * 3.2409699419045226 - y * 1.537383177570094 - 0.4986107602930034 * z,
      g: x * -0.9692436362808796 + y * 1.8759675015077204 + 0.0415550574071756 * z,
      b: x * 0.0556300796969936 - y * 0.2039769588889765 + 1.0569715142428784 * z
    });
    if (alpha !== void 0) {
      res.alpha = alpha;
    }
    return res;
  };
  var convertXyz65ToRgb_default = convertXyz65ToRgb;

  // node_modules/culori/src/util/normalizeHue.js
  var normalizeHue = (hue3) => (hue3 = hue3 % 360) < 0 ? hue3 + 360 : hue3;
  var normalizeHue_default = normalizeHue;

  // node_modules/culori/src/fixup/hue.js
  var hue2 = (hues, fn4) => {
    return hues.map((hue3, idx, arr) => {
      if (hue3 === void 0) {
        return hue3;
      }
      let normalized = normalizeHue_default(hue3);
      if (idx === 0 || hues[idx - 1] === void 0) {
        return normalized;
      }
      return fn4(normalized - normalizeHue_default(arr[idx - 1]));
    }).reduce((acc, curr) => {
      if (!acc.length || curr === void 0 || acc[acc.length - 1] === void 0) {
        acc.push(curr);
        return acc;
      }
      acc.push(curr + acc[acc.length - 1]);
      return acc;
    }, []);
  };
  var fixupHueShorter = (arr) => hue2(arr, (d) => Math.abs(d) <= 180 ? d : d - 360 * Math.sign(d));

  // node_modules/culori/src/difference.js
  var differenceHueSaturation = (std, smp) => {
    if (std.h === void 0 || smp.h === void 0 || !std.s || !smp.s) {
      return 0;
    }
    let std_h = normalizeHue_default(std.h);
    let smp_h = normalizeHue_default(smp.h);
    let dH = Math.sin((smp_h - std_h + 360) / 2 * Math.PI / 180);
    return 2 * Math.sqrt(std.s * smp.s) * dH;
  };
  var differenceHueChroma = (std, smp) => {
    if (std.h === void 0 || smp.h === void 0 || !std.c || !smp.c) {
      return 0;
    }
    let std_h = normalizeHue_default(std.h);
    let smp_h = normalizeHue_default(smp.h);
    let dH = Math.sin((smp_h - std_h + 360) / 2 * Math.PI / 180);
    return 2 * Math.sqrt(std.c * smp.c) * dH;
  };
  var differenceEuclidean = (mode = "rgb", weights = [1, 1, 1, 0]) => {
    let def = getMode(mode);
    let channels = def.channels;
    let diffs = def.difference;
    let conv = converter_default(mode);
    return (std, smp) => {
      let ConvStd = conv(std);
      let ConvSmp = conv(smp);
      return Math.sqrt(
        channels.reduce((sum, k3, idx) => {
          let delta = diffs[k3] ? diffs[k3](ConvStd, ConvSmp) : ConvStd[k3] - ConvSmp[k3];
          return sum + (weights[idx] || 0) * Math.pow(isNaN(delta) ? 0 : delta, 2);
        }, 0)
      );
    };
  };

  // node_modules/culori/src/average.js
  var averageAngle = (val) => {
    let sum = val.reduce(
      (sum2, val2) => {
        if (val2 !== void 0) {
          let rad = val2 * Math.PI / 180;
          sum2.sin += Math.sin(rad);
          sum2.cos += Math.cos(rad);
        }
        return sum2;
      },
      { sin: 0, cos: 0 }
    );
    let angle = Math.atan2(sum.sin, sum.cos) * 180 / Math.PI;
    return angle < 0 ? 360 + angle : angle;
  };

  // node_modules/culori/src/lch/convertLabToLch.js
  var convertLabToLch = ({ l, a, b, alpha }, mode = "lch") => {
    if (a === void 0) a = 0;
    if (b === void 0) b = 0;
    let c2 = Math.sqrt(a * a + b * b);
    let res = { mode, l, c: c2 };
    if (c2) res.h = normalizeHue_default(Math.atan2(b, a) * 180 / Math.PI);
    if (alpha !== void 0) res.alpha = alpha;
    return res;
  };
  var convertLabToLch_default = convertLabToLch;

  // node_modules/culori/src/lch/convertLchToLab.js
  var convertLchToLab = ({ l, c: c2, h, alpha }, mode = "lab") => {
    if (h === void 0) h = 0;
    let res = {
      mode,
      l,
      a: c2 ? c2 * Math.cos(h / 180 * Math.PI) : 0,
      b: c2 ? c2 * Math.sin(h / 180 * Math.PI) : 0
    };
    if (alpha !== void 0) res.alpha = alpha;
    return res;
  };
  var convertLchToLab_default = convertLchToLab;

  // node_modules/culori/src/constants.js
  var D50 = {
    X: 0.3457 / 0.3585,
    Y: 1,
    Z: (1 - 0.3457 - 0.3585) / 0.3585
  };
  var D65 = {
    X: 0.3127 / 0.329,
    Y: 1,
    Z: (1 - 0.3127 - 0.329) / 0.329
  };
  var k = Math.pow(29, 3) / Math.pow(3, 3);
  var e = Math.pow(6, 3) / Math.pow(29, 3);

  // node_modules/culori/src/hsl/convertHslToRgb.js
  function convertHslToRgb({ h, s, l, alpha }) {
    h = normalizeHue_default(h !== void 0 ? h : 0);
    if (s === void 0) s = 0;
    if (l === void 0) l = 0;
    let m1 = l + s * (l < 0.5 ? l : 1 - l);
    let m2 = m1 - (m1 - l) * 2 * Math.abs(h / 60 % 2 - 1);
    let res;
    switch (Math.floor(h / 60)) {
      case 0:
        res = { r: m1, g: m2, b: 2 * l - m1 };
        break;
      case 1:
        res = { r: m2, g: m1, b: 2 * l - m1 };
        break;
      case 2:
        res = { r: 2 * l - m1, g: m1, b: m2 };
        break;
      case 3:
        res = { r: 2 * l - m1, g: m2, b: m1 };
        break;
      case 4:
        res = { r: m2, g: 2 * l - m1, b: m1 };
        break;
      case 5:
        res = { r: m1, g: 2 * l - m1, b: m2 };
        break;
      default:
        res = { r: 2 * l - m1, g: 2 * l - m1, b: 2 * l - m1 };
    }
    res.mode = "rgb";
    if (alpha !== void 0) res.alpha = alpha;
    return res;
  }

  // node_modules/culori/src/hsl/convertRgbToHsl.js
  function convertRgbToHsl({ r: r2, g, b, alpha }) {
    if (r2 === void 0) r2 = 0;
    if (g === void 0) g = 0;
    if (b === void 0) b = 0;
    let M = Math.max(r2, g, b), m = Math.min(r2, g, b);
    let res = {
      mode: "hsl",
      s: M === m ? 0 : (M - m) / (1 - Math.abs(M + m - 1)),
      l: 0.5 * (M + m)
    };
    if (M - m !== 0)
      res.h = (M === r2 ? (g - b) / (M - m) + (g < b) * 6 : M === g ? (b - r2) / (M - m) + 2 : (r2 - g) / (M - m) + 4) * 60;
    if (alpha !== void 0) res.alpha = alpha;
    return res;
  }

  // node_modules/culori/src/util/hue.js
  var hueToDeg = (val, unit) => {
    switch (unit) {
      case "deg":
        return +val;
      case "rad":
        return val / Math.PI * 180;
      case "grad":
        return val / 10 * 9;
      case "turn":
        return val * 360;
    }
  };
  var hue_default = hueToDeg;

  // node_modules/culori/src/hsl/parseHslLegacy.js
  var hsl_old = new RegExp(
    `^hsla?\\(\\s*${hue}${c}${per}${c}${per}\\s*(?:,\\s*${num_per}\\s*)?\\)$`
  );
  var parseHslLegacy = (color) => {
    let match = color.match(hsl_old);
    if (!match) return;
    let res = { mode: "hsl" };
    if (match[3] !== void 0) {
      res.h = +match[3];
    } else if (match[1] !== void 0 && match[2] !== void 0) {
      res.h = hue_default(match[1], match[2]);
    }
    if (match[4] !== void 0) {
      res.s = Math.min(Math.max(0, match[4] / 100), 1);
    }
    if (match[5] !== void 0) {
      res.l = Math.min(Math.max(0, match[5] / 100), 1);
    }
    if (match[6] !== void 0) {
      res.alpha = Math.max(0, Math.min(1, match[6] / 100));
    } else if (match[7] !== void 0) {
      res.alpha = Math.max(0, Math.min(1, +match[7]));
    }
    return res;
  };
  var parseHslLegacy_default = parseHslLegacy;

  // node_modules/culori/src/hsl/parseHsl.js
  function parseHsl(color, parsed) {
    if (!parsed || parsed[0] !== "hsl" && parsed[0] !== "hsla") {
      return void 0;
    }
    const res = { mode: "hsl" };
    const [, h, s, l, alpha] = parsed;
    if (h.type !== Tok.None) {
      if (h.type === Tok.Percentage) {
        return void 0;
      }
      res.h = h.value;
    }
    if (s.type !== Tok.None) {
      if (s.type === Tok.Hue) {
        return void 0;
      }
      res.s = s.value / 100;
    }
    if (l.type !== Tok.None) {
      if (l.type === Tok.Hue) {
        return void 0;
      }
      res.l = l.value / 100;
    }
    if (alpha.type !== Tok.None) {
      res.alpha = Math.min(
        1,
        Math.max(
          0,
          alpha.type === Tok.Number ? alpha.value : alpha.value / 100
        )
      );
    }
    return res;
  }
  var parseHsl_default = parseHsl;

  // node_modules/culori/src/hsl/definition.js
  var definition2 = {
    mode: "hsl",
    toMode: {
      rgb: convertHslToRgb
    },
    fromMode: {
      rgb: convertRgbToHsl
    },
    channels: ["h", "s", "l", "alpha"],
    ranges: {
      h: [0, 360]
    },
    gamut: "rgb",
    parse: [parseHsl_default, parseHslLegacy_default],
    serialize: (c2) => `hsl(${c2.h !== void 0 ? c2.h : "none"} ${c2.s !== void 0 ? c2.s * 100 + "%" : "none"} ${c2.l !== void 0 ? c2.l * 100 + "%" : "none"}${c2.alpha < 1 ? ` / ${c2.alpha}` : ""})`,
    interpolate: {
      h: { use: interpolatorLinear, fixup: fixupHueShorter },
      s: interpolatorLinear,
      l: interpolatorLinear,
      alpha: { use: interpolatorLinear, fixup: fixupAlpha }
    },
    difference: {
      h: differenceHueSaturation
    },
    average: {
      h: averageAngle
    }
  };
  var definition_default2 = definition2;

  // node_modules/culori/src/xyz50/constants.js
  var k2 = Math.pow(29, 3) / Math.pow(3, 3);
  var e2 = Math.pow(6, 3) / Math.pow(29, 3);

  // node_modules/culori/src/lab/convertLabToXyz50.js
  var fn3 = (v) => Math.pow(v, 3) > e2 ? Math.pow(v, 3) : (116 * v - 16) / k2;
  var convertLabToXyz50 = ({ l, a, b, alpha }) => {
    if (l === void 0) l = 0;
    if (a === void 0) a = 0;
    if (b === void 0) b = 0;
    let fy = (l + 16) / 116;
    let fx = a / 500 + fy;
    let fz = fy - b / 200;
    let res = {
      mode: "xyz50",
      x: fn3(fx) * D50.X,
      y: fn3(fy) * D50.Y,
      z: fn3(fz) * D50.Z
    };
    if (alpha !== void 0) {
      res.alpha = alpha;
    }
    return res;
  };
  var convertLabToXyz50_default = convertLabToXyz50;

  // node_modules/culori/src/xyz50/convertXyz50ToRgb.js
  var convertXyz50ToRgb = ({ x, y, z, alpha }) => {
    if (x === void 0) x = 0;
    if (y === void 0) y = 0;
    if (z === void 0) z = 0;
    let res = convertLrgbToRgb_default({
      r: x * 3.1341359569958707 - y * 1.6173863321612538 - 0.4906619460083532 * z,
      g: x * -0.978795502912089 + y * 1.916254567259524 + 0.03344273116131949 * z,
      b: x * 0.07195537988411677 - y * 0.2289768264158322 + 1.405386058324125 * z
    });
    if (alpha !== void 0) {
      res.alpha = alpha;
    }
    return res;
  };
  var convertXyz50ToRgb_default = convertXyz50ToRgb;

  // node_modules/culori/src/lab/convertLabToRgb.js
  var convertLabToRgb = (lab2) => convertXyz50ToRgb_default(convertLabToXyz50_default(lab2));
  var convertLabToRgb_default = convertLabToRgb;

  // node_modules/culori/src/xyz50/convertRgbToXyz50.js
  var convertRgbToXyz50 = (rgb4) => {
    let { r: r2, g, b, alpha } = convertRgbToLrgb_default(rgb4);
    let res = {
      mode: "xyz50",
      x: 0.436065742824811 * r2 + 0.3851514688337912 * g + 0.14307845442264197 * b,
      y: 0.22249319175623702 * r2 + 0.7168870538238823 * g + 0.06061979053616537 * b,
      z: 0.013923904500943465 * r2 + 0.09708128566574634 * g + 0.7140993584005155 * b
    };
    if (alpha !== void 0) {
      res.alpha = alpha;
    }
    return res;
  };
  var convertRgbToXyz50_default = convertRgbToXyz50;

  // node_modules/culori/src/lab/convertXyz50ToLab.js
  var f = (value) => value > e2 ? Math.cbrt(value) : (k2 * value + 16) / 116;
  var convertXyz50ToLab = ({ x, y, z, alpha }) => {
    if (x === void 0) x = 0;
    if (y === void 0) y = 0;
    if (z === void 0) z = 0;
    let f0 = f(x / D50.X);
    let f1 = f(y / D50.Y);
    let f2 = f(z / D50.Z);
    let res = {
      mode: "lab",
      l: 116 * f1 - 16,
      a: 500 * (f0 - f1),
      b: 200 * (f1 - f2)
    };
    if (alpha !== void 0) {
      res.alpha = alpha;
    }
    return res;
  };
  var convertXyz50ToLab_default = convertXyz50ToLab;

  // node_modules/culori/src/lab/convertRgbToLab.js
  var convertRgbToLab = (rgb4) => {
    let res = convertXyz50ToLab_default(convertRgbToXyz50_default(rgb4));
    if (rgb4.r === rgb4.b && rgb4.b === rgb4.g) {
      res.a = res.b = 0;
    }
    return res;
  };
  var convertRgbToLab_default = convertRgbToLab;

  // node_modules/culori/src/lab/parseLab.js
  function parseLab(color, parsed) {
    if (!parsed || parsed[0] !== "lab") {
      return void 0;
    }
    const res = { mode: "lab" };
    const [, l, a, b, alpha] = parsed;
    if (l.type === Tok.Hue || a.type === Tok.Hue || b.type === Tok.Hue) {
      return void 0;
    }
    if (l.type !== Tok.None) {
      res.l = Math.min(Math.max(0, l.value), 100);
    }
    if (a.type !== Tok.None) {
      res.a = a.type === Tok.Number ? a.value : a.value * 125 / 100;
    }
    if (b.type !== Tok.None) {
      res.b = b.type === Tok.Number ? b.value : b.value * 125 / 100;
    }
    if (alpha.type !== Tok.None) {
      res.alpha = Math.min(
        1,
        Math.max(
          0,
          alpha.type === Tok.Number ? alpha.value : alpha.value / 100
        )
      );
    }
    return res;
  }
  var parseLab_default = parseLab;

  // node_modules/culori/src/lab/definition.js
  var definition3 = {
    mode: "lab",
    toMode: {
      xyz50: convertLabToXyz50_default,
      rgb: convertLabToRgb_default
    },
    fromMode: {
      xyz50: convertXyz50ToLab_default,
      rgb: convertRgbToLab_default
    },
    channels: ["l", "a", "b", "alpha"],
    ranges: {
      l: [0, 100],
      a: [-125, 125],
      b: [-125, 125]
    },
    parse: [parseLab_default],
    serialize: (c2) => `lab(${c2.l !== void 0 ? c2.l : "none"} ${c2.a !== void 0 ? c2.a : "none"} ${c2.b !== void 0 ? c2.b : "none"}${c2.alpha < 1 ? ` / ${c2.alpha}` : ""})`,
    interpolate: {
      l: interpolatorLinear,
      a: interpolatorLinear,
      b: interpolatorLinear,
      alpha: { use: interpolatorLinear, fixup: fixupAlpha }
    }
  };
  var definition_default3 = definition3;

  // node_modules/culori/src/lch/parseLch.js
  function parseLch(color, parsed) {
    if (!parsed || parsed[0] !== "lch") {
      return void 0;
    }
    const res = { mode: "lch" };
    const [, l, c2, h, alpha] = parsed;
    if (l.type !== Tok.None) {
      if (l.type === Tok.Hue) {
        return void 0;
      }
      res.l = Math.min(Math.max(0, l.value), 100);
    }
    if (c2.type !== Tok.None) {
      res.c = Math.max(
        0,
        c2.type === Tok.Number ? c2.value : c2.value * 150 / 100
      );
    }
    if (h.type !== Tok.None) {
      if (h.type === Tok.Percentage) {
        return void 0;
      }
      res.h = h.value;
    }
    if (alpha.type !== Tok.None) {
      res.alpha = Math.min(
        1,
        Math.max(
          0,
          alpha.type === Tok.Number ? alpha.value : alpha.value / 100
        )
      );
    }
    return res;
  }
  var parseLch_default = parseLch;

  // node_modules/culori/src/lch/definition.js
  var definition4 = {
    mode: "lch",
    toMode: {
      lab: convertLchToLab_default,
      rgb: (c2) => convertLabToRgb_default(convertLchToLab_default(c2))
    },
    fromMode: {
      rgb: (c2) => convertLabToLch_default(convertRgbToLab_default(c2)),
      lab: convertLabToLch_default
    },
    channels: ["l", "c", "h", "alpha"],
    ranges: {
      l: [0, 100],
      c: [0, 150],
      h: [0, 360]
    },
    parse: [parseLch_default],
    serialize: (c2) => `lch(${c2.l !== void 0 ? c2.l : "none"} ${c2.c !== void 0 ? c2.c : "none"} ${c2.h !== void 0 ? c2.h : "none"}${c2.alpha < 1 ? ` / ${c2.alpha}` : ""})`,
    interpolate: {
      h: { use: interpolatorLinear, fixup: fixupHueShorter },
      c: interpolatorLinear,
      l: interpolatorLinear,
      alpha: { use: interpolatorLinear, fixup: fixupAlpha }
    },
    difference: {
      h: differenceHueChroma
    },
    average: {
      h: averageAngle
    }
  };
  var definition_default4 = definition4;

  // node_modules/culori/src/lrgb/definition.js
  var definition5 = {
    ...definition_default,
    mode: "lrgb",
    toMode: {
      rgb: convertLrgbToRgb_default
    },
    fromMode: {
      rgb: convertRgbToLrgb_default
    },
    parse: ["srgb-linear"],
    serialize: "srgb-linear"
  };
  var definition_default5 = definition5;

  // node_modules/culori/src/oklab/convertLrgbToOklab.js
  var convertLrgbToOklab = ({ r: r2, g, b, alpha }) => {
    if (r2 === void 0) r2 = 0;
    if (g === void 0) g = 0;
    if (b === void 0) b = 0;
    let L = Math.cbrt(
      0.412221469470763 * r2 + 0.5363325372617348 * g + 0.0514459932675022 * b
    );
    let M = Math.cbrt(
      0.2119034958178252 * r2 + 0.6806995506452344 * g + 0.1073969535369406 * b
    );
    let S = Math.cbrt(
      0.0883024591900564 * r2 + 0.2817188391361215 * g + 0.6299787016738222 * b
    );
    let res = {
      mode: "oklab",
      l: 0.210454268309314 * L + 0.7936177747023054 * M - 0.0040720430116193 * S,
      a: 1.9779985324311684 * L - 2.42859224204858 * M + 0.450593709617411 * S,
      b: 0.0259040424655478 * L + 0.7827717124575296 * M - 0.8086757549230774 * S
    };
    if (alpha !== void 0) {
      res.alpha = alpha;
    }
    return res;
  };
  var convertLrgbToOklab_default = convertLrgbToOklab;

  // node_modules/culori/src/oklab/convertRgbToOklab.js
  var convertRgbToOklab = (rgb4) => {
    let res = convertLrgbToOklab_default(convertRgbToLrgb_default(rgb4));
    if (rgb4.r === rgb4.b && rgb4.b === rgb4.g) {
      res.a = res.b = 0;
    }
    return res;
  };
  var convertRgbToOklab_default = convertRgbToOklab;

  // node_modules/culori/src/oklab/convertOklabToLrgb.js
  var convertOklabToLrgb = ({ l, a, b, alpha }) => {
    if (l === void 0) l = 0;
    if (a === void 0) a = 0;
    if (b === void 0) b = 0;
    let L = Math.pow(l + 0.3963377773761749 * a + 0.2158037573099136 * b, 3);
    let M = Math.pow(l - 0.1055613458156586 * a - 0.0638541728258133 * b, 3);
    let S = Math.pow(l - 0.0894841775298119 * a - 1.2914855480194092 * b, 3);
    let res = {
      mode: "lrgb",
      r: 4.076741636075957 * L - 3.3077115392580616 * M + 0.2309699031821044 * S,
      g: -1.2684379732850317 * L + 2.6097573492876887 * M - 0.3413193760026573 * S,
      b: -0.0041960761386756 * L - 0.7034186179359362 * M + 1.7076146940746117 * S
    };
    if (alpha !== void 0) {
      res.alpha = alpha;
    }
    return res;
  };
  var convertOklabToLrgb_default = convertOklabToLrgb;

  // node_modules/culori/src/oklab/convertOklabToRgb.js
  var convertOklabToRgb = (c2) => convertLrgbToRgb_default(convertOklabToLrgb_default(c2));
  var convertOklabToRgb_default = convertOklabToRgb;

  // node_modules/culori/src/oklab/parseOklab.js
  function parseOklab(color, parsed) {
    if (!parsed || parsed[0] !== "oklab") {
      return void 0;
    }
    const res = { mode: "oklab" };
    const [, l, a, b, alpha] = parsed;
    if (l.type === Tok.Hue || a.type === Tok.Hue || b.type === Tok.Hue) {
      return void 0;
    }
    if (l.type !== Tok.None) {
      res.l = Math.min(
        Math.max(0, l.type === Tok.Number ? l.value : l.value / 100),
        1
      );
    }
    if (a.type !== Tok.None) {
      res.a = a.type === Tok.Number ? a.value : a.value * 0.4 / 100;
    }
    if (b.type !== Tok.None) {
      res.b = b.type === Tok.Number ? b.value : b.value * 0.4 / 100;
    }
    if (alpha.type !== Tok.None) {
      res.alpha = Math.min(
        1,
        Math.max(
          0,
          alpha.type === Tok.Number ? alpha.value : alpha.value / 100
        )
      );
    }
    return res;
  }
  var parseOklab_default = parseOklab;

  // node_modules/culori/src/oklab/definition.js
  var definition6 = {
    ...definition_default3,
    mode: "oklab",
    toMode: {
      lrgb: convertOklabToLrgb_default,
      rgb: convertOklabToRgb_default
    },
    fromMode: {
      lrgb: convertLrgbToOklab_default,
      rgb: convertRgbToOklab_default
    },
    ranges: {
      l: [0, 1],
      a: [-0.4, 0.4],
      b: [-0.4, 0.4]
    },
    parse: [parseOklab_default],
    serialize: (c2) => `oklab(${c2.l !== void 0 ? c2.l : "none"} ${c2.a !== void 0 ? c2.a : "none"} ${c2.b !== void 0 ? c2.b : "none"}${c2.alpha < 1 ? ` / ${c2.alpha}` : ""})`
  };
  var definition_default6 = definition6;

  // node_modules/culori/src/oklch/parseOklch.js
  function parseOklch(color, parsed) {
    if (!parsed || parsed[0] !== "oklch") {
      return void 0;
    }
    const res = { mode: "oklch" };
    const [, l, c2, h, alpha] = parsed;
    if (l.type !== Tok.None) {
      if (l.type === Tok.Hue) {
        return void 0;
      }
      res.l = Math.min(
        Math.max(0, l.type === Tok.Number ? l.value : l.value / 100),
        1
      );
    }
    if (c2.type !== Tok.None) {
      res.c = Math.max(
        0,
        c2.type === Tok.Number ? c2.value : c2.value * 0.4 / 100
      );
    }
    if (h.type !== Tok.None) {
      if (h.type === Tok.Percentage) {
        return void 0;
      }
      res.h = h.value;
    }
    if (alpha.type !== Tok.None) {
      res.alpha = Math.min(
        1,
        Math.max(
          0,
          alpha.type === Tok.Number ? alpha.value : alpha.value / 100
        )
      );
    }
    return res;
  }
  var parseOklch_default = parseOklch;

  // node_modules/culori/src/oklch/definition.js
  var definition7 = {
    ...definition_default4,
    mode: "oklch",
    toMode: {
      oklab: (c2) => convertLchToLab_default(c2, "oklab"),
      rgb: (c2) => convertOklabToRgb_default(convertLchToLab_default(c2, "oklab"))
    },
    fromMode: {
      rgb: (c2) => convertLabToLch_default(convertRgbToOklab_default(c2), "oklch"),
      oklab: (c2) => convertLabToLch_default(c2, "oklch")
    },
    parse: [parseOklch_default],
    serialize: (c2) => `oklch(${c2.l !== void 0 ? c2.l : "none"} ${c2.c !== void 0 ? c2.c : "none"} ${c2.h !== void 0 ? c2.h : "none"}${c2.alpha < 1 ? ` / ${c2.alpha}` : ""})`,
    ranges: {
      l: [0, 1],
      c: [0, 0.4],
      h: [0, 360]
    }
  };
  var definition_default7 = definition7;

  // node_modules/culori/src/p3/convertP3ToXyz65.js
  var convertP3ToXyz65 = (rgb4) => {
    let { r: r2, g, b, alpha } = convertRgbToLrgb_default(rgb4);
    let res = {
      mode: "xyz65",
      x: 0.486570948648216 * r2 + 0.265667693169093 * g + 0.1982172852343625 * b,
      y: 0.2289745640697487 * r2 + 0.6917385218365062 * g + 0.079286914093745 * b,
      z: 0 * r2 + 0.0451133818589026 * g + 1.043944368900976 * b
    };
    if (alpha !== void 0) {
      res.alpha = alpha;
    }
    return res;
  };
  var convertP3ToXyz65_default = convertP3ToXyz65;

  // node_modules/culori/src/p3/convertXyz65ToP3.js
  var convertXyz65ToP3 = ({ x, y, z, alpha }) => {
    if (x === void 0) x = 0;
    if (y === void 0) y = 0;
    if (z === void 0) z = 0;
    let res = convertLrgbToRgb_default(
      {
        r: x * 2.4934969119414263 - y * 0.9313836179191242 - 0.402710784450717 * z,
        g: x * -0.8294889695615749 + y * 1.7626640603183465 + 0.0236246858419436 * z,
        b: x * 0.0358458302437845 - y * 0.0761723892680418 + 0.9568845240076871 * z
      },
      "p3"
    );
    if (alpha !== void 0) {
      res.alpha = alpha;
    }
    return res;
  };
  var convertXyz65ToP3_default = convertXyz65ToP3;

  // node_modules/culori/src/p3/definition.js
  var definition8 = {
    ...definition_default,
    mode: "p3",
    parse: ["display-p3"],
    serialize: "display-p3",
    fromMode: {
      rgb: (color) => convertXyz65ToP3_default(convertRgbToXyz65_default(color)),
      xyz65: convertXyz65ToP3_default
    },
    toMode: {
      rgb: (color) => convertXyz65ToRgb_default(convertP3ToXyz65_default(color)),
      xyz65: convertP3ToXyz65_default
    }
  };
  var definition_default8 = definition8;

  // node_modules/culori/src/rec2020/convertXyz65ToRec2020.js
  var \u03B1 = 1.09929682680944;
  var \u03B2 = 0.018053968510807;
  var gamma = (v) => {
    const abs = Math.abs(v);
    if (abs > \u03B2) {
      return (Math.sign(v) || 1) * (\u03B1 * Math.pow(abs, 0.45) - (\u03B1 - 1));
    }
    return 4.5 * v;
  };
  var convertXyz65ToRec2020 = ({ x, y, z, alpha }) => {
    if (x === void 0) x = 0;
    if (y === void 0) y = 0;
    if (z === void 0) z = 0;
    let res = {
      mode: "rec2020",
      r: gamma(
        x * 1.7166511879712683 - y * 0.3556707837763925 - 0.2533662813736599 * z
      ),
      g: gamma(
        x * -0.6666843518324893 + y * 1.6164812366349395 + 0.0157685458139111 * z
      ),
      b: gamma(
        x * 0.0176398574453108 - y * 0.0427706132578085 + 0.9421031212354739 * z
      )
    };
    if (alpha !== void 0) {
      res.alpha = alpha;
    }
    return res;
  };
  var convertXyz65ToRec2020_default = convertXyz65ToRec2020;

  // node_modules/culori/src/rec2020/convertRec2020ToXyz65.js
  var \u03B12 = 1.09929682680944;
  var \u03B22 = 0.018053968510807;
  var linearize = (v = 0) => {
    let abs = Math.abs(v);
    if (abs < \u03B22 * 4.5) {
      return v / 4.5;
    }
    return (Math.sign(v) || 1) * Math.pow((abs + \u03B12 - 1) / \u03B12, 1 / 0.45);
  };
  var convertRec2020ToXyz65 = (rec20202) => {
    let r2 = linearize(rec20202.r);
    let g = linearize(rec20202.g);
    let b = linearize(rec20202.b);
    let res = {
      mode: "xyz65",
      x: 0.6369580483012911 * r2 + 0.1446169035862083 * g + 0.1688809751641721 * b,
      y: 0.262700212011267 * r2 + 0.6779980715188708 * g + 0.059301716469862 * b,
      z: 0 * r2 + 0.0280726930490874 * g + 1.0609850577107909 * b
    };
    if (rec20202.alpha !== void 0) {
      res.alpha = rec20202.alpha;
    }
    return res;
  };
  var convertRec2020ToXyz65_default = convertRec2020ToXyz65;

  // node_modules/culori/src/rec2020/definition.js
  var definition9 = {
    ...definition_default,
    mode: "rec2020",
    fromMode: {
      xyz65: convertXyz65ToRec2020_default,
      rgb: (color) => convertXyz65ToRec2020_default(convertRgbToXyz65_default(color))
    },
    toMode: {
      xyz65: convertRec2020ToXyz65_default,
      rgb: (color) => convertXyz65ToRgb_default(convertRec2020ToXyz65_default(color))
    },
    parse: ["rec2020"],
    serialize: "rec2020"
  };
  var definition_default9 = definition9;

  // node_modules/culori/src/xyz65/convertXyz65ToXyz50.js
  var convertXyz65ToXyz50 = (xyz652) => {
    let { x, y, z, alpha } = xyz652;
    if (x === void 0) x = 0;
    if (y === void 0) y = 0;
    if (z === void 0) z = 0;
    let res = {
      mode: "xyz50",
      x: 1.0479298208405488 * x + 0.0229467933410191 * y - 0.0501922295431356 * z,
      y: 0.0296278156881593 * x + 0.990434484573249 * y - 0.0170738250293851 * z,
      z: -0.0092430581525912 * x + 0.0150551448965779 * y + 0.7518742899580008 * z
    };
    if (alpha !== void 0) {
      res.alpha = alpha;
    }
    return res;
  };
  var convertXyz65ToXyz50_default = convertXyz65ToXyz50;

  // node_modules/culori/src/xyz65/convertXyz50ToXyz65.js
  var convertXyz50ToXyz65 = (xyz50) => {
    let { x, y, z, alpha } = xyz50;
    if (x === void 0) x = 0;
    if (y === void 0) y = 0;
    if (z === void 0) z = 0;
    let res = {
      mode: "xyz65",
      x: 0.9554734527042182 * x - 0.0230985368742614 * y + 0.0632593086610217 * z,
      y: -0.0283697069632081 * x + 1.0099954580058226 * y + 0.021041398966943 * z,
      z: 0.0123140016883199 * x - 0.0205076964334779 * y + 1.3303659366080753 * z
    };
    if (alpha !== void 0) {
      res.alpha = alpha;
    }
    return res;
  };
  var convertXyz50ToXyz65_default = convertXyz50ToXyz65;

  // node_modules/culori/src/xyz65/definition.js
  var definition10 = {
    mode: "xyz65",
    toMode: {
      rgb: convertXyz65ToRgb_default,
      xyz50: convertXyz65ToXyz50_default
    },
    fromMode: {
      rgb: convertRgbToXyz65_default,
      xyz50: convertXyz50ToXyz65_default
    },
    ranges: {
      x: [0, 0.95],
      y: [0, 1],
      z: [0, 1.088]
    },
    channels: ["x", "y", "z", "alpha"],
    parse: ["xyz", "xyz-d65"],
    serialize: "xyz-d65",
    interpolate: {
      x: interpolatorLinear,
      y: interpolatorLinear,
      z: interpolatorLinear,
      alpha: { use: interpolatorLinear, fixup: fixupAlpha }
    }
  };
  var definition_default10 = definition10;

  // node_modules/culori/src/round.js
  var r = (value, precision) => Math.round(value * (precision = Math.pow(10, precision))) / precision;
  var round = (precision = 4) => (value) => typeof value === "number" ? r(value, precision) : value;
  var round_default = round;

  // node_modules/culori/src/formatter.js
  var twoDecimals = round_default(2);
  var clamp = (value) => Math.max(0, Math.min(1, value || 0));
  var fixup = (value) => Math.round(clamp(value) * 255);
  var rgb = converter_default("rgb");
  var hsl = converter_default("hsl");
  var serializeRgb = (color) => {
    if (color === void 0) {
      return void 0;
    }
    let r2 = fixup(color.r);
    let g = fixup(color.g);
    let b = fixup(color.b);
    if (color.alpha === void 0 || color.alpha === 1) {
      return `rgb(${r2}, ${g}, ${b})`;
    } else {
      return `rgba(${r2}, ${g}, ${b}, ${twoDecimals(clamp(color.alpha))})`;
    }
  };
  var formatCss = (c2) => {
    const color = prepare_default(c2);
    if (!color) {
      return void 0;
    }
    const def = getMode(color.mode);
    if (!def.serialize || typeof def.serialize === "string") {
      let res = `color(${def.serialize || `--${color.mode}`} `;
      def.channels.forEach((ch, i) => {
        if (ch !== "alpha") {
          res += (i ? " " : "") + (color[ch] !== void 0 ? color[ch] : "none");
        }
      });
      if (color.alpha !== void 0 && color.alpha < 1) {
        res += ` / ${color.alpha}`;
      }
      return res + ")";
    }
    if (typeof def.serialize === "function") {
      return def.serialize(color);
    }
    return void 0;
  };
  var formatRgb = (c2) => serializeRgb(rgb(c2));

  // node_modules/culori/src/clamp.js
  var rgb2 = converter_default("rgb");
  var fixup_rgb = (c2) => {
    const res = {
      mode: c2.mode,
      r: Math.max(0, Math.min(c2.r !== void 0 ? c2.r : 0, 1)),
      g: Math.max(0, Math.min(c2.g !== void 0 ? c2.g : 0, 1)),
      b: Math.max(0, Math.min(c2.b !== void 0 ? c2.b : 0, 1))
    };
    if (c2.alpha !== void 0) {
      res.alpha = c2.alpha;
    }
    return res;
  };
  var inrange_rgb = (c2) => {
    return c2 !== void 0 && (c2.r === void 0 || c2.r >= 0 && c2.r <= 1) && (c2.g === void 0 || c2.g >= 0 && c2.g <= 1) && (c2.b === void 0 || c2.b >= 0 && c2.b <= 1);
  };
  function inGamut(mode = "rgb") {
    const { gamut } = getMode(mode);
    if (!gamut) {
      return (color) => true;
    }
    const conv = converter_default(typeof gamut === "string" ? gamut : mode);
    return (color) => inrange_rgb(conv(color));
  }
  function clampGamut(mode = "rgb") {
    const { gamut } = getMode(mode);
    if (!gamut) {
      return (color) => prepare_default(color);
    }
    const destMode = typeof gamut === "string" ? gamut : mode;
    const destConv = converter_default(destMode);
    const inDestGamut = inGamut(destMode);
    return (color) => {
      const original = prepare_default(color);
      if (!original) {
        return void 0;
      }
      const converted = destConv(original);
      if (inDestGamut(converted)) {
        return original;
      }
      const clamped = fixup_rgb(converted);
      if (original.mode === clamped.mode) {
        return clamped;
      }
      return converter_default(original.mode)(clamped);
    };
  }
  function toGamut(dest = "rgb", mode = "oklch", delta = differenceEuclidean("oklch"), jnd = 0.02) {
    const destConv = converter_default(dest);
    const destMode = getMode(dest);
    if (!destMode.gamut) {
      return (color) => destConv(color);
    }
    const inDestinationGamut = inGamut(dest);
    const clipToGamut = clampGamut(dest);
    const ucs = converter_default(mode);
    const { ranges } = getMode(mode);
    if (!ranges.l || !ranges.c) {
      throw new Error("LCH-like space expected");
    }
    return (color) => {
      color = prepare_default(color);
      if (color === void 0) {
        return void 0;
      }
      const candidate = { ...ucs(color) };
      if (candidate.l === void 0) candidate.l = 0;
      if (candidate.c === void 0) candidate.c = 0;
      if (candidate.l >= ranges.l[1]) {
        const res = { ...destMode.white, mode: dest };
        if (color.alpha !== void 0) {
          res.alpha = color.alpha;
        }
        return res;
      }
      if (candidate.l <= ranges.l[0]) {
        const res = { ...destMode.black, mode: dest };
        if (color.alpha !== void 0) {
          res.alpha = color.alpha;
        }
        return res;
      }
      if (inDestinationGamut(candidate)) {
        return destConv(candidate);
      }
      let start = 0;
      let end = candidate.c;
      let epsilon = (ranges.c[1] - ranges.c[0]) / 4e3;
      let clipped = clipToGamut(candidate);
      while (end - start > epsilon) {
        candidate.c = (start + end) * 0.5;
        clipped = clipToGamut(candidate);
        if (inDestinationGamut(candidate) || delta && jnd > 0 && delta(candidate, clipped) <= jnd) {
          start = candidate.c;
        } else {
          end = candidate.c;
        }
      }
      return destConv(inDestinationGamut(candidate) ? candidate : clipped);
    };
  }

  // node_modules/nanostores/clean-stores/index.js
  var clean = Symbol("clean");

  // node_modules/nanostores/atom/index.js
  var listenerQueue = [];
  var lqIndex = 0;
  var QUEUE_ITEMS_PER_LISTENER = 4;
  var epoch = 0;
  var atom = (initialValue) => {
    let listeners = [];
    let $atom = {
      get() {
        if (!$atom.lc) {
          $atom.listen(() => {
          })();
        }
        return $atom.value;
      },
      lc: 0,
      listen(listener) {
        $atom.lc = listeners.push(listener);
        return () => {
          for (let i = lqIndex + QUEUE_ITEMS_PER_LISTENER; i < listenerQueue.length; ) {
            if (listenerQueue[i] === listener) {
              listenerQueue.splice(i, QUEUE_ITEMS_PER_LISTENER);
            } else {
              i += QUEUE_ITEMS_PER_LISTENER;
            }
          }
          let index = listeners.indexOf(listener);
          if (~index) {
            listeners.splice(index, 1);
            if (!--$atom.lc) $atom.off();
          }
        };
      },
      notify(oldValue, changedKey) {
        epoch++;
        let runListenerQueue = !listenerQueue.length;
        for (let listener of listeners) {
          listenerQueue.push(listener, $atom.value, oldValue, changedKey);
        }
        if (runListenerQueue) {
          for (lqIndex = 0; lqIndex < listenerQueue.length; lqIndex += QUEUE_ITEMS_PER_LISTENER) {
            listenerQueue[lqIndex](
              listenerQueue[lqIndex + 1],
              listenerQueue[lqIndex + 2],
              listenerQueue[lqIndex + 3]
            );
          }
          listenerQueue.length = 0;
        }
      },
      /* It will be called on last listener unsubscribing.
         We will redefine it in onMount and onStop. */
      off() {
      },
      set(newValue) {
        let oldValue = $atom.value;
        if (oldValue !== newValue) {
          $atom.value = newValue;
          $atom.notify(oldValue);
        }
      },
      subscribe(listener) {
        let unbind = $atom.listen(listener);
        listener($atom.value);
        return unbind;
      },
      value: initialValue
    };
    if (true) {
      $atom[clean] = () => {
        listeners = [];
        $atom.lc = 0;
        $atom.off();
      };
    }
    return $atom;
  };

  // node_modules/nanostores/map/index.js
  var map = (initial = {}) => {
    let $map = atom(initial);
    $map.setKey = function(key, value) {
      let oldMap = $map.value;
      if (typeof value === "undefined" && key in $map.value) {
        $map.value = { ...$map.value };
        delete $map.value[key];
        $map.notify(oldMap, key);
      } else if ($map.value[key] !== value) {
        $map.value = {
          ...$map.value,
          [key]: value
        };
        $map.notify(oldMap, key);
      }
    };
    return $map;
  };

  // stores/support.ts
  var support = map({
    p3: false,
    rec2020: false
  });
  if (typeof window !== "undefined") {
    if (CSS.supports("color", "color(display-p3 1 1 1)")) {
      let mediaP3 = window.matchMedia("(color-gamut:p3)");
      let media2020 = window.matchMedia("(color-gamut:rec2020)");
      support.set({
        p3: mediaP3.matches,
        rec2020: media2020.matches
      });
      mediaP3.addEventListener("change", () => {
        support.setKey("p3", mediaP3.matches);
      });
      media2020.addEventListener("change", () => {
        support.setKey("rec2020", media2020.matches);
      });
    }
  }

  // lib/colors.ts
  var rec2020 = useMode(definition_default9);
  var oklch = useMode(definition_default7);
  var oklab = useMode(definition_default6);
  var xyz65 = useMode(definition_default10);
  var rgb3 = useMode(definition_default);
  var lch = useMode(definition_default4);
  var hsl2 = useMode(definition_default2);
  var lab = useMode(definition_default3);
  var lrgb = useMode(definition_default5);
  var p3 = useMode(definition_default8);
  var inP3 = inGamut("p3");
  var inRec2020 = inGamut("rec2020");
  function build(l, c2, h, alpha = 1) {
    return { alpha, c: c2, h, l, mode: COLOR_FN };
  }
  var toTarget;
  if (LCH) {
    toTarget = lch;
  } else {
    toTarget = oklch;
  }
  var canvasFormat = formatRgb;
  function formatP3Css(c2) {
    return formatCss(p3(c2));
  }
  support.subscribe((value) => {
    canvasFormat = value.p3 ? formatP3Css : formatRgb;
  });
  function parse2(value) {
    return parse_default(value.trim());
  }
  function parseAnything(value) {
    value = value.replace(/\s*;\s*$/, "");
    if (/^[\w-]+:\s*(#\w+|\w+\([^)]+\))$/.test(value)) {
      value = value.replace(/^[\w-]+:\s*/, "");
    }
    if (/^\s*[\d.]+%?\s+[\d.]+\s+[\d.]+\s*$/.test(value)) {
      value = `${COLOR_FN}(${value})`;
    }
    return parse2(value);
  }
  var toRgb = toGamut("rgb", COLOR_FN);
  function formatRgb2(color) {
    let r2 = Math.round(25500 * color.r) / 100;
    let g = Math.round(25500 * color.g) / 100;
    let b = Math.round(25500 * color.b) / 100;
    if (typeof color.alpha !== "undefined" && color.alpha < 1) {
      return `rgba(${r2}, ${g}, ${b}, ${color.alpha})`;
    } else {
      return `rgb(${r2}, ${g}, ${b})`;
    }
  }
  function formatLch(color) {
    let { alpha, c: c2, h, l } = color;
    let postfix = "";
    if (typeof alpha !== "undefined" && alpha < 1) {
      postfix = ` / ${clean2(100 * alpha)}%`;
    }
    return `${COLOR_FN}(${clean2(l / L_MAX, 4)} ${c2} ${h}${postfix})`;
  }
  function clean2(value, precision = 2) {
    return Math.round(parseFloat((value * 10 ** precision).toFixed(precision))) / 10 ** precision;
  }
  var getProxyColor;
  if (LCH) {
    getProxyColor = xyz65;
  } else {
    getProxyColor = rgb3;
  }

  // lib/canvas.ts
  function getCleanCtx(canvas) {
    let ctx = canvas.getContext("2d", {
      colorSpace: support.get().p3 ? "display-p3" : "srgb"
    });
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return ctx;
  }
  function initCanvasSize(canvas) {
    let pixelRation = Math.ceil(window.devicePixelRatio);
    let canvasSize = canvas.getBoundingClientRect();
    let width = canvasSize.width * pixelRation;
    let height = canvasSize.height * pixelRation;
    canvas.width = width;
    canvas.height = height;
    return [width, height];
  }

  // lib/paint.ts
  function generateGetSeparator() {
    let separators = {};
    return function(prevSpace, nextSpace) {
      let line = separators[`${prevSpace}${nextSpace}`];
      if (line) {
        return line;
      } else {
        return separators[`${prevSpace}${nextSpace}`] = [];
      }
    };
  }
  function paintPixel(pixels, x, y, pixel) {
    let pos = 4 * ((pixels.height - y) * pixels.width + x);
    pixels.data[pos] = pixel[1];
    pixels.data[pos + 1] = pixel[2];
    pixels.data[pos + 2] = pixel[3];
    pixels.data[pos + 3] = 255;
  }

  // main.ts
  window.OKLCH = {
    build,
    canvasFormat,
    parse: parse2,
    parseAnything,
    toRgb,
    formatRgb: formatRgb2,
    formatLch,
    getCleanCtx,
    initCanvasSize,
    paintPixel,
    generateGetSeparator
  };
})();
