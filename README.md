# Quezada — site

HTML, CSS e JS puros. **Zero dependências, zero build.**

```bash
npx serve .          # ou qualquer servidor estático
```

> **Sirva por HTTP, não abra por `file://`.** Os vídeos usam *range requests*
> para o scrub por rolagem funcionar. O logo já não depende disso — as máscaras
> são `data:` justamente porque `file://` as bloqueava —, mas a cena de abertura
> depende.

---

## Estrutura

```
index.html          marcação de todas as seções
css/style.css       design system inteiro (tokens do moodboard.md)
js/main.js          motor de interação — um único rAF conduz tudo
assets/
  video/            .mp4 (principal) + .webm (loops)
  img/              fotos, capas e posters
  logo/             máscaras alpha recortadas do logo oficial
  fonts/            Cormorant Garamond (títulos) + Raleway (texto), woff2 variável
```

## Tipografia

O par vem do site anterior (quezada.com.br): **Cormorant Garamond** nos títulos
e **Raleway** no texto, os dois locais em woff2 variável.

Títulos em serifa `300` (`400` nos nomes: planos, livros, frentes, sócios), sem
caixa-alta e com tracking praticamente neutro (`-0.005em`) — a presença vem do
tamanho e do desenho da letra. Texto em Raleway `300`; rótulos, botões e eyebrows
em Raleway `500/600` caixa-alta com `0.22em` de tracking. A escala `--t-13 …
--t-61` continua valendo para o texto; os títulos usam `clamp()` próprio, porque
a serifa em peso leve pede corpo maior que a sans.

**A cor por fundo segue o site anterior:** sobre escuro, título `#fff` e corpo
`rgba(255,255,255,.62–.68)`; sobre papel (`#fafaf7`), título `#0d0d0b` e corpo
`#6b6760`. O ouro é `#c9a84c`, com `#e8cc7a` para o hover e `#8a7026` quando
precisa carregar texto miúdo sobre fundo claro.

## As decisões que importam

**A cena de abertura é uma tela só.** Hero, "custo diário" e "operação" vivem no
mesmo palco preso (`.scene`, 660vh). Os vídeos se revezam por `data-live` e a
cópia entra e sai por `data-beat="entra,sai"`. Nenhuma seção sobe de baixo — o
zoom da estrutura para a sala acontece no lugar, e o primeiro frame do vídeo de
transição é o mesmo enquadramento do hero, então o corte é invisível.

**A transição para a sala é conduzida pela rolagem.** O vídeo do zoom é
`data-scrub` com `data-range="0.12,0.33"`: são 8 segundos de material em ~21% da
cena, isto é, cerca de uma tela de rolagem. Esticado no tempo real dele a
passagem arrasta; em faixa mais curta que esta ela fica apressada.

**A linha do tempo da cena, em progresso (`p`):**

| p | o que acontece |
|---|---|
| 0 – 0.12 | hero |
| 0.12 – 0.33 | zoom para dentro da sala (`data-scrub`) |
| 0.33 | cena 02 + lavagem verde acendem **juntas e na hora** |
| 0.60 | cena 03: texto e cards, com 300ms de respiro |
| 0.78 | remate *"Quando percebe…"* (marcador próprio) |
| 0.85 – 0.97 | a mesa se bagunça (`data-autoplay-at`) |

**A cena tem 490vh, não mais.** Sobrava ~1500px de rolagem depois que o vídeo da
mesa disparava, com a cena já encerrada e nada acontecendo. As distâncias de cada
trecho continuam as mesmas em pixels — só a cauda foi cortada, para ~470px. Ao
mexer nas faixas, é essa conta que importa: `fração × (altura − 100vh)`.

**Suavidade da passagem** vem de três lugares e nenhum deles é a duração: o lerp
do scrub (0.11 — quanto menor, mais o quadro persegue a rolagem em vez de saltar
com ela), a fusão de 0.85s do `.scene__layer`, e os `data-live` propositalmente
mais largos que os `data-range`, para as camadas se cruzarem em vez de trocarem
em corte.

