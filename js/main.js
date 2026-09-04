/* ==========================================================================
   QUEZADA — motor de interação
   Sem dependências externas. Um único rAF conduz tudo.
   ========================================================================== */
(function () {
  'use strict';

  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var COARSE  = window.matchMedia('(pointer: coarse)').matches;
  var SMALL   = function () { return window.innerWidth <= 860; };

  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var lerp  = function (a, b, t) { return a + (b - a) * t; };
  var $     = function (s, c) { return (c || document).querySelector(s); };
  var $$    = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  var nums = function (str, fallback) {
    if (!str) return fallback;
    var p = str.split(',').map(parseFloat);
    return p.length === 2 && !isNaN(p[0]) && !isNaN(p[1]) ? p : fallback;
  };

  /* ------------------------------------------------------------------------
     1. Frame — um laço rAF com trabalho agendado
     ------------------------------------------------------------------------ */
  var Frame = (function () {
    var jobs = [], queued = false, alive = false, want = false;

    function flush() {
      queued = false;
      want = false;
      for (var i = 0; i < jobs.length; i++) jobs[i]();
      if (want) {
        if (!alive) { alive = true; requestAnimationFrame(heartbeat); }
      } else {
        alive = false;
      }
    }
    function heartbeat() {
      if (!alive) return;
      flush();
      if (alive) requestAnimationFrame(heartbeat);
    }
    return {
      add: function (fn) { jobs.push(fn); },
      now: flush,
      run: function () {
        if (queued || alive) return;
        queued = true;
        requestAnimationFrame(flush);
      },
      keepAlive: function () { want = true; }
    };
  })();

  /* ------------------------------------------------------------------------
     2. Smooth scroll estilo Lenis — anima a rolagem REAL da janela, nunca um
     transform. É isso que mantém `position: sticky` funcionando nos palcos.
     ------------------------------------------------------------------------ */
  var Scroll = (function () {
    var enabled = !REDUCED && !COARSE;
    var target = window.scrollY, current = target, running = false;
    var EASE = 0.105;

    function maxScroll() {
      return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    }
    function normalize(e) {
      var d = e.deltaY;
      if (e.deltaMode === 1) d *= 16;
      else if (e.deltaMode === 2) d *= window.innerHeight;
      return d;
    }
    function onWheel(e) {
      if (!enabled || document.body.classList.contains('is-locked')) return;
      if (e.ctrlKey) return;
      e.preventDefault();
      target = clamp(target + normalize(e), 0, maxScroll());
      start();
    }
    function tick() {
      current = lerp(current, target, EASE);
      if (Math.abs(target - current) < 0.35) { current = target; running = false; }
      window.scrollTo(0, current);
      Frame.now();
      if (running) requestAnimationFrame(tick);
    }
    function start() {
      if (running) return;
      running = true;
      requestAnimationFrame(tick);
    }

    window.addEventListener('scroll', function () {
      if (Math.abs(window.scrollY - current) > 3) current = target = window.scrollY;
      if (!running) Frame.now();
    }, { passive: true });

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('resize', function () {
      target = current = window.scrollY;
      Frame.now();
    }, { passive: true });

    return {
      to: function (y, instant) {
        y = clamp(y, 0, maxScroll());
        if (!enabled || instant) {
          window.scrollTo(0, y);
          current = target = y;
          Frame.now();
          return;
        }
        target = y;
        start();
      },
      sync: function () { current = target = window.scrollY; }
    };
  })();

  /* ------------------------------------------------------------------------
     2b. Camadas por faixa de tela
     A cena de abertura existe em dois enquadramentos, 16:9 e 9:16. Marcar as
     do outro com `display:none` NÃO resolve: um `<video preload="auto">` ou
     um `<img src>` escondido baixa do mesmo jeito, e seriam ~5MB de vídeo
     inútil no celular. Então elas SAEM do DOM — e, para que nem o pré-scanner
     do navegador as pegue antes disso, nenhuma nasce com `src`: o endereço
     mora em `data-src` (ou `data-loop-webm`/`-mp4`, nos que tocam em laço) e
     só vira `src` depois desta escolha.

     A escolha é feita uma vez, no boot, pelo mesmo limite do CSS (860px).
     Girar o aparelho depois não troca as camadas — é o mesmo compromisso do
     `pickSrc`, e trocar no meio da rolagem custaria um download novo.
     ------------------------------------------------------------------------ */
  /* ------------------------------------------------------------------------
     Portao da midia pesada
     A cena de abertura pesa 3,4MB de video no celular e 11MB no computador. Nada
     disso e preciso para a PRIMEIRA TELA: o que se ve nela e o poster do video
     (12-30KB) e o texto do hero. Mas tudo era pedido durante o carregamento --
     o video em laco por `preload="auto"`, e a transicao porque a margem de
     pre-carga do scrub (`range[0] - 0.14`) e MAIOR que o proprio gatilho
     (0.09), o que tornava a condicao sempre verdadeira no topo da pagina.
     Agora quem pede midia pesada passa por aqui. O portao abre no PRIMEIRO
     destes: a pessoa rolar (a a partir dai ela precisa mesmo do video), a
     janela terminar de carregar, ou 2,5s de relogio. Quem rola na hora nao
     espera nada; quem fica parado lendo o hero recebe o video depois, por cima
     do poster, sem perceber a troca.
     ------------------------------------------------------------------------ */
  var Midia = (function () {
    var aberto = false, fila = [];
    function abrir() {
      if (aberto) return;
      aberto = true;
      window.removeEventListener('scroll', abrir);
      window.removeEventListener('wheel', abrir);
      window.removeEventListener('touchstart', abrir);
      document.documentElement.classList.add('midia-on');
      var f = fila; fila = [];
      for (var i = 0; i < f.length; i++) f[i]();
    }
    ['scroll', 'wheel', 'touchstart'].forEach(function (e) {
      window.addEventListener(e, abrir, { passive: true, once: true });
    });
    window.addEventListener('load', function () {
      if (window.requestIdleCallback) requestIdleCallback(abrir, { timeout: 1200 });
      else setTimeout(abrir, 200);
    });
    setTimeout(abrir, 2500);
    return {
      aberto: function () { return aberto; },
      quando: function (fn) { if (aberto) fn(); else fila.push(fn); }
    };
  })();

  function initBreakpoint() {
    var quero = SMALL() ? 'sm' : 'lg';

    // Quadro de tempos do celular. No 9:16 a mesa se bagunçando merece uma
    // fatia bem maior do roteiro (a cena inteira também é mais alta lá), então
    // tudo antes dela acontece mais cedo. Em vez de duplicar a cena no HTML,
    // quem tem `-sm` troca o próprio valor ANTES de qualquer palco ser montado.
    if (SMALL()) {
      $$('[data-beat-sm], [data-range-sm], [data-live-sm]').forEach(function (el) {
        ['beat', 'range', 'live'].forEach(function (nome) {
          var v = el.getAttribute('data-' + nome + '-sm');
          if (v) el.setAttribute('data-' + nome, v);
        });
      });
    }

    $$('[data-only]').forEach(function (el) {
      if (el.getAttribute('data-only') !== quero) { el.parentNode.removeChild(el); return; }

      if (el.tagName === 'IMG') {
        // O poster (sem `data-live`, `opacity: 1`) e a unica imagem que a
        // primeira tela mostra: essa vem na hora. As outras camadas so
        // aparecem a partir de 23% da rolagem, e somavam 143KB dentro da
        // janela do LCP -- essas passam pelo portao.
        var faixa = nums(el.getAttribute('data-live'), null);
        var cedo = !faixa || faixa[0] <= 0;
        if (cedo) el.src = el.getAttribute('data-src');
        else Midia.quando(function () { el.src = el.getAttribute('data-src'); });
        return;
      }
      // vídeo em laço: as <source> são montadas agora, nunca no HTML
      var webm = el.getAttribute('data-loop-webm');
      var mp4  = el.getAttribute('data-loop-mp4');
      if (!webm && !mp4) return;              // scrub/autoplay: o palco cuida
      // O video em laco NAO passa pelo portao: ele e a cena de abertura, a
      // primeira coisa que a pagina mostra. Preso ali, o visitante ficava
      // varios segundos olhando uma imagem parada -- caro demais por alguns
      // pontos de PageSpeed. Quem espera o portao sao os `data-scrub`
      // pesados (1,7MB e 2,5MB), que so entram em cena depois de rolar.
      // As <source> continuam nascendo aqui, e nao no HTML, para o
      // pre-scanner nao baixar tambem as do breakpoint errado.
      [[webm, 'video/webm'], [mp4, 'video/mp4']].forEach(function (par) {
        if (!par[0]) return;
        var s = document.createElement('source');
        s.src = par[0];
        s.type = par[1];
        el.appendChild(s);
      });
      el.load();
      var pr = el.play();
      if (pr && pr.catch) pr.catch(function () {});
    });
  }

  /* ------------------------------------------------------------------------
     3. Progresso de um palco preso (0 → 1 ao atravessar a seção)
     ------------------------------------------------------------------------ */
  // Curva quebrada: dado o progresso, devolve o valor interpolado entre os
  // pontos de apoio. É como a lavagem verde do celular sabe que altura ter em
  // cada trecho da cena sem precisar de um marcador para cada degrau.
  function rampa(p, pontos) {
    if (p <= pontos[0][0]) return pontos[0][1];
    for (var i = 1; i < pontos.length; i++) {
      if (p > pontos[i][0]) continue;
      var a = pontos[i - 1], b = pontos[i];
      return a[1] + (b[1] - a[1]) * ((p - a[0]) / (b[0] - a[0]));
    }
    return pontos[pontos.length - 1][1];
  }

  function stageProgress(el) {
    var rect = el.getBoundingClientRect();
    var span = rect.height - window.innerHeight;
    if (span <= 0) return rect.top <= 0 ? 1 : 0;
    return clamp(-rect.top / span, 0, 1);
  }

  /* ------------------------------------------------------------------------
     4. Scrub de vídeo por rolagem
     Estratégia para não quebrar frames:
       · os MP4 são all-intra (todo frame é keyframe) → seek exato e barato
       · o tempo alvo é suavizado por lerp, nunca aplicado cru do evento
       · só emitimos um novo seek quando o anterior terminou (`seeking`)
       · nada de play(): a rolagem é o único relógio do vídeo
     Cada vídeo pode ocupar só um trecho da cena, via data-range="ini,fim".
     ------------------------------------------------------------------------ */
  // Telas pequenas (e economia de dados) recebem o corte leve do mesmo vídeo.
  // O critério é a largura CSS, não a física: mesmo num celular com DPR 3,
  // 1280px cobrem a tela de sobra e custam metade do arquivo grande.
  function pickSrc(video) {
    var sm = video.getAttribute('data-src-sm');
    if (!sm) return video.getAttribute('data-src');
    var conn = navigator.connection;
    var thrifty = conn && (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || ''));
    return (window.innerWidth <= 900 || thrifty) ? sm : video.getAttribute('data-src');
  }

  function makeScrub(video) {
    var range = nums(video.getAttribute('data-range'), [0, 1]);
    var live  = nums(video.getAttribute('data-live'), null);
    var loaded = false, ready = false, duration = 0;
    var smooth = 0, lastSeek = -1;
    var frameDur = 1 / 24;

    function load() {
      if (loaded) return;
      loaded = true;
      video.preload = 'auto';
      video.src = pickSrc(video);
      video.load();
      video.addEventListener('loadedmetadata', function () {
        duration = video.duration || 0;
        try { video.currentTime = 0.001; } catch (e) {}
      });
      video.addEventListener('loadeddata', function () {
        ready = true;
        video.classList.add('is-ready');
      });
    }

    return {
      el: video,
      // Cada vídeo só baixa quando a sua vez está chegando — sem isso a cena
      // de abertura puxaria os dois de uma vez logo no primeiro frame.
      // `offsetParent` nulo = a folha de estilo tirou este vídeo de cena (é o
      // caso do palco dos livros em tela curta): não vale baixar megabytes de
      // algo que ninguém vai ver.
      maybeLoad: function (p) {
        if (loaded || video.offsetParent === null) return;
        // O portao primeiro: no topo da pagina `range[0] - 0.14` chega a ser
        // negativo, e era isso que fazia a transicao de 1,7MB (celular) e de
        // 6,1MB (computador) baixar sempre, no scroll 0.
        if (!Midia.aberto()) return;
        if (p >= range[0] - 0.14) load();
      },
      // p = progresso da cena inteira
      apply: function (p, snap) {
        if (live) video.classList.toggle('is-live', p >= live[0] && p <= live[1]);

        // progresso local dentro da faixa deste vídeo
        var local = clamp((p - range[0]) / (range[1] - range[0]), 0, 1);
        if (!ready || !duration) return false;

        // 0.11 e não 0.16: quanto menor o passo, mais o quadro exibido "persegue"
        // a rolagem em vez de saltar com ela — é o que tira a dureza da passagem
        // para a sala. Abaixo disso começa a atrasar de forma perceptível.
        var wanted = local * (duration - frameDur);
        smooth = snap ? wanted : lerp(smooth, wanted, 0.11);

        if (!video.seeking && Math.abs(smooth - lastSeek) > frameDur * 0.5) {
          lastSeek = smooth;
          try { video.currentTime = smooth; } catch (e) {}
        }
        return Math.abs(wanted - smooth) > frameDur * 0.5;
      }
    };
  }

  /* ------------------------------------------------------------------------
     4b. Vídeo que toca sozinho
     A rolagem NÃO conduz este vídeo quadro a quadro: assim que o progresso
     passa do gatilho, ele dispara em velocidade normal. A rolagem só serve
     para desfazer — subindo, o vídeo volta no sentido inverso até o começo.

     `data-autoplay-rate` é a velocidade de base, e `data-autoplay-until` marca
     onde a cena espera que ele já tenha terminado: se a rolagem correr mais que
     o vídeo, ele acelera (até 3×) para reencontrá-la. Nunca desacelera abaixo
     da base — a leitura continua sendo de vídeo tocando, não de scrub.

     É o modo da mesa que se bagunça: a rolagem passa de 0.66 e o vídeo corre
     no tempo dele — fluido, não quadro a quadro —, logo depois de o remate
     entrar em 0.60. Subir de volta desfaz.

     `data-autoplay-after` + `data-autoplay-delay` trocam o gatilho de ROLAGEM
     por RELÓGIO: o vídeo espera um bloco acender e conta o tempo dali. Nenhuma
     cena usa esse modo hoje; ele fica porque é a única forma de disparar algo
     numa página parada.
     ------------------------------------------------------------------------ */
  function makeAutoplay(video) {
    var at    = parseFloat(video.getAttribute('data-autoplay-at'));
    var until = parseFloat(video.getAttribute('data-autoplay-until'));
    var base  = parseFloat(video.getAttribute('data-autoplay-rate')) || 1;
    var afterSel   = video.getAttribute('data-autoplay-after');
    var afterDelay = parseFloat(video.getAttribute('data-autoplay-delay')) || 0;
    var afterEl    = afterSel ? $(afterSel) : null;
    var hasUntil = !isNaN(until) && until > at;
    // Quanto de rolagem desfaz o vídeo inteiro. Em 0.055 a mesa se arrumava
    // num piscar — muito mais rápido do que levou para se bagunçar. Aqui a
    // volta pede quase três vezes mais rolagem, e o quadro exibido ainda é
    // suavizado, então ela desanda em vez de saltar.
    var BACK = 0.155;
    var loaded = false, ready = false, started = false, ended = false, duration = 0;
    var volta = -1, ultimaVolta = -1;
    var frameDur = 1 / 24;

    // { abrir: já é hora de tocar, contando: o relógio está correndo }
    // O despertador é o que torna isto confiável: o laço de rAF dorme assim
    // que a rolagem para, e sem ele a hora marcada nunca chegaria numa página
    // parada — que é exatamente a situação em que este gatilho existe.
    var despertador = null;
    function gatilho(p) {
      if (!afterEl) return { abrir: p >= at, contando: false };
      if (!afterEl.classList.contains('is-on')) {
        if (despertador) { clearTimeout(despertador); despertador = null; }
        return { abrir: false, contando: false };
      }
      var t0 = parseFloat(afterEl.getAttribute('data-on-at'));
      if (isNaN(t0)) return { abrir: false, contando: false };
      var falta = afterDelay - (performance.now() - t0);
      if (falta > 0 && !despertador) {
        despertador = setTimeout(function () {
          despertador = null;
          Frame.now();
        }, falta + 20);
      }
      return { abrir: falta <= 0, contando: falta > 0 };
    }

    function load() {
      if (loaded) return;
      loaded = true;
      video.preload = 'auto';
      video.src = pickSrc(video);
      video.load();
      video.addEventListener('loadedmetadata', function () { duration = video.duration || 0; });
      video.addEventListener('loadeddata', function () {
        ready = true;
        video.classList.add('is-ready');
      });
      // ao acabar, o palco volta para a camada parada logo abaixo — que é o
      // próprio último quadro deste vídeo, então a troca não aparece
      video.addEventListener('ended', function () {
        ended = true;
        video.classList.remove('is-playing');
      });
    }

    return {
      el: video,
      maybeLoad: function (p) {
        if (loaded) return;
        if (!Midia.aberto()) return;
        if (afterEl) { if (p >= 0.3) load(); }
        else if (p >= at - 0.3) load();
      },
      apply: function (p) {
        var g = gatilho(p);

        // A visibilidade segue o estado, não uma faixa fixa: enquanto o vídeo
        // estiver "aberto" ele fica por cima da foto — inclusive durante o
        // rebobinar, senão a volta acontecia escondida atrás da imagem.
        video.classList.toggle('is-live', started || g.abrir);
        if (!ready || !duration) return g.contando;

        // No modo relógio a saída do bloco desfaz tudo de uma vez: não há
        // rolagem "de dentro" do vídeo para desandar quadro a quadro.
        if (afterEl) {
          if (g.abrir) {
            if (!started) {
              started = true;
              ended = false;
              video.classList.add('is-playing');
              try { video.currentTime = 0; } catch (e) {}
              video.playbackRate = base;
              var prA = video.play();
              if (prA && prA.catch) prA.catch(function () {});
            }
            return !ended;
          }
          if (started) {
            started = false;
            ended = false;
            if (!video.paused) video.pause();
            try { video.currentTime = 0; } catch (e) {}
            video.classList.remove('is-playing');
          }
          return g.contando;
        }

        if (g.abrir) {
          if (!started) {
            started = true;
            ended = false;
            volta = -1;
            video.classList.add('is-playing');
            try { video.currentTime = 0; } catch (e) {}
            video.playbackRate = base;
            var pr = video.play();
            if (pr && pr.catch) pr.catch(function () {});
          }
          if (hasUntil && !ended) {
            var esperado = clamp((p - at) / (until - at), 0, 1) * duration;
            var atraso = esperado - video.currentTime;
            video.playbackRate = atraso > 0.3 ? clamp(base + (atraso - 0.3), base, 3) : base;
          }
          return !ended;
        }

        // Subiu de volta: desfaz o que já tocou, proporcional à rolagem. O
        // quadro alvo passa pelo mesmo lerp do scrub — sem ele a volta era um
        // salto seco a cada evento de rolagem.
        if (started) {
          if (!video.paused) video.pause();
          ended = false;
          video.classList.add('is-playing');
          var back = clamp((at - p) / BACK, 0, 1);
          var alvo = (duration - frameDur) * (1 - back);
          volta = volta < 0 ? (video.currentTime || alvo) : lerp(volta, alvo, 0.12);
          if (!video.seeking && Math.abs(volta - ultimaVolta) > frameDur * 0.5) {
            ultimaVolta = volta;
            try { video.currentTime = volta; } catch (e) {}
          }
          if (back >= 1 && volta <= frameDur) {
            started = false;
            volta = -1;
            ultimaVolta = -1;
            video.classList.remove('is-playing');
            return false;
          }
          // só mantém o laço vivo enquanto o quadro ainda está se aproximando:
          // parado no meio da volta, a página pode dormir como qualquer outra
          return Math.abs(volta - alvo) > frameDur * 0.5;
        }
        return false;
      }
    };
  }

  /* A LAVAGEM VERDE DO CELULAR, TRECHO A TRECHO ------------------------------
     Altura em fração do palco, medida do rodapé para cima. Ela era fixa e alta
     demais: cobria até 12% do topo da tela e apagava a mesa, que é justamente o
     assunto da cena. Agora acompanha o bloco de texto que está no ar — sobe
     quando entram os cards, e RECUA quando a bagunça vai começar, descobrindo a
     mesa inteira. Como quem conduz é a rolagem, subir de volta desfaz sozinho.
     Os topos medidos dos blocos (celular): cena 02 a ~47% do rodapé, cena 03
     com os cards a ~66%, o remate sozinho a ~14%. */
  var CHAO_LAVAGEM = [
    [0.19, 0.74],   // cena 02: chão só até onde o texto pede
    [0.44, 0.74],
    [0.53, 1.00],   // cena 03: sobe para caber título, texto e os quatro cards
    [0.62, 1.00],
    [0.73, 0.48],   // recuo: a mesa aparece e a animação pode acontecer
    [1.00, 0.48]
  ];

  function initStages() {
    var stages = $$('[data-scene], [data-stage]');
    if (!stages.length) return;
    var PEQ = SMALL();

    stages.forEach(function (stage) {
      // vídeos conduzidos: por rolagem (scrub) ou por gatilho — de progresso
      // (`data-autoplay-at`) ou de relógio (`data-autoplay-after`)
      var auto = '[data-autoplay-at], [data-autoplay-after]';
      var ehAuto = function (el) {
        return el.hasAttribute('data-autoplay-at') || el.hasAttribute('data-autoplay-after');
      };
      var media = $$('[data-scrub], ' + auto, stage).map(function (el) {
        return ehAuto(el) ? makeAutoplay(el) : makeScrub(el);
      });
      // camadas simples que só acendem e apagam: o loop do hero e a foto
      // congelada da sala organizada
      var statics = $$('[data-live]', stage).filter(function (el) {
        return !el.hasAttribute('data-scrub') && !ehAuto(el);
      });
      var staticRanges = statics.map(function (el) { return nums(el.getAttribute('data-live'), [0, 1]); });

      var beats = $$('[data-beat]', stage);
      var bar   = $('.scene__progress i', stage);
      var wash  = PEQ ? $('.scene__wash', stage) : null;

      Frame.add(function () {
        var rect = stage.getBoundingClientRect();
        var near = rect.top < window.innerHeight * 2 && rect.bottom > -window.innerHeight;
        var p = stageProgress(stage);
        if (near) media.forEach(function (m) { m.maybeLoad(p); });
        if (rect.bottom < 0 || rect.top > window.innerHeight) return;

        for (var i = 0; i < beats.length; i++) {
          var b = beats[i];
          var r = nums(b.getAttribute('data-beat'), [0, 1]);
          // Limite de cima EXCLUSIVO: com faixas vizinhas (…,x] e [x,…) o
          // ponto de encontro acendia os dois blocos ao mesmo tempo — era o
          // que se via ao voltar a rolagem. Só o último marcador, que fecha em
          // 1, inclui a ponta.
          var on = p >= r[0] && (r[1] >= 1 ? p <= 1 : p < r[1]);
          var era = b.classList.contains('is-on');
          b.classList.toggle('is-on', on);
          b.classList.toggle('is-out', p >= r[1] && r[1] < 1);
          // carimbo do instante em que acendeu: é a partir dele que as etapas
          // seguintes do bloco são contadas em tempo, e não em rolagem
          if (on && !era) b.setAttribute('data-on-at', String(performance.now()));
          else if (!on && era) b.removeAttribute('data-on-at');
        }

        for (var j = 0; j < statics.length; j++) {
          var vivo = p >= staticRanges[j][0] && p <= staticRanges[j][1];
          var antes = statics[j].classList.contains('is-live');
          statics[j].classList.toggle('is-live', vivo);
          // Vídeo em laço PAUSA ao sair de cena. Ele é invisível (opacity 0),
          // mas continuava decodificando quadro a quadro atrás da sala — e num
          // celular isso disputa decodificador com o vídeo que a rolagem está
          // conduzindo. Era uma das causas do travamento. Só no cruzamento do
          // estado: chamar play/pause a cada quadro custaria mais que resolve.
          if (vivo !== antes && statics[j].tagName === 'VIDEO') {
            if (vivo) { var pv = statics[j].play(); if (pv && pv.catch) pv.catch(function () {}); }
            else if (!statics[j].paused) statics[j].pause();
          }
        }

        // A lavagem do celular não é acesa por marcador: ela é DESENHADA pela
        // rolagem. Sem transição de tempo não existe o "travar" de quando ela
        // aparecia — se um quadro cair, ela simplesmente acompanha a rolagem.
        // A opacidade sobe junto com a sala terminando de se formar; a altura
        // segue a curva acima. As duas propriedades são de compositor.
        if (wash) {
          wash.style.setProperty('--wash-o', clamp((p - 0.18) / 0.07, 0, 1).toFixed(3));
          wash.style.setProperty('--wash-h', rampa(p, CHAO_LAVAGEM).toFixed(3));
          // título, texto e cards saem de cena junto com o recuo: é o espaço
          // deles que a mesa ocupa. Só o remate fica, no rodapé, onde o verde
          // continua cheio.
          stage.classList.toggle('is-recuando', p >= 0.645);
        }

        if (bar) bar.style.setProperty('--p', p.toFixed(4));

        var busy = false;
        for (var k = 0; k < media.length; k++) {
          if (media[k].apply(p, REDUCED)) busy = true;
        }
        if (busy) Frame.keepAlive();
      });

      // iOS: destrava o decoder com um gesto do usuário
      if (COARSE && media.length) {
        var unlock = function () {
          media.forEach(function (m) {
            var pr = m.el.play();
            if (pr && pr.then) pr.then(function () { m.el.pause(); }).catch(function () {});
          });
          window.removeEventListener('touchstart', unlock);
        };
        window.addEventListener('touchstart', unlock, { once: true, passive: true });
      }
    });
  }

  /* ------------------------------------------------------------------------
     4b. Trava das seções empilhadas
     Uma seção `sticky top:0` mais alta que a janela nunca mostra o próprio
     rodapé — o trecho excedente fica preso fora da tela. Quando isso
     acontecer, ela volta ao fluxo normal.
     ------------------------------------------------------------------------ */
  function initStack() {
    var items = $$('.stack');
    if (!items.length) return;

    function check() {
      items.forEach(function (el) {
        el.classList.remove('is-tall');
        if (el.scrollHeight > window.innerHeight + 2) el.classList.add('is-tall');
      });
    }
    check();
    window.addEventListener('resize', check, { passive: true });
    window.addEventListener('load', check);
  }

  /* ------------------------------------------------------------------------
     5. Reveals
     ------------------------------------------------------------------------ */
  function initReveal() {
    var items = $$('[data-reveal], .line-mask');
    if (!('IntersectionObserver' in window) || REDUCED) {
      items.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }
    // O que já nasce dentro da primeira tela entra na carga
    var rest = items.filter(function (el) {
      if (el.getBoundingClientRect().top >= window.innerHeight) return true;
      el.classList.add('is-in');
      return false;
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add('is-in');
        io.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.01 });
    rest.forEach(function (el) { io.observe(el); });
  }

  /* ------------------------------------------------------------------------
     6. Estatísticas — contagem + trilho de carregamento
     ------------------------------------------------------------------------ */
  function initStats() {
    var stats = $$('[data-stat]');
    if (!stats.length) return;

    function count(el) {
      var node = $('[data-count]', el);
      if (!node) return;
      var to = parseFloat(node.getAttribute('data-count'));
      var delay = parseFloat(getComputedStyle(el).getPropertyValue('--d')) || 0;
      if (REDUCED) { node.textContent = to; return; }

      setTimeout(function () {
        var t0 = performance.now(), dur = 1500;
        (function step(now) {
          var q = clamp((now - t0) / dur, 0, 1);
          var e = q === 1 ? 1 : 1 - Math.pow(2, -10 * q); // easeOutExpo
          node.textContent = Math.round(to * e);
          if (q < 1) requestAnimationFrame(step);
        })(t0);
      }, delay);
    }

    if (!('IntersectionObserver' in window)) {
      stats.forEach(function (el) { el.classList.add('is-on'); count(el); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add('is-on');
        count(en.target);
        io.unobserve(en.target);
      });
    }, { threshold: 0.35 });
    stats.forEach(function (el) { io.observe(el); });
  }

  /* ------------------------------------------------------------------------
     6b. Inclinação 3D dos cards — o efeito do site anterior
     O JS não escreve `transform`: escreve --rx / --ry / --tz e deixa o CSS
     compor. É o que permite ao mesmo card ter, ao mesmo tempo, a animação de
     entrada (subida, deslize lateral, escala de foco) e a inclinação.

     `zona` é a fração central do card que responde ao ponteiro: fora dela o
     card volta ao normal sozinho, sem esperar o `mouseleave` — que, em card
     que encolhe ou some, às vezes nem chega a disparar.
     ------------------------------------------------------------------------ */
  function tiltReset(card) {
    card.classList.remove('is-tilting');
    card.style.removeProperty('--rx');
    card.style.removeProperty('--ry');
    card.style.removeProperty('--tz');
    card.style.removeProperty('--mx');
    card.style.removeProperty('--my');
  }

  // devolve a posição do ponteiro dentro do card em -1..1 (0 = centro)
  function pointerIn(card, e) {
    var r = card.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return {
      x: (e.clientX - r.left) / r.width * 2 - 1,
      y: (e.clientY - r.top) / r.height * 2 - 1,
      px: (e.clientX - r.left) / r.width * 100,
      py: (e.clientY - r.top) / r.height * 100
    };
  }

  function tiltApply(card, n, max, lift) {
    card.classList.add('is-tilting');
    card.style.setProperty('--ry', (n.x * max).toFixed(2) + 'deg');
    card.style.setProperty('--rx', (-n.y * max).toFixed(2) + 'deg');
    card.style.setProperty('--tz', (lift || 8) + 'px');
    // a gota de luz do vidro segue o ponteiro
    card.style.setProperty('--mx', n.px.toFixed(1) + '%');
    card.style.setProperty('--my', n.py.toFixed(1) + '%');
  }

  function initTilt(selector, max, zona) {
    if (COARSE || REDUCED) return;
    zona = zona || 0.94;
    $$(selector).forEach(function (card) {
      card.addEventListener('mousemove', function (e) {
        // no empilhamento estreito os cards já ocupam a tela toda: inclinar
        // ali só atrapalha a leitura
        if (SMALL()) { tiltReset(card); return; }
        var n = pointerIn(card, e);
        if (!n) return;
        if (Math.abs(n.x) > zona || Math.abs(n.y) > zona) { tiltReset(card); return; }
        tiltApply(card, n, max);
      }, { passive: true });
      card.addEventListener('mouseleave', function () { tiltReset(card); });
    });
  }

  /* ------------------------------------------------------------------------
     7. Seção 05 — o fundo da seção troca no foco e o card do lado some
     O gatilho é o MIOLO do card, não o card inteiro: o card em foco cresce
     (escala 1.03) e o outro some, então usar `mouseenter`/`mouseleave` fazia o
     estado trocar sozinho quando a borda passava por baixo do ponteiro — era
     o efeito "bugando". Aqui um único `mousemove` na seção decide quem está
     em foco, e basta sair da zona central para tudo voltar ao normal.
     ------------------------------------------------------------------------ */
  /* Os fundos da secao "Onde entramos" e a folha do lockup
     Os tres fundos moravam em `style="background-image:url(...)"` no HTML, e o
     navegador pede um background inline assim que o elemento entra na arvore de
     renderizacao -- no carregamento, mesmo a cinco telas de distancia. Eram
     121KB dentro da janela do LCP. Agora o endereco mora em `data-bg-src` e so
     vira estilo depois do portao. */
  function initAdiados() {
    Midia.quando(function () {
      $$('[data-bg-src]').forEach(function (el) {
        el.style.backgroundImage = "url('" + el.getAttribute('data-bg-src') + "')";
      });
    });
  }

  function initFronts() {
    var sec = $('[data-fronts]');
    if (!sec || COARSE) return;

    var bgs   = $$('.fronts__bg', sec);
    var cards = $$('[data-front]', sec);
    var ZONA  = 0.62;     // fração central que ativa
    var ativo = null;

    function show(key) {
      bgs.forEach(function (b) { b.classList.toggle('is-on', b.getAttribute('data-bg') === key); });
    }
    function set(card) {
      if (card === ativo) return;
      if (ativo) tiltReset(ativo);
      ativo = card;
      if (card) { sec.setAttribute('data-hover', card.getAttribute('data-front')); show(card.getAttribute('data-front')); }
      else { sec.removeAttribute('data-hover'); show('base'); }
    }

    sec.addEventListener('mousemove', function (e) {
      var achou = null, dentro = null;
      for (var i = 0; i < cards.length; i++) {
        var n = pointerIn(cards[i], e);
        if (n && Math.abs(n.x) <= ZONA && Math.abs(n.y) <= ZONA) { achou = cards[i]; dentro = n; break; }
      }
      set(achou);
      if (achou && !REDUCED) tiltApply(achou, dentro, 8, 12);
    }, { passive: true });

    sec.addEventListener('mouseleave', function () { set(null); });

    // teclado: o foco não tem "centro", então vale o card inteiro
    cards.forEach(function (card) {
      card.addEventListener('focusin', function () { set(card); });
    });
    sec.addEventListener('focusout', function (e) {
      if (!sec.contains(e.relatedTarget)) set(null);
    });
  }

  /* ------------------------------------------------------------------------
     8. Seção 06 — Angelson / Fabiana em tela cheia
     A foto inteira aparece primeiro; só depois a sequência começa.
     Hover manda; sem hover, a rolagem conduz.
     ------------------------------------------------------------------------ */
  function initDuo() {
    var duo = $('[data-duo]');
    if (!duo) return;

    // Só a rolagem conduz a sequência — sem hover, para o destaque não pular
    // quando o ponteiro passa por cima.
    var scrolled = null;

    function paint() {
      if (scrolled) duo.setAttribute('data-active', scrolled);
      else duo.removeAttribute('data-active');
    }

    Frame.add(function () {
      if (SMALL() || REDUCED) {
        if (scrolled !== null) { scrolled = null; paint(); }
        return;
      }
      var rect = duo.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) return;

      var p = stageProgress(duo);
      // 0 – 0.28 → a foto inteira, sem interferência
      var next = null;
      if (p > 0.28 && p <= 0.58) next = 'angelson';
      else if (p > 0.58 && p <= 0.88) next = 'fabiana';

      if (next !== scrolled) { scrolled = next; paint(); }
    });
  }

  /* ------------------------------------------------------------------------
     9. FAQ
     ------------------------------------------------------------------------ */
  function initFaq() {
    $$('.faq__q').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var item = btn.closest('.faq__item');
        var open = item.classList.contains('is-open');
        $$('.faq__item.is-open').forEach(function (other) {
          if (other === item) return;
          other.classList.remove('is-open');
          $('.faq__q', other).setAttribute('aria-expanded', 'false');
        });
        item.classList.toggle('is-open', !open);
        btn.setAttribute('aria-expanded', String(!open));
      });
    });
  }

  /* ------------------------------------------------------------------------
     10. Cabeçalho + navegação
     ------------------------------------------------------------------------ */
  function initHeader() {
    var header = $('#header'), burger = $('#burger'), mnav = $('#mobile-nav');

    // Desce → some. Sobe → aparece.
    // O tremido anterior vinha de decidir quadro a quadro: com a rolagem
    // suavizada (e dentro das seções presas) o sinal oscila alguns pixels para
    // os dois lados e o cabeçalho piscava. Aqui a decisão é por intenção:
    // acumula-se o deslocamento numa direção e só se troca de estado quando
    // esse acúmulo passa do limiar. Mudar de direção zera o acumulador.
    var lastY = Math.max(0, window.scrollY);
    var acc = 0, hidden = false;
    var RUIDO = 0.6, ESCONDE = 90, MOSTRA = 50, LIVRE = 220;

    Frame.add(function () {
      var y = Math.max(0, window.scrollY);
      var d = y - lastY;
      lastY = y;

      header.classList.toggle('is-stuck', y > 40);

      if (mnav.classList.contains('is-open')) {
        if (hidden) { hidden = false; header.classList.remove('is-hidden'); }
        return;
      }
      // topo da página: o cabeçalho sempre volta
      if (y <= LIVRE) {
        acc = 0;
        if (hidden) { hidden = false; header.classList.remove('is-hidden'); }
        return;
      }
      if (Math.abs(d) < RUIDO) return;
      if (acc * d < 0) acc = 0;
      acc += d;

      if (!hidden && acc > ESCONDE) { hidden = true; acc = 0; }
      else if (hidden && acc < -MOSTRA) { hidden = false; acc = 0; }
      header.classList.toggle('is-hidden', hidden);
    });

    function closeNav() {
      mnav.classList.remove('is-open');
      burger.setAttribute('aria-expanded', 'false');
      burger.setAttribute('aria-label', 'Abrir menu');
      document.body.classList.remove('is-locked');
    }

    burger.addEventListener('click', function () {
      var open = mnav.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
      document.body.classList.toggle('is-locked', open);
      if (open) {
        $$('a', mnav).forEach(function (a, i) { a.style.transitionDelay = (60 + i * 55) + 'ms'; });
      }
    });
    $$('a', mnav).forEach(function (a) { a.addEventListener('click', closeNav); });

    document.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('a[href^="#"]') : null;
      if (!a) return;
      var id = a.getAttribute('href');
      if (!id || id === '#') return;
      var t = document.querySelector(id);
      if (!t) return;

      e.preventDefault();
      closeNav();
      var head = parseFloat(getComputedStyle(document.documentElement)
        .getPropertyValue('--header-h')) || 76;
      var y = t.getBoundingClientRect().top + window.scrollY - head + 1;
      Scroll.to(y);
      history.replaceState(null, '', id);
    });
  }

  /* ------------------------------------------------------------------------
     11. Brilho de chamada nos botões
     A varredura de luz do `.btn` já existia, mas só no hover — e no celular
     não há hover. Aqui ela dispara sozinha quando o botão sobe acima da METADE
     da tela: é o ponto em que ele deixou de estar "chegando" e passou a estar
     à mão. Repete de tempos em tempos enquanto continuar ali, e cala a boca
     assim que o ponteiro chega (o hover tem a varredura dele).
     ------------------------------------------------------------------------ */
  function initShine() {
    if (REDUCED) return;
    // o CTA do cabeçalho fica sempre na faixa de cima: piscaria sem parar
    var botoes = $$('.btn').filter(function (b) {
      return !b.closest('.header') && !b.closest('.mobile-nav');
    });
    if (!botoes.length || !('IntersectionObserver' in window)) return;

    var INTERVALO = 5200;      // respiro entre uma passada e outra
    var timers = new WeakMap();

    function passar(b) {
      b.classList.remove('is-shining');
      void b.offsetWidth;                    // reinicia a animação
      b.classList.add('is-shining');
    }
    function ligar(b) {
      if (timers.has(b)) return;
      passar(b);
      timers.set(b, setInterval(function () {
        if (!b.matches(':hover')) passar(b);
      }, INTERVALO));
    }
    function desligar(b) {
      var t = timers.get(b);
      if (t) { clearInterval(t); timers.delete(b); }
      b.classList.remove('is-shining');
    }

    // a "metade da tela" vira uma faixa: de 50% para cima, até sair por cima
    var io = new IntersectionObserver(function (ents) {
      ents.forEach(function (e) {
        if (e.isIntersecting) ligar(e.target);
        else desligar(e.target);
      });
    }, { rootMargin: '0px 0px -50% 0px', threshold: 0 });

    botoes.forEach(function (b) { io.observe(b); });
  }

  /* ------------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------------ */
  function boot() {
    var y = $('#ano');
    if (y) y.textContent = new Date().getFullYear();

    // Antes de tudo: decide de quem são as camadas da cena. Precisa vir antes
    // do initStages, que varre o palco atrás de vídeos conduzidos.
    initBreakpoint();

    initHeader();
    initStages();
    initStack();
    initReveal();
    initStats();
    initFronts();
    initAdiados();
    initDuo();
    initFaq();
    initShine();

    // os cards das frentes são conduzidos pelo initFronts, que compõe a
    // inclinação com a escala de foco
    initTilt('.pain', 6);
    initTilt('.plan', 7);
    // o painel do duo é grande: ângulo menor, senão a inclinação vira balanço
    initTilt('.duo__panel', 5);

    Frame.run();
    window.addEventListener('load', function () { Scroll.sync(); Frame.now(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
