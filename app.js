(function () {
  const story = window.LOVE || {
    herName: "My Love",
    sign: "Yours",
    since: "2024-02-14",
    clock: "I have loved you for",
    lines: ["I love you."],
    photos: []
  };

  const canvas = document.getElementById("sky");
  const ctx = canvas.getContext("2d");
  const gate = document.getElementById("gate");
  const openButton = document.getElementById("open");
  const letter = document.getElementById("letter");
  const words = document.getElementById("words");
  const photos = document.getElementById("photos");
  const clock = document.getElementById("clock");
  const clockLead = document.getElementById("clock-lead");
  const clockTime = document.getElementById("clock-time");
  const musicButton = document.getElementById("music");

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const blossomColors = ["#f07a92", "#e45470", "#f6b3c2", "#ff8fa3", "#d94b6a", "#f3c1cb"];

  document.title = story.herName ? "For " + story.herName : "For You";

  let cssW = 1;
  let cssH = 1;
  let opened = false;
  let startedAt = 0;
  let world = null;
  let petals = [];
  let seed = hashString((story.herName || "") + "|" + (story.since || ""));

  const music = createMusic();

  function hashString(value) {
    let h = 2166136261;
    for (let i = 0; i < value.length; i++) {
      h ^= value.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function fitCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cssW = window.innerWidth;
    cssH = window.innerHeight;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function addFlowers(node, rand, count) {
    for (let i = 0; i < count; i++) {
      node.flowers.push({
        x: node.x2 + (rand() - 0.5) * 16,
        y: node.y2 + (rand() - 0.5) * 16,
        size: 5 + rand() * 6,
        color: blossomColors[Math.floor(rand() * blossomColors.length)],
        kind: rand() > 0.82 ? "heart" : "flower",
        spawned: false,
        pulse: 0
      });
    }
  }

  function schedule(node, t0) {
    const dur = 260 + node.len * 5.5;
    node.t0 = t0;
    node.t1 = t0 + dur;
    node.flowers.forEach(function (flower) {
      flower.t0 = node.t1;
    });
    node.children.forEach(function (child) {
      schedule(child, node.t1 - 70);
    });
  }

  function generateTree(w, h, rand) {
    const nodes = [];
    const narrow = w < 800;
    const rootX = narrow ? w * 0.5 : w * 0.68;
    const rootY = narrow ? h * 0.43 : h * 0.97;
    const maxDepth = narrow ? 6 : 8;

    function branch(parent, x, y, angle, length, depth, width) {
      const x2 = x + Math.cos(angle) * length;
      const y2 = y + Math.sin(angle) * length;
      const bend = (rand() - 0.5) * length * 0.38;
      const px = Math.cos(angle + Math.PI / 2);
      const py = Math.sin(angle + Math.PI / 2);
      const node = {
        x: x,
        y: y,
        x2: x2,
        y2: y2,
        cx: (x + x2) / 2 + px * bend,
        cy: (y + y2) / 2 + py * bend,
        width: width,
        depth: depth,
        len: length,
        children: [],
        flowers: []
      };
      nodes.push(node);
      if (parent) parent.children.push(node);

      if (depth === 0 || length < 12) {
        addFlowers(node, rand, 4);
        return;
      }

      const spread = (narrow ? 0.3 : 0.34) + rand() * (narrow ? 0.2 : 0.28);
      branch(node, x2, y2, angle - spread, length * (0.72 + rand() * 0.08), depth - 1, width * 0.68);
      branch(node, x2, y2, angle + spread * (0.82 + rand() * 0.25), length * (0.7 + rand() * 0.08), depth - 1, width * 0.66);
      if (depth >= 4 && rand() > 0.52) {
        branch(node, x2, y2, angle + (rand() - 0.5) * 0.45, length * (0.55 + rand() * 0.1), depth - 2, width * 0.5);
      }
      if (depth <= 2) addFlowers(node, rand, 1);
    }

    const rootLen = Math.min(h * (narrow ? 0.09 : 0.19), 180);
    const root = {
      children: [],
      flowers: [],
      len: 0,
      t0: 0,
      t1: 0
    };
    branch(root, rootX, rootY, -Math.PI / 2, rootLen, maxDepth, Math.max(11, w * 0.013));
    root.children.forEach(function (child) {
      schedule(child, 380);
    });

    let duration = 0;
    nodes.forEach(function (node) {
      if (node.t1 > duration) duration = node.t1;
    });

    return { nodes: nodes, rootX: rootX, rootY: rootY, duration: duration, maxDepth: maxDepth };
  }

  function woodColor(depth, maxDepth) {
    const t = 1 - depth / maxDepth;
    const r = Math.round(86 + t * 96);
    const g = Math.round(48 + t * 58);
    const b = Math.round(28 + t * 28);
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  function curvePoint(b, t) {
    const u = 1 - t;
    return {
      x: u * u * b.x + 2 * u * t * b.cx + t * t * b.x2,
      y: u * u * b.y + 2 * u * t * b.cy + t * t * b.y2
    };
  }

  function drawTree(elapsed) {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const ground = ctx.createRadialGradient(world.rootX, world.rootY, 8, world.rootX, world.rootY, 120);
    ground.addColorStop(0, "rgba(120, 72, 40, 0.13)");
    ground.addColorStop(1, "rgba(120, 72, 40, 0)");
    ctx.fillStyle = ground;
    ctx.beginPath();
    ctx.ellipse(world.rootX, world.rootY, 120, 18, 0, 0, Math.PI * 2);
    ctx.fill();

    world.nodes.forEach(function (branch) {
      if (elapsed < branch.t0) return;
      const raw = Math.min(1, (elapsed - branch.t0) / (branch.t1 - branch.t0));
      const t = 1 - Math.pow(1 - raw, 3);
      const end = curvePoint(branch, t);
      ctx.beginPath();
      ctx.moveTo(branch.x, branch.y);
      ctx.quadraticCurveTo(
        branch.x + (branch.cx - branch.x) * t,
        branch.y + (branch.cy - branch.y) * t,
        end.x,
        end.y
      );
      ctx.strokeStyle = woodColor(branch.depth, world.maxDepth);
      ctx.lineWidth = branch.width;
      ctx.stroke();
    });

    world.nodes.forEach(function (branch) {
      branch.flowers.forEach(function (flower) {
        if (elapsed < flower.t0) return;
        const raw = Math.min(1, (elapsed - flower.t0) / 700);
        if (flower.pulse > 0) flower.pulse *= 0.9;
        const pop = 1 + (flower.pulse || 0) * 0.85;
        const scale = easeOutBack(raw) * pop;
        const jiggle = (flower.pulse || 0) * 4;
        const fx = flower.x + Math.sin(flower.pulse * 14) * jiggle;
        const fy = flower.y + Math.cos(flower.pulse * 11) * jiggle;
        if (flower.kind === "heart") drawHeart(fx, fy, flower.size, scale);
        else drawBlossom(fx, fy, flower.size, scale, flower.color);
        if (!flower.spawned && raw > 0.55) {
          flower.spawned = true;
          spawnPetal(flower.x, flower.y, flower.color);
          spawnPetal(flower.x, flower.y, flower.color);
        }
      });
    });
  }

  function easeOutBack(t) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  function drawBlossom(x, y, size, scale, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.ellipse(Math.cos(angle) * size * 0.52, Math.sin(angle) * size * 0.52, size * 0.4, size * 0.25, angle, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = "#fff6d4";
    ctx.fill();
    ctx.restore();
  }

  function drawHeart(x, y, size, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.beginPath();
    ctx.moveTo(0, size * 0.32);
    ctx.bezierCurveTo(-size, -size * 0.28, -size * 0.32, -size * 0.85, 0, -size * 0.28);
    ctx.bezierCurveTo(size * 0.32, -size * 0.85, size, -size * 0.28, 0, size * 0.32);
    ctx.fillStyle = "#e23d5b";
    ctx.fill();
    ctx.restore();
  }

  function spawnPetal(x, y, color, burst) {
    if (petals.length > 160) petals.shift();
    const angle = Math.random() * Math.PI * 2;
    const speed = burst ? 1.4 + Math.random() * 2.4 : 0;
    petals.push({
      x: x,
      y: y,
      vx: burst ? Math.cos(angle) * speed : (Math.random() - 0.5) * 0.45,
      vy: burst ? Math.sin(angle) * speed - 0.6 : 0.28 + Math.random() * 0.65,
      gravity: burst ? 0.045 : 0,
      rot: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.08,
      size: 3 + Math.random() * 4,
      sway: Math.random() * Math.PI * 2,
      color: color || "#f3a0b2",
      kind: Math.random() > 0.88 ? "heart" : "petal"
    });
  }

  function pokeFlowers(x, y) {
    const elapsed = performance.now() - startedAt;
    let closest = null;
    let best = 46;
    const nearby = [];
    world.nodes.forEach(function (node) {
      node.flowers.forEach(function (flower) {
        if (elapsed < flower.t0 + 200) return;
        const dist = Math.hypot(flower.x - x, flower.y - y);
        const reach = Math.max(26, flower.size * 2.6);
        if (dist < reach && dist < best) {
          best = dist;
          closest = flower;
        }
        if (dist < 78) nearby.push({ flower: flower, dist: dist });
      });
    });
    if (!closest) return;
    closest.pulse = 1;
    for (let i = 0; i < 10; i++) spawnPetal(closest.x, closest.y, closest.color, true);
    nearby.forEach(function (item) {
      if (item.flower === closest) return;
      item.flower.pulse = Math.max(item.flower.pulse || 0, 0.7 * (1 - item.dist / 78));
    });
  }

  function drawPetals() {
    for (let i = petals.length - 1; i >= 0; i--) {
      const petal = petals[i];
      petal.sway += 0.02;
      if (petal.gravity) {
        petal.vy += petal.gravity;
        petal.vx *= 0.99;
      }
      petal.x += petal.vx + Math.sin(petal.sway) * 0.45;
      petal.y += petal.vy;
      petal.rot += petal.spin;
      if (petal.y > cssH + 12) {
        petals.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.translate(petal.x, petal.y);
      ctx.rotate(petal.rot);
      if (petal.kind === "heart") {
        drawHeart(0, 0, petal.size, 1);
      } else {
        ctx.fillStyle = petal.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, petal.size, petal.size * 0.62, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!world) return;
    const elapsed = reduceMotion ? world.duration + 2000 : now - startedAt;
    ctx.clearRect(0, 0, cssW, cssH);
    drawTree(elapsed);
    drawPetals();
  }

  function followWriting() {
    const target = document.documentElement.scrollHeight - window.innerHeight;
    if (target > 0) window.scrollTo(0, target);
  }

  function wait(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  async function typeLetter() {
    const lines = story.lines || [];
    if (reduceMotion) {
      lines.forEach(function (line) {
        const p = document.createElement("p");
        if (!line) p.className = "gap";
        else p.textContent = line;
        words.appendChild(p);
      });
      if (story.sign) {
        const sign = document.createElement("p");
        sign.className = "sign";
        sign.textContent = story.sign;
        words.appendChild(sign);
      }
      if (story.from) {
        const from = document.createElement("p");
        from.className = "sign-name";
        from.textContent = story.from;
        words.appendChild(from);
      }
      return;
    }

    await wait(1500);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const p = document.createElement("p");
      if (!line) {
        p.className = "gap";
        words.appendChild(p);
        await wait(360);
        continue;
      }
      p.className = "typing";
      words.appendChild(p);
      followWriting();
      for (let c = 0; c < line.length; c++) {
        p.textContent += line.charAt(c);
        await wait(42);
      }
      p.classList.remove("typing");
      await wait(480);
    }
    if (story.sign) {
      const sign = document.createElement("p");
      sign.className = "sign typing";
      words.appendChild(sign);
      const signature = story.sign;
      for (let c = 0; c < signature.length; c++) {
        sign.textContent += signature.charAt(c);
        followWriting();
        await wait(70);
      }
      sign.classList.remove("typing");
    }
    if (story.from) {
      const from = document.createElement("p");
      from.className = "sign-name typing";
      words.appendChild(from);
      const name = story.from;
      for (let c = 0; c < name.length; c++) {
        from.textContent += name.charAt(c);
        followWriting();
        await wait(120);
      }
      from.classList.remove("typing");
    }
  }

  function parseSince(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || "").trim());
    if (!match) return new Date(value);
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  function unit(count, word) {
    return count + " " + word + (count === 1 ? "" : "s");
  }

  function showClock() {
    const since = parseSince(story.since);
    if (isNaN(since.getTime())) return;

    function paint() {
      let delta = Date.now() - since.getTime();
      const future = delta < 0;
      delta = Math.abs(delta);
      const total = Math.floor(delta / 1000);
      const days = Math.floor(total / 86400);
      const hours = Math.floor((total % 86400) / 3600);
      const minutes = Math.floor((total % 3600) / 60);
      const seconds = total % 60;
      const loved = story.clock || "I have loved you for";
      const name = story.herName ? story.herName + ", " : "";
      clockLead.textContent = future ? "Counting down to our day" : name + loved;
      clockTime.textContent = [unit(days, "day"), unit(hours, "hour"), unit(minutes, "minute"), unit(seconds, "second")].join("  ");
    }

    paint();
    setInterval(paint, 1000);
    clock.classList.add("show");
    requestAnimationFrame(function () {
      requestAnimationFrame(followWriting);
    });
  }

  function showPhotos() {
    const list = story.photos || [];
    list.forEach(function (src, index) {
      const figure = document.createElement("figure");
      const img = document.createElement("img");
      img.alt = "Photo " + (index + 1);
      img.src = src;
      img.addEventListener("error", function () {
        figure.remove();
      });
      figure.appendChild(img);
      photos.appendChild(figure);
    });
  }

  function begin() {
    if (opened) return;
    opened = true;
    gate.classList.add("away");
    letter.hidden = false;
    fitCanvas();
    world = generateTree(cssW, cssH, mulberry32(seed));
    startedAt = performance.now();
    requestAnimationFrame(frame);
    if (!reduceMotion) {
      setInterval(function () {
        if (!world || petals.length > 70) return;
        const elapsed = performance.now() - startedAt;
        if (elapsed < 1800) return;
        spawnPetal(Math.random() * cssW, -8, blossomColors[Math.floor(Math.random() * blossomColors.length)]);
      }, 520);
    }
    music.start();
    showPhotos();
    typeLetter().then(showClock);
  }

  function createMusic() {
    let audioCtx = null;
    let master = null;
    let timer = null;
    let step = 0;
    let playing = false;
    const notes = [523.25, 587.33, 659.25, 783.99, 659.25, 587.33, 523.25, 440];

    function ensure() {
      if (audioCtx) return;
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = new Ctx();
      master = audioCtx.createGain();
      master.gain.value = 0.0001;
      master.connect(audioCtx.destination);
    }

    function note(freq, when, length) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(0.22, when + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + length);
      osc.connect(gain);
      gain.connect(master);
      osc.start(when);
      osc.stop(when + length + 0.02);
    }

    return {
      start: function () {
        ensure();
        if (!audioCtx || playing) return;
        audioCtx.resume();
        master.gain.setTargetAtTime(0.07, audioCtx.currentTime, 0.08);
        playing = true;
        musicButton.classList.add("playing");
        musicButton.setAttribute("aria-pressed", "true");
        musicButton.setAttribute("aria-label", "Pause music");
        timer = setInterval(function () {
          const now = audioCtx.currentTime;
          note(notes[step % notes.length], now, 1.15);
          if (step % 2 === 0) note(notes[step % notes.length] / 2, now, 1.4);
          step++;
        }, 720);
      },
      stop: function () {
        if (!playing) return;
        clearInterval(timer);
        timer = null;
        playing = false;
        musicButton.classList.remove("playing");
        musicButton.setAttribute("aria-pressed", "false");
        musicButton.setAttribute("aria-label", "Play music");
        if (master && audioCtx) master.gain.setTargetAtTime(0.0001, audioCtx.currentTime, 0.08);
      },
      toggle: function () {
        if (playing) this.stop();
        else this.start();
      }
    };
  }

  openButton.addEventListener("click", begin);
  musicButton.addEventListener("click", function () {
    music.toggle();
  });

  window.addEventListener("click", function (event) {
    if (!opened || !world) return;
    if (event.target.closest && event.target.closest("button, .letter, a")) return;
    pokeFlowers(event.clientX, event.clientY);
  });

  window.addEventListener("mousemove", function (event) {
    if (!opened || !world) return;
    if (event.target.closest && event.target.closest("button, .letter, a")) {
      canvas.style.cursor = "";
      return;
    }
    const elapsed = performance.now() - startedAt;
    let hot = false;
    world.nodes.forEach(function (node) {
      if (hot) return;
      node.flowers.forEach(function (flower) {
        if (hot || elapsed < flower.t0 + 200) return;
        const dist = Math.hypot(flower.x - event.clientX, flower.y - event.clientY);
        if (dist < Math.max(26, flower.size * 2.6)) hot = true;
      });
    });
    canvas.style.cursor = hot ? "pointer" : "";
  });

  window.addEventListener("resize", function () {
    fitCanvas();
    if (!opened) return;
    const elapsed = performance.now() - startedAt;
    world = generateTree(cssW, cssH, mulberry32(seed));
    world.nodes.forEach(function (node) {
      node.flowers.forEach(function (flower) {
        if (elapsed > flower.t0 + 400) flower.spawned = true;
      });
    });
  });

  fitCanvas();
})();