**A rolagem conduz; o relógio só escalona dentro do bloco.** `data-beat` diz
*quando* um bloco acende e o `--d` de cada filho escalona a partir dali. A cena
02 usa `.beat--junto` (`--d: 0ms`): entra inteira, sem espera, no instante em que
o último quadro da transição pousa. Na cena 03 o `--d` de 300ms vale só para o
texto e os cards — o remate tem `data-beat` próprio, e é por isso que o
`.beat--group` exclui `> *:not(.beat)`: filho com marcador seu escapa do grupo.

⚠️ **A espera (`--d`) mora na regra do estado ACESO, nunca na regra base.** Com a
transição declarada na base, a mesma espera valia também na saída: voltando de 03
para 02, o texto de 03 ficava 300ms parado e só então levava 600ms para sair —
quase um segundo em cima do texto de 02, que já entrava. Sair é sempre rápido
(0.3s) e sem espera. Medido na troca: 03 zerado em 240ms, pico de coexistência
0.28 — fusão, não sobreposição.

**Tudo desfaz na volta.** Marcador que perde `is-on` volta ao estado base;
`makeAutoplay` rebobina o vídeo proporcionalmente à rolagem que subiu. `BACK`
(0.155) é quanto de rolagem desfaz o vídeo inteiro — em 0.055 a mesa se arrumava
num piscar, muito mais rápido do que levou para se bagunçar. O quadro alvo da
volta passa pelo mesmo lerp do scrub, senão ela salta a cada evento de rolagem.
Nada fica preso a um `setTimeout` que já disparou.

**As faixas de 02 e 03 não se tocam.** `[0.33, 0.60)` e `[0.60, 1]`, com o limite
de cima **exclusivo** no laço de marcadores. Com faixas que se sobrepunham, o
ponto de encontro acendia os dois blocos ao mesmo tempo — o que se via ao voltar
a rolagem. Só o último marcador, que fecha em 1, inclui a ponta.

⚠️ Ao acrescentar um modo de vídeo novo, lembre de incluí-lo **no seletor de
mídia do `initStages`**. Foi o que faltou quando o `data-autoplay-after` entrou:
a lógica estava certa, mas o vídeo nunca era coletado e `apply()` jamais rodava.
Esse modo (gatilho por relógio, em vez de por progresso) continua no `main.js`
sem uso — é a única forma de disparar algo numa **página parada**, já que o rAF
dorme quando a rolagem para. Se voltar a usá-lo, o despertador de `gatilho()` é
obrigatório.

**A cena escurece em vez de o texto brigar por contraste.** A parede da sala é
branca e o sol bate nela. Em vez de inverter a tipografia, `.scene__wash` lava a
metade esquerda de verde-pinho e morre antes da mesa, no canto direito, que
continua limpa — e o texto volta a ser claro, como no resto do site. Entra e sai
junto com a cópia.

**Inclinação 3D dos cards.** O JS nunca escreve `transform` — escreve `--rx`,
`--ry`, `--tz` (e `--mx`/`--my`, que movem a mancha de luz do vidro) e cada
componente compõe a sua própria transformação em CSS. É o que permite ao mesmo
card ter animação de entrada *e* inclinação sem uma atropelar a outra. Atenção:
`[data-reveal].is-in { transform: none }` tem especificidade maior que a classe
sozinha — todo card com `data-reveal` precisa repetir a composição (ver `.front`
e `.plan`).

**"Onde a Quezada entra" reage ao miolo do card, não ao card inteiro.** O card em
foco cresce e o outro some: com `mouseenter`/`mouseleave` o estado trocava sozinho
quando a borda passava sob o ponteiro. Um único `mousemove` na seção decide quem
está em foco, dentro de uma zona central de 62%.

