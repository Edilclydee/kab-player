# Turns the white-on-black show logo into a cropped white-on-transparent PNG.
#   powershell -File scripts\make-logo.ps1 <input.jpg> <output.png>
param([string]$In, [string]$Out)
Add-Type -AssemblyName System.Drawing
$src = New-Object System.Drawing.Bitmap($In)
$w = $src.Width
$h = $src.Height
$alpha = New-Object 'int[]' ($w * $h)
$minX = $w; $minY = $h; $maxX = 0; $maxY = 0
for ($y = 0; $y -lt $h; $y++) {
  for ($x = 0; $x -lt $w; $x++) {
    $c = $src.GetPixel($x, $y)
    $l = 0.299 * $c.R + 0.587 * $c.G + 0.114 * $c.B
    $a = [int][Math]::Max(0, [Math]::Min(255, ($l - 45) * 255 / 170))
    $alpha[$y * $w + $x] = $a
    if ($a -gt 60) {
      if ($x -lt $minX) { $minX = $x }
      if ($x -gt $maxX) { $maxX = $x }
      if ($y -lt $minY) { $minY = $y }
      if ($y -gt $maxY) { $maxY = $y }
    }
  }
}
$minX = [Math]::Max(0, $minX - 2); $minY = [Math]::Max(0, $minY - 2)
$maxX = [Math]::Min($w - 1, $maxX + 2); $maxY = [Math]::Min($h - 1, $maxY + 2)
$cw = $maxX - $minX + 1
$ch = $maxY - $minY + 1
$dst = New-Object System.Drawing.Bitmap($cw, $ch, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
for ($y = 0; $y -lt $ch; $y++) {
  for ($x = 0; $x -lt $cw; $x++) {
    $i = ($y + $minY) * $w + ($x + $minX)
    $dst.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($alpha[$i], 255, 255, 255))
  }
}
$dst.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$src.Dispose(); $dst.Dispose()
"cropped to ${cw}x${ch}"
