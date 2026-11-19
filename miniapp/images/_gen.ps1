# 生成小程序 tabBar 图标（81x81 透明 PNG）
# 用 GDI+ 直接绘制，避免浏览器截图时把画布拍成空白
Add-Type -AssemblyName System.Drawing

$out = $PSScriptRoot
$C = @{ normal = [System.Drawing.Color]::FromArgb(255, 107, 124, 124); on = [System.Drawing.Color]::FromArgb(255, 15, 107, 92) }
$S = 81

function New-Canvas {
    $bmp = New-Object System.Drawing.Bitmap($S, $S, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    return @($bmp, $g)
}

function New-Pen([System.Drawing.Color]$c, [float]$w) {
    $p = New-Object System.Drawing.Pen($c, $w)
    $p.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $p.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $p.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    return $p
}

function Add-RoundedRect($path, [float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
    $d = $r * 2
    $path.AddArc($x, $y, $d, $d, 180, 90)
    $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $path.CloseFigure()
}

function Draw-Icon([string]$name, [System.Drawing.Color]$c) {
    $cv = New-Canvas
    $bmp = $cv[0]; $g = $cv[1]

    switch ($name) {
        "today" {
            $pen = New-Pen $c 6
            $path = New-Object System.Drawing.Drawing2D.GraphicsPath
            Add-RoundedRect $path 16 19 49 44 8
            $g.DrawPath($pen, $path)
            $g.DrawLines($pen, @(
                (New-Object System.Drawing.PointF(28, 41)),
                (New-Object System.Drawing.PointF(36.5, 49.5)),
                (New-Object System.Drawing.PointF(57, 30))
            ))
            $path.Dispose(); $pen.Dispose()
        }
        "words" {
            $pen = New-Pen $c 6
            $g.DrawLine($pen, 16, 21, 16, 60)
            $g.DrawLine($pen, 29, 27, 62, 27)
            $g.DrawLine($pen, 29, 40.5, 62, 40.5)
            $g.DrawLine($pen, 29, 54, 51, 54)
            $pen.Dispose()
        }
        "stats" {
            $pen = New-Pen $c 9
            $g.DrawLine($pen, 22, 44, 22, 59)
            $g.DrawLine($pen, 40.5, 33, 40.5, 59)
            $g.DrawLine($pen, 59, 22, 59, 59)
            $pen.Dispose()
        }
        "settings" {
            $cx = 40.5; $cy = 40.5
            $pen = New-Pen $c 6.5
            $g.DrawEllipse($pen, [float]($cx - 16 - 3.25), [float]($cy - 16 - 3.25), 38.5, 38.5)
            $pen.Dispose()
            $tp = New-Pen $c 7.5
            for ($i = 0; $i -lt 8; $i++) {
                $a = $i * [Math]::PI / 4
                $x1 = $cx + 17 * [Math]::Cos($a); $y1 = $cy + 17 * [Math]::Sin($a)
                $x2 = $cx + 25 * [Math]::Cos($a); $y2 = $cy + 25 * [Math]::Sin($a)
                $g.DrawLine($tp, [float]$x1, [float]$y1, [float]$x2, [float]$y2)
            }
            $tp.Dispose()
            $ip = New-Pen $c 5
            $g.DrawEllipse($ip, [float]($cx - 6 - 2.5), [float]($cy - 6 - 2.5), 17, 17)
            $ip.Dispose()
        }
    }

    $g.Dispose()
    return $bmp
}

$generated = @()
foreach ($icon in @("today", "words", "stats", "settings")) {
    foreach ($state in @("normal", "on")) {
        $fileName = if ($state -eq "on") { "$icon-on.png" } else { "$icon.png" }
        $bmp = Draw-Icon $icon $C[$state]
        $bmp.Save((Join-Path $out $fileName), [System.Drawing.Imaging.ImageFormat]::Png)
        $bmp.Dispose()
        $generated += $fileName
    }
}
Write-Host ("生成: " + ($generated -join " "))