**Os planos cabem em uma tela.** É requisito, não acaso: a seção inteira (rótulo,
título, três cards e a nota) fica em ~885px. O corpo ali é menor que o do resto do
site e a nota do contencioso é de duas colunas por isso. Sobre o verde, os cards
são vidro fino com aro de ouro e o plano em destaque se separa pelo **aro cheio e
pelo botão sólido** — não por outra cor de fundo, que quebraria a fileira.

**Ritmo de fundos.** Escuro (cena) → papel (dados) → foto (frentes) → foto (quem
conduz) → verde (planos) → **branco (livros)** → escuro (contato) → papel (FAQ) →
verde (CTA). Os livros são o respiro claro: é a única passagem em que a foto some
e sobra a obra. A faixa corrida (`.marquee`) separa as duas — trilha com o
conteúdo duplicado no HTML andando `-50%`, para o laço fechar sem emenda.

**Scrub de vídeo sem quebrar frames.** Os vídeos controlados pela rolagem usam
**GOP de 4 frames** (`-g 4`), e o `currentTime` nunca recebe o valor cru do
evento: é suavizado por *lerp* e um novo seek só sai quando o anterior terminou.
**GOP normal (o padrão do ffmpeg) quebra o efeito** — o scrub trava entre
keyframes.

O `-g 4` saiu de medição, não de chute. Latência de busca em 120 seeks (ida e
volta) no mesmo material a 1920px, CRF 20:

| GOP | mediana | p95 | tamanho |
|---|---|---|---|
| 1 (all-intra) | — | — | 10,5 MB |
| 2 | 8,7 ms | 14,3 ms | 8,2 MB |
| **4** | **10,2 ms** | **14,7 ms** | **6,1 MB** |
| 8 | 11,9 ms | 19,1 ms | 5,1 MB |

O p95 do GOP 4 é praticamente o do GOP 2 e cabe folgado num frame a 60fps
(16,7 ms), por 26% menos bytes. O GOP 8 estoura esse orçamento — se for mexer,
não passe daqui.

```bash
# vídeo de rolagem — resolução nativa
ffmpeg -i entrada.webm -vf scale=1920:-2 -an -c:v libx264 -profile:v high \
  -pix_fmt yuv420p -g 4 -keyint_min 4 -sc_threshold 0 -crf 20 -preset slow \
  -movflags +faststart saida.mp4

# variante leve para celular (mesmos parâmetros, menor)
ffmpeg -i entrada.webm -vf scale=1280:-2 ... -crf 22 saida-sm.mp4
```

**Resolução e peso.** Cada vídeo de rolagem tem duas versões; `pickSrc()` escolhe
pela **largura CSS** da janela (≤900px → `-sm`), não pela física: mesmo num
celular com DPR 3, 1280px cobrem a tela de sobra e custam metade. E cada vídeo só
baixa quando a sua vez está chegando (`maybeLoad`), em vez de todos de uma vez.
Resultado até `networkidle`: **~10 MB no desktop, ~7 MB no celular** (pasta de
vídeo inteira: 27 MB).

> As fontes originais já são modestas — a "Sala desarrumada" veio a 0,98 Mbps em
> 1928px. Não dá para recuperar detalhe que não existe no arquivo; o que os
> parâmetros acima fazem é parar de destruir o que há. Para mais nitidez nessa
> cena, seria preciso um render novo em bitrate maior.

**Smooth scroll.** No lugar do Lenis (mesma técnica, sem a dependência): anima a
rolagem **real** da janela, nunca um `transform`. É isso que mantém o
`position: sticky` dos palcos funcionando. Desliga no toque e em
`prefers-reduced-motion`.

**Empilhamento por rolagem** (`.stack`) nas seções 04, 05 e 09: cada uma trava no
topo e cobre a anterior, com o canto superior arredondado. `initStack()` vigia a
altura — se o conteúdo passar da janela, a seção volta ao fluxo normal, senão o
rodapé dela ficaria preso fora da tela.

