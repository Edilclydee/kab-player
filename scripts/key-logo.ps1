# Removes a solid background color from a logo and crops it.
#   powershell -File scripts\key-logo.ps1 <in> <out.png> [-Preview <preview.png>] [-Lo 20] [-Hi 110]
# Background color = top-left pixel. Pixels within -Lo of it become transparent
# everywhere (so enclosed holes in letters clear too); pixels just next to those
# get partial transparency so edges stay smooth.
param([string]$In, [string]$Out, [string]$Preview = '', [int]$Lo = 20, [int]$Hi = 110)
Add-Type -AssemblyName System.Drawing
$src = New-Object System.Drawing.Bitmap($In)
$w = $src.Width; $h = $src.Height
$bg = $src.GetPixel(0, 0)
$AR = New-Object 'int[]' ($w * $h); $AG = New-Object 'int[]' ($w * $h); $AB = New-Object 'int[]' ($w * $h)
$dist = New-Object 'int[]' ($w * $h)
for ($y = 0; $y -lt $h; $y++) {
  for ($x = 0; $x -lt $w; $x++) {
    $c = $src.GetPixel($x, $y); $i = $y * $w + $x
    $AR[$i] = $c.R; $AG[$i] = $c.G; $AB[$i] = $c.B
    $dist[$i] = [Math]::Max([Math]::Abs($c.R - $bg.R), [Math]::Max([Math]::Abs($c.G - $bg.G), [Math]::Abs($c.B - $bg.B)))
  }
}
$alpha = New-Object 'double[]' ($w * $h)
for ($i = 0; $i -lt $w * $h; $i++) { $alpha[$i] = if ($dist[$i] -le $Lo) { 0.0 } else { 1.0 } }
# Soften: pixels within 2px of a cleared pixel get alpha from their distance.
for ($y = 0; $y -lt $h; $y++) {
  for ($x = 0; $x -lt $w; $x++) {
    $i = $y * $w + $x
    if ($alpha[$i] -eq 0.0) { continue }
    $near = $false
    for ($dy = -2; $dy -le 2 -and -not $near; $dy++) {
      for ($dx = -2; $dx -le 2; $dx++) {
        $nx = $x + $dx; $ny = $y + $dy
        if ($nx -ge 0 -and $ny -ge 0 -and $nx -lt $w -and $ny -lt $h -and $dist[$ny * $w + $nx] -le $Lo) { $near = $true; break }
      }
    }
    if ($near) { $alpha[$i] = [Math]::Min(1.0, ($dist[$i] - $Lo) / ($Hi - $Lo)) }
  }
}
$minX = $w; $minY = $h; $maxX = 0; $maxY = 0
for ($y = 0; $y -lt $h; $y++) { for ($x = 0; $x -lt $w; $x++) {
  if ($alpha[$y * $w + $x] -gt 0.25) {
    if ($x -lt $minX) { $minX = $x }; if ($x -gt $maxX) { $maxX = $x }
    if ($y -lt $minY) { $minY = $y }; if ($y -gt $maxY) { $maxY = $y }
  }
} }
$minX = [Math]::Max(0, $minX - 1); $minY = [Math]::Max(0, $minY - 1)
$maxX = [Math]::Min($w - 1, $maxX + 1); $maxY = [Math]::Min($h - 1, $maxY + 1)
$cw = $maxX - $minX + 1; $ch = $maxY - $minY + 1
$dst = New-Object System.Drawing.Bitmap($cw, $ch, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
for ($y = 0; $y -lt $ch; $y++) {
  for ($x = 0; $x -lt $cw; $x++) {
    $i = ($y + $minY) * $w + ($x + $minX)
    $a = $alpha[$i]
    if ($a -le 0) { $dst.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0)); continue }
    # Un-blend the background out of semi-transparent edge pixels.
    $r = [int][Math]::Max(0, [Math]::Min(255, ($AR[$i] - (1 - $a) * $bg.R) / $a))
    $g = [int][Math]::Max(0, [Math]::Min(255, ($AG[$i] - (1 - $a) * $bg.G) / $a))
    $b2 = [int][Math]::Max(0, [Math]::Min(255, ($AB[$i] - (1 - $a) * $bg.B) / $a))
    $dst.SetPixel($x, $y, [System.Drawing.Color]::FromArgb([int]($a * 255), $r, $g, $b2))
  }
}
$dst.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
if ($Preview) {
  # Show the result on the app's background and on a loud color, side by side.
  $pv = New-Object System.Drawing.Bitmap(($cw * 2 + 30), ($ch + 20))
  $gr = [System.Drawing.Graphics]::FromImage($pv)
  $gr.Clear([System.Drawing.Color]::FromArgb(23, 23, 26))
  $gr.FillRectangle((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(0, 160, 120))), ($cw + 20), 0, ($cw + 10), ($ch + 20))
  $gr.DrawImage($dst, 10, 10, $cw, $ch); $gr.DrawImage($dst, ($cw + 20), 10, $cw, $ch)
  $gr.Dispose(); $pv.Save($Preview, [System.Drawing.Imaging.ImageFormat]::Png); $pv.Dispose()
}
$src.Dispose(); $dst.Dispose()
"background rgb($($bg.R),$($bg.G),$($bg.B)); cropped to ${cw}x${ch}"
