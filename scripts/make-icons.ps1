# Gera os ícones do site a partir de assets/logo/favicon.png.
#
# O ícone que o Google mostra na busca precisa ser QUADRADO e múltiplo de 48px —
# o original é 180×154 e por isso o resultado saía com o globo genérico. Este
# script recorta a caixa alfa do desenho e a centraliza em quadrados limpos.
#
#   powershell -File scripts/make-icons.ps1     (a partir da raiz do site)

Add-Type -AssemblyName System.Drawing

$raiz = Split-Path -Parent $PSScriptRoot
$src  = Join-Path $raiz 'assets\logo\favicon.png'
$logo = Join-Path $raiz 'assets\logo'

# recorte útil do desenho, medido pelo canal alfa do arquivo original
$bboxX = 8; $bboxY = 5; $bboxW = 160; $bboxH = 147

$orig = New-Object System.Drawing.Bitmap($src)

function New-Square {
    param([int]$side, [System.Drawing.Color]$bg, [double]$fill = 0.88)

    $bmp = New-Object System.Drawing.Bitmap($side, $side, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g   = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.Clear($bg)

    # o lado maior do desenho ocupa $fill do quadrado; o menor acompanha
    $box   = $side * $fill
    $scale = [Math]::Min($box / $script:bboxW, $box / $script:bboxH)
    $w = $script:bboxW * $scale
    $h = $script:bboxH * $scale

    $g.DrawImage($script:orig,
        (New-Object System.Drawing.RectangleF((($side - $w) / 2), (($side - $h) / 2), $w, $h)),
        (New-Object System.Drawing.RectangleF($script:bboxX, $script:bboxY, $script:bboxW, $script:bboxH)),
        [System.Drawing.GraphicsUnit]::Pixel)
    $g.Dispose()
    return $bmp
}

$transparente = [System.Drawing.Color]::FromArgb(0, 255, 255, 255)
$pinho        = [System.Drawing.Color]::FromArgb(255, 0x16, 0x2d, 0x23)

# --- PNGs quadrados, múltiplos de 48 (exigência do Google) ---
foreach ($s in @(48, 96, 192)) {
    $b = New-Square -side $s -bg $transparente
    $b.Save((Join-Path $logo "favicon-$s.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $b.Dispose()
    "gerado assets/logo/favicon-$s.png"
}

# --- apple-touch-icon: fundo sólido, o iOS pinta de preto o que for transparente ---
$b = New-Square -side 180 -bg $pinho -fill 0.72
$b.Save((Join-Path $logo 'apple-touch-icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$b.Dispose()
"gerado assets/logo/apple-touch-icon.png"

# --- favicon.ico na raiz: 16 + 32 + 48, cada quadro em PNG ---
$sizes = @(16, 32, 48)
$blobs = @()
foreach ($s in $sizes) {
    $b  = New-Square -side $s -bg $transparente
    $ms = New-Object System.IO.MemoryStream
    $b.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $blobs += ,$ms.ToArray()
    $ms.Dispose(); $b.Dispose()
}

$fs = [System.IO.File]::Create((Join-Path $raiz 'favicon.ico'))
$bw = New-Object System.IO.BinaryWriter($fs)
$bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]$sizes.Count)   # ICONDIR
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
    $bw.Write([byte]$sizes[$i]); $bw.Write([byte]$sizes[$i])                  # largura, altura
    $bw.Write([byte]0); $bw.Write([byte]0)                                    # paleta, reservado
    $bw.Write([uint16]1); $bw.Write([uint16]32)                               # planos, bits por pixel
    $bw.Write([uint32]$blobs[$i].Length)
    $bw.Write([uint32]$offset)
    $offset += $blobs[$i].Length
}
foreach ($blob in $blobs) { $bw.Write($blob) }
$bw.Flush(); $bw.Dispose(); $fs.Dispose()
"gerado favicon.ico"

$orig.Dispose()