**Liquid glass — não coloque `backdrop-filter` de volta.** Todo card de vidro do
site anima o próprio `opacity` (os beats da cena, os reveals das frentes, os
painéis do duo). Pela especificação, um elemento com `opacity < 1` vira
*Backdrop Root*: o `backdrop-filter` de dentro dele passa a amostrar um fundo
**vazio** e, quando a transição termina, o Chrome não reavalia a camada — o
cartão fica preso opaco cerca de um segundo depois de aparecer. O fosco é feito
com gradiente de três paradas (`--glass-hi/-tint/-lo`), brilho diagonal no
`::before` e aro especular no `::after`. Renderiza igual em qualquer máquina e
não depende de composição de GPU.

**Duas frentes.** O fundo é da **seção**, não dos cards: `Background duas frentes`
por padrão, trocando para `Assessoria Juridica` ou `Governança empresarial` no
hover. Os cards são só liquid glass, e o card oposto desaparece para destacar o
que está em foco.

**Quem conduz.** Tela cheia. A foto dos dois aparece inteira durante os primeiros
28% da rolagem; depois entra Angelson e então Fabiana. As camadas compartilham o
quadro 16:9, e quem separa as duas pessoas é uma **máscara em gradiente** que
dissolve na faixa do símbolo (38%–62%) — por isso não sobra emenda reta.

O painel **desliza** do próprio lado ao entrar e se inclina sob o ponteiro, como
os demais cards. As duas coisas convivem porque o deslize é uma variável (`--dx`)
dentro da mesma composição do tilt: o estado ativo só zera `--dx`. Trocar o valor
de um `var()` muda o valor computado do `transform`, e a transição interpola
normalmente — o mesmo recurso de `--tx` nas frentes e `--ty` nos planos. O topo
do vidro fecha quase opaco (`--glass-hi` escuro): ali o gradiente é mais claro e
o nome se perdia contra a janela, atrás do painel do Angelson.

**Logo.** Selo, assinatura e lockup são recortes do logo oficial aplicados como
`mask-image` sobre uma cor da marca — uma peça serve para ouro, creme ou pinho.
É por isso que **o cabeçalho é ouro e o rodapé é branco puro sem dois arquivos**:
o desenho é o mesmo, só a cor vem do CSS. No cabeçalho a assinatura é omitida
(moodboard §4.2: só aparece quando legível).

⚠️ **As três máscaras do logo são `data:` no CSS, não arquivo — e precisam
continuar assim.** O Chrome trata cada arquivo local como origem própria e
bloqueia `mask-image` entre origens: aberto por `file://` a máscara não
carregava e, como o elemento é pintado *através* dela, o logo sumia inteiro —
sem um único erro no console. Os PNGs continuam em `assets/logo/`: são a fonte
para regerar as embutidas, reduzidas ao dobro do tamanho de exibição (96 / 300 /
340px, 48KB contra 245KB). A `.watermark` é a única que segue em arquivo: chega
a 620px, custaria mais que as três juntas e é decoração a 3,5% de opacidade.

**Logo 3D.** O cinza do estúdio (`#2F2F2F`) foi trocado por pinho no próprio
arquivo, via chroma key no ffmpeg. Assim o vídeo encosta no fundo da seção sem
depender de `mix-blend-mode`.

## Responsivo

**A cena de abertura é filmada duas vezes.** 16:9 no desktop, 9:16 no celular —
não é o mesmo vídeo recortado. O roteiro é um só: as faixas `data-beat` e
`data-range` são idênticas nos dois, muda o enquadramento.

`data-only="lg" | "sm"` marca de quem é cada camada. **`display:none` não
serviria**: um `<video preload="auto">` ou um `<img src>` escondido baixa do
mesmo jeito, e seriam ~5MB de vídeo inútil no celular. Então `initBreakpoint()`
**remove do DOM** o que não é da tela — e, para o pré-scanner do navegador não
pegá-las antes disso, **nenhuma camada nasce com `src`**: o endereço mora em
`data-src` (ou `data-loop-webm`/`-mp4`) e só vira `src` depois da escolha.

