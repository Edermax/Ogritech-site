# Reframe the original mark without redrawing the brand. Requires Windows System.Drawing.
Add-Type -AssemblyName System.Drawing
$projectRoot = Split-Path $PSScriptRoot -Parent
$source = [System.Drawing.Bitmap]::new((Join-Path $projectRoot 'ogritech-brand-symbol.png'))
try {
  $left = $source.Width; $top = $source.Height; $right = 0; $bottom = 0
  for ($y = 0; $y -lt $source.Height; $y++) {
    for ($x = 0; $x -lt $source.Width; $x++) {
      $pixel = $source.GetPixel($x, $y)
      if ($pixel.A -gt 128 -and $pixel.R -lt 220 -and $pixel.G -gt 100 -and $pixel.B -gt 100) {
        $left = [Math]::Min($left, $x); $right = [Math]::Max($right, $x)
        $top = [Math]::Min($top, $y); $bottom = [Math]::Max($bottom, $y)
      }
    }
  }
  if ($left -ge $right -or $top -ge $bottom) { throw 'Original cyan mark not found.' }
  # Include the antialiased edge in the source rectangle.
  $left--; $top--; $right++; $bottom++
  $width = $right - $left + 1; $height = $bottom - $top + 1
  $centerX = ($left + $right) / 2; $centerY = ($top + $bottom) / 2
  $radius = 0.0
  for ($y = $top; $y -le $bottom; $y++) {
    for ($x = $left; $x -le $right; $x++) {
      $pixel = $source.GetPixel($x, $y)
      if ($pixel.A -gt 128 -and $pixel.R -lt 220 -and $pixel.G -gt 100 -and $pixel.B -gt 100) {
        $radius = [Math]::Max($radius, [Math]::Sqrt([Math]::Pow($x - $centerX, 2) + [Math]::Pow($y - $centerY, 2)))
      }
    }
  }
  $variants = @(
    @{ Size = 192; Name = 'ogritech-app-v2-192.png'; Maskable = $false },
    @{ Size = 512; Name = 'ogritech-app-v2-512.png'; Maskable = $false },
    @{ Size = 192; Name = 'ogritech-app-v2-maskable-192.png'; Maskable = $true },
    @{ Size = 512; Name = 'ogritech-app-v2-maskable-512.png'; Maskable = $true },
    @{ Size = 180; Name = 'ogritech-apple-touch-v2.png'; Maskable = $false }
  )
  foreach ($variant in $variants) {
    $size = $variant.Size
    $scale = $size * 0.76 / [Math]::Max($width, $height)
    # The entire cyan silhouette fits inside the W3C 40% radius safe circle.
    if ($variant.Maskable) { $scale = [Math]::Min($scale, $size * 0.39 / ($radius + 1)) }
    $bitmap = [System.Drawing.Bitmap]::new($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $graphics.Clear([System.Drawing.Color]::White)
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $destination = [System.Drawing.RectangleF]::new(($size - $width * $scale) / 2, ($size - $height * $scale) / 2, $width * $scale, $height * $scale)
      $graphics.DrawImage($source, $destination, [System.Drawing.RectangleF]::new($left, $top, $width, $height), [System.Drawing.GraphicsUnit]::Pixel)
      $bitmap.Save((Join-Path $projectRoot $variant.Name), [System.Drawing.Imaging.ImageFormat]::Png)
      Write-Output "$($variant.Name): ${size}x${size}"
    } finally { $graphics.Dispose(); $bitmap.Dispose() }
  }
} finally { $source.Dispose() }