⚠️ A escolha acontece uma vez, no boot, no mesmo limite do CSS (860px). Girar o
aparelho depois não troca as camadas — mesmo compromisso do `pickSrc`.

**O que muda no celular, além do quadro:**

| | desktop | celular |
|---|---|---|
| sala parada (0.33–0.85) | vídeo pausado | **imagem** (`mesa-resp.webp`) |
| mesa se bagunçando | `data-autoplay-at` | **`data-scrub`**, quadro a quadro |
| cópia | à esquerda, centro vertical | **rodapé da tela** |
| lavagem verde | metade esquerda | **de baixo para cima** |

A sala parada virar imagem é o que segura o peso: é o trecho mais longo da cena,
e assim um vídeo já foi liberado e o outro ainda nem baixou.

**O respiro do responsivo: um dedo nos lados, dois em cima e embaixo.**
`--dedo: 44px` — não é chute, é a medida do alvo de toque (44pt na Apple, 48dp
no Material), o mesmo tamanho que a mão usa como referência de folga. Abaixo de
860px ele vira `--gutter` e `--section-y`, os dois tokens que **toda** seção
usa. Não há regra por seção, e não deve haver: uma seção que precise de outro
respiro está dizendo que o conteúdo dela não cabe, não que a margem está errada.
Mexer no respiro do site inteiro em tela pequena é mexer numa linha só.

Exceções, ambas justificadas: o cabeçalho (é uma barra, não um bloco de texto —
com um dedo de cada lado o logo descolava da borda) e a cena de abertura, que
não tem `.section` para dar o vertical e recebe os dois dedos direto no `.shell`.

⚠️ **Nem tudo passa por uma `.shell`.** Em "Quem conduz", a foto e os dois
painéis são filhos **diretos** do palco — só a intro tem `.shell` —, então eles
sangravam até a borda enquanto o texto respeitava a margem. O dedo foi para o
`.duo__pin` e a `.shell` de dentro zerou o dela, senão somariam duas vezes. Ao
mexer em qualquer seção, vale conferir de quem cada filho herda a margem.

⚠️ **Margem maior = coluna menor = texto mais alto.** Num palco preso isso não
empurra a página: empurra o texto para CIMA, para dentro da imagem — e a lavagem
verde, que sobe do rodapé, fica embaixo dele. Foi o que aconteceu ao adotar o
dedo: a chamada da cena 03 subiu para 17% do topo num aparelho de 740px, em cima
da janela clara da sala. **A lavagem não pode subir mais sem apagar a sala
inteira**, então quem cede é o bloco: abaixo de 800px de altura, corpo e respiro
da cena encolhem. A conta que vale conferir ao mexer em qualquer texto da cena é
o **topo do bloco ficar abaixo de ~38% da altura da tela** — é até ali que vai a
sala; o resto do quadro é chão.

**Os vídeos verticais são 9:16 e ancoram no topo** (`object-position: center
top`). Num celular o `cover` corta só na lateral; num tablet em pé ele corta na
vertical, e é o rodapé vazio que deve ser sacrificado — nunca a estrutura ou a
sala, que vivem no terço de cima do quadro.

**Peso no celular: 6,4MB** até o fim da página. Vieram de 9,6MB — dois achados:
o fundo de "Razão e Emoção" estava exportado quase sem compressão (1,35MB para
uma foto de 1920px; a 48KB o SSIM contra o original é 0,989) e os vídeos dos
livros não tinham versão leve.

⚠️ **Trilha de grid `auto` estoura com filho que não quebra.** A `.scene__stack`
usava a coluna implícita; bastava a `.eyebrow` — que é `inline-flex`, logo
indivisível, e tinha 435px de max-content — para a coluna inteira passar de 390
para 495px num celular. Com `overflow:hidden` no palco isso não vira barra de
rolagem: **vira texto cortado**, que é muito mais difícil de achar. Hoje é
`grid-template-columns: minmax(0, 1fr)`, e abaixo de 640px a `.eyebrow` é
`flex` (bloco) para o texto quebrar sozinho.

**Palco dos livros em tela curta.** Ele é preso em 100svh com `overflow:hidden`
— o que não couber some sem aviso, e era o par de botões. Abaixo de 730px de
altura a seção **se desprende** e vira seção normal, com o vídeo fora de cena e
a capa inteira no lugar: sem palco preso não há progresso de rolagem para
conduzir o scrub, e imagem parada é melhor que vídeo em quadro congelado. O
`maybeLoad` checa `offsetParent` para não baixar megabytes do que saiu de cena.

## Brilho de chamada nos botões

A varredura de luz do `.btn` existia só no hover — e no celular não há hover.
`initShine()` dispara sozinho quando o botão passa da **metade da tela**
(`IntersectionObserver` com `rootMargin: 0 0 -50% 0`), repete a cada 5,2s
enquanto ele continuar ali e cala assim que o ponteiro chega. Vai de `animation`
e não de `transition` justamente para acontecer sem ponteiro nenhum. O CTA do
cabeçalho fica de fora: está sempre na faixa de cima, piscaria sem parar.

## Limites de linha (são requisito, não estética)

Três trechos têm número **máximo** de linhas pedido pelo cliente. Quem os segura é
a medida (`max-width`), não o texto — ao editar a cópia, meça de novo:

| Trecho | Máximo | Onde |
|---|---|---|
| lede dos planos | 3 linhas | `.plans-sec .sec-head .lede` — 64ch |
| "Duas frentes para organizar…" | 2 linhas | `.fronts-sec .sec-head` — 54rem, corpo menor |
| "Perto das decisões…" | 2 linhas | `max-width:26ch` no próprio `<h2>` |

Conferidos em 1280 / 1440 / 1600 / 1920px.

**Negrito** aparece em exatamente dois lugares, e é sempre um salto grande de
peso, não um meio-termo: `.hero__sub` em Raleway 600 (o resto do corpo é 300) e
`.h2--forte` em Cormorant 600 (o resto dos títulos é 300). Peso alto pede branco
mais cheio — na hero o texto subiu para 0.86 de opacidade, porque a 0.68 o traço
grosso ficava turvo em vez de firme.

## Destinos dos botões

Todos os botões têm destino real — não há mais `initPending()` nem marcadores
`data-buy` / `data-cta`. Ao mexer, mantenha `target="_blank" rel="noopener
noreferrer"` em tudo que sai do site.

| Onde | Destino |
|---|---|
| "Agendar reunião" (cabeçalho, menu, hero, contato, CTA final) | WhatsApp, mensagem de reunião |
| Conhecer o plano (×3) | WhatsApp, uma mensagem por plano |
| Arquitetura da Ordem — físico | Eduzz |
| Arquitetura da Ordem — e-book | Amazon |
| Pensamento Sistêmico | Editora Leader |

O texto de cada mensagem do WhatsApp vai **percent-encoded** na query (`?text=`),
com `+` no lugar do espaço. Acentos precisam ir codificados: `reuni%C3%A3o`, não
`reunião` cru — o link até funciona no navegador, mas quebra em clientes que não
normalizam a URL.

## Endereço

*Av. Ipanema, 165 — Empresarial 18 do Forte, Barueri - SP — Sala 1114.* Aparece em
três lugares (`.find__value`, o cartão `.map` e o rodapé) e nas duas queries do
Google Maps dentro de `.map`. Se mudar, mude nos cinco.

## Acessibilidade

Foco visível, alvos ≥44px, navegação por teclado no FAQ, `prefers-reduced-motion`
respeitado (o scrub salta direto para o frame, sem laço de animação; as seções
empilhadas voltam ao fluxo).
